// calculo_nfs.js — comportamento para estoque_quantidade
document.addEventListener('DOMContentLoaded', () => {
  const page = document.getElementById('calc-nfs-page');

  const $ = sel => page.querySelector(sel);
  const $$ = sel => Array.from(page.querySelectorAll(sel));

  // configurações: quantidades de casas por campo
  const DECIMALS = {
    quantidade_estoque: 3,
    qtd_cobre: 3,
    qtd_zinco: 2,
    valor_total_nf: 2,
    mao_de_obra: 2,
    materia_prima: 2,
    custo_total_manual: 2,
    custo_total: 2
  };

  // editar/ativar inputs
  page.addEventListener('click', (ev) => {
    const editBtn = ev.target.closest('.edit');
    if (editBtn) {
      const tr = editBtn.closest('tr');
      tr.querySelectorAll('.inline-input').forEach(i => i.disabled = false);
      editBtn.classList.add('hidden');
      tr.querySelector('.save').classList.remove('hidden');
    }

    const saveBtn = ev.target.closest('.save');
    if (saveBtn) {
      const tr = saveBtn.closest('tr');
      const id = tr.dataset.id;
      const payload = {};

      tr.querySelectorAll('.inline-input').forEach(el => {
        const field = el.dataset.field;
        let val = el.value.trim();

        // if select => take value directly
        if (el.tagName.toLowerCase() === 'select') {
          payload[field] = el.value;
          return;
        }

        // normalize brazilian number (e.g. "1.234,56" or "1234,56") -> "1234.56"
        if (val === '') { payload[field] = null; return; }
        // remove thousand separators, replace comma with dot
        val = val.replace(/\./g, '').replace(',', '.');
        // parse to float
        const num = Number(val);
        if (isNaN(num)) {
          alert(`Valor inválido para ${field}: "${el.value}"`); throw 'invalid';
        }
        // send as string with dot decimal (DB-friendly)
        payload[field] = num.toString();
      });

      // monta body urlencoded
      const params = new URLSearchParams();
      Object.keys(payload).forEach(k => {
        if (payload[k] === null) params.append(k, '');
        else params.append(k, payload[k]);
      });

      fetch(`/calculo_nfs/edit/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      }).then(res => {
        if (res.ok) window.location.reload();
        else res.text().then(t => alert('Falha ao salvar: ' + t));
      }).catch(() => alert('Erro na requisição ao salvar.'));
    }

    // confirmar exclusão individual
    const delBtn = ev.target.closest('.delete');
    if (delBtn) {
      const nome = delBtn.dataset.nome || 'este registro';
      if (!confirm(`Deseja realmente excluir ${nome}?`)) ev.preventDefault();
    }
  });

  // busca
  const search = $('#search_nf');
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      $$('tbody tr').forEach(tr => {
        const tdId = tr.querySelector('.td-id')?.textContent || '';
        const prodCell = tr.querySelector('.td-produto');
        const prodTxt = prodCell ? prodCell.textContent.trim().toLowerCase() : '';
        const nfCell = tr.querySelector('.td-nf');
        const nfTxt = nfCell ? nfCell.textContent.trim().toLowerCase() : '';
        const match = tdId.includes(q) || prodTxt.includes(q) || nfTxt.includes(q);
        tr.style.display = match ? '' : 'none';
      });
    });
  }

  // checkbox select all and delete selected
  const selectAll = $('#select-all');
  const deleteForm = $('#form-delete-multiple');
  const deleteBtn = $('#btn-delete-selected');

  function rowCheckboxes() { return $$('.row-checkbox'); }
  function updateDeleteBtn() {
    const checked = rowCheckboxes().filter(cb => cb.checked).length;
    if (!deleteBtn) return;
    if (checked > 0) deleteBtn.classList.remove('hidden');
    else deleteBtn.classList.add('hidden');
  }

  if (selectAll) {
    selectAll.addEventListener('change', () => {
      rowCheckboxes().forEach(cb => cb.checked = selectAll.checked);
      updateDeleteBtn();
    });
  }

  page.addEventListener('change', (ev) => {
    if (ev.target.matches('.row-checkbox')) {
      const all = rowCheckboxes();
      if (selectAll) selectAll.checked = all.length > 0 && all.every(x => x.checked);
      updateDeleteBtn();
    }
  });

  if (deleteForm) {
    deleteForm.addEventListener('submit', (e) => {
      const any = rowCheckboxes().some(cb => cb.checked);
      if (!any) { alert('Selecione ao menos um registro para excluir.'); e.preventDefault(); return; }
      if (!confirm('Deseja realmente excluir os registros selecionados?')) e.preventDefault();
    });
  }

  // formatting helpers
  function formatInputValueForDisplay(raw, decimals) {
    if (raw === null || raw === undefined || raw === '') return '';
    // raw is number or string. Convert to float and format accordingly
    const n = Number(String(raw).replace(',', '.').replace(/\s/g, ''));
    if (isNaN(n)) return raw;
    // ensure fixed decimals
    const fixed = n.toFixed(decimals);
    // insert thousand separators and use comma decimal
    const parts = fixed.split('.');
    let intPart = parts[0];
    const decPart = parts[1] || '';
    // thousand separator
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return intPart + ',' + decPart;
  }

  // format on blur according to DECIMALS map
  page.addEventListener('blur', (ev) => {
    const el = ev.target;
    if (!el.matches('.inline-input')) return;
    const field = el.dataset.field;
    if (!field) return;
    if (el.tagName.toLowerCase() === 'select') return;
    const decimals = DECIMALS[field] ?? 2;
    let val = el.value.trim();
    if (val === '') { el.value = ''; return; }
    // normalize then format for display
    val = val.replace(/\./g, '').replace(',', '.');
    const n = Number(val);
    if (isNaN(n)) { /* keep original */ return; }
    el.value = formatInputValueForDisplay(n, decimals);
  }, true);

  // prevent paste non-numeric into numeric fields
  page.addEventListener('paste', (ev) => {
    const el = ev.target;
    if (!el.matches('.inline-input')) return;
    if (el.tagName.toLowerCase() === 'select') return;
    const text = (ev.clipboardData || window.clipboardData).getData('text');
    // allow digits, dots, commas
    if (!/^[\d\.,\s\-]+$/.test(text)) ev.preventDefault();
  });

  // auto-hide flashes if any
  $$('.flash').forEach(node => {
    setTimeout(() => {
      node.style.transition = 'opacity .45s';
      node.style.opacity = '0';
      node.addEventListener('transitionend', () => node.remove());
    }, 3000);
  });

});
