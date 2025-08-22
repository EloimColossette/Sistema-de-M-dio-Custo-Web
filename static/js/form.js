// static/js/form.js

document.addEventListener("DOMContentLoaded", () => {
  const form                = document.querySelector("form");
  const emailInput          = document.getElementById("email");
  const senhaInput          = document.getElementById("senha");
  const novaSenhaInput      = document.getElementById("nova_senha");
  const confirmarSenhaInput = document.getElementById("confirmar_senha");
  const submitButton        = document.querySelector("button[type='submit']");

  // Monta array de inputs de senha conforme existirem na página
  const passwordInputs = [senhaInput, novaSenhaInput, confirmarSenhaInput]
    .filter(el => el instanceof HTMLInputElement);

  // Função para habilitar/desabilitar botão de submit
  function toggleSubmit() {
    let allFilled;
    // Se for reset ou primeiro login, basta que os dois campos de senha estejam preenchidos
    if (form.id === "resetForm" || form.id === "primeiroLoginForm") {
      allFilled = passwordInputs.every(i => i.value.trim().length > 0);
    } else {
      // Em login/registro: e-mail + todos os campos de senha (um ou dois, conforme a página)
      allFilled = emailInput?.value.trim().length > 0
                && passwordInputs.every(i => i.value.trim().length > 0);
    }
    submitButton.disabled = !allFilled;
  }

  // Validação inline: exibe mensagem se o campo estiver vazio após "tocado"
  function validateField(input) {
    const fb = input.closest(".input-group")?.querySelector(".input-feedback");
    if (!fb) return;
    if (input.touched && !input.value.trim()) {
      input.classList.add("invalid");
      fb.textContent =
        input.id === "email"           ? "Email é obrigatório." :
        input.id === "senha"           ? "Senha é obrigatória." :
        input.id === "nova_senha"      ? "Nova senha é obrigatória." :
        input.id === "confirmar_senha" ? "Confirmação é obrigatória." : "";
    } else {
      input.classList.remove("invalid");
      fb.textContent = "";
    }
  }

  // Marca campo como "tocado" e vincula eventos de input/blur
  [emailInput, ...passwordInputs].forEach(input => {
    if (!input) return;
    input.addEventListener("input", () => {
      input.touched = true;
      validateField(input);
      toggleSubmit();
    });
    input.addEventListener("blur", () => {
      input.touched = true;
      validateField(input);
    });
  });

  // Antes de enviar, garante que todas as validações tenham rodado
  form.addEventListener("submit", e => {
    [emailInput, ...passwordInputs].forEach(input => {
      if (!input) return;
      input.touched = true;
      validateField(input);
    });
    toggleSubmit();
    if (submitButton.disabled) e.preventDefault();
  });

  // Estado inicial do botão
  toggleSubmit();

  // FUNÇÃO GENÉRICA: alterna olho aberto/fechado para qualquer par (campo + toggle)
  function toggleEye(idInput, idToggle) {
    const input  = document.getElementById(idInput);
    const toggle = document.getElementById(idToggle);
    if (!input || !toggle) return;
    const eyeShow = toggle.querySelector(".eye-show");
    const eyeHide = toggle.querySelector(".eye-hide");
    // Estado inicial: olho escondido oculto, olho visível
    if (eyeShow) eyeShow.style.display = "inline-block";
    if (eyeHide) eyeHide.style.display = "none";

    toggle.addEventListener("click", () => {
      const isPass = input.type === "password";
      input.type = isPass ? "text" : "password";
      if (eyeShow && eyeHide) {
        eyeShow.style.display = isPass ? "none" : "inline-block";
        eyeHide.style.display = isPass ? "inline-block" : "none";
      }
    });
  }

  // ---------- Associação de toggles conforme IDs existentes no template ----------
  // Login / Registro
  toggleEye("senha",           "togglePassword");
  toggleEye("confirmar_senha", "toggleConfirmPassword");

  // Primeiro Login (force reset) / Reset Password (esqueci senha)
  toggleEye("nova_senha",      "toggleNew");
  toggleEye("confirmar_senha", "toggleConfirm");

  // ================================
  // Fade-out automático das mensagens
  // ================================
  document.querySelectorAll(".mensagem").forEach(el => {
    setTimeout(() => {
      el.style.transition = "opacity 0.5s ease";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 500);
    }, 2000);
  });
});
