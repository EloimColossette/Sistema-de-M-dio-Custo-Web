# routes/calculo_routes.py
from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, send_file
from routes.auth_routes import login_required
from conexao_db import conectar
from decimal import Decimal
import io
import pandas as pd

calculo_bp = Blueprint('calculo_nfs', __name__, url_prefix='/calculo_nfs')

def converter_numero_br_para_decimal(valor):
    """
    Converte string no formato brasileiro (ex.: "1.234,56" ou "1234.56")
    para Decimal. Retorna None se vazio ou inválido.
    """
    if valor is None:
        return None
    s = str(valor).strip()
    if s == '':
        return None
    s = s.replace(' ', '')
    # Remove separador de milhares e padroniza decimal com ponto
    if ',' in s and s.count(',') == 1 and '.' in s:
        s = s.replace('.', '').replace(',', '.')
    else:
        s = s.replace(',', '.')
    try:
        return Decimal(s)
    except Exception:
        return None

def registrar_historico(usuario, nf, produto, quantidade, tipo):
    """
    Grava uma linha em uma tabela de histórico (se existir).
    Ajuste a tabela/nome dos campos conforme seu schema.
    """
    conn = conectar()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO calculo_historico (usuario, nf, produto, quantidade, tipo, timestamp) "
            "VALUES (%s, %s, %s, %s, %s, now())",
            (usuario or '', str(nf), str(produto), Decimal(str(quantidade)), tipo)
        )
        conn.commit()
        # opcional: notify
        try:
            cur.execute("SELECT pg_notify('historico_atualizado', 'novo');")
            conn.commit()
        except Exception:
            pass
    except Exception as e:
        conn.rollback()
        print("Erro ao gravar histórico:", e)
    finally:
        cur.close()
        conn.close()

# -------------------------
# Página / listagem (listar_calculo_nfs)
# -------------------------
@calculo_bp.route('/', methods=['GET'])
@login_required
def listar_calculo_nfs():
    """
    Lista todas as linhas da tabela entrada_nf (uma linha por entrada),
    trazendo também dados de produtos / calculo_nfs quando houver correspondência.
    """
    conn = conectar()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT
                en.id                 AS entrada_id,     -- 0
                en.data               AS entrada_data,   -- 1
                en.nf                 AS entrada_nf,     -- 2
                en.produto            AS entrada_produto,-- 3
                en.peso_liquido       AS peso_liquido,   -- 4
                p.id                  AS produto_id,     -- 5 (pode ser NULL)
                cn.id                 AS calculo_id,     -- 6 (pode ser NULL)
                COALESCE(cn.quantidade_estoque, 0) AS quantidade_estoque, -- 7
                cn.qtd_cobre, cn.qtd_zinco,
                cn.valor_total_nf, cn.mao_de_obra, cn.materia_prima,
                cn.custo_total_manual, cn.custo_total
            FROM entrada_nf en
            LEFT JOIN produtos p ON LOWER(p.nome) = LOWER(en.produto)
            LEFT JOIN calculo_nfs cn ON p.id = cn.id_produto
            ORDER BY en.data DESC NULLS LAST, en.id DESC
        """)
        rows = cur.fetchall()

        registros = []
        for r in rows:
            registros.append({
                'entrada_id': r[0],
                'data': r[1],
                'nf': r[2],
                'produto': r[3],
                'peso_liquido': r[4],
                'id_produto': r[5],
                # 'id' aqui continua sendo o id do calculo_nfs (se existir) — usado para ações
                'id': r[6],
                'quantidade_estoque': r[7],
                'qtd_cobre': r[8],
                'qtd_zinco': r[9],
                'valor_total_nf': r[10],
                'mao_de_obra': r[11],
                'materia_prima': r[12],
                'custo_total_manual': r[13],
                'custo_total': r[14],
            })

        # lista de produtos para o select do formulário (mantive como antes)
        cur.execute("SELECT id, nome FROM produtos ORDER BY LOWER(nome) ASC")
        produtos = [dict(id=p[0], nome=p[1]) for p in cur.fetchall()]

        # substituir o bloco que formata datas por este
        for reg in registros:
            d = reg.get('data')
            if d is not None:
                try:
                    # se for datetime
                    if hasattr(d, 'strftime'):
                        reg['data'] = d.strftime('%d/%m/%Y')
                    else:
                        s = str(d).strip()
                        # extrai só a parte de data se vier junto com hora (ex: '2025-09-12 14:22:33' ou '2025-09-12T14:22:33')
                        if 'T' in s:
                            s = s.split('T')[0]
                        else:
                            s = s.split()[0]
                        parts = s.split('-')
                        if len(parts) == 3:
                            # transforma YYYY-MM-DD -> DD/MM/YYYY
                            reg['data'] = f"{parts[2]}/{parts[1]}/{parts[0]}"
                        else:
                            # fallback: deixa o que vier (sem hora, se possível)
                            reg['data'] = s
                except Exception:
                    # qualquer erro, pelo menos tenta deixar sem hora
                    reg['data'] = str(d).split()[0]
            else:
                reg['data'] = None

    finally:
        cur.close()
        conn.close()

    return render_template('calculo_nfs.html', estoques=registros, produtos=produtos)

# -------------------------
# Criar registro (criar_registro_calculo)
# -------------------------
@calculo_bp.route('/create', methods=['POST'])
@login_required
def criar_registro_calculo():
    id_produto = request.form.get('id_produto')
    quantidade_estoque = request.form.get('quantidade_estoque')

    if not id_produto:
        flash('Selecione um produto.', 'erro')
        return redirect(url_for('calculo_nfs.listar_calculo_nfs'))

    qtd = converter_numero_br_para_decimal(quantidade_estoque) if quantidade_estoque else None

    conn = conectar()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO calculo_nfs (id_produto, quantidade_estoque)
            VALUES (%s, %s)
            ON CONFLICT (id_produto) DO UPDATE
            SET quantidade_estoque = COALESCE(EXCLUDED.quantidade_estoque, calculo_nfs.quantidade_estoque)
        """, (int(id_produto), qtd))
        conn.commit()
        flash('Registro salvo.', 'sucesso')
    except Exception as e:
        conn.rollback()
        flash(f'Erro ao criar registro: {e}', 'erro')
    finally:
        cur.close()
        conn.close()

    return redirect(url_for('calculo_nfs.listar_calculo_nfs'))

