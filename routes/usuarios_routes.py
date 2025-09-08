from flask import Blueprint, render_template, request, redirect, url_for, flash, session
from math import ceil
from routes.auth_routes import login_required
from conexao_db import conectar
import re
import bcrypt

usuarios_bp = Blueprint('usuarios', __name__)
conexao = conectar()
cursor = conexao.cursor()

# JANELA USUARIO
@usuarios_bp.route('/usuarios')
@login_required
def usuarios():
    # 1) Parâmetros da query string:
    search = request.args.get('q', '').strip()    # texto digitado
    status = request.args.get('status', '')       # "" | "1" (ativos) | "0" (inativos)
    page   = int(request.args.get('page', 1))
    per_page = 10

    # 2) Se houver texto, prepare o padrão "%texto%"
    like = f"%{search}%"

    # 3) Montagem dinâmica de WHERE
    where_clauses = []
    params = []

    if search:
        # (a) Buscar em first_name
        where_clauses.append("first_name ILIKE %s")
        params.append(like)
        # (b) Ou em last_name
        where_clauses.append("last_name ILIKE %s")
        params.append(like)
        # (c) Ou em email
        where_clauses.append("email ILIKE %s")
        params.append(like)
        # (d) Ou na concatenação "first_name || ' ' || last_name"
        where_clauses.append("(first_name || ' ' || last_name) ILIKE %s")
        params.append(like)

        # Juntaremos todas essas condições com OR, mas para isso
        # vamos encapsular dentro de um parêntese único:
        # ( first_name ILIKE %s OR last_name ILIKE %s OR … )
        or_block = " OR ".join(where_clauses[-4:])
        where_clauses = [f"({or_block})"]  # substitui pelos 4 anteriores
        # e params já estão com 4 entradas de “like”
    # Se search == "", não adicionamos esse bloco

    # 4) Filtrar por status (ativos/inativos)
    if status == "1":      # só ativos
        where_clauses.append("ativo = TRUE")
    elif status == "0":    # só inativos
        where_clauses.append("ativo = FALSE")

    # 5) Combine tudo em uma cláusula final de WHERE
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)
    else:
        where_sql = ""   # sem filtro

    # 6) Consulta paginada
    offset = (page - 1) * per_page
    sql_list = f"""
      SELECT id, first_name, last_name, email, ativo
      FROM usuarios
      {where_sql}
      ORDER BY first_name
      LIMIT %s OFFSET %s
    """
    # Adicione LIMIT e OFFSET no final dos parâmetros
    params_list = params + [per_page, offset]
    cursor.execute(sql_list, tuple(params_list))
    rows = cursor.fetchall()

    cols = [col[0] for col in cursor.description]
    users = [dict(zip(cols, row)) for row in rows]

    # 7) Contagem total para paginação
    sql_count = f"SELECT COUNT(*) FROM usuarios {where_sql}"
    # Aqui só passo os mesmos `params` (sem LIMIT/OFFSET)
    cursor.execute(sql_count, tuple(params))
    total = cursor.fetchone()[0]
    total_pages = ceil(total / per_page)

    # 8) Renderize o template passando também search e status
    return render_template(
        'usuarios.html',
        users=users,
        search=search,
        status=status,
        page=page,
        total_pages=total_pages
    )

@usuarios_bp.route('/usuarios/create', methods=['POST'])
@login_required
def create_usuario():
    first = request.form['first_name'].strip()
    last  = request.form['last_name'].strip()
    email = request.form['email'].strip().lower()
    senha = request.form['senha']

    # 1) Campos obrigatórios
    if not first or not last or not email or not senha:
        flash('Preencha todos os campos.', 'erro')
        return redirect(url_for('usuarios.usuarios'))

    # 2) Senha: exatamente 8 dígitos numéricos
    if not re.fullmatch(r'\d{8}', senha):
        flash('A senha deve conter exatamente 8 dígitos numéricos.', 'erro')
        return redirect(url_for('usuarios.usuarios'))

    # 3) E-mail único
    cursor.execute("SELECT 1 FROM usuarios WHERE email = %s", (email,))
    if cursor.fetchone():
        flash('Este e-mail já está em uso.', 'erro')
        return redirect(url_for('usuarios.usuarios'))

    # 4) Geração de hash
    senha_hash = bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()

    try:
        # 5) Descobre o menor id livre em usuarios
        cursor.execute("""
            SELECT MIN(g.id) AS next_id
            FROM (
              SELECT generate_series(1, COALESCE(MAX(id),0) + 1) AS id
              FROM usuarios
            ) AS g
            LEFT JOIN usuarios u ON u.id = g.id
            WHERE u.id IS NULL
        """)
        next_id = cursor.fetchone()[0]

        # 6) Insere com id explícito
        cursor.execute(
           "INSERT INTO usuarios (id, first_name, last_name, email, senha, ativo, force_reset) "
           "VALUES (%s, %s, %s, %s, %s, TRUE, TRUE)",
           (next_id, first, last, email, senha_hash)
        )

        # 7) Sincroniza a sequence
        cursor.execute("""
            SELECT setval(
              pg_get_serial_sequence('usuarios','id'),
              GREATEST((SELECT MAX(id) FROM usuarios),
                       nextval(pg_get_serial_sequence('usuarios','id'))),
              false
            )
        """)

        conexao.commit()
        flash(f'Usuário criado com sucesso!', 'sucesso')
    except Exception as e:
        conexao.rollback()
        flash('Erro ao criar usuário.', 'erro')

    return redirect(url_for('usuarios.usuarios'))

