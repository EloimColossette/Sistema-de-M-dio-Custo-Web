# Exemplo de auth_routes.py
from flask import Blueprint, render_template, request, redirect, url_for, flash, session
import bcrypt, re
from functools import wraps
from conexao_db import conectar

auth_bp = Blueprint('auth', __name__)
conexao = conectar()
cursor = conexao.cursor()

@auth_bp.route('/')
def home():
    return redirect(url_for('auth.login'))

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'usuario' not in session:
            flash('Você precisa estar logado para acessar esta página.', 'erro')
            return redirect(url_for('auth.login'))
        return f(*args, **kwargs)
    return decorated

# JANELA CADASTRO
@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        first     = request.form['first_name'].strip()
        last      = request.form['last_name'].strip()
        email     = request.form['email'].strip().lower()
        senha     = request.form['senha']
        confirmar = request.form['confirmar_senha']

        # 1) Campos obrigatórios
        if not first or not last or not email or not senha or not confirmar:
            flash('Preencha todos os campos.', 'erro')
            return render_template('register.html')

        # 2) Validação de email
        if not re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', email):
            flash('Email inválido.', 'erro')
            return render_template('register.html')

        # 3) Senha: exatamente 8 dígitos numéricos
        if not re.fullmatch(r'\d{8}', senha):
            flash('A senha deve conter exatamente 8 dígitos numéricos.', 'erro')
            return render_template('register.html')
        
        if senha != confirmar:
            flash('As senhas não coincidem.', 'erro')
            return render_template('register.html')

        # 4) Email único
        cursor.execute("SELECT id FROM usuarios WHERE email = %s", (email,))
        if cursor.fetchone():
            flash('Este e-mail já está em uso.', 'erro')
            return render_template('register.html')

        # 5) Hash e insert
        senha_hash = bcrypt.hashpw(senha.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        try:
            cursor.execute(
                "INSERT INTO usuarios (first_name, last_name, email, senha, ativo, force_reset) "
                "VALUES (%s, %s, %s, %s, TRUE, FALSE)",
                (first, last, email, senha_hash)
            )
            conexao.commit()
            flash('Cadastro realizado com sucesso! Faça login.', 'sucesso')
            return redirect(url_for('auth.login'))
        except Exception as e:
            conexao.rollback()
            print("Erro ao cadastrar usuário:", e)
            flash('Erro interno. Tente novamente mais tarde.', 'erro')
            return render_template('register.html')

    return render_template('register.html')

# JANELA LOGIN
@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email'].strip().lower()
        senha = request.form['senha']

        cursor.execute(
            "SELECT id, first_name, senha, ativo, force_reset "
            "FROM usuarios WHERE email = %s",
            (email,)
        )
        row = cursor.fetchone()

        if row:
            user_id, nome, senha_hash, ativo, force_reset = row

            if not ativo:
                flash('A conta está inativa. Entre em contato com o administrador.', 'erro')
                return redirect(url_for('auth.login'))

            if bcrypt.checkpw(senha.encode('utf-8'), senha_hash.encode('utf-8')):
                if force_reset:
                    session['force_user_id'] = user_id
                    flash('Precisamos atualizar sua senha antes de continuar.', 'info')
                    return redirect(url_for('auth.primeiro_login'))
                session['usuario']      = email
                session['usuario_nome'] = nome
                return redirect(url_for('dashboard.dashboard'))

        flash('Email ou senha incorretos!', 'erro')
        return redirect(url_for('auth.login'))

    return render_template('login.html')

# JANELA DO PRIMEIRO ACESSO, CASO TENHA ADICIONADO UMA USUARIO PELA JANELA USUARIO
@auth_bp.route('/primeiro_login', methods=['GET', 'POST'])
def primeiro_login():
    user_id = session.get('force_user_id')
    if not user_id:
        flash('Acesso inválido ou sessão expirada.', 'erro')
        return redirect(url_for('auth.login'))

    if request.method == 'POST':
        nova_senha = request.form['nova_senha'].strip()
        confirmar  = request.form['confirmar_senha'].strip()

        # 1) Campos obrigatórios
        if not nova_senha or not confirmar:
            flash('Preencha os dois campos de senha.', 'erro')
            return render_template('primeiro_login.html')

        # 2) Deve ser exatamente 8 dígitos numéricos
        if not re.fullmatch(r'\d{8}', nova_senha):
            flash('A senha deve conter exatamente 8 dígitos numéricos.', 'erro')
            return render_template('primeiro_login.html')

        # 3) Confirmação
        if nova_senha != confirmar:
            flash('As senhas não coincidem.', 'erro')
            return render_template('primeiro_login.html')

        # 4) Hash e update
        senha_hash = bcrypt.hashpw(nova_senha.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        try:
            cursor.execute(
                "UPDATE usuarios SET senha = %s, force_reset = FALSE WHERE id = %s",
                (senha_hash, user_id)
            )
            conexao.commit()
        except Exception as e:
            conexao.rollback()
            flash('Erro interno ao definir nova senha. Tente novamente.', 'erro')
            return render_template('primeiro_login.html')

        # 5) Limpa sessão e efetua login
        session.pop('force_user_id', None)
        cursor.execute("SELECT email, first_name FROM usuarios WHERE id = %s", (user_id,))
        row = cursor.fetchone()
        if row:
            email_db, nome_db = row
            session['usuario']      = email_db
            session['usuario_nome'] = nome_db

        flash('Senha atualizada com sucesso! Seja bem-vindo.', 'sucesso')
        return redirect(url_for('dashboard.dashboard'))

    return render_template('primeiro_login.html')

# JANELA DE VERIFICAÇÃO DE EMAIL SE ESTA VALIDO
@auth_bp.route('/forgot_password', methods=['GET', 'POST'])
def forgot_password():
    if request.method == 'POST':
        email = request.form['email'].strip().lower()

        # 1) validação de preenchimento e formato
        if not email:
            flash('Por favor, informe seu email.', 'erro')
            return render_template('forgot_password.html')

        email_regex = r'^[\w\.-]+@[\w\.-]+\.\w+$'
        if not re.match(email_regex, email):
            flash('Formato de email inválido.', 'erro')
            return render_template('forgot_password.html')

        # 2) verificar existência no banco
        cursor.execute("SELECT id FROM usuarios WHERE email = %s", (email,))
        row = cursor.fetchone()
        if not row:
            flash('Email não encontrado.', 'erro')
            return render_template('forgot_password.html')

        # 3) tudo ok: armazena na sessão e redireciona para reset
        session['reset_email'] = email
        flash('Email verificado! Agora escolha sua nova senha.', 'sucesso')
        return redirect(url_for('auth.reset_password'))

    return render_template('forgot_password.html')

# JANELA DE REDEFINIR SENHA
@auth_bp.route('/reset_password', methods=['GET', 'POST'])
def reset_password():
    email = session.get('reset_email')
    if not email:
        flash('Acesso inválido ou sessão expirada.', 'erro')
        return redirect(url_for('auth.forgot_password'))

    if request.method == 'POST':
        nova = request.form['nova_senha']
        conf = request.form['confirmar_senha']

        # 1) Campos obrigatórios
        if not nova or not conf:
            flash('Preencha os dois campos de senha.', 'erro')
            return render_template('reset_password.html')

        # 2) Deve ser exatamente 8 dígitos numéricos
        if not re.fullmatch(r'\d{8}', nova):
            flash('A senha deve conter exatamente 8 dígitos numéricos.', 'erro')
            return render_template('reset_password.html')

        # 3) Confirmação
        if nova != conf:
            flash('As senhas não coincidem.', 'erro')
            return render_template('reset_password.html')

        # 4) Hash e update
        senha_hash = bcrypt.hashpw(nova.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        cursor.execute("UPDATE usuarios SET senha = %s WHERE email = %s", (senha_hash, email))
        conexao.commit()

        # 5) Limpa sessão e finaliza
        session.pop('reset_email', None)
        flash('Senha redefinida com sucesso! Faça login.', 'sucesso')
        return redirect(url_for('auth.login'))

    return render_template('reset_password.html')

@auth_bp.route('/logout')
@login_required
def logout():
    session.pop('usuario', None)
    flash('Você saiu com sucesso.', 'sucesso')
    return redirect(url_for('auth.login'))