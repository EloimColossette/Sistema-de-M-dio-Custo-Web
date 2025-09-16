from flask import Blueprint, render_template, request, redirect, url_for, flash, send_file, jsonify, current_app
from routes.auth_routes import login_required
from conexao_db import conectar
from psycopg2.extras import execute_values
import pandas as pd
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle,Paragraph, Spacer
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
import io
import requests
import re
from datetime import datetime

saida_nf_bp = Blueprint('saida_nf', __name__, url_prefix='/saida_nf')

@saida_nf_bp.route('/', methods=['GET'])
@login_required
def saida_nf():
    """Listagem paginada e filtrada de NFs e produtos associados"""
    page = int(request.args.get('page', 1))
    per_page = 10
    offset = (page - 1) * per_page
    search = request.args.get('search', '').strip()

    conexao = conectar()
    cursor = conexao.cursor()

    # Pré-processamento de busca
    clean_search = re.sub(r'[.\-\/]', '', search)
    like = f"%{search}%"
    like_clean = f"%{clean_search}%"

    try:
        data_formatada = datetime.strptime(search, '%d/%m/%Y').strftime('%Y-%m-%d')
    except ValueError:
        data_formatada = ''

    if search:
        cursor.execute(
            """
            SELECT DISTINCT nf.id, nf.data, nf.numero_nf, nf.cliente, nf.cnpj_cpf, nf.observacao
            FROM nf
            LEFT JOIN produtos_nf ON produtos_nf.nf_id = nf.id
            WHERE unaccent(nf.numero_nf)            ILIKE unaccent(%s)
               OR unaccent(nf.cliente)              ILIKE unaccent(%s)
               OR unaccent(REPLACE(REPLACE(REPLACE(nf.cnpj_cpf, '.', ''), '-', ''), '/', '')) ILIKE unaccent(%s)
               OR nf.data::text = %s
               OR unaccent(produtos_nf.produto_nome)  ILIKE unaccent(%s)
               OR unaccent(produtos_nf.base_produto)  ILIKE unaccent(%s)
            ORDER BY nf.data DESC, nf.numero_nf DESC
            """,
            (like, like, like_clean, data_formatada, like, like)
        )
        nfs = cursor.fetchall()
        total_pages = 1
        page = 1
    else:
        cursor.execute("SELECT COUNT(*) FROM nf")
        total = cursor.fetchone()[0]
        total_pages = (total + per_page - 1) // per_page

        cursor.execute(
            """
            SELECT id, data, numero_nf, cliente, cnpj_cpf, observacao
            FROM nf
            ORDER BY data DESC, numero_nf DESC
            LIMIT %s OFFSET %s
            """,
            (per_page, offset)
        )
        nfs = cursor.fetchall()

    # Formatação de CNPJ/CPF
    def formatar_documento(doc):
        if len(doc) == 11:
            return f'{doc[:3]}.{doc[3:6]}.{doc[6:9]}-{doc[9:]}'
        elif len(doc) == 14:
            return f'{doc[:2]}.{doc[2:5]}.{doc[5:8]}/{doc[8:12]}-{doc[12:]}'
        return doc

    nfs = [
        (id_, data, numero_nf, cliente, formatar_documento(cpf), obs)
        for (id_, data, numero_nf, cliente, cpf, obs) in nfs
    ]

    # Produtos por NF
    cursor.execute("SELECT nf_id, produto_nome, peso, base_produto FROM produtos_nf")
    produtos = cursor.fetchall()
    map_produtos = {}
    for nf_id, nome, peso, base in produtos:
        map_produtos.setdefault(nf_id, []).append({
            'nome': nome,
            'peso': peso,
            'base': base
        })

    # Dropdown de produtos
    cursor.execute("SELECT id, nome FROM produtos ORDER BY nome")
    produtos_select = cursor.fetchall()

    cursor.close()
    conexao.close()

    return render_template(
        'saida_nf.html',
        nfs=nfs,
        produtos_map=map_produtos,
        produtos=produtos_select,
        page=page,
        total_pages=total_pages,
        search=search,
        modal_aberto=bool(search)
    )

