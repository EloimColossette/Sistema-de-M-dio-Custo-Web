from flask import Blueprint, render_template, request, redirect, url_for, flash, session, jsonify, current_app as app
from routes.auth_routes import login_required
from conexao_db import conectar
from datetime import datetime
from math import ceil
from werkzeug.utils import secure_filename
import pandas as pd
from psycopg2.extras import execute_values
import re

# Blueprint para Entrada de Nota Fiscal
entrada_nf_bp = Blueprint('entrada_nf', __name__, url_prefix='/entrada_nf')

# --- FILTRO JINJA PARA FORMATAR FLOAT COMO BRL ---
@entrada_nf_bp.app_template_filter('brl')
def float_to_brl(value):
    if value is None:
        return ""
    return f"{value:.2f}".replace('.', ',')

@entrada_nf_bp.app_template_filter('numfmt')
def format_num(value, casas=2):
    """
    Formata número no estilo pt-BR.
    Por padrão usa 2 casas decimais, mas pode forçar 3 (peso, etc).
    """
    if value is None:
        return ""
    try:
        return f"{value:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return str(value)
    
@entrada_nf_bp.app_template_filter('numfmt')
def numfmt(value, casas=2):
    """
    Formata número no estilo pt-BR.
    Ex: numfmt(3000, 2) -> '3.000,00'
        numfmt(3000, 3) -> '3.000,000'
    """
    if value is None:
        return ""
    try:
        return f"{float(value):,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return str(value)

# atalho para dinheiro (2 casas)
@entrada_nf_bp.app_template_filter('money')
def money(value):
    return numfmt(value, 2)

# atalho para peso (3 casas)
@entrada_nf_bp.app_template_filter('peso')
def peso(value):
    return numfmt(value, 3)

# atalho para porcentagem (2 casas + %)
@entrada_nf_bp.app_template_filter('percent')
def percent(value):
    if value is None:
        return ""
    try:
        return numfmt(value, 2) + "%"
    except Exception:
        return str(value)
    
# --- UTIL: normaliza string numérica (pt-BR / en) para "1234.56" ---
def normalize_number_str(raw):
    """
    Recebe uma string como '1.234,56', '1234,56', '1234.56', '123456' ou números já em str,
    e retorna uma string com ponto decimal no estilo "1234.56" pronto para float(...).
    Regras:
      - tem '.' e ','  -> '.' são milhares, ',' é decimal -> remove os '.' e troca ',' -> '.'
      - tem só ','     -> troca ',' -> '.'
      - tem só '.'     -> mantem '.' (assume decimal)
      - não tem nem     -> retorna como está
    Retorna '' quando raw é None ou string vazia.
    """
    if raw is None:
        return ''
    s = str(raw).strip()
    if s == '':
        return ''
    has_dot = '.' in s
    has_comma = ',' in s
    if has_dot and has_comma:
        # ex: "1.234,56" -> "1234.56"
        return s.replace('.', '').replace(',', '.')
    if has_comma:
        # ex: "64,64" -> "64.64"
        return s.replace(',', '.')
    # ex: "64.64" -> mantem; "6464" -> mantem
    return s

# --- Ajustado: agora a primeira coluna retornada pelo SELECT é id ---
def _linha_para_entrada(linha):
    """
    Converte uma tupla (linha) retornada pela query em um dicionário.
    Ordem esperada das colunas (agora com id como primeira coluna):
    0  id
    1  data
    2  nf
    3  fornecedor
    4..8  material_1..material_5
    9  produto
    10 custo_empresa
    11 ipi
    12 valor_integral
    13..17 valor_unitario_1..5
    18..23 duplicata_1..6
    24 valor_unitario_energia
    25 valor_mao_obra_tm_metallica
    26 peso_liquido
    27 peso_integral
    """
    if linha is None:
        return {}

    # id
    id_entrada = linha[0]

    # formata data (linha[1])
    data = linha[1]
    try:
        data_formatada = data.strftime('%d/%m/%Y') if data is not None else None
    except Exception:
        data_formatada = str(data) if data is not None else None

    # monta lista de materiais (só quando nome estiver preenchido)
    materiais = []
    # material_1 .. material_5 => indices 4..8
    for i in range(5):
        nome = linha[4 + i]
        valor = linha[13 + i]  # valor_unitario_1 .. 5 => indices 13..17
        if nome is not None and str(nome).strip() != "":
            materiais.append({
                "nome": nome,
                "valor_unitario": float(valor) if valor is not None else None
            })

    # monta lista de duplicatas (só valores não-nulos e diferentes de 0.0)
    duplicatas = []
    # duplicata_1 .. duplicata_6 => indices 18..23
    for j in range(6):
        d = linha[18 + j]
        if d is not None:
            try:
                if float(d) != 0.0:
                    duplicatas.append(float(d))
            except Exception:
                if str(d).strip() != "":
                    duplicatas.append(d)

    return {
        "id": id_entrada,
        "data": data_formatada,
        "nf": linha[2],
        "fornecedor": linha[3],
        "materiais": materiais,
        "duplicatas": duplicatas,
        "produto": linha[9],
        "custo_empresa": float(linha[10]) if linha[10] is not None else None,
        "ipi": float(linha[11]) if linha[11] is not None else None,
        "valor_integral": float(linha[12]) if linha[12] is not None else None,
        "valor_unitario_energia": float(linha[24]) if linha[24] is not None else None,
        "valor_mao_obra_tm_metallica": float(linha[25]) if linha[25] is not None else None,
        "peso_liquido": float(linha[26]) if linha[26] is not None else None,
        "peso_integral": float(linha[27]) if linha[27] is not None else None,
    }

