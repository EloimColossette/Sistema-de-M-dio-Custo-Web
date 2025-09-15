from flask import Blueprint, render_template, session
from routes.auth_routes import login_required
from conexao_db import conectar
from collections import OrderedDict

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
                LIMIT 100
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
        # garante fechamento de conexões
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conexao.close()
        except Exception:
            pass

    # --- Helpers de formatação (usados no agrupamento) ---
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
            return str(v) if v is not None else ''

    # --- Agrupa raw_saidas por número de NF e soma pesos ---
    grouped = OrderedDict()
    for row in raw_saidas or []:
        # row esperado: (data, numero_nf, cliente, produto_nome, peso, base_produto)
        data_raw = row[0]
        nf_num    = row[1] or ''
        cliente   = row[2] or ''
        produto   = row[3] or ''
        peso_raw  = row[4] or 0
        base      = row[5] or ''

        # chave por NF (string)
        key = str(nf_num)

        if key not in grouped:
            grouped[key] = {
                "nf": nf_num,
                "data": fmt_data(data_raw),
                "cliente": cliente,
                "base": base,
                "products": [],
                "total_peso_raw": 0.0
            }

        # tenta converter peso para float (fallback 0.0)
        try:
            peso_val = float(peso_raw)
        except Exception:
            peso_val = 0.0

        grouped[key]["products"].append({
            "produto": produto or '',
            "peso_raw": peso_val,
            "peso": fmt_peso(peso_val)
        })
        grouped[key]["total_peso_raw"] += peso_val

    # formata total por NF, cria preview seguro dos nomes dos produtos e transforma em lista preservando ordem
    ultimas_saidas_grouped = []
    for v in grouped.values():
        # total formatado
        v["total_peso"] = fmt_peso(v.get("total_peso_raw", 0.0))

        # cria preview dos nomes dos produtos (string curta, segura)
        nomes = [p.get('produto', '') for p in v['products'] if p.get('produto')]
        preview = ' — '.join(nomes)
        # limita tamanho do tooltip para algo legível (ajuste o 160 se quiser)
        if len(preview) > 160:
            preview = preview[:157].rsplit(' ', 1)[0] + '...'
        v['products_preview'] = preview

        ultimas_saidas_grouped.append(v)

    # passa para o template a estrutura agrupada
    return render_template(
        'dashboard.html',
        nome_usuario=nome_usuario,
        produtos=produtos,
        materiais=materiais,
        ultimas_saidas=ultimas_saidas_grouped,
        ultima_entrada=ultima_entrada
    )
