from flask import Blueprint, render_template, request, redirect, url_for, flash, session, send_file
from routes.auth_routes import login_required
from conexao_db import conectar
import pandas as pd
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle
from reportlab.lib import colors
import io

produtos_bp = Blueprint('produtos', __name__)
conexao = conectar()
cursor = conexao.cursor()

@produtos_bp.route('/produtos')
@login_required
def produtos():
    cursor.execute('SELECT id, nome, percentual_cobre, percentual_zinco FROM produtos ORDER BY id')
    produtos = cursor.fetchall()
    return render_template('produtos.html', produtos=[
        {'id': p[0], 'nome': p[1], 'percentual_cobre': p[2], 'percentual_zinco': p[3]}
        for p in produtos
    ])

@produtos_bp.route('/produtos/create', methods=['POST'])
@login_required
def create_produto():
    nome    = request.form['nome_produto'].strip()
    pc_raw  = request.form['pc_cobre'].replace('%', '').replace(',', '.').strip()
    pz_raw  = request.form['pc_zinco'].replace('%', '').replace(',', '.').strip()

    # Validações básicas
    if not nome or not pc_raw or not pz_raw:
        flash('Preencha todos os campos de produto.', 'erro')
        return redirect(url_for('produtos.produtos'))

    try:
        pc = float(pc_raw)
        pz = float(pz_raw)
    except ValueError:
        flash('Percentual inválido.', 'erro')
        return redirect(url_for('produtos.produtos'))

    try:
        # 1) Descobre o menor id livre em produtos
        cursor.execute("""
            SELECT MIN(g.id) AS next_id
            FROM (
              SELECT generate_series(1, COALESCE(MAX(id),0) + 1) AS id
              FROM produtos
            ) AS g
            LEFT JOIN produtos p ON p.id = g.id
            WHERE p.id IS NULL
        """)
        next_id = cursor.fetchone()[0]

        # 2) Insere com id explícito
        cursor.execute(
            "INSERT INTO produtos (id, nome, percentual_cobre, percentual_zinco) VALUES (%s, %s, %s, %s)",
            (next_id, nome, pc, pz)
        )

        # 3) Sincroniza a sequence para evitar futuros conflitos
        cursor.execute("""
            SELECT setval(
              pg_get_serial_sequence('produtos','id'),
              GREATEST((SELECT MAX(id) FROM produtos),
                       nextval(pg_get_serial_sequence('produtos','id'))),
              false
            )
        """)

        conexao.commit()
        flash(f'Produto criado com sucesso!', 'sucesso')
    except Exception as e:
        conexao.rollback()
        flash('Erro ao criar produto.', 'erro')
    return redirect(url_for('produtos.produtos'))

@produtos_bp.route('/produtos/edit/<int:prod_id>', methods=['POST'])
@login_required
def edit_produto(prod_id):
    nome = request.form[f'nome_{prod_id}'] if f'nome_{prod_id}' in request.form else None
    # Função auxiliar para converter valor formatado tipo '60,5%' para float
    def parse_percent(val):
        if not val:
            return None
        try:
            return float(val.replace('%', '').replace(',', '.').strip())
        except ValueError:
            return None  # ou trate de outra forma, como lançar erro ou registrar log

    pc_raw = request.form.get(f'pc_cobre_{prod_id}')
    pz_raw = request.form.get(f'pc_zinco_{prod_id}')

    pc = parse_percent(pc_raw)
    pz = parse_percent(pz_raw)
    try:
        cursor.execute(
            'UPDATE produtos SET nome=%s, percentual_cobre=%s, percentual_zinco=%s WHERE id=%s',
            (nome, float(pc), float(pz), prod_id)
        )
        conexao.commit()
        flash('Produto atualizado com sucesso.', 'sucesso')
    except Exception as e:
        conexao.rollback()
        flash(f'Erro ao atualizar produto: {e}', 'erro')
    return redirect(url_for('produtos.produtos'))

@produtos_bp.route('/produtos/delete/<int:prod_id>', methods=['POST'])
@login_required
def delete_produto(prod_id):
    try:
        cursor.execute("DELETE FROM produtos WHERE id = %s", (prod_id,))
        conexao.commit()
        flash('Produto excluído com sucesso.', 'sucesso')
    except Exception:
        conexao.rollback()
        flash('Erro ao excluir produto.', 'erro')
    return redirect(url_for('produtos.produtos'))

@produtos_bp.route('/produtos/delete_selecionados', methods=['POST'])
@login_required
def delete_selecionados_produtos():
    ids = request.form.getlist('produto_ids')
    if not ids:
        flash('Nenhum produto selecionado.', 'erro')
        return redirect(url_for('produtos.produtos'))

    try:
        ids_int = tuple(map(int, ids))  # converte para tupla de inteiros
        placeholders = ','.join(['%s'] * len(ids_int))
        query = f"DELETE FROM produtos WHERE id IN ({placeholders})"
        cursor.execute(query, ids_int)
        conexao.commit()
        flash(f"{cursor.rowcount} produto(s) excluído(s).", 'sucesso')
    except Exception as e:
        conexao.rollback()
        flash(f'Erro ao excluir produtos: {e}', 'erro')

    return redirect(url_for('produtos.produtos'))

@produtos_bp.route('/produtos/export/excel')
@login_required
def export_produtos_excel():
    cursor.execute("""
        SELECT nome, percentual_cobre, percentual_zinco 
        FROM produtos 
        ORDER BY LOWER(nome) ASC
    """)
    rows = cursor.fetchall()
    df = pd.DataFrame(rows, columns=['Nome', '% Cobre', '% Zinco'])

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df.to_excel(writer, index=False, sheet_name='Produtos')
    output.seek(0)

    return send_file(
        output,
        as_attachment=True,
        download_name='produtos.xlsx',
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

@produtos_bp.route('/produtos/export/pdf')
@login_required
def export_produtos_pdf():
    cursor.execute("""
        SELECT nome, 
               to_char(percentual_cobre, 'FM999990.00') AS cobre,
               to_char(percentual_zinco, 'FM999990.00') AS zinco
        FROM produtos 
        ORDER BY LOWER(nome) ASC
    """)
    rows = cursor.fetchall()
    data = [['Nome', '% Cobre', '% Zinco']] + [list(r) for r in rows]

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=(595, 842))
    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f8f9fa')),
        ('GRID'      , (0,0), (-1,-1), 0.5, colors.grey),
        ('FONTNAME'  , (0,0), (-1,0), 'Helvetica-Bold'),
        ('ALIGN'     , (1,1), (-1,-1), 'RIGHT'),
        ('VALIGN'    , (0,0), (-1,-1), 'MIDDLE'),
    ]))
    doc.build([table])
    buffer.seek(0)

    return send_file(
        buffer,
        as_attachment=True,
        download_name='produtos.pdf',
        mimetype='application/pdf'
    )