# --- dentro do mesmo arquivo do blueprint ---
MAX_MATERIAIS_DB = 5   # limite físico da sua tabela (material_1..material_5)
MAX_DUPLICATAS_DB = 6  # limite físico da sua tabela (duplicata_1..duplicata_6)

@entrada_nf_bp.route('/')
@login_required
def nova_entrada():
    # pega página (query string) ou 1 por padrão
    page = int(request.args.get('page', 1))
    per_page = 10
    offset = (page - 1) * per_page

    conexao = conectar()
    cursor = conexao.cursor()
    try:
        # dados para dropdown
        cursor.execute('SELECT nome FROM fornecedores ORDER BY nome')
        fornecedores = [row[0] for row in cursor.fetchall()]
        cursor.execute('SELECT DISTINCT nome FROM materiais ORDER BY nome')
        materiais = [row[0] for row in cursor.fetchall()]
        cursor.execute('SELECT nome FROM produtos ORDER BY nome')
        produtos = [row[0] for row in cursor.fetchall()]

        # busca entradas para o modal (paginado) - agora incluindo id como primeira coluna
        cursor.execute("""
            SELECT
                id,
                data, nf, fornecedor,
                material_1, material_2, material_3, material_4, material_5,
                produto, custo_empresa, ipi, valor_integral,
                valor_unitario_1, valor_unitario_2, valor_unitario_3,
                valor_unitario_4, valor_unitario_5,
                duplicata_1, duplicata_2, duplicata_3,
                duplicata_4, duplicata_5, duplicata_6,
                valor_unitario_energia, valor_mao_obra_tm_metallica,
                peso_liquido, peso_integral
            FROM entrada_nf
            ORDER BY data DESC
            LIMIT %s OFFSET %s
        """, (per_page, offset))
        linhas = cursor.fetchall()

        entradas = [_linha_para_entrada(l) for l in linhas]

        # calcula máximos observados nas entradas desta página
        max_materiais = 0
        max_duplicatas = 0
        for e in entradas:
            if isinstance(e.get('materiais'), list):
                max_materiais = max(max_materiais, len(e['materiais']))
            if isinstance(e.get('duplicatas'), list):
                max_duplicatas = max(max_duplicatas, len(e['duplicatas']))

        max_materiais = min(max_materiais or 0, MAX_MATERIAIS_DB)
        max_duplicatas = min(max_duplicatas or 0, MAX_DUPLICATAS_DB)

        cursor.execute("SELECT COUNT(*) FROM entrada_nf")
        total = cursor.fetchone()[0]
    finally:
        cursor.close()
        conexao.close()

    total_pages = (total + per_page - 1) // per_page

    return render_template(
        'entrada_nf.html',
        fornecedores=fornecedores,
        materiais=materiais or [],
        produtos=produtos or [],
        entradas=entradas,
        page=page,
        total_pages=total_pages,
        max_materiais=max_materiais,
        max_duplicatas=max_duplicatas
    )

