document.addEventListener('DOMContentLoaded', () => {
  // --- FUNÇÃO: Capitalizar Nome ---
  function capitalizeWords(str) {
    const lowerWords = ['de', 'da', 'do', 'das', 'dos', 'e'];
    return str
      .toLowerCase()
      .split(' ')
      .map((word, idx) => {
        if (lowerWords.includes(word) && idx !== 0) {
          return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }
  // --- VARIÁVEIS GLOBAIS ---
  const produtosList = document.getElementById('produtosList');
  const addBtn       = document.getElementById('addProdBtn');
  const form         = document.getElementById('form-nova-nf');
  let produtos       = [];

  // Dropdown de Base (form principal)
  const baseInput = document.getElementById('prodBaseInput');
  const baseList  = document.getElementById('prodBaseList');
  let selectedBase = '';

  if (baseInput && baseList) {
    baseInput.addEventListener('click', () => baseList.classList.toggle('show'));
    document.addEventListener('click', e => {
      if (!baseInput.contains(e.target) && !baseList.contains(e.target)) {
        baseList.classList.remove('show');
      }
    });
    baseList.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        selectedBase = li.dataset.value;
        baseInput.querySelector('.placeholder').textContent = li.textContent;
        baseList.classList.remove('show');
      });
    });
  }

  // --- FUNÇÃO: renderList (form principal) ---
  function renderList() {
    produtosList.innerHTML = produtos.map((p, idx) => {
      const [nome, peso, base] = p.split('|');
      return `
        <tr data-index="${idx}">
          <td>${nome}</td>
          <td>${peso}</td>
          <td>${base}</td>
          <td class="col-actions">
            <span class="icon edit-icon" title="Editar produto">✏️</span>
            <span class="icon delete-icon remove-btn" title="Excluir produto">🗑️</span>
          </td>
        </tr>`;
    }).join('');

    // Remover produto
    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = +e.target.closest('tr').dataset.index;
        if (confirm('Remover este produto?')) {
          produtos.splice(idx, 1);
          renderList();
        }
      });
    });

    // Editar inline (form principal)
    document.querySelectorAll('.edit-icon').forEach(ic => {
      ic.addEventListener('click', e => {
        const tr  = e.target.closest('tr');
        const idx = +tr.dataset.index;
        if (tr.querySelector('.save-icon')) return; // já em edição

        // Recupera valores atuais
        const [nome, peso, base] = produtos[idx].split('|');
        const tds = tr.querySelectorAll('td');

        // 1) Inputs para nome e peso
        tds[0].innerHTML = `<input type="text" value="${nome}" style="width:100%">`;
        tds[1].innerHTML = `<input type="text" value="${peso}" style="width:80px">`;

        // 1.1) Máscara inline de 3 casas decimais no peso
        const pesoInputInline = tds[1].querySelector('input');
        pesoInputInline.addEventListener('input', () => {
          let val = pesoInputInline.value.replace(/\D/g, ''); // só dígitos
          if (val.length > 3) {
            const inteiro  = val.slice(0, val.length - 3);
            const decimais = val.slice(-3);
            pesoInputInline.value = `${parseInt(inteiro)},${decimais}`;
          } else {
            pesoInputInline.value = `0,${val.padStart(3, '0')}`;
          }
        });

        // 2) Dropdown inline de Base
        const opts = Array.from(baseList.children)
          .map(li => `<li data-value="${li.dataset.value}">${li.textContent}</li>`)
          .join('');
        tds[2].innerHTML = `
          <div class="dropdown-container-inline">
            <div class="dropdown-input-inline" tabindex="0">
              <span class="placeholder-inline">${base}</span><span class="arrow">▾</span>
            </div>
            <ul class="dropdown-list-inline">${opts}</ul>
          </div>`;
        const dd     = tds[2].querySelector('.dropdown-input-inline');
        const ddList = tds[2].querySelector('.dropdown-list-inline');
        let selBaseInline = base;
        dd.addEventListener('click', () => ddList.classList.toggle('show'));
        ddList.querySelectorAll('li').forEach(li => {
          li.addEventListener('click', () => {
            selBaseInline = li.dataset.value;
            dd.querySelector('.placeholder-inline').textContent = li.textContent;
            ddList.classList.remove('show');
          });
        });
        document.addEventListener('click', ev => {
          if (!dd.contains(ev.target) && !ddList.contains(ev.target)) {
            ddList.classList.remove('show');
          }
        });

         // 3) Troca ações por botões salvar e cancelar
        tds[3].innerHTML = '';
        const saveBtn   = document.createElement('span');
        const cancelBtn = document.createElement('span');
        saveBtn.className   = 'icon save-icon';
        saveBtn.title       = 'Salvar';
        saveBtn.textContent = '💾';
        cancelBtn.className   = 'icon cancel-icon';
        cancelBtn.title       = 'Cancelar';
        cancelBtn.textContent = '❌';
        cancelBtn.style.marginLeft = '8px';
        tds[3].append(saveBtn, cancelBtn);

        // Cancelar edição: volta ao estado original
        cancelBtn.addEventListener('click', () => {
          renderList(); // simplesmente re-renderiza limpa edição
        });

        saveBtn.addEventListener('click', () => {
          const novoNome = tds[0].querySelector('input').value.trim();
          const novoPeso = tds[1].querySelector('input').value.trim();
          const novaBase = selBaseInline;
          if (!novoNome || !novoPeso || !novaBase) {
            alert('Preencha todos os campos.');
            return;
          }
          // Atualiza array e re-renderiza a lista
          produtos[idx] = `${novoNome}|${novoPeso}|${novaBase}`;
          renderList();
        });
      });
    });
  }

  // --- adicionar produto (form principal) ---
  addBtn.addEventListener('click', () => {
    const nome = document.getElementById('prodNome').value.trim();
    const peso = document.getElementById('prodPeso').value.trim();
    if (!nome || !peso || !selectedBase) {
      alert('Preencha nome, peso e base do produto.');
      return;
    }
    produtos.push(`${nome}|${peso}|${selectedBase}`);
    renderList();
    document.getElementById('prodNome').value = '';
    document.getElementById('prodPeso').value = '';
    baseInput.querySelector('.placeholder').textContent = 'Selecione';
    selectedBase = '';
  });

  // --- injetar hidden inputs antes de enviar NF ---
  form.onsubmit = () => {
    form.querySelectorAll('input[name="produtos[]"]').forEach(i => i.remove());
    produtos.forEach(p => {
      const inp = document.createElement('input');
      inp.type  = 'hidden';
      inp.name  = 'produtos[]';
      inp.value = p;
      form.appendChild(inp);
    });
    return true;
  };

  // --- Máscara de CNPJ/CPF ---
  const cnpjCpfInput = document.getElementById('cnpj_nf');
  cnpjCpfInput.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length <= 11) {
      // CPF: 000.000.000-00
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
      // CNPJ: 00.000.000/0000-00
      v = v.replace(/^(\d{2})(\d)/, '$1.$2');
      v = v.replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2');
      v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
      v = v.replace(/(\d{4})(\d{1,2})$/, '$1-$2');
    }
    e.target.value = v;
  });

  // --- Formatação de Peso inline no formulário principal ---
  const pesoInput = document.getElementById('prodPeso');

  pesoInput.addEventListener('input', () => {
    let val = pesoInput.value.replace(/\D/g, '');
    if (val.length > 3) {
      const inteiro  = val.slice(0, val.length - 3);
      const decimais = val.slice(-3);
      pesoInput.value = `${parseInt(inteiro)},${decimais}`;
    } else {
      pesoInput.value = `0,${val.padStart(3, '0')}`;
    }
  });

  pesoInput.addEventListener('blur', e => {
    let raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      e.target.value = '';
      return;
    }

    // Garante pelo menos 4 dígitos para não quebrar
    raw = raw.padStart(4, '0');
    const intPart = raw.slice(0, -3);
    const decPart = raw.slice(-3);

    // Formata parte inteira com separador de milhar
    const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    e.target.value = `${intFormatted},${decPart}`;
  });

  cnpjCpfInput.addEventListener('blur', async e => {
    const raw = e.target.value.replace(/\D/g, '');

    if (raw.length === 11) {
      // CPF – busca local
      try {
        const resp = await fetch(`/saida_nf/buscar_cliente/${raw}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.nome) {
          const nomeFormatado = capitalizeWords(data.nome);
          document.getElementById('cliente_nf').value = nomeFormatado;
        }
        }
      } catch (err) {
        console.error('Erro ao consultar CPF local:', err);
      }
    }

    if (raw.length === 14) {
      // CNPJ – busca via ReceitaWS
      try {
        const resp = await fetch(`/saida_nf/buscar_empresa/${raw}`);
        const data = await resp.json();
        if (data.nome) {
          const nomeFormatado = capitalizeWords(data.nome);
          document.getElementById('cliente_nf').value = nomeFormatado;
        }
      } catch (err) {
        console.error('Erro ao consultar CNPJ na ReceitaWS:', err);
      }
    }
  });

  renderList();
  

  // --- PAGINAÇÃO DO MODAL ----
  let currentPage = Number(new URLSearchParams(window.location.search).get('page')) || 1;
  const perPage    = 10;  // deve bater com o backend
  const modalTbody = document.querySelector('#modal-nfs tbody');
  let totalPages;         // vamos preencher na abertura do modal
  async function loadNextModalItems(count) {
    const nextPage = currentPage + 1;
    if (nextPage > totalPages) {
      console.log('Não há mais páginas para carregar.');
      return;
    }

    const resp = await fetch(`/saida_nf/atualizar_modal?page=${nextPage}`);
    if (!resp.ok) throw new Error('Erro ao carregar próximas NFs');
    const json = await resp.json();

    // Se vier linhas, avançamos a página
    if (json.rows.length > 0) {
      currentPage = nextPage;
    }
    totalPages = json.total_pages;

    json.rows.slice(0, count).forEach(item => {
      const trNew = document.createElement('tr');
      trNew.dataset.id  = item.id;
      trNew.dataset.obs = item.observacao;
      trNew.innerHTML = `
        <td><input type="checkbox" class="select-row"></td>
        <td>${item.data}</td>
        <td>${item.numero_nf}</td>
        <td>${item.cliente}</td>
        <td>${item.cnpj_cpf}</td>
        <td class="col-actions"></td>
      `;
      modalTbody.appendChild(trNew);
    });

    console.log(`Carregados ${Math.min(count, json.rows.length)} linhas da página ${currentPage}.`);
  }

  // --- FUNÇÃO DE RECARREGAR PÁGINA DO MODAL ---
  async function refreshModalPage() {
    // 1) limpa todas as linhas atuais
    modalTbody.innerHTML = '';

    // 2) busca a página corrente
    const resp = await fetch(`/saida_nf/atualizar_modal?page=${currentPage}`);
    if (!resp.ok) throw new Error('Erro ao recarregar modal');
    const json = await resp.json();

    // 3) atualiza totalPages
    totalPages = json.total_pages;

    // 4) gera as novas linhas
    json.rows.forEach(item => {
      const tr = document.createElement('tr');
      tr.dataset.id  = item.id;
      tr.dataset.obs = item.observacao;

      // Pega o primeiro produto (ou vazio, se não houver)
      const primeiro = item.produtos[0] || { nome: '', peso: 0, base: '' };

      // Formata o peso
      const pesoFmt = Number(primeiro.peso)
        .toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' Kg';

      tr.innerHTML = `
        <td><input type="checkbox" class="select-row"></td>
        <td>${item.data}</td>
        <td>${item.numero_nf}</td>
        <td>${primeiro.nome}</td>
        <td>${pesoFmt}</td>
        <td>${item.cliente}</td>
        <td>${item.cnpj_cpf}</td>
        <td>${primeiro.base}</td>
        <td class="col-actions"></td>
      `;

      modalTbody.appendChild(tr);
    });

    // 5) reaplica todos os event listeners
    setupNFList();
  }

  // --- MODAL DE NFS CADASTRADAS ---
  const modalNfs       = document.getElementById('modal-nfs');
  const abrirModalBtn  = document.getElementById('abrirModalNfBtn');
  const fecharModalBtn = document.getElementById('fecharModalNfBtn');

  abrirModalBtn.addEventListener('click', async () => {
    modalNfs.classList.add('show');
    
    // mostra loading, esconde conteúdo
    document.getElementById('modal-loading').style.display = 'block';
    document.getElementById('modal-content-container').style.display = 'none';

    if (totalPages === undefined) {
      const resp = await fetch(`/saida_nf/atualizar_modal?page=${currentPage}`);
      const json = await resp.json();
      totalPages = json.total_pages;
    }

    await refreshModalPage();

    // esconde loading, mostra conteúdo
    document.getElementById('modal-loading').style.display = 'none';
    document.getElementById('modal-content-container').style.display = 'block';
  });


  function closeModal() {
    // Limpa o input
    const searchInput = document.getElementById('campo-pesquisa');
    if (searchInput) {
      searchInput.value = '';
    }

    // Remove os parâmetros da URL
    const url = new URL(window.location.href);
    url.searchParams.delete('modal');
    url.searchParams.delete('search');
    url.hash = ''; // remove hash, se existir
    history.replaceState(null, '', url.pathname + url.search);

    // Fecha o modal
    modalNfs.classList.remove('show');

    // Reenvia a pesquisa sem filtro
    const form = document.getElementById('form-pesquisa');
    if (form) {
      form.submit();
    } else {
      // Se não tiver formulário, recarrega a página
      location.reload();
    }
  }

  // Evento no botão X e na tecla Esc
  fecharModalBtn.addEventListener('click', closeModal);
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // --- SETUP do conteúdo do modal ---
  function setupNFList() {
    document.querySelectorAll('#modal-nfs tbody tr[data-id]').forEach(tr => {
      const nfId    = tr.dataset.id;
      let obs       = tr.dataset.obs.trim();
      const actions = tr.querySelector('.col-actions');
      actions.innerHTML = '';

      // 1) Sino de observação (quando já existe obs)
      if (obs) {
        const key   = `nfRead_${nfId}`;
        const read  = localStorage.getItem(key) === 'true';
        const bell  = document.createElement('span');
        bell.className   = 'icon obs-icon';
        bell.title       = 'Ver Observação';
        bell.textContent = read ? '🔕' : '🔔';
        bell.style.cursor = 'pointer';
        bell.addEventListener('click', () => {
          if (!localStorage.getItem(key)) {
            bell.textContent = '🔕';
            localStorage.setItem(key, 'true');
          }
          const modal = document.getElementById('modal-obs');
          const view = modal.querySelector('#view-mode');
          const edit = modal.querySelector('#edit-mode');
          const text = modal.querySelector('#modalObsText');
          const input = modal.querySelector('#modalObsInput');
          const btnEdit = modal.querySelector('#btnEditObs');
          const btnSave = modal.querySelector('#btnSaveObs');
          const btnDel = modal.querySelector('#btnDeleteObs');

          // Preenche e mostra em modo view
          text.textContent = obs;
          view.style.display = 'block';
          edit.style.display = 'none';
          btnEdit.style.display = 'inline-block';
          btnSave.style.display = 'none';
          btnDel.style.display = 'inline-block';
          modal.classList.add('show');

          // EDITAR
          btnEdit.onclick = () => {
            input.value = obs;
            view.style.display = 'none';
            edit.style.display = 'block';
            btnEdit.style.display = 'none';
            btnSave.style.display = 'inline-block';
          };

          // SALVAR
          btnSave.onclick = async () => {
            const novaObs = input.value.trim();
            const resp = await fetch(`${window.location.pathname}/observacao/${nfId}`, {
              method: 'POST',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify({observacao: novaObs})
            });
            if (!resp.ok) return alert('Erro ao salvar observação.');

            // atualiza dataset e localStorage
            tr.dataset.obs = novaObs;
            localStorage.removeItem(`nfRead_${nfId}`);
            obs = novaObs;

            // fecha modal e re-renderiza
            modal.classList.remove('show');
            setupNFList();
          };

          // EXCLUIR
          btnDel.onclick = async () => {
            if (!confirm('Deseja realmente excluir esta observação?')) return;
            const resp = await fetch(`${window.location.pathname}/observacao/${nfId}`, {
              method: 'DELETE'
            });
            if (!resp.ok) return alert('Erro ao excluir observação.');

            // limpa no DB e na UI: remove obs e oculta ícone
            tr.dataset.obs = '';
            modal.classList.remove('show');
            setupNFList();
          };
        });
        actions.appendChild(bell);
      }

      // 2) Menu “⋯”
      const menuCont   = document.createElement('div');
      menuCont.className = 'dropdown-container-actions';
      const moreIcon   = document.createElement('span');
      moreIcon.className   = 'more-icon';
      moreIcon.textContent = '⠇';
      menuCont.appendChild(moreIcon);
      const actionMenu = document.createElement('div');
      actionMenu.className = 'action-menu';

      // ➕ ícone de adicionar/editar observação
      const noteIcon = document.createElement('span');
      noteIcon.className   = 'icon note-icon';
      noteIcon.title       = obs ? 'Editar Observação' : 'Adicionar Observação';
      noteIcon.textContent = '📝';
      noteIcon.addEventListener('click', e => {
        e.stopPropagation();

        const modal   = document.getElementById('modal-obs');
        const view    = modal.querySelector('#view-mode');
        const edit    = modal.querySelector('#edit-mode');
        const input   = modal.querySelector('#modalObsInput');
        const btnEdit = modal.querySelector('#btnEditObs');
        const btnSave = modal.querySelector('#btnSaveObs');
        const btnDel  = modal.querySelector('#btnDeleteObs');

        // Modo edição direto:
        view.style.display     = 'none';
        edit.style.display     = 'block';
        btnEdit.style.display  = 'none';
        btnSave.style.display  = 'inline-block';
        btnDel.style.display   = obs ? 'inline-block' : 'none'; // só mostra “Excluir” se já há obs
        input.value            = obs;  // pode estar vazio
        modal.classList.add('show');

        // Salvar nova observação (mesmo código do btnSave do sino)
        btnSave.onclick = async () => {
          const novaObs = input.value.trim();
          if (!novaObs) return alert('Observação não pode ficar vazia.');
          const resp = await fetch(`${window.location.pathname}/observacao/${nfId}`, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({observacao: novaObs})
          });
          if (!resp.ok) return alert('Erro ao salvar.');

          tr.dataset.obs = novaObs;
          obs = novaObs;
          localStorage.removeItem(`nfRead_${nfId}`);
          modal.classList.remove('show');
          setupNFList();
        };

        // Excluir se já existia antes
        btnDel.onclick = async () => {
          if (!confirm('Excluir observação?')) return;
          const resp = await fetch(`${window.location.pathname}/observacao/${nfId}`, {
            method: 'DELETE'
          });
          if (!resp.ok) return alert('Erro ao excluir.');
          tr.dataset.obs = '';
          obs = '';
          modal.classList.remove('show');
          setupNFList();
        };
      });
      actionMenu.append(noteIcon);

      // ➕ ícone de editar já existente
      const editIcon = document.createElement('span');
      editIcon.className   = 'icon edit-icon';
      editIcon.title       = 'Editar';
      editIcon.textContent = '✏️';
      // ... seu código de editInline aqui ...
      actionMenu.append(editIcon);

      // ➖ ícone de excluir
      const delIcon = document.createElement('span');
      delIcon.className   = 'icon delete-icon';
      delIcon.title       = 'Excluir';
      delIcon.textContent = '🗑️';
      // ... seu código de delete aqui ...
      actionMenu.append(delIcon);

      menuCont.appendChild(actionMenu);
      actions.appendChild(menuCont);

      // toggle do menu
      moreIcon.addEventListener('click', e => {
        e.stopPropagation();
        menuCont.classList.toggle('show');
      });
      document.addEventListener('click', () => menuCont.classList.remove('show'));

      // --- EDITAR inline (modal) ---
      editIcon.addEventListener('click', () => {
        if (tr.querySelector('.save-icon')) return; // já em edição
        const tds = tr.querySelectorAll('td');
        const oldValues = {
          data: tds[1].textContent.trim(),
          nf: tds[2].textContent.trim(),
          produto: tds[3].textContent.trim(),
          peso: tds[4].textContent.trim(),
          cliente: tds[5].textContent.trim(),
          cnpj: tds[6].textContent.trim(),
          base: tds[7].textContent.trim()
        };

        // — Data —
        const atData = tds[1].textContent.trim().split('/'); // ["dd","mm","yyyy"]
        tds[1].innerHTML = `<input type="date" value="${atData[2]}-${atData[1].padStart(2,'0')}-${atData[0].padStart(2,'0')}">`;

        // — NF —
        const atNf = tds[2].textContent.trim();
        tds[2].innerHTML = `<input type="text" value="${atNf}" style="width:60px">`;

        // — Produto —
        const nomeAt  = tds[3].textContent.trim();
        tds[3].innerHTML = `<input type="text" value="${nomeAt}" style="width:100%">`;

        // — Peso —
        const pesoAt = tds[4].textContent.trim().replace(' Kg','').replace(',', '.');
        tds[4].innerHTML = `<input type="number" step="0.001" value="${pesoAt}" style="width:80px">`;
        const pesoInput = tds[4].querySelector('input');

        pesoInput.addEventListener('input', () => {
          let val = pesoInput.value.replace(/\D/g, '');
          if (val.length > 3) {
            const inteiro = val.slice(0, val.length - 3);
            const decimais = val.slice(-3);
            pesoInput.value = `${parseInt(inteiro)}.${decimais}`;
          } else {
            pesoInput.value = `0.${val.padStart(3, '0')}`;
          }
        });

        // — Cliente —
        const cliAt = tds[5].textContent.trim();
        tds[5].innerHTML = `<input type="text" value="${cliAt}" style="width:120px">`;

        // — CNPJ/CPF —
        const cnpjAt = tds[6].textContent.trim();
        tds[6].innerHTML = `<input type="text" value="${cnpjAt}" style="width:120px">`;

        const cnpjInput = tds[6].querySelector('input');

        cnpjInput.addEventListener('input', () => {
          let val = cnpjInput.value.replace(/\D/g, '');

          if (val.length <= 11) {
            // CPF: 000.000.000-00
            val = val.replace(/(\d{3})(\d)/, '$1.$2');
            val = val.replace(/(\d{3})(\d)/, '$1.$2');
            val = val.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
          } else {
            // CNPJ: 00.000.000/0000-00
            val = val.replace(/^(\d{2})(\d)/, '$1.$2');
            val = val.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
            val = val.replace(/\.(\d{3})(\d)/, '.$1/$2');
            val = val.replace(/(\d{4})(\d{1,2})$/, '$1-$2');
          }

          cnpjInput.value = val;
        });

        // — Base —
        const baseAt = tds[7].textContent.trim();
        const optsM = Array.from(baseList.children)
          .map(li => `<li data-value="${li.dataset.value}">${li.textContent}</li>`)
          .join('');
        tds[7].innerHTML = `
          <div class="dropdown-container-inline">
            <div class="dropdown-input-inline" tabindex="0">
              <span class="placeholder-inline">${baseAt}</span><span class="arrow">▾</span>
            </div>
            <ul class="dropdown-list-inline">${optsM}</ul>
          </div>`;
        const ddM     = tds[7].querySelector('.dropdown-input-inline');
        const ddListM = tds[7].querySelector('.dropdown-list-inline');
        let selM      = baseAt;
        ddM.addEventListener('click', () => ddListM.classList.toggle('show'));
        ddListM.querySelectorAll('li').forEach(li => {
          li.addEventListener('click', () => {
            selM = li.dataset.value;
            ddM.querySelector('.placeholder-inline').textContent = li.textContent;
            ddListM.classList.remove('show');
          });
        });
        document.addEventListener('click', ev => {
          if (!ddM.contains(ev.target) && !ddListM.contains(ev.target)) {
            ddListM.classList.remove('show');
          }
        });

        // — trocar ações por salvar —
        tds[8].innerHTML = '';
        const saveIcon = document.createElement('span');
        saveIcon.className   = 'icon save-icon';
        saveIcon.title       = 'Salvar';
        saveIcon.textContent = '💾';
        tds[8].appendChild(saveIcon);

        // Botão CANCELAR
        const cancelIcon = document.createElement('span');
        cancelIcon.className = 'icon cancel-icon';
        cancelIcon.title     = 'Cancelar edição';
        cancelIcon.textContent = '❌';
        cancelIcon.style.marginLeft = '8px';
        tds[8].appendChild(cancelIcon);

        // Cancelar (restaura visual original)
        cancelIcon.addEventListener('click', () => {
          tds[1].textContent = oldValues.data;
          tds[2].textContent = oldValues.nf;
          tds[3].innerHTML   = `<div class="multiline-ellipsis" title="${oldValues.produto}">${oldValues.produto}</div>`;
          tds[4].textContent = oldValues.peso;
          tds[5].innerHTML   = `<div class="multiline-ellipsis" title="${oldValues.cliente}">${oldValues.cliente}</div>`;
          tds[6].innerHTML   = `<div class="multiline-ellipsis" title="${oldValues.cnpj}">${oldValues.cnpj}</div>`;
          tds[7].innerHTML   = `<div class="multiline-ellipsis" title="${oldValues.base}">${oldValues.base}</div>`;
          setupNFList(); // recarrega os ícones e eventos
        });

        saveIcon.addEventListener('click', async () => {
          // lê todos os novos valores
          const newData    = tds[1].querySelector('input').value;  
          const newNf      = tds[2].querySelector('input').value.trim();
          const newNome    = tds[3].querySelector('input').value.trim();
          const newPeso    = tds[4].querySelector('input').value.trim();
          const newCliente = tds[5].querySelector('input').value.trim();
          const newCnpj    = tds[6].querySelector('input').value.trim();
          const newBase    = selM;

          if (!newData||!newNf||!newNome||!newPeso||!newCliente||!newCnpj||!newBase) {
            alert('Preencha todos os campos.');
            return;
          }

          // --- envia para o backend ---
          const form = new URLSearchParams({
            [`data_${nfId}`]: newData,
            [`numero_nf_${nfId}`]: newNf,
            [`produto_${nfId}`]: newNome,
            [`peso_${nfId}`]: newPeso,
            [`cliente_${nfId}`]: newCliente,
            [`cnpj_cpf_${nfId}`]: newCnpj,
            [`base_produto_${nfId}`]: newBase
          });

          const resp = await fetch(`${window.location.pathname}/edit/${nfId}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: form
          });

          if (!resp.ok) {
            alert('Erro ao salvar no servidor.');
            return;
          }

          // --- só depois você atualiza a UI ---
          const [y,m,d] = newData.split('-');
          tds[1].textContent = `${d}/${m}/${y}`;
          tds[2].textContent = newNf;
          tds[3].innerHTML = `<div class="multiline-ellipsis">${newNome}</div>`;
          tds[4].textContent = parseFloat(newPeso)
            .toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' Kg';
          tds[5].innerHTML = `<div class="multiline-ellipsis">${newCliente}</div>`;
          tds[6].innerHTML = `<div class="multiline-ellipsis">${newCnpj}</div>`;
          tds[7].innerHTML = `<div class="multiline-ellipsis">${newBase}</div>`;

          setupNFList();
        });
      });

      // --- EXCLUIR (modal) ---
      const delIconEl = actionMenu.querySelector('.delete-icon');
      delIconEl.addEventListener('click', async () => {
        if (!confirm('Excluir esta NF?')) return;
        try {
          const resp = await fetch(
            `${window.location.pathname}/excluir/${tr.dataset.id}?page=${currentPage}`,
            { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } }
          );
          if (!resp.ok) throw new Error('Erro ao excluir.');
          // em vez de remover só a linha, recarrega tudo
          await refreshModalPage();
        } catch (err) {
          alert(err.message);
          console.error(err);
        }
      });
    });
  }

  // --- Exclusão em massa no modal ---
  const deleteBtn = document.getElementById('deleteSelectedBtn');
  const selectAll = document.getElementById('selectAll');

  function updateDeleteBtnVisibility() {
    const anyChecked = Array.from(document.querySelectorAll('#modal-nfs tbody .select-row'))
      .some(checkbox => checkbox.checked);
    deleteBtn.style.display = anyChecked ? 'inline-block' : 'none';
  }

  // quando clicar no checkbox “selectAll”
  selectAll.addEventListener('change', e => {
    document.querySelectorAll('#modal-nfs tbody .select-row')
      .forEach(cb => cb.checked = e.target.checked);
    updateDeleteBtnVisibility();
  });

  // quando mudar qualquer checkbox de linha
  document.querySelectorAll('#modal-nfs tbody').forEach(tbody => {
    tbody.addEventListener('change', e => {
      if (e.target.matches('.select-row')) {
        updateDeleteBtnVisibility();
      }
    });
  });

  // ao clicar em “Excluir Selecionados”
  deleteBtn.addEventListener('click', async () => {
    const allChecked = selectAll.checked;
    const term       = document.getElementById('searchNfInput').value.trim();
    
    let payload;
    let confirmMsg;
    
    if (allChecked) {
      confirmMsg = term
        ? `Excluir TODAS as NFs que batem em “${term}”?`
        : 'Excluir TODAS as NFs cadastradas?';
      payload = { all: true, search: term };
    } else {
      // coleta só os IDs marcados
      const checkedBoxes = Array.from(
        document.querySelectorAll('#modal-nfs tbody .select-row:checked')
      );
      const ids = checkedBoxes.map(cb => cb.closest('tr').dataset.id);
      if (!ids.length) return;
      confirmMsg = `Excluir ${ids.length} NF(s) selecionada(s)?`;
      payload = { ids };
    }

    if (!confirm(confirmMsg)) return;

    try {
      const resp = await fetch(`${window.location.pathname}/excluir-massa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) throw new Error('Falha na exclusão');

      // 1) Recarrega todo o conteúdo do modal
      await refreshModalPage();
      
      // 2) Reseta a seleção
      selectAll.checked = false;
      deleteBtn.style.display = 'none';

      // 3) Se não houver linhas, mostra mensagem
      const rows = modalTbody.querySelectorAll('tr[data-id]');
      if (rows.length === 0) {
        modalTbody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align:center; color:#666;">
              Nenhuma nota fiscal cadastrada
            </td>
          </tr>`;
      }

    } catch (err) {
      alert(err.message);
    }
  });

  // === Funções de parsing/formatacao ===
  function parsePesoTextToNumber(text) {
    if (!text) return 0;
    let t = String(text).trim();
    // remove "Kg" e quaisquer letras e espaços no final/início
    t = t.replace(/[^\d,.\-]/g, ''); // mantém dígitos, vírgula, ponto e eventual sinal
    // heurística: se houver vírgula, considera formato pt-BR (123,456)
    // remover pontos que atuem como separador de milhares (heurística)
    // primeiro remova pontos que estejam entre 1-3 dígitos seguidos por vírgula ou fim
    t = t.replace(/\.(?=\d{3}([,\.]|$))/g, '');
    // transforma vírgula decimal em ponto
    t = t.replace(',', '.');
    const n = parseFloat(t);
    return isNaN(n) ? 0 : n;
  }

  function formatPesoShort(n) {
    if (Math.abs(n - Math.round(n)) < 0.0005) {
      return String(Math.round(n)); // inteiro sem decimais
    }
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }

  // === Função principal: agrega por base_produto e mostra total geral ===
  function showAggregatedByBase() {
    const selectedBoxes = Array.from(document.querySelectorAll('#modal-nfs tbody .select-row:checked'));
    const totalsEl = document.getElementById('selectedTotals');
    const contentEl = document.getElementById('totalsContent');
    if (!totalsEl || !contentEl) return;

    if (selectedBoxes.length === 0) {
      totalsEl.style.display = 'none';
      contentEl.innerHTML = '';
      return;
    }

    // Agrupa por base (string exata da célula de Base Produto)
    const map = {}; // { base: somaPeso }
    let totalGeral = 0;

    selectedBoxes.forEach(cb => {
      const tr = cb.closest('tr');
      if (!tr) return;
      // conforme seu template: Base está na coluna índice 7
      const baseCell = tr.children[7];
      const pesoCell = tr.children[4];
      const base = baseCell ? baseCell.textContent.trim() : 'Sem Base';
      const pesoTxt = pesoCell ? pesoCell.textContent.trim() : '0';
      const pesoNum = parsePesoTextToNumber(pesoTxt);
      if (!map[base]) map[base] = 0;
      map[base] += pesoNum;
      totalGeral += pesoNum;
    });

    // Monta HTML: uma linha por base com peso agregado
    let html = '<div style="display:flex; flex-direction:column; gap:6px;">';
    for (const base of Object.keys(map)) {
      const soma = map[base];
      // pula zeros (opcional)
      if (Math.abs(soma) < 1e-9) continue;
      html += `<div style="font-weight:700;">${base} ${formatPesoShort(soma)}</div>`;
    }

    // Total geral
    html += `<div style="margin-top:6px; border-top:1px dashed #e6e6e6; padding-top:6px; font-weight:800;">
              Total ${formatPesoShort(totalGeral)}
            </div>`;

    html += '</div>';

    contentEl.innerHTML = html;
    totalsEl.style.display = 'block';
  }

  // Limpa exibição (usar ao recarregar modal)
  function clearAggregatedTotalsDisplay() {
    const totalsEl = document.getElementById('selectedTotals');
    const contentEl = document.getElementById('totalsContent');
    if (totalsEl && contentEl) {
      totalsEl.style.display = 'none';
      contentEl.innerHTML = '';
    }
  }

  /* -------------------------
    Integração com seleções
    ------------------------- */
  // fallback updateDeleteBtnVisibility se não existir
  if (typeof updateDeleteBtnVisibility !== 'function') {
    window.updateDeleteBtnVisibility = function() {
      const deleteBtn = document.getElementById('deleteSelectedBtn');
      const anyChecked = Array.from(document.querySelectorAll('#modal-nfs tbody .select-row'))
        .some(cb => cb.checked);
      if (deleteBtn) deleteBtn.style.display = anyChecked ? 'inline-block' : 'none';
    };
  }

  // 1) selectAll
  const selectAllCheckbox = document.getElementById('selectAll');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', e => {
      document.querySelectorAll('#modal-nfs tbody .select-row')
        .forEach(cb => cb.checked = e.target.checked);
      updateDeleteBtnVisibility();
      showAggregatedByBase();
    });
  }

  // 2) mudança em qualquer checkbox de linha
  document.querySelectorAll('#modal-nfs tbody').forEach(tbody => {
    tbody.addEventListener('change', e => {
      if (e.target.matches('.select-row')) {
        updateDeleteBtnVisibility();
        showAggregatedByBase();
      }
    });
  });

  // 3) limpeza após recarregar modal — chame clearAggregatedTotalsDisplay() ao final de refreshModalPage()
  // também fornecemos um listener para uso manual:
  window.addEventListener('modalRefreshCleanup', clearAggregatedTotalsDisplay);

  // fechar modal de observação
  document.getElementById('modalObsClose').addEventListener('click', () =>
    document.getElementById('modal-obs').classList.remove('show')
  );

  setupNFList();

  // --- FILTRO de busca no modal ---
  const input = document.getElementById('searchNfInput');
  const base  = window.location.pathname;

  function doSearch() {
    const term = input.value.trim();
    const params = new URLSearchParams();

    // sempre mantemos page=1 e modal=1
    params.set('page',  '1');
    params.set('modal', '1');

    // só adiciona search se tiver termo
    if (term) {
      params.set('search', term);
    }

    // adiciona o hash que seu código já usa pra abrir (#modal-nfs)
    window.location.href = `${base}?${params.toString()}#modal-nfs`;
  }

  // dispara somente ao apertar Enter
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    }
  });

  // opcional: botão de busca caso você tenha (ou queira criar) um <button id="searchNfBtn">
  const btn = document.getElementById('searchNfBtn');
  if (btn) btn.addEventListener('click', doSearch);


  // auto-hide flash messages
  setTimeout(() => {
    document.querySelectorAll('.flash').forEach(el => {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity    = '0';
      setTimeout(() => el.remove(), 500);
    });
  }, 5000);

  // --- ABRIR / FECHAR modal de filtros ---
  const modalFiltros   = document.getElementById('modal-filtros');
  const btnOpenFilter  = document.getElementById('btnOpenFilter');
  const btnCloseFilter = document.getElementById('fecharModalFiltros');

  btnOpenFilter.addEventListener('click', () =>
    modalFiltros.classList.add('show')
  );
  btnCloseFilter.addEventListener('click', () =>
    modalFiltros.classList.remove('show')
  );
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') modalFiltros.classList.remove('show');
  })

  // --- EXPORTAÇÃO FILTRADA ---
  async function exportar(formData, tipo) {
    // monta a query string
    const params = new URLSearchParams();
    for (const [k, v] of formData.entries()) {
      if (v.trim()) params.append(k, v);
    }
    params.append('tipo', tipo); // 'excel' ou 'pdf'

    // dispara o download
    window.location = `/saida_nf/exportar_filtrado?${params.toString()}`;
  }

  document.getElementById('btnExportExcel').addEventListener('click', () => {
    const fd = new FormData(document.getElementById('form-filtros'));
    exportar(fd, 'excel');
  });

  document.getElementById('btnExportPdf').addEventListener('click', () => {
    const fd = new FormData(document.getElementById('form-filtros'));
    exportar(fd, 'pdf');
  });

  // --- Import Modal ---
  const importModal    = document.getElementById('modal-import');
  const btnImportModal = document.getElementById('btnImportModal');
  const importClose    = document.getElementById('importClose');
  const cancelImport   = document.getElementById('cancelImport');

  btnImportModal.addEventListener('click', () => {
    importModal.classList.add('show');
  });

  importClose.addEventListener('click', () => {
    importModal.classList.remove('show');
  });

  cancelImport.addEventListener('click', () => {
    importModal.classList.remove('show');
  });

  const formImport = document.getElementById('form-import-excel');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const importMessage = document.getElementById('importMessage');
  const importMsgText = document.getElementById('importMsgText');

  formImport.addEventListener('submit', e => {
    e.preventDefault();

    // limpa mensagens antigas
    importMessage.style.display = 'none';
    importMsgText.textContent = '';

    const formData = new FormData(formImport);
    const xhr = new XMLHttpRequest();

    xhr.open('POST', formImport.action, true);

    // mostra barra
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '0%';

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = percent + '%';
        progressText.textContent = percent + '%';
      }
    });

    xhr.onload = async () => {
      if (xhr.status === 200) {
        showImportMessage('Importação concluída com sucesso.', true);
        resetProgressBar();

        // Atualiza o modal sem fechar
        try {
          await refreshModalPage();
        } catch (err) {
          console.error('Erro ao atualizar modal após importação:', err);
        }

      } else {
        showImportMessage(
          'Erro ao importar arquivo: ' +
          (xhr.responseText || xhr.statusText),
          false
        );
        resetProgressBar();
      }
    };

    xhr.onerror = () => {
      showImportMessage('Falha na conexão ao enviar arquivo.', false);
      resetProgressBar();
    };

    xhr.send(formData);
  });

  // função para mostrar mensagem
  function showImportMessage(msg, success) {
    importMessage.style.display = 'block';
    importMsgText.textContent = msg;
    importMsgText.style.color = success ? 'green' : 'red';
  }

  // função para resetar barra
  function resetProgressBar() {
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    // opcional: esconder barra após 1s
    setTimeout(() => {
      progressContainer.style.display = 'none';
    }, 1000);
  }

  // fecha clicando fora
  window.addEventListener('click', e => {
    if (e.target === importModal) {
      importModal.classList.remove('show');
    }
  });

  window.addEventListener('load', () => {
  // Se a URL terminar com #modal-nfs, abra o modal automaticamente
    if (window.location.hash === '#modal-nfs') {
      const modalFiltros = document.getElementById('modal-nfs');
      if (modalFiltros) modalFiltros.classList.add('show');
    }
  });
});