# -------------------------
# Editar registro (editar_registro_calculo) - usado pelo JS via fetch
# -------------------------
@calculo_bp.route('/edit/<int:registro_id>', methods=['POST'])
@login_required
def editar_registro_calculo(registro_id):
    campos_esperados = [
        'id_produto', 'quantidade_estoque', 'qtd_cobre', 'qtd_zinco',
        'valor_total_nf', 'mao_de_obra', 'materia_prima',
        'custo_total_manual', 'custo_total'
    ]
    dados = {}
    for c in campos_esperados:
        raw = request.form.get(c)
        if raw is None:
            continue
        if c == 'id_produto':
            try:
                dados[c] = int(raw)
            except Exception:
                return ("ID do produto inválido", 400)
        else:
            num = converter_numero_br_para_decimal(raw)
            if raw != '' and num is None:
                return (f'Valor inválido para {c}', 400)
            dados[c] = num

    if not dados:
        return ('Nada para atualizar', 400)

    # verifica conflito unique (id_produto)
    if 'id_produto' in dados:
        conn = conectar()
        cur = conn.cursor()
        try:
            cur.execute("SELECT id FROM calculo_nfs WHERE id_produto = %s AND id <> %s", (dados['id_produto'], registro_id))
            if cur.fetchone():
                return ('Conflito: outro registro usa esse produto', 409)
        finally:
            cur.close()
            conn.close()

    # monta UPDATE dinâmico
    set_parts = []
    values = []
    for k, v in dados.items():
        set_parts.append(f"{k} = %s")
        values.append(v)
    values.append(registro_id)
    sql = f"UPDATE calculo_nfs SET {', '.join(set_parts)} WHERE id = %s"

    conn = conectar()
    cur = conn.cursor()
    try:
        cur.execute(sql, tuple(values))
        conn.commit()
        flash('Registro atualizado.', 'sucesso')
        return ('OK', 200)
    except Exception as e:
        conn.rollback()
        return (str(e), 500)
    finally:
        cur.close()
        conn.close()

# -------------------------
# Excluir individual (excluir_registro_calculo)
# -------------------------
@calculo_bp.route('/delete/<int:registro_id>', methods=['POST'])
@login_required
def excluir_registro_calculo(registro_id):
    conn = conectar()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM calculo_nfs WHERE id = %s", (registro_id,))
        conn.commit()
        flash('Registro excluído.', 'sucesso')
    except Exception as e:
        conn.rollback()
        flash(f'Erro ao excluir: {e}', 'erro')
    finally:
        cur.close()
        conn.close()
    return redirect(url_for('calculo_nfs.listar_calculo_nfs'))

