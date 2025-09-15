// static/js/dashboard.js
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');

  // 1) Toggle manual do sidebar
  document.getElementById('toggleSidebar')
    .addEventListener('click', () => sidebar.classList.toggle('collapsed'));

  // 2) Submenu “Base de Material/Produto”
  const reportsItem    = document.getElementById('reportsItem');
  const reportsSubmenu = document.getElementById('reportsSubmenu');

  reportsItem.addEventListener('click', () => {
    sidebar.classList.remove('collapsed');

    if (reportsSubmenu.classList.contains('visible')) {
      reportsSubmenu.classList.remove('visible');
      reportsItem.classList.remove('submenu-open');
    } else {
      reportsSubmenu.classList.add('visible');
      reportsItem.classList.add('submenu-open');
    }
  });

  document.addEventListener('click', (e) => {
    if (!reportsItem.contains(e.target) && !reportsSubmenu.contains(e.target)) {
      reportsSubmenu.classList.remove('visible');
      reportsItem.classList.remove('submenu-open');
    }
  });

  // 3) Submenu “Nota Fiscal”
  const nfItem    = document.getElementById('nfItem');
  const nfSubmenu = document.getElementById('nfSubmenu');

  nfItem.addEventListener('click', () => {
    sidebar.classList.remove('collapsed');

    if (nfSubmenu.classList.contains('visible')) {
      nfSubmenu.classList.remove('visible');
      nfItem.classList.remove('submenu-open');
    } else {
      nfSubmenu.classList.add('visible');
      nfItem.classList.add('submenu-open');
    }
  });

  document.addEventListener('click', (e) => {
    if (!nfItem.contains(e.target) && !nfSubmenu.contains(e.target)) {
      nfSubmenu.classList.remove('visible');
      nfItem.classList.remove('submenu-open');
    }
  });

  // ─────────── Sistema de abas (permanece igual) ───────────
  const tabBtns   = document.querySelectorAll('.tab-btn');
  const contents  = document.querySelectorAll('.tab-content');
  const indicator = document.querySelector('.tab-indicator');

  function activateTab(btn) {
    tabBtns.forEach(b => b.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    const { offsetLeft: left, offsetWidth: width } = btn;
    indicator.style.left  = left + 'px';
    indicator.style.width = width + 'px';
  }

  tabBtns.forEach(btn => btn.addEventListener('click', () => activateTab(btn)));
  const init = document.querySelector('.tab-btn.active');
  if (init) activateTab(init);

  // ─────────── Toggle do popup do usuário (permanece igual) ───────────
  const userMenu = document.getElementById('userMenu');
  document.addEventListener('click', (event) => {
    const isClickInside = userMenu.contains(event.target);
    if (isClickInside) {
      userMenu.classList.toggle('open');
    } else {
      userMenu.classList.remove('open');
    }
  });

  // ─────────── Ajuste de scroll nos frames (permanece igual) ───────────
  ['prod-frame', 'mat-frame'].forEach(function(id) {
    const frame = document.getElementById(id);
    if (!frame) return;
    const rowCount = frame.querySelectorAll('tbody tr').length;
    if (rowCount > 10) {
      frame.style.height    = '300px';
      frame.style.overflowY = 'auto';
      frame.style.overflowX = 'hidden';
    }
  });

  ['ultima-entrada-frame', 'saida-nf-frame'].forEach(function(id) {
    const frame = document.getElementById(id);
    if (!frame) return;

    const tbody = frame.querySelector('tbody');
    if (!tbody) return;

    // contar somente LINHAS PAI (NF), não produtos
    const nfRows = Array.from(tbody.querySelectorAll('.nf-row'));
    const fallbackRows = Array.from(tbody.querySelectorAll('tr'));
    const effectiveRows = nfRows.length > 0 ? nfRows : fallbackRows;

    if (effectiveRows.length === 0) {
      frame.style.maxHeight = '';
      frame.style.overflowY = '';
      frame.style.overflowX = '';
      return;
    }

    // configuração: máximo de linhas que queremos permitir (ajuste aqui)
    const maxLines = 12;

    // cabeçalho da tabela
    const thead = frame.querySelector('thead');
    const headerHeight = thead ? (thead.getBoundingClientRect().height || 0) : 0;

    // altura de uma linha pai visível (procura a primeira com altura > 0)
    let rowHeight = 0;
    for (const r of effectiveRows) {
      const rect = r.getBoundingClientRect();
      if (rect.height > 0) { rowHeight = rect.height; break; }
    }
    if (!rowHeight) rowHeight = parseFloat(getComputedStyle(effectiveRows[0]).height) || 36;

    // altura dos controles (Expandir/Recolher), se existirem
    let controlsHeight = 0;
    const card = frame.closest('.report-card');
    if (card) {
      const controls = card.querySelector('.controls');
      if (controls) controlsHeight = controls.getBoundingClientRect().height || 0;
    }

    // buffer para padding/bordas/separadores
    const extraBuffer = 10;

    // cálculo base para 'maxLines'
    const desiredHeight = Math.round(headerHeight + controlsHeight + rowHeight * maxLines + extraBuffer);

    // calcula espaço disponível do topo do frame até o final da viewport (evita ultrapassar a página)
    const frameTop = frame.getBoundingClientRect().top;
    const availableHeight = Math.max(200, window.innerHeight - frameTop - 80); // -80 para margem/rodapé; min 200px

    // garante um mínimo (pelo menos 4 linhas) para não ficar minúsculo quando rowHeight for grande
    const minLinesVisible = Math.min(effectiveRows.length, 4);
    const minHeight = Math.round(headerHeight + controlsHeight + rowHeight * minLinesVisible + extraBuffer);

    // aplica: não passa do disponível e não fica menor que o mínimo
    const finalMaxPx = Math.max(minHeight, Math.min(desiredHeight, availableHeight));

    frame.style.maxHeight = finalMaxPx + 'px';
    frame.style.overflowY = 'auto';
    frame.style.overflowX = 'hidden';
  });

  // ---------- Toggle por NF (expand/collapse) ----------
  function initNfToggles() {
    const nfButtons = document.querySelectorAll('.nf-btn');
    if (!nfButtons || nfButtons.length === 0) {
      console.debug('[NF Toggles] nenhum .nf-btn encontrado');
    }

    nfButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const nfId = btn.getAttribute('data-nf');
        const parentRow = btn.closest('.nf-row');
        if (!parentRow) return;

        const products = document.querySelectorAll(`.product-row[data-nf="${nfId}"]`);
        const isOpen = parentRow.classList.toggle('open');
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

        products.forEach(r => {
          if (isOpen) r.classList.remove('hidden');
          else r.classList.add('hidden');
        });
      });
    });
  }

  // ---------- Expandir / Recolher todos ----------
  function initExpandCollapseAll() {
    const frame = document.getElementById('saida-nf-frame');
    if (!frame) return;

    const card = frame.closest('.report-card');
    if (!card) return;

    if (card.querySelector('.controls')) return;

    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.innerHTML = `
      <button type="button" id="expandAllBtn">Expandir todos</button>
      <button type="button" id="collapseAllBtn">Recolher todos</button>
    `;
    card.insertBefore(controls, card.firstChild);

    document.getElementById('expandAllBtn').addEventListener('click', () => {
      document.querySelectorAll('.nf-row').forEach(row => {
        const nfId = row.getAttribute('data-nf');
        row.classList.add('open');
        row.querySelectorAll('.chev').forEach(c => c.style.transform = 'rotate(90deg)');
        row.querySelectorAll('.nf-btn').forEach(b => b.setAttribute('aria-expanded', 'true'));
        document.querySelectorAll(`.product-row[data-nf="${nfId}"]`).forEach(r => r.classList.remove('hidden'));
      });
    });

    document.getElementById('collapseAllBtn').addEventListener('click', () => {
      document.querySelectorAll('.nf-row').forEach(row => {
        const nfId = row.getAttribute('data-nf');
        row.classList.remove('open');
        row.querySelectorAll('.chev').forEach(c => c.style.transform = 'rotate(0deg)');
        row.querySelectorAll('.nf-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
        document.querySelectorAll(`.product-row[data-nf="${nfId}"]`).forEach(r => r.classList.add('hidden'));
      });
    });
  }

  // chama as iniciais (não registra outro listener)
  initNfToggles();
  initExpandCollapseAll();

}); // fim do DOMContentLoaded