@usuarios_bp.route('/usuarios/edit/<int:user_id>', methods=['POST'])
@login_required
def edit_usuario(user_id):
    first = request.form['first_name'].strip()
    last  = request.form['last_name'].strip()
    email = request.form['email'].strip().lower()
    senha = request.form.get('senha', '').strip()
    ativo = request.form.get('ativo')  # 'on' se marcado, None se não
    ativo_bool = True if ativo == 'on' else False

    # 1) Campos obrigatórios
    if not first or not last or not email:
        flash('Nome e e-mail são obrigatórios.', 'erro')
        return redirect(url_for('usuarios.usuarios'))

    # 2) Verifica e-mail duplicado
    cursor.execute("SELECT id FROM usuarios WHERE email = %s AND id <> %s", (email, user_id))
    if cursor.fetchone():
        flash('Este e-mail já está em uso por outro usuário.', 'erro')
        return redirect(url_for('usuarios.usuarios'))

    if senha:
        # 3) Se admin alterar senha, exige 8 dígitos numéricos
        if not re.fullmatch(r'\d{8}', senha):
            flash('A senha deve conter exatamente 8 dígitos numéricos.', 'erro')
            return redirect(url_for('usuarios.usuarios'))
        senha_hash = bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()
        # Força troca na próxima vez que o usuário logar
        sql = """
            UPDATE usuarios
            SET first_name=%s, last_name=%s, email=%s, senha=%s, ativo=%s, force_reset=TRUE
            WHERE id=%s
        """
        params = (first, last, email, senha_hash, ativo_bool, user_id)
    else:
        # Se não alterar senha, mantém force_reset como está
        sql = """
            UPDATE usuarios
            SET first_name=%s, last_name=%s, email=%s, ativo=%s
            WHERE id=%s
        """
        params = (first, last, email, ativo_bool, user_id)

    try:
        cursor.execute(sql, params)
        conexao.commit()
        flash('Usuário atualizado com sucesso.', 'sucesso')
    except Exception as e:
        conexao.rollback()
        flash('Erro ao atualizar usuário.', 'erro')

    return redirect(url_for('usuarios.usuarios'))

@usuarios_bp.route('/usuarios/delete/<int:user_id>', methods=['POST'])
@login_required
def delete_usuario(user_id):
    try:
        cursor.execute("DELETE FROM usuarios WHERE id = %s", (user_id,))
        conexao.commit()
        flash('Usuário excluído com sucesso.', 'sucesso')
    except Exception as e:
        conexao.rollback()
        flash('Erro ao excluir usuário.', 'erro')
    return redirect(url_for('usuarios.usuarios'))

@usuarios_bp.route('/usuarios/delete_selecionados', methods=['POST'])
@login_required
def delete_selecionados():
    # Recebe lista de IDs via checkbox (name="user_ids")
    ids = request.form.getlist('user_ids')
    if not ids:
        flash('Nenhum usuário selecionado.', 'erro')
        return redirect(url_for('usuarios.usuarios'))

    try:
        # Converte para tupla de inteiros
        ids_int = tuple(map(int, ids))
        query = f"DELETE FROM usuarios WHERE id IN ({','.join(['%s'] * len(ids_int))})"
        cursor.execute(query, ids_int)
        conexao.commit()
        flash(f"{cursor.rowcount} usuário(s) excluído(s) com sucesso.", 'sucesso')
    except Exception as e:
        conexao.rollback()
        print("Erro ao excluir usuários em massa:", e)
        flash('Erro ao excluir usuários.', 'erro')

    return redirect(url_for('usuarios.usuarios'))

@usuarios_bp.route('/usuarios/toggle/<int:user_id>', methods=['POST'])
@login_required
def toggle_usuario(user_id):
    try:
        # Alterna ativo entre TRUE e FALSE para esse usuário
        cursor.execute(
            "UPDATE usuarios SET ativo = NOT ativo WHERE id = %s",
            (user_id,)
        )
        conexao.commit()
        flash('Status do usuário atualizado.', 'sucesso')
    except Exception as e:
        conexao.rollback()
        print("Erro ao alternar status:", e)
        flash('Falha ao alterar status do usuário.', 'erro')
    return redirect(url_for('usuarios.usuarios'))