@saida_nf_bp.route('/atualizar_modal', methods=['GET'])
@login_required
def atualizar_modal():
    page     = int(request.args.get('page', 1))
    per_page = 10
    offset   = (page - 1) * per_page

    conexao = conectar()
    cursor  = conexao.cursor()

    # 1) busca só as NFs da página
    cursor.execute(
        """
        SELECT id, data, numero_nf, cliente, cnpj_cpf, observacao
        FROM nf
        ORDER BY data DESC, numero_nf DESC
        LIMIT %s OFFSET %s
        """,
        (per_page, offset)
    )
    nfs = cursor.fetchall()  # lista de tuplas

    # 2) busca todos produtos dessas NFs numa segunda query
    nf_ids = [row[0] for row in nfs]
    map_produtos = {}
    if nf_ids:
        cursor.execute(
            """
            SELECT nf_id, produto_nome, peso, base_produto
            FROM produtos_nf
            WHERE nf_id = ANY(%s)
            """,
            (nf_ids,)
        )
        for nf_id, nome, peso, base in cursor.fetchall():
            map_produtos.setdefault(nf_id, []).append({
                'nome': nome,
                'peso': peso,
                'base': base
            })

    # 3) total_pages para paginação
    cursor.execute("SELECT COUNT(*) FROM nf")
    total = cursor.fetchone()[0]
    total_pages = (total + per_page - 1) // per_page

    cursor.close()
    conexao.close()

    # 4) formata cada NF e inclui lista de produtos
    def fmt_doc(doc):
        if len(doc) == 11:
            return f'{doc[:3]}.{doc[3:6]}.{doc[6:9]}-{doc[9:]}'
        if len(doc) == 14:
            return f'{doc[:2]}.{doc[2:5]}.{doc[5:8]}/{doc[8:12]}-{doc[12:]}'
        return doc

    result = []
    for id_, data, numero, cliente, cpf, obs in nfs:
        result.append({
            'id':         id_,
            'data':       data.strftime('%d/%m/%Y'),
            'numero_nf':  numero,
            'cliente':    cliente,
            'cnpj_cpf':   fmt_doc(cpf),
            'observacao': obs or '',
            'produtos':   map_produtos.get(id_, [])  # lista possivelmente vazia
        })

    return jsonify({
        'rows':        result,
        'total_pages': total_pages
    })

