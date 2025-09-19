document.addEventListener('DOMContentLoaded', () => {
  // -------------------- ESTADO GLOBAL --------------------
  window.selectedIds = window.selectedIds || new Set();
  const selectedIds = window.selectedIds;
  window._entradaSelectedAllPages = window._entradaSelectedAllPages || false;
  window.currentEntradaPage = window.currentEntradaPage || 1;
  window.materiaisOptions = window.materiaisOptions || [];
  window.ENTRADAS_PER_PAGE = window.ENTRADAS_PER_PAGE || 10;
  const SELECT_KEY = 'modalSelectedEntradaIds';
  const SELECT_ALL_KEY = 'modalSelectAllEntrada';

  console.log('Materiais disponíveis:', window.materiaisOptions);

  function saveSelectedIds() {
    try { localStorage.setItem(SELECT_KEY, JSON.stringify(Array.from(selectedIds))); } catch (e) { /* ignore */ }
  }
  function loadSelectedIds() {
    try { const v = JSON.parse(localStorage.getItem(SELECT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function clearPersistedSelection() {
    try { localStorage.removeItem(SELECT_KEY); localStorage.removeItem(SELECT_ALL_KEY); } catch(e) {}
  }
  function setSelectAllFlag(active) {
    try { if (active) localStorage.setItem(SELECT_ALL_KEY, '1'); else localStorage.removeItem(SELECT_ALL_KEY); } catch(e) {}
  }
  function isSelectAllFlag() {
    try { return localStorage.getItem(SELECT_ALL_KEY) === '1'; } catch(e) { return false; }
  }

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

  // DEFINIÇÃO da função (sem auto-chamar)
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

  // CHAMADA única — logo após as funções serem carregadas (fora da função acima)
  try { initMainNumericInputs(document); } catch (e) { console.warn('initMainNumericInputs init failed', e); }

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

      // tenta identificar IDs removidos a partir da resposta
      let removedIds = [];
      if (data && Array.isArray(data.removed_ids)) removedIds = data.removed_ids.map(String);
      else if (data && typeof data.removed === 'number' && data.removed === 1) removedIds = [String(id)];
      else {
        // fallback seguro: recarrega a página para sincronizar
        const curSearch = (modalContent && modalContent.querySelector('#searchEntradaInput')) ? modalContent.querySelector('#searchEntradaInput').value : '';
        await loadPage(window.currentEntradaPage || 1, curSearch || '');
        selectedIds.delete(String(id));
        refreshBulkStateAndSelectAll();
        alert('Excluído com sucesso.');
        return;
      }

      // remove do DOM apenas os IDs confirmados
      removedIds.forEach(rid => {
        const cb = modalContent ? modalContent.querySelector(`.selectEntrada[data-id="${CSS.escape(String(rid))}"]`) : null;
        if (cb) {
          const rtr = cb.closest('tr');
          if (rtr && rtr.parentNode) rtr.parentNode.removeChild(rtr);
        }
        selectedIds.delete(String(rid));
      });

      refreshBulkStateAndSelectAll();

      // Se a página ficou com menos que PER_PAGE linhas, recarrega para buscar próximas entradas
      try {
        const perPage = window.ENTRADAS_PER_PAGE || 10;
        const allRows = modalContent ? Array.from(modalContent.querySelectorAll('tbody tr')) : [];
        const visibleRows = allRows.filter(tr => !tr.classList.contains('no-data') && tr.querySelectorAll('td').length > 0);
        const curPage = window.currentEntradaPage || 1;
        const curSearch = (modalContent && modalContent.querySelector('#searchEntradaInput')) ? modalContent.querySelector('#searchEntradaInput').value : '';

        if (visibleRows.length === 0 && curPage > 1) {
          // se ficou vazia e não é a primeira página, vai para a página anterior
          await loadPage(curPage - 1, curSearch || '');
        } else if (visibleRows.length < perPage) {
          // tenta completar a página atual com itens da próxima página (ou sincroniza)
          await loadPage(curPage, curSearch || '');
        }
      } catch (e) {
        console.warn('Falha ao tentar reencher página após exclusão (não crítico):', e);
      }

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

      const data = await doDeleteRequest(ids);

      let removedIds = [];
      if (data && Array.isArray(data.removed_ids)) {
        removedIds = data.removed_ids.map(String);
      } else if (data && typeof data.removed === 'number') {
        if (data.removed === ids.length) removedIds = ids.map(String);
        else {
          alert(`Servidor reportou ${data.removed} remoção(ões), mas não forneceu os IDs removidos. A listagem será recarregada para sincronizar.`);
          await loadPage(window.currentEntradaPage || 1, (modalContent && modalContent.querySelector('#searchEntradaInput')) ? modalContent.querySelector('#searchEntradaInput').value : '');
          return;
        }
      } else {
        alert('Resposta do servidor sem detalhes de quais IDs foram removidos. A listagem será recarregada para sincronização.');
        await loadPage(window.currentEntradaPage || 1, (modalContent && modalContent.querySelector('#searchEntradaInput')) ? modalContent.querySelector('#searchEntradaInput').value : '');
        return;
      }

      // remove do DOM apenas os IDs confirmados como removidos
      removedIds.forEach(rid => {
        const cb = modalContent ? modalContent.querySelector(`.selectEntrada[data-id="${CSS.escape(String(rid))}"]`) : null;
        if (cb) {
          const row = cb.closest('tr');
          if (row && row.parentNode) row.parentNode.removeChild(row);
        }
        selectedIds.delete(String(rid));
      });

      // feedback
      const removedCount = removedIds.length;
      const failedCount = ids.length - removedCount;
      if (failedCount > 0) {
        alert(`${removedCount} excluída(s). ${failedCount} não foram removidas (verifique logs/perm.)`);
        await loadPage(window.currentEntradaPage || 1, (modalContent && modalContent.querySelector('#searchEntradaInput')) ? modalContent.querySelector('#searchEntradaInput').value : '');
        return;
      } else {
        alert(`Excluídas ${removedCount} entrada(s).`);
      }

      refreshBulkStateAndSelectAll();

      // se faltarem linhas para completar a página, recarrega para puxar próximas entradas
      try {
        const perPage = window.ENTRADAS_PER_PAGE || 10;
        const allRows = modalContent ? Array.from(modalContent.querySelectorAll('tbody tr')) : [];
        const visibleRows = allRows.filter(tr => !tr.classList.contains('no-data') && tr.querySelectorAll('td').length > 0);
        const curPage = window.currentEntradaPage || 1;
        const curSearch = (modalContent && modalContent.querySelector('#searchEntradaInput')) ? modalContent.querySelector('#searchEntradaInput').value : '';

        if (visibleRows.length === 0 && curPage > 1) {
          await loadPage(curPage - 1, curSearch || '');
        } else if (visibleRows.length < perPage) {
          await loadPage(curPage, curSearch || '');
        }
      } catch (e) {
        console.warn('Falha ao tentar reencher página após exclusão em massa (não crítico):', e);
      }

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
    // confirmação inicial do usuário
    if (!confirm('Confirmar exclusão de TODAS as entradas correspondentes ao filtro? Esta ação é irreversível.')) return;

    const url = '/entrada_nf/excluir';
    const headers = { 'Content-Type': 'application/json' };
    const csrf = (typeof getCsrfToken === 'function') ? getCsrfToken() : null;
    if (csrf) headers['X-CSRFToken'] = csrf;

    // normaliza busca para o servidor
    const serverQ = (typeof normalizeForServer === 'function') ? normalizeForServer(String(searchTermRaw || '')) : String(searchTermRaw || '');

    // coleta filtros do modal (se existir) e mescla com extraFilters
    const modalFilters = (typeof gatherFiltersFromModal === 'function') ? gatherFiltersFromModal() : {};
    const filters = Object.assign({}, modalFilters || {}, extraFilters || {});

    // LIMPA filtros vazios (remove chaves com '', null, undefined)
    const cleanFilters = {};
    Object.keys(filters || {}).forEach((k) => {
      const v = filters[k];

      // ignora nulo/indefinido
      if (v === null || v === undefined) return;

      // strings: remove vazias e trim
      if (typeof v === 'string') {
        const s = v.trim();
        if (s !== '') cleanFilters[k] = s;
        return;
      }

      // arrays: filtra elementos vazios
      if (Array.isArray(v)) {
        const arr = v
          .map(el => (el === null || el === undefined) ? '' : (typeof el === 'string' ? el.trim() : el))
          .filter(el => !(el === '' || el === null || el === undefined));
        if (arr.length > 0) cleanFilters[k] = arr;
        return;
      }

      // números, booleanos, objetos: mantém como estão
      cleanFilters[k] = v;
    });

    // monta payload (com filtros limpos)
    const payload = {
      all_matching: true,
      q: serverQ || '',
      filters: cleanFilters
    };

    // se não há busca nem filtros efetivos, adicionar confirm_all (exige o backend)
    if ((!serverQ || serverQ === '') && Object.keys(cleanFilters || {}).length === 0) {
      payload.confirm_all = true;
    }

    // DEBUG
    try { console.debug('[entrada_nf] deleteAllMatching -> payload:', payload); } catch (e) {}

    // tenta localizar botão de bulk (p/ feedback). Procura em modalContent se existir, senão no documento.
    let bulkBtn = null;
    try {
      if (typeof modalContent !== 'undefined' && modalContent && typeof modalContent.querySelector === 'function') {
        bulkBtn = modalContent.querySelector('#bulkDeleteEntradasBtn') || document.querySelector('#bulkDeleteEntradasBtn');
      } else {
        bulkBtn = document.querySelector('#bulkDeleteEntradasBtn');
      }
    } catch (e) {
      bulkBtn = document.querySelector('#bulkDeleteEntradasBtn');
    }

    if (bulkBtn) {
      bulkBtn.disabled = true;
      // guarda texto original para restaurar
      bulkBtn.dataset._origText = bulkBtn.dataset._origText || bulkBtn.textContent;
      bulkBtn.textContent = 'Excluindo...';
    }

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });

      let data = null;
      try { data = await resp.json(); } catch (e) { data = null; }

      if (!resp.ok) {
        const msg = (data && data.msg) ? data.msg : `Erro HTTP ${resp.status}`;
        throw new Error(msg);
      }

      if (data && (data.status === 'error' || data.status === 'fail')) {
        throw new Error(data.msg || 'Erro no servidor ao excluir.');
      }

      const removed = (data && typeof data.removed === 'number') ? data.removed : 0;

      // limpa seleção e estado global de seleção "todas as páginas"
      try { if (selectedIds && typeof selectedIds.clear === 'function') selectedIds.clear(); } catch(e){}
      window._entradaSelectedAllPages = false;

      alert(`Excluídas ${removed} entradas (por filtro).`);

      // recarregar página atual, se possível
      const curPage = window.currentEntradaPage || 1;
      if (typeof loadPage === 'function') {
        try { await loadPage(curPage); } catch (e) { console.warn('Não foi possível recarregar listagem automaticamente.', e); }
      }

      return data;
    } catch (err) {
      console.error('Erro em deleteAllMatching:', err);
      alert('Falha ao excluir por filtro: ' + (err.message || err));
      throw err;
    } finally {
      // restaura botão e atualiza estado de bulk (se existir)
      if (bulkBtn) {
        bulkBtn.disabled = false;
        bulkBtn.textContent = bulkBtn.dataset._origText || 'Excluir';
      }
      if (typeof refreshBulkStateAndSelectAll === 'function') {
        try { refreshBulkStateAndSelectAll(); } catch (e) { console.warn('refreshBulkStateAndSelectAll falhou', e); }
      }
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

    // Mostrar botão apenas quando houver mais de 1 selecionado,
    // ou quando o estado diz que "todas as páginas" foram selecionadas.
    if (count > 1 || window._entradaSelectedAllPages) {
      bulkBtn.style.display = '';
      if (window._entradaSelectedAllPages) bulkBtn.textContent = `🗑️ Excluir Selecionados`;
      else bulkBtn.textContent = `🗑️ Excluir Selecionados`;
    } else {
      // se houver exatamente 1 selecionado, não mostrar botão
      bulkBtn.style.display = 'none';
      bulkBtn.textContent = '🗑️ Excluir Selecionados';
    }

    // sincroniza checkbox de cabeçalho
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

      applyStickyColumns(modalContent, ['select','data','nf','produto']);
      window.addEventListener('resize', () => applyStickyColumnsDebounced(modalContent, ['select','data','nf','produto'], 120));

      // reaplica seus inicializadores
      try { initMainNumericInputs(modalContent); } catch(e) {}
      try { initMainNumericInputs(document); } catch(e) { console.warn('initMainNumericInputs init failed', e); }
      // após preencher células vazias com zeros (ou tratá-las), ocultar colunas duplicata totalmente vazias/NaN
      try { hideEmptyNumericColumns(modalContent, 'duplicata'); } catch (e) { console.warn('hideEmptyNumericColumns falhou', e); }
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

    // já existe? retorna
    if (toolbar.querySelector('#bulkDeleteEntradasBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'bulkDeleteEntradasBtn';
    btn.type = 'button';
    btn.className = 'btn btn-danger btn-sm';
    btn.style.marginLeft = '8px';
    btn.style.display = 'none';
    btn.textContent = '🗑️ Excluir Selecionados';

    // tentar inserir próximo ao botão de busca (#searchEntradaBtn)
    const searchBtn = toolbar.querySelector('#searchEntradaBtn');
    if (searchBtn && searchBtn.parentNode) {
      // inserir logo após o botão de busca (mantendo espaçamento)
      searchBtn.insertAdjacentElement('afterend', btn);
    } else {
      // fallback: append no final da toolbar
      toolbar.appendChild(btn);
    }

    btn.addEventListener('click', async () => {
      // prioriza ids persistidos em localStorage
      const persisted = loadSelectedIds();
      const hasPersisted = persisted && persisted.length > 0;
      const selectAllGlobal = isSelectAllFlag() || window._entradaSelectedAllPages;
      const curSearch = (modalContent && modalContent.querySelector('#searchEntradaInput') || {}).value || '';

      try {
        if (selectAllGlobal) {
          // confirma exclusão por filtro (mantém uso do deleteAllMatching já existente)
          const confirmMsg = curSearch ? `Excluir TODAS as entradas que batem em "${curSearch}"?` : 'Excluir TODAS as entradas?';
          if (!confirm(confirmMsg)) return;
          await deleteAllMatching(curSearch, {});
          clearPersistedSelection();
          return;
        }

        // senão usa ids persistidos (se existirem) ou os currently selected
        let ids = [];
        if (hasPersisted) ids = persisted;
        else ids = Array.from(selectedIds);

        if (!ids.length) return;
        if (!confirm(`Excluir ${ids.length} entrada(s) selecionada(s)?`)) return;
        await confirmAndDeleteBulk(ids);

        // cleanup pós exclusão
        clearPersistedSelection();
      } catch (err) {
        console.error('Erro no bulk delete:', err);
        alert('Falha ao excluir selecionados: ' + (err && err.message ? err.message : err));
      } finally {
        refreshBulkStateAndSelectAll();
      }
    });
  }

  // -------------------- ATTACH MODAL EVENTS --------------------
  function attachModalEvents() {
    if (!modalContent) return;

    // compactar paginação (antes de ligar listeners)
    try { condensePagination(modalContent, 3); } catch (e) { console.warn('condensePagination falhou', e); }

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

    // ----- configurar busca: só no clique (ou Enter) -----
    (function setupSearchUI() {
      const searchContainer = modalContent.querySelector('.search-container');
      if (!searchContainer) return;

      let searchBtn = searchContainer.querySelector('#searchEntradaBtn');
      let searchInput = searchContainer.querySelector('#searchEntradaInput');

      // remover listeners antigos no input substituindo por clone
      if (searchInput && searchInput.parentNode) {
        const cloned = searchInput.cloneNode(true);
        // manter id/name/value/placeholder etc.
        cloned.value = searchInput.value || '';
        searchInput.parentNode.replaceChild(cloned, searchInput);
        searchInput = cloned;
      }

      // adicionar clique no botão (pesquisa somente ao clicar)
      if (searchBtn && !searchBtn._hasClick) {
        searchBtn._hasClick = true;
        searchBtn.addEventListener('click', () => {
          const termRaw = (searchInput && (searchInput.value || '')) || '';
          loadPage(1, termRaw);
        });
      }

      // permitir Enter no input para acionar a pesquisa (opcional)
      if (searchInput && !searchInput._hasEnterListener) {
        searchInput._hasEnterListener = true;
        searchInput.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            if (searchBtn) searchBtn.click();
            else {
              const termRaw = (searchInput.value || '');
              loadPage(1, termRaw);
            }
          }
        });
      }
    })();

    // inserir botão de exclusão em massa (perto da pesquisa)
    try { injectBulkDeleteButton(); } catch (e) { console.warn('injectBulkDeleteButton falhou', e); }

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
          setSelectAllFlag(false);
          saveSelectedIds();
          refreshBulkStateAndSelectAll();
          return;
        }

        // quando marcar:
        pageCheckboxes.forEach(cb => {
          cb.checked = true;
          selectedIds.add(String(cb.dataset.id));
        });
        saveSelectedIds();
        refreshBulkStateAndSelectAll();

        try {
          const count = await selectAllAcrossPages(); // já popula selectedIds com TODOS os ids do filtro
          // marca persistência e flag "todas páginas"
          setSelectAllFlag(true);
          saveSelectedIds();
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
          setSelectAllFlag(false); // desliga a flag global se o usuário desmarcou manualmente
        }
        saveSelectedIds();
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

    // garantir estado inicial do botão bulk (caso já haja seleção previamente)
    try { refreshBulkStateAndSelectAll(); } catch (e) { /* ignore */ }
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
      // ----- delete single (existing) -----
      const delBtn = e.target.closest('.btn-excluir');
      if (delBtn) {
        e.preventDefault();
        const id = delBtn.dataset.id;
        const row = delBtn.closest('tr');
        if (typeof confirmAndDeleteSingle === 'function') await confirmAndDeleteSingle(id, row);
        return;
      }

      // ----- start edit inline -----
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

      // transforma células em inputs/selects
      for (const td of editableTds) {
        const col = td.dataset.col;
        const text = (td.textContent || '').trim();

        if (col === 'fornecedor') {
          td.innerHTML = '';
          const sel = buildSelect(col, await pFor, text);
          sel.classList.add('edit-input');
          td.appendChild(sel);
        } else if (/^material_\d+$/.test(col)) {
          td.innerHTML = '';
          const sel = buildSelect(col, await pMat, text);
          sel.classList.add('edit-input');
          td.appendChild(sel);
        } else if (col === 'produto') {
          td.innerHTML = '';
          const sel = buildSelect(col, await pProd, text);
          sel.classList.add('edit-input');
          td.appendChild(sel);
        } else if (col === 'data') {
          const iso = (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) ? text.split('/').reverse().join('-') : text;
          td.innerHTML = buildInputHTML(col, iso, 'date');
        } else {
          td.innerHTML = buildInputHTML(col, text, 'text');
        }
      }

      // ações (salvar/cancelar/adicionar)
      if (actionsTd) actionsTd.innerHTML = `
        <div class="actions-cell">
          <!-- primeira linha -->
          <div class="actions-row">
            <button type="button" class="btn-save" title="Salvar" aria-label="Salvar">💾</button>
            <button type="button" class="btn-cancel" title="Cancelar" aria-label="Cancelar">❌</button>
          </div>

          <!-- segunda linha -->
          <div class="actions-row">
            <button type="button" class="btn-add-material icon-btn" title="Adicionar material" aria-label="Adicionar material">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 16V8a1 1 0 0 0-.553-.894l-8-4.5a1 1 0 0 0-.894 0l-8 4.5A1 1 0 0 0 3 8v8a1 1 0 0 0 .553.894l8 4.5a1 1 0 0 0 .894 0l8-4.5A1 1 0 0 0 21 16z"/>
                <path d="M12 2v9" />
                <path d="M3.5 8.5l8.5 4.5 8.5-4.5" />
                <circle cx="18" cy="6" r="3" fill="currentColor" />
                <path d="M18 4v4M16 6h4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="label">Material</span>
            </button>

            <button type="button" class="btn-add-duplicata icon-btn" title="Adicionar duplicata" aria-label="Adicionar duplicata">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 2h6l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
                <path d="M13 2v6h6" />
                <rect x="4" y="8" width="12" height="8" rx="1" ry="1" />
                <circle cx="18" cy="6" r="3" fill="currentColor" />
                <path d="M18 4v4M16 6h4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="label">Duplicata</span>
            </button>
          </div>
        </div>
      `;

      // limites
      const MAX_MATERIAIS = window.MAX_MATERIAIS_DB || 5;
      const MAX_DUPLICATAS = window.MAX_DUPLICATAS_DB || 6;

      // helpers
      function _maxIndexInRow(row, prefix) {
        const tds = Array.from(row.querySelectorAll('td[data-col]'));
        let max = 0;
        tds.forEach(td => {
          const m = String(td.dataset.col || '').match(new RegExp('^' + prefix + '(\\d+)$'));
          if (m) max = Math.max(max, parseInt(m[1], 10));
        });
        return max;
      }
      function findHeaderRow() { return document.querySelector('#modal-entradas thead tr'); }
      function headerThs() { const hr = findHeaderRow(); return hr ? Array.from(hr.children) : []; }
      function indexOfHeaderByDataColExact(name) {
        const ths = headerThs();
        for (let i = 0; i < ths.length; i++) {
          const th = ths[i];
          if (th.dataset && th.dataset.col === name) return i;
        }
        // fallback textual exato
        for (let i = 0; i < ths.length; i++) {
          const txt = (ths[i].textContent || '').trim().toLowerCase().replace(/\s+/g,'');
          if (txt === (name || '').toLowerCase().replace(/_/g,'')) return i;
        }
        return -1;
      }
      // indices only for numbered columns (avoid catching valor_unitario_energia)
      function indicesOfHeaderStartingWithNumbered(prefix) {
        const ths = headerThs();
        const res = [];
        const reDataset = new RegExp('^' + prefix.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&') + '(\\d+)$');
        let textRe = null;
        if (prefix.startsWith('valor_unitario')) textRe = /^\s*valor\s*unit(?:\.|ario)?\s*\.?\s*(\d+)\s*$/i;
        else if (prefix.startsWith('material_')) textRe = /^\s*material\s*\.?\s*(\d+)\s*$/i;
        else if (prefix.startsWith('duplicata_')) textRe = /^\s*duplicata\s*\.?\s*(\d+)\s*$/i;
        for (let i = 0; i < ths.length; i++) {
          const th = ths[i];
          const ds = th.dataset && th.dataset.col ? th.dataset.col : '';
          if (ds && reDataset.test(ds)) { res.push(i); continue; }
          if (textRe) {
            const txt = (th.textContent || '').trim();
            if (textRe.test(txt)) res.push(i);
          }
        }
        return res;
      }
      function lastHeaderIndexStartingWithNumbered(prefix) {
        const idxs = indicesOfHeaderStartingWithNumbered(prefix);
        return idxs.length ? idxs[idxs.length - 1] : -1;
      }

      // inserir/remover coluna globalmente
      function insertColumnGlobally(name, headerText, insertBeforeIndex, removable = true) {
        const headerRow = findHeaderRow();
        if (!headerRow) return null;
        const th = document.createElement('th');
        th.dataset.col = name;
        th.textContent = headerText;

        if (removable) {
          th.style.position = 'relative';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.title = 'Remover coluna';
          btn.className = 'th-remove-btn';
          btn.style.cssText = 'position:absolute; top:2px; right:4px; font-size:12px; padding:2px 6px;';
          btn.textContent = '✖';
          btn.dataset.colName = name;
          btn.addEventListener('click', function (ev) {
            ev.stopPropagation(); ev.preventDefault();
            const colToRemove = String(this.dataset.colName);
            if (/^material_(\d+)$/.test(colToRemove)) {
              const n = colToRemove.match(/^material_(\d+)$/)[1];
              removeColumnAndPair(colToRemove, 'valor_unitario_' + n);
            } else if (/^valor_unitario_(\d+)$/.test(colToRemove)) {
              const n = colToRemove.match(/^valor_unitario_(\d+)$/)[1];
              removeColumnAndPair('material_' + n, colToRemove);
            } else if (/^duplicata_(\d+)$/.test(colToRemove)) {
              removeColumnAndPair(colToRemove);
            } else {
              removeColumnAndPair(colToRemove);
            }
          });
          th.appendChild(btn);
        }

        if (insertBeforeIndex >= 0 && insertBeforeIndex < headerRow.children.length) headerRow.insertBefore(th, headerRow.children[insertBeforeIndex]);
        else { headerRow.appendChild(th); insertBeforeIndex = headerRow.children.length - 1; }

        const tbodyRows = Array.from(document.querySelectorAll('#modal-entradas tbody tr'));
        tbodyRows.forEach(tr => {
          const existing = tr.querySelector(`td[data-col="${name}"]`);
          if (existing) return;
          const td = document.createElement('td');
          td.dataset.col = name;
          td.innerHTML = '';
          if (insertBeforeIndex >= 0 && insertBeforeIndex < tr.children.length) tr.insertBefore(td, tr.children[insertBeforeIndex]);
          else tr.appendChild(td);
        });
        return { th, index: insertBeforeIndex };
      }
      function removeColumnGlobally(name) {
        const headerRow = findHeaderRow();
        if (headerRow) {
          const th = headerRow.querySelector(`th[data-col="${name}"]`);
          if (th) th.remove();
        }
        const tds = Array.from(document.querySelectorAll(`#modal-entradas tbody td[data-col="${name}"]`));
        tds.forEach(td => td.remove());
      }

      // --- campos que removeremos no save (serão enviados como null) ---
      const fieldsToNullify = [];

      function markFieldToNull(name) {
        if (!fieldsToNullify.includes(name)) fieldsToNullify.push(name);
      }

      // remove colunas e marca para null (atualiza originalHTML e addedCols)
      function removeColumnAndPair(...cols) {
        cols.forEach(c => removeColumnGlobally(c));
        cols.forEach(c => { if (originalHTML.hasOwnProperty(c)) delete originalHTML[c]; });
        cols.forEach(c => {
          const idx = addedCols.indexOf(c);
          if (idx !== -1) addedCols.splice(idx, 1);
        });
        // marca para envio como NULL
        cols.forEach(c => markFieldToNull(c));

        // limpa conteúdo da célula da linha que está sendo editada (feedback imediato)
        cols.forEach(c => {
          const cell = row.querySelector(`td[data-col="${c}"]`);
          if (cell) {
            // se era input, remove; se era texto, limpa; também garante que se salvarem sem editar o valor será null
            cell.innerHTML = '';
          }
        });
      }

      // ---------- antes de adicionar novas colunas: garantir que todos os TH dinâmicos tenham botão ✖ ----------
      // adiciona botão remove em todas as colunas dinâmicas esperadas (1..MAX)
      (function ensureRemoveButtonsOnAllDynamicThs() {
        const MAX_M = MAX_MATERIAIS;
        const MAX_D = MAX_DUPLICATAS;
        for (let i = 1; i <= MAX_M; i++) {
          const mat = `material_${i}`;
          const vu = `valor_unitario_${i}`;
          // se th não existe, não criamos aqui (mantemos apenas as colunas já renderizadas), mas se existir adicionamos o botão
          [mat, vu].forEach(name => {
            const th = document.querySelector(`#modal-entradas thead th[data-col="${name}"]`);
            if (th && !th.querySelector('.th-remove-btn')) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'th-remove-btn';
              btn.style.cssText = 'position:absolute; top:2px; right:4px; font-size:12px; padding:2px 6px;';
              btn.textContent = '✖';
              btn.title = 'Remover coluna';
              btn.dataset.colName = name;
              btn.addEventListener('click', function (ev) {
                ev.stopPropagation(); ev.preventDefault();
                const col = this.dataset.colName;
                if (/^material_(\d+)$/.test(col)) {
                  const n = col.match(/^material_(\d+)$/)[1];
                  removeColumnAndPair(col, 'valor_unitario_' + n);
                } else if (/^valor_unitario_(\d+)$/.test(col)) {
                  const n = col.match(/^valor_unitario_(\d+)$/)[1];
                  removeColumnAndPair('material_' + n, col);
                } else if (/^duplicata_(\d+)$/.test(col)) {
                  removeColumnAndPair(col);
                } else {
                  removeColumnAndPair(col);
                }
              });
              th.style.position = 'relative';
              th.appendChild(btn);
            }
          });
        }
        // duplicatas 1..MAX_D
        for (let j = 1; j <= MAX_D; j++) {
          const name = `duplicata_${j}`;
          const th = document.querySelector(`#modal-entradas thead th[data-col="${name}"]`);
          if (th && !th.querySelector('.th-remove-btn')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'th-remove-btn';
            btn.style.cssText = 'position:absolute; top:2px; right:4px; font-size:12px; padding:2px 6px;';
            btn.textContent = '✖';
            btn.title = 'Remover coluna';
            btn.dataset.colName = name;
            btn.addEventListener('click', function (ev) {
              ev.stopPropagation(); ev.preventDefault();
              removeColumnAndPair(this.dataset.colName);
            });
            th.style.position = 'relative';
            th.appendChild(btn);
          }
        }
      })();

      // ---------- adicionar material / valor_unitario / duplicata (mantendo ordem) ----------
      const addedCols = [];

      const addMaterialBtn = row.querySelector('.btn-add-material');
      if (addMaterialBtn) {
        addMaterialBtn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          const next = _maxIndexInRow(row, 'material_') + 1;
          if (next > MAX_MATERIAIS) { alert('Já atingiu o máximo de materiais: ' + MAX_MATERIAIS); return; }

          const colName = 'material_' + next;
          const valorColName = 'valor_unitario_' + next;

          let lastMatIdx = lastHeaderIndexStartingWithNumbered('material_');
          let insertMatIdx;
          if (lastMatIdx >= 0) insertMatIdx = lastMatIdx + 1;
          else {
            const prodIdx = indexOfHeaderByDataColExact('produto');
            insertMatIdx = (prodIdx >= 0) ? prodIdx : headerThs().length;
          }

          const resMat = insertColumnGlobally(colName, `Material ${next}`, insertMatIdx, true);
          addedCols.push(colName);

          let lastVuIdx = lastHeaderIndexStartingWithNumbered('valor_unitario_');
          let insertVuIdx = -1;
          if (lastVuIdx >= 0) insertVuIdx = lastVuIdx + 1;
          else {
            const valIntegralIdx = indexOfHeaderByDataColExact('valor_integral');
            if (valIntegralIdx >= 0) insertVuIdx = valIntegralIdx + 1;
            else {
              const firstDupIdxs = indicesOfHeaderStartingWithNumbered('duplicata_');
              if (firstDupIdxs.length) insertVuIdx = firstDupIdxs[0];
              else {
                const vEnerIdx = indexOfHeaderByDataColExact('valor_unitario_energia');
                insertVuIdx = vEnerIdx >= 0 ? vEnerIdx : headerThs().length;
              }
            }
          }

          const resVu = insertColumnGlobally(valorColName, `Valor Unit. ${next}`, insertVuIdx, true);
          addedCols.push(valorColName);

          // adiciona inputs na linha editada
          const newMatTd = row.querySelector(`td[data-col="${colName}"]`);
          const newVuTd = row.querySelector(`td[data-col="${valorColName}"]`);
          const opts = await getOptions('materiais');
          if (newMatTd) {
            newMatTd.innerHTML = '';
            const sel = buildSelect(colName, opts, '');
            sel.classList.add('edit-input');
            newMatTd.appendChild(sel);
          }
          if (newVuTd) {
            newVuTd.innerHTML = buildInputHTML(valorColName, '', 'text');
            const inp = newVuTd.querySelector('input[name]');
            if (inp) inp.classList.add('edit-input');
          }
        });
      }

      const addDupBtn = row.querySelector('.btn-add-duplicata');
      if (addDupBtn) {
        addDupBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          const next = _maxIndexInRow(row, 'duplicata_') + 1;
          if (next > MAX_DUPLICATAS) { alert('Já atingiu o máximo de duplicatas: ' + MAX_DUPLICATAS); return; }

          const colName = 'duplicata_' + next;

          let lastDupIdx = lastHeaderIndexStartingWithNumbered('duplicata_');
          let insertDupIdx;
          if (lastDupIdx >= 0) insertDupIdx = lastDupIdx + 1;
          else {
            const vEnerIdx = indexOfHeaderByDataColExact('valor_unitario_energia');
            insertDupIdx = vEnerIdx >= 0 ? vEnerIdx : headerThs().length - 1;
          }

          insertColumnGlobally(colName, `Duplicata ${next}`, insertDupIdx, true);
          addedCols.push(colName);

          const newTd = row.querySelector(`td[data-col="${colName}"]`);
          if (newTd) {
            newTd.innerHTML = buildInputHTML(colName, '', 'text');
            const inp = newTd.querySelector('input[name]');
            if (inp) inp.classList.add('edit-input');
          }
        });
      }

      // ------------------ Cancel (restaura original + remove colunas adicionadas) ------------------
      const cancelBtn = row.querySelector('.btn-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', ev => {
        ev.preventDefault();
        editableTds.forEach(td => {
          if (originalHTML.hasOwnProperty(td.dataset.col)) td.innerHTML = originalHTML[td.dataset.col];
        });

        try { addedCols.forEach(col => removeColumnGlobally(col)); } finally { addedCols.length = 0; }

        if (actionsTd) actionsTd.innerHTML = prevActionsHtml;
        row.classList.remove('editing');
      }, { once: true });

      // ------------------ Save (coleta .edit-input e envia) ------------------
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
          if (/custo|valor|preco/i.test(name) && val) { val = String(val).replace(/\./g, '').replace(',', '.'); }
          fields[name] = (val === '') ? null : val;
        });

        // inclui colunas marcadas para zera(r) no banco
        if (fieldsToNullify && fieldsToNullify.length) {
          fieldsToNullify.forEach(col => { fields[col] = null; });
        }

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
              newVal = inp.tagName.toLowerCase() === 'select' ? (inp.options[inp.selectedIndex]?.text || inp.value) : inp.value;
            }

            if (col === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(newVal)) {
              const [y, m, d] = newVal.split('-'); newVal = `${d}/${m}/${y}`;
            } else if (col.toLowerCase().includes('nf') || col.toLowerCase().includes('numero')) {
              newVal = String(parseInt(String(newVal || '').replace(/\./g, '').replace(',', '' ) || 0));
            } else if ((typeof newVal === 'string' && newVal.trim().endsWith('%')) || col.toLowerCase().includes('ipi') || col.toLowerCase().includes('percent')) {
              let raw = String(newVal || '').replace('%', '').trim().replace(',', '.');
              if (!isNaN(raw) && raw !== '') newVal = parseFloat(raw).toFixed(2).replace('.', ',') + '%';
            } else if (!isNaN(String(newVal || '').replace(',', '.')) && String(newVal || '').trim() !== '') {
              let num = parseFloat(String(newVal || '').replace(',', '.'));
              if (!isNaN(num)) {
                let [intPart, decPart] = num.toFixed(2).split('.');
                intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                newVal = intPart + ',' + decPart;
              }
            }

            td.textContent = (newVal === null || newVal === undefined) ? '' : newVal;
          });

          // remove colunas temporárias (se houver) e recarrega a listagem
          try { if (addedCols.length) addedCols.forEach(col => removeColumnGlobally(col)); } finally { addedCols.length = 0; }

          if (actionsTd) actionsTd.innerHTML = prevActionsHtml;
          row.classList.remove('editing');

          const curPage = window.currentEntradaPage || 1;
          const curSearch = (document.querySelector('#searchEntradaInput') || {}).value || '';
          if (typeof loadPage === 'function') await loadPage(curPage, curSearch);

          alert('Atualizado com sucesso.');
        } catch (err) {
          alert('Falha ao salvar: ' + (err.message || err));
          saveBtn.disabled = false;
        }
      }, { once: true });
    }); // fim listener
  })();

  // === condensa paginação: transforma longas listas de páginas em 1 ... x-1 x x+1 ... N ===
  function condensePagination(root, maxVisible = 3) {
    if (!root) return;
    const pag = root.querySelector('.pagination');
    if (!pag) return;

    const allPageEls = Array.from(pag.querySelectorAll('a.page-btn, span.current'));
    if (!allPageEls.length) return;

    // extrai números das tags (data-page para a.page-btn, texto para span.current)
    const pages = allPageEls.map(el => {
      if (el.tagName.toLowerCase() === 'a') return parseInt(el.dataset.page, 10);
      const n = parseInt(el.textContent, 10);
      return Number.isNaN(n) ? null : n;
    }).filter(n => Number.isFinite(n));

    if (!pages.length) return;
    const totalPages = Math.max(...pages);

    // achar página atual (span.current)
    const currentEl = pag.querySelector('span.current');
    const currentPage = currentEl ? (parseInt(currentEl.textContent, 10) || 1) : 1;

    // se não ultrapassa o limite, nada a fazer
    if (totalPages <= maxVisible) return;

    // Identificar botões especiais (first/prev / next/last) existentes no HTML original
    const originalAnchors = Array.from(pag.querySelectorAll('a.page-btn'));
    const firstPrev = originalAnchors.filter(a => {
      const txt = (a.textContent || '').trim().toLowerCase();
      return /primeiro|«|anterior|←/.test(txt);
    }).map(a => a.cloneNode(true));
    const nextLast = originalAnchors.filter(a => {
      const txt = (a.textContent || '').trim().toLowerCase();
      return /último|ultimo|»|próximo|proximo|→/.test(txt);
    }).map(a => a.cloneNode(true));

    // calcula janela: mostrar vizinhos do current (ajusta nas bordas)
    let start = Math.max(1, currentPage - 1);
    let end = Math.min(totalPages, currentPage + 1);
    while ((end - start + 1) < maxVisible) {
      if (start > 1) start--;
      else if (end < totalPages) end++;
      else break;
    }

    // construir novo conteúdo
    const fragment = document.createDocumentFragment();
    // adiciona first/prev no começo (se existirem)
    firstPrev.forEach(el => fragment.appendChild(el));

    function makeLink(page) {
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'page-btn';
      a.dataset.page = String(page);
      a.textContent = String(page);
      return a;
    }
    function makeCurrent(page) {
      const s = document.createElement('span');
      s.className = 'current';
      s.textContent = String(page);
      return s;
    }

    if (start > 1) {
      fragment.appendChild(makeLink(1));
      if (start > 2) {
        const dots = document.createElement('span');
        dots.className = 'ellipsis';
        dots.textContent = '…';
        fragment.appendChild(dots);
      }
    }

    for (let p = start; p <= end; p++) {
      if (p === currentPage) fragment.appendChild(makeCurrent(p));
      else fragment.appendChild(makeLink(p));
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        const dots2 = document.createElement('span');
        dots2.className = 'ellipsis';
        dots2.textContent = '…';
        fragment.appendChild(dots2);
      }
      fragment.appendChild(makeLink(totalPages));
    }

    // adiciona next/last no fim (se existirem)
    nextLast.forEach(el => fragment.appendChild(el));

    // substitui conteúdo mantendo o container .pagination
    pag.innerHTML = '';
    pag.appendChild(fragment);
  }

  // --- preenche células/inputs numéricos vazios com 0,00 / 0,000 ---
  function fillEmptyNumericCells(root) {
    if (!root) return;
    const prefixes = [
      'valor_unitario',
      'duplicata',
      'valor_unitario_energia',
      'valor_mao_obra_tm_metallica',
      'peso_liquido',
      'valor_integral',
      'peso_integral'
    ];

    prefixes.forEach(pref => {
      const tds = Array.from(root.querySelectorAll(`td[data-col^="${pref}"], td[class*="${pref}"], td.${pref}`));
      const inputs = Array.from(root.querySelectorAll(
        `input[data-col^="${pref}"], input[name^="${pref}"], input[id^="${pref}"]`
      ));

      const decimals = pref.startsWith('peso') ? 3 : 2;
      const zeroText = decimals === 3 ? '0,000' : '0,00';

      // tratar células (td)
      tds.forEach(td => {
        const txt = (td.textContent || '').trim();
        if (txt === '' || txt === '-' || txt === '—' || txt === 'null' || txt === 'undefined') {
          const inp = td.querySelector('input, select, textarea');
          if (inp) {
            // Não forçar 0,00 para inputs; apenas garanta dataset.col para handlers
            if (!inp.dataset.col && inp.name) inp.dataset.col = inp.name;
            // Para duplicata: manter em branco
          } else {
            // célula de texto (td) sem input: exibe zero formatado
            td.textContent = zeroText;
          }
        }
      });

      // inputs soltos fora de <td> (ex.: formulários dinâmicos)
      inputs.forEach(inp => {
        const v = (inp.value || '').trim();
        if (v === '' || v === '-' || v === '—') {
          if (!inp.dataset.col && inp.name) inp.dataset.col = inp.name;
          // NÃO atribuir inp.value = '0,00' aqui
        }
      });
    });
  }

  // === oculta colunas numéricas (duplicatas/valor_unitario) que estão totalmente vazias/NaN ===
  function hideEmptyNumericColumns(root, prefix = 'duplicata') {
    if (!root) return;
    // tenta localizar THs por data-col primeiro, senão por texto que comece com "Duplicata"
    const headerThs = Array.from(root.querySelectorAll('thead th'));
    const candidateThs = headerThs.filter(th => {
      if (th.dataset && th.dataset.col && String(th.dataset.col).startsWith(prefix)) return true;
      const txt = (th.textContent || '').trim().toLowerCase();
      if (prefix === 'duplicata') {
        return /^duplicata\s*\d+/i.test(txt) || /^duplicata/i.test(txt);
      }
      // fallback: data-col start
      return false;
    });

    // para cada TH candidato, verifica todas as células da coluna correspondente
    candidateThs.forEach(th => {
      // índice da coluna (1-based)
      const colIndex = Array.from(th.parentNode.children).indexOf(th) + 1;
      if (colIndex <= 0) return;

      const rows = Array.from(root.querySelectorAll('tbody tr'));
      // considera a coluna vazia se TODAS as células estiverem vazias/NaN/placeholder
      const allEmpty = rows.every(tr => {
        const td = tr.children[colIndex - 1];
        if (!td) return true;
        // se td contém input, pega o value; senão o textContent
        const inp = td.querySelector('input, textarea, select');
        let raw = inp ? (inp.value || '') : (td.textContent || '');
        raw = String(raw).trim();

        if (raw === '' || raw === '-' || raw === '—' || /^nan$/i.test(raw) || /^null$/i.test(raw) || /^undefined$/i.test(raw)) return true;

        // usa a função normalizeNumberString (já definida no seu arquivo) para checar se é number-like
        try {
          const norm = (typeof normalizeNumberString === 'function') ? normalizeNumberString(raw) : raw.replace(/\./g,'').replace(',','.');
          if (norm === '' || Number.isNaN(Number(norm))) return true;
        } catch (e) {
          // se erro ao normalizar, considera não-vazio (mais seguro)
          return false;
        }

        // se passou por todas as checagens, então não está vazio
        return false;
      });

      // aplica estilo: oculta a coluna inteira (th + todas td:nth-child)
      const selector = `thead th:nth-child(${colIndex}), tbody td:nth-child(${colIndex})`;
      const els = Array.from(root.querySelectorAll(selector));
      if (allEmpty) {
        els.forEach(el => { el.style.display = 'none'; });
      } else {
        els.forEach(el => { el.style.display = ''; });
      }
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

      // mostra aviso quando atingir o máximo
      if (existing.length >= MAX_MATERIAIS) {
        alert('Não é possível adicionar mais materiais — máximo de ' + MAX_MATERIAIS + ' atingido.');
        return;
      }

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

      // mostra aviso quando atingir o máximo
      if (existing.length >= MAX_DUPLICATAS) {
        alert('Não é possível adicionar mais duplicatas — máximo de ' + MAX_DUPLICATAS + ' atingido.');
        return;
      }

      let idx;
      for (let i = 1; i <= MAX_DUPLICATAS; i++) {
        if (!existing.includes(i)) { idx = i; break; }
      }
      if (!idx) return;
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

  // NOVA applyStickyColumns: soma apenas as larguras das colunas STICKY anteriores
  function applyStickyColumns(root, colsArray = ['select','data','nf','produto']) {
    if (!root) return;
    const table = root.querySelector('.table-container table');
    if (!table) return;
    const headerRow = table.tHead ? table.tHead.rows[0] : table.querySelector('thead tr');
    if (!headerRow) return;

    // limpa estilos antigos
    table.querySelectorAll('th.sticky-col, td.sticky-col').forEach(el => {
      el.classList.remove('sticky-col');
      el.style.left = '';
      el.style.zIndex = '';
      el.style.position = '';
      el.style.boxShadow = '';
      el.style.background = '';
      el.style.color = '';
    });

    // mapeia cada data-col para seu index na tabela (DOM)
    const stickyMap = []; // {colName, index}
    colsArray.forEach(colName => {
      const sample = table.querySelector(`tbody tr td[data-col="${colName}"]`);
      if (sample) stickyMap.push({ colName, index: sample.cellIndex });
      else {
        // fallback: tenta encontrar th por texto (se necessário)
        const th = Array.from(headerRow.cells).find(th => {
          return (th.getAttribute('data-col') === colName) || ((th.textContent||'').trim().toLowerCase().includes((colName||'').toLowerCase()));
        });
        if (th) stickyMap.push({ colName, index: Array.from(headerRow.cells).indexOf(th) });
      }
    });

    // filtra, remove duplicados e ordena por index (ordem DOM)
    const unique = Array.from(new Map(stickyMap.map(s => [s.index, s])).values())
      .filter(x => x && x.index >= 0)
      .sort((a,b) => a.index - b.index);

    if (!unique.length) return;

    // calcula left acumulando SOMENTE as larguras das colunas sticky anteriores
    let accumLeft = 0;
    unique.forEach((entry, order) => {
      const colIndex = entry.index;
      const th = headerRow.children[colIndex];
      const width = th ? th.getBoundingClientRect().width : (table.querySelector(`tbody tr td:nth-child(${colIndex+1})`)?.getBoundingClientRect().width || 0);

      // aplica no TH
      if (th) {
        th.classList.add('sticky-col');
        th.style.position = 'sticky';
        th.style.left = `${accumLeft}px`;
        // header deve ter z-index maior
        th.style.zIndex = String(2000 - order);
        th.style.background = '#2b6cb0';
        th.style.color = '#fff';
        th.style.boxShadow = '2px 0 6px rgba(0,0,0,0.06)';
      }

      // aplica nas tds dessa coluna
      Array.from(table.querySelectorAll(`tbody tr`)).forEach((tr) => {
        const cell = tr.children[colIndex];
        if (!cell) return;
        cell.classList.add('sticky-col');
        cell.style.position = 'sticky';
        cell.style.left = `${accumLeft}px`;
        cell.style.zIndex = String(1500 - order);
        // força background para evitar transparencia que mostra o "buraco"
        const bg = getComputedStyle(cell).backgroundColor;
        cell.style.background = (bg === 'rgba(0, 0, 0, 0)' || !bg) ? '#fff' : bg;
        cell.style.boxShadow = '2px 0 6px rgba(0,0,0,0.04)';
      });

      // incrementa accum apenas com a largura desta coluna sticky
      accumLeft += width;
    });
  }

  // Debounce helper (usar em resize)
  function applyStickyColumnsDebounced(root, cols, delay = 120) {
    if (applyStickyColumnsDebounced._t) clearTimeout(applyStickyColumnsDebounced._t);
    applyStickyColumnsDebounced._t = setTimeout(() => applyStickyColumns(root, cols), delay);
  }
});
