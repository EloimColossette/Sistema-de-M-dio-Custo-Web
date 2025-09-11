document.addEventListener('DOMContentLoaded', () => {
  // -------------------- ESTADO GLOBAL --------------------
  window.selectedIds = window.selectedIds || new Set();
  const selectedIds = window.selectedIds;
  window._entradaSelectedAllPages = window._entradaSelectedAllPages || false;
  window.currentEntradaPage = window.currentEntradaPage || 1;
  window.materiaisOptions = window.materiaisOptions || [];

  console.log('Materiais disponíveis:', window.materiaisOptions);


  // --- Persistência de colunas ocultas ---
  const STORAGE_KEY = 'entrada_nf_colunas_ocultas';
  function loadHiddenCols() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }
  function saveHiddenCols(hiddenCols) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hiddenCols));
  }

  // -------------------- UTILIDADES DE DATA / NÚMERO --------------------
  function formatDate(value) {
    if (!value) return '';
    const parts = value.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${day}/${month}/${year}`;
    }
    return value;
  }

  function displayToIso(display) {
    if (!display) return '';
    const m = String(display).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(display)) return display;
    return '';
  }

  function isoToDisplay(iso) {
    if (!iso) return '';
    const m = String(iso).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(iso)) return iso;
    return iso;
  }

  function formatNumberBR(v, casas = 2) {
    if (v === null || v === undefined || String(v).trim() === '') return '';
    if (typeof v === 'number') {
      return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas
      }).format(v);
    }
    const cleaned = String(v).replace(/\./g, '').replace(',', '.');
    const num = Number(cleaned);
    if (Number.isNaN(num)) return String(v);
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas
    }).format(num);
  }

  function normalizeNumberString(raw) {
    if (raw === null || raw === undefined) return '';
    let s = String(raw).trim();
    if (s === '') return '';
    s = s.replace(/\s/g, '').replace('%','');
    s = s.replace(/[^0-9\.,-]/g, '');
    const hasComma = s.indexOf(',') !== -1;
    const hasDot = s.indexOf('.') !== -1;
    if (hasComma && !hasDot) return s.replace(',', '.');
    if (hasDot && hasComma) {
      const parts = s.split(',');
      const integerPart = parts[0].replace(/\./g, '');
      const decimalPart = parts[1] || '';
      return integerPart + '.' + decimalPart;
    }
    return s;
  }

  function casasDecimais(col) {
    if (!col) return 2;
    if (col.startsWith('peso')) return 3;
    return 2;
  }

  function isNumericCol(col) {
    if (!col) return false;
    return (
      col === 'custo_empresa' ||
      col === 'valor_integral' ||
      col.startsWith('valor_unitario') ||
      col.startsWith('duplicata') ||
      col === 'valor_unitario_energia' ||
      col === 'valor_mao_obra_tm_metallica' ||
      col.startsWith('peso') ||
      col === 'ipi'
    );
  }

  // substituir a função existente por esta versão com scope
  function initMainNumericInputs(scope = document) {
    const inputs = Array.from(scope.querySelectorAll('input[name]'));
    inputs.forEach(input => {
      if (input.dataset && input.dataset.col) return;
      const name = input.getAttribute('name') || '';
      if (!name) return;
      if (isNumericCol(name)) {
        try {
          input.dataset.col = name;
          if (input.type === 'number') {
            input.type = 'text';
            input.setAttribute('inputmode', 'decimal');
          }
        } catch (err) {
          console.warn('Não foi possível ajustar input:', input, err);
        }
      }
    });
  }

  // -------------------- MÁSCARA DE DATA --------------------
  function attachDateMask(scope = document) {
    const els = Array.from(scope.querySelectorAll('input[name="data"]:not([type="date"]), input[data-col="data"]:not([type="date"])'));
    els.forEach(el => {
      if (el.__dateMaskAttached) return;
      el.__dateMaskAttached = true;
      try {
        if (el.type === 'date') {
          el.dataset.originalType = 'date';
          el.type = 'text';
        }
      } catch (err) { console.warn('Não foi possível alterar type para text (input data).', err); }
      el.setAttribute('maxlength', '10');
      el.setAttribute('inputmode', 'numeric');

      el.addEventListener('keydown', (ev) => {
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
        const allowed = ['Backspace','Tab','ArrowLeft','ArrowRight','Delete','Home','End'];
        if (allowed.includes(ev.key)) return;
        if (!/^\d$/.test(ev.key)) ev.preventDefault();
      });

      el.addEventListener('input', (ev) => {
        const input = ev.target;
        const rawDigits = input.value.replace(/\D/g, '').slice(0, 8);
        let day = rawDigits.slice(0, 2);
        let month = rawDigits.slice(2, 4);
        let year = rawDigits.slice(4);
        let value = '';
        if (day) value = day;
        if (month) value += '/' + month;
        if (year) value += '/' + year;
        input.value = value;
        try { input.setSelectionRange(input.value.length, input.value.length); } catch (err) {}
      });

      el.addEventListener('blur', (ev) => {
        const input = ev.target;
        const digits = (input.value || '').replace(/\D/g, '');
        if (digits.length === 8) input.value = digits.slice(0,2) + '/' + digits.slice(2,4) + '/' + digits.slice(4,8);
        else if (digits.length === 6) input.value = digits.slice(0,2) + '/' + digits.slice(2,4) + '/20' + digits.slice(4,6);
        else if (digits.length === 4) input.value = digits.slice(0,2) + '/' + digits.slice(2,4);
      });
    });
  }
  attachDateMask();

  // -------------------- HANDLERS NUMÉRICOS GLOBAIS --------------------
  document.addEventListener('input', (e) => {
    const input = e.target;
    if (!input || input.tagName !== 'INPUT') return;
    const col = input.dataset.col || input.name || null;
    if (!col) return;
    if (!isNumericCol(col)) return;
    handleNumericLiveInput(input);
  });

  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    const col = t.dataset.col || t.name || null;
    if (!col) return;
    if (!isNumericCol(col)) return;
    if (t.value) {
      t.value = String(t.value).replace(/\./g, '');
      try { t.setSelectionRange(t.value.length, t.value.length); } catch (err) {}
    }
  });

  document.addEventListener('focusout', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    const col = t.dataset.col || t.name || null;
    if (!col) return;
    if (!isNumericCol(col)) return;
    handleNumericFinalize(t);
  });

  function handleNumericLiveInput(input) {
    const decimals = casasDecimais(input.dataset.col || input.name || '') || 2;
    let digits = (String(input.value || '').match(/\d/g) || []).join('');
    if (!digits) { input.value = ''; return; }
    let intRaw, decRaw;
    if (digits.length <= decimals) {
      intRaw = '0';
      decRaw = digits.padStart(decimals, '0').slice(-decimals);
    } else {
      intRaw = digits.slice(0, -decimals);
      decRaw = digits.slice(-decimals);
    }
    const intFormatted = (intRaw.replace(/^0+(?=\d)/, '') || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    input.value = `${intFormatted},${decRaw}`;
    try { input.setSelectionRange(input.value.length, input.value.length); } catch (err) {}
  }

  function handleNumericFinalize(input) {
    let val = String(input.value || '').trim();
    if (val === '') { input.value = ''; return; }
    const decimals = casasDecimais(input.dataset.col || input.name);
    if (val.indexOf(',') !== -1 && val.indexOf('.') === -1) {
      const cleaned = val.replace(/\./g, '').replace(',', '.');
      const jsnum = Number(cleaned);
      if (Number.isNaN(jsnum)) return;
      input.value = formatNumberBR(jsnum, decimals);
      return;
    }
    if (val.indexOf(',') !== -1) {
      const cleaned = val.replace(/\./g, '').replace(',', '.');
      const jsnum = Number(cleaned);
      if (Number.isNaN(jsnum)) return;
      input.value = formatNumberBR(jsnum, decimals);
      return;
    }
    if (val.indexOf('.') !== -1) {
      const cleaned = val.replace(/\./g, '');
      const jsnum = Number(cleaned);
      if (Number.isNaN(jsnum)) return;
      input.value = formatNumberBR(jsnum, decimals);
      return;
    }
    const cleanedOnlyDigits = val.replace(/\D/g, '');
    if (cleanedOnlyDigits.length === 0) { input.value = ''; return; }
    let intRaw, decRaw;
    if (cleanedOnlyDigits.length <= decimals) {
      intRaw = '0';
      decRaw = cleanedOnlyDigits.padStart(decimals, '0').slice(-decimals);
    } else {
      intRaw = cleanedOnlyDigits.slice(0, -decimals);
      decRaw = cleanedOnlyDigits.slice(-decimals);
    }
    const intFormatted = (intRaw.replace(/^0+(?=\d)/, '') || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    input.value = `${intFormatted},${decRaw}`;
  }

  // utilitários expostos para debug
  window.__entradaNF__ = {
    isNumericCol, casasDecimais, initMainNumericInputs, formatDate, formatNumberBR, attachDateMask
  };

  // -------------------- MENU / MODAL --------------------
  const nfItem = document.getElementById('nfItem');
  const nfSubmenu = document.getElementById('nfSubmenu');
  if (nfItem && nfSubmenu) nfItem.addEventListener('click', () => nfSubmenu.classList.toggle('hidden'));

  const btnVerEntradas = document.getElementById('btnVerEntradas');
  const modalEntradas  = document.getElementById('modal-entradas');
  let modalContent   = modalEntradas ? modalEntradas.querySelector('.modal-content') : null;

  if (btnVerEntradas) btnVerEntradas.addEventListener('click', () => loadPage(1));
  if (modalEntradas) {
    modalEntradas.addEventListener('click', e => {
      if (e.target === modalEntradas) {
        modalEntradas.classList.remove('show');
        modalEntradas.setAttribute('aria-hidden', 'true');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (modalEntradas.classList && modalEntradas.classList.contains('show')) {
          modalEntradas.classList.remove('show');
          modalEntradas.setAttribute('aria-hidden', 'true');
        }
      }
    });
  }

  // -------------------- CSRF HELPER --------------------
  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"], meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : null;
  }

  // -------------------- REQUISIÇÃO DE EXCLUSÃO (por IDs) --------------------
  async function doDeleteRequest(ids) {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('Nenhum id fornecido');
    const url = '/entrada_nf/excluir';
    const headers = { 'Content-Type': 'application/json' };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRFToken'] = csrf;
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids }),
      credentials: 'same-origin'
    });
    let data = null;
    try { data = await resp.json(); } catch (e) { data = null; }
    if (!resp.ok) {
      const msg = (data && data.msg) ? data.msg : `Erro HTTP ${resp.status}`;
      throw new Error(msg);
    }
    if (data && (data.status === 'error' || data.status === 'fail')) throw new Error(data.msg || 'Erro no servidor ao excluir.');
    return data;
  }

  // -------------------- EXCLUIR SINGLE / BULK --------------------
  async function confirmAndDeleteSingle(id, row) {
    if (!confirm('Confirma exclusão desta entrada? Esta ação é irreversível.')) return;
    try {
      const btn = row ? row.querySelector('.btn-excluir') : null;
      if (btn) { btn.disabled = true; }
      const data = await doDeleteRequest([id]);
      if (row && row.parentNode) row.parentNode.removeChild(row);
      selectedIds.delete(String(id));
      refreshBulkStateAndSelectAll();
      alert('Excluído com sucesso.');
    } catch (err) {
      console.error('Erro ao excluir:', err);
      alert('Falha ao excluir: ' + (err.message || err));
    } finally {
      const btn = row ? row.querySelector('.btn-excluir') : null;
      if (btn) { btn.disabled = false; }
    }
  }

  async function confirmAndDeleteBulk(ids) {
    if (!ids || !ids.length) return;
    if (!confirm(`Confirma exclusão de ${ids.length} entrada(s)? Esta ação é irreversível.`)) return;

    const bulkBtn = modalContent ? modalContent.querySelector('#bulkDeleteEntradasBtn') : null;
    try {
      if (bulkBtn) { bulkBtn.disabled = true; bulkBtn.textContent = `Excluindo...`; }

      const data = await doDeleteRequest(ids); // mantém sua função existente

      // Interpreta resposta do backend:
      // - prioridade para removed_ids (array)
      // - fallback para removed (número): se igual ao solicitado, assumimos sucesso total
      // - se backend não informar nada, mantemos comportamento conservador (assumir que todos removeram)
      let removedIds = [];
      if (data && Array.isArray(data.removed_ids)) {
        removedIds = data.removed_ids.map(String);
      } else if (data && typeof data.removed === 'number') {
        if (data.removed === ids.length) {
          removedIds = ids.map(String);
        } else {
          // servidor diz que removeu X mas não deu a lista; optamos por não remover nada automaticamente,
          // para evitar inconsistência — em vez disso, sugerimos recarregar a página.
          // (Se preferir, aqui podemos assumir que os primeiros N foram removidos — mas isso é arriscado.)
          alert(`Servidor reportou ${data.removed} remoção(ões), mas não forneceu os IDs removidos. Por segurança, a listagem será recarregada para sincronizar.`);
          try { loadPage(window.currentEntradaPage || 1); } catch (e) {}
          return;
        }
      } else {
        // sem informação útil: para manter compatibilidade você pode:
        // a) assumir sucesso total (comportamento antigo) — arriscado; ou
        // b) recarregar a página para sincronizar com servidor — mais seguro.
        // Vou escolher a opção segura: recarregar.
        alert('Resposta do servidor sem detalhes de quais IDs foram removidos. A listagem será recarregada para sincronização.');
        try { loadPage(window.currentEntradaPage || 1); } catch (e) {}
        return;
      }

      // remove do DOM apenas os IDs confirmados como removidos
      removedIds.forEach(id => {
        const cb = modalContent ? modalContent.querySelector(`.selectEntrada[data-id="${CSS.escape(String(id))}"]`) : null;
        if (cb) {
          const row = cb.closest('tr');
          if (row && row.parentNode) row.parentNode.removeChild(row);
        }
        selectedIds.delete(String(id));
      });

      // Feedback ao usuário
      const removedCount = removedIds.length;
      const failedCount = ids.length - removedCount;
      if (failedCount > 0) {
        alert(`${removedCount} excluída(s). ${failedCount} não foram removidas (verifique logs/perm.)`);
        // opcional: recarregar ou destacar failed ids
        try { loadPage(window.currentEntradaPage || 1); } catch (e) {}
      } else {
        alert(`Excluídas ${removedCount} entrada(s).`);
      }

      refreshBulkStateAndSelectAll();
    } catch (err) {
      console.error('Erro ao excluir em massa:', err);
      alert('Falha ao excluir em massa: ' + (err.message || err));
    } finally {
      if (bulkBtn) { bulkBtn.disabled = false; refreshBulkStateAndSelectAll(); }
    }
  }

  // -------------------- GATHER FILTERS FROM MODAL --------------------
  function gatherFiltersFromModal() {
    const filters = {};
    if (!modalContent) return filters;

    // 1) Inputs explicitly marked as filter
    modalContent.querySelectorAll('[data-filter="true"]').forEach(el => {
      const name = el.name || el.id || el.dataset.key;
      if (!name) return;
      let val = el.value === undefined ? '' : String(el.value).trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) val = displayToIso(val);
      filters[name] = val;
    });

    // 2) Common date inputs by name
    const possibleDateNames = ['date_from', 'dateTo', 'date_to', 'data', 'data_from', 'data_to', 'data_entrada'];
    possibleDateNames.forEach(n => {
      const el = modalContent.querySelector(`[name="${n}"], #${n}`);
      if (el) {
        let v = (el.value || '').trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) v = displayToIso(v);
        filters[n] = v;
      }
    });

    // 3) Fornecedor/id and generic text filters
    const textNames = ['fornecedor', 'fornecedor_id', 'q', 'search', 'numero_nf'];
    textNames.forEach(n => {
      const el = modalContent.querySelector(`[name="${n}"], #${n}`);
      if (el) filters[n] = (el.value || '').trim();
    });

    // 4) Fallback: inputs/selects inside .search-and-filter
    const toolbar = modalContent.querySelector('.search-and-filter');
    if (toolbar) {
      toolbar.querySelectorAll('input, select').forEach(el => {
        const name = el.name || el.id;
        if (!name) return;
        if (filters[name] !== undefined && filters[name] !== '') return;
        let v = (el.value || '').trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) v = displayToIso(v);
        if (v !== '') filters[name] = v;
      });
    }

    return filters;
  }

  // -------------------- DELETE ALL MATCHING (all_matching: true) --------------------
  async function deleteAllMatching(searchTermRaw = '', extraFilters = {}) {
    if (!confirm('Confirmar exclusão de TODAS as entradas correspondentes ao filtro? Esta ação é irreversível.')) return;

    const url = '/entrada_nf/excluir';
    const headers = { 'Content-Type': 'application/json' };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRFToken'] = csrf;

    // normalize before sending
    const serverQ = normalizeForServer(String(searchTermRaw || ''));

    const modalFilters = gatherFiltersFromModal();
    const filters = Object.assign({}, modalFilters, extraFilters);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({ all_matching: true, q: serverQ || '', filters })
      });
      let data = null;
      try { data = await resp.json(); } catch (e) { data = null; }
      if (!resp.ok) {
        const msg = (data && data.msg) ? data.msg : `Erro HTTP ${resp.status}`;
        throw new Error(msg);
      }
      if (data && (data.status === 'error' || data.status === 'fail')) throw new Error(data.msg || 'Erro no servidor ao excluir.');

      const removed = (data && typeof data.removed === 'number') ? data.removed : 0;
      selectedIds.clear();
      window._entradaSelectedAllPages = false;
      alert(`Excluídas ${removed} entradas (por filtro).`);
      const curPage = window.currentEntradaPage || 1;
      try { loadPage(curPage); } catch (e) { console.warn('Não foi possível recarregar listagem automaticamente.', e); }
      return data;
    } catch (err) {
      console.error('Erro em deleteAllMatching:', err);
      alert('Falha ao excluir por filtro: ' + (err.message || err));
      throw err;
    }
  }

  // -------------------- SELECT ALL ACROSS PAGES (busca IDs) --------------------
  async function selectAllAcrossPages() {
    const rawSearch = (modalContent && modalContent.querySelector('#searchEntradaInput'))
      ? (modalContent.querySelector('#searchEntradaInput').value || '')
      : '';
    const serverSearch = normalizeForServer(rawSearch);
    const filters = gatherFiltersFromModal();

    const url = '/entrada_nf/ids_all';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: serverSearch, filters }),
      credentials: 'same-origin'
    });
    if (!resp.ok) {
      let txt = 'Erro ao buscar IDs';
      try { const j = await resp.json(); if (j && j.msg) txt = j.msg; } catch(_) {}
      throw new Error(txt);
    }
    const data = await resp.json();
    if (!data || !Array.isArray(data.ids)) throw new Error('Resposta inválida do servidor');

    data.ids.forEach(id => selectedIds.add(String(id)));
    if (modalContent) {
      modalContent.querySelectorAll('.selectEntrada').forEach(cb => { if (selectedIds.has(cb.dataset.id)) cb.checked = true; });
    }
    window._entradaSelectedAllPages = true;
    refreshBulkStateAndSelectAll();
    console.log(`Selecionadas ${data.ids.length} entradas (todas as páginas)`);
    return data.ids.length;
  }

  // -------------------- BANNER (NO-OP: sem mensagem/link) --------------------
  function showSelectAllBanner(pageCount) { /* no-op */ }
  function removeSelectAllBanner() {
    if (!modalContent) return;
    const ex = modalContent.querySelector('#selectAllBanner');
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  }

  // -------------------- REFRESH UI (botão bulk e checkbox cabeçalho) --------------------
  function refreshBulkStateAndSelectAll() {
    if (!modalContent) return;
    const bulkBtn = modalContent.querySelector('#bulkDeleteEntradasBtn');
    if (!bulkBtn) return;
    const count = selectedIds.size;
    if (count > 0) {
      bulkBtn.style.display = '';
      if (window._entradaSelectedAllPages) bulkBtn.textContent = `Excluir (todas as páginas: ${count})`;
      else bulkBtn.textContent = `Excluir (${count})`;
    } else {
      bulkBtn.style.display = 'none';
      bulkBtn.textContent = 'Excluir (0)';
    }
    const selectAll = modalContent.querySelector('#selectAllEntradas');
    const pageCheckboxes = Array.from(modalContent.querySelectorAll('.selectEntrada'));
    if (!selectAll) return;
    if (pageCheckboxes.length === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      removeSelectAllBanner();
      return;
    }
    const allChecked = pageCheckboxes.every(cb => selectedIds.has(cb.dataset.id));
    const someChecked = pageCheckboxes.some(cb => selectedIds.has(cb.dataset.id));
    selectAll.checked = allChecked;
    selectAll.indeterminate = (!allChecked && someChecked);
  }

  // --- normalize / qparam helpers (substitua os anteriores) ---
  function normalizeForServer(term) {
    if (!term || typeof term !== 'string') return '';
    const t = term.trim();
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      // dd/mm/yyyy -> yyyy-mm-dd
      return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    }
    // se já estiver iso yyyy-mm-dd mantém
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    return '';
  }

  // Substituir buildSearchQParams atual por este (usa displayToIso que já existe no arquivo)
  function buildSearchQParams(rawSearch) {
    const raw = String(rawSearch || '').trim();
    const iso = normalizeForServer(raw); // retorna yyyy-mm-dd ou ''
    const parts = [];
    if (iso) {
      parts.push('q=' + encodeURIComponent(iso));
      parts.push('q_raw=' + encodeURIComponent(raw));
    } else {
      if (raw !== '') parts.push('q=' + encodeURIComponent(raw));
    }
    return parts.length ? '&' + parts.join('&') : '';
  }

  // -------------------- LOAD PAGE (injeta HTML no modal) --------------------
  async function loadPage(page, searchRaw = '') {
    try {
      window.currentEntradaPage = page;

      // monta qparam (q = ISO se for data, q_raw = bruto)
      const qparam = buildSearchQParams(searchRaw || '');

      // DEBUG: mostra no console exatamente o que será enviado
      try { console.debug('[entrada_nf] loadPage -> page:', page, 'searchRaw:', String(searchRaw||''), 'qparam:', qparam); } catch(e){}

      const resp = await fetch(`/entrada_nf/listar?page=${page}${qparam}`);
      if (!resp.ok) throw new Error('Falha ao carregar página ' + page);
      const html = await resp.text();

      if (!modalEntradas) throw new Error('modalEntradas não encontrado');
      modalContent = modalEntradas.querySelector('.modal-content');
      if (!modalContent) throw new Error('modalContent não encontrado');

      // injeta HTML recebido
      modalContent.innerHTML = html;

      // reaplica seus inicializadores
      try { initMainNumericInputs(modalContent); } catch(e) {}
      // preenche células/inputs numéricos vazios com zeros formatados
      try { fillEmptyNumericCells(modalContent); } catch(e) {}
      // Restaura seleção global
      modalContent.querySelectorAll('.selectEntrada').forEach(cb => {
        if (selectedIds.has(cb.dataset.id)) cb.checked = true;
        else cb.checked = false;
      });
      try { refreshBulkStateAndSelectAll(); } catch(e) {}

      // --- search input: preserva EXATAMENTE o raw do usuário e adiciona debounce sem clonar nó ---
      const searchInput = modalContent.querySelector('#searchEntradaInput');
      if (searchInput) {
        try {
          // mostra o que o usuário digitou (raw)
          searchInput.value = String(searchRaw || '');
        } catch (e) { /* ignore */ }

        // adiciona listener apenas uma vez por elemento (flag)
        if (!searchInput._hasSearchListener) {
          searchInput._hasSearchListener = true;
          searchInput._searchDebounceTimer = null;
          const SEARCH_DEBOUNCE_MS = 600; // debounce maior para evitar requisições parciais

          searchInput.addEventListener('input', (ev) => {
            const raw = ev.target.value; // texto bruto exatamente como digita
            if (searchInput._searchDebounceTimer) clearTimeout(searchInput._searchDebounceTimer);
            searchInput._searchDebounceTimer = setTimeout(() => {
              // chama loadPage com o termo BRUTO; internamente mandamos ISO quando for data
              loadPage(1, raw);
            }, SEARCH_DEBOUNCE_MS);
          });

          // suporte ao Enter para busca imediata
          searchInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              if (searchInput._searchDebounceTimer) { clearTimeout(searchInput._searchDebounceTimer); searchInput._searchDebounceTimer = null; }
              loadPage(1, searchInput.value);
            }
          });
        }

        // foco e caret no final (se desejado)
        try { searchInput.focus(); const pos = searchInput.value.length; searchInput.setSelectionRange(pos, pos); } catch (e) {}
      }

      // reaplica máscaras / botões / eventos
      try { attachDateMask(modalContent); } catch(e) {}
      modalEntradas.classList.add('show');
      try { injectBulkDeleteButton(); } catch(e) {}
      try { attachModalEvents(); } catch(e) {}
      try { destroyFixedHScrollIfAny(); } catch(e) {}
      try { setupFixedHScrollImproved(); } catch(e) {}

      if (typeof window.initEntradaImport === 'function') window.initEntradaImport();
      if (typeof window.initEntradaExport === 'function') window.initEntradaExport();

    } catch (err) {
      console.error(err);
      alert('Erro ao carregar entradas.');
    }
  }

  // -------------------- INJECT BULK DELETE BUTTON --------------------
  function injectBulkDeleteButton() {
    if (!modalContent) return;
    const toolbar = modalContent.querySelector('.search-and-filter');
    if (!toolbar) return;
    if (!toolbar.querySelector('#bulkDeleteEntradasBtn')) {
      const btn = document.createElement('button');
      btn.id = 'bulkDeleteEntradasBtn';
      btn.type = 'button';
      btn.className = 'btn btn-danger btn-sm';
      btn.style.marginLeft = '8px';
      btn.style.display = 'none';
      btn.textContent = 'Excluir (0)';
      toolbar.appendChild(btn);

      btn.addEventListener('click', async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        const curSearch = (modalContent.querySelector('#searchEntradaInput') || {}).value || '';
        if (window._entradaSelectedAllPages) {
          try { await deleteAllMatching(curSearch, {}); } catch (e) { console.error('Erro ao excluir todas por filtro:', e); }
          return;
        }
        confirmAndDeleteBulk(ids);
      });
    }
  }

  // -------------------- ATTACH MODAL EVENTS --------------------
  function attachModalEvents() {
    if (!modalContent) return;

    // fechar modal via “×”
    const btnClose = modalContent.querySelector('#fecharModalEntradaBtn');
    if (btnClose && !btnClose._hasClose) {
      btnClose._hasClose = true;
      btnClose.addEventListener('click', () => modalEntradas.classList.remove('show'));
    }

    // paginação (botões com .page-btn)
    modalContent.querySelectorAll('.page-btn').forEach(btn => {
      if (btn._hasPage) return;
      btn._hasPage = true;
      btn.addEventListener('click', e => {
        e.preventDefault();
        const p = parseInt(btn.dataset.page, 10) || 1;
        const curSearchRaw = (modalContent.querySelector('#searchEntradaInput') || {}).value || '';
        loadPage(p, curSearchRaw);
      });
    });

    // botão de busca (caso exista)
    const searchBtn = modalContent.querySelector('#searchEntradaBtn');
    const searchInput = modalContent.querySelector('#searchEntradaInput');
    if (searchBtn && searchInput && !searchBtn._hasClick) {
      searchBtn._hasClick = true;
      searchBtn.addEventListener('click', () => {
        const termRaw = (searchInput.value || '');
        loadPage(1, termRaw);
      });
    }

    // checkbox do cabeçalho: marca/desmarca página atual e faz fetch de todos os ids quando marcar
    const selectAll = modalContent.querySelector('#selectAllEntradas');
    if (selectAll && !selectAll._hasListener) {
      selectAll._hasListener = true;
      selectAll.addEventListener('change', async e => {
        const checked = e.target.checked;
        const pageCheckboxes = Array.from(modalContent.querySelectorAll('.selectEntrada'));

        if (!checked) {
          pageCheckboxes.forEach(cb => { cb.checked = false; });
          selectedIds.clear();
          window._entradaSelectedAllPages = false;
          refreshBulkStateAndSelectAll();
          return;
        }

        // marcar visíveis
        pageCheckboxes.forEach(cb => {
          cb.checked = true;
          selectedIds.add(String(cb.dataset.id));
        });
        refreshBulkStateAndSelectAll();

        // buscar todos ids com filtros
        try {
          await selectAllAcrossPages();
          modalContent.querySelectorAll('.selectEntrada').forEach(cb => { if (selectedIds.has(cb.dataset.id)) cb.checked = true; });
        } catch (err) {
          console.error('Erro ao selecionar todas as páginas automaticamente:', err);
          alert('Falha ao selecionar todas as páginas. Seleção limitada à página atual.');
        }
        refreshBulkStateAndSelectAll();
      });
    }

    // checkboxes individuais
    modalContent.querySelectorAll('.selectEntrada').forEach(cb => {
      if (cb._hasSelectListener) return;
      cb._hasSelectListener = true;
      cb.addEventListener('change', () => {
        const id = String(cb.dataset.id);
        if (cb.checked) selectedIds.add(id);
        else {
          selectedIds.delete(id);
          window._entradaSelectedAllPages = false;
        }
        refreshBulkStateAndSelectAll();
      });
    });

    // placeholder para import/init features (se existir)
    if (typeof window.initEntradaImport !== 'function') {
      window.initEntradaImport = function() {
        // placeholder: se tiver lógica de import no seu arquivo original, coloque aqui
        return;
      };
    }
  }

  // Preenche e vincula o dropdown de colunas dinâmicas
  function setupColumnToggle() {
    if (!modalContent) return;
    const headers = Array.from(modalContent.querySelectorAll('thead th'));
    const list = modalContent.querySelector('#colToggleList');
    if (!list) return;
    list.innerHTML = '';

    // Carrega colunas ocultas salvas
    const hiddenCols = loadHiddenCols();

    headers.forEach((th, idx) => {
      const txt = th.textContent.trim();
      if (/^Material\.?\s*\d+|^Valor Unitario\.?\s*\d+|^Duplicata\.?\s*\d+/i.test(txt)) {
        const col = idx + 1;
        const isHidden = hiddenCols.includes(col);
        // Cria o <li> com checkbox já no estado salvo
        const li = document.createElement('li');
        li.innerHTML = `<label>
                          <input type="checkbox" data-col="${col}" ${isHidden ? '' : 'checked'} />
                          ${txt}
                        </label>`;
        list.appendChild(li);

        // Aplica estilo inicial à coluna
        modalContent.querySelectorAll(
          `thead th:nth-child(${col}), tbody td:nth-child(${col})`
        ).forEach(el => {
          el.style.display = isHidden ? 'none' : '';
        });
      }
    });

    // Ao trocar um checkbox, atualiza estilo e salva no LocalStorage
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const col = parseInt(cb.dataset.col, 10);
        const disp = cb.checked ? '' : 'none';

        // Ajusta visibilidade
        modalContent.querySelectorAll(
          `thead th:nth-child(${col}), tbody td:nth-child(${col})`
        ).forEach(el => el.style.display = disp);

        // Atualiza array de colunas ocultas
        const currentlyHidden = [];
        list.querySelectorAll('input[type="checkbox"]').forEach(otherCb => {
          if (!otherCb.checked) {
            currentlyHidden.push(parseInt(otherCb.dataset.col, 10));
          }
        });
        saveHiddenCols(currentlyHidden);
      });
    });
  }

  // === Inline edit with selects populated from API or fallback DOM ===
  (function attachEditDeleteDelegationWithFullLists() {
    const root = document.getElementById('modal-entradas');
    if (!root) return;

    const URL_FORNECEDORES = '/entrada_nf/api/fornecedores/list';
    const URL_MATERIAIS    = '/entrada_nf/api/materiais/list';
    const URL_PRODUTOS     = '/entrada_nf/api/produtos/list';

    const cache = { fornecedores: null, materiais: null, produtos: null };

    function normalizeListPayload(payload) {
      if (!payload) return [];
      if (Array.isArray(payload)) return payload;
      if (payload.rows && Array.isArray(payload.rows)) return payload.rows;
      if (payload.data && Array.isArray(payload.data)) return payload.data;
      for (const k of Object.keys(payload || {})) {
        if (Array.isArray(payload[k])) return payload[k];
      }
      return [];
    }

    async function fetchList(url) {
      try {
        const resp = await fetch(url, { credentials: 'same-origin' });
        if (!resp.ok) return [];
        const data = await resp.json().catch(() => null);
        const arr = normalizeListPayload(data);
        return arr.map((it, i) => {
          if (typeof it === 'string') return { id: it, nome: it };
          if (it && (it.nome || it.name || it.id !== undefined)) {
            return { id: it.id !== undefined ? it.id : i, nome: it.nome || it.name || String(it.id) || String(i) };
          }
          return { id: i, nome: String(it) };
        });
      } catch {
        return [];
      }
    }

    function collectFromTable(columnName) {
      const tds = Array.from(document.querySelectorAll(`#modal-entradas td[data-col="${columnName}"]`));
      const set = new Set();
      tds.forEach(td => {
        const v = (td.textContent || '').trim();
        if (v !== '') set.add(v);
      });
      return Array.from(set).map((v, i) => ({ id: i, nome: v }));
    }

    async function getOptions(key) {
      if (cache[key]) return cache[key];
      let opts = [];
      if (key === 'fornecedores') opts = await fetchList(URL_FORNECEDORES);
      else if (key === 'materiais') opts = await fetchList(URL_MATERIAIS);
      else if (key === 'produtos') opts = await fetchList(URL_PRODUTOS);

      const seen = new Set();
      opts = opts.filter(o => {
        const lower = o.nome.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });

      if (!opts || opts.length === 0) opts = collectFromTable(key);
      if (!opts || opts.length === 0) opts = [{ id: '', nome: '(vazio)' }];
      cache[key] = opts;
      return opts;
    }

    function buildSelect(name, options, selectedText) {
      const select = document.createElement('select');
      select.className = 'edit-input';
      select.name = name;
      select.style.width = '100%';
      select.style.boxSizing = 'border-box';

      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '';
      select.appendChild(empty);

      const lowerSel = (selectedText || '').trim().toLowerCase();
      let matched = false;

      options.forEach(opt => {
        const o = document.createElement('option');
        o.value = String(opt.nome);
        o.textContent = String(opt.nome);
        if (o.value.trim().toLowerCase() === lowerSel) {
          o.selected = true;
          matched = true;
        }
        select.appendChild(o);
      });

      if (!matched && selectedText) {
        const fallback = document.createElement('option');
        fallback.value = selectedText;
        fallback.textContent = selectedText;
        fallback.selected = true;
        select.appendChild(fallback);
      }
      return select;
    }

    function buildInputHTML(col, value, type = 'text') {
      const v = (value === undefined || value === null) ? '' : String(value).replace(/"/g, '&quot;');
      const style = 'style="width:100%; box-sizing:border-box; padding:6px 8px; font-size:13px;"';
      if (type === 'date') return `<input class="edit-input" name="${col}" type="date" value="${v}" ${style} />`;
      return `<input class="edit-input" name="${col}" type="text" value="${v}" ${style} />`;
    }

    root.addEventListener('click', async function (e) {
      const delBtn = e.target.closest('.btn-excluir');
      if (delBtn) {
        e.preventDefault();
        const id = delBtn.dataset.id;
        const row = delBtn.closest('tr');
        if (typeof confirmAndDeleteSingle === 'function') await confirmAndDeleteSingle(id, row);
        return;
      }

      const editBtn = e.target.closest('.btn-editar');
      if (!editBtn) return;
      e.preventDefault();
      const row = editBtn.closest('tr');
      if (!row || row.classList.contains('editing')) return;
      row.classList.add('editing');

      const allTds = Array.from(row.querySelectorAll('td[data-col]'));
      const editableTds = allTds.filter(td => td.dataset.col !== 'select' && td.dataset.col !== 'acoes');

      const originalHTML = {};
      editableTds.forEach(td => originalHTML[td.dataset.col] = td.innerHTML);
      const actionsTd = row.querySelector('td.acoes') || row.lastElementChild;
      const prevActionsHtml = actionsTd ? actionsTd.innerHTML : '';

      const pFor = getOptions('fornecedores');
      const pMat = getOptions('materiais');
      const pProd = getOptions('produtos');

      for (const td of editableTds) {
        const col = td.dataset.col;
        const text = (td.textContent || '').trim();

        if (col === 'fornecedor') td.innerHTML = '', td.appendChild(buildSelect(col, await pFor, text));
        else if (/^material_\d+$/.test(col)) td.innerHTML = '', td.appendChild(buildSelect(col, await pMat, text));
        else if (col === 'produto') td.innerHTML = '', td.appendChild(buildSelect(col, await pProd, text));
        else if (col === 'data') {
          const iso = (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) ? text.split('/').reverse().join('-') : text;
          td.innerHTML = buildInputHTML(col, iso, 'date');
        } else td.innerHTML = buildInputHTML(col, text, 'text');
      }

      if (actionsTd) actionsTd.innerHTML = `
        <button type="button" class="btn-save" title="Salvar" aria-label="Salvar">💾</button>
        <button type="button" class="btn-cancel" title="Cancelar" aria-label="Cancelar">❌</button>
      `;

      const cancelBtn = row.querySelector('.btn-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', ev => {
        ev.preventDefault();
        editableTds.forEach(td => td.innerHTML = originalHTML[td.dataset.col] ?? td.innerHTML);
        if (actionsTd) actionsTd.innerHTML = prevActionsHtml;
        row.classList.remove('editing');
      }, { once: true });

      const saveBtn = row.querySelector('.btn-save');
      if (saveBtn) saveBtn.addEventListener('click', async ev => {
        ev.preventDefault();
        const idElem = row.querySelector('.selectEntrada') || row.querySelector('.btn-editar');
        const id = idElem ? (idElem.dataset.id || idElem.value) : null;
        if (!id) { alert('ID não encontrado'); return; }

        const fields = {};
        Array.from(row.querySelectorAll('.edit-input')).forEach(el => {
          let val = el.value;
          const name = el.name;

          // normaliza monetários
          if (/custo|valor|preco/i.test(name) && val) {
            val = val.replace(/\./g, '').replace(',', '.');
            val = parseFloat(val).toFixed(2).replace('.', ',');
          }

          fields[name] = val;
        });

        const url = `/entrada_nf/editar/${encodeURIComponent(id)}`;
        const headers = { 'Content-Type': 'application/json' };
        if (typeof getCsrfToken === 'function') { const csrf = getCsrfToken(); if (csrf) headers['X-CSRFToken'] = csrf; }

        try {
          saveBtn.disabled = true;
          const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ fields }), credentials: 'same-origin' });
          const data = await resp.json().catch(() => null);
          if (!resp.ok || !data || data.status !== 'ok') throw new Error((data && data.msg) ? data.msg : `HTTP ${resp.status}`);

          const updated = data.updated || {};
          editableTds.forEach(td => {
            const col = td.dataset.col;
            let newVal = updated[col];
            if (newVal === undefined) {
              const inp = td.querySelector('.edit-input');
              if (!inp) return;
              newVal = inp.tagName.toLowerCase() === 'select' ? inp.options[inp.selectedIndex]?.text || inp.value : inp.value;
            }

            // === Normaliza formato BR ===
            if (col === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(newVal)) {
              const [y, m, d] = newVal.split('-');
              newVal = `${d}/${m}/${y}`;
            } else if (col.toLowerCase().includes('nf') || col.toLowerCase().includes('numero')) {
              newVal = String(parseInt(String(newVal).replace(/\./g, '').replace(',', '')));
            } else if ((typeof newVal === 'string' && newVal.trim().endsWith('%')) || col.toLowerCase().includes('ipi') || col.toLowerCase().includes('percent')) {
              let raw = String(newVal).replace('%', '').trim().replace(',', '.');
              if (!isNaN(raw)) newVal = parseFloat(raw).toFixed(2).replace('.', ',') + '%';
            } else if (!isNaN(String(newVal).replace(',', '.'))) {
              let num = parseFloat(String(newVal).replace(',', '.'));
              if (!isNaN(num)) {
                let [intPart, decPart] = num.toFixed(2).split('.');
                intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                newVal = intPart + ',' + decPart;
              }
            }

            td.textContent = newVal;
          });

          if (actionsTd) actionsTd.innerHTML = prevActionsHtml;
          row.classList.remove('editing');
          alert('Atualizado com sucesso.');
        } catch (err) {
          alert('Falha ao salvar: ' + (err.message || err));
          saveBtn.disabled = false;
        }
      }, { once: true });
    });
  })();

  // --- preenche células/inputs numéricos vazios com 0,00 / 0,000 ---
  function fillEmptyNumericCells(root) {
    if (!root) return;
    const prefixes = [
      'valor_unitario',          // cobre valor_unitario_1..N e valor_unitario (sem sufixo)
      'duplicata',               // duplicata_1..N
      'valor_unitario_energia',  // campo específico
      'valor_mao_obra_tm_metallica',
      'peso_liquido',
      'valor_integral',
      'peso_integral'
    ];

    prefixes.forEach(pref => {
      // encontra tds com data-col que começam com o prefixo, e também inputs cujo name/id/ data-col começam com prefixo
      const tds = Array.from(root.querySelectorAll(`td[data-col^="${pref}"], td[class*="${pref}"], td.${pref}`));
      const inputs = Array.from(root.querySelectorAll(
        `input[data-col^="${pref}"], input[name^="${pref}"], input[id^="${pref}"]`
      ));

      const decimals = pref.startsWith('peso') ? 3 : 2;
      const zeroText = decimals === 3 ? '0,000' : '0,00';

      tds.forEach(td => {
        const txt = (td.textContent || '').trim();
        // trata como vazio também traços/placeholder comuns
        if (txt === '' || txt === '-' || txt === '—' || txt === 'null' || txt === 'undefined') {
          // se dentro do td existir um input, atualiza o input; senão atualiza o textContent
          const inp = td.querySelector('input, select, textarea');
          if (inp) {
            if (inp.tagName.toLowerCase() === 'input' || inp.tagName.toLowerCase() === 'textarea') {
              inp.value = zeroText;
              // marca dataset.col se não existir (ajuda handlers posteriores)
              if (!inp.dataset.col && inp.name) inp.dataset.col = inp.name;
              // força formatação final (se existir)
              try { if (typeof handleNumericFinalize === 'function') handleNumericFinalize(inp); } catch(e){/* ignore */ }
            } else if (inp.tagName.toLowerCase() === 'select') {
              // nada para setar em selects (deixa em branco)
            }
          } else {
            td.textContent = zeroText;
          }
        }
      });

      // inputs soltos (fora do td) — por exemplo formulários de edição/linhas inline
      inputs.forEach(inp => {
        const v = (inp.value || '').trim();
        if (v === '' || v === '-' || v === '—') {
          inp.value = zeroText;
          if (!inp.dataset.col && inp.name) inp.dataset.col = inp.name;
          try { if (typeof handleNumericFinalize === 'function') handleNumericFinalize(inp); } catch(e){/* ignore */ }
        }
      });
    });
  }


  // Gestão de Materiais (ajustado para usar input type="text" e data-col)
  const materiaisContainer = document.getElementById('materiais-container');
  const btnAddMaterial     = document.getElementById('btn-add-material');
  const btnRemoveMaterial  = document.getElementById('btn-remove-material');
  const MAX_MATERIAIS      = 5;

  if (btnAddMaterial) {
    btnAddMaterial.addEventListener('click', () => {
      const existing = Array.from(
        materiaisContainer.querySelectorAll('.material-row')
      ).map(r =>
        parseInt(r.querySelector('select[name^="material_"]').name.split('_')[1], 10)
      );
      if (existing.length >= MAX_MATERIAIS) return;

      let idx;
      for (let i = 1; i <= MAX_MATERIAIS; i++) {
        if (!existing.includes(i)) { idx = i; break; }
      }
      if (!idx) return;
      addMaterialRow(idx);
      reorderMateriais(materiaisContainer, ['material', 'valor_unitario']);
    });
  }
  if (btnRemoveMaterial) {
    btnRemoveMaterial.addEventListener('click', () => {
      const rows = materiaisContainer.querySelectorAll('.material-row');
      if (rows.length > 0) {
        rows[rows.length - 1].remove();
        reorderMateriais(materiaisContainer, ['material', 'valor_unitario']);
      }
    });
  }

  function addMaterialRow(idx) {
    const row = document.createElement('div');
    row.className = 'form-row horizontal align-end material-row';
    row.innerHTML = `
      <div class="form-group">
        <label for="material_${idx}">Material ${idx}:</label>
        <select id="material_${idx}" name="material_${idx}">
          <option value="">Selecione o material</option>
          ${window.materiaisOptions.map(mat => `<option value="${mat}">${mat}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="valor_unitario_${idx}">Valor Unit. ${idx}:</label>
        <input type="text" data-col="valor_unitario_${idx}" step="0.01" id="valor_unitario_${idx}" name="valor_unitario_${idx}" />
      </div>
    `;
    materiaisContainer.appendChild(row);
  }

  function reorderMateriais(container, prefixes) {
    const rows = Array.from(container.children);
    rows.sort((a, b) => {
      const aIdx = parseInt(a.querySelector(`select[name^="${prefixes[0]}_"]`).name.split('_')[1], 10);
      const bIdx = parseInt(b.querySelector(`select[name^="${prefixes[0]}_"]`).name.split('_')[1], 10);
      return aIdx - bIdx;
    });
    container.innerHTML = '';
    rows.forEach((row, i) => {
      const idx = i + 1;
      prefixes.forEach(pref => {
        const isSelect = pref === 'material';
        const field = row.querySelector(isSelect
          ? `select[name^="${pref}_"]`
          : `input[name^="${pref}_"]`
        );
        const label = row.querySelector(`label[for^="${pref}_"]`);
        if (field && label) {
          const newFor = `${pref}_${idx}`;
          label.setAttribute('for', newFor);
          label.textContent = isSelect
            ? `Material ${idx}:`
            : `Valor Unit. ${idx}:`;
          field.id   = newFor;
          field.name = newFor;
          // se for input numérico, atualiza data-col
          if (!isSelect) field.dataset.col = `${pref}_${idx}`;
        }
      });
      container.appendChild(row);
    });
  }

  // Gestão de Duplicatas (ajustado para usar input type="text" e data-col)
  const duplicatasContainer = document.getElementById('duplicatas-container');
  const btnAddDuplicata     = document.getElementById('btn-add-duplicata');
  const btnRemoveDuplicata  = document.getElementById('btn-remove-duplicata');
  const MAX_DUPLICATAS      = 6;

  if (btnAddDuplicata) {
    btnAddDuplicata.addEventListener('click', () => {
      const existing = Array.from(
        duplicatasContainer.querySelectorAll('.duplicata-row')
      ).map(r =>
        parseInt(r.querySelector('input[name^="duplicata_"]').name.split('_')[1], 10)
      );
      if (existing.length >= MAX_DUPLICATAS) return;

      let idx;
      for (let i = 1; i <= MAX_DUPLICATAS; i++) {
        if (!existing.includes(i)) { idx = i; break; }
      }
      addDuplicataRow(idx);
      reorderDuplicatas(duplicatasContainer, ['duplicata']);
    });
  }
  if (btnRemoveDuplicata) {
    btnRemoveDuplicata.addEventListener('click', () => {
      const rows = duplicatasContainer.querySelectorAll('.duplicata-row');
      if (rows.length > 0) {
        rows[rows.length - 1].remove();
        reorderDuplicatas(duplicatasContainer, ['duplicata']);
      }
    });
  }

  function addDuplicataRow(idx) {
    const row = document.createElement('div');
    row.className = 'duplicata-row';
    row.innerHTML = `
      <div class="form-group">
        <label for="duplicata_${idx}">Duplicata ${idx}:</label>
        <input type="text" data-col="duplicata_${idx}" step="0.01" id="duplicata_${idx}" name="duplicata_${idx}" />
      </div>
    `;
    duplicatasContainer.appendChild(row);
  }

  function reorderDuplicatas(container, prefixes) {
    const rows = Array.from(container.children);
    rows.sort((a, b) => {
      const aIdx = parseInt(a.querySelector(`input[name^="${prefixes[0]}_"]`).name.split('_')[1], 10);
      const bIdx = parseInt(b.querySelector(`input[name^="${prefixes[0]}_"]`).name.split('_')[1], 10);
      return aIdx - bIdx;
    });
    container.innerHTML = '';
    rows.forEach((row, i) => {
      const idx = i + 1;
      prefixes.forEach(pref => {
        const label = row.querySelector(`label[for^="${pref}_"]`);
        const input = row.querySelector(`input[name^="${pref}_"]`);
        if (label && input) {
          label.setAttribute('for', `${pref}_${idx}`);
          label.textContent = pref === 'valor_unitario'
            ? `Valor Unit. ${idx}:`
            : `${pref.charAt(0).toUpperCase() + pref.slice(1)} ${idx}:`;
          input.id   = `${pref}_${idx}`;
          input.name = `${pref}_${idx}`;
          // atualiza data-col
          input.dataset.col = `${pref}_${idx}`;
        }
      });
      container.appendChild(row);
    });
  }
  // Auto-dismiss para banners/toasts tipo "Entrada de NF salva com sucesso!"
  (function autoDismissFlash() {
    const AUTO_DISMISS_MS = 2000; // tempo até começar a desaparecer (ms)
    const FADE_MS = 500; // duração do fade (ms)

    // seletores que normalmente contêm mensagens flash
    const candidateSelectors = [
      '.alert', '.alert-success', '.alert-info', '.flash', '.flash-message',
      '.notification', '.toast', '#flash', '#flashMessage', '.message', '.msg'
    ];

    // reúne elementos que batem nos seletores
    let elems = [];
    candidateSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => elems.push(el));
    });

    // se não encontrou nada por seletor, faz busca por texto específico (case-insensitive)
    if (elems.length === 0) {
      const needle = 'Entrada de NF salva'; // texto parcial que busca no conteúdo
      // busca em elementos comumente usados (limita custo)
      const candidates = document.querySelectorAll('div, p, span, section');
      candidates.forEach(el => {
        try {
          if (el.innerText && el.innerText.toLowerCase().includes(needle.toLowerCase())) {
            elems.push(el);
          }
        } catch (e) { /* alguns nodes podem lançar em innerText - ignoramos */ }
      });
    }

    // aplica animação de fade + remoção para cada elemento encontrado
    elems = Array.from(new Set(elems)); // dedupe
    elems.forEach(el => {
      // prepara estilos para animação (não sobrescreve se já tiver transition)
      const prevTransition = el.style.transition || '';
      el.style.transition = `opacity ${FADE_MS}ms ease, max-height ${FADE_MS}ms ease, margin ${FADE_MS}ms ease`;
      // garante estado inicial
      el.style.opacity = el.style.opacity || '1';
      // define max-height pra animação (caso seja um bloco)
      const currentHeight = el.scrollHeight;
      el.style.maxHeight = (currentHeight ? `${currentHeight}px` : '200px');
      el.style.overflow = 'hidden';

      // espera AUTO_DISMISS_MS, depois aplica fade e remove do DOM
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.maxHeight = '0';
        el.style.margin = '0';
        // remove após a duração do fade
        setTimeout(() => {
          try { el.remove(); } catch (e) { /* ignore */ }
          // restaura transition caso precise (opcional)
          // el.style.transition = prevTransition;
        }, FADE_MS + 20);
      }, AUTO_DISMISS_MS);
    });
  })();

  /// === Calculadora Média Ponderada ===
  (function initWeightedAvgCalculator() {
    const btnOpen = document.getElementById('btnOpenWAvg');
    const modal = document.getElementById('modal-wavg');
    if (!modal || !btnOpen) return;

    const rowsContainer = modal.querySelector('#wavg-rows');
    const btnAdd = modal.querySelector('#wavg-add-row');
    const btnRemove = modal.querySelector('#wavg-remove-row');
    const btnCalc = modal.querySelector('#wavg-calc');
    const btnClear = modal.querySelector('#wavg-clear');
    const btnClose = document.getElementById('closeWAvgBtn');
    const resultDiv = modal.querySelector('#wavg-result');

    // parse número no formato BR (aceita "1.234,56" ou "1234.56")
    function parseNumber(v) {
      if (v === undefined || v === null) return NaN;
      const s = String(v).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : NaN;
    }

    // formatar com 3 casas e vírgula (usado para inputs quando perde foco)
    function formatWithComma3(val) {
      if (val === undefined || val === null || val === '') return '';
      const num = typeof val === 'number' ? val : parseNumber(val);
      if (!Number.isFinite(num)) return '';
      return num.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    }

    // cria 1 linha: inputs para valor e peso
    function createRow(value = '', weight = '') {
      const wrapper = document.createElement('div');
      wrapper.className = 'wavg-row';
      wrapper.style.display = 'flex';
      wrapper.style.gap = '8px';
      wrapper.style.alignItems = 'center';
      wrapper.style.marginBottom = '6px';

      const valInput = document.createElement('input');
      valInput.type = 'text';
      valInput.placeholder = 'Valor';
      valInput.className = 'wavg-value';
      valInput.style.flex = '1';
      valInput.value = value;
      valInput.dataset.col = 'valor_unitario_wavg';
      valInput.setAttribute('inputmode', 'decimal');
      // estilos inline (redundância)
      valInput.style.height = '44px';
      valInput.style.padding = '8px 12px';
      valInput.style.fontSize = '15px';
      valInput.style.borderRadius = '6px';
      valInput.style.boxSizing = 'border-box';
      valInput.style.border = '1px solid #d1d5db';

      const weightInput = document.createElement('input');
      weightInput.type = 'text';
      weightInput.placeholder = 'Peso';
      weightInput.className = 'wavg-weight';
      weightInput.style.width = '120px';
      weightInput.value = weight;
      weightInput.dataset.col = 'peso_wavg';
      weightInput.setAttribute('inputmode', 'decimal');
      weightInput.style.height = '44px';
      weightInput.style.padding = '8px 12px';
      weightInput.style.fontSize = '15px';
      weightInput.style.borderRadius = '6px';
      weightInput.style.boxSizing = 'border-box';
      weightInput.style.border = '1px solid #d1d5db';

      // enquanto digita: tenta usar handleNumericLiveInput se existir, e recalcula
      valInput.addEventListener('input', () => {
        try { if (typeof handleNumericLiveInput === 'function') handleNumericLiveInput(valInput); } catch (e) {}
        computeAndShow();
      });
      weightInput.addEventListener('input', () => {
        try { if (typeof handleNumericLiveInput === 'function') handleNumericLiveInput(weightInput); } catch (e) {}
        computeAndShow();
      });

      // ao perder foco: tenta handleNumericFinalize, senão fallback para 3 casas; depois recalcula
      valInput.addEventListener('blur', () => {
        try {
          if (typeof handleNumericFinalize === 'function') handleNumericFinalize(valInput);
          else valInput.value = formatWithComma3(valInput.value);
        } catch (e) {
          valInput.value = formatWithComma3(valInput.value);
        }
        computeAndShow();
      });
      weightInput.addEventListener('blur', () => {
        try {
          if (typeof handleNumericFinalize === 'function') handleNumericFinalize(weightInput);
          else weightInput.value = formatWithComma3(weightInput.value);
        } catch (e) {
          weightInput.value = formatWithComma3(weightInput.value);
        }
        computeAndShow();
      });

      // formata valores iniciais se fornecidos
      try {
        if (value) {
          if (typeof handleNumericLiveInput === 'function') handleNumericLiveInput(valInput);
          else valInput.value = formatWithComma3(value);
        }
      } catch (e) {}
      try {
        if (weight) {
          if (typeof handleNumericLiveInput === 'function') handleNumericLiveInput(weightInput);
          else weightInput.value = formatWithComma3(weight);
        }
      } catch (e) {}

      wrapper.appendChild(valInput);
      wrapper.appendChild(weightInput);
      return wrapper;
    }

    function addRow(value = '', weight = '') {
      const row = createRow(value, weight);
      rowsContainer.appendChild(row);
      const inps = row.querySelectorAll('input');
      if (inps && inps[0]) inps[0].focus();
      computeAndShow();
    }

    function removeRow() {
      const rows = rowsContainer.querySelectorAll('.wavg-row');
      if (rows.length) rows[rows.length - 1].remove();
      computeAndShow();
    }

    function clearRows() {
      rowsContainer.innerHTML = '';
      if (resultDiv) {
        resultDiv.textContent = '';
        resultDiv.style.color = '';
      }
    }

    // calcula média ponderada (retorna avg numérico e soma dos pesos)
    function computeWeightedAverage() {
      const rows = Array.from(rowsContainer.querySelectorAll('.wavg-row'));
      let sumWeighted = 0, sumWeights = 0;
      rows.forEach(row => {
        const vEl = row.querySelector('.wavg-value');
        const wEl = row.querySelector('.wavg-weight');
        if (!vEl || !wEl) return;
        const numV = parseNumber(vEl.value);
        const numW = parseNumber(wEl.value);
        if (!Number.isFinite(numV) || !Number.isFinite(numW) || numW === 0) return;
        sumWeighted += numV * numW;
        sumWeights += numW;
      });
      if (sumWeights === 0) return { ok: false };
      return { ok: true, avg: sumWeighted / sumWeights, sumWeights };
    }

    // formata e exibe: média com 2 casas decimais
    function computeAndShow() {
      const res = computeWeightedAverage();
      if (!res.ok) {
        if (resultDiv) {
          resultDiv.textContent = 'Preencha ao menos uma linha com valor e peso (peso ≠ 0).';
          resultDiv.style.color = '#666';
        }
        return;
      }
      const formattedAvg = res.avg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedWeights = res.sumWeights.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
      if (resultDiv) {
        resultDiv.textContent = `Média ponderada: ${formattedAvg} (pesos total: ${formattedWeights})`;
        resultDiv.style.color = '#1a7f37';
      }
      return res.avg;
    }

    // abre modal e garante 2 linhas iniciais
    btnOpen.addEventListener('click', () => {
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      if (rowsContainer.children.length === 0) {
        addRow('', '');
        addRow('', '');
      }
      computeAndShow();
    });

    // fechar modal
    btnClose.addEventListener('click', () => {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
      }
    });

    btnAdd.addEventListener('click', () => addRow('', ''));
    btnRemove.addEventListener('click', removeRow);
    btnClear.addEventListener('click', () => {
      clearRows();
      addRow('', '');
      addRow('', '');
      computeAndShow();
    });
    btnCalc.addEventListener('click', computeAndShow);

    // enter = calcular
    modal.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        computeAndShow();
      }
    });

    // aplica formatação automática no blur (formatar com 3 casas)
    rowsContainer.addEventListener('blur', (e) => {
      if (e.target.matches('.wavg-value, .wavg-weight')) {
        const formatted = formatWithComma3(e.target.value);
        if (formatted !== '') e.target.value = formatted;
      }
    }, true);

  })(); // fim da IIFE da calculadora


  // === Modal arrastável ===
  (function makeWavgModalDraggable() {
    const modal = document.getElementById("modal-wavg");
    const modalContent = modal?.querySelector(".modal-content");
    const header = modal?.querySelector(".modal-header");
    if (!modal || !modalContent || !header) return;

    let isDragging = false;
    let startX, startY, initialX, initialY;

    header.style.cursor = "move";

    header.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = modalContent.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      modalContent.style.position = "absolute";
      modalContent.style.margin = "0";
      modalContent.style.zIndex = "1001";
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      modalContent.style.left = initialX + dx + "px";
      modalContent.style.top = initialY + dy + "px";
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = "auto";
      }
    });
  })();

  // ---------- FUNÇÃO DE EXPORTAÇÃO ----------
  window.initEntradaExport = function() {
    console.log('Inicializando exportação de entradas…');

    const btnExcel = document.getElementById('btnExportEntradaExcel');
    const btnPdf = document.getElementById('btnExportEntradaPdf');
    const form = document.getElementById('form-filtros-entrada');

    if(btnExcel) {
      btnExcel.addEventListener('click', function() {
        const params = new URLSearchParams(new FormData(form)).toString();
        window.open(`/entrada_nf/exportar_filtrado?tipo=excel&${params}`, '_blank');
      });
    }

    if(btnPdf) {
      btnPdf.addEventListener('click', function() {
        const params = new URLSearchParams(new FormData(form)).toString();
        window.open(`/entrada_nf/exportar_filtrado?tipo=pdf&${params}`, '_blank');
      });
    }
  };

  // ---------- FUNÇÕES DO MODAL DE LISTAGEM (AJAX) ----------
  (function(){
    if (window.__entradaListAjaxInit) return;
    window.__entradaListAjaxInit = true;

    function $id(id){ return document.getElementById(id) || null; }
    function qsel(sel, root){ return (root || document).querySelector(sel); }
    function qselAll(sel, root){ return Array.from((root || document).querySelectorAll(sel)); }

    async function loadEntradasIntoModal(opts = {}) {
      const modal = $id('modal-entradas');
      if (!modal) return;

      let container = qsel('.table-container', modal) || qsel('.table-container');
      if (!container) return;

      const params = new URLSearchParams();
      if(opts.page) params.append('page', opts.page);
      if(opts.search) params.append('search', opts.search);
      params.append('_', Date.now());

      try {
        container.innerHTML = '<div style="padding:1rem">Carregando entradas…</div>';
        const resp = await fetch('/entrada_nf/listar?' + params.toString(), {
          method: 'GET',
          headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if(!resp.ok) throw new Error('Erro ao buscar listagem');
        const html = await resp.text();

        const tmp = document.createElement('div');
        tmp.innerHTML = html.trim();
        const newContainer = tmp.querySelector('.table-container');
        if(newContainer) container.replaceWith(newContainer);
        else container.innerHTML = html;

        attachModalPaginationHandlers();
      } catch(err) {
        console.error('loadEntradasIntoModal error:', err);
        container.innerHTML = '<div style="padding:1rem;color:#900">Falha ao carregar entradas.</div>';
      }
    }

    function attachModalPaginationHandlers() {
      const modal = $id('modal-entradas');
      if(!modal) return;

      if(!modal._pagBound){
        modal._pagBound = true;
        modal.addEventListener('click', function(ev){
          const a = ev.target.closest ? ev.target.closest('.page-btn') : null;
          if(!a) return;
          ev.preventDefault();
          const page = a.dataset.page || 1;
          const searchInput = $id('searchEntradaInput');
          const q = searchInput && searchInput.value ? searchInput.value.trim() : '';
          loadEntradasIntoModal({ page: page, search: q });
        });
      }

      const searchInput = $id('searchEntradaInput');
      if(searchInput && !searchInput._enterBound){
        searchInput._enterBound = true;
        searchInput.addEventListener('keydown', function(ev){
          if(ev.key === 'Enter'){
            ev.preventDefault();
            const q = (searchInput.value || '').trim();
            loadEntradasIntoModal({ page: 1, search: q });
          }
        });
      }

      const searchBtn = $id('searchEntradaBtn');
      if(searchBtn && !searchBtn._bound){
        searchBtn._bound = true;
        searchBtn.addEventListener('click', function(ev){
          ev.preventDefault();
          const q = ($id('searchEntradaInput').value || '').trim();
          loadEntradasIntoModal({ page: 1, search: q });
        });
      }
    }

    function openFiltersModalAndLoad() {
      const modalFiltros = $id('modal-filtros-entrada');
      if(!modalFiltros) return;

      modalFiltros.classList.add('show');
      modalFiltros.style.display = 'flex';
      modalFiltros.setAttribute('aria-hidden', 'false');

      // ... carregar listagem ...
      const q = ($id('searchEntradaInput') && $id('searchEntradaInput').value) ? $id('searchEntradaInput').value.trim() : '';
      loadEntradasIntoModal({ page: 1, search: q });

      // binda controles de fechar / ESC / overlay
      try { window.bindFiltersModalControls(); } catch(e){ console.warn('bindFiltersModalControls falhou', e); }
    }

    document.addEventListener('click', function(ev){
      const el = ev.target.closest ? ev.target.closest('#btnExportEntrada') : null;
      if(!el) return;
      ev.preventDefault();
      openFiltersModalAndLoad();
    });

    // --- handlers específicos do modal de filtros / exportação ---
    (function(){
      const modalId = 'modal-filtros-entrada';

      function $id(id){ return document.getElementById(id) || null; }

      function closeFiltersModal() {
        const modal = $id(modalId);
        if (!modal) return;
        modal.classList.remove('show');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');

        // remove handler de ESC (se registrado)
        if (modal._escHandler) {
          document.removeEventListener('keydown', modal._escHandler, true);
          modal._escHandler = null;
        }
      }

      function bindFiltersModalControls() {
        const modal = $id(modalId);
        if (!modal) return;

        // 1) botao "x" / close dentro do modal — tenta varios seletores comuns
        if (!modal._closeBound) {
          const closeBtn = modal.querySelector('[data-dismiss="modal"], .modal-close, .close, .btn-close, .fechar-modal, .feather-x');
          if (closeBtn) {
            closeBtn.addEventListener('click', function(ev){
              ev.preventDefault();
              closeFiltersModal();
            });
          } else {
            // se não encontrou o botão, faz um listener geral para elementos com data-action="close"
            modal.addEventListener('click', function(ev){
              const btn = ev.target.closest ? ev.target.closest('[data-action="close"]') : null;
              if (btn) { ev.preventDefault(); closeFiltersModal(); }
            });
          }
          modal._closeBound = true;
        }

        // 2) click no overlay (clicar fora do conteúdo fecha o modal)
        if (!modal._overlayBound) {
          modal.addEventListener('click', function(ev){
            // fecha apenas se o clique foi no próprio backdrop (elemento modal), não em um filho
            if (ev.target === modal) closeFiltersModal();
          });
          modal._overlayBound = true;
        }

        // 3) ESC: registrar um handler que captura o evento (use capture:true para interceptar antes dos outros)
        if (!modal._escBound) {
          const escHandler = function(ev){
            const isEsc = ev.key === 'Escape' || ev.key === 'Esc';
            if (!isEsc) return;
            // apenas fecha se o modal estiver visível
            if (modal.classList.contains('show') || modal.style.display === 'flex' || modal.style.display === 'block') {
              ev.preventDefault();
              ev.stopImmediatePropagation ? ev.stopImmediatePropagation() : ev.stopPropagation();
              closeFiltersModal();
            }
          };
          // registra com capture = true para interceptar antes de outros handlers que possam fechar outro modal
          document.addEventListener('keydown', escHandler, true);
          modal._escHandler = escHandler;
          modal._escBound = true;
        }
      }

      // expõe para que openFiltersModalAndLoad possa chamar após mostrar o modal
      window.bindFiltersModalControls = bindFiltersModalControls;
      window.closeFiltersModal = closeFiltersModal;
    })();
    window.loadEntradasIntoModal = loadEntradasIntoModal;
  })();

  // ---------- EXECUTA INIT DE EXPORTAÇÃO ----------
  initEntradaExport();

  // --- Import Modal (Entrada NF) ---
  (function () {
    if (window.__entradaImportDelegationInit) {
      console.debug('[entrada_nf] import delegation já inicializado — pulando reinit');
      return;
    }
    window.__entradaImportDelegationInit = true;

    console.debug('[entrada_nf] inicializando import (delegation - robust)');

    // helpers para mostrar / esconder modal (suporta style.display ou classe .show)
    function showModal(modal) {
      if (!modal) return;
      if (modal.classList) modal.classList.add('show');
      modal.style.display = 'flex';
    }
    function hideModal(modal) {
      if (!modal) return;
      if (modal.classList) modal.classList.remove('show');
      modal.style.display = 'none';
    }

    // calcula checksum SHA-256 do arquivo (hex) - opcional (útil para dedupe no backend)
    async function computeFileChecksum(file) {
      if (!window.crypto || !crypto.subtle || !file) return null;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hex;
      } catch (err) {
        console.warn('[entrada_nf] erro ao calcular checksum:', err);
        return null;
      }
    }

    // guarda XHR por form para permitir abort
    const xhrByForm = new WeakMap();

    // trata submit do formulário (delegado) - versão segura
    async function handleFormSubmit(ev) {
      const form = ev.target;
      if (!form || form.id !== 'form-import-excel') return;
      ev.preventDefault();

      // evita envio duplicado por flag
      if (form.dataset.submitting === '1') {
        console.warn('[entrada_nf] import já em andamento — envio cancelado (flag submitting)');
        return;
      }

      // elementos de UI (pode ser que o form esteja dentro do modal injetado)
      const progressContainer = form.querySelector('#progressContainer') || document.getElementById('progressContainer');
      const progressBar = form.querySelector('#progressBar') || document.getElementById('progressBar');
      const progressText = form.querySelector('#progressText') || document.getElementById('progressText');
      const importMessage = form.querySelector('#importMessage') || document.getElementById('importMessage');
      const importMsgText = form.querySelector('#importMsgText') || document.getElementById('importMsgText');
      const submitBtn = form.querySelector('button[type="submit"]');
      const fileInput = form.querySelector('input[type="file"][name="arquivo_excel"]');
      const cancelBtn = form.querySelector('#cancelImport') || document.getElementById('cancelImport');

      // limpa mensagens antigas
      if (importMessage) { importMessage.style.display = 'none'; if (importMsgText) importMsgText.textContent = ''; }

      // validações simples
      if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        if (importMessage) { importMessage.style.display = 'block'; importMsgText.textContent = 'Selecione um arquivo antes de enviar.'; importMsgText.style.color = 'red'; }
        return;
      }

      const file = fileInput.files[0];
      const name = file.name || '';
      const ext = name.split('.').pop().toLowerCase();
      if (!['xls','xlsx'].includes(ext)) {
        if (importMessage) { importMessage.style.display = 'block'; importMsgText.textContent = 'Formato inválido. Use .xls ou .xlsx'; importMsgText.style.color = 'red'; }
        return;
      }

      const maxSizeMB = 20;
      if (file.size > maxSizeMB * 1024 * 1024) {
        if (importMessage) { importMessage.style.display = 'block'; importMsgText.textContent = `Arquivo muito grande. Máx ${maxSizeMB} MB.`; importMsgText.style.color = 'red'; }
        return;
      }

      // sinaliza envio em andamento
      form.dataset.submitting = '1';
      if (submitBtn) submitBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;
      if (fileInput) fileInput.disabled = true;

      // opcional: calcula checksum (pode ajudar o backend a detectar reenvios do mesmo arquivo)
      let checksum = null;
      try {
        checksum = await computeFileChecksum(file);
        if (checksum) console.debug('[entrada_nf] checksum do arquivo:', checksum);
      } catch (err) {
        console.warn('[entrada_nf] falha ao calcular checksum (seguindo sem):', err);
        checksum = null;
      }

      // prepara FormData
      const formData = new FormData();
      formData.append("arquivo_excel", fileInput.files[0]);
      if (checksum) formData.append("file_checksum", checksum);

      // cria XHR com suporte a abort
      const xhr = new XMLHttpRequest();
      xhr.open('POST', form.action, true);
      try { xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest'); } catch(e) { /* some servers restrict setRequestHeader before open in some contexts */ }

      // armazena para possível abort
      xhrByForm.set(form, xhr);

      // mostra barra
      if (progressContainer) progressContainer.style.display = 'block';
      if (progressBar) progressBar.style.width = '0%';
      if (progressText) progressText.textContent = '0%';

      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          if (progressBar) progressBar.style.width = percent + '%';
          if (progressText) progressText.textContent = percent + '%';
        }
      }, { passive: true });

      xhr.onload = () => {
        // limpa estado
        form.dataset.submitting = '0';
        if (submitBtn) submitBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        if (fileInput) fileInput.disabled = false;
        xhrByForm.delete(form);

        let json = null;
        try { json = JSON.parse(xhr.responseText); } catch (err) { json = null; }

        if (xhr.status >= 200 && xhr.status < 300) {
          const msg = (json && typeof json.inserted !== 'undefined')
            ? `Importação concluída. Inseridos: ${json.inserted||0}. Falhas: ${json.failed||0}.`
            : 'Importação concluída.';
          if (importMessage) { importMessage.style.display = 'block'; importMsgText.textContent = msg; importMsgText.style.color = 'green'; }

          // log detalhado ajuda a investigar duplicações
          console.info('[entrada_nf] import sucesso -> resposta:', json || xhr.responseText);

          // atualiza a listagem re-carregando do servidor (não faça append local)
          try {
            const modalSearchEl = document.querySelector('#modal-entradas #searchEntradaInput');
            const q = modalSearchEl && modalSearchEl.value ? modalSearchEl.value.trim() : '';
            if (typeof loadPage === 'function') loadPage(1, q);
            else console.warn('[entrada_nf] loadPage não encontrada para atualizar listagem');
          } catch (err) {
            console.warn('[entrada_nf] erro ao recarregar listagem:', err);
          }

        } else {
          const errText = (json && json.error) ? json.error : (xhr.responseText || xhr.statusText);
          if (importMessage) { importMessage.style.display = 'block'; importMsgText.textContent = 'Erro ao importar: ' + errText; importMsgText.style.color = 'red'; }
          console.error('[entrada_nf] import falhou ->', errText);
        }

        // limpa barra depois de curto tempo
        setTimeout(() => {
          if (progressContainer) progressContainer.style.display = 'none';
          if (progressBar) progressBar.style.width = '0%';
          if (progressText) progressText.textContent = '0%';
        }, 800);
      };

      xhr.onerror = () => {
        form.dataset.submitting = '0';
        if (submitBtn) submitBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        if (fileInput) fileInput.disabled = false;
        xhrByForm.delete(form);

        if (importMessage) { importMessage.style.display = 'block'; importMsgText.textContent = 'Falha na conexão ao enviar arquivo.'; importMsgText.style.color = 'red'; }
        console.error('[entrada_nf] erro de conexão durante import');
        if (progressContainer) setTimeout(() => progressContainer.style.display = 'none', 800);
      };

      xhr.send(formData);
    }

    // handler global de clique (abre/fecha modal, suporta botões dinâmicos)
    function globalClickHandler(e) {
      // abre modal
      const openBtn = e.target.closest('#btnImportEntrada');
      if (openBtn) {
        const modal = document.getElementById('modal-import-entrada');
        showModal(modal);
        return;
      }

      // fecha modal (botão fechar ou cancelar dentro do modal)
      const closeBtn = e.target.closest('#importClose, #cancelImport');
      if (closeBtn) {
        const modal = document.getElementById('modal-import-entrada');
        // se for cancelImport, abortar XHR em andamento (se houver)
        if (closeBtn.id === 'cancelImport') {
          const modal = document.getElementById('modal-import-entrada');
          const form = modal ? modal.querySelector('#form-import-excel') : document.getElementById('form-import-excel');
          if (form) {
            const xhr = xhrByForm.get(form);
            if (xhr && typeof xhr.abort === 'function') {
              try { xhr.abort(); console.debug('[entrada_nf] envio abortado pelo usuário (cancelImport)'); } catch (err) { console.warn('[entrada_nf] falha ao abortar XHR:', err); }
            }
          }
        }
        hideModal(modal);
        return;
      }

      // clique fora do conteúdo do modal: verifica se é o próprio backdrop (fecha)
      const modalEl = document.getElementById('modal-import-entrada');
      if (modalEl && e.target === modalEl) {
        hideModal(modalEl);
        return;
      }
    }

    // Inicializa: adiciona listeners delegados (um só listener de click + submit)
    function init() {
      console.debug('[entrada_nf] attach delegated listeners (import)');
      // garante que não existam binds duplicados
      document.removeEventListener('click', globalClickHandler);
      document.addEventListener('click', globalClickHandler);

      // submit delegada para suportar formulários injetados
      document.removeEventListener('submit', handleFormSubmit);
      document.addEventListener('submit', function (ev) {
        if (ev.target && ev.target.id === 'form-import-excel') handleFormSubmit(ev);
      }, true);

      // suporte ao ESC para fechar modal (global)
      document.removeEventListener('keydown', keydownHandler);
      document.addEventListener('keydown', keydownHandler);
    }

    function keydownHandler(ev) {
      if (ev.key === 'Escape' || ev.key === 'Esc') {
        const modal = document.getElementById('modal-import-entrada');
        if (modal && modal.classList.contains('show')) hideModal(modal);
      }
    }

    // aguarda DOM pronto (fallback com timeout)
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      init();
    } else {
      document.addEventListener('DOMContentLoaded', init);
      setTimeout(init, 250); // fallback
    }

    // expõe função initEntradaImport (compatibilidade com outras partes do código)
    if (typeof window.initEntradaImport !== 'function') {
      window.initEntradaImport = function () {
        // função de compatibilidade (pode ser chamada externamente)
        console.debug('[entrada_nf] window.initEntradaImport() chamada — noop por enquanto');
      };
    }

  })(); // fim da IIFE

  function setupFixedHScrollImproved() {
    const modal = document.getElementById('modal-entradas');
    if (!modal) return;
    const modalContent = modal.querySelector('.modal-content') || modal;
    const modalBody = modal.querySelector('.modal-body');
    if (!modalBody) return;
    const tableContainer = modalBody.querySelector('.table-container');
    if (!tableContainer) return;
    const table = tableContainer.querySelector('table');
    if (!table) return;

    // remove wrapper antigo, se existir
    const old = modalContent.querySelector('.fixed-hscroll-wrapper');
    if (old) {
      if (old._ro) old._ro.disconnect();
      if (old._cleanup) { try { old._cleanup(); } catch(e) {} }
      old.remove();
    }

    // cria wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'fixed-hscroll-wrapper';
    wrapper.setAttribute('aria-hidden', 'true');

    const inner = document.createElement('div');
    inner.className = 'fixed-hscroll-inner';
    wrapper.appendChild(inner);

    modalContent.appendChild(wrapper);

    function readGap() {
      const val = getComputedStyle(document.documentElement).getPropertyValue('--fixed-hscroll-gap') || '';
      const n = parseInt(val, 10);
      return Number.isFinite(n) ? n : 8;
    }

    function readWrapperHeight() {
      // tenta ler a variável CSS, senão usa a altura real do wrapper
      const vh = getComputedStyle(document.documentElement).getPropertyValue('--fixed-hscroll-h') || '';
      const n = parseFloat(vh);
      if (Number.isFinite(n) && n > 0) return n;
      return wrapper.clientHeight || 14;
    }

    let raf = null;

    function updateInnerWidthAndVisibility() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const scrollW = table.scrollWidth || tableContainer.scrollWidth || table.offsetWidth;
        inner.style.width = (scrollW) + 'px';

        const tcRect = tableContainer.getBoundingClientRect();
        const mcRect = modalContent.getBoundingClientRect();

        if (scrollW <= tableContainer.clientWidth) {
          wrapper.style.display = 'none';
          // limpa padding-bottom adicional
          modalContent.style.paddingBottom = '';
        } else {
          wrapper.style.display = '';
          // alinha horizontalmente ao tableContainer
          const relLeft = Math.max(0, tcRect.left - mcRect.left);
          wrapper.style.left = relLeft + 'px';
          wrapper.style.width = (tcRect.width) + 'px';

          // posiciona verticalmente acima da paginação (se houver)
          const pagination = modalContent.querySelector('.pagination');
          const paginationH = pagination ? pagination.offsetHeight : 0;
          const gap = readGap();
          const wrapperH = readWrapperHeight();

          // bottom: desloca a barra para ficar acima da paginação
          wrapper.style.bottom = (paginationH + gap) + 'px';

          // adiciona padding-bottom ao modalContent para evitar que a tabela "fique por baixo"
          // soma pagination + wrapper + gap extra de segurança
          const extra = 12;
          modalContent.style.paddingBottom = (paginationH + wrapperH + gap + extra) + 'px';

          // garante que paginação tenha z-index maior (para ficar sobre a barra)
          if (pagination) {
            pagination.style.position = pagination.style.position || 'relative';
            pagination.style.zIndex = pagination.style.zIndex || '1300';
          }
        }
      });
    }

    // sincronização entre barras
    let syncingFromWrapper = false;
    let syncingFromTable = false;

    function onTableScroll() {
      if (syncingFromWrapper) return;
      syncingFromTable = true;
      wrapper.scrollLeft = tableContainer.scrollLeft;
      requestAnimationFrame(() => { syncingFromTable = false; });
    }

    function onWrapperScroll() {
      if (syncingFromTable) return;
      syncingFromWrapper = true;
      tableContainer.scrollLeft = wrapper.scrollLeft;
      requestAnimationFrame(() => { syncingFromWrapper = false; });
    }

    tableContainer.addEventListener('scroll', onTableScroll, { passive: true });
    wrapper.addEventListener('scroll', onWrapperScroll, { passive: true });

    const ro = new MutationObserver(() => updateInnerWidthAndVisibility());
    try {
      ro.observe(table, { attributes: true, childList: true, subtree: true });
      wrapper._ro = ro;
    } catch (e) {
      wrapper._ro = null;
    }

    const onWinResize = () => updateInnerWidthAndVisibility();
    window.addEventListener('resize', onWinResize, { passive: true });

    // inicializa
    updateInnerWidthAndVisibility();

    // cleanup
    wrapper._cleanup = () => {
      tableContainer.removeEventListener('scroll', onTableScroll);
      wrapper.removeEventListener('scroll', onWrapperScroll);
      window.removeEventListener('resize', onWinResize);
      if (wrapper._ro) { try { wrapper._ro.disconnect(); } catch (e) {} }
      try { wrapper.remove(); } catch (e) {}
      modalContent.style.paddingBottom = '';
    };
    table._fixedHScrollWrapper = wrapper;
  }
});
