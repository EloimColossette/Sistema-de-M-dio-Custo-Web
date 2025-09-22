from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, send_file
from routes.auth_routes import login_required
from conexao_db import conectar
import math
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import io
import pandas as pd
import unicodedata
import re

calculo_bp = Blueprint('calculo_nfs', __name__, url_prefix='/calculo_nfs')

def converter_numero_br_para_decimal(valor):
    if valor is None:
        return None
    s = str(valor).strip()
    if s == '':
        return None
    s = s.replace(' ', '')
    # suporte "1.234,56" ou "1234,56" ou "1234.56"
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
        msg = str(e).lower()
        if 'calculo_historico' in msg or 'relation "calculo_historico" does not exist' in msg:
            # silenciar (tabela pode não existir em testes)
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

def normalize_name(s):
    """
    Normaliza um nome para comparação:
      - remove acentos
      - remove conteúdo entre parênteses
      - substitui '~' por espaço
      - remove símbolos/pontuação (mantém letras e números e espaços)
      - colapsa espaços e transforma em UPPER
    """
    if not s:
        return ''
    t = str(s)

    t = unicodedata.normalize('NFD', t)
    t = ''.join(ch for ch in t if unicodedata.category(ch) != 'Mn')

    t = re.sub(r'\(.*?\)', ' ', t)
    t = t.replace('~', ' ')
    t = re.sub(r'\bmm\b', ' ', t, flags=re.IGNORECASE)
    t = re.sub(r'[^0-9A-Za-z\s]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip().upper()
    return t

def safe_decimal_zero(value):
    """
    Converte value para Decimal, retornando Decimal('0') em qualquer caso inválido,
    incluindo None, '', 'nan', float('nan'), Decimal('NaN'), etc.
    """
    try:
        if value is None:
            return Decimal('0')
        # floats NaN
        if isinstance(value, float):
            if math.isnan(value):
                return Decimal('0')
            return Decimal(str(value))
        s = str(value).strip()
        if s == '':
            return Decimal('0')
        if s.lower() == 'nan':
            return Decimal('0')
        # evita problemas com vírgula como separador
        s = s.replace(',', '.')
        d = Decimal(s)
        # se for NaN/Inf, tratar como zero
        if d.is_nan() or d == Decimal('Infinity') or d == Decimal('-Infinity'):
            return Decimal('0')
        return d
    except (InvalidOperation, ValueError, TypeError):
        return Decimal('0')

def calcular_qtd_cobre(cursor, produto_nome, fornecedor_nome, materiais_list, peso_liquido, peso_integral,
                       prod_map=None, forn_map=None, materials_by_fornecedor=None, materials_fallback=None):
    """
    Retorna Decimal ou None.
    prod_map pode ter chave -> Decimal (fração) ou chave -> (pct_cobre, pct_zinco).
    """
    try:
        pl = Decimal(str(peso_liquido or 0))
    except Exception:
        pl = Decimal('0')

    try:
        pi = Decimal(str(peso_integral or 0))
    except Exception:
        pi = Decimal('0')

    # usa mapas pré-carregados
    if prod_map is not None and materials_by_fornecedor is not None and materials_fallback is not None:
        prod_key = normalize_name(produto_nome)
        raw_pct = prod_map.get(prod_key)
        percent_cobre = None
        if raw_pct is not None:
            if isinstance(raw_pct, (list, tuple)):
                percent_cobre = raw_pct[0]
            else:
                percent_cobre = raw_pct

        if percent_cobre is None:
            for k in prod_map.keys():
                if not k:
                    continue
                if prod_key and (k.startswith(prod_key) or prod_key.startswith(k) or k in prod_key or prod_key in k):
                    candidate = prod_map.get(k)
                    if isinstance(candidate, (list, tuple)):
                        percent_cobre = candidate[0]
                    else:
                        percent_cobre = candidate
                    if percent_cobre is not None:
                        break

        if not percent_cobre or Decimal(str(percent_cobre)) == 0:
            return None

        forn_key = normalize_name(fornecedor_nome)
        fornecedor_id = None
        if forn_map is not None:
            fornecedor_id = forn_map.get(forn_key)

        for mat in (materiais_list or []):
            if not mat:
                continue
            mat_key = normalize_name(mat)
            mat_info = None
            if fornecedor_id is not None:
                mat_info = materials_by_fornecedor.get((mat_key, fornecedor_id))
            if not mat_info:
                mat_info = materials_fallback.get(mat_key)
            if not mat_info:
                continue
            grupo, valor_mat = mat_info
            if valor_mat is None:
                continue
            if grupo and 'cobr' in grupo.lower():
                try:
                    if Decimal(str(valor_mat)) == 0:
                        continue
                    quantidade_cobre = ((pl - pi) * Decimal(str(percent_cobre))) / Decimal(str(valor_mat))
                    if quantidade_cobre < 0:
                        return None
                    return quantidade_cobre
                except Exception:
                    return None
        return None

    # fallback DB
    produto_norm = normalize_name(produto_nome)
    percent_cobre = None
    try:
        cursor.execute("SELECT percentual_cobre FROM produtos WHERE UPPER(TRIM(nome)) = %s LIMIT 1", (produto_norm,))
        row = cursor.fetchone()
        if row and row[0] is not None:
            percent_cobre = Decimal(str(row[0])) / Decimal('100')
    except Exception:
        percent_cobre = None
    if not percent_cobre or percent_cobre == 0:
        return None

    fornecedor_norm = normalize_name(fornecedor_nome)
    fornecedor_id = None
    try:
        if fornecedor_norm:
            cursor.execute("SELECT id FROM fornecedores WHERE UPPER(TRIM(nome)) = %s LIMIT 1", (fornecedor_norm,))
            fr = cursor.fetchone()
            if fr:
                fornecedor_id = fr[0]
    except Exception:
        fornecedor_id = None

    for mat in (materiais_list or []):
        if not mat:
            continue
        mat_norm = normalize_name(mat)
        mat_row = None
        try:
            if fornecedor_id is not None:
                cursor.execute("""
                    SELECT grupo, valor
                    FROM materiais
                    WHERE UPPER(TRIM(nome)) = %s AND fornecedor_id = %s
                    LIMIT 1
                """, (mat_norm, fornecedor_id))
                mat_row = cursor.fetchone()
        except Exception:
            mat_row = None

        if not mat_row:
            try:
                cursor.execute("""
                    SELECT grupo, valor
                    FROM materiais
                    WHERE UPPER(TRIM(nome)) = %s
                    LIMIT 1
                """, (mat_norm,))
                mat_row = cursor.fetchone()
            except Exception:
                mat_row = None

        if not mat_row:
            continue

        grupo = (mat_row[0] or '').strip().lower()
        valor_material = mat_row[1]
        try:
            valor_material = Decimal(str(valor_material))
        except Exception:
            valor_material = None

        if valor_material and grupo and 'cobr' in grupo:
            if valor_material == 0:
                continue
            try:
                quantidade_cobre = ((pl - pi) * percent_cobre) / valor_material
                if quantidade_cobre < 0:
                    return None
                return quantidade_cobre
            except Exception:
                return None

    return None

def calcular_qtd_zinco(cursor, produto_nome, fornecedor_nome, materiais_list, peso_liquido, peso_integral,
                       prod_map=None, forn_map=None, materials_by_fornecedor=None, materials_fallback=None):
    """
    Calcula a quantidade de zinco (Decimal) ou retorna None.
    Compatível com a mesma assinatura de calcular_qtd_cobre.
    """
    try:
        pl = Decimal(str(peso_liquido or 0))
    except Exception:
        pl = Decimal('0')

    try:
        pi = Decimal(str(peso_integral or 0))
    except Exception:
        pi = Decimal('0')

    # usa mapas pré-carregados
    if prod_map is not None and materials_by_fornecedor is not None and materials_fallback is not None:
        prod_key = normalize_name(produto_nome)
        raw_pct = prod_map.get(prod_key)
        percent_zinco = None
        if raw_pct is not None:
            if isinstance(raw_pct, (list, tuple)) and len(raw_pct) > 1:
                percent_zinco = raw_pct[1]
            else:
                # raw_pct pode ser apenas o percentual de zinco (compatibilidade)
                percent_zinco = raw_pct

        if percent_zinco is None:
            for k in prod_map.keys():
                if not k:
                    continue
                if prod_key and (k.startswith(prod_key) or prod_key.startswith(k) or k in prod_key or prod_key in k):
                    candidate = prod_map.get(k)
                    if isinstance(candidate, (list, tuple)) and len(candidate) > 1:
                        percent_zinco = candidate[1]
                    else:
                        percent_zinco = candidate
                    if percent_zinco is not None:
                        break

        if not percent_zinco or Decimal(str(percent_zinco)) == 0:
            return None

        forn_key = normalize_name(fornecedor_nome)
        fornecedor_id = None
        if forn_map is not None:
            fornecedor_id = forn_map.get(forn_key)

        for mat in (materiais_list or []):
            if not mat:
                continue
            mat_key = normalize_name(mat)
            mat_info = None
            if fornecedor_id is not None:
                mat_info = materials_by_fornecedor.get((mat_key, fornecedor_id))
            if not mat_info:
                mat_info = materials_fallback.get(mat_key)
            if not mat_info:
                continue
            grupo, valor_mat = mat_info
            if valor_mat is None:
                continue
            if grupo and ('zinco' in grupo.lower() or 'zinc' in grupo.lower()):
                try:
                    if Decimal(str(valor_mat)) == 0:
                        continue
                    quantidade_zinco = ((pl - pi) * Decimal(str(percent_zinco))) / Decimal(str(valor_mat))
                    if quantidade_zinco < 0:
                        return None
                    return quantidade_zinco
                except Exception:
                    return None
        return None

    # fallback DB
    produto_norm = normalize_name(produto_nome)
    percent_zinco = None
    try:
        cursor.execute("SELECT percentual_zinco FROM produtos WHERE UPPER(TRIM(nome)) = %s LIMIT 1", (produto_norm,))
        row = cursor.fetchone()
        if row and row[0] is not None:
            percent_zinco = Decimal(str(row[0])) / Decimal('100')
    except Exception:
        percent_zinco = None

    if not percent_zinco or percent_zinco == 0:
        return None

    fornecedor_norm = normalize_name(fornecedor_nome)
    fornecedor_id = None
    try:
        if fornecedor_norm:
            cursor.execute("SELECT id FROM fornecedores WHERE UPPER(TRIM(nome)) = %s LIMIT 1", (fornecedor_norm,))
            fr = cursor.fetchone()
            if fr:
                fornecedor_id = fr[0]
    except Exception:
        fornecedor_id = None

    for mat in (materiais_list or []):
        if not mat:
            continue
        mat_norm = normalize_name(mat)
        mat_row = None
        try:
            if fornecedor_id is not None:
                cursor.execute("""
                    SELECT grupo, valor
                    FROM materiais
                    WHERE UPPER(TRIM(nome)) = %s AND fornecedor_id = %s
                    LIMIT 1
                """, (mat_norm, fornecedor_id))
                mat_row = cursor.fetchone()
        except Exception:
            mat_row = None

        if not mat_row:
            try:
                cursor.execute("""
                    SELECT grupo, valor
                    FROM materiais
                    WHERE UPPER(TRIM(nome)) = %s
                    LIMIT 1
                """, (mat_norm,))
                mat_row = cursor.fetchone()
            except Exception:
                mat_row = None

        if not mat_row:
            continue

        grupo = (mat_row[0] or '').strip().lower()
        valor_material = mat_row[1]
        try:
            valor_material = Decimal(str(valor_material))
        except Exception:
            valor_material = None

        if valor_material and grupo and ('zinco' in grupo or 'zinc' in grupo):
            if valor_material == 0:
                continue
            try:
                quantidade_zinco = ((pl - pi) * percent_zinco) / valor_material
                if quantidade_zinco < 0:
                    return None
                return quantidade_zinco
            except Exception:
                return None

    return None

def calcular_qtd_sucata(cursor, fornecedor_nome, materiais_list, peso_liquido, peso_integral,
                        materials_by_fornecedor=None, materials_fallback=None, forn_map=None):
    """
    Retorna Decimal ou None para quantidade de sucata.
    Compatível com as outras funções.
    Agora consulta materials_by_fornecedor (quando disponível) usando o fornecedor_id,
    e cai no materials_fallback caso não encontre.
    """
    try:
        pl = Decimal(str(peso_liquido or 0))
    except Exception:
        pl = Decimal('0')
    try:
        pi = Decimal(str(peso_integral or 0))
    except Exception:
        pi = Decimal('0')

    diff = pl - pi
    if diff <= 0:
        return None

    # tenta obter fornecedor_id a partir do nome (se forn_map fornecido)
    fornecedor_id = None
    try:
        if forn_map is not None and fornecedor_nome:
            fornecedor_id = forn_map.get(normalize_name(fornecedor_nome))
    except Exception:
        fornecedor_id = None

    # tenta via maps (agora respeitando fornecedor)
    if materials_by_fornecedor is not None and materials_fallback is not None:
        for mat in (materiais_list or []):
            if not mat:
                continue
            mat_key = normalize_name(mat)
            mat_info = None
            # primeiro tenta material específico do fornecedor (se tivermos fornecedor_id)
            if fornecedor_id is not None:
                mat_info = materials_by_fornecedor.get((mat_key, fornecedor_id))
            # depois tenta fallback global
            if not mat_info:
                mat_info = materials_fallback.get(mat_key)
            if not mat_info:
                continue
            grupo, valor_mat = mat_info
            if valor_mat is None:
                continue
            if grupo and 'sucata' in (grupo or '').lower():
                try:
                    if Decimal(str(valor_mat)) == 0:
                        continue
                    qtd = diff / Decimal(str(valor_mat))
                    if qtd < 0:
                        return None
                    return qtd
                except Exception:
                    return None
        return None

    # fallback DB: (mantém comportamento atual)
    for mat in (materiais_list or []):
        if not mat:
            continue
        mat_norm = normalize_name(mat)
        try:
            cursor.execute("""
                SELECT grupo, valor
                FROM materiais
                WHERE UPPER(TRIM(nome)) = %s
                LIMIT 1
            """, (mat_norm,))
            mat_row = cursor.fetchone()
        except Exception:
            mat_row = None
        if not mat_row:
            continue
        grupo = (mat_row[0] or '').strip().lower()
        valor_material = mat_row[1]
        try:
            valor_material = Decimal(str(valor_material))
        except Exception:
            valor_material = None
        if valor_material and grupo and 'sucata' in grupo:
            try:
                qtd = diff / valor_material
                if qtd < 0:
                    return None
                return qtd
            except Exception:
                return None
    return None

def calcular_valor_total_nf(reg):
    """
    Recebe um dict 'reg' (como o que você monta em listar_calculo_nfs)
    e retorna Decimal quantizado com 2 casas (valor_total_nf) ou None se não puder calcular.
    Não faz updates no DB — só calcula e devolve o valor.
    Campos usados (todos opcionais, tratados como 0 quando ausentes):
      - peso_integral, valor_integral, ipi
      - qtd_cobre, valor_unitario_1
      - qtd_zinco, valor_unitario_2
      - qtd_sucata, valor_unitario_3
      - peso_liquido, valor_mao_obra_tm_metallica, valor_unitario_energia
    """
    try:
        # garante Decimal seguros (caso valor seja None, '', float, str, etc)
        peso_integral = Decimal(reg.get('peso_integral') or 0)
        valor_integral = Decimal(reg.get('valor_integral') or 0)
        ipi = Decimal(reg.get('ipi') or 0)

        qtd_cobre = Decimal(reg.get('qtd_cobre') or 0)
        valor_unitario_1 = Decimal(reg.get('valor_unitario_1') or 0)

        qtd_zinco = Decimal(reg.get('qtd_zinco') or 0)
        valor_unitario_2 = Decimal(reg.get('valor_unitario_2') or 0)

        qtd_sucata = Decimal(reg.get('qtd_sucata') or 0)
        valor_unitario_3 = Decimal(reg.get('valor_unitario_3') or 0)

        peso_liquido = Decimal(reg.get('peso_liquido') or 0)
        valor_mao_obra_tm = Decimal(reg.get('valor_mao_obra_tm_metallica') or 0)
        valor_unitario_energia = Decimal(reg.get('valor_unitario_energia') or 0)

        # diferença de pesos (somente positiva)
        diferenca_peso = peso_liquido - peso_integral
        if diferenca_peso < 0:
            diferenca_peso = Decimal('0')

        # trata ipi como percentual (ex: 5 => 5%)
        valor_integral_com_ipi = valor_integral * (Decimal('1') + (ipi / Decimal('100')))

        valor_total_calc = (
            (peso_integral * valor_integral_com_ipi) +
            (qtd_cobre * valor_unitario_1) +
            (qtd_zinco * valor_unitario_2) +
            (qtd_sucata * valor_unitario_3) +
            (diferenca_peso * valor_mao_obra_tm) +
            (diferenca_peso * valor_unitario_energia)
        )

        return valor_total_calc.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except Exception as e:
        # opcional: log
        print("Erro calcular_valor_total_nf:", e)
        return None

def calcular_materia_prima_reg(reg):
    """
    Calcula Matéria Prima:
      (qtd_cobre * valor_unitario_1) + (qtd_zinco * valor_unitario_2) + (qtd_sucata * valor_unitario_3)
    Retorna Decimal quantizado com 2 casas ou None se não puder.
    """
    try:
        qtd_cobre = Decimal(reg.get('qtd_cobre') or 0)
        v1 = Decimal(reg.get('valor_unitario_1') or 0)
        qtd_zinco = Decimal(reg.get('qtd_zinco') or 0)
        v2 = Decimal(reg.get('valor_unitario_2') or 0)
        qtd_sucata = Decimal(reg.get('qtd_sucata') or 0)
        v3 = Decimal(reg.get('valor_unitario_3') or 0)

        materia = (qtd_cobre * v1) + (qtd_zinco * v2) + (qtd_sucata * v3)
        return materia.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except Exception as e:
        print("Erro calcular_materia_prima_reg:", e)
        return None

def calcular_mao_de_obra_reg(reg):
    try:
        peso_liq = safe_decimal_zero(reg.get('peso_liquido'))
        peso_int = safe_decimal_zero(reg.get('peso_integral'))
        diferenca = peso_liq - peso_int
        if diferenca < 0:
            diferenca = Decimal('0')

        val_mao = safe_decimal_zero(reg.get('valor_mao_obra_tm_metallica'))
        val_energia = safe_decimal_zero(reg.get('valor_unitario_energia'))

        mao = diferenca * (val_mao + val_energia)
        return mao.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except Exception as e:
        print("Erro calcular_mao_de_obra_reg:", e)
        return None
    
def calcular_custo_total_reg(reg):
    """
    Calcula e retorna Decimal quantizado (2 casas) para custo_total de um registro 'reg'.
    Regras:
      1) Se custo_total_manual > 0 -> usar custo_total_manual
      2) Senão, se valor_integral é vazio/0 -> custo = materia_prima + mao_de_obra
      3) Senão, se peso_liquido > 0 -> custo = valor_total_nf / peso_liquido
      4) Senão -> 0.00
    Retorna Decimal (quantizado) ou None em caso de erro.
    """
    try:
        # custo manual
        custo_manual_raw = reg.get('custo_total_manual')
        try:
            custo_manual = Decimal(custo_manual_raw) if custo_manual_raw is not None and str(custo_manual_raw) != '' else None
        except Exception:
            custo_manual = None

        # campos usados
        vtf = Decimal(reg.get('valor_total_nf') or 0)
        mpf = Decimal(reg.get('materia_prima') or 0)
        maf = Decimal(reg.get('mao_de_obra') or 0)

        try:
            valor_integral_dec = Decimal(reg.get('valor_integral') or 0)
        except Exception:
            valor_integral_dec = Decimal('0')

        try:
            peso_liq = Decimal(reg.get('peso_liquido') or 0)
        except Exception:
            peso_liq = Decimal('0')

        # regra 1
        if custo_manual is not None and custo_manual > 0:
            return custo_manual.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        # regra 2
        if valor_integral_dec == 0:
            return (mpf + maf).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        # regra 3
        if peso_liq != 0:
            custo = vtf / peso_liq
            return custo.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        # fallback
        return Decimal('0.00').quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    except Exception as e:
        print("Erro calcular_custo_total_reg:", e)
        return None

@calculo_bp.app_template_filter('br')
def format_br_filter(value, decimals=2):
    """
    Formata Decimal/float/int para estilo BR: milhares com '.' e decimais com ','.
    Ex: 1234.5 com decimals=3 -> "1.234,500"
    """
    try:
        if value is None or value == '':
            return ''
        # garante Decimal
        val = Decimal(value) if not isinstance(value, Decimal) else value
        # quantiza para o número de decimais desejado (evita representação científica)
        quant = Decimal('1.' + ('0' * decimals)) if decimals > 0 else Decimal('1')
        # Use quantize construído corretamente: ex: '0.001'
        q_str = '0' if decimals == 0 else ('0.' + '0'*(decimals-1) + '1')
        q = val.quantize(Decimal(q_str), rounding=ROUND_HALF_UP)
        # construindo string com separador de milhares
        sign, digits, exp = q.as_tuple()
        s = f"{q:.{decimals}f}"
        intp, decp = s.split('.')
        intp_formatted = f"{int(intp):,}".replace(',', '.')  # usa a formatação do Python e troca vírgula por ponto
        return f"{'-' if sign else ''}{intp_formatted},{decp}"
    except Exception:
        try:
            return str(value)
        except Exception:
            return ''

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
        # Seleciona também campos usados no cálculo de valor_total_nf / mao_de_obra / materia_prima
        cur.execute("""
            SELECT
                en.id AS entrada_id,
                en.data AS entrada_data,
                en.nf AS entrada_nf,
                en.produto AS entrada_produto,
                en.fornecedor AS entrada_fornecedor,
                en.material_1, en.material_2, en.material_3, en.material_4, en.material_5,
                en.peso_liquido AS peso_liquido,
                en.peso_integral AS peso_integral,
                en.valor_integral, en.ipi,
                en.valor_unitario_1, en.valor_unitario_2, en.valor_unitario_3,
                en.valor_mao_obra_tm_metallica, en.valor_unitario_energia,
                cn.id AS calculo_id,
                COALESCE(cn.quantidade_estoque, 0) AS quantidade_estoque,
                cn.qtd_cobre, cn.qtd_zinco, cn.qtd_sucata,
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
                'fornecedor': r[4],
                'material_1': r[5],
                'material_2': r[6],
                'material_3': r[7],
                'material_4': r[8],
                'material_5': r[9],
                'peso_liquido': r[10],
                'peso_integral': r[11],
                'valor_integral': r[12],
                'ipi': r[13],
                'valor_unitario_1': r[14],
                'valor_unitario_2': r[15],
                'valor_unitario_3': r[16],
                'valor_mao_obra_tm_metallica': r[17],
                'valor_unitario_energia': r[18],
                'id': r[19],
                'quantidade_estoque': r[20],
                'qtd_cobre': r[21],
                'qtd_zinco': r[22],
                'qtd_sucata': r[23],
                'valor_total_nf': r[24],
                'mao_de_obra': r[25],
                'materia_prima': r[26],
                'custo_total_manual': r[27],
                'custo_total': r[28],
            })

        # formata datas simples
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

        # ------------------------------
        # Pré-carrega produtos, fornecedores e materiais em memória (mapas)
        # ------------------------------
        prod_map = {}
        forn_map = {}
        materials_by_fornecedor = {}
        materials_fallback = {}

        try:
            cur.execute("SELECT nome, percentual_cobre, percentual_zinco FROM produtos")
            for nome, pct_c, pct_z in cur.fetchall():
                key = normalize_name(nome)
                try:
                    pct_c_frac = (Decimal(str(pct_c)) / Decimal('100')) if pct_c is not None else None
                except Exception:
                    pct_c_frac = None
                try:
                    pct_z_frac = (Decimal(str(pct_z)) / Decimal('100')) if pct_z is not None else None
                except Exception:
                    pct_z_frac = None
                prod_map[key] = (pct_c_frac, pct_z_frac)
        except Exception:
            # fallback para apenas percentual_cobre (compatibilidade)
            try:
                cur.execute("SELECT nome, percentual_cobre FROM produtos")
                for nome, pct in cur.fetchall():
                    key = normalize_name(nome)
                    try:
                        pct_c_frac = (Decimal(str(pct)) / Decimal('100')) if pct is not None else None
                    except Exception:
                        pct_c_frac = None
                    prod_map[key] = (pct_c_frac, None)
            except Exception as e:
                print("Aviso: falha ao carregar produtos:", e)
                prod_map = {}

        try:
            cur.execute("SELECT id, nome FROM fornecedores")
            for fid, nome in cur.fetchall():
                if nome:
                    forn_map[normalize_name(nome)] = fid
        except Exception as e:
            print("Aviso: falha ao carregar fornecedores:", e)
            forn_map = {}

        try:
            cur.execute("SELECT id, nome, fornecedor_id, grupo, valor FROM materiais")
            for mid, nome, fornecedor_id, grupo, valor in cur.fetchall():
                key = normalize_name(nome)
                try:
                    valor_dec = Decimal(str(valor)) if valor is not None else None
                except Exception:
                    valor_dec = None
                grp = (grupo or '').strip()
                if fornecedor_id is not None:
                    materials_by_fornecedor[(key, int(fornecedor_id))] = (grp.lower(), valor_dec)
                if key not in materials_fallback:
                    materials_fallback[key] = (grp.lower(), valor_dec)
        except Exception as e:
            print("Aviso: falha ao carregar materiais:", e)
            materials_by_fornecedor = {}
            materials_fallback = {}

        # ------------------------------
        # calcula qtd_cobre, qtd_zinco, qtd_sucata e as colunas de custo usando funções auxiliares
        # ------------------------------
        for reg in registros:
            try:
                produto_nome = reg.get('produto') or ''
                fornecedor_nome = reg.get('fornecedor') or ''
                materiais_list = [reg.get('material_1'), reg.get('material_2'), reg.get('material_3'),
                                  reg.get('material_4'), reg.get('material_5')]
                peso_liq = reg.get('peso_liquido') or 0
                peso_int = reg.get('peso_integral') or 0

                # cobre
                existing_cobre = reg.get('qtd_cobre')
                if existing_cobre is None or Decimal(str(existing_cobre or 0)) == 0:
                    try:
                        cobre_calc = calcular_qtd_cobre(cur, produto_nome, fornecedor_nome, materiais_list, peso_liq, peso_int,
                                                        prod_map=prod_map, forn_map=forn_map,
                                                        materials_by_fornecedor=materials_by_fornecedor,
                                                        materials_fallback=materials_fallback)
                        if cobre_calc is not None:
                            q_cobre = Decimal(str(cobre_calc)).quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)
                            reg['qtd_cobre'] = q_cobre
                        else:
                            reg['qtd_cobre'] = None
                    except Exception as e:
                        print("Aviso: erro ao calcular qtd_cobre (função) para entrada_id", reg.get('entrada_id'), e)

                # zinco
                existing_zinco = reg.get('qtd_zinco')
                if existing_zinco is None or Decimal(str(existing_zinco or 0)) == 0:
                    try:
                        zinco_calc = calcular_qtd_zinco(cur, produto_nome, fornecedor_nome, materiais_list, peso_liq, peso_int,
                                                        prod_map=prod_map, forn_map=forn_map,
                                                        materials_by_fornecedor=materials_by_fornecedor,
                                                        materials_fallback=materials_fallback)
                        if zinco_calc is not None:
                            q_zinco = Decimal(str(zinco_calc)).quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)
                            reg['qtd_zinco'] = q_zinco
                        else:
                            reg['qtd_zinco'] = None
                    except Exception as e:
                        print("Aviso: erro ao calcular qtd_zinco (função) para entrada_id", reg.get('entrada_id'), e)

                # sucata (agora passando forn_map para respeitar materiais por fornecedor)
                existing_sucata = reg.get('qtd_sucata')
                if existing_sucata is None or Decimal(str(existing_sucata or 0)) == 0:
                    try:
                        sucata_calc = calcular_qtd_sucata(cur, fornecedor_nome, materiais_list, peso_liq, peso_int,
                                                          materials_by_fornecedor=materials_by_fornecedor,
                                                          materials_fallback=materials_fallback,
                                                          forn_map=forn_map)
                        if sucata_calc is not None:
                            q_sucata = Decimal(str(sucata_calc)).quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)
                            reg['qtd_sucata'] = q_sucata
                        else:
                            reg['qtd_sucata'] = None
                    except Exception as e:
                        print("Aviso: erro ao calcular qtd_sucata para entrada_id", reg.get('entrada_id'), e)

                # valor_total_nf (apenas parte NF: peso_integral * valor_integral_com_ipi)
                try:
                    calc_val = calcular_valor_total_nf(reg)
                    existing_valor = reg.get('valor_total_nf')
                    if calc_val is not None:
                        # mantem valor salvo > 0; caso contrário preenche com o calculado
                        if existing_valor is None or Decimal(str(existing_valor or 0)) == 0:
                            reg['valor_total_nf'] = calc_val
                except Exception as e:
                    print("Aviso: erro ao atribuir valor_total_nf para entrada_id", reg.get('entrada_id'), e)

                # ----------------------------
                # matéria-prima e mão-de-obra:
                # calculamos o TOTAL (como já vinha sendo feito)
                # e também o VALOR UNITÁRIO:
                # - MATÉRIA-PRIMA: unitário por PESO_LÍQUIDO (ou desktop-flow quando valor_integral existe)
                # - MÃO-DE-OBRA: unitário por DIFERENÇA_DE_PESO (mantido)
                # ----------------------------
                try:
                    calc_mat_total = calcular_materia_prima_reg(reg)  # total (R$) -> soma(qtd * valor_unit)
                except Exception as e:
                    calc_mat_total = None
                    print("Aviso: erro ao calcular materia_prima (total) para entrada_id", reg.get('entrada_id'), e)

                try:
                    calc_mao_total = calcular_mao_de_obra_reg(reg)  # total (R$)
                except Exception as e:
                    calc_mao_total = None
                    print("Aviso: erro ao calcular mao_de_obra (total) para entrada_id", reg.get('entrada_id'), e)

                # pega pesos com segurança
                try:
                    peso_liq_dec = Decimal(reg.get('peso_liquido') or 0)
                except Exception:
                    peso_liq_dec = Decimal('0')
                try:
                    peso_int_dec = Decimal(reg.get('peso_integral') or 0)
                except Exception:
                    peso_int_dec = Decimal('0')

                # diferença de peso (usar como denominador para obtenção do unitário da mão-de-obra)
                try:
                    diferenca_peso = peso_liq_dec - peso_int_dec
                    if diferenca_peso <= 0:
                        diferenca_peso = None
                except Exception:
                    diferenca_peso = None

                # Primeiro atribui mão-de-obra (total e unitário) — necessário antes de calcular custo_total quando valor_integral existe
                try:
                    if calc_mao_total is not None:
                        reg['mao_de_obra_total'] = Decimal(calc_mao_total).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                        if diferenca_peso:
                            unit_mao = (Decimal(calc_mao_total) / diferenca_peso).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                            reg['mao_de_obra'] = unit_mao
                        else:
                            reg['mao_de_obra'] = Decimal(calc_mao_total).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    else:
                        reg['mao_de_obra_total'] = None
                        reg['mao_de_obra'] = None
                except Exception as e:
                    print("Aviso: erro ao atribuir mao_de_obra para entrada_id", reg.get('entrada_id'), e)
                    reg['mao_de_obra_total'] = None
                    reg['mao_de_obra'] = None

                # Agora: calcular custo_total (unitário) usando a função centralizada.
                # Isso é importante porque, no desktop, quando valor_integral existe, a matéria-prima unitária
                # é obtida como (custo_total_unitario - mao_de_obra_unitario).
                try:
                    calc_ct = calcular_custo_total_reg(reg)
                    if calc_ct is not None:
                        reg['custo_total'] = calc_ct
                    else:
                        reg['custo_total'] = Decimal('0.00').quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                except Exception as e:
                    print("Aviso: erro ao atribuir custo_total para entrada_id", reg.get('entrada_id'), e)
                    reg['custo_total'] = Decimal('0.00').quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

                # Agora decide materia_prima seguindo 1:1 com o desktop:
                # - Se valor_integral existe (não nulo e != 0) => materia_prima_unit = custo_total_unit - mao_de_obra_unit
                # - Senão => materia_prima_unit = calc_mat_total / peso_liq_dec  (se possível)
                try:
                    if reg.get('valor_integral') not in (None, '') and Decimal(str(reg.get('valor_integral') or 0)) != 0:
                        # segue fluxo desktop: unitário = custo_total (unit) - mao_de_obra (unit)
                        try:
                            custo_unit = Decimal(reg.get('custo_total') or 0)
                            mao_unit = Decimal(reg.get('mao_de_obra') or 0)
                            materia_unit = custo_unit - mao_unit
                            # guarda total (se calculado) e unitário
                            reg['materia_prima_total'] = (Decimal(calc_mat_total).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                                                         if calc_mat_total is not None else None)
                            reg['materia_prima'] = materia_unit.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                        except Exception:
                            reg['materia_prima_total'] = None
                            reg['materia_prima'] = None
                    else:
                        # sem valor_integral: usar total calculado dividido por peso_liquido (compatível com desktop)
                        if calc_mat_total is not None:
                            total_mat = Decimal(calc_mat_total)
                            reg['materia_prima_total'] = total_mat.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                            if peso_liq_dec > 0:
                                unit_mat = (total_mat / peso_liq_dec).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                                reg['materia_prima'] = unit_mat
                            else:
                                # sem peso_liquido definido, manter total
                                reg['materia_prima'] = total_mat.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                        else:
                            reg['materia_prima_total'] = None
                            reg['materia_prima'] = None
                except Exception as e:
                    print("Aviso: erro ao atribuir materia_prima para entrada_id", reg.get('entrada_id'), e)
                    reg['materia_prima_total'] = None
                    reg['materia_prima'] = None

                # --- persistir cálculos no DB (upsert por entrada_id)
                try:
                    entrada_id_val = reg.get('entrada_id')
                    if entrada_id_val is not None:
                        v_qtd_cobre = reg.get('qtd_cobre')
                        v_qtd_zinco = reg.get('qtd_zinco')
                        v_qtd_sucata = reg.get('qtd_sucata')
                        v_valor_total_nf = reg.get('valor_total_nf')
                        v_mao_de_obra = reg.get('mao_de_obra')
                        v_materia_prima = reg.get('materia_prima')
                        v_custo_total = reg.get('custo_total')

                        upsert_sql = """
                            INSERT INTO calculo_nfs (
                                entrada_id, qtd_cobre, qtd_zinco, qtd_sucata,
                                valor_total_nf, mao_de_obra, materia_prima, custo_total
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (entrada_id) DO UPDATE SET
                                qtd_cobre = COALESCE(EXCLUDED.qtd_cobre, calculo_nfs.qtd_cobre),
                                qtd_zinco = COALESCE(EXCLUDED.qtd_zinco, calculo_nfs.qtd_zinco),
                                qtd_sucata = COALESCE(EXCLUDED.qtd_sucata, calculo_nfs.qtd_sucata),
                                valor_total_nf = COALESCE(EXCLUDED.valor_total_nf, calculo_nfs.valor_total_nf),
                                mao_de_obra = COALESCE(EXCLUDED.mao_de_obra, calculo_nfs.mao_de_obra),
                                materia_prima = COALESCE(EXCLUDED.materia_prima, calculo_nfs.materia_prima),
                                custo_total = COALESCE(EXCLUDED.custo_total, calculo_nfs.custo_total)
                        """
                        cur.execute(upsert_sql, (
                            entrada_id_val,
                            v_qtd_cobre, v_qtd_zinco, v_qtd_sucata,
                            v_valor_total_nf, v_mao_de_obra, v_materia_prima, v_custo_total
                        ))
                except Exception as e:
                    # loga, mas não quebra a listagem
                    print("Aviso: falha ao salvar calculos para entrada_id", reg.get('entrada_id'), e)

            except Exception as e:
                print("Aviso: erro no loop de pré-cálculo para entrada_id", reg.get('entrada_id'), e)

        # commit dos upserts feitos acima
        try:
            conn.commit()
        except Exception as e:
            print("Aviso: falha no commit dos cálculos:", e)
            try:
                conn.rollback()
            except Exception:
                pass

        # lista de produtos para dropdown
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
    produto = request.form.get('produto')
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
        filtro_por_entrada_id = False
        entrada_id_val = None
        try:
            entrada_id_val = int(produto)
            filtro_por_entrada_id = True
        except Exception:
            filtro_por_entrada_id = False

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
                cur.execute("""
                    SELECT cn.id, cn.quantidade_estoque, en.peso_liquido, en.id AS entrada_id, en.produto
                    FROM calculo_nfs cn
                    JOIN entrada_nf en ON cn.entrada_id = en.id
                    WHERE LOWER(en.produto) = LOWER(%s)
                    ORDER BY en.data ASC NULLS LAST, en.id ASC
                """, (produto,))
        else:
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
            nome_from_entry = r[4]

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
            else:
                limite = peso_liq - qtd_atual
                if limite <= 0:
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
