document.addEventListener('DOMContentLoaded', () => {

  // 1) HABILITAR EDIÇÃO INLINE
  document.querySelectorAll('#produtos-page .edit-icon').forEach(editBtn => {
    editBtn.addEventListener('click', () => {
      const row = editBtn.closest('tr');
      row.querySelectorAll('.input-inline').forEach(el => el.disabled = false);
      editBtn.classList.add('hidden');
      row.querySelector('.save-icon').classList.remove('hidden');
    });
  });

  // 2) SALVAR ALTERAÇÕES VIA FETCH
  document.querySelectorAll('#produtos-page .save-icon').forEach(saveBtn => {
    saveBtn.addEventListener('click', () => {
      const row = saveBtn.closest('tr');
      const id  = row.getAttribute('data-id');

      const nomeVal = row.querySelector('input[data-field="nome"]').value.trim();
      const pcVal   = row.querySelector('input[data-field="pc_cobre"]').value.trim();
      const pzVal   = row.querySelector('input[data-field="pc_zinco"]').value.trim();

      if (!nomeVal) {
        alert('Nome do produto não pode ficar vazio.');
        return;
      }
      if (isNaN(parseFloat(pcVal.replace(',', '.'))) || isNaN(parseFloat(pzVal.replace(',', '.')))) {
        alert('Percentual de cobre e zinco devem ser números válidos.');
        return;
      }

      const params = new URLSearchParams();
      params.append(`nome_${id}`, nomeVal);
      params.append(`pc_cobre_${id}`, pcVal);
      params.append(`pc_zinco_${id}`, pzVal);

      fetch(`/produtos/edit/${id}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: params.toString()
      })
      .then(resp => {
        if (resp.ok) {
          window.location.reload();
        } else {
          alert('Falha ao salvar.');
        }
      })
      .catch(() => alert('Erro na requisição.'));
    });
  });

  // 3) CONFIRMAÇÃO DE EXCLUSÃO INDIVIDUAL
  document.querySelectorAll('#produtos-page .btn-delete-confirm')
    .forEach(btn => btn.addEventListener('click', evt => {
      const nome = btn.getAttribute('data-nome') || 'este produto';
      if (!confirm(`Deseja realmente excluir ${nome}?`)) evt.preventDefault();
    }));

  // 4) FILTRO DE PESQUISA EM TEMPO REAL COM NORMALIZAÇÃO
  const searchInput = document.getElementById('search_produto');
  if (searchInput) {
    const normalize = str => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    searchInput.addEventListener('input', () => {
      const filter = normalize(searchInput.value);
      const rows = document.querySelectorAll('.card-list tbody tr');
      rows.forEach(row => {
        const nomeInput = row.querySelector('input[data-field="nome"]');
        if (!nomeInput) return;
        const nome = normalize(nomeInput.value);
        row.style.display = nome.includes(filter) ? '' : 'none';
      });
    });
  }

  // 5) SELECIONAR/DESSELECIONAR TODOS CHECKBOXES + BOTÃO EXCLUIR VISÍVEL COM 2+
  const selectAllCheckbox = document.getElementById('select-all');
  const checkboxes = document.querySelectorAll('.row-checkbox');
  const btnDeleteSelected = document.querySelector('.btn-delete-selected');

  function updateDeleteSelectedBtn() {
    const checkedCount = [...checkboxes].filter(cb => cb.checked).length;
    if (btnDeleteSelected) {
      btnDeleteSelected.style.display = checkedCount > 1 ? 'inline-block' : 'none';
    }
  }

  updateDeleteSelectedBtn();

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', () => {
      checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
      updateDeleteSelectedBtn();
    });
  }

  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = [...checkboxes].every(cb => cb.checked);
      }
      updateDeleteSelectedBtn();
    });
  });

  // 6) CONFIRMAÇÃO DE EXCLUSÃO EM MASSA
  btnDeleteSelected?.addEventListener('click', evt => {
    const anyChecked = [...checkboxes].some(cb => cb.checked);
    if (!anyChecked) {
      alert('Marque ao menos um produto para excluir.');
      evt.preventDefault();
      return;
    }
    if (!confirm('Deseja realmente excluir os produtos selecionados?')) {
      evt.preventDefault();
    }
  });

  // 👉 NOVA FUNÇÃO: Formata entrada numérica como percentual com 2 casas decimais e vírgula
  function formatPercentSmart(el) {
    let v = el.value.replace(/\D/g, ''); // remove tudo que não é dígito
    while (v.length < 3) {
      v = '0' + v;
    }
    const intPart = v.slice(0, -2);
    const decimalPart = v.slice(-2);
    el.value = parseInt(intPart, 10) + ',' + decimalPart + '%';
  }

  // aplica no blur dos campos de criação
  ['pc_cobre', 'pc_zinco'].forEach(id => {
    const inp = document.getElementById(id);
    if (inp) {
      inp.addEventListener('blur', () => formatPercentSmart(inp));
      inp.addEventListener('focus', () => {
        inp.value = inp.value.replace(/[^\d]/g, '');
      });
    }
  });

  // aplica nos inputs inline ao salvar (edição)
  document.querySelectorAll('input[data-field="pc_cobre"], input[data-field="pc_zinco"]')
    .forEach(inp => {
      inp.addEventListener('blur', () => formatPercentSmart(inp));
      inp.addEventListener('focus', () => {
        inp.value = inp.value.replace(/[^\d]/g, '');
      });
    });

  // Ocultar automaticamente mensagens flash após 5 segundos
  setTimeout(() => {
    document.querySelectorAll('.flash-messages .flash').forEach(el => {
      el.style.transition = 'opacity 0.5s ease-out';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 200);
    });
  }, 2000);

});