@entrada_nf_bp.route('/salvar', methods=['POST'])
@login_required
def salvar_entrada():
    from datetime import datetime

    # 1) Defina o mapeamento de colunas aqui dentro
    colunas_fixas = {
        'data':      'Data',
        'nf':        'NF',
        'fornecedor':'Fornecedor',
        'material_1':'Material 1',
        'material_2':'Material 2',
        'material_3':'Material 3',
        'material_4':'Material 4',
        'material_5':'Material 5',
        'produto':   'Produto',
        'custo_empresa': 'Custo Empresa',
        'ipi': 'IPI',
        'valor_integral': 'Valor Integral',
        'valor_unitario_1': 'Valor Unitário 1',
        'valor_unitario_2': 'Valor Unitário 2',
        'valor_unitario_3': 'Valor Unitário 3',
        'valor_unitario_4': 'Valor Unitário 4',
        'valor_unitario_5': 'Valor Unitário 5',
        'duplicata_1': 'Duplicata 1',
        'duplicata_2': 'Duplicata 2',
        'duplicata_3': 'Duplicata 3',
        'duplicata_4': 'Duplicata 4',
        'duplicata_5': 'Duplicata 5',
        'duplicata_6': 'Duplicata 6',
        'valor_unitario_energia': 'Valor Unitário Energia',
        'valor_mao_obra_tm_metallica': 'Valor Mão de Obra TM/Metallica',
        'peso_liquido': 'Peso Líquido',
        'peso_integral': 'Peso Integral'
    }

    # 2) Captura o form (sempre retorna string, mesmo se vazio)
    dados = {
        col: request.form.get(col, '').strip()
        for col in colunas_fixas
    }

     # 3) Valida e converte cada campo, montando a lista de valores
    valores = []
    # inclua o campo valor_mao_obra_tm_metallica aqui
    numeric_keys = ('valor_integral', 'valor_unitario_', 'duplicata_', 'custo_empresa', 'peso_', 'valor_unitario_energia', 'valor_mao_obra_tm_metallica')

    for col, label in colunas_fixas.items():
        raw = dados[col]

        if col == 'data':
            try:
                valor = datetime.strptime(raw, '%Y-%m-%d').date() if raw else None
            except Exception:
                flash(f"Data inválida: {raw}. Use o seletor de data.", 'erro')
                return redirect(url_for('entrada_nf.nova_entrada'))

        elif col == 'ipi':
            if raw == '':
                valor = 0.0
            else:
                try:
                    s = raw.replace('%', '').strip()
                    cleaned = normalize_number_str(s)
                    valor = float(cleaned) if cleaned != '' else 0.0
                except Exception:
                    flash(f"IPI inválido: {raw}", 'erro')
                    return redirect(url_for('entrada_nf.nova_entrada'))

        elif any(k in col for k in numeric_keys):
            if raw == '':
                valor = 0.0
            else:
                try:
                    cleaned = normalize_number_str(raw)
                    cleaned = cleaned.replace(',', '.') if isinstance(cleaned, str) else cleaned
                    valor = float(cleaned)
                except Exception:
                    flash(f"{label} inválido: {raw}", 'erro')
                    return redirect(url_for('entrada_nf.nova_entrada'))

        else:
            valor = raw or None

        valores.append(valor)

    # 4) Monta e executa o INSERT
    cols = list(colunas_fixas.keys())
    placeholders = ','.join(['%s'] * len(cols))
    sql = f"INSERT INTO entrada_nf ({','.join(cols)}) VALUES ({placeholders})"

    conexao = conectar()
    cursor  = conexao.cursor()
    try:
        cursor.execute(sql, valores)
        conexao.commit()
        flash('Entrada de NF salva com sucesso!', 'sucesso')
    except Exception as e:
        conexao.rollback()
        print("Erro ao salvar entrada de NF:", e)
        flash('Erro ao salvar entrada de NF.', 'erro')
    finally:
        cursor.close()
        conexao.close()

    return redirect(url_for('entrada_nf.nova_entrada'))