@saida_nf_bp.route('/salvar', methods=['POST'])
@login_required
def salvar_nf():
    data      = request.form['data']
    numero    = request.form['numero_nf']
    cliente   = request.form['cliente']
    cnpj_raw  = request.form['cnpj_cpf'].strip()
    cnpj      = re.sub(r'\D','', cnpj_raw)
    observacao= request.form.get('observacao', '')
    produtos  = request.form.getlist('produtos[]')

    conexao = conectar()
    cursor  = conexao.cursor()

    # 1) encontra o menor ID vago
    cursor.execute("""
        SELECT id_series.id
          FROM generate_series(1, (SELECT COALESCE(MAX(id),1)+1 FROM nf)) AS id_series(id)
         WHERE NOT EXISTS (SELECT 1 FROM nf WHERE nf.id = id_series.id)
         ORDER BY id_series.id
         LIMIT 1
    """)
    next_id = cursor.fetchone()[0]

    # 2) insere NF usando esse ID
    cursor.execute(
        """
        INSERT INTO nf (id, data, numero_nf, cliente, cnpj_cpf, observacao)
             VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (next_id, data, numero, cliente, cnpj, observacao)
    )

    # 3) insere produtos
    for p in produtos:
        nome, peso, base = p.split('|')
        cursor.execute(
            """
            INSERT INTO produtos_nf (nf_id, produto_nome, peso, base_produto)
                 VALUES (%s, %s, %s, %s)
            """,
            (next_id, nome, float(peso.replace(',', '.')), base)
        )

    # 4) ajusta sequência para o próximo INSERT padrão
    cursor.execute(
        "SELECT setval(pg_get_serial_sequence('nf','id'), (SELECT MAX(id) FROM nf))"
    )

    conexao.commit()
    cursor.close()
    conexao.close()

    flash('Nota Fiscal salva com sucesso!', 'sucesso')
    return redirect(url_for('saida_nf.saida_nf'))

@saida_nf_bp.route('/edit/<int:nf_id>', methods=['POST'])
@login_required
def editar_nf(nf_id):
    data = request.form.get(f'data_{nf_id}')
    numero = request.form.get(f'numero_nf_{nf_id}')
    produto = request.form.get(f'produto_{nf_id}')
    peso = request.form.get(f'peso_{nf_id}')
    cliente = request.form.get(f'cliente_{nf_id}')
    cnpj = request.form.get(f'cnpj_cpf_{nf_id}')
    base = request.form.get(f'base_produto_{nf_id}')

    conexao = conectar()
    cursor = conexao.cursor()

    # Atualiza a tabela NF
    cursor.execute(
        """
        UPDATE nf
        SET data = %s,
            numero_nf = %s,
            cliente = %s,
            cnpj_cpf = %s
        WHERE id = %s
        """,
        (data, numero, cliente, cnpj, nf_id)
    )

    # Atualiza os produtos associados
    cursor.execute(
        """
        UPDATE produtos_nf
        SET produto_nome = %s,
            peso = %s,
            base_produto = %s
        WHERE nf_id = %s
        """,
        (produto, float(peso), base, nf_id)
    )

    conexao.commit()
    cursor.close()
    conexao.close()
    flash('Nota Fiscal atualizada com sucesso!', 'sucesso')
    return ('', 204)

@saida_nf_bp.route('/excluir/<int:nf_id>', methods=['POST'])
@login_required
def excluir_nf(nf_id):
    page = int(request.args.get('page', 1))
    per_page = 10

    conexao = conectar()
    cursor = conexao.cursor()
    cursor.execute("DELETE FROM produtos_nf WHERE nf_id = %s", (nf_id,))
    cursor.execute("DELETE FROM nf WHERE id = %s", (nf_id,))
    conexao.commit()

    # só precisamos do JSON para API
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return ('', 204)

    # para requisições normais, redireciona:
    cursor.execute("SELECT COUNT(*) FROM nf")
    total_restante = cursor.fetchone()[0]
    total_pages = (total_restante + per_page - 1) // per_page
    if page > total_pages:
        page = total_pages
    cursor.close()
    conexao.close()
    flash('Nota Fiscal excluída.', 'info')
    return redirect(url_for('saida_nf.saida_nf', page=page) + '#modal-nfs')

@saida_nf_bp.route('/excluir-massa', methods=['POST'])
@login_required
def excluir_massa_nf():
    data = request.get_json() or {}
    ids  = data.get('ids')
    all_flag = data.get('all', False)
    search   = data.get('search', '').strip()

    # Se for all, buscamos todos os IDs primeiro
    if all_flag:
        conexao = conectar()
        cursor  = conexao.cursor()

        # Refaça a mesma query de search do seu GET, mas apenas pegando ids
        if search:
            clean = re.sub(r'[.\-\/]', '', search)
            like = f"%{search}%"
            like_clean = f"%{clean}%"
            try:
                df = datetime.strptime(search, '%d/%m/%Y').strftime('%Y-%m-%d')
            except ValueError:
                df = ''
            cursor.execute("""
                SELECT DISTINCT nf.id
                FROM nf
                LEFT JOIN produtos_nf ON produtos_nf.nf_id = nf.id
                WHERE unaccent(nf.numero_nf) ILIKE unaccent(%s)
                   OR unaccent(nf.cliente)    ILIKE unaccent(%s)
                   OR unaccent(REPLACE(REPLACE(REPLACE(nf.cnpj_cpf, '.', ''), '-', ''), '/', '')) ILIKE unaccent(%s)
                   OR nf.data::text = %s
                   OR unaccent(produtos_nf.produto_nome) ILIKE unaccent(%s)
                   OR unaccent(produtos_nf.base_produto) ILIKE unaccent(%s)
            """, (like, like, like_clean, df, like, like))
        else:
            cursor.execute("SELECT id FROM nf")
        ids = [row[0] for row in cursor.fetchall()]
        cursor.close()
        conexao.close()

        if not ids:
            return ('Nenhum registro para excluir.', 400)

    # Se não for all, espera ids vindo como lista
    else:
        if not ids:
            return ('Nenhum ID fornecido.', 400)
        try:
            ids = [int(i) for i in ids]
        except ValueError:
            return ('IDs inválidos. Devem ser números inteiros.', 400)

    # Agora faz a exclusão dos produtos e das NFs
    conexao = conectar()
    cursor  = conexao.cursor()
    try:
        cursor.execute("DELETE FROM produtos_nf WHERE nf_id = ANY(%s)", (ids,))
        cursor.execute("DELETE FROM nf           WHERE id   = ANY(%s)", (ids,))
        conexao.commit()
    except Exception as e:
        conexao.rollback()
        return (f'Erro ao excluir: {str(e)}', 500)
    finally:
        cursor.close()
        conexao.close()

    return ('', 204)

@saida_nf_bp.route('/observacao/<int:nf_id>', methods=['POST'])
@login_required
def editar_obs(nf_id):
    data = request.get_json()
    obs  = data.get('observacao','')
    conexao = conectar()
    cur = conexao.cursor()
    cur.execute("UPDATE nf SET observacao = %s WHERE id = %s", (obs, nf_id))
    conexao.commit()
    cur.close()
    conexao.close()
    return '', 204

@saida_nf_bp.route('/observacao/<int:nf_id>', methods=['DELETE'])
@login_required
def excluir_observacao(nf_id):
    conexao = conectar()
    cur = conexao.cursor()
    cur.execute("UPDATE nf SET observacao = '' WHERE id = %s", (nf_id,))
    conexao.commit()
    cur.close()
    conexao.close()
    return '', 204

@saida_nf_bp.route('/buscar_cliente/<cpf>')
@login_required
def buscar_cliente_por_cpf(cpf):
    conexao = conectar()
    cursor = conexao.cursor()
    try:
        # Remove pontuações (como . e -) do CPF vindo da URL
        cpf_limpo = re.sub(r'\D', '', cpf)

        cursor.execute(
            "SELECT cliente FROM nf WHERE cnpj_cpf = %s ORDER BY id DESC LIMIT 1",
            (cpf_limpo,)
        )
        resultado = cursor.fetchone()
        if resultado:
            return {"nome": resultado[0]}
        else:
            return {"nome": ""}
    except Exception as e:
        print(f"Erro ao buscar CPF: {e}")
        return {"erro": "Erro ao buscar CPF"}, 500
    finally:
        cursor.close()
        conexao.close()

@saida_nf_bp.route('/buscar_empresa/<cnpj>')
@login_required
def buscar_empresa_por_cnpj(cnpj):
    try:
        url = f"https://receitaws.com.br/v1/cnpj/{cnpj}"
        headers = {'Accept': 'application/json'}
        response = requests.get(url, headers=headers, timeout=10)

        if response.status_code != 200:
            return {'erro': 'Erro na ReceitaWS'}, 400

        data = response.json()
        if data.get('status') == 'ERROR':
            return {'erro': 'CNPJ não encontrado'}, 404

        return {'nome': data.get('nome')}
    except Exception as e:
        print(f"Erro ao consultar CNPJ: {e}")
        return {'erro': 'Erro interno'}, 500

@saida_nf_bp.route('/exportar_filtrado')
@login_required
def exportar_filtrado():
    # --- 1) Lê parâmetros de filtro ---
    data_de      = request.args.get('data_de')
    data_ate     = request.args.get('data_ate')
    numero_nf    = request.args.get('numero_nf')
    produto_nome = request.args.get('produto_nome')
    cliente_txt  = request.args.get('cliente')
    cnpj_cpf     = request.args.get('cnpj_cpf')
    base_produto = request.args.get('base_produto')
    tipo         = request.args.get('tipo', 'excel')

    # --- 2) Monta consulta SQL dinamicamente ---
    query = """
      SELECT nf.data,
             nf.numero_nf,
             p.produto_nome   AS produto,
             p.peso,
             nf.cliente,
             nf.cnpj_cpf,
             p.base_produto
      FROM nf
      JOIN produtos_nf p ON nf.id = p.nf_id
      WHERE TRUE
    """
    params = []
    if data_de:
        query += " AND nf.data >= %s";    params.append(data_de)
    if data_ate:
        query += " AND nf.data <= %s";    params.append(data_ate)
    if numero_nf:
        query += " AND nf.numero_nf ILIKE %s";    params.append(f'%{numero_nf}%')
    if produto_nome:
        query += " AND p.produto_nome ILIKE %s";  params.append(f'%{produto_nome}%')
    if cliente_txt:
        query += " AND nf.cliente ILIKE %s";     params.append(f'%{cliente_txt}%')
    if cnpj_cpf:
        clean = re.sub(r'\D','', cnpj_cpf)
        query += " AND nf.cnpj_cpf = %s";         params.append(clean)
    if base_produto:
        query += " AND p.base_produto ILIKE %s";  params.append(f'%{base_produto}%')

    conexao = conectar()
    df = pd.read_sql_query(query, conexao, params=params)
    conexao.close()

    # --- 3) Formata colunas:
    # Data e CNPJ/CPF para exibição
    df['data'] = pd.to_datetime(df['data']).dt.strftime('%d/%m/%Y')

    def fmt_doc(d):
        clean = re.sub(r'\D','', d)
        if len(clean)==11:
            return f'{clean[:3]}.{clean[3:6]}.{clean[6:9]}-{clean[9:]}'
        if len(clean)==14:
            return f'{clean[:2]}.{clean[2:5]}.{clean[5:8]}/{clean[8:12]}-{clean[12:]}'
        return d
    df['cnpj_cpf'] = df['cnpj_cpf'].apply(fmt_doc)

    # --- 4) Exportar Excel ---
    if tipo == 'excel':
        # Renomeia colunas: substitui "_" por " " e capitaliza
        df_excel = df.rename(columns={
            'data':         'Data',
            'numero_nf':    'Nota Fiscal',
            'produto':      'Produto',
            'peso':         'Peso (Kg)',
            'cliente':      'Cliente',
            'cnpj_cpf':     'CNPJ/CPF',
            'base_produto': 'Base Produto'
        })

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df_excel.to_excel(writer, index=False, sheet_name='Notas')
            # Aqui você pode ajustar formatação (largura de colunas, filtros, etc.)
        output.seek(0)
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name='Saida_Nota_Fiscal.xlsx'
        )

    # --- 5) Exportar PDF via ReportLab Platypus (Retrato) ---
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.5*cm, rightMargin=1.5*cm,
        topMargin=2*cm, bottomMargin=2*cm
    )

    styles = getSampleStyleSheet()
    title_style = styles['Heading1']; title_style.alignment = 1
    normal_style = styles['BodyText']; normal_style.wordWrap = 'CJK'

    elements = []
    # Título
    elements.append(Paragraph("Relatório de Notas Fiscais", title_style))
    elements.append(Spacer(1, 0.3*cm))
    # Data de geração
    now = pd.Timestamp.now().strftime('%d/%m/%Y %H:%M')
    elements.append(Paragraph(f"Gerado em: {now}", styles['Normal']))
    elements.append(Spacer(1, 0.5*cm))

    # Monta dados da tabela (inclui cabeçalho)
    header = ['Data','Nota Fiscal','Produto','Peso','Cliente','CNPJ/CPF','Base Produto']
    data_table = [ header ]
    for _, row in df.iterrows():
        data_table.append([
            row['data'],
            str(row['numero_nf']),
            row['produto'],
            f'{row["peso"]:.3f}',
            row['cliente'],
            row['cnpj_cpf'],
            row['base_produto']
        ])

    # Converte cada célula em Paragraph (para word wrap)
    table_data = []
    for r in data_table:
        table_data.append([ Paragraph(str(cell), normal_style) for cell in r ])

    # Define larguras de coluna (ajuste se necessário)
    col_widths = [2.2*cm, 1.5*cm, 3.9*cm, 2.5*cm, 3.6*cm, 3.7*cm, 2.8*cm]
    tbl = Table(table_data, colWidths=col_widths)
    tbl.setStyle(TableStyle([
        ('GRID',         (0,0), (-1,-1), 0.5, colors.grey),
        ('BACKGROUND',   (0,0), (-1,0),   colors.lightgrey),
        ('FONTNAME',     (0,0), (-1,0),   'Helvetica-Bold'),
        ('FONTSIZE',     (0,0), (-1,0),     10),
        ('FONTSIZE',     (0,1), (-1,-1),    9),
        ('VALIGN',       (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING',(0,0), (-1,0),    6),
        ('TOPPADDING',   (0,0), (-1,0),    6),
    ]))
    elements.append(tbl)

    # Adiciona rodapé com número de página
    def add_page_number(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 8)
        canvas.drawString(1.5*cm, 1*cm, f'Página {doc.page}')
        canvas.restoreState()

    # Gera o PDF
    doc.build(elements, onFirstPage=add_page_number, onLaterPages=add_page_number)

    buffer.seek(0)
    return send_file(
        buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name='Saida_Nota_Fiscal.pdf'
    )

@saida_nf_bp.route('/importar_excel', methods=['POST'])
@login_required
def importar_excel():
    arquivo = request.files.get('arquivo_excel')
    if not arquivo:
        flash('Nenhum arquivo enviado.', 'danger')
        return redirect(url_for('saida_nf.saida_nf'))

    try:
        df = pd.read_excel(arquivo.stream)

        conexao = conectar()
        cursor = conexao.cursor()

        # ✏️ Normaliza colunas que vamos usar
        df['numero_nf']    = df['NF'].astype(str)
        df['peso_float']   = df['Peso'].astype(str).str.replace(',', '.').astype(float)
        df['observacao']   = df.get('Observação', '').fillna('').astype(str)
        df['cnpj_cpf']     = df['CNPJ/CPF'].astype(str).apply(lambda x: re.sub(r"\D", '', x))

        # ✅ Busca todas as NFs únicas no arquivo
        numeros_nf_unicos = df['numero_nf'].unique().tolist()

        # 🔍 Busca no banco as NFs que já existem
        cursor.execute(
            "SELECT id, numero_nf FROM nf WHERE numero_nf = ANY(%s)",
            (numeros_nf_unicos,)
        )
        rows_existentes = cursor.fetchall()  # [(id, numero_nf), ...]

        # Monta dicionário numero_nf -> id
        nf_map = {numero_nf: nf_id for nf_id, numero_nf in rows_existentes}

        # 🧩 Descobre quais NFs faltam criar
        numeros_faltando = [n for n in numeros_nf_unicos if n not in nf_map]

        # Cria as NFs que faltam e atualiza o dicionário nf_map
        for numero_nf in numeros_faltando:
            # pega os dados da primeira ocorrência desse numero_nf no DataFrame
            linha = df[df['numero_nf'] == numero_nf].iloc[0]
            cursor.execute(
                """
                INSERT INTO nf (data, numero_nf, cliente, cnpj_cpf, observacao)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    linha['Data'],
                    numero_nf,
                    linha['Cliente'],
                    linha['cnpj_cpf'],
                    linha['observacao']
                )
            )
            nf_id = cursor.fetchone()[0]
            nf_map[numero_nf] = nf_id

        # ✅ Monta lista de produtos a inserir
        lista_produtos = []
        for _, row in df.iterrows():
            nf_id = nf_map[row['numero_nf']]
            lista_produtos.append((
                nf_id,
                row['Produto'],
                row['peso_float'],
                row['Base Produto']
            ))

        # ⚡ Insere todos os produtos de uma vez, ignorando duplicados
        execute_values(
            cursor,
            """
            INSERT INTO produtos_nf (nf_id, produto_nome, peso, base_produto)
            VALUES %s
            ON CONFLICT ON CONSTRAINT unique_nf_produto DO NOTHING
            """,
            lista_produtos
        )

        conexao.commit()
        cursor.close()
        conexao.close()
        flash('Importação concluída com sucesso.', 'success')

    except Exception as e:
        try:
            conexao.rollback()
            cursor.close()
            conexao.close()
        except:
            pass
        flash(f'Erro na importação: {e}', 'danger')

    return redirect(url_for('saida_nf.saida_nf'))

