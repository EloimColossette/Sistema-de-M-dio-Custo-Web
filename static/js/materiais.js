document.addEventListener('DOMContentLoaded', () => {

  // 1) HABILITAR EDIÇÃO INLINE
  document.querySelectorAll('#materiais-page .edit-icon').forEach(editBtn => {
    editBtn.addEventListener('click', () => {
      const row = editBtn.closest('tr');
      row.querySelectorAll('.input-inline').forEach(el => el.disabled = false);
      editBtn.classList.add('hidden');
      row.querySelector('.save-icon').classList.remove('hidden');
    });
  });

  // 2) SALVAR ALTERAÇÕES VIA FETCH
  document.querySelectorAll('#materiais-page .save-icon').forEach(saveBtn => {
    saveBtn.addEventListener('click', () => {
      const row = saveBtn.closest('tr');
      const id  = row.getAttribute('data-id');

      const nomeVal       = row.querySelector('input[data-field="nome"]').value.trim();
      const fornecedorVal = row.querySelector('select[data-field="fornecedor_id"]').value;
      const valorVal      = row.querySelector('input[data-field="valor"]').value.trim();
      const grupoVal      = row.querySelector('select[data-field="grupo"]').value;

      if (!nomeVal) {
        alert('Nome não pode ficar vazio.');
        return;
      }
      if (!fornecedorVal) {
        alert('Selecione um fornecedor.');
        return;
      }
      if (isNaN(parseFloat(valorVal.replace(',', '.')))) {
        alert('Valor inválido.');
        return;
      }

      const params = new URLSearchParams();
      params.append(`nome_material_${id}`, nomeVal);
      params.append(`fornecedor_sel_${id}`, fornecedorVal);
      params.append(`valor_material_${id}`, valorVal);
      params.append(`grupo_material_${id}`, grupoVal);

      fetch(`/materiais/edit/${id}`, {
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
  document.querySelectorAll('#materiais-page .btn-delete-confirm')
    .forEach(btn => btn.addEventListener('click', evt => {
      const nome = btn.getAttribute('data-nome') || 'este material';
      if (!confirm(`Deseja realmente excluir ${nome}?`)) evt.preventDefault();
    }));

  // 4) FILTRO DE PESQUISA EM TEMPO REAL
  const searchInput = document.getElementById('search_material');
  searchInput.addEventListener('input', () => {
    const filter = searchInput.value.toLowerCase();
    const rows = document.querySelectorAll('.card-list tbody tr');
    rows.forEach(row => {
      const nomeInput = row.querySelector('input[data-field="nome"]');
      if (!nomeInput) return;
      const nome = nomeInput.value.toLowerCase();
      row.style.display = nome.includes(filter) ? '' : 'none';
    });
  });

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

  selectAllCheckbox.addEventListener('change', () => {
    checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
    updateDeleteSelectedBtn();
  });

  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      selectAllCheckbox.checked = [...checkboxes].every(cb => cb.checked);
      updateDeleteSelectedBtn();
    });
  });

  // 6) CONFIRMAÇÃO DE EXCLUSÃO EM MASSA
  btnDeleteSelected?.addEventListener('click', evt => {
    const anyChecked = [...checkboxes].some(cb => cb.checked);
    if (!anyChecked) {
      alert('Marque ao menos um material para excluir.');
      evt.preventDefault();
      return;
    }
    if (!confirm('Deseja realmente excluir os materiais selecionados?')) {
      evt.preventDefault();
    }
  });

  // 7) FORMATAÇÃO AUTOMÁTICA DO CAMPO VALOR COM VÍRGULA E 4 CASAS DECIMAIS
  const valorInput = document.getElementById('valor_material');

  if (valorInput) {
    valorInput.addEventListener('input', () => {
      let valor = valorInput.value.replace(/\D/g, '');
      valor = valor.padStart(5, '0'); // Garante pelo menos 5 dígitos
      const inteiro = valor.slice(0, -4);
      const decimal = valor.slice(-4);
      valorInput.value = `${parseInt(inteiro, 10)},${decimal}`;
    });

    // Impede colar valores inesperados
    valorInput.addEventListener('paste', e => e.preventDefault());
  }

  // 8) auto-hide das mensagens de flash após 4 segundos
  const flashMessages = document.querySelectorAll('.flash');
  flashMessages.forEach(msg => {
    // aguarda 4 segundos e então faz fade out
    setTimeout(() => {
      // se quiser só remover imediatamente:
      // msg.remove();

      // ou, para um efeito de desaparecimento suave:
      msg.style.transition = 'opacity 0.5s ease';
      msg.style.opacity = '0';
      // após a transição, remove do DOM
      msg.addEventListener('transitionend', () => msg.remove());
    }, 2000);
  });

});
