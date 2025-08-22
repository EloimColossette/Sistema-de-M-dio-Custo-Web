document.addEventListener("DOMContentLoaded", () => {
  // ----------------------
  // Abrir modal (novo ou editar):
  // ----------------------
  function openModal(isEdit = false, user = {}) {
    const modal = document.getElementById("userModal");
    const title = document.getElementById("modalTitle");
    const form  = document.getElementById("userForm");

    form.reset();
    const passInput = document.getElementById("userPass");
    const feedback  = form.querySelector(".input-feedback");
    passInput.classList.remove("invalid");
    feedback.textContent = "";

    if (isEdit) {
      form.action = `/usuarios/edit/${user.id}`;
      title.textContent = `Editar Usuário`;

      document.getElementById("userId").value    = user.id || "";
      document.getElementById("firstName").value = user.first_name || "";
      document.getElementById("lastName").value  = user.last_name || "";
      document.getElementById("userEmail").value = user.email || "";

      const chkAtivo = document.getElementById("userAtivo");
      chkAtivo.checked = (user.ativo === "True" || user.ativo === "true" || user.ativo === true);
      chkAtivo.parentElement.style.display = "block";

      passInput.value = "";
      passInput.required = false;
      passInput.removeAttribute("pattern");
      passInput.removeAttribute("title");
      passInput.placeholder = "";
    } else {
      form.action = "/usuarios/create";
      title.textContent = "Novo Usuário";

      document.getElementById("userId").value    = "";
      document.getElementById("firstName").value = "";
      document.getElementById("lastName").value  = "";
      document.getElementById("userEmail").value = "";

      document.getElementById("userAtivo").parentElement.style.display = "none";

      passInput.required = true;
      passInput.setAttribute("pattern", "\\d{8}");
      passInput.setAttribute("title", "Digite exatamente 8 dígitos numéricos");
      passInput.placeholder = "12345678";
    }

    modal.style.display = "flex";
  }

  function closeModal() {
    document.getElementById("userModal").style.display = "none";
  }

  // ----------------------
  // Validação de senha (8 dígitos numéricos):
  // ----------------------
  const userForm = document.getElementById("userForm");
  const userPass = document.getElementById("userPass");
  const feedback = userForm.querySelector(".input-feedback");

  userForm.addEventListener("submit", e => {
    const senhaValor = userPass.value.trim();
    if (senhaValor) {
      const regex8Digitos = /^\d{8}$/;
      if (!regex8Digitos.test(senhaValor)) {
        e.preventDefault();
        userPass.classList.add("invalid");
        feedback.textContent = "A senha deve conter exatamente 8 dígitos numéricos.";
        return;
      }
    }
  });

  userPass.addEventListener("input", () => {
    if (userPass.classList.contains("invalid")) {
      userPass.classList.remove("invalid");
      feedback.textContent = "";
    }
  });

  // ----------------------
  // Excluir em massa (com confirmação):
  // ----------------------
  function deleteSelectedUsers(e) {
    const checkboxes = document.querySelectorAll(".row-checkbox:checked");
    const selectedIds = Array.from(checkboxes).map(cb => cb.closest("tr").dataset.id);

    if (selectedIds.length === 0) {
      alert("Nenhum usuário selecionado.");
      e.preventDefault();
      return;
    }

    if (!confirm("Tem certeza que deseja excluir os usuários selecionados?")) {
      e.preventDefault();
      return;
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/usuarios/delete_selecionados";

    selectedIds.forEach(id => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "user_ids";
      input.value = id;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  }

  // ----------------------
  // Checkbox “select all” e controle botão:
  // ----------------------
  const selectAllCheckbox = document.getElementById("selectAll");
  const rowCheckboxes = document.querySelectorAll(".row-checkbox");
  const btnDelete = document.getElementById("btnDeleteSelected");

  function updateDeleteButtonVisibility() {
    const checkedCount = Array.from(rowCheckboxes).filter(cb => cb.checked).length;
    btnDelete.style.display = checkedCount > 1 ? "inline-block" : "none";
  }

  function toggleSelectAll(e) {
    const checked = e.target.checked;
    rowCheckboxes.forEach(cb => cb.checked = checked);
    updateDeleteButtonVisibility();
  }

  // ----------------------
  // Filtro de busca + status:
  // ----------------------
  const searchInput = document.getElementById("search");
  const statusSelect = document.getElementById("statusFilter");

  searchInput.addEventListener("keypress", function(e) {
    if (e.key === "Enter") {
      const q = searchInput.value.trim();
      const st = statusSelect.value;
      window.location = `/usuarios?q=${encodeURIComponent(q)}&status=${encodeURIComponent(st)}`;
    }
  });

  statusSelect.addEventListener("change", function() {
    const q = searchInput.value.trim();
    const st = statusSelect.value;
    window.location = `/usuarios?q=${encodeURIComponent(q)}&status=${encodeURIComponent(st)}`;
  });

  // ----------------------
  // Eventos ao carregar a DOM:
  // ----------------------
  document.getElementById("btnNew").addEventListener("click", () => openModal(false));
  document.getElementById("closeModal").addEventListener("click", closeModal);

  document.querySelectorAll(".btn-edit").forEach(btn => {
    btn.addEventListener("click", event => {
      const tr = event.target.closest("tr");
      const user = {
        id:         tr.dataset.id,
        first_name: tr.dataset.first,
        last_name:  tr.dataset.last,
        email:      tr.dataset.email,
        ativo:      tr.dataset.ativo
      };
      openModal(true, user);
    });
  });

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", toggleSelectAll);
  }

  rowCheckboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = Array.from(rowCheckboxes).every(cb => cb.checked);
      }
      updateDeleteButtonVisibility();
    });
  });

  btnDelete.addEventListener("click", deleteSelectedUsers);
  updateDeleteButtonVisibility();

  // Mensagens de feedback temporárias
  document.querySelectorAll(".mensagem").forEach(el => {
    setTimeout(() => {
      el.style.transition = "opacity 0.5s ease";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 500);
    }, 2000);
  });

   // auto-hide das flash messages após 4 segundos
  document.querySelectorAll('.flash').forEach(msg => {
    setTimeout(() => {
      msg.style.transition = 'opacity 0.5s ease';
      msg.style.opacity = '0';
      msg.addEventListener('transitionend', () => msg.remove());
    }, 2000);
  });

});
