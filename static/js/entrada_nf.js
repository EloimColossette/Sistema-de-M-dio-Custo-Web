document.addEventListener('DOMContentLoaded', () => {
  // garante que não quebre se não existir
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

  // Formata data string DD/MM/YYYY (quando já completa)
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
    // se já está em ISO, retorna
    if (/^\d{4}-\d{2}-\d{2}$/.test(display)) return display;
    return '';
  }

  // converte "YYYY-MM-DD" -> "dd/mm/YYYY" (ou retorna string original se não casar)
  function isoToDisplay(iso) {
    if (!iso) return '';
    const m = String(iso).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    // se já está em display, retorna
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(iso)) return iso;
    return iso;
  }

  // Formata número pt-BR com casas decimais
  function formatNumberBR(v, casas = 2) {
    if (v === null || v === undefined || String(v).trim() === '') return '';

    // Se já for number, formata diretamente (evita remover o ponto decimal)
    if (typeof v === 'number') {
      return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas
      }).format(v);
    }

    // se for string: normaliza "1.234,56" / "1234,56" / "1234.56" -> Number corretamente
    const cleaned = String(v).replace(/\./g, '').replace(',', '.');
    const num = Number(cleaned);
    if (Number.isNaN(num)) return String(v);
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas
    }).format(num);
  }

  // Normaliza string numérica para Number JS (ponto decimal)
  function normalizeNumberString(raw) {
    if (raw === null || raw === undefined) return '';
    let s = String(raw).trim();
    if (s === '') return '';

    // remove espaços e % e quaisquer letras/símbolos exceto . , -
    const hasPercent = s.indexOf('%') !== -1;
    s = s.replace(/\s/g, '').replace('%','');
    s = s.replace(/[^0-9\.,-]/g, '');

    const hasComma = s.indexOf(',') !== -1;
    const hasDot = s.indexOf('.') !== -1;

    if (hasComma && !hasDot) {
      // "1.234,56" (no dot) -> "1234.56"
      return s.replace(',', '.');
    }

    if (hasDot && hasComma) {
      // "1.234,56" (both present): parts by comma
      const parts = s.split(',');
      const integerPart = parts[0].replace(/\./g, '');
      const decimalPart = parts[1] || '';
      return integerPart + '.' + decimalPart;
    }

    // nenhum separador ou só ponto
    return s;
  }

  // Retorna número de casas para cada coluna (personalize conforme necessário)
  function casasDecimais(col) {
    if (!col) return 2;
    if (col.startsWith('peso')) return 3; // por exemplo: pesos com 3 casas
    // adicionar regras específicas se precisar
    return 2;
  }

  // Verifica se coluna é numérica
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

  // Inicializa campos numéricos marcando dataset.col
  function initMainNumericInputs() {
    const inputs = Array.from(document.querySelectorAll('input[name]'));
    inputs.forEach(input => {
      // se já tiver dataset.col, mantém
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

  initMainNumericInputs();

  // ---------- MÁSCARA / HANDLERS DE DATA (attach diretamente aos inputs de data) ----------
  function attachDateMask() {
    const els = Array.from(document.querySelectorAll('input[name="data"]:not([type="date"]), input[data-col="data"]:not([type="date"])'));
    els.forEach(el => {
      // evita múltiplas ligações
      if (el.__dateMaskAttached) return;
      el.__dateMaskAttached = true;

      // Se o input estiver com type="date" nativo do browser, troca para text
      // Isso evita que o browser "corrija" o valor enquanto usamos a máscara dd/mm/yyyy
      try {
        if (el.type === 'date') {
          el.dataset.originalType = 'date';
          el.type = 'text';
        }
      } catch (err) {
        // alguns navegadores / situações podem lançar erro ao alterar type — ignore
        console.warn('Não foi possível alterar type para text (input data).', err);
      }

      // limita tamanho e facilita input em mobile
      el.setAttribute('maxlength', '10');
      el.setAttribute('inputmode', 'numeric');

      // permite apenas dígitos (e teclas de controle) no keydown
      el.addEventListener('keydown', (ev) => {
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return; // permite atalhos
        const allowed = ['Backspace','Tab','ArrowLeft','ArrowRight','Delete','Home','End'];
        if (allowed.includes(ev.key)) return;
        if (!/^\d$/.test(ev.key)) {
          ev.preventDefault();
        }
      });

      // input: reconstroi formatação a partir só dos dígitos (preserva dd/mm ao digitar o ano)
      el.addEventListener('input', (ev) => {
        const input = ev.target;

        // mantém apenas os números
        const rawDigits = input.value.replace(/\D/g, '').slice(0, 8);

        let day = rawDigits.slice(0, 2);
        let month = rawDigits.slice(2, 4);
        let year = rawDigits.slice(4);

        let value = '';
        if (day) value = day;
        if (month) value += '/' + month;
        if (year) value += '/' + year;

        input.value = value;

        // mantém cursor no final
        try { input.setSelectionRange(input.value.length, input.value.length); } catch (err) {}
      });

      // blur: tenta finalizar para dd/mm/yyyy (quando possível)
      el.addEventListener('blur', (ev) => {
        const input = ev.target;
        const digits = (input.value || '').replace(/\D/g, '');
        if (digits.length === 8) {
          input.value = digits.slice(0,2) + '/' + digits.slice(2,4) + '/' + digits.slice(4,8);
        } else if (digits.length === 6) {
          // ddmmaa -> dd/mm/20aa
          input.value = digits.slice(0,2) + '/' + digits.slice(2,4) + '/20' + digits.slice(4,6);
        } else if (digits.length === 4) {
          input.value = digits.slice(0,2) + '/' + digits.slice(2,4);
        } else {
          // mantém parcial - não zera
        }
      });
    });
  }

  // chama inicialmente (se inputs já estiverem no DOM)
  attachDateMask();

  // Se sua UI cria inputs dinamicamente, você pode re-chamar attachDateMask() depois que adicionar os inputs.
  // ---------- HANDLER GLOBAL PARA NÚMEROS (continua como antes, mas só para colunas numéricas) ----------
  document.addEventListener('input', (e) => {
    const input = e.target;
    if (!input || input.tagName !== 'INPUT') return;

    const col = input.dataset.col || input.name || null;
    if (!col) return;

    // Só processa campos numéricos — a data está sendo tratada por attachDateMask()
    if (!isNumericCol(col)) return;

    handleNumericLiveInput(input);
  });

  // Focusin para numéricos: remover pontos de milhar para editar
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

  // Focusout global para numéricos: aplicar formatação final
  document.addEventListener('focusout', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    const col = t.dataset.col || t.name || null;
    if (!col) return;
    if (!isNumericCol(col)) return;
    handleNumericFinalize(t);
  });

  // ---------- FUNÇÕES AUXILIARES PARA NÚMEROS ----------
  function handleNumericLiveInput(input) {
    // usa casas específicas por coluna (peso -> 3, outros -> 2)
    const decimals = casasDecimais(input.dataset.col || input.name || '') || 2;
    // pega somente dígitos
    let digits = (String(input.value || '').match(/\d/g) || []).join('');

    if (!digits) {
      input.value = '';
      return;
    }

    let intRaw, decRaw;
    if (digits.length <= decimals) {
      intRaw = '0';
      decRaw = digits.padStart(decimals, '0').slice(-decimals);
    } else {
      intRaw = digits.slice(0, -decimals);
      decRaw = digits.slice(-decimals);
    }

    const intFormatted = (intRaw.replace(/^0+(?=\d)/, '') || '0')
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    input.value = `${intFormatted},${decRaw}`;

    try { input.setSelectionRange(input.value.length, input.value.length); } catch (err) {}
  }

  function handleNumericFinalize(input) {
    let val = String(input.value || '').trim();

    if (val === '') {
      input.value = '';
      return;
    }

    const decimals = casasDecimais(input.dataset.col || input.name);

    // Se já está no formato pt-BR (tem vírgula e não tem pontos),
    // re-formatamos garantindo o número de casas correto.
    if (val.indexOf(',') !== -1 && val.indexOf('.') === -1) {
      const cleaned = val.replace(/\./g, '').replace(',', '.');
      const jsnum = Number(cleaned);
      if (Number.isNaN(jsnum)) return;
      input.value = formatNumberBR(jsnum, decimals);
      return;
    }

    // Detecta se tem vírgula E ponto (ex: "1.234,56")
    if (val.indexOf(',') !== -1) {
      const cleaned = val.replace(/\./g, '').replace(',', '.');
      const jsnum = Number(cleaned);
      if (Number.isNaN(jsnum)) return;
      input.value = formatNumberBR(jsnum, decimals);
      return;
    }

    // Se contém ponto (possível separador de milhar, ou formato "1234.56"),
    // trata como número e formata.
    if (val.indexOf('.') !== -1) {
      const cleaned = val.replace(/\./g, '');
      const jsnum = Number(cleaned);
      if (Number.isNaN(jsnum)) return;
      input.value = formatNumberBR(jsnum, decimals);
      return;
    }

    // Caso contenha apenas números -> interpreta como centavos (ou como int
    // sem separador decimal), aplicando as casas esperadas.
    const cleanedOnlyDigits = val.replace(/\D/g, '');
    if (cleanedOnlyDigits.length === 0) {
      input.value = '';
      return;
    }

    let intRaw, decRaw;
    if (cleanedOnlyDigits.length <= decimals) {
      intRaw = '0';
      decRaw = cleanedOnlyDigits.padStart(decimals, '0').slice(-decimals);
    } else {
      intRaw = cleanedOnlyDigits.slice(0, -decimals);
      decRaw = cleanedOnlyDigits.slice(-decimals);
    }

    const intFormatted = (intRaw.replace(/^0+(?=\d)/, '') || '0')
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    input.value = `${intFormatted},${decRaw}`;
  }

  // Expor utilidades (opcional) para depuração
  window.__entradaNF__ = {
    isNumericCol,
    casasDecimais,
    initMainNumericInputs,
    formatDate,
    formatNumberBR,
    attachDateMask, // caso precise reaplicar para inputs dinâmicos
  };

  // Toggle submenu NF
  const nfItem = document.getElementById('nfItem');
  const nfSubmenu = document.getElementById('nfSubmenu');
  if (nfItem && nfSubmenu) {
    nfItem.addEventListener('click', () => nfSubmenu.classList.toggle('hidden'));
  }

  // Modal Entradas
  const btnVerEntradas = document.getElementById('btnVerEntradas');
  const modalEntradas  = document.getElementById('modal-entradas');
  const modalContent   = modalEntradas ? modalEntradas.querySelector('.modal-content') : null;

  if (btnVerEntradas) btnVerEntradas.addEventListener('click', () => loadPage(1));
  if (modalEntradas) {
    // fechar clicando fora do conteúdo
    modalEntradas.addEventListener('click', e => {
      if (e.target === modalEntradas) {
        modalEntradas.classList.remove('show');
        modalEntradas.setAttribute('aria-hidden', 'true');
      }
    });

    // fechar com tecla ESC
    document.addEventListener('keydown', (e) => {
      // alguns navegadores usam 'Esc' historicamente, aceitamos ambos
      if (e.key === 'Escape' || e.key === 'Esc') {
        // somente fecha se o modal estiver visível
        if (modalEntradas.classList && modalEntradas.classList.contains('show')) {
          modalEntradas.classList.remove('show');
          modalEntradas.setAttribute('aria-hidden', 'true');
        }
      }
    });
  }

  // --- Funções de exclusão (single + bulk) ---
  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : null;
  }

  async function doDeleteRequest(ids) {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('Nenhum id fornecido');

    const url = '/entrada_nf/excluir';
    const headers = { 'Content-Type': 'application/json' };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRFToken'] = csrf; // ajuste se seu backend usa outro nome

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids }),
      credentials: 'same-origin' // garante envio de cookies de sessão se necessário
    });

    // tenta parse seguro do body
    let data = null;
    try { data = await resp.json(); } catch (e) { data = null; }

    if (!resp.ok) {
      const msg = (data && data.msg) ? data.msg : `Erro HTTP ${resp.status}`;
      throw new Error(msg);
    }

    // Verifica semântica do JSON (se o backend usar {status:'ok'} por exemplo)
    if (data && (data.status === 'error' || data.status === 'fail')) {
      throw new Error(data.msg || 'Erro no servidor ao excluir.');
    }

    return data; // sucesso (pode conter removed, etc)
  }

  async function confirmAndDeleteSingle(id, row) {
    if (!confirm('Confirma exclusão desta entrada? Esta ação é irreversível.')) return;
    try {
      // desabilita botão da linha para evitar clique duplo
      const btn = row ? row.querySelector('.btn-excluir') : null;
      if (btn) { btn.disabled = true; }

      const data = await doDeleteRequest([id]);

      // se backend retornar removed ou status, você pode checar aqui:
      // if (data && data.removed === 0) throw new Error('Nenhuma linha removida.');

      if (row && row.parentNode) row.parentNode.removeChild(row);
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

    // pega botão bulk para feedback
    const bulkBtn = modalContent.querySelector('#bulkDeleteEntradasBtn');
    try {
      if (bulkBtn) { bulkBtn.disabled = true; bulkBtn.textContent = `Excluindo...`; }

      const data = await doDeleteRequest(ids);

      // se backend informar quantos foram removidos, pode usar:
      // const removed = data && data.removed ? data.removed : ids.length;

      ids.forEach(id => {
        const cb = modalContent.querySelector(`.selectEntrada[data-id="${CSS.escape(String(id))}"]`);
        if (cb) {
          const row = cb.closest('tr');
          if (row && row.parentNode) row.parentNode.removeChild(row);
        }
      });
      refreshBulkStateAndSelectAll();
      alert(`Excluídas ${ids.length} entrada(s).`);
    } catch (err) {
      console.error('Erro ao excluir em massa:', err);
      alert('Falha ao excluir em massa: ' + (err.message || err));
    } finally {
      if (bulkBtn) { bulkBtn.disabled = false; refreshBulkStateAndSelectAll(); }
    }
  }

  // função que atualiza estado do botão de exclusão em massa
  function refreshBulkStateAndSelectAll() {
    if (!modalContent) return;
    const allCheckboxes = Array.from(modalContent.querySelectorAll('.selectEntrada'));
    const checked = allCheckboxes.filter(cb => cb.checked);
    let bulkBtn = modalContent.querySelector('#bulkDeleteEntradasBtn');
    if (!bulkBtn) return;
    if (checked.length > 0) {
      bulkBtn.style.display = '';
      bulkBtn.textContent = `Excluir (${checked.length})`;
    } else {
      bulkBtn.style.display = 'none';
      bulkBtn.textContent = 'Excluir (0)';
    }

    // se nenhum checkbox marcado, desmarca "selectAll"
    const selectAll = modalContent.querySelector('#selectAllEntradas');
    if (selectAll) selectAll.checked = allCheckboxes.length > 0 && allCheckboxes.every(cb => cb.checked);
  }

  // Carrega página de entradas e injeta no modal
  async function loadPage(page) {
    try {
      const resp = await fetch(`/entrada_nf/listar?page=${page}`);
      if (!resp.ok) throw new Error('Falha ao carregar página ' + page);
      const html = await resp.text();

      if (!modalContent) throw new Error('modalContent não encontrado');
      modalContent.innerHTML = html;
      attachDateMask();
      modalEntradas.classList.add('show');

      // injeta o botão de exclusão em massa na search-and-filter (se não existir)
      injectBulkDeleteButton();

      // 1) Oculta colunas dinâmicas vazias (opcional)
      // hideEmptyColumns();
      // setupColumnToggle();

      // 2) Vincula o fechar e a paginação
      attachModalEvents();
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar entradas.');
    }
  }

  // Injeta botão de exclusão em massa no modal (na search-and-filter)
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
      btn.style.display = 'none'; // aparece só quando tiver seleção
      btn.textContent = 'Excluir (0)';
      toolbar.appendChild(btn);

      btn.addEventListener('click', () => {
        const checked = Array.from(modalContent.querySelectorAll('.selectEntrada:checked'));
        const ids = checked.map(cb => cb.dataset.id).filter(Boolean);
        if (ids.length === 0) return;
        confirmAndDeleteBulk(ids);
      });
    }
  }

  // Vincula fechar e paginação
  function attachModalEvents() {
    if (!modalContent) return;

    // fechar modal via “×”
    const btnClose = modalContent.querySelector('#fecharModalEntradaBtn');
    if (btnClose) {
      btnClose.addEventListener('click', () => modalEntradas.classList.remove('show'));
    }

    // paginação
    modalContent.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        const p = parseInt(btn.dataset.page, 10);
        loadPage(p);
      });
    });

    // (Opcional) pesquisa
    const searchBtn = modalContent.querySelector('#searchEntradaBtn');
    const searchInput = modalContent.querySelector('#searchEntradaInput');
    if (searchBtn && searchInput) {
      searchBtn.addEventListener('click', () => {
        // Exemplo: loadPage(1, searchInput.value);
        loadPage(1);
      });
    }

    // ✅ Checkbox "Selecionar todos"
    const selectAll = modalContent.querySelector('#selectAllEntradas');
    if (selectAll) {
      selectAll.addEventListener('change', e => {
        const checked = e.target.checked;
        modalContent.querySelectorAll('.selectEntrada').forEach(cb => {
          cb.checked = checked;
        });
        refreshBulkStateAndSelectAll();
      });
    }

    // quando qualquer checkbox individual muda, atualiza estado do botão bulk
    modalContent.querySelectorAll('.selectEntrada').forEach(cb => {
      if (cb._hasSelectListener) return;
      cb._hasSelectListener = true;
      cb.addEventListener('change', () => refreshBulkStateAndSelectAll());
    });

    // liga botões de excluir (linha)
    modalContent.querySelectorAll('.btn-excluir').forEach(btn => {
      if (btn._hasDeleteListener) return;
      btn._hasDeleteListener = true;

      btn.addEventListener('click', (e) => {
        const id = btn.dataset.id;
        const row = btn.closest('tr');
        if (!id) return;
        confirmAndDeleteSingle(id, row);
      });
    });

    modalContent.querySelectorAll('.btn-editar').forEach(btn => {
      if (btn._hasEditListener) return;
      btn._hasEditListener = true;

      btn.addEventListener('click', e => {
        const row = btn.closest('tr');
        const id = btn.dataset.id;
        if (!row || row.classList.contains('editing')) return;

        row.classList.add('editing');

        // guarda clones dos childNodes originais de cada td[data-col]
        const tds = Array.from(row.querySelectorAll('td[data-col]'));
        tds.forEach(td => {
          td.dataset.colName = td.dataset.col || '';
          td.dataset.originalText = td.textContent.trim();
          td._origChildNodes = Array.from(td.childNodes).map(n => n.cloneNode(true));
        });

        // transforma células (mas preserva checkbox/radio/select)
        tds.forEach(td => {
          const col = td.dataset.col;
          if (!col) return;
          if (col === 'select' || col === 'acoes') return;

          if (td.querySelector('input[type="checkbox"], input[type="radio"], select')) {
            td.dataset.skippedInput = '1';
            return;
          }

          if (col === 'data') {
            const iso = displayToIso(td.dataset.originalText || '') || '';
            td.innerHTML = `<input type="date" data-col="data" value="${iso}" style="width:100%"/>`;
            return;
          }

          if (isNumericCol(col)) {
            const val = td.dataset.originalText || '';
            const input = document.createElement('input');
            input.type = 'text';
            input.dataset.col = col;
            input.name = col;
            input.value = val;
            input.style.width = '100%';
            input.setAttribute('inputmode', 'decimal');
            td.innerHTML = '';
            td.appendChild(input);
            return;
          }

          const txtInput = document.createElement('input');
          txtInput.type = 'text';
          txtInput.name = col;
          txtInput.dataset.col = col;
          txtInput.value = td.dataset.originalText || '';
          txtInput.style.width = '100%';
          td.innerHTML = '';
          td.appendChild(txtInput);
        });

        // troca botões de ação
        const acoesTd = row.querySelector('.acoes');
        if (!acoesTd) return;
        acoesTd.innerHTML = `
          <button class="btn-acao btn-salvar" data-id="${id}">💾</button>
          <button class="btn-acao btn-cancelar">❌</button>
        `;

         // ========================= SALVAR =========================
        const btnSalvar = acoesTd.querySelector('.btn-salvar');
        if (btnSalvar && !btnSalvar._hasSaveListener) {
          btnSalvar._hasSaveListener = true;

          btnSalvar.addEventListener('click', async () => {
            // coleta campos (mesma lógica de antes)
            const allTds = Array.from(row.querySelectorAll('td[data-col]'));
            const fields = {};

            allTds.forEach(td => {
              const col = td.dataset.col;
              if (!col) return;
              if (col === 'select' || col === 'acoes') return;

              if (td.dataset.skippedInput === '1') {
                const cb = td.querySelector('input[type="checkbox"]');
                const rdChecked = td.querySelector('input[type="radio"]:checked');
                const sel = td.querySelector('select');
                if (cb) { fields[col] = cb.checked ? '1' : '0'; return; }
                if (rdChecked) { fields[col] = rdChecked.value || ''; return; }
                if (sel) { fields[col] = sel.value || ''; return; }
                fields[col] = td.textContent.trim();
                return;
              }

              const inp = td.querySelector('input, select, textarea');
              if (inp) {
                if (inp.type === 'date') { fields[col] = inp.value || ''; return; }

                let val = inp.value.trim();
                if (isNumericCol(col)) {
                  let s = val.replace(/\s/g,'').replace('%','').replace('\u00A0','');
                  if (s === '') { fields[col] = ''; return; }
                  const hasComma = s.includes(',');
                  const hasDot = s.includes('.');
                  if (hasComma && !hasDot) s = s.replace(',', '.');
                  else if (hasDot && hasComma) {
                    const parts = s.split(',');
                    const integerPart = parts[0].replace(/\./g,'');
                    const decimalPart = parts[1] || '';
                    s = integerPart + '.' + decimalPart;
                  } else if ((s.match(/\./g) || []).length > 1) {
                    s = s.replace(/\./g,'');
                  }
                  fields[col] = s;
                  return;
                }
                fields[col] = val;
                return;
              }

              const raw = td.textContent.trim();
              if (col === 'data') {
                const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                fields[col] = m ? `${m[3]}-${m[2]}-${m[1]}` : raw;
                return;
              }
              if (isNumericCol(col)) {
                let s = raw.replace(/\s/g,'').replace('%','').replace('\u00A0','');
                if (s === '') { fields[col] = ''; return; }
                const hasComma = s.includes(',');
                const hasDot = s.includes('.');
                if (hasComma && !hasDot) s = s.replace(',', '.');
                else if (hasDot && hasComma) {
                  const parts = s.split(',');
                  const integerPart = parts[0].replace(/\./g,'');
                  const decimalPart = parts[1] || '';
                  s = integerPart + '.' + decimalPart;
                } else if ((s.match(/\./g) || []).length > 1) {
                  s = s.replace(/\./g,'');
                }
                fields[col] = s;
                return;
              }
              fields[col] = raw;
            });

            if (!Object.keys(fields).length) {
              alert('Nenhuma coluna encontrada para salvar.');
              return;
            }

            console.log('[editar] enviando fields =', fields);

            // desabilita botão para evitar múltiplos envios
            btnSalvar.disabled = true;
            const originalBtnHtml = btnSalvar.innerHTML;

            try {
              const resp = await fetch(`/entrada_nf/editar/${encodeURIComponent(id)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields })
              });

              let data = null;
              try {
                data = await resp.json();
              } catch (e) {
                // fallback caso resposta não seja JSON
                const text = await resp.text().catch(()=>null);
                try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
              }

              if (!resp.ok) {
                console.error('[editar] resposta de erro:', resp.status, data);
                alert(data && data.msg ? data.msg : `Erro ao salvar (status ${resp.status})`);
                return;
              }

              // usa 'updated' vindo do servidor quando disponível, senão usa o que enviamos
              const updated = (data && data.updated) ? data.updated : fields;
              console.log('[editar] updated recebido do servidor:', updated);

              // aplica os valores atualizados na DOM (preferindo valores do servidor)
              try {
                Object.entries(updated).forEach(([col, rawVal]) => {
                  const td = row.querySelector(`td[data-col="${col}"]`);
                  if (!td) return;

                  if (col === 'data') {
                    td.textContent = isoToDisplay(rawVal || '');
                    td.dataset.originalText = td.textContent.trim();
                    return;
                  }

                  if (isNumericCol(col)) {
                    let txt = '';
                    if (rawVal !== '' && rawVal != null) {
                      const num = Number(String(rawVal).replace(',', '.'));
                      txt = Number.isNaN(num) ? String(rawVal) : formatNumberBR(num, casasDecimais(col));
                      if (col === 'ipi') txt += '%';
                    }
                    td.textContent = txt;
                    td.dataset.originalText = td.textContent.trim();
                    return;
                  }

                  // texto simples / null
                  td.textContent = rawVal == null ? '' : String(rawVal);
                  td.dataset.originalText = td.textContent.trim();
                });

                // finaliza edição: restaura botões e estado
                row.classList.remove('editing');
                acoesTd.innerHTML = `
                  <button class="btn-acao btn-editar" data-id="${id}">✏️</button>
                  <button class="btn-acao btn-excluir" data-id="${id}">🗑️</button>
                `;
                attachModalEvents();
              } catch (innerErr) {
                console.error('Erro ao aplicar updated na DOM:', innerErr);
                alert('Salvo no servidor, mas falha ao atualizar interface (veja console).');
              }
            } catch (err) {
              console.error('Erro ao salvar edição:', err);
              alert('Erro ao salvar (veja console).');
            } finally {
              // reabilita botão
              try {
                btnSalvar.disabled = false;
                btnSalvar.innerHTML = originalBtnHtml;
              } catch (e) {}
            }
          });
        }

        // ========================= CANCELAR =========================
        const btnCancelar = acoesTd.querySelector('.btn-cancelar');
        if (btnCancelar && !btnCancelar._hasCancelListener) {
          btnCancelar._hasCancelListener = true;
          btnCancelar.addEventListener('click', () => {
            const allTds = Array.from(row.querySelectorAll('td[data-col]'));
            allTds.forEach(td => {
              if (td._origChildNodes && td._origChildNodes.length) {
                td.innerHTML = '';
                td._origChildNodes.forEach(n => td.appendChild(n.cloneNode(true)));
                delete td._origChildNodes;
              } else if (td.dataset.originalText !== undefined) {
                td.textContent = td.dataset.originalText;
                delete td.dataset.originalText;
              }
              delete td.dataset.skippedInput;
            });

            row.classList.remove('editing');
            acoesTd.innerHTML = `
              <button class="btn-acao btn-editar" data-id="${id}">✏️</button>
              <button class="btn-acao btn-excluir" data-id="${id}">🗑️</button>
            `;
            attachModalEvents();
          });
        }
      });
    });

    // 🔥 Listener do dropdown (uma vez)
    if (!modalContent._hasDropdownListener) {
      modalContent.addEventListener('click', e => {
        if (e.target.closest('#colToggleInput')) {
          modalContent.querySelector('#colToggleList')?.classList.toggle('show');
        } else if (modalContent.querySelector('#colToggleList')?.classList.contains('show')) {
          if (!e.target.closest('.dropdown-container-inline')) {
            modalContent.querySelector('#colToggleList').classList.remove('show');
          }
        }
      });
      modalContent._hasDropdownListener = true;
    }
  }

  // Oculta colunas de Mat., VU e Dup sem dados
  function hideEmptyColumns() {
    if (!modalContent) return;
    const table = modalContent.querySelector('table');
    if (!table) return;

    const headers = table.querySelectorAll('thead th');
    headers.forEach((th, idx) => {
      const text = th.textContent.trim();
      if (/^Material\.?\s*\d+|^Valor Unitario\.?\s*\d+|^Duplicata\.?\s*\d+/i.test(text)) {
        const colIndex = idx + 1;
        const cells = Array.from(
          table.querySelectorAll(`tbody td:nth-child(${colIndex})`)
        );
        const hasValue = cells.some(td => {
          const v = td.textContent.trim();
          return v !== '' && v !== '0' && v !== '0,00';
        });
        if (!hasValue) {
          table.querySelectorAll(
            `thead th:nth-child(${colIndex}), tbody td:nth-child(${colIndex})`
          ).forEach(el => el.style.display = 'none');
        }
      }
    });
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
});
