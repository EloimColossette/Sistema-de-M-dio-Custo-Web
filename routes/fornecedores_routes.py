from flask import Blueprint, render_template, request, redirect, url_for, flash, session, send_file
from routes.auth_routes import login_required
from conexao_db import conectar

fornecedores_bp = Blueprint('fornecedores', __name__)
conexao = conectar()
cursor = conexao.cursor()


@fornecedores_bp.route('/fornecedores')
@login_required
def fornecedores():
    """Lista todos os fornecedores."""
    cursor.execute("SELECT id, nome FROM fornecedores ORDER BY nome")
    rows = cursor.fetchall()
    fornecedores_list = [dict(id=row[0], nome=row[1]) for row in rows]
    return render_template('fornecedores.html', fornecedores=fornecedores_list)

@fornecedores_bp.route('/fornecedores/create', methods=['POST'])
@login_required
def create_fornecedor():
    nome = request.form['nome_fornecedor'].strip()
    if not nome:
        flash('Informe o nome do fornecedor.', 'erro')
        return redirect(url_for('fornecedores.fornecedores'))

    # Verifica duplicado
    cursor.execute("SELECT 1 FROM fornecedores WHERE nome ILIKE %s", (nome,))
    if cursor.fetchone():
        flash('Este fornecedor já existe.', 'erro')
        return redirect(url_for('fornecedores.fornecedores'))

    try:
        # 1) Encontra o menor ID livre (gaps) — utiliza generate_series para gerar de 1 até MAX(id)+1:
        cursor.execute("""
            SELECT MIN(g.id) AS next_id
            FROM (
              SELECT generate_series(1, COALESCE(MAX(id),0) + 1) AS id
              FROM fornecedores
            ) AS g
            LEFT JOIN fornecedores f ON f.id = g.id
            WHERE f.id IS NULL
        """)
        next_id = cursor.fetchone()[0]

        # 2) Insere especificando o ID encontrado
        cursor.execute(
            "INSERT INTO fornecedores (id, nome) VALUES (%s, %s)",
            (next_id, nome)
        )
        # 3) Se você estiver usando uma SEQUENCE (e.g. SERIAL/IDENTITY),
        #    atualize-a para não gerar conflitos futuros:
        cursor.execute("""
            SELECT setval(pg_get_serial_sequence('fornecedores','id'),
                          GREATEST((SELECT MAX(id) FROM fornecedores), nextval(pg_get_serial_sequence('fornecedores','id'))))
        """)
        conexao.commit()
        flash(f'Fornecedor criado com sucesso!', 'sucesso')

    except Exception as e:
        conexao.rollback()
        flash('Erro ao criar fornecedor.', 'erro')

    return redirect(url_for('fornecedores.fornecedores'))

@fornecedores_bp.route('/fornecedores/edit/<int:forn_id>', methods=['POST'])
@login_required
def edit_fornecedor(forn_id):
    novo_nome = request.form[f'nome_fornecedor_{forn_id}'].strip()
    if not novo_nome:
        flash('O nome do fornecedor não pode ficar vazio.', 'erro')
        return redirect(url_for('fornecedores.fornecedores'))

    # Verifica duplicado em outro ID
    cursor.execute("SELECT id FROM fornecedores WHERE nome ILIKE %s AND id <> %s", (novo_nome, forn_id))
    if cursor.fetchone():
        flash('Já existe outro fornecedor com esse nome.', 'erro')
        return redirect(url_for('fornecedores.fornecedores'))

    try:
        cursor.execute("UPDATE fornecedores SET nome = %s WHERE id = %s", (novo_nome, forn_id))
        conexao.commit()
        flash('Fornecedor atualizado com sucesso.', 'sucesso')
    except Exception as e:
        conexao.rollback()
        flash('Erro ao atualizar fornecedor.', 'erro')
    return redirect(url_for('fornecedores.fornecedores'))

@fornecedores_bp.route('/fornecedores/delete/<int:forn_id>', methods=['POST'])
@login_required
def delete_fornecedor(forn_id):
    # Verifica se existe algum material atrelado a esse fornecedor
    cursor.execute("SELECT 1 FROM materiais WHERE fornecedor_id = %s LIMIT 1", (forn_id,))
    if cursor.fetchone():
        flash('Não é possível excluir: existem materiais vinculados a este fornecedor.', 'erro')
        return redirect(url_for('fornecedores.fornecedores'))

    try:
        cursor.execute("DELETE FROM fornecedores WHERE id = %s", (forn_id,))
        conexao.commit()
        flash('Fornecedor excluído com sucesso.', 'sucesso')
    except Exception as e:
        conexao.rollback()
        flash('Erro ao excluir fornecedor.', 'erro')
    return redirect(url_for('fornecedores.fornecedores'))

@fornecedores_bp.route('/fornecedores/delete_selecionados', methods=['POST'])
@login_required
def delete_selecionados_fornecedores():
    # Pega lista de IDs vindos dos checkboxes name="fornecedor_ids"
    ids = request.form.getlist('fornecedor_ids')
    if not ids:
        flash('Nenhum fornecedor selecionado.', 'erro')
        return redirect(url_for('fornecedores.fornecedores'))

    try:
        # Converte para tupla de inteiros e apaga todos de uma vez
        ids_int = tuple(map(int, ids))
        placeholders = ','.join(['%s'] * len(ids_int))
        query = f"DELETE FROM fornecedores WHERE id IN ({placeholders})"
        cursor.execute(query, ids_int)
        conexao.commit()
        flash(f"{cursor.rowcount} fornecedor(es) excluído(s) com sucesso.", 'sucesso')
    except Exception as e:
        conexao.rollback()
        print("Erro ao excluir fornecedores em massa:", e)
        flash('Erro ao excluir fornecedores.', 'erro')

    return redirect(url_for('fornecedores.fornecedores'))