@entrada_nf_bp.route('/editar/<int:id>', methods=['POST'])
@login_required
def editar_entrada(id):
    """
    Espera JSON { fields: { coluna: valor, ... } }.
    Atualiza somente colunas permitidas (whitelist).
    Tratamento robusto de números (tolerante a "1.234,56", "1234.56", "3,25%", etc.)
    Possui opção para armazenar IPI como fração (0.0325) ou como percentual (3.25).
    Retorna JSON com os valores atualizados: { status: "ok", updated: {...} }
    """
    from datetime import datetime, date
    try:
        from decimal import Decimal
    except Exception:
        Decimal = None

    # Se no DB você prefere armazenar IPI como fração (ex: 3.25% -> 0.0325), deixe True.
    # Se prefere armazenar 3.25 (percentual), deixe False.
    STORE_IPI_AS_FRACTION = False

    def parse_date_like(raw):
        if raw is None or (isinstance(raw, str) and raw.strip() == ''):
            return None
        if isinstance(raw, date):
            return raw
        if isinstance(raw, datetime):
            return raw.date()
        if isinstance(raw, (str,)):
            s = raw.strip()
            # dd/mm/YYYY
            try:
                if '/' in s:
                    return datetime.strptime(s, '%d/%m/%Y').date()
                # ISO yyyy-mm-dd
                if '-' in s:
                    return datetime.strptime(s, '%Y-%m-%d').date()
            except Exception:
                # tenta formatos alternativos mínimos
                try:
                    return datetime.fromisoformat(s).date()
                except Exception:
                    raise
        raise ValueError(f"Formato de data inválido: {raw}")

    def parse_numeric_like(raw, col_name=None):
        """
        Recebe raw (str/number) e retorna float.
        Aceita:
          - "1.234,56" -> 1234.56
          - "1234,56"  -> 1234.56
          - "1.234.567" -> 1234567.0
          - "1234.56"  -> 1234.56
          - "3,25%" -> 3.25
        Se raw é '', None -> retorna 0.0.
        Lança ValueError em caso de impossibilidade.
        """
        if raw is None or (isinstance(raw, str) and raw.strip() == ''):
            return 0.0

        # se já é number
        if isinstance(raw, (int, float)):
            f = float(raw)
            return f

        s = str(raw).strip()
        if s == '':
            return 0.0

        # remove espaços e percentuais
        s = s.replace(' ', '').replace('%', '')

        # mantém sinal negativo se houver
        neg = False
        if s.startswith('-'):
            neg = True
            s = s[1:]

        # normalização:
        if '.' in s and ',' in s:
            s = s.replace('.', '').replace(',', '.')
        else:
            if ',' in s and '.' not in s:
                s = s.replace(',', '.')
            else:
                if s.count('.') > 1:
                    s = s.replace('.', '')

        if s == '':
            num = 0.0
        else:
            try:
                num = float(s)
            except Exception as e:
                raise ValueError(f"Valor numérico inválido: original='{raw}' normalized='{s}'") from e

        if neg:
            num = -num

        return num

    data = request.get_json() or {}
    fields = data.get('fields', {}) if isinstance(data.get('fields', {}), dict) else {}

    print(f"[editar_entrada] id={id} | fields recebidos: {fields}")

    if not fields:
        return jsonify({"status": "error", "msg": "Nenhum campo fornecido."}), 400

    # whitelist de colunas que podem ser atualizadas via edição inline
    ALLOWED = {
        'data', 'nf', 'fornecedor', 'material_1','material_2','material_3','material_4','material_5',
        'produto', 'custo_empresa', 'ipi', 'valor_integral',
        'valor_unitario_1','valor_unitario_2','valor_unitario_3','valor_unitario_4','valor_unitario_5',
        'duplicata_1','duplicata_2','duplicata_3','duplicata_4','duplicata_5','duplicata_6',
        'valor_unitario_energia', 'valor_mao_obra_tm_metallica', 'peso_liquido', 'peso_integral'
    }

    cols = []
    params = []

    for col, raw_val in fields.items():
        if col not in ALLOWED:
            # ignora colunas não permitidas
            print(f"[editar_entrada] coluna ignorada (não permitida): {col}")
            continue

        # tratamento por tipo
        try:
            if col == 'data':
                try:
                    d = parse_date_like(raw_val)
                    # armazena como date (ou None)
                    val = None if d is None else d
                except Exception:
                    return jsonify({"status": "error", "msg": f"Data inválida para '{col}': {raw_val}"}), 400

            elif any(k in col for k in ('valor', 'custo', 'valor_unitario', 'duplicata', 'peso')) or col == 'ipi':
                # numéricos: trata com parser robusto
                try:
                    f = parse_numeric_like(raw_val, col_name=col)
                except ValueError:
                    return jsonify({"status": "error", "msg": f"Valor numérico inválido para '{col}': {raw_val}"}), 400

                # tratamento especial para IPI: se estiver configurado para salvar como fração,
                # convertendo 3.25 -> 0.0325. Se já estiver 0.0325, o valor fica intacto.
                if col == 'ipi' and STORE_IPI_AS_FRACTION:
                    if f > 1 and f <= 100:
                        f = f / 100.0
                val = f

            else:
                # texto / nullable
                if raw_val == '':
                    val = None
                else:
                    val = raw_val
        except Exception as e:
            print("Erro ao interpretar campo:", col, raw_val, e)
            return jsonify({"status": "error", "msg": f"Erro ao interpretar campo '{col}'."}), 400

        cols.append(f"{col} = %s")
        params.append(val)

    if not cols:
        return jsonify({"status": "error", "msg": "Nenhuma coluna válida para atualizar."}), 400

    params.append(id)
    sql = f"UPDATE entrada_nf SET {', '.join(cols)} WHERE id = %s"

    conn = None
    cur = None
    try:
        conn = conectar()
        cur = conn.cursor()
        print("[editar_entrada] executando UPDATE:", sql, "params:", params)
        cur.execute(sql, tuple(params))
        conn.commit()
        print("[editar_entrada] UPDATE executado com sucesso para id=", id)
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        print("Erro ao executar UPDATE em editar_entrada:", e)
        # fecha cursor/conn se existirem
        try:
            if cur:
                cur.close()
        except Exception:
            pass
        try:
            if conn:
                conn.close()
        except Exception:
            pass
        return jsonify({"status": "error", "msg": "Erro no servidor."}), 500

    # --- buscar os dados atualizados e devolver ao cliente ---
    updated = {}
    try:
        # seleciona id + todas as colunas da whitelist (ordenadas para previsibilidade)
        cols_for_select = ['id'] + sorted(list(ALLOWED))
        select_cols = ', '.join(cols_for_select)
        cur2 = conn.cursor()
        cur2.execute(f"SELECT {select_cols} FROM entrada_nf WHERE id = %s", (id,))
        row = cur2.fetchone()
        if row:
            colnames = [d[0] for d in cur2.description]
            updated = dict(zip(colnames, row))

            # normaliza tipos não JSON-serializáveis
            for k, v in list(updated.items()):
                # datas -> ISO yyyy-mm-dd
                if isinstance(v, (datetime, date)):
                    # se for datetime ou date, transforma em isoformat (YYYY-MM-DD)
                    try:
                        updated[k] = v.isoformat()
                    except Exception:
                        updated[k] = str(v)
                # Decimal -> float
                elif Decimal is not None and isinstance(v, Decimal):
                    try:
                        updated[k] = float(v)
                    except Exception:
                        updated[k] = str(v)
                # caso seja bytes (raro), converte
                elif isinstance(v, (bytes, bytearray)):
                    try:
                        updated[k] = v.decode('utf-8', errors='ignore')
                    except Exception:
                        updated[k] = str(v)
        else:
            updated = {}
        try:
            cur2.close()
        except Exception:
            pass
    except Exception as e:
        print("Aviso: falha ao buscar registro atualizado:", e)
        # não falha a API por isso — devolve status ok mas sem 'updated' ou com {}.
        updated = {}

    # fecha recursos
    try:
        if cur:
            cur.close()
    except Exception:
        pass
    try:
        if conn:
            conn.close()
    except Exception:
        pass

    return jsonify({"status": "ok", "updated": updated})

