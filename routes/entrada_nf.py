from flask import Blueprint, render_template, request, redirect, url_for, flash, session, jsonify, send_file, current_app as app
from routes.auth_routes import login_required
from conexao_db import conectar
from datetime import datetime
from math import ceil
from werkzeug.utils import secure_filename
import pandas as pd
from psycopg2.extras import execute_values
import re
from io import BytesIO
import pandas as pd
import html

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
        max_valores = 0
        max_duplicatas = 0

        for e in entradas:
            # materiais (lista construída por _linha_para_entrada)
            if isinstance(e.get('materiais'), list):
                max_materiais = max(max_materiais, len(e['materiais']))

            # valores unitários (1..MAX_MATERIAIS_DB) - checa colunas e fallback em materiais[]
            for i in range(1, MAX_MATERIAIS_DB + 1):
                vu_col = e.get(f'valor_unitario_{i}')
                vu_fallback = None
                try:
                    if isinstance(e.get('materiais'), list) and len(e['materiais']) >= i:
                        vu_fallback = e['materiais'][i-1].get('valor_unitario')
                except Exception:
                    vu_fallback = None
                if vu_col not in (None, '') or (vu_fallback not in (None, '') and vu_fallback is not None):
                    max_valores = max(max_valores, i)

            # duplicatas: tanto colunas duplicata_X quanto lista duplicatas[]
            if isinstance(e.get('duplicatas'), list):
                max_duplicatas = max(max_duplicatas, len(e['duplicatas']))
            for j in range(1, MAX_DUPLICATAS_DB + 1):
                d_col = e.get(f'duplicata_{j}')
                if d_col not in (None, '', 0):
                    max_duplicatas = max(max_duplicatas, j)

        # limita ao máximo físico do DB
        max_materiais = min(max_materiais or 0, MAX_MATERIAIS_DB)
        max_valores = min(max_valores or 0, MAX_MATERIAIS_DB)
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
        max_valores=max_valores,
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
            print(f"[editar_entrada] coluna ignorada (não permitida): {col}")
            continue

        # Se o cliente explicitamente mandou null, armazenamos NULL no banco
        if raw_val is None:
            val = None
            cols.append(f"{col} = %s")
            params.append(val)
            continue

        # Se enviar string vazia, tratamos como NULL também (opcional — ajuste se quiser 0)
        if isinstance(raw_val, str) and raw_val.strip() == '':
            val = None
            cols.append(f"{col} = %s")
            params.append(val)
            continue

        # Agora raw_val é não-nulo e não-vazio -> processar por tipo
        try:
            if col == 'data':
                try:
                    d = parse_date_like(raw_val)
                    val = None if d is None else d
                except Exception:
                    return jsonify({"status": "error", "msg": f"Data inválida para '{col}': {raw_val}"}), 400

            elif any(k in col for k in ('valor', 'custo', 'valor_unitario', 'duplicata', 'peso')) or col == 'ipi':
                # numeric fields: parse only quando raw_val não for None/'' (já tratado acima)
                try:
                    f = parse_numeric_like(raw_val, col_name=col)
                except ValueError:
                    return jsonify({"status": "error", "msg": f"Valor numérico inválido para '{col}': {raw_val}"}), 400

                if col == 'ipi' and STORE_IPI_AS_FRACTION:
                    if f > 1 and f <= 100:
                        f = f / 100.0
                val = f

            else:
                # texto / nullable (raw_val não é vazio nem None aqui)
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

@entrada_nf_bp.route('/api/fornecedores/list')
@login_required
def api_fornecedores_list():
    conn = conectar()
    cur = conn.cursor()
    cur.execute("SELECT id, nome FROM fornecedores ORDER BY nome")
    rows = cur.fetchall()
    data = [{"id": r[0], "nome": r[1]} for r in rows]
    cur.close()
    conn.close()
    return jsonify(data)

@entrada_nf_bp.route('/api/materiais/list')
@login_required
def api_materiais_list():
    conn = conectar()
    cur = conn.cursor()
    # DISTINCT para evitar duplicatas entre fornecedores
    cur.execute("SELECT DISTINCT nome FROM materiais ORDER BY nome")
    data = [{"id": i, "nome": r[0]} for i, r in enumerate(cur.fetchall())]
    cur.close()
    conn.close()
    return jsonify(data)

