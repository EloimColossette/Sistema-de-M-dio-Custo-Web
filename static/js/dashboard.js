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
    // Se estiver colapsado, expande
    sidebar.classList.remove('collapsed');

    // Toggle classe de visibilidade
    if (reportsSubmenu.classList.contains('visible')) {
      reportsSubmenu.classList.remove('visible');
      reportsItem.classList.remove('submenu-open');
    } else {
      reportsSubmenu.classList.add('visible');
      reportsItem.classList.add('submenu-open');
    }
  });

  // Fecha o submenu “Base de Material” ao clicar fora
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

  // Fecha o submenu “Nota Fiscal” ao clicar fora
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

    const rows = Array.from(tbody.querySelectorAll('tr'));
    const rowCount = rows.length;

    // se tiver 10 ou menos linhas, remove qualquer limitação
    if (rowCount <= 10) {
      frame.style.maxHeight = '';
      frame.style.overflowY = '';
      frame.style.overflowX = '';
      return;
    }

    // mede altura do thead (se existir) e da primeira linha como referência
    const thead = frame.querySelector('thead');
    let headerHeight = 0;
    if (thead) {
      const thRect = thead.getBoundingClientRect();
      headerHeight = thRect.height || 0;
    }

    // pega a primeira linha com altura válida
    let rowHeight = 0;
    for (const r of rows) {
      const rect = r.getBoundingClientRect();
      if (rect.height > 0) { rowHeight = rect.height; break; }
    }
    // fallback caso não encontre (valor conservador)
    if (!rowHeight) rowHeight = parseFloat(getComputedStyle(rows[0]).height) || 30;

    // calcula altura para 10 linhas + cabeçalho e aplica
    const maxPx = Math.round(headerHeight + rowHeight * 10);
    frame.style.maxHeight = maxPx + 'px';
    frame.style.overflowY = 'auto';
    frame.style.overflowX = 'hidden';
  });
  
});