# -------------------------
# Excluir selecionados (excluir_selecionados_calculo)
# -------------------------
@calculo_bp.route('/delete_selecionados', methods=['POST'])
@login_required
def excluir_selecionados_calculo():
    ids = request.form.getlist('estoque_ids')
    if not ids:
        flash('Nenhum registro selecionado.', 'erro')
        return redirect(url_for('calculo_nfs.listar_calculo_nfs'))
    try:
        ids_int = tuple(map(int, ids))
    except Exception:
        flash('IDs inválidos.', 'erro')
        return redirect(url_for('calculo_nfs.listar_calculo_nfs'))
    conn = conectar()
    cur = conn.cursor()
    try:
        sql = f"DELETE FROM calculo_nfs WHERE id IN ({','.join(['%s']*len(ids_int))})"
        cur.execute(sql, ids_int)
        conn.commit()
        flash(f'{cur.rowcount} registro(s) excluído(s).', 'sucesso')
    except Exception as e:
        conn.rollback()
        flash(f'Erro ao excluir registros: {e}', 'erro')
    finally:
        cur.close()
        conn.close()
    return redirect(url_for('calculo_nfs.listar_calculo_nfs'))

# -------------------------
# Atualizar custo manual (atualizar_custo_manual)
# -------------------------
@calculo_bp.route('/update_custo_manual', methods=['POST'])
@login_required
def atualizar_custo_manual():
    ids = request.form.getlist('estoque_ids')
    valor_raw = request.form.get('valor_custo_manual')
    if not ids or valor_raw is None:
        return ('Parâmetros inválidos', 400)
    valor = converter_numero_br_para_decimal(valor_raw)
    if valor is None:
        return ('Valor inválido', 400)
    conn = conectar()
    cur = conn.cursor()
    try:
        ids_int = tuple(map(int, ids))
        sql = f"UPDATE calculo_nfs SET custo_total_manual = %s WHERE id IN ({','.join(['%s']*len(ids_int))})"
        cur.execute(sql, (valor, *ids_int))
        conn.commit()
        flash('Custo manual atualizado.', 'sucesso')
        return ('OK', 200)
    except Exception as e:
        conn.rollback()
        return (str(e), 500)
    finally:
        cur.close()
        conn.close()

# -------------------------
# Distribuir quantidade (adicionar/subtrair) (distribuir_quantidade)
# -------------------------
@calculo_bp.route('/distribuir_quantidade', methods=['POST'])
@login_required
def distribuir_quantidade():
    """
    Versão simplificada: ajusta a quantidade no registro calculo_nfs correspondente ao produto.
    Recebe:
      - produto: pode ser ID (string numérica) ou nome do produto
      - valor: quantidade a adicionar/subtrair (formato BR ou pt)
      - operacao: 'Adicionar' ou 'Subtrair'
      - usuario: opcional (para histórico)
    """
    produto = request.form.get('produto')
    valor_raw = request.form.get('valor')
    operacao = request.form.get('operacao')
    usuario = request.form.get('usuario') or ''

    if not produto or not valor_raw or operacao not in ('Adicionar', 'Subtrair'):
        return ('Parâmetros inválidos', 400)

    valor = converter_numero_br_para_decimal(valor_raw)
    if valor is None:
        return ('Valor inválido', 400)

    conn = conectar()
    cur = conn.cursor()
    try:
        # tenta interpretar produto como ID, senão busca por nome
        id_produto = None
        try:
            id_produto = int(produto)
            cur.execute("SELECT id, nome FROM produtos WHERE id = %s", (id_produto,))
            prod_row = cur.fetchone()
        except Exception:
            cur.execute("SELECT id, nome FROM produtos WHERE LOWER(nome) = LOWER(%s) LIMIT 1", (produto,))
            prod_row = cur.fetchone()

        if not prod_row:
            return ('Produto não encontrado', 404)

        id_produto = prod_row[0]
        nome_produto = prod_row[1]

        # busca registro em calculo_nfs
        cur.execute("SELECT id, quantidade_estoque FROM calculo_nfs WHERE id_produto = %s", (id_produto,))
        row = cur.fetchone()

        if row:
            registro_id, qtd_atual = row[0], Decimal(row[1] or 0)
        else:
            registro_id, qtd_atual = None, Decimal('0')

        if operacao == 'Subtrair':
            if valor > qtd_atual:
                return (f'Quantidade a subtrair ({valor}) maior que disponível ({qtd_atual})', 400)
            nova_qtd = qtd_atual - valor
        else:  # Adicionar
            nova_qtd = qtd_atual + valor

        if registro_id:
            cur.execute("UPDATE calculo_nfs SET quantidade_estoque = %s WHERE id = %s", (nova_qtd, registro_id))
        else:
            cur.execute("INSERT INTO calculo_nfs (id_produto, quantidade_estoque) VALUES (%s, %s) RETURNING id", (id_produto, nova_qtd))
            registro_id = cur.fetchone()[0]

        # registra historico
        tipo = 'adicionar' if operacao == 'Adicionar' else 'subtrair'
        quantidade_trocada = (nova_qtd - qtd_atual) if operacao == 'Adicionar' else (qtd_atual - nova_qtd)
        if quantidade_trocada != 0:
            registrar_historico(usuario, None, nome_produto or id_produto, quantidade_trocada, tipo)

        conn.commit()
    except Exception as e:
        conn.rollback()
        return (f'Erro: {e}', 500)
    finally:
        cur.close()
        conn.close()

    return jsonify({'id_produto': id_produto, 'nova_quantidade': str(nova_qtd)}), 200