@entrada_nf_bp.route('/api/produtos/list')
@login_required
def api_produtos_list():
    conn = conectar()
    cur = conn.cursor()
    cur.execute("SELECT id, nome FROM produtos ORDER BY nome")
    data = [{"id": r[0], "nome": r[1]} for r in cur.fetchall()]
    cur.close()
    conn.close()
    return jsonify(data)

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
    search = (request.args.get('search') or request.args.get('q_raw') or request.args.get('q') or '').strip()

    conexao = conectar()
    cursor = conexao.cursor()
    try:
        if search:
            # mantém o que o usuário digitou e também cria um pattern com % para ILIKE
            raw = (search or '').strip()
            like = f"%{raw}%"

            # tenta interpretar como dd/mm/YYYY para comparação exata por date
            data_iso = None
            try:
                data_obj = datetime.strptime(raw, '%d/%m/%Y')
                data_iso = data_obj.strftime('%Y-%m-%d')   # '2025-08-06'
            except Exception:
                data_iso = None

            sql = """
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
                -- compara como date (só funciona se o usuário digitou a data completa)
                OR (data::date = %s::date)
                -- compara a data formatada DD/MM/YYYY com pattern (aceita buscas parciais '06/' '06/08' etc.)
                OR (to_char(data, 'DD/MM/YYYY') ILIKE %s)
                ORDER BY data DESC, nf DESC
            """

            # montagem dos parâmetros: 8 vezes para os unaccent ILIKE, depois data_iso (pode ser None),
            # depois o 'like' para a comparação to_char(... ) ILIKE %s
            params = [like] * 8
            params.append(data_iso)   # para data::date = %s::date (None se não for data completa)
            params.append(like)       # para to_char(...) ILIKE %s (usa wildcard)

            cursor.execute(sql, tuple(params))
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

        # calcula máximos observados nas entradas desta página
        max_materiais = 0
        max_valores = 0
        max_duplicatas = 0

        for e in entradas:
            if isinstance(e.get('materiais'), list):
                max_materiais = max(max_materiais, len(e['materiais']))

            for i in range(1, MAX_MATERIAIS_DB + 1):
                vu_col = e.get(f'valor_unitario_{i}')
                vu_fallback = None
                try:
                    if isinstance(e.get('materiais'), list) and len(e['materiais']) >= i:
                        vu_fallback = e['materiais'][i-1].get('valor_unitario')
                except Exception:
                    vu_fallback = None
                if vu_col not in (None, '') or (vu_fallback not in (None, '') and vu_fallback is not None):
                    max_valores = max(max_valores, i)

            if isinstance(e.get('duplicatas'), list):
                max_duplicatas = max(max_duplicatas, len(e['duplicatas']))
            for j in range(1, MAX_DUPLICATAS_DB + 1):
                d_col = e.get(f'duplicata_{j}')
                if d_col not in (None, '', 0):
                    max_duplicatas = max(max_duplicatas, j)

        max_materiais = min(max_materiais, MAX_MATERIAIS_DB)
        max_valores = min(max_valores, MAX_MATERIAIS_DB)
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
        max_valores=max_valores,
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

