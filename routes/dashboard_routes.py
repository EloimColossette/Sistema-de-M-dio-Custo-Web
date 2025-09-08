from flask import Blueprint, render_template, session
from routes.auth_routes import login_required
from conexao_db import conectar

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/dashboard')
@login_required
def dashboard():
    email = session['usuario']

    # abre conexão nova
    conexao = conectar()
    cursor = conexao.cursor()

    # 1) busca nome do usuário
    cursor.execute("SELECT first_name FROM usuarios WHERE email = %s", (email,))
    result = cursor.fetchone()
    nome_usuario = result[0] if result else 'Usuário'

    # 2) Produtos
    cursor.execute('SELECT nome, percentual_cobre, percentual_zinco FROM produtos')
    produtos = cursor.fetchall()

    # 3) Materiais
    cursor.execute("""
        SELECT m.id,
               m.nome,
               f.nome AS fornecedor,
               m.valor,
               m.grupo
          FROM materiais m
          JOIN fornecedores f ON m.fornecedor_id = f.id
         ORDER BY LOWER(m.nome) ASC
    """)
    materiais = cursor.fetchall()

    # 4) Últimas Saídas de NF
    try:
        cursor.execute("""
            SELECT
              nf.data::date,
              nf.numero_nf,
              nf.cliente,
              p.produto_nome,
              p.peso,
              p.base_produto
            FROM nf
            JOIN produtos_nf p ON p.nf_id = nf.id
            WHERE CAST(nf.data AS date) = (
              SELECT CAST(MAX(data) AS date) FROM nf
            )
            ORDER BY nf.data DESC, nf.numero_nf, p.produto_nome
            LIMIT 10
        """)
        raw_saidas = cursor.fetchall()
    except Exception as e:
        print("Erro ao buscar últimas saídas de NF:", e)
        raw_saidas = []

    # fecha cursor e conexão
    cursor.close()
    conexao.close()

    # helpers de formatação
    def fmt_data(d):
        return d.strftime("%d/%m/%Y") if hasattr(d, "strftime") else d

    def fmt_peso(v):
        try:
            s = f"{float(v):,.3f}"
            return s.replace(",", "X").replace(".", ",").replace("X", ".") + " Kg"
        except:
            return v

    ultimas_saidas = [
        {
            "data":    fmt_data(row[0]),
            "nf":      row[1],
            "cliente": row[2],
            "produto": row[3],
            "peso":    fmt_peso(row[4]),
            "base":    row[5] or ""
        }
        for row in raw_saidas
    ]

    return render_template(
        'dashboard.html',
        nome_usuario=nome_usuario,
        produtos=produtos,
        materiais=materiais,
        ultimas_saidas=ultimas_saidas
    )
