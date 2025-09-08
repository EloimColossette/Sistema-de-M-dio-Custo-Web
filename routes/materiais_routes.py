from flask import Blueprint, render_template, request, redirect, url_for, flash, session, send_file
from routes.auth_routes import login_required
from conexao_db import conectar
import pandas as pd
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle
from reportlab.lib import colors
import io

materiais_bp = Blueprint('materiais', __name__)
conexao = conectar()
cursor = conexao.cursor()

@materiais_bp.route('/materiais')
@login_required
def materiais():
    """Lista todos os materiais e exibe link para criar, editar e excluir."""
    cursor.execute("""
        SELECT m.id, m.nome, f.nome AS fornecedor, m.valor, m.grupo
        FROM materiais m
        JOIN fornecedores f ON m.fornecedor_id = f.id
        ORDER BY LOWER(m.nome) ASC
    """)
    rows = cursor.fetchall()
    materiais_list = [
        dict(id=row[0], nome=row[1], fornecedor=row[2], valor=row[3], grupo=row[4])
        for row in rows
    ]
    # Também busca todos os fornecedores para popular o select de novo material
    cursor.execute("SELECT id, nome FROM fornecedores ORDER BY LOWER(nome) ASC")
    fornecedores_list = [dict(id=r[0], nome=r[1]) for r in cursor.fetchall()]
    return render_template('materiais.html',
                           materiais=materiais_list,
                           fornecedores=fornecedores_list)

@materiais_bp.route('/materiais/create', methods=['POST'])
@login_required
def create_material():
    nome           = request.form['nome_material'].strip()
    fornecedor_id  = request.form.get('fornecedor_sel')
    valor_str      = request.form['valor_material'].strip()
    grupo          = request.form.get('grupo_material')

    # 1) Validações básicas
    if not nome or not fornecedor_id or not valor_str or not grupo:
        flash('Preencha todos os campos de material.', 'erro')
        return redirect(url_for('materiais.materiais'))

    # 2) Converter valor para float
    try:
        valor = float(valor_str.replace(',', '.'))
    except ValueError:
        flash('Valor inválido: use apenas números e ponto ou vírgula.', 'erro')
        return redirect(url_for('materiais.materiais'))

    # 3) Verificar grupo
    if grupo not in ['Cobre', 'Zinco', 'Sucata']:
        flash('Grupo inválido.', 'erro')
        return redirect(url_for('materiais.materiais'))

    try:
        # 4) Encontrar o menor ID livre
        cursor.execute("""
            SELECT MIN(g.id) AS next_id
            FROM (
              SELECT generate_series(1, COALESCE(MAX(id),0) + 1) AS id
              FROM materiais
            ) AS g
            LEFT JOIN materiais m ON m.id = g.id
            WHERE m.id IS NULL
        """)
        next_id = cursor.fetchone()[0]

        # 5) Inserir especificando o ID encontrado
        cursor.execute(
            "INSERT INTO materiais (id, nome, fornecedor_id, valor, grupo) VALUES (%s,%s,%s,%s,%s)",
            (next_id, nome, fornecedor_id, valor, grupo)
        )

        # 6) Atualizar sequence para não gerar conflito futuro
        cursor.execute("""
            SELECT setval(
              pg_get_serial_sequence('materiais','id'),
              GREATEST((SELECT MAX(id) FROM materiais),
                       nextval(pg_get_serial_sequence('materiais','id'))),
              false
            )
        """)

        conexao.commit()
        flash(f'Material criado com sucesso!', 'sucesso')

    except Exception as e:
        conexao.rollback()
        flash('Erro ao criar material.', 'erro')

    return redirect(url_for('materiais.materiais'))

