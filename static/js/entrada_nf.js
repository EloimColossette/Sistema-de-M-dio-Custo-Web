document.addEventListener('DOMContentLoaded', () => {
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

  // Toggle submenu NF
  const nfItem = document.getElementById('nfItem');
  const nfSubmenu = document.getElementById('nfSubmenu');
  if (nfItem && nfSubmenu) {
    nfItem.addEventListener('click', () => nfSubmenu.classList.toggle('hidden'));
  }

  // Modal Entradas
  const btnVerEntradas = document.getElementById('btnVerEntradas');
  const modalEntradas  = document.getElementById('modal-entradas');
  const modalContent   = modalEntradas.querySelector('.modal-content');

  btnVerEntradas.addEventListener('click', () => loadPage(1));
  modalEntradas.addEventListener('click', e => {
    if (e.target === modalEntradas) modalEntradas.classList.remove('show');
  });

  // Carrega página de entradas e injeta no modal
  // Carrega página de entradas e injeta no modal
  async function loadPage(page) {
    try {
      const resp = await fetch(`/entrada_nf/listar?page=${page}`);
      if (!resp.ok) throw new Error('Falha ao carregar página ' + page);
      const html = await resp.text();

      modalContent.innerHTML = html;
      modalEntradas.classList.add('show');

      // 1) Oculta colunas dinâmicas vazias
      hideEmptyColumns();
      setupColumnToggle();
      // 2) Vincula o fechar e a paginação
      attachModalEvents();
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar entradas.');
    }
  }

  // Vincula fechar e paginação
  function attachModalEvents() {
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

    // 🔥 Aqui sim! Listener do dropdown
    modalContent.addEventListener('click', e => {
      if (e.target.closest('#colToggleInput')) {
        modalContent.querySelector('#colToggleList').classList.toggle('show');
      } else if (modalContent.querySelector('#colToggleList')?.classList.contains('show')) {
        if (!e.target.closest('.dropdown-container-inline')) {
          modalContent.querySelector('#colToggleList').classList.remove('show');
        }
      }
    });
  }

  // Oculta colunas de Mat., VU e Dup sem dados
  function hideEmptyColumns() {
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


  // Gestão de Materiais (inalterado)
  const materiaisContainer = document.getElementById('materiais-container');
  const btnAddMaterial     = document.getElementById('btn-add-material');
  const btnRemoveMaterial  = document.getElementById('btn-remove-material');
  const MAX_MATERIAIS      = 5;

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

  btnRemoveMaterial.addEventListener('click', () => {
    const rows = materiaisContainer.querySelectorAll('.material-row');
    if (rows.length > 0) {
      rows[rows.length - 1].remove();
      reorderMateriais(materiaisContainer, ['material', 'valor_unitario']);
    }
  });

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
        <input type="number" step="0.01" id="valor_unitario_${idx}" name="valor_unitario_${idx}" />
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
        }
      });
      container.appendChild(row);
    });
  }

  // Gestão de Duplicatas (inalterado)
  const duplicatasContainer = document.getElementById('duplicatas-container');
  const btnAddDuplicata     = document.getElementById('btn-add-duplicata');
  const btnRemoveDuplicata  = document.getElementById('btn-remove-duplicata');
  const MAX_DUPLICATAS      = 6;

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

  btnRemoveDuplicata.addEventListener('click', () => {
    const rows = duplicatasContainer.querySelectorAll('.duplicata-row');
    if (rows.length > 0) {
      rows[rows.length - 1].remove();
      reorderDuplicatas(duplicatasContainer, ['duplicata']);
    }
  });

  function addDuplicataRow(idx) {
    const row = document.createElement('div');
    row.className = 'duplicata-row';
    row.innerHTML = `
      <div class="form-group">
        <label for="duplicata_${idx}">Duplicata ${idx}:</label>
        <input type="number" step="0.01" id="duplicata_${idx}" name="duplicata_${idx}" />
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
        }
      });
      container.appendChild(row);
    });
  }
});