# -------------------------
# Calcular custo (calcular_custos)
# -------------------------
@calculo_bp.route('/calcular', methods=['POST'])
@login_required
def calcular_custos():
    ids = request.form.getlist('nf_ids')
    if not ids:
        return jsonify({'error': 'Nenhum id enviado'}), 400
    try:
        ids_int = tuple(map(int, ids))
    except ValueError:
        return jsonify({'error': 'IDs inválidos'}), 400

    conn = conectar()
    cur = conn.cursor()
    results = []
    try:
        sql = f"""
            SELECT id, valor_total_nf, mao_de_obra, materia_prima
            FROM calculo_nfs
            WHERE id IN ({','.join(['%s']*len(ids_int))})
        """
        cur.execute(sql, ids_int)
        rows = cur.fetchall()
        for row in rows:
            eid, valor_total_nf, mao_de_obra, materia_prima = row
            valor_total_nf = Decimal(valor_total_nf or 0)
            mao_de_obra = Decimal(mao_de_obra or 0)
            materia_prima = Decimal(materia_prima or 0)

            # Prioriza custo_total_manual se informado
            cur.execute("SELECT custo_total_manual FROM calculo_nfs WHERE id = %s", (eid,))
            cm = cur.fetchone()
            custo_manual = Decimal(cm[0]) if cm and cm[0] is not None else None

            if custo_manual and custo_manual > 0:
                custo_total = custo_manual
            else:
                custo_total = valor_total_nf + mao_de_obra + materia_prima

            cur.execute("UPDATE calculo_nfs SET custo_total = %s WHERE id = %s", (custo_total, eid))
            results.append({'id': eid, 'custo_total': str(custo_total)})
        conn.commit()
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()
        conn.close()

    return jsonify({'processed': len(results), 'results': results}), 200

# -------------------------
# Exportar para Excel (exportar_relatorio)
# -------------------------
@calculo_bp.route('/export', methods=['GET'])
@login_required
def exportar_relatorio():
    produto = request.args.get('produto')

    where = []
    params = []

    if produto:
        where.append("LOWER(p.nome) ILIKE LOWER(%s)")
        params.append(f"%{produto}%")

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    query = f"""
        SELECT p.id, p.nome,
               cn.quantidade_estoque, cn.qtd_cobre, cn.qtd_zinco,
               cn.valor_total_nf, cn.mao_de_obra, cn.materia_prima,
               cn.custo_total_manual, cn.custo_total
        FROM produtos p
        LEFT JOIN calculo_nfs cn ON p.id = cn.id_produto
        {where_sql}
        ORDER BY LOWER(p.nome) ASC
    """

    conn = conectar()
    cur = conn.cursor()
    try:
        cur.execute(query, tuple(params))
        dados = cur.fetchall()
    except Exception as e:
        cur.close()
        conn.close()
        flash(f'Erro na consulta: {e}', 'erro')
        return redirect(url_for('calculo_nfs.listar_calculo_nfs'))
    finally:
        cur.close()
        conn.close()

    colunas = ["ProdutoID", "Produto", "Qtd Estoque", "Qtd Cobre", "Qtd Zinco",
               "Valor Total NF", "Mão de Obra", "Matéria Prima", "Custo Manual", "Custo Total"]
    df = pd.DataFrame(dados, columns=colunas)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df.to_excel(writer, index=False, sheet_name='Relatorio')
    output.seek(0)
    return send_file(output,
                     as_attachment=True,
                     download_name='Relatorio_calculo_produto.xlsx',
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

# -------------------------
# Reiniciar IDs (reiniciar_ids_calculo)
# -------------------------
@calculo_bp.route('/reiniciar_ids', methods=['POST'])
@login_required
def reiniciar_ids_calculo():
    conn = conectar()
    cur = conn.cursor()
    try:
        cur.execute("""
            WITH OrderedProducts AS (
                SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS new_id
                FROM calculo_nfs
            )
            UPDATE calculo_nfs cn
            SET id = op.new_id
            FROM OrderedProducts op
            WHERE cn.id = op.id
        """)
        cur.execute("SELECT setval(pg_get_serial_sequence('calculo_nfs', 'id'), (SELECT COALESCE(MAX(id),1) FROM calculo_nfs), true);")
        conn.commit()
        flash('IDs reiniciados com sucesso.', 'sucesso')
    except Exception as e:
        conn.rollback()
        flash(f'Erro reiniciando IDs: {e}', 'erro')
    finally:
        cur.close()
        conn.close()
    return redirect(url_for('calculo_nfs.listar_calculo_nfs'))
