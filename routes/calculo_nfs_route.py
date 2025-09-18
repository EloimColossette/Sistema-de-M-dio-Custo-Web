from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, send_file
from routes.auth_routes import login_required
from conexao_db import conectar
from decimal import Decimal
import io
import pandas as pd

calculo_bp = Blueprint('calculo_nfs', __name__, url_prefix='/calculo_nfs')

def converter_numero_br_para_decimal(valor):
    if valor is None:
        return None
    s = str(valor).strip()
    if s == '':
        return None
    s = s.replace(' ', '')
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
    Tenta gravar histórico, mas silencia erro quando a tabela calculo_historico não existe
    (útil durante testes). Outros erros serão logados.
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
        try:
            cur.execute("SELECT pg_notify('historico_atualizado', 'novo');")
            conn.commit()
        except Exception:
            pass
    except Exception as e:
        conn.rollback()
        # se a tabela não existir, suprimir o erro para não atrapalhar testes
        msg = str(e).lower()
        if 'calculo_historico' in msg or 'relation "calculo_historico" does not exist' in msg:
            # silenciar (opcionalmente logar em debug)
            # print("Tabela calculo_historico não existe — histórico ignorado durante testes.")
            pass
        else:
            print("Erro ao gravar histórico:", e)
    finally:
        cur.close()
        conn.close()

def sincronizar_estoque_por_entrada():
    """
    Cada linha da entrada_nf vira uma linha em calculo_nfs com a mesma quantidade do peso_liquido.
    NÃO sobrescreve quantidade_estoque já existente — apenas insere novas linhas ou preenche NULL.
    """
    conn = conectar()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT en.id AS entrada_id, en.peso_liquido
            FROM entrada_nf en
            WHERE en.peso_liquido IS NOT NULL
        """)
        rows = cur.fetchall()

        for entrada_id, peso in rows:
            if peso is None:
                continue
            peso_dec = Decimal(str(peso))

            # Insere se não existir; se existir, atualiza apenas se quantidade_estoque IS NULL
            cur.execute("""
                INSERT INTO calculo_nfs (entrada_id, quantidade_estoque)
                VALUES (%s, %s)
                ON CONFLICT (entrada_id) DO UPDATE
                SET quantidade_estoque = CASE
                    WHEN calculo_nfs.quantidade_estoque IS NULL THEN EXCLUDED.quantidade_estoque
                    ELSE calculo_nfs.quantidade_estoque
                END
            """, (entrada_id, peso_dec))

        conn.commit()
    except Exception as e:
        conn.rollback()
        print("Erro sincronizar_estoque_por_entrada:", e)
    finally:
        cur.close()
        conn.close()


@calculo_bp.route('/', methods=['GET'])
@login_required
def listar_calculo_nfs():
    try:
        sincronizar_estoque_por_entrada()
    except Exception as e:
        print("Aviso: falha na sincronização automática de estoque:", e)

    conn = conectar()
    cur = conn.cursor()
    try:
        # Dados do estoque
        cur.execute("""
            SELECT
                en.id AS entrada_id,
                en.data AS entrada_data,
                en.nf AS entrada_nf,
                en.produto AS entrada_produto,
                en.peso_liquido AS peso_liquido,
                cn.id AS calculo_id,
                COALESCE(cn.quantidade_estoque, 0) AS quantidade_estoque,
                cn.qtd_cobre, cn.qtd_zinco,
                cn.valor_total_nf, cn.mao_de_obra, cn.materia_prima,
                cn.custo_total_manual, cn.custo_total
            FROM entrada_nf en
            LEFT JOIN calculo_nfs cn ON cn.entrada_id = en.id
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
                'id': r[5],
                'quantidade_estoque': r[6],
                'qtd_cobre': r[7],
                'qtd_zinco': r[8],
                'valor_total_nf': r[9],
                'mao_de_obra': r[10],
                'materia_prima': r[11],
                'custo_total_manual': r[12],
                'custo_total': r[13],
            })

        # Formata datas
        for reg in registros:
            d = reg.get('data')
            if d:
                try:
                    if hasattr(d, 'strftime'):
                        reg['data'] = d.strftime('%d/%m/%Y')
                    else:
                        s = str(d).split('T')[0].split()[0]
                        parts = s.split('-')
                        if len(parts) == 3:
                            reg['data'] = f"{parts[2]}/{parts[1]}/{parts[0]}"
                        else:
                            reg['data'] = s
                except Exception:
                    reg['data'] = str(d).split()[0]
            else:
                reg['data'] = None

        # Lista de produtos para dropdown: pega somente produtos únicos da entrada_nf
        cur.execute("""
            SELECT DISTINCT ON (produto) id, produto
            FROM entrada_nf
            ORDER BY produto ASC
        """)
        produtos_dropdown = [{'id': row[0], 'nome': row[1]} for row in cur.fetchall()]

    finally:
        cur.close()
        conn.close()

    return render_template('calculo_nfs.html', estoques=registros, produtos=produtos_dropdown)

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