@materiais_bp.route('/materiais/edit/<int:mat_id>', methods=['POST'])
@login_required
def edit_material(mat_id):
    nome       = request.form[f'nome_material_{mat_id}'].strip()
    fornecedor_id = request.form.get(f'fornecedor_sel_{mat_id}')
    valor_str  = request.form[f'valor_material_{mat_id}'].strip()
    grupo      = request.form.get(f'grupo_material_{mat_id}')

    # 1) Validações
    if not nome or not fornecedor_id or not valor_str or not grupo:
        flash('Preencha todos os campos de edição do material.', 'erro')
        return redirect(url_for('materiais.materiais'))

    try:
        valor = float(valor_str.replace(',', '.'))
    except ValueError:
        flash('Valor inválido.', 'erro')
        return redirect(url_for('materiais.materiais'))

    if grupo not in ['Cobre', 'Zinco', 'Sucata']:
        flash('Grupo inválido.', 'erro')
        return redirect(url_for('materiais.materiais'))

    try:
        cursor.execute("""
            UPDATE materiais
               SET nome=%s, fornecedor_id=%s, valor=%s, grupo=%s
             WHERE id=%s
        """, (nome, fornecedor_id, valor, grupo, mat_id))
        conexao.commit()
        flash('Material atualizado com sucesso.', 'sucesso')
    except Exception as e:
        conexao.rollback()
        flash('Erro ao atualizar material.', 'erro')

    return redirect(url_for('materiais.materiais'))

@materiais_bp.route('/materiais/delete/<int:mat_id>', methods=['POST'])
@login_required
def delete_material(mat_id):
    try:
        cursor.execute("DELETE FROM materiais WHERE id = %s", (mat_id,))
        conexao.commit()
        flash('Material excluído com sucesso.', 'sucesso')
    except Exception as e:
        conexao.rollback()
        flash('Erro ao excluir material.', 'erro')
    return redirect(url_for('materiais.materiais'))

@materiais_bp.route('/materiais/delete_selecionados', methods=['POST'])
@login_required
def delete_selecionados_materiais():
    ids = request.form.getlist('material_ids')
    if not ids:
        flash('Nenhum material selecionado.', 'erro')
        return redirect(url_for('materiais.materiais'))
    try:
        ids_int = tuple(map(int, ids))
        sql = f"DELETE FROM materiais WHERE id IN ({','.join(['%s']*len(ids_int))})"
        cursor.execute(sql, ids_int)
        conexao.commit()
        flash(f"{cursor.rowcount} material(is) excluído(s).", 'sucesso')
    except Exception:
        conexao.rollback()
        flash('Erro ao excluir materiais.', 'erro')
    return redirect(url_for('materiais.materiais'))

@materiais_bp.route('/materiais/export/excel')
@login_required
def exportar_materiais_excel():
    # Busca dados
    cursor.execute("""
        SELECT m.nome, f.nome AS fornecedor, m.valor, m.grupo
        FROM materiais m
        JOIN fornecedores f ON m.fornecedor_id = f.id
        ORDER BY LOWER(m.nome) ASC
    """)
    rows = cursor.fetchall()

    # Monta DataFrame
    df = pd.DataFrame(rows, columns=['Nome', 'Fornecedor', 'Valor', 'Grupo'])

    # Converte para Excel na memória
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df.to_excel(writer, index=False, sheet_name='Materiais')
        # NÃO chame writer.save() aqui

    output.seek(0)
    return send_file(
        output,
        as_attachment=True,
        download_name='materiais.xlsx',
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

@materiais_bp.route('/materiais/export/pdf')
@login_required
def exportar_materiais_pdf():
    # Busca dados
    cursor.execute("""
        SELECT m.nome, f.nome AS fornecedor, 
               to_char(m.valor, 'FM9999990.0000') AS valor, 
               m.grupo
        FROM materiais m
        JOIN fornecedores f ON m.fornecedor_id = f.id
        ORDER BY LOWER(m.nome) ASC
    """)
    rows = cursor.fetchall()
    # Cria buffer PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=(595, 842))  # A4 portrait
    # Monta tabela (inclui header)
    data = [['Nome', 'Fornecedor', 'Valor', 'Grupo']] + [list(r) for r in rows]
    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f8f9fa')),
        ('GRID'      , (0,0), (-1,-1), 0.5, colors.grey),
        ('FONTNAME'  , (0,0), (-1,0), 'Helvetica-Bold'),
        ('ALIGN'     , (2,1), (2,-1), 'RIGHT'),  # alinha coluna Valor
        ('VALIGN'    , (0,0), (-1,-1), 'MIDDLE'),
    ]))
    doc.build([table])
    buffer.seek(0)
    return send_file(
        buffer,
        as_attachment=True,
        download_name='materiais.pdf',
        mimetype='application/pdf'
    )
