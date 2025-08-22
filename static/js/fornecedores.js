document.addEventListener('DOMContentLoaded', () => {
  // 1) Editar inline -> mostrar campo e ícone de salvar
  document.querySelectorAll('.edit-icon').forEach(editBtn => {
    editBtn.addEventListener('click', () => {
      const row = editBtn.closest('tr');
      const input = row.querySelector('input[data-field="nome"]');
      input.disabled = false;
      input.focus();

      editBtn.classList.add('hidden');
      row.querySelector('.save-icon').classList.remove('hidden');
    });
  });

  // 2) Salvar alteração via fetch
  document.querySelectorAll('.save-icon').forEach(saveBtn => {
    saveBtn.addEventListener('click', () => {
      const row = saveBtn.closest('tr');
      const id = row.dataset.id;
      const valor = row.querySelector('input[data-field="nome"]').value.trim();

      if (!valor) {
        alert('O nome não pode ficar vazio.');
        return;
      }

      const params = new URLSearchParams();
      params.append(`nome_fornecedor_${id}`, valor);

      fetch(`/fornecedores/edit/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      })
      .then(resp => {
        if (resp.ok) {
          window.location.reload();
        } else {
          alert('Falha ao salvar. Tente novamente.');
        }
      })
      .catch(() => alert('Erro na requisição.'));
    });
  });

  // 3) Checkbox “select all” + botão excluir múltiplos
  const selectAll = document.getElementById('select-all');
  const rowCheckboxes = document.querySelectorAll('.row-checkbox');
  const btnDeleteSelected = document.querySelector('.btn-delete-selected');

  const updateDeleteSelectedVisibility = () => {
    const checkedCount = Array.from(rowCheckboxes).filter(cb => cb.checked).length;
    if (btnDeleteSelected) {
      btnDeleteSelected.style.display = checkedCount > 1 ? 'inline-block' : 'none';
    }
  };

  if (selectAll) {
    selectAll.addEventListener('change', () => {
      rowCheckboxes.forEach(cb => cb.checked = selectAll.checked);
      updateDeleteSelectedVisibility();
    });
  }

  rowCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      if (selectAll) {
        selectAll.checked = Array.from(rowCheckboxes).every(cb => cb.checked);
      }
      updateDeleteSelectedVisibility();
    });
  });

  // Inicia com o botão oculto
  updateDeleteSelectedVisibility();

  // 4) Confirmação exclusão única
  document.querySelectorAll('.btn-delete-confirm').forEach(btn => {
    btn.addEventListener('click', evt => {
      const nome = btn.dataset.nome || 'este fornecedor';
      if (!confirm(`Deseja realmente excluir ${nome}?`)) {
        evt.preventDefault();
      }
    });
  });

  // 5) Confirmação exclusão em massa
  btnDeleteSelected?.addEventListener('click', evt => {
    const anyChecked = Array.from(rowCheckboxes).some(cb => cb.checked);
    if (!anyChecked) {
      alert('Marque ao menos um fornecedor para excluir.');
      evt.preventDefault();
      return;
    }
    if (!confirm('Deseja realmente excluir os fornecedores selecionados?')) {
      evt.preventDefault();
    }
  });

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