@calculo_bp.route('/distribuir_quantidade', methods=['POST'])
@login_required
def distribuir_quantidade():
    produto = request.form.get('produto')          # pode ser nome do produto ou id da entrada
    valor_raw = request.form.get('valor')
    operacao = request.form.get('operacao')
    usuario = request.form.get('usuario') or ''

    if not produto or not valor_raw or operacao not in ('Adicionar', 'Subtrair'):
        return ('Parâmetros inválidos', 400)

    valor = converter_numero_br_para_decimal(valor_raw)
    if valor is None or valor <= 0:
        return ('Valor inválido', 400)

    conn = conectar()
    cur = conn.cursor()
    try:
        # DEBUG: remover em produção se quiser
        print("distribuir_quantidade: produto param recebido ->", repr(produto), "valor ->", valor, "operacao ->", operacao)

        # Decide se 'produto' é um id de entrada (entrada_nf.id) ou um nome
        filtro_por_entrada_id = False
        entrada_id_val = None
        try:
            entrada_id_val = int(produto)
            filtro_por_entrada_id = True
        except Exception:
            filtro_por_entrada_id = False

        # Busca registros de calculo_nfs juntando com entrada_nf dependendo do filtro
        if operacao == 'Subtrair':
            if filtro_por_entrada_id:
                cur.execute("""
                    SELECT cn.id, cn.quantidade_estoque, en.peso_liquido, en.id AS entrada_id, en.produto
                    FROM calculo_nfs cn
                    JOIN entrada_nf en ON cn.entrada_id = en.id
                    WHERE en.id = %s
                    ORDER BY en.data ASC NULLS LAST, en.id ASC
                """, (entrada_id_val,))
            else:
                # busca por nome do produto (case-insensitive)
                cur.execute("""
                    SELECT cn.id, cn.quantidade_estoque, en.peso_liquido, en.id AS entrada_id, en.produto
                    FROM calculo_nfs cn
                    JOIN entrada_nf en ON cn.entrada_id = en.id
                    WHERE LOWER(en.produto) = LOWER(%s)
                    ORDER BY en.data ASC NULLS LAST, en.id ASC
                """, (produto,))
        else:  # Adicionar
            if filtro_por_entrada_id:
                cur.execute("""
                    SELECT cn.id, cn.quantidade_estoque, en.peso_liquido, en.id AS entrada_id, en.produto
                    FROM calculo_nfs cn
                    JOIN entrada_nf en ON cn.entrada_id = en.id
                    WHERE en.id = %s
                    ORDER BY en.data DESC NULLS LAST, en.id DESC
                """, (entrada_id_val,))
            else:
                cur.execute("""
                    SELECT cn.id, cn.quantidade_estoque, en.peso_liquido, en.id AS entrada_id, en.produto
                    FROM calculo_nfs cn
                    JOIN entrada_nf en ON cn.entrada_id = en.id
                    WHERE LOWER(en.produto) = LOWER(%s)
                    ORDER BY en.data DESC NULLS LAST, en.id DESC
                """, (produto,))

        registros = cur.fetchall()
        if not registros:
            return ('Nenhum registro encontrado para esse produto/entrada', 404)

        valor_restante = Decimal(str(valor))
        total_alterado = Decimal('0')
        detalhes = []

        for r in registros:
            cn_id = r[0]
            qtd_atual = Decimal(r[1] or 0)
            peso_liq = Decimal(r[2] or 0)
            entrada_id = r[3]
            nome_from_entry = r[4]  # produto conforme entrada_nf

            if operacao == 'Subtrair':
                if valor_restante <= 0:
                    break
                dec = min(valor_restante, qtd_atual)
                if dec <= 0:
                    continue
                nova_qtd = qtd_atual - dec
                cur.execute("UPDATE calculo_nfs SET quantidade_estoque = %s WHERE id = %s", (nova_qtd, cn_id))
                total_alterado += dec
                valor_restante -= dec
                detalhes.append({'cn_id': cn_id, 'entrada_id': entrada_id, 'alterado': str(dec), 'qtd_anterior': str(qtd_atual), 'qtd_nova': str(nova_qtd)})
            else:  # Adicionar
                limite = peso_liq - qtd_atual
                if limite <= 0:
                    # não é possível adicionar nessa entrada (atingiu peso_liquido)
                    detalhes.append({'cn_id': cn_id, 'entrada_id': entrada_id, 'alterado': '0', 'motivo': 'limite atingido', 'qtd_atual': str(qtd_atual), 'peso_liq': str(peso_liq)})
                    continue
                dec = min(valor_restante, limite)
                if dec <= 0:
                    continue
                nova_qtd = qtd_atual + dec
                cur.execute("UPDATE calculo_nfs SET quantidade_estoque = %s WHERE id = %s", (nova_qtd, cn_id))
                total_alterado += dec
                valor_restante -= dec
                detalhes.append({'cn_id': cn_id, 'entrada_id': entrada_id, 'alterado': str(dec), 'qtd_anterior': str(qtd_atual), 'qtd_nova': str(nova_qtd), 'peso_liq': str(peso_liq)})

        if total_alterado > 0:
            # usa o nome do produto baseado na primeira entrada retornada (se houver)
            produto_para_historico = registros[0][4] if registros and registros[0] and registros[0][4] else (produto if not filtro_por_entrada_id else f'entrada_id:{entrada_id_val}')
            tipo = 'adicionar' if operacao == 'Adicionar' else 'subtrair'
            registrar_historico(usuario, None, produto_para_historico, total_alterado, tipo)

        conn.commit()
    except Exception as e:
        conn.rollback()
        print("Erro em distribuir_quantidade:", e)
        return (f'Erro: {e}', 500)
    finally:
        cur.close()
        conn.close()

    return jsonify({
        'quantidade_total_alterada': str(total_alterado),
        'detalhes': detalhes
    }), 200

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
