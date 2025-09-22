// static/js/calculo_nfs.js
document.addEventListener('DOMContentLoaded', () => {
  const page = document.getElementById('calc-nfs-page');
  if (!page) return;
  const $ = sel => page.querySelector(sel);
  const $$ = sel => Array.from(page.querySelectorAll(sel));

  const DECIMALS = {
    quantidade_estoque: 3,
    qtd_cobre: 3,
    qtd_zinco: 3, // <-- certifica-se de 3 casas
    qtd_sucata: 3,
    valor_total_nf: 2,
    mao_de_obra: 2,
    materia_prima: 2,
    custo_total_manual: 2,
    custo_total: 2,
    peso_liquido: 3
  };

  const formNova = $('#form-nova-entrada');
  const selectNovoProduto = formNova ? formNova.querySelector('select[name="id_produto"], #novo_produto') : null;
  const inputNovoQtd = formNova ? formNova.querySelector('input[name="quantidade_estoque"], #novo_qtd') : null;

  function parseBRNumber(str) {
    if (str === null || str === undefined) return NaN;
    const s = String(str).trim();
    if (s === '') return NaN;
    return Number(s.replace(/\./g, '').replace(',', '.'));
  }

  function formatBR(n, decimals) {
    if (n === null || n === undefined || isNaN(n)) return '';
    const fixed = Number(n).toFixed(decimals);
    const parts = fixed.split('.');
    let intPart = parts[0];
    const decPart = parts[1] || '';
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return intPart + ',' + decPart;
  }

  // ---------------------------
  // novo: formatação com preservação de caret
  // ---------------------------
  function onlyDigitsAndCommaDot(str) {
    return String(str).replace(/[^\d\.,\-]/g, '');
  }

  // conta quantos dígitos (0-9) existem antes da posição pos em s
  function countDigitsBefore(s, pos) {
    let cnt = 0;
    for (let i = 0; i < Math.min(pos, s.length); i++) {
      if (/\d/.test(s[i])) cnt++;
    }
    return cnt;
  }

  // encontra posição (index) no string formatted onde ocorre o n-ésimo dígito (n >= 0)
  function findPosOfNthDigit(formatted, n) {
    let cnt = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) {
        if (cnt === n) return i + 1; // coloca cursor depois desse dígito
        cnt++;
      }
    }
    return formatted.length;
  }

  // formata mantendo cursor: el é <input>, decimals define casas decimais
  function setFormattedInputValuePreserveCaret(el, decimals) {
    const raw = el.value;
    if (raw === '') return;
    const selStart = el.selectionStart || 0;

    // conte quantos dígitos estavam antes do caret no raw
    const rawClean = onlyDigitsAndCommaDot(raw);
    const digitsBefore = countDigitsBefore(rawClean, selStart);

    // converte rawClean para Number (aceita ',' ou '.')
    let numericStr = rawClean.replace(/\./g, '').replace(/,/g, '.');
    // caso contenha vários pontos/virgulas estranhos, tenta limpar
    const matches = numericStr.match(/-?\d+(\.\d+)?/);
    if (!matches) {
      // se não for numérico, apenas sanitiza
      el.value = rawClean;
      return;
    }
    let n = Number(matches[0]);
    if (isNaN(n)) {
      el.value = rawClean;
      return;
    }

    // aplicar formatação com fartas casas decimais
    const formatted = formatBR(n, decimals);

    // encontrar nova posição do caret baseada em digitsBefore
    const newPos = findPosOfNthDigit(formatted, digitsBefore - 1);
    el.value = formatted;
    // set selection (try/catch para navegadores antigos)
    try {
      el.setSelectionRange(newPos, newPos);
    } catch (e) {
      // ignore
    }
  }

  // ---------------------------
  // fim: caret-safe formatting
  // ---------------------------

  function updateRowStatus() {
    // percorre todas as linhas e aplica classes ao input quantidade_estoque
    $$('tbody tr').forEach(tr => {
      const inputQty = tr.querySelector('input[data-field="quantidade_estoque"]');
      const inputPeso = tr.querySelector('input[data-field="peso_liquido"]');

      if (!inputQty || !inputPeso) return;

      // pega valores numéricos (parseBRNumber já existe)
      const q = Number(parseBRNumber(inputQty.value) || 0);
      const p = Number(parseBRNumber(inputPeso.value) || 0);

      // tolerância baseada nas casas decimais da quantidade_estoque
      const decimals = DECIMALS.quantidade_estoque ?? 3;
      const eps = Math.pow(10, -decimals) / 2;

      // limpa classes antigas
      inputQty.classList.remove('val-ok', 'val-modified', 'val-zero');

      // aplica classes na prioridade desejada: zero -> igualdade -> modificado
      if (Math.abs(q) <= eps) {
        inputQty.classList.add('val-zero');
      } else if (Math.abs(q - p) <= eps) {
        inputQty.classList.add('val-ok');
      } else {
        inputQty.classList.add('val-modified');
      }
    });
  }

  function showResultModal(title, items, totalAlterado) {
    const old = document.getElementById('cnf-result-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'cnf-result-modal';
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.background = 'rgba(0,0,0,0.4)';
    modal.style.zIndex = 9999;

    const box = document.createElement('div');
    box.style.background = '#fff';
    box.style.borderRadius = '8px';
    box.style.padding = '16px';
    box.style.minWidth = '320px';
    box.style.maxWidth = '90%';
    box.style.maxHeight = '80%';
    box.style.overflow = 'auto';
    box.style.boxShadow = '0 6px 30px rgba(0,0,0,0.25)';

    const h = document.createElement('h3');
    h.textContent = title;
    h.style.marginTop = '0';
    box.appendChild(h);

    const summary = document.createElement('p');
    summary.textContent = `Quantidade total alterada: ${totalAlterado}`;
    box.appendChild(summary);

    const list = document.createElement('div');
    list.style.marginTop = '8px';

    // monta cada item — cada row recebe data-entrada-id para referencia posterior
    items.forEach(it => {
      const row = document.createElement('div');
      row.style.padding = '8px';
      row.style.borderBottom = '1px solid #eee';
      row.dataset.entradaId = String(it.entrada_id); // <-- adiciona atributo para identificar
      const nfLine = document.createElement('div');
      nfLine.style.fontWeight = '600';
      nfLine.textContent = `NF: ${it.nf_display}`;
      row.appendChild(nfLine);
      const details = document.createElement('div');
      details.style.fontSize = '13px';
      details.style.marginTop = '4px';
      details.innerHTML = `
        <div>entrada_id: ${it.entrada_id} — cn_id: ${it.cn_id}</div>
        <div>alterado: ${it.alterado}</div>
        ${it.qtd_anterior !== undefined ? `<div>anterior → ${it.qtd_anterior} / nova → ${it.qtd_nova}</div>` : ''}
        ${it.motivo ? `<div>motivo: ${it.motivo}</div>` : ''}
      `;
      row.appendChild(details);
      list.appendChild(row);
    });
    box.appendChild(list);

    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.textContent = 'Fechar';
    btnClose.style.marginTop = '12px';
    btnClose.style.padding = '8px 12px';
    btnClose.style.border = 'none';
    btnClose.style.borderRadius = '6px';
    btnClose.style.cursor = 'pointer';
    btnClose.addEventListener('click', () => modal.remove());
    box.appendChild(btnClose);

    modal.appendChild(box);
    document.body.appendChild(modal);

    // se existir item destacado, rola o modal para que ele apareça próximo ao topo do box
    const highlighted = items.find(it => it._is_destaque);
    if (highlighted) {
      const rowEl = list.querySelector(`div[data-entrada-id="${highlighted.entrada_id}"]`);
      if (rowEl) {
        // rola suavemente o box para esse elemento (coloca no topo)
        setTimeout(() => {
          // scroll do container (box) — utilizamos box (o elemento com overflow:auto)
          rowEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    }
  }

  // =====================
  // MÁSCARA DINÂMICA: quantidade_estoque (3 decimais)
  // =====================

  /**
   * Formata inteiro (representando unidades de 10^-decimals) para BR com separador de milhares e vírgula.
   * Ex: intVal=1234, decimals=3 -> "1,234" (onde intVal representa 1.234)
   */
  function formatIntegerAsBR(intVal, decimals) {
    const neg = intVal < 0;
    let abs = String(Math.abs(Number(intVal)));
    // garante pelo menos decimals+1 characters para simplificar (preenche com zeros à esquerda)
    while (abs.length <= decimals) abs = '0' + abs;
    const intPart = abs.slice(0, abs.length - decimals) || '0';
    const decPart = abs.slice(abs.length - decimals);
    const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + intFormatted + ',' + decPart;
  }

  /**
   * Handler para comportamento dinâmico de "quantidade" com casas fixas (ex.: 3 decimais).
   * - Mantém apenas dígitos (ignora outros caracteres)
   * - Interpreta toda a sequência como um inteiro e "move" a vírgula 3 casas da direita
   * - Atualiza o input e posiciona o cursor ao final (comportamento natural para esse tipo de máscara)
   */
  function handleDynamicQuantityInput(el, decimals = 3) {
    // pega apenas dígitos do valor atual (mantendo sinal se houver)
    const onlyDigits = (el.value || '').replace(/[^\d\-]/g, '');
    // remove zeros à esquerda, mas mantém ao menos um zero se ficar vazio
    let newRaw = onlyDigits.replace(/^0+(?=\d)/, '');
    if (newRaw === '') {
      // se o usuário apagou tudo, mantemos campo vazio
      el.dataset._raw_value = '';
      el.value = '';
      return;
    }
    el.dataset._raw_value = newRaw;

    // usar Number para valores "normais"; caso precise de mais precisão, adaptar para BigInt
    let intVal = Number(newRaw);
    if (!isFinite(intVal)) intVal = 0;

    el.value = formatIntegerAsBR(intVal, decimals);

    // posicione cursor ao final para comportamento natural de máscara dinâmica
    try {
      el.setSelectionRange(el.value.length, el.value.length);
    } catch (e) {
      // ignore
    }
  }

  // =====================
  // FIM MÁSCARA DINÂMICA
  // =====================

  // Add / subtract behavior (keeps your original server call)
  page.addEventListener('click', ev => {
    const btn = ev.target.closest('.btn-icon');
    if (!btn) return;
    ev.preventDefault();

    if (formNova && formNova.contains(btn)) {
      const produtoVal = selectNovoProduto ? selectNovoProduto.value : '';
      if (!produtoVal) { alert('Selecione um produto antes de distribuir a quantidade.'); return; }

      const raw = inputNovoQtd ? String(inputNovoQtd.value || '').trim() : '';
      const quantidade = parseBRNumber(raw);
      if (isNaN(quantidade) || quantidade <= 0) { alert('Informe uma quantidade válida (> 0) na entrada.'); return; }

      const operacao = (btn.classList.contains('plus') || btn.textContent.trim() === '+') ? 'Adicionar' : 'Subtrair';

      const btns = formNova.querySelectorAll('.btn-icon');
      btns.forEach(b => b.disabled = true);

      const body = new URLSearchParams();
      body.append('produto', produtoVal);
      body.append('valor', String(quantidade));
      body.append('operacao', operacao);
      body.append('usuario', '');

      fetch('/calculo_nfs/distribuir_quantidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      }).then(async res => {
        btns.forEach(b => b.disabled = false);
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const altered = data && data.quantidade_total_alterada ? data.quantidade_total_alterada : '0';
          const detalhes = data && data.detalhes ? data.detalhes : [];

          const changed = (detalhes || []).filter(d => {
            const antes = Number(d.qtd_anterior ?? 0);
            const depois = Number(d.qtd_nova ?? 0);
            const alt = Number(d.alterado ?? 0);
            return alt !== 0 || antes !== depois;
          });

          // atualiza inputs
          changed.forEach(d => {
            const entradaId = String(d.entrada_id);
            const tr = page.querySelector(`tbody tr[data-entrada-id="${entradaId}"]`);
            if (!tr) return;
            const inputQtd = tr.querySelector('input[data-field="quantidade_estoque"]');
            if (inputQtd) {
              // atualiza raw e valor formatado conforme máscara dinâmica
              inputQtd.dataset._raw_value = String((d.qtd_nova || '').toString().replace(/[^\d\-]/g, ''));
              // tentou converter como número com casas decimais; transformamos para inteiro raw => multiplicar por 10^decimals
              // se payload do servidor já for string decimal "123.456", converteremos para inteiro de casas fixas:
              const decimals = DECIMALS.quantidade_estoque ?? 3;
              let numeric = parseBRNumber(d.qtd_nova);
              if (!isNaN(numeric)) {
                const intRep = String(Math.round(Math.abs(numeric) * Math.pow(10, decimals)));
                inputQtd.dataset._raw_value = intRep;
                inputQtd.value = formatIntegerAsBR(Number(intRep), decimals);
              } else {
                // fallback: escreve como BR (caso servidor tenha devolvido já em formato adequado)
                inputQtd.value = formatBR(d.qtd_nova, DECIMALS.quantidade_estoque);
              }
            }
          });

          updateRowStatus();

          // destaque: escolhe a última alteração
          let destaque = null;
          if (changed.length > 0) destaque = changed[changed.length - 1];

          // remove destaque antigo (tr e tds)
          $$('tbody tr.linha-alterada').forEach(tr => {
            tr.classList.remove('linha-alterada');
            tr.querySelectorAll('td').forEach(td => td.classList.remove('linha-alterada'));
          });

          // --------- AQUI: reordena os detalhes para que o "destaque" vá para o topo do modal ----------
          const detalhesReordenados = Array.isArray(detalhes) ? detalhes.slice() : [];
          if (destaque) {
            const idx = detalhesReordenados.findIndex(d => String(d.entrada_id) === String(destaque.entrada_id));
            if (idx > -1) {
              const [itemD] = detalhesReordenados.splice(idx, 1);
              // marca para posterior rolagem no modal
              itemD._is_destaque = true;
              detalhesReordenados.unshift(itemD);
            }
          }
          // caso não exista destaque ou não tenha sido encontrado, detalhesReordenados fica igual a detalhes

          // monta items e aplica destaque apenas na linha escolhida (a última)
          const items = (detalhesReordenados || []).map(d => {
            const entradaId = String(d.entrada_id);
            const tr = page.querySelector(`tbody tr[data-entrada-id="${entradaId}"]`);
            let nf_display = entradaId;
            if (tr) {
              const td_nf = tr.querySelector('.td-nf');
              if (td_nf) nf_display = td_nf.textContent.trim() || entradaId;

              // aplica destaque na <tr> e nas <td> (garante que sticky cells também fiquem amareladas)
              if (destaque && String(destaque.entrada_id) === entradaId) {
                tr.classList.add('linha-alterada');
                tr.querySelectorAll('td').forEach(td => td.classList.add('linha-alterada'));
                // scroll to highlighted row in table
                setTimeout(() => tr.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
              }
            }

            // devolve o objeto de item para o modal; mantém _is_destaque se presente
            return {
              entrada_id: entradaId,
              cn_id: d.cn_id,
              alterado: d.alterado,
              qtd_anterior: d.qtd_anterior,
              qtd_nova: d.qtd_nova,
              motivo: d.motivo,
              nf_display,
              _is_destaque: Boolean(d._is_destaque)
            };
          });

          showResultModal(`${operacao} concluído`, items, altered);

        } else {
          const txt = await res.text().catch(() => 'Erro desconhecido');
          alert('Erro ao distribuir quantidade: ' + txt);
        }
      }).catch(err => {
        btns.forEach(b => b.disabled = false);
        alert('Erro na requisição: ' + err);
      });

      return;
    }

    // local +/- behavior for input on same row (unchanged)
    const container = btn.closest('.form-actions-inline') || btn.closest('.form-row') || btn.closest('tr') || page;
    if (!container) return;
    const input = container.querySelector('input.inline-input, input.input-inline, input[data-field]');
    if (!input || input.disabled) return;

    const rawVal = String(input.value || '').trim();
    let value = rawVal === '' ? 0 : parseBRNumber(rawVal) || 0;
    const field = input.dataset.field;
    const decimals = DECIMALS[field] ?? 0;
    const step = Math.pow(10, -decimals);

    if (btn.classList.contains('plus') || btn.textContent.trim() === '+') value += step;
    else if (btn.classList.contains('minus') || btn.textContent.trim() === '−' || btn.textContent.trim() === '-') value = Math.max(0, value - step);

    input.value = formatBR(value, decimals);
    input.dispatchEvent(new Event('change'));
  });

  // EDIT toggle
  page.addEventListener('click', ev => {
    const editBtn = ev.target.closest('.edit-icon, .edit');
    if (!editBtn) return;
    const tr = editBtn.closest('tr');
    if (!tr) return;
    const isEditing = tr.classList.toggle('editing');
    tr.querySelectorAll('.inline-input, .input-inline, input[data-field], select[data-field]').forEach(i => { i.disabled = !isEditing; });
    editBtn.textContent = isEditing ? 'OK' : '✏️';
  });

  // Busca
  const search = $('#search_nf');
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      $$('tbody tr').forEach(tr => {
        const tdId = tr.querySelector('.td-id')?.textContent || '';
        const prodTxt = tr.querySelector('.td-produto')?.textContent.trim().toLowerCase() || '';
        const nfTxt = tr.querySelector('.td-nf')?.textContent.trim().toLowerCase() || '';
        tr.style.display = tdId.includes(q) || prodTxt.includes(q) || nfTxt.includes(q) ? '' : 'none';
      });
    });
  }

  // formatação / paste handlers (mantive os seus)
  function formatInputValueForDisplay(raw, decimals) {
    if (raw === null || raw === undefined || raw === '') return '';
    const n = Number(String(raw).replace(',', '.').replace(/\s/g, ''));
    if (isNaN(n)) return raw;
    const fixed = n.toFixed(decimals);
    const parts = fixed.split('.');
    let intPart = parts[0];
    const decPart = parts[1] || '';
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return intPart + ',' + decPart;
  }

  // aplica formatação nas células da tabela ao carregar (para colunas numéricas)
  function formatTableNumericCells() {
    // formata células <td> que possuem input[data-field] ou atributo data-format (fallback)
    $$('tbody tr').forEach(tr => {
      // procurar inputs (valores editáveis)
      tr.querySelectorAll('input[data-field]').forEach(inp => {
        const field = inp.dataset.field;
        const decimals = DECIMALS[field] ?? 2;
        // se tiver valor inicial não formatado, formata
        if (inp.value && inp.value.trim() !== '') {
          try {
            // Para quantidade_estoque, se valor já vier como decimal "1.234,567" deixamos;
            // se vier como número simples "1234.567", parseBRNumber lida com isso.
            const num = parseBRNumber(inp.value);
            if (!isNaN(num)) {
              if (field === 'quantidade_estoque') {
                // converte decimal para representação inteira raw (ex: 1.234,567 -> raw "1234567")
                const mult = Math.pow(10, DECIMALS.quantidade_estoque);
                const intRep = String(Math.round(Math.abs(num) * mult));
                inp.dataset._raw_value = intRep;
                inp.value = formatIntegerAsBR(Number(intRep), DECIMALS.quantidade_estoque);
              } else {
                inp.value = formatBR(num, decimals);
              }
            }
          } catch (e) {}
        } else {
          // às vezes o valor está em atributo data-value
          const dv = inp.getAttribute('data-value');
          if (dv) {
            const n = Number(String(dv).replace(',', '.'));
            if (!isNaN(n)) {
              if (inp.dataset.field === 'quantidade_estoque') {
                const mult = Math.pow(10, DECIMALS.quantidade_estoque);
                const intRep = String(Math.round(Math.abs(n) * mult));
                inp.dataset._raw_value = intRep;
                inp.value = formatIntegerAsBR(Number(intRep), DECIMALS.quantidade_estoque);
              } else {
                inp.value = formatBR(n, DECIMALS[inp.dataset.field] ?? 2);
              }
            }
          }
        }
      });

      // também formata <td data-field="..."> que não tenham input (apenas texto)
      tr.querySelectorAll('td[data-field]').forEach(td => {
        const field = td.dataset.field;
        const decimals = DECIMALS[field] ?? 2;
        const txt = (td.textContent || '').trim();
        if (!txt) return;
        const num = parseBRNumber(txt);
        if (!isNaN(num)) {
          td.textContent = formatBR(num, decimals);
        }
      });
    });
  }

  page.addEventListener('blur', ev => {
    const el = ev.target;
    if (!el.matches('.inline-input, .input-inline, input[data-field]')) return;
    const field = el.dataset.field;
    if (!field) return;
    if (el.tagName.toLowerCase() === 'select') return;
    const decimals = DECIMALS[field] ?? 2;
    let val = (el.value || '').trim();
    if (val === '') { el.value = ''; updateRowStatus(); return; }
    // para quantidade_estoque, queremos garantir que ao perder foco o valor esteja com 3 decimais
    if (field === 'quantidade_estoque') {
      // se existir raw, usamos ele; senão tentamos converter o valor visível
      const raw = el.dataset._raw_value || '';
      if (raw) {
        el.value = formatIntegerAsBR(Number(raw), DECIMALS.quantidade_estoque);
      } else {
        // tenta converter valor atual para número e aplicar formatação
        val = val.replace(/\./g,'').replace(',', '.');
        const n = Number(val);
        if (!isNaN(n)) {
          // converte para raw inteiro
          const mult = Math.pow(10, DECIMALS.quantidade_estoque);
          const intRep = String(Math.round(Math.abs(n) * mult));
          el.dataset._raw_value = intRep;
          el.value = formatIntegerAsBR(Number(intRep), DECIMALS.quantidade_estoque);
        }
      }
      updateRowStatus();
      return;
    }

    val = val.replace(/\./g,'').replace(',', '.');
    const n = Number(val);
    if (isNaN(n)) return;
    el.value = formatInputValueForDisplay(n, decimals);
    updateRowStatus();
  }, true);

  // novo: formata enquanto digita (input)
  page.addEventListener('input', ev => {
    const el = ev.target;
    if (!el.matches('input[data-field]')) return;
    if (el.tagName.toLowerCase() === 'select') return;
    const field = el.dataset.field;
    if (!field) return;

    // comportamento DINÂMICO para quantidade_estoque (fixed decimals = 3)
    if (field === 'quantidade_estoque') {
      handleDynamicQuantityInput(el, DECIMALS.quantidade_estoque ?? 3);
      updateRowStatus();
      return;
    }

    // para outros campos, mantém o caret-safe formatting já implementado
    const decimals = DECIMALS[field] ?? 2;
    try {
      setFormattedInputValuePreserveCaret(el, decimals);
    } catch (e) {
      // fallback: nada
    }
    updateRowStatus();
  }, true);

  page.addEventListener('paste', ev => {
    const el = ev.target;
    if (!el.matches('.inline-input, .input-inline, input[data-field]')) return;
    if (el.tagName.toLowerCase() === 'select') return;
    const text = (ev.clipboardData || window.clipboardData).getData('text');
    // Se for quantidade_estoque, aceitamos apenas dígitos colados (serão interpretados como integer raw)
    const field = el.dataset.field;
    if (field === 'quantidade_estoque') {
      if (!/^[\d\s\.\,]+$/.test(text)) {
        ev.preventDefault();
        return;
      }
      // normaliza: retira tudo exceto dígitos, insere como raw
      ev.preventDefault();
      const onlyDigits = text.replace(/[^\d]/g, '');
      el.dataset._raw_value = onlyDigits.replace(/^0+(?=\d)/, '');
      // atualiza visual
      handleDynamicQuantityInput(el, DECIMALS.quantidade_estoque ?? 3);
      updateRowStatus();
      return;
    }

    if (!/^[\d\.,\s\-]+$/.test(text)) ev.preventDefault();
  });

  $$('.flash').forEach(node => {
    setTimeout(() => {
      node.style.transition = 'opacity .45s';
      node.style.opacity = '0';
      node.addEventListener('transitionend', () => node.remove());
    }, 3000);
  });

  if (formNova) {
    formNova.addEventListener('submit', ev => {
      const sel = formNova.querySelector('select[name="id_produto"], #novo_produto');
      if (sel && !sel.value) {
        alert('Selecione um produto antes de adicionar.');
        ev.preventDefault();
      }
    });
  }

  // Sticky columns initialization (mantive sua implementação)
  (function initStickyColumns() {
    const tableContainer = document.querySelector('.table-container');
    const table = tableContainer?.querySelector('table');
    if (!table) return;

    function setStickyLefts() {
      const theadTr = table.querySelector('thead tr');
      if (!theadTr) return;
      const ths = Array.from(theadTr.children);

      // colunas sticky que queremos: Data (0), NF (1), Produto (2)
      const stickyIndexes = [0, 1, 2];

      // limpa estilos antigos
      stickyIndexes.forEach((idx) => {
        const headSel = `.table-container table thead th:nth-child(${idx+1})`;
        const bodySel = `.table-container table tbody td:nth-child(${idx+1})`;
        document.querySelectorAll(headSel + ',' + bodySel).forEach(el => {
          el.classList.remove('sticky-col');
          el.style.left = '';
          el.style.position = '';
          el.style.zIndex = '';
          el.style.background = '';
          el.style.boxShadow = '';
        });
      });

      // calcula left cumulativo usando larguras inteiras (offsetWidth)
      let left = 0;
      stickyIndexes.forEach((idx) => {
        const th = ths[idx];
        if (!th) return;

        // largura inteira da coluna (inclui bordas internas)
        const width = Math.round(th.offsetWidth);

        const headSelector = `.table-container table thead th:nth-child(${idx+1})`;
        const bodySelector = `.table-container table tbody td:nth-child(${idx+1})`;

        // aplica nos headers
        document.querySelectorAll(headSelector).forEach(el => {
          el.style.position = 'sticky';
          el.style.left = Math.round(left) + 'px';
          el.style.zIndex = 250;
          el.style.background = '#f8f9fa';
          // sem box-shadow aqui para não criar costura visual
          el.classList.add('sticky-col');
        });

        // aplica nas células do corpo
        document.querySelectorAll(bodySelector).forEach(el => {
          el.style.position = 'sticky';
          el.style.left = Math.round(left) + 'px';
          el.style.zIndex = 120;
          el.style.background = '#fff';
          // sem box-shadow
          el.classList.add('sticky-col');
        });

        left += width;
      });
    }

    setStickyLefts();
    let tmr = null;
    window.addEventListener('resize', () => {
      clearTimeout(tmr);
      tmr = setTimeout(setStickyLefts, 120);
    });

    tableContainer.addEventListener('scroll', () => {
      // opcional: setStickyLefts() se necessário
    });
  })();

  // Inicializa dataset raw para quantidade_estoque (caso inputs já tenham valores)
  $$('input[data-field="quantidade_estoque"]').forEach(i => {
    const v = (i.value || '').trim();
    if (!v) {
      i.dataset._raw_value = '';
      return;
    }
    // tenta interpretar como número (ex: "1.234,567" ou "1234.567")
    const num = parseBRNumber(v);
    if (!isNaN(num)) {
      const mult = Math.pow(10, DECIMALS.quantidade_estoque);
      const intRep = String(Math.round(Math.abs(num) * mult));
      i.dataset._raw_value = intRep;
      i.value = formatIntegerAsBR(Number(intRep), DECIMALS.quantidade_estoque);
    } else {
      // alternativa: extrai apenas dígitos do texto atual e usa como raw
      const onlyDigits = v.replace(/[^\d]/g, '');
      i.dataset._raw_value = onlyDigits.replace(/^0+(?=\d)/, '');
    }
  });

  // initial status pass + formatação inicial das células
  formatTableNumericCells();
  updateRowStatus();
});