@entrada_nf_bp.route('/exportar_filtrado')
@login_required
def exportar_filtrado():
    import datetime as dt  # evita conflito se houver "from datetime import datetime" em outro lugar
    from io import BytesIO

    tipo = (request.args.get('tipo') or 'excel').lower()
    q = (request.args.get('q') or '').strip()
    data_de = (request.args.get('data_de') or '').strip()
    data_ate = (request.args.get('data_ate') or '').strip()
    numero_nf = (request.args.get('numero_nf') or '').strip()
    fornecedor = (request.args.get('fornecedor') or '').strip()
    produto_nome = (request.args.get('produto_nome') or '').strip()

    def parse_date_try(s):
        if not s:
            return None
        s = s.strip()
        try:
            if '/' in s:
                return dt.datetime.strptime(s, '%d/%m/%Y').date()
            return dt.datetime.strptime(s, '%Y-%m-%d').date()
        except Exception:
            try:
                pd_dt = pd.to_datetime(s, dayfirst=True, errors='coerce')
                return None if pd.isna(pd_dt) else pd_dt.date()
            except Exception:
                return None

    where = []
    params = []

    iso_q = ''
    if q:
        try:
            if '/' in q and len(q.split('/')) == 3:
                d = parse_date_try(q)
                if d:
                    iso_q = d.isoformat()
        except Exception:
            iso_q = ''

    if iso_q:
        where.append("data::text = %s")
        params.append(iso_q)
    else:
        if q:
            like = f"%{q}%"
            where.append("(" + " OR ".join([
                "unaccent(nf::text) ILIKE unaccent(%s)",
                "unaccent(fornecedor::text) ILIKE unaccent(%s)",
                "unaccent(produto::text) ILIKE unaccent(%s)",
                "unaccent(material_1::text) ILIKE unaccent(%s)",
                "unaccent(material_2::text) ILIKE unaccent(%s)",
                "unaccent(material_3::text) ILIKE unaccent(%s)",
                "unaccent(material_4::text) ILIKE unaccent(%s)",
                "unaccent(material_5::text) ILIKE unaccent(%s)"
            ]) + ")")
            params.extend([like]*8)

    if numero_nf:
        where.append("nf::text = %s")
        params.append(numero_nf)

    if fornecedor:
        where.append("fornecedor ILIKE %s")
        params.append(f"%{fornecedor}%")

    if produto_nome:
        where.append("produto ILIKE %s")
        params.append(f"%{produto_nome}%")

    d_from = parse_date_try(data_de)
    d_to = parse_date_try(data_ate)
    if d_from:
        where.append("data >= %s")
        params.append(d_from)
    if d_to:
        where.append("data <= %s")
        params.append(d_to)

    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    sql = f"""
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
        {where_sql}
        ORDER BY data DESC, nf DESC
    """

    conn = None
    cur = None
    try:
        conn = conectar()
        cur = conn.cursor()
        cur.execute(sql, tuple(params))
        rows = cur.fetchall() or []

        records = []
        for r in rows:
            mapped = _linha_para_entrada(r)
            data_str = mapped.get('data')
            try:
                if data_str:
                    mapped['data'] = dt.datetime.strptime(data_str, '%d/%m/%Y').date()
                else:
                    mapped['data'] = None
            except Exception:
                mapped['data'] = mapped.get('data')
            for i in range(5):
                if isinstance(mapped.get('materiais'), list) and len(mapped['materiais']) > i:
                    mapped[f"material_{i+1}"] = mapped['materiais'][i].get('nome')
                    mapped[f"valor_unitario_{i+1}"] = mapped['materiais'][i].get('valor_unitario')
                else:
                    mapped[f"material_{i+1}"] = None
                    mapped[f"valor_unitario_{i+1}"] = None
            for j in range(6):
                mapped[f"duplicata_{j+1}"] = mapped['duplicatas'][j] if (isinstance(mapped.get('duplicatas'), list) and len(mapped['duplicatas']) > j) else None

            records.append(mapped)

        cols = [
            ('data', 'Data'),
            ('nf', 'NF'),
            ('fornecedor', 'Fornecedor'),
            ('material_1', 'Material 1'),
            ('material_2', 'Material 2'),
            ('material_3', 'Material 3'),
            ('material_4', 'Material 4'),
            ('material_5', 'Material 5'),
            ('produto', 'Produto'),
            ('custo_empresa', 'Custo R$'),
            ('ipi', 'IPI %'),
            ('valor_integral', 'Valor Integral'),
            ('valor_unitario_1', 'Valor Unit. 1'),
            ('valor_unitario_2', 'Valor Unit. 2'),
            ('valor_unitario_3', 'Valor Unit. 3'),
            ('valor_unitario_4', 'Valor Unit. 4'),
            ('valor_unitario_5', 'Valor Unit. 5'),
            ('duplicata_1', 'Duplicata 1'),
            ('duplicata_2', 'Duplicata 2'),
            ('duplicata_3', 'Duplicata 3'),
            ('duplicata_4', 'Duplicata 4'),
            ('duplicata_5', 'Duplicata 5'),
            ('duplicata_6', 'Duplicata 6'),
            ('valor_unitario_energia', 'Valor Unit. Energia'),
            ('valor_mao_obra_tm_metallica', 'Valor M.O.'),
            ('peso_liquido', 'Peso Liq.'),
            ('peso_integral', 'Peso Int.')
        ]

        df_rows = []
        for rec in records:
            row = {}
            for k, label in cols:
                if k == 'ipi' and rec.get('ipi') is not None:
                    ipi_val = rec.get('ipi')
                    row[label] = (ipi_val * 100) if (isinstance(ipi_val, float) and ipi_val <= 1) else ipi_val
                else:
                    row[label] = rec.get(k)
            df_rows.append(row)

        df = pd.DataFrame(df_rows, columns=[label for _, label in cols])

        timestamp = dt.datetime.now().strftime('%Y%m%d_%H%M%S')
        base_name = f"entradas_export_{timestamp}"

        # Excel (padrão)
        if tipo != 'pdf':
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, sheet_name='Entradas', index=False)
            output.seek(0)
            return send_file(
                output,
                as_attachment=True,
                download_name=f"{base_name}.xlsx",
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )

        # -----------------------------
        # GERAÇÃO DE PDF COM REPORTLAB (melhor legibilidade)
        # -----------------------------
        try:
            # imports locais
            from reportlab.lib.pagesizes import A4, A3, landscape
            from reportlab.lib import colors
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import mm
            from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
            from xml.sax.saxutils import escape as xml_escape

            # Decide página: se muitas colunas, usa A3 paisagem
            original_headers = [label for _, label in cols]
            n_cols = len(original_headers)
            use_a3 = n_cols > 12  # limiar ajustável
            page_size = landscape(A3) if use_a3 else landscape(A4)
            page_width = page_size[0]
            # margem
            margin_mm = 10
            usable_width = page_width - (2 * margin_mm * mm)

            buf = BytesIO()
            doc = SimpleDocTemplate(buf, pagesize=page_size,
                                    leftMargin=margin_mm*mm, rightMargin=margin_mm*mm,
                                    topMargin=10*mm, bottomMargin=10*mm)
            story = []
            styles = getSampleStyleSheet()
            # estilos
            header_style = ParagraphStyle('h', parent=styles['Heading4'], alignment=TA_CENTER, fontSize=9, leading=10)
            text_style = ParagraphStyle('t', parent=styles['Normal'], alignment=TA_LEFT, fontSize=8, leading=9)
            small_text_style = ParagraphStyle('ts', parent=styles['Normal'], alignment=TA_LEFT, fontSize=7, leading=8)
            number_style = ParagraphStyle('n', parent=styles['Normal'], alignment=TA_RIGHT, fontSize=8, leading=9)

            story.append(Paragraph("Entradas Exportadas", styles['Heading2']))
            story.append(Spacer(1, 6))

            # Retira colunas totalmente vazias (manutenção da ordem original)
            def col_has_value(series):
                if series is None:
                    return False
                for v in series:
                    if v is None:
                        continue
                    try:
                        if isinstance(v, float) and pd.isna(v):
                            continue
                    except Exception:
                        pass
                    s = str(v).strip().lower()
                    if s not in ('', 'nan', 'none'):
                        return True
                return False

            headers = []
            for h in original_headers:
                if h not in df.columns:
                    continue
                if col_has_value(df[h]):
                    headers.append(h)
            if not headers:
                headers = original_headers.copy()

            # calcula larguras baseadas em heurística (prioriza algumas colunas)
            widths = []
            for h in headers:
                if h in ('Data', 'NF'):
                    widths.append(30 * mm)
                elif h in ('Fornecedor', 'Produto'):
                    widths.append(55 * mm)
                elif h.startswith('Material'):
                    widths.append(45 * mm)
                elif h.startswith('Duplicata'):
                    widths.append(28 * mm)
                elif h in ('Custo R$', 'Valor Integral', 'Valor Unit. Energia', 'Valor M.O.', 'Peso Liq.', 'Peso Int.'):
                    widths.append(30 * mm)
                else:
                    widths.append(30 * mm)

            # ajusta proporcionalmente se soma > usable_width
            sum_w = sum(widths)
            if sum_w > usable_width:
                factor = usable_width / float(sum_w)
                widths = [w * factor for w in widths]

            # prepara table_data usando Paragraph (para quebra de linha)
            table_data = []
            # cabeçalho com Paragraphs
            header_row = [Paragraph(xml_escape(h), header_style) for h in headers]
            table_data.append(header_row)

            # linhas
            for _, r in df.iterrows():
                row = []
                for h in headers:
                    v = r.get(h)
                    if isinstance(v, (dt.date, dt.datetime)):
                        text = v.strftime('%d/%m/%Y')
                        p = Paragraph(xml_escape(text), text_style)
                    elif isinstance(v, float):
                        formatted = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                        p = Paragraph(xml_escape(formatted), number_style)
                    elif v is None or (isinstance(v, float) and pd.isna(v)):
                        p = Paragraph('', text_style)
                    else:
                        s = str(v)
                        # se muito longo, deixa o Paragraph quebrar naturalmente (vai ajustar altura)
                        # usa estilo menor se texto muito comprido
                        p = Paragraph(xml_escape(s), small_text_style if len(s) > 80 else text_style)
                    row.append(p)
                table_data.append(row)

            # cria tabela
            tbl = Table(table_data, colWidths=widths, repeatRows=1)
            tbl_style = TableStyle([
                ('GRID', (0,0), (-1,-1), 0.25, colors.HexColor('#BBBBBB')),
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F0F0F0')),
                ('VALIGN', (0,0), (-1,-1), 'TOP'),
                ('FONTSIZE', (0,0), (-1,-1), 8),
                ('LEFTPADDING', (0,0), (-1,-1), 4),
                ('RIGHTPADDING', (0,0), (-1,-1), 4),
            ])
            # alinha numericas à direita (procura por alguns rótulos que indicam número)
            numeric_labels = set(['Custo R$', 'IPI %', 'Valor Integral', 'Valor Unit. 1', 'Valor Unit. 2',
                                  'Valor Unit. 3', 'Valor Unit. 4', 'Valor Unit. 5',
                                  'Duplicata 1', 'Duplicata 2', 'Duplicata 3', 'Duplicata 4', 'Duplicata 5', 'Duplicata 6',
                                  'Valor Unit. Energia', 'Valor M.O.', 'Peso Liq.', 'Peso Int.'])
            for col_idx, h in enumerate(headers):
                if h in numeric_labels or 'Valor' in h or 'Custo' in h or 'Peso' in h or h.startswith('Duplicata'):
                    tbl_style.add('ALIGN', (col_idx, 1), (col_idx, -1), 'RIGHT')
                else:
                    tbl_style.add('ALIGN', (col_idx, 1), (col_idx, -1), 'LEFT')

            tbl.setStyle(tbl_style)
            story.append(tbl)

            # renderiza PDF
            doc.build(story)
            buf.seek(0)
            return send_file(
                buf,
                as_attachment=True,
                download_name=f"{base_name}.pdf",
                mimetype='application/pdf'
            )

        except ImportError as e:
            # reportlab não instalado -> fallback Excel
            print("reportlab não instalado:", e)
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, sheet_name='Entradas', index=False)
            output.seek(0)
            return send_file(
                output,
                as_attachment=True,
                download_name=f"{base_name}_fallback.xlsx",
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
        except Exception as e:
            # erro qualquer durante geração do PDF -> fallback Excel
            print("Erro ao gerar PDF com reportlab:", e)
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, sheet_name='Entradas', index=False)
            output.seek(0)
            return send_file(
                output,
                as_attachment=True,
                download_name=f"{base_name}_fallback.xlsx",
                mimetype='application/vnd.openxmlformats-officedocument-spreadsheetml.sheet'
            )

    except Exception as exc:
        print("Erro em exportar_filtrado:", exc)
        flash("Erro ao gerar exportação.", "danger")
        return redirect(url_for('entrada_nf.nova_entrada'))
    finally:
        try:
            if cur: cur.close()
        except:
            pass
        try:
            if conn: conn.close()
        except:
            pass