@saida_nf_bp.route('/agregacao_selecao', methods=['GET'])
@login_required
def agregacao_selecao():
    """
    Retorna agregados (soma de peso por base_produto e total geral) respeitando
    o termo de busca opcional 'search'. Usada quando o usuário marca o checkbox
    do cabeçalho para selecionar NFs de todas as páginas.
    Resposta JSON:
      { "totals": { "Base A": 123.456, ... }, "total": 456.789 }
    """
    pesquisa = request.args.get('search', '').strip()

    conexao = conectar()
    cursor = conexao.cursor()

    # Monta filtro simples: procura em numero_nf, cliente e cnpj_cpf
    filtros = []
    parametros = []

    if pesquisa:
        like = f"%{pesquisa}%"
        filtros.append("(nf.numero_nf::text ILIKE %s OR nf.cliente ILIKE %s OR nf.cnpj_cpf ILIKE %s)")
        parametros.extend([like, like, like])

    clausula_where = "WHERE " + " AND ".join(filtros) if filtros else ""

    # Query: soma por base_produto (agrupa por base) e soma total geral
    sql = f"""
        SELECT COALESCE(p.base_produto, 'Sem Base') AS base, SUM(p.peso)::numeric AS soma
        FROM produtos_nf p
        JOIN nf ON nf.id = p.nf_id
        {clausula_where}
        GROUP BY COALESCE(p.base_produto, 'Sem Base')
        ORDER BY COALESCE(p.base_produto, 'Sem Base')
    """

    try:
        cursor.execute(sql, parametros)
        linhas = cursor.fetchall()  # [(base, soma), ...]

        # Converte para formato JSON-friendly (Decimal -> float)
        totais = { linha[0]: float(linha[1]) for linha in linhas }

        # total geral
        cursor.execute(f"""
            SELECT COALESCE(SUM(p.peso), 0) FROM produtos_nf p
            JOIN nf ON nf.id = p.nf_id
            {clausula_where}
        """, parametros)
        linha_total = cursor.fetchone()
        total_geral = float(linha_total[0]) if linha_total and linha_total[0] is not None else 0.0

        # Retorna chaves 'totals' e 'total' para manter compatibilidade com o front-end
        return jsonify({'totals': totais, 'total': total_geral}), 200

    except Exception as e:
        current_app.logger.exception('Erro agregando seleção global')
        return jsonify({'error': str(e)}), 500

    finally:
        try:
            cursor.close()
            conexao.close()
        except Exception:
            pass