@entrada_nf_bp.route('/ids_all', methods=['POST'])
@login_required
def ids_all():
    data = request.get_json(silent=True) or {}
    q = (data.get('q') or '').strip()

    conn = conectar()
    cur = conn.cursor()
    try:
        # TODO: adapte a WHERE abaixo para os mesmos filtros usados em /listar
        if q:
            like = f"%{q}%"
            sql = "SELECT id FROM entrada_nf WHERE referencia ILIKE %s OR fornecedor ILIKE %s"
            cur.execute(sql, (like, like))
        else:
            sql = "SELECT id FROM entrada_nf"
            cur.execute(sql)
        rows = cur.fetchall() or []
        ids = [r[0] for r in rows]
        return jsonify({"ids": ids})
    except Exception as e:
        print("Erro em ids_all:", e)
        return jsonify({"msg": "Erro ao buscar IDs"}), 500
    finally:
        try: cur.close()
        except: pass
        try: conn.close()
        except: pass

@entrada_nf_bp.route('/excluir', methods=['POST'])
@login_required
def excluir_entradas():
    """
    Exclui entradas.
    Aceita:
      - { "ids": [1,2,3] }              -> exclui esses ids (responde removed_ids / failed_ids)
      - { "all_matching": true, "q": "texto", "filters": {...} }
          -> exclui todas as entradas que batem no filtro/search (responde removed_ids / failed_ids)
      - Para apagar tudo sem filtro: enviar { "all_matching": true, "confirm_all": true }
    Retorna JSON {"status":"ok","removed": N, "removed_ids": [...], "failed_ids":[...]}
    """
    try:
        data = request.get_json(silent=True) or {}
        ids = data.get('ids')
        all_matching = bool(data.get('all_matching'))
        q = (data.get('q') or '').strip()
        filters = data.get('filters') or {}

        conn = conectar()
        cur = conn.cursor()

        try:
            removed_ids = []
            failed_ids = []

            if all_matching:
                # Monta cláusulas WHERE de forma segura (parametrizada)
                where_clauses = []
                params = []

                # Busca simples (q) — adaptável: fornecedor, numero_nf, etc.
                if q:
                    like = f"%{q}%"
                    where_clauses.append(
                        "(LOWER(fornecedor) LIKE LOWER(%s) OR CAST(numero_nf AS TEXT) LIKE %s)"
                    )
                    params.extend([like, like])

                # Exemplos de filtros opcionais (data range, fornecedor_id).
                # IMPORTANT: espera-se que frontend envie datas em ISO 'YYYY-MM-DD'
                if isinstance(filters, dict):
                    if filters.get('date_from'):
                        where_clauses.append("data_entrada >= %s")
                        params.append(filters['date_from'])
                    if filters.get('date_to'):
                        where_clauses.append("data_entrada <= %s")
                        params.append(filters['date_to'])
                    if filters.get('fornecedor_id'):
                        where_clauses.append("fornecedor_id = %s")
                        params.append(filters['fornecedor_id'])
                    # adicione outros filtros aqui conforme seu schema

                if where_clauses:
                    where_sql = " AND ".join(where_clauses)
                    select_sql = f"SELECT id FROM entrada_nf WHERE {where_sql}"
                    cur.execute(select_sql, tuple(params))
                    rows = cur.fetchall()
                    existing_ids = [int(r[0]) for r in rows] if rows else []

                    if existing_ids:
                        placeholders = ','.join(['%s'] * len(existing_ids))
                        delete_sql = f"DELETE FROM entrada_nf WHERE id IN ({placeholders})"
                        cur.execute(delete_sql, tuple(existing_ids))
                        # marcando os realmente removidos como os existentes (cur.rowcount pode ajudar)
                        removed_ids = existing_ids
                        failed_ids = []
                    else:
                        removed_ids = []
                        failed_ids = []
                else:
                    # Sem filtros: exige confirmação explícita para apagar tudo
                    confirm_all = bool(data.get('confirm_all'))
                    if not confirm_all:
                        return jsonify({
                            "status": "error",
                            "msg": "Sem filtro fornecido. Para apagar tudo, envie confirm_all=true."
                        }), 400
                    # Seleciona todos os ids antes de deletar
                    cur.execute("SELECT id FROM entrada_nf")
                    rows = cur.fetchall()
                    existing_ids = [int(r[0]) for r in rows] if rows else []
                    if existing_ids:
                        placeholders = ','.join(['%s'] * len(existing_ids))
                        cur.execute(f"DELETE FROM entrada_nf WHERE id IN ({placeholders})", tuple(existing_ids))
                        removed_ids = existing_ids
                        failed_ids = []
                    else:
                        removed_ids = []
                        failed_ids = []

            else:
                # Fluxo antigo: ids específicos
                if not ids or not isinstance(ids, list):
                    return jsonify({"status": "error", "msg": "Nenhum id fornecido."}), 400

                clean_ids = []
                for i in ids:
                    try:
                        clean_ids.append(int(i))
                    except Exception:
                        continue
                if not clean_ids:
                    return jsonify({"status": "error", "msg": "IDs inválidos."}), 400

                # Primeiro, selecionar quais desses ids realmente existem
                placeholders = ','.join(['%s'] * len(clean_ids))
                cur.execute(f"SELECT id FROM entrada_nf WHERE id IN ({placeholders})", tuple(clean_ids))
                rows = cur.fetchall()
                existing_ids = [int(r[0]) for r in rows] if rows else []

                # ids que não existiam
                failed_ids = [i for i in clean_ids if i not in existing_ids]

                if existing_ids:
                    placeholders_exist = ','.join(['%s'] * len(existing_ids))
                    cur.execute(f"DELETE FROM entrada_nf WHERE id IN ({placeholders_exist})", tuple(existing_ids))
                    removed_ids = existing_ids
                else:
                    removed_ids = []

            # commit e resposta com detalhes
            conn.commit()
            removed = len(removed_ids)
            return jsonify({
                "status": "ok",
                "removed": removed,
                "removed_ids": removed_ids,
                "failed_ids": failed_ids
            })
        except Exception as e:
            conn.rollback()
            print("Erro ao excluir entradas:", e)
            return jsonify({"status": "error", "msg": "Erro ao excluir no banco."}), 500
        finally:
            try: cur.close()
            except: pass
            try: conn.close()
            except: pass

    except Exception as exc:
        print("Exceção em excluir_entradas:", exc)
        return jsonify({"status": "error", "msg": "Erro interno."}), 500

@entrada_nf_bp.route('/listar')
@login_required
def listar_entradas():
    page = int(request.args.get('page', 1))
    per_page = 10
    search = (request.args.get('search') or '').strip()

    conexao = conectar()
    cursor = conexao.cursor()
    try:
        if search:
            # Pré-processamento (igual saida_nf)
            clean_search = re.sub(r'[.\-\/]', '', search)
            like = f"%{search}%"

            # Se for dd/mm/YYYY, converte para YYYY-MM-DD
            try:
                data_formatada = datetime.strptime(search, '%d/%m/%Y').strftime('%Y-%m-%d')
            except Exception:
                data_formatada = ''

            cursor.execute(
                """
                SELECT id,
                       data, nf, fornecedor,
                       material_1, material_2, material_3, material_4, material_5,
                       produto, custo_empresa, ipi, valor_integral,
                       valor_unitario_1, valor_unitario_2, valor_unitario_3,
                       valor_unitario_4, valor_unitario_5,
                       duplicata_1, duplicata_2, duplicata_3,
                       duplicata_4, duplicata_5, duplicata_6,
                       valor_unitario_energia, valor_mao_obra_tm_metallica,
                       peso_liquido, peso_integral
                FROM entrada_nf
                WHERE unaccent(nf::text)         ILIKE unaccent(%s)
                   OR unaccent(fornecedor::text) ILIKE unaccent(%s)
                   OR unaccent(produto::text)    ILIKE unaccent(%s)
                   OR unaccent(material_1::text) ILIKE unaccent(%s)
                   OR unaccent(material_2::text) ILIKE unaccent(%s)
                   OR unaccent(material_3::text) ILIKE unaccent(%s)
                   OR unaccent(material_4::text) ILIKE unaccent(%s)
                   OR unaccent(material_5::text) ILIKE unaccent(%s)
                   OR data::text = %s
                ORDER BY data DESC, nf DESC
                """,
                (like, like, like, like, like, like, like, like, data_formatada)
            )
            linhas = cursor.fetchall()
            total_pages = 1
            page = 1

        else:
            cursor.execute("SELECT COUNT(*) FROM entrada_nf")
            total = cursor.fetchone()[0] or 0
            total_pages = (total + per_page - 1) // per_page
            offset = (page - 1) * per_page

            cursor.execute(
                """
                SELECT id,
                       data, nf, fornecedor,
                       material_1, material_2, material_3, material_4, material_5,
                       produto, custo_empresa, ipi, valor_integral,
                       valor_unitario_1, valor_unitario_2, valor_unitario_3,
                       valor_unitario_4, valor_unitario_5,
                       duplicata_1, duplicata_2, duplicata_3,
                       duplicata_4, duplicata_5, duplicata_6,
                       valor_unitario_energia, valor_mao_obra_tm_metallica,
                       peso_liquido, peso_integral
                FROM entrada_nf
                ORDER BY data DESC, nf DESC
                LIMIT %s OFFSET %s
                """,
                (per_page, offset)
            )
            linhas = cursor.fetchall()

        entradas = [_linha_para_entrada(l) for l in linhas]

        max_materiais = max((len(e['materiais']) for e in entradas if isinstance(e.get('materiais'), list)), default=0)
        max_duplicatas = max((len(e['duplicatas']) for e in entradas if isinstance(e.get('duplicatas'), list)), default=0)

        max_materiais = min(max_materiais, MAX_MATERIAIS_DB)
        max_duplicatas = min(max_duplicatas, MAX_DUPLICATAS_DB)

    finally:
        cursor.close()
        conexao.close()

    return render_template(
        'partials/entrada_nf_list.html',
        entradas=entradas,
        page=page,
        total_pages=total_pages,
        max_materiais=max_materiais,
        max_duplicatas=max_duplicatas
    )

