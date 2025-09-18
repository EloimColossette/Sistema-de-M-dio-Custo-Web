// static/js/calculo_nfs.js
document.addEventListener('DOMContentLoaded', () => {
  const page = document.getElementById('calc-nfs-page');
  if (!page) return;
  const $ = sel => page.querySelector(sel);
  const $$ = sel => Array.from(page.querySelectorAll(sel));

  const DECIMALS = {
    quantidade_estoque: 3,
    qtd_cobre: 3,
    qtd_zinco: 2,
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
    items.forEach(it => {
      const row = document.createElement('div');
      row.style.padding = '8px';
      row.style.borderBottom = '1px solid #eee';
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
  }

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
            if (inputQtd) inputQtd.value = formatBR(d.qtd_nova, DECIMALS.quantidade_estoque);
          });

          // destaque: escolhe a última alteração
          let destaque = null;
          if (changed.length > 0) destaque = changed[changed.length - 1];

          // remove destaque antigo (tr e tds)
          $$('tbody tr.linha-alterada').forEach(tr => {
            tr.classList.remove('linha-alterada');
            tr.querySelectorAll('td').forEach(td => td.classList.remove('linha-alterada'));
          });

          // monta items e aplica destaque apenas na linha escolhida (a última)
          const items = (detalhes || []).map(d => {
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
                // scroll to highlighted row
                setTimeout(() => tr.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
              }
            }

            return {
              entrada_id: entradaId,
              cn_id: d.cn_id,
              alterado: d.alterado,
              qtd_anterior: d.qtd_anterior,
              qtd_nova: d.qtd_nova,
              motivo: d.motivo,
              nf_display
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

  page.addEventListener('blur', ev => {
    const el = ev.target;
    if (!el.matches('.inline-input, .input-inline, input[data-field]')) return;
    const field = el.dataset.field;
    if (!field) return;
    if (el.tagName.toLowerCase() === 'select') return;
    const decimals = DECIMALS[field] ?? 2;
    let val = (el.value || '').trim();
    if (val === '') { el.value = ''; return; }
    val = val.replace(/\./g,'').replace(',', '.');
    const n = Number(val);
    if (isNaN(n)) return;
    el.value = formatInputValueForDisplay(n, decimals);
  }, true);

  page.addEventListener('paste', ev => {
    const el = ev.target;
    if (!el.matches('.inline-input, .input-inline, input[data-field]')) return;
    if (el.tagName.toLowerCase() === 'select') return;
    const text = (ev.clipboardData || window.clipboardData).getData('text');
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

  // Sticky columns: Data(0), NF(1), Produto(2)
  (function initStickyColumns() {
    const tableContainer = document.querySelector('.table-container');
    const table = tableContainer?.querySelector('table');
    if (!table) return;

    function setStickyLefts() {
      const theadTr = table.querySelector('thead tr');
      if (!theadTr) return;
      const ths = Array.from(theadTr.children);
      const stickyIndexes = [0,1,2];

      // limpa estilos anteriores
      stickyIndexes.forEach(idx => {
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

      let left = 0;
      stickyIndexes.forEach(idx => {
        const th = ths[idx];
        if (!th) return;
        const width = Math.ceil(th.getBoundingClientRect().width);

        const headSelector = `.table-container table thead th:nth-child(${idx+1})`;
        const bodySelector = `.table-container table tbody td:nth-child(${idx+1})`;

        document.querySelectorAll(headSelector).forEach(el => {
          el.style.position = 'sticky';
          el.style.left = left + 'px';
          el.style.zIndex = 250;
          el.style.background = '#f8f9fa';
          el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04)';
          el.classList.add('sticky-col');
        });

        document.querySelectorAll(bodySelector).forEach(el => {
          el.style.position = 'sticky';
          el.style.left = left + 'px';
          el.style.zIndex = 120;
          el.style.background = '#fff';
          el.style.boxShadow = '2px 0 6px rgba(0,0,0,0.06)';
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

    /* opcional:
    const mo = new MutationObserver(() => setStickyLefts());
    mo.observe(table, { childList:true, subtree:true, characterData:true });
    */
  })();

});
