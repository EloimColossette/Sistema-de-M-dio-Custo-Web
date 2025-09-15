from flask import Blueprint, render_template, session
from routes.auth_routes import login_required
from conexao_db import conectar

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/dashboard')
@login_required
def dashboard():
    email = session.get('usuario')
    conexao = conectar()
    cursor = conexao.cursor()

    try:
        # nome do usuário
        try:
            cursor.execute("SELECT first_name FROM usuarios WHERE email = %s", (email,))
            result = cursor.fetchone()
            nome_usuario = result[0] if result else 'Usuário'
        except Exception:
            nome_usuario = 'Usuário'

        # produtos
        try:
            cursor.execute('SELECT nome, percentual_cobre, percentual_zinco FROM produtos')
            produtos = cursor.fetchall()
        except Exception:
            produtos = []

        # materiais
        try:
            cursor.execute("""
                SELECT m.id,
                       m.nome,
                       f.nome AS fornecedor,
                       m.valor,
                       m.grupo
                  FROM materiais m
                  LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
                 ORDER BY LOWER(m.nome) ASC
            """)
            materiais = cursor.fetchall()
        except Exception:
            materiais = []

        # ultimas saídas (mantém seu select)
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
        except Exception:
            raw_saidas = []

        # busca a última entrada diretamente
        ultima_entrada = None
        try:
            cursor.execute("""
                SELECT id, data::date, nf, fornecedor, produto, peso_liquido
                  FROM entrada_nf
                 ORDER BY id DESC
                 LIMIT 1
            """)
            row = cursor.fetchone()
            if row:
                entrada_id, raw_data, numero_nf, fornecedor, produto, peso_val = row

                # formata data
                if hasattr(raw_data, "strftime"):
                    data_str = raw_data.strftime("%d/%m/%Y")
                else:
                    data_str = raw_data or ''

                # formata peso
                try:
                    peso_liq = f"{float(peso_val):,.3f}"
                    peso_liq = peso_liq.replace(",", "X").replace(".", ",").replace("X", ".") + " Kg"
                except Exception:
                    peso_liq = str(peso_val) if peso_val is not None else ''

                ultima_entrada = {
                    "data": data_str,
                    "nf": numero_nf or '',
                    "fornecedor": fornecedor or '',
                    "produto": produto or '',
                    "peso_liquido": peso_liq
                }
        except Exception:
            ultima_entrada = None

    finally:
        cursor.close()
        conexao.close()

    # helper de formatação para saídas
    def fmt_data(d):
        try:
            return d.strftime("%d/%m/%Y") if hasattr(d, "strftime") else (d or '')
        except:
            return d or ''

    def fmt_peso(v):
        try:
            s = f"{float(v):,.3f}"
            return s.replace(",", "X").replace(".", ",").replace("X", ".") + " Kg"
        except:
            return v or ''

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
        ultimas_saidas=ultimas_saidas,
        ultima_entrada=ultima_entrada
    )