ALLOWED_EXT = {'xls', 'xlsx'}

def _normalize_colname(s):
    s = str(s or '').strip().lower()
    s = re.sub(r'[\s\-_]+', '', s)
    s = re.sub(r'[^\w]', '', s)  # remove caracteres não alfanuméricos
    return s

def _to_str_safe(v):
    """Converte para string limpa ou None se vazio/NaN."""
    if v is None or pd.isna(v):
        return None
    s = str(v).strip()
    if s.lower() in ('', 'nan', 'none', 'null'):
        return None
    return s

def _to_float_safe(v):
    """Converte valores para float, respeitando vírgulas/pontos. Retorna None se vazio."""
    try:
        if v is None or pd.isna(v):
            return None
        if isinstance(v, (int, float)):
            return float(v)
        s = str(v).strip()
        if s.lower() in ('', 'nan', 'none', 'null'):
            return None
        # remove milhar, troca vírgula por ponto
        s = s.replace(' ', '').replace('.', '').replace(',', '.')
        s = re.sub(r'[^0-9\.\-]', '', s)
        if not s or s in ('-', '.'):
            return None
        return float(s)
    except Exception:
        return None

@entrada_nf_bp.route('/importar_excel', methods=['POST'])
@login_required
def importar_excel_entrada():
    arquivo = request.files.get('arquivo_excel')
    if not arquivo:
        msg = 'Nenhum arquivo enviado.'
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify(error=msg), 400
        flash(msg, 'danger')
        return redirect(url_for('entrada_nf.entradas_nf'))

    filename = secure_filename(arquivo.filename or '')
    if '.' not in filename:
        msg = 'Arquivo sem extensão.'
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify(error=msg), 400
        flash(msg, 'danger')
        return redirect(url_for('entrada_nf.entradas_nf'))

    ext = filename.rsplit('.', 1)[1].lower()
    if ext not in ALLOWED_EXT:
        msg = 'Extensão não permitida. Use .xls ou .xlsx'
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify(error=msg), 400
        flash(msg, 'danger')
        return redirect(url_for('entrada_nf.entradas_nf'))

    try:
        arquivo.stream.seek(0)
        engine = 'xlrd' if ext == 'xls' else 'openpyxl'
        df = pd.read_excel(arquivo.stream, engine=engine)
    except Exception as e:
        msg = f'Falha ao ler Excel: {e}'
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify(error=msg), 400
        flash(msg, 'danger')
        return redirect(url_for('entrada_nf.entradas_nf'))

    # Normaliza cabeçalhos
    orig_cols = list(df.columns)
    normalized = {_normalize_colname(c): c for c in orig_cols}

    # Mapeamento esperado
    expected_map = {
        'data'                 : ['data'],
        'nf'                   : ['nf', 'nota', 'nota fiscal'],
        'fornecedor'           : ['fornecedor', 'empresa'],
        'produto'              : ['produto'],
        'material1'            : ['material1','material_1','mat1'],
        'material2'            : ['material2','material_2','mat2'],
        'material3'            : ['material3','material_3','mat3'],
        'material4'            : ['material4','material_4','mat4'],
        'material5'            : ['material5','material_5','mat5'],
        'custoempresa'         : ['custoempresa','custo_empresa','custo'],
        'ipi'                  : ['ipi'],
        'valorintegral'        : ['valorintegral','valor_integral','valor total'],
        'valorunitario1'       : ['valorunitario1','valor_unitario_1'],
        'valorunitario2'       : ['valorunitario2','valor_unitario_2'],
        'valorunitario3'       : ['valorunitario3','valor_unitario_3'],
        'valorunitario4'       : ['valorunitario4','valor_unitario_4'],
        'valorunitario5'       : ['valorunitario5','valor_unitario_5'],
        'duplicata1'           : ['duplicata1','duplicata_1'],
        'duplicata2'           : ['duplicata2','duplicata_2'],
        'duplicata3'           : ['duplicata3','duplicata_3'],
        'duplicata4'           : ['duplicata4','duplicata_4'],
        'duplicata5'           : ['duplicata5','duplicata_5'],
        'duplicata6'           : ['duplicata6','duplicata_6'],
        'valorunitarioenergia' : ['valorunitarioenergia','valor_unitario_energia','valor unitário energia','energia'],
        'valormaoobra'         : ['valormaoobra','valor_mao_obra_tm_metallica','valor mão de obra tm/metallica','mao de obra','mão obra'],
        'pesoliquido'          : ['pesoliquido','peso_liquido','peso líquido'],
        'pesointegral'         : ['pesointegral','peso_integral','peso integral']
    }

    # Resolve colunas
    resolved = {}
    for key, aliases in expected_map.items():
        found = None
        for a in aliases:
            na = _normalize_colname(a)
            if na in normalized:
                found = normalized[na]
                break
        resolved[key] = found

    obrigatorias = ['data','nf','fornecedor','produto']
    faltando = [k for k in obrigatorias if not resolved.get(k)]
    if faltando:
        msg = f'Colunas obrigatórias faltando no Excel: {faltando}. Cabeçalhos detectados: {orig_cols}'
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify(error=msg), 400
        flash(msg, 'danger')
        return redirect(url_for('entrada_nf.entradas_nf'))

    # Datas
    try:
        df['_data_parsed'] = pd.to_datetime(df[resolved['data']], dayfirst=True, errors='coerce')
    except Exception:
        df['_data_parsed'] = pd.to_datetime(df[resolved['data']].astype(str), dayfirst=True, errors='coerce')

    # Números
    for num_key in ['custoempresa','ipi','valorintegral',
                    'valorunitario1','valorunitario2','valorunitario3','valorunitario4','valorunitario5',
                    'duplicata1','duplicata2','duplicata3','duplicata4','duplicata5','duplicata6',
                    'valorunitarioenergia','valormaoobra','pesoliquido','pesointegral']:
        colname = resolved.get(num_key)
        if colname:
            df['_'+num_key] = df[colname].apply(_to_float_safe)
        else:
            df['_'+num_key] = None

    # Textos
    for txt_key in ['nf','fornecedor','produto','material1','material2','material3','material4','material5']:
        colname = resolved.get(txt_key)
        if colname:
            df['_'+txt_key] = df[colname].apply(_to_str_safe)
        else:
            df['_'+txt_key] = None

    # Colunas do banco
    db_columns = [
        'data','nf','fornecedor','produto',
        'material_1','material_2','material_3','material_4','material_5',
        'custo_empresa','ipi','valor_integral',
        'valor_unitario_1','valor_unitario_2','valor_unitario_3','valor_unitario_4','valor_unitario_5',
        'duplicata_1','duplicata_2','duplicata_3','duplicata_4','duplicata_5','duplicata_6',
        'valor_unitario_energia','valor_mao_obra_tm_metallica','peso_liquido','peso_integral'
    ]

    rows, errors = [], []
    for idx, r in df.iterrows():
        try:
            pesol = r['_pesoliquido']
            if pesol is None or pd.isna(pesol):
                pesol = 0.0

            tup = (
                (r['_data_parsed'].to_pydatetime() if (hasattr(r['_data_parsed'],'to_pydatetime')) else (r['_data_parsed'] if not pd.isna(r['_data_parsed']) else None)),
                r['_nf'],
                r['_fornecedor'],
                r['_produto'],
                r['_material1'],
                r['_material2'],
                r['_material3'],
                r['_material4'],
                r['_material5'],
                r['_custoempresa'],
                r['_ipi'],
                r['_valorintegral'],
                r['_valorunitario1'],
                r['_valorunitario2'],
                r['_valorunitario3'],
                r['_valorunitario4'],
                r['_valorunitario5'],
                r['_duplicata1'],
                r['_duplicata2'],
                r['_duplicata3'],
                r['_duplicata4'],
                r['_duplicata5'],
                r['_duplicata6'],
                r['_valorunitarioenergia'],
                r['_valormaoobra'],
                pesol,
                r['_pesointegral']
            )
            rows.append(tup)
        except Exception as e:
            errors.append(f'linha {idx+1}: {e}')

    # Inserção no banco (anti-duplicação de NF)
    inserted = 0
    if rows:
        conn = conectar()
        cur = conn.cursor()
        try:
            # busca NFs já existentes
            cur.execute("SELECT nf FROM entrada_nf")
            nfs_existentes = {row[0] for row in cur.fetchall() if row[0]}

            # filtra apenas os que não estão no banco
            rows_filtradas = [r for r in rows if r[1] not in nfs_existentes]

            if rows_filtradas:
                cols_sql = ','.join(db_columns)
                sql = f"INSERT INTO entrada_nf ({cols_sql}) VALUES %s"
                execute_values(cur, sql, rows_filtradas)
                inserted = cur.rowcount if cur.rowcount is not None else len(rows_filtradas)

            conn.commit()
        except Exception as e:
            conn.rollback()
            msg = f'Erro ao inserir no banco: {e}'
            try:
                cur.close(); conn.close()
            except: pass
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify(error=msg), 500
            flash(msg, 'danger')
            return redirect(url_for('entrada_nf.entradas_nf'))
        finally:
            try:
                cur.close(); conn.close()
            except: pass

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify(inserted=inserted, failed=len(errors), errors=errors), 200

    flash(f'Importação concluída. Inseridos: {inserted}. Falhas: {len(errors)}', 'success')
    return redirect(url_for('entrada_nf.entradas_nf'))