document.addEventListener('DOMContentLoaded', () => {
  'use strict';

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
  const baseInput = document.getElementById('prodBaseInput');
  const baseList  = document.getElementById('prodBaseList');
  let selectedBase = '';
  let suppressRowHandler = false;

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
    if (!produtosList) return;
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
        const opts = baseList ? Array.from(baseList.children)
          .map(li => `<li data-value="${li.dataset.value}">${li.textContent}</li>`)
          .join('') : '';
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
        if (dd) {
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
        }

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
  if (addBtn) {
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
      if (baseInput) baseInput.querySelector('.placeholder').textContent = 'Selecione';
      selectedBase = '';
    });
  }

  // --- injetar hidden inputs antes de enviar NF ---
  if (form) {
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
  }

  // --- Máscara de CNPJ/CPF ---
  const cnpjCpfInput = document.getElementById('cnpj_nf');
  if (cnpjCpfInput) {
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
  }

  // --- Formatação de Peso inline no formulário principal ---
  const pesoInput = document.getElementById('prodPeso');
  if (pesoInput) {
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
      raw = raw.padStart(4, '0');
      const intPart = raw.slice(0, -3);
      const decPart = raw.slice(-3);
      const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      e.target.value = `${intFormatted},${decPart}`;
    });
  }

  if (cnpjCpfInput) {
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
  }

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

    if (json.rows.length > 0) {
      currentPage = nextPage;
    }
    totalPages = json.total_pages;

    json.rows.slice(0, count).forEach(item => {
      const trNew = document.createElement('tr');
      trNew.dataset.id  = item.id;
      trNew.dataset.obs = item.observacao;

      // define dataset.read com prioridade para valor vindo do servidor
      if (typeof item.lida !== 'undefined') {
        trNew.dataset.read = item.lida ? '1' : '0';
      } else {
        trNew.dataset.read = (localStorage.getItem(`nfRead_${item.id}`) === 'true') ? '1' : '0';
      }

      trNew.innerHTML = `
        <td><input type="checkbox" class="select-row"></td>
        <td>${item.data}</td>
        <td>${item.numero_nf}</td>
        <td>${item.cliente}</td>
        <td>${item.cnpj_cpf}</td>
        <td class="col-actions"></td>
      `;
      modalTbody.appendChild(trNew);
      // anexa handler de seleção
      attachRowSelectionHandler(trNew);
    });

    console.log(`Carregados ${Math.min(count, json.rows.length)} linhas da página ${currentPage}.`);
  }

  // --- FUNÇÃO DE RECARREGAR PÁGINA DO MODAL ---
  async function refreshModalPage() {
    // 1) limpa todas as linhas atuais
    if (!modalTbody) return;
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

      // define dataset.read com prioridade para valor vindo do servidor
      if (typeof item.lida !== 'undefined') {
        tr.dataset.read = item.lida ? '1' : '0';
      } else {
        tr.dataset.read = (localStorage.getItem(`nfRead_${item.id}`) === 'true') ? '1' : '0';
      }

      const primeiro = item.produtos[0] || { nome: '', peso: 0, base: '' };

      const pesoFmt = Number(primeiro.peso || 0)
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
      // garante que cada linha adicionada tenha o handler de seleção
      attachRowSelectionHandler(tr);
    });

    // 5) reaplica todos os event listeners
    setupNFList();

    // NOTA: não limpamos mais o checkbox do cabeçalho nem escondemos o botão aqui,
    // porque queremos que o estado persistido (localStorage) controle a visibilidade
    // ao navegar entre páginas. A restauração é feita abaixo.

    // restaura seleção persistida (se houver)
    restoreSelections();
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

  function clearSelectionsOnClose() {
    // limpa persistência
    try { localStorage.removeItem(SELECT_KEY); } catch(e){}
    try { localStorage.removeItem(SELECT_ALL_KEY); } catch(e){}

    // limpa flag em memória
    selectAllGlobal = false;

    // desmarca checkboxes visíveis
    document.querySelectorAll('#modal-nfs tbody .select-row')
      .forEach(cb => cb.checked = false);

    // desmarca checkbox do cabeçalho (se existir)
    const headerCb = document.getElementById('selectAll');
    if (headerCb) headerCb.checked = false;

    // esconde botão excluir e limpa agregados/totais
    if (deleteBtn) deleteBtn.style.display = 'none';
    clearAggregatedTotalsDisplay();
  }

  function closeModal() {
    // limpa campo de busca
    const searchInput = document.getElementById('campo-pesquisa');
    if (searchInput) {
      searchInput.value = '';
    }

    // limpa seleção sempre que o modal for fechado
    clearSelectionsOnClose();

    // limpa hash/query string relacionada ao modal
    const url = new URL(window.location.href);
    url.searchParams.delete('modal');
    url.searchParams.delete('search');
    url.hash = '';
    history.replaceState(null, '', url.pathname + url.search);

    // fecha o modal (classe visual)
    modalNfs.classList.remove('show');

    // mantém comportamento anterior: envia o form de pesquisa ou recarrega a página
    const form = document.getElementById('form-pesquisa');
    if (form) {
      form.submit();
    } else {
      // recarrega a página para pegar estado atualizado do servidor
      location.reload();
    }
  }

  fecharModalBtn.addEventListener('click', closeModal);
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // >>> inserir essa função utilitária em um lugar global após modalTbody ser definido
  function setObsForAllRows(nfId, obsValue) {
    const rows = document.querySelectorAll(`#modal-nfs tbody tr[data-id="${nfId}"]`);
    rows.forEach(r => {
      if (obsValue && obsValue.trim() !== '') {
        r.dataset.obs = obsValue;
        // marca como "não lida" via atributo (prioritário sobre localStorage)
        r.dataset.read = '0';
        try { localStorage.removeItem(`nfRead_${nfId}`); } catch (e) { /* swallow */ }
      } else {
        // remove atributo quando não há observação
        delete r.dataset.obs;
        // ausência de observação -> não faz sentido ter flag de leitura
        delete r.dataset.read;
        try { localStorage.removeItem(`nfRead_${nfId}`); } catch (e) { /* swallow */ }
      }
    });
  }

  // marca a observação em todas as linhas como "lida" (🔕)
  function markObsRead(nfId) {
    const key = `nfRead_${nfId}`;
    try { localStorage.setItem(key, 'true'); } catch(e){}
    document.querySelectorAll(`#modal-nfs tbody tr[data-id="${nfId}"]`).forEach(r => {
      r.dataset.read = '1';
      const btn = r.querySelector('.obs-icon');
      if (btn) btn.textContent = '🔕';
    });
  }

  function markObsUnread(nfId) {
    const key = `nfRead_${nfId}`;
    try { localStorage.removeItem(key); } catch(e){}
    document.querySelectorAll(`#modal-nfs tbody tr[data-id="${nfId}"]`).forEach(r => {
      r.dataset.read = '0';
      const btn = r.querySelector('.obs-icon');
      if (btn) btn.textContent = '🔔';
    });
  }

  // --- SETUP do conteúdo do modal ---
  function setupNFList() {
    document.querySelectorAll('#modal-nfs tbody tr[data-id]').forEach(tr => {
      const nfId    = tr.dataset.id;
      let obs       = tr.dataset.obs ? tr.dataset.obs.trim() : '';
      const actions = tr.querySelector('.col-actions');
      actions.innerHTML = '';

      // 1) Sino de observação (quando já existe obs)
      if (obs) {
        const key   = `nfRead_${nfId}`;
        // prioridade: dataset.read (se definido) -> localStorage -> default false
        let read;
        if (typeof tr.dataset.read !== 'undefined') {
          read = tr.dataset.read === '1';
        } else {
          read = localStorage.getItem(key) === 'true';
        }

        const bell  = document.createElement('span');
        bell.className   = 'icon obs-icon';
        bell.title       = 'Ver Observação';
        bell.textContent = read ? '🔕' : '🔔';
        bell.style.cursor = 'pointer';
        bell.addEventListener('click', () => {
          // re-evalua o estado atual (priorizando dataset)
          const currentRead = (typeof tr.dataset.read !== 'undefined') ? tr.dataset.read === '1' : (localStorage.getItem(key) === 'true');
          if (!currentRead) {
            markObsRead(nfId);
          }

          const modal = document.getElementById('modal-obs');
          const view = modal.querySelector('#view-mode');
          const edit = modal.querySelector('#edit-mode');
          const text = modal.querySelector('#modalObsText');
          const input = modal.querySelector('#modalObsInput');
          const btnEdit = modal.querySelector('#btnEditObs');
          const btnSave = modal.querySelector('#btnSaveObs');
          const btnDel = modal.querySelector('#btnDeleteObs');

          text.textContent = obs;
          view.style.display = 'block';
          edit.style.display = 'none';
          btnEdit.style.display = 'inline-block';
          btnSave.style.display = 'none';
          btnDel.style.display = 'inline-block';
          modal.classList.add('show');

          btnEdit.onclick = () => {
            input.value = obs;
            view.style.display = 'none';
            edit.style.display = 'block';
            btnEdit.style.display = 'none';
            btnSave.style.display = 'inline-block';
          };

          btnSave.onclick = async () => {
            const novaObs = input.value.trim();
            const resp = await fetch(`${window.location.pathname}/observacao/${nfId}`, {
              method: 'POST',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify({observacao: novaObs})
            });
            if (!resp.ok) return alert('Erro ao salvar observação.');

            // atualiza TODAS as linhas e marca como "não lida" (porque foi alterada)
            setObsForAllRows(nfId, novaObs);
            markObsUnread(nfId);
            obs = novaObs;

            modal.classList.remove('show');
            setupNFList();
          };

          btnDel.onclick = async () => {
            if (!confirm('Deseja realmente excluir esta observação?')) return;
            const resp = await fetch(`${window.location.pathname}/observacao/${nfId}`, {
              method: 'DELETE'
            });
            if (!resp.ok) return alert('Erro ao excluir observação.');

            // limpa a obs em todas as linhas e marca como "não lida" (ou apenas remove a flag)
            setObsForAllRows(nfId, '');
            try { localStorage.removeItem(`nfRead_${nfId}`); } catch(e){}
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

        view.style.display     = 'none';
        edit.style.display     = 'block';
        btnEdit.style.display  = 'none';
        btnSave.style.display  = 'inline-block';
        btnDel.style.display   = obs ? 'inline-block' : 'none';
        input.value            = obs;
        modal.classList.add('show');

        btnSave.onclick = async () => {
          const novaObs = input.value.trim();
          if (!novaObs) return alert('Observação não pode ficar vazia.');
          const resp = await fetch(`${window.location.pathname}/observacao/${nfId}`, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({observacao: novaObs})
          });
          if (!resp.ok) return alert('Erro ao salvar.');

          setObsForAllRows(nfId, novaObs);
          obs = novaObs;
          localStorage.removeItem(`nfRead_${nfId}`);
          modal.classList.remove('show');
          setupNFList();
        };

        btnDel.onclick = async () => {
          if (!confirm('Excluir observação?')) return;
          const resp = await fetch(`${window.location.pathname}/observacao/${nfId}`, {
            method: 'DELETE'
          });
          if (!resp.ok) return alert('Erro ao excluir.');
          setObsForAllRows(nfId, '');
          obs = '';
          modal.classList.remove('show');
          setupNFList();
        };
      });
      actionMenu.append(noteIcon);

      // edit & delete icons (stubs/you can fill server calls)
      const editIcon = document.createElement('span');
      editIcon.className   = 'icon edit-icon';
      editIcon.title       = 'Editar';
      editIcon.textContent = '✏️';
      actionMenu.append(editIcon);

      const delIcon = document.createElement('span');
      delIcon.className   = 'icon delete-icon';
      delIcon.title       = 'Excluir';
      delIcon.textContent = '🗑️';
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

        const atData = tds[1].textContent.trim().split('/');
        tds[1].innerHTML = `<input type="date" value="${atData[2]}-${atData[1].padStart(2,'0')}-${atData[0].padStart(2,'0')}">`;

        const atNf = tds[2].textContent.trim();
        tds[2].innerHTML = `<input type="text" value="${atNf}" style="width:60px">`;

        const nomeAt  = tds[3].textContent.trim();
        tds[3].innerHTML = `<input type="text" value="${nomeAt}" style="width:100%">`;

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

        const cliAt = tds[5].textContent.trim();
        tds[5].innerHTML = `<input type="text" value="${cliAt}" style="width:120px">`;

        const cnpjAt = tds[6].textContent.trim();
        tds[6].innerHTML = `<input type="text" value="${cnpjAt}" style="width:120px">`;

        const cnpjInput = tds[6].querySelector('input');
        cnpjInput.addEventListener('input', () => {
          let val = cnpjInput.value.replace(/\D/g, '');
          if (val.length <= 11) {
            val = val.replace(/(\d{3})(\d)/, '$1.$2');
            val = val.replace(/(\d{3})(\d)/, '$1.$2');
            val = val.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
          } else {
            val = val.replace(/^(\d{2})(\d)/, '$1.$2');
            val = val.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
            val = val.replace(/\.(\d{3})(\d)/, '.$1/$2');
            val = val.replace(/(\d{4})(\d{1,2})$/, '$1-$2');
          }
          cnpjInput.value = val;
        });

        const baseAt = tds[7].textContent.trim();
        const optsM = baseList ? Array.from(baseList.children)
          .map(li => `<li data-value="${li.dataset.value}">${li.textContent}</li>`)
          .join('') : '';
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
        if (ddM) {
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
        }

        tds[8].innerHTML = '';
        const saveIcon = document.createElement('span');
        saveIcon.className   = 'icon save-icon';
        saveIcon.title       = 'Salvar';
        saveIcon.textContent = '💾';
        tds[8].appendChild(saveIcon);

        const cancelIcon = document.createElement('span');
        cancelIcon.className = 'icon cancel-icon';
        cancelIcon.title     = 'Cancelar edição';
        cancelIcon.textContent = '❌';
        cancelIcon.style.marginLeft = '8px';
        tds[8].appendChild(cancelIcon);

        cancelIcon.addEventListener('click', () => {
          tds[1].textContent = oldValues.data;
          tds[2].textContent = oldValues.nf;
          tds[3].innerHTML   = `<div class="multiline-ellipsis" title="${oldValues.produto}">${oldValues.produto}</div>`;
          tds[4].textContent = oldValues.peso;
          tds[5].innerHTML   = `<div class="multiline-ellipsis" title="${oldValues.cliente}">${oldValues.cliente}</div>`;
          tds[6].innerHTML   = `<div class="multiline-ellipsis" title="${oldValues.cnpj}">${oldValues.cnpj}</div>`;
          tds[7].innerHTML   = `<div class="multiline-ellipsis" title="${oldValues.base}">${oldValues.base}</div>`;
          setupNFList();
        });

        saveIcon.addEventListener('click', async () => {
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
          await refreshModalPage();
        } catch (err) {
          alert(err.message);
          console.error(err);
        }
      });
    });

    // Após montar o loop, garante que restoreSelections será chamado por quem chamou setupNFList()
  }

  // --- Exclusão em massa no modal ---
  const deleteBtn = document.getElementById('deleteSelectedBtn');
  const selectAll = document.getElementById('selectAll');

  function updateDeleteBtnVisibility() {
    // agora considera seleção global ou ids persistidos
    const anyChecked = Array.from(document.querySelectorAll('#modal-nfs tbody .select-row'))
      .some(checkbox => checkbox.checked);

    const persistedIds = (function(){ try { return JSON.parse(localStorage.getItem('modalSelectedNFIds')||'[]'); } catch (e) { return []; } })();
    const hasPersisted = persistedIds && persistedIds.length > 0;
    const selectAllFlag = localStorage.getItem('modalSelectAllGlobal') === '1';

    const shouldShow = anyChecked || hasPersisted || selectAllFlag;

    if (deleteBtn) deleteBtn.style.display = shouldShow ? 'inline-block' : 'none';
  }

  // === Funções de parsing/formatacao ===
  function parsePesoTextToNumber(text) {
    if (!text) return 0;
    let t = String(text).trim();
    t = t.replace(/[^\d,.-]/g, '');
    t = t.replace(/\.(?=\d{3}([,\.]|$))/g, '');
    t = t.replace(',', '.');
    const n = parseFloat(t);
    return isNaN(n) ? 0 : n;
  }

  function formatPesoShort(n) {
    if (Math.abs(n - Math.round(n)) < 0.0005) {
      return String(Math.round(n));
    }
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }

  // === Função principal: agrega por base_produto e mostra total geral (somente linhas marcadas na página atual) ===
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

    const map = {};
    let totalGeral = 0;

    selectedBoxes.forEach(cb => {
      const tr = cb.closest('tr');
      if (!tr) return;
      const baseCell = tr.children[7];
      const pesoCell = tr.children[4];
      const base = baseCell ? baseCell.textContent.trim() : 'Sem Base';
      const pesoTxt = pesoCell ? pesoCell.textContent.trim() : '0';
      const pesoNum = parsePesoTextToNumber(pesoTxt);
      if (!map[base]) map[base] = 0;
      map[base] += pesoNum;
      totalGeral += pesoNum;
    });

    let html = '<div style="display:flex; flex-direction:column; gap:6px;">';
    for (const base of Object.keys(map)) {
      const soma = map[base];
      if (Math.abs(soma) < 1e-9) continue;
      html += `<div style="font-weight:700;">${base} ${formatPesoShort(soma)}</div>`;
    }

    html += `<div style="margin-top:6px; border-top:1px dashed #e6e6e6; padding-top:6px; font-weight:800;">
              Total ${formatPesoShort(totalGeral)}
            </div>`;
    html += '</div>';

    contentEl.innerHTML = html;
    totalsEl.style.display = 'block';
  }

  // --- FUNÇÃO: atualiza agregados com base na seleção persistida (chama servidor) ---
  async function updateAggregatesForSelection() {
    const selectedIds = loadSelectedIds();
    const selectAllStored = loadSelectAllFlag();

    // se a seleção for "todas as páginas", pedir agregados globais
    if (selectAllStored) {
      try {
        const params = new URLSearchParams();
        params.append('all', '1');
        const resp = await fetch(`/saida_nf/agregacao_selecao?${params.toString()}`, {
          headers: {'X-Requested-With': 'XMLHttpRequest'}
        });
        if (!resp.ok) throw new Error('Erro ao obter agregados do servidor');
        const json = await resp.json();
        renderAggregatesFromServer(json);
        return;
      } catch (err) {
        console.error(err);
        renderAggregatesFromServer(null);
        return;
      }
    }

    // se houver ids persistidos, solicitar agregados apenas para eles
    if (selectedIds && selectedIds.length > 0) {
      try {
        const qs = new URLSearchParams();
        qs.append('ids', selectedIds.join(','));
        const resp = await fetch(`/saida_nf/agregacao_selecao?${qs.toString()}`, {
          headers: {'X-Requested-With': 'XMLHttpRequest'}
        });
        if (!resp.ok) throw new Error('Erro ao obter agregados do servidor');
        const json = await resp.json();
        renderAggregatesFromServer(json);
        return;
      } catch (err) {
        console.error(err);
        showAggregatedByBase();
        return;
      }
    }

    // sem persistência: calcula apenas pela página atual (comportamento antigo)
    showAggregatedByBase();
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
    Integração com seleções e persistência (localStorage)
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

  // estado global para seleção "todas as páginas"
  let selectAllGlobal = false;

  // LOCALSTORAGE KEYS
  const SELECT_KEY = 'modalSelectedNFIds';
  const SELECT_ALL_KEY = 'modalSelectAllGlobal';

  // carregar/salvar array de ids
  function loadSelectedIds() {
    try {
      const raw = localStorage.getItem(SELECT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveSelectedIds(arr) {
    localStorage.setItem(SELECT_KEY, JSON.stringify(Array.from(new Set(arr))));
  }

  // helpers
  function hasSelectedId(id) {
    const arr = loadSelectedIds();
    return arr.indexOf(String(id)) !== -1;
  }
  function addSelectedId(id) {
    const arr = loadSelectedIds().map(String);
    if (!arr.includes(String(id))) {
      arr.push(String(id));
      saveSelectedIds(arr);
    }
  }
  function removeSelectedId(id) {
    let arr = loadSelectedIds().map(String);
    arr = arr.filter(x => x !== String(id));
    saveSelectedIds(arr);
  }

  // salvar / ler flag selectAllGlobal
  function saveSelectAllFlag(val) {
    if (val) localStorage.setItem(SELECT_ALL_KEY, '1');
    else localStorage.removeItem(SELECT_ALL_KEY);
  }
  function loadSelectAllFlag() {
    return localStorage.getItem(SELECT_ALL_KEY) === '1';
  }

  // função que renderiza totais vindos do servidor
  function renderAggregatesFromServer(aggObj) {
    const totalsEl = document.getElementById('selectedTotals');
    const contentEl = document.getElementById('totalsContent');
    if (!totalsEl || !contentEl) return;

    if (!aggObj || !aggObj.totals || Object.keys(aggObj.totals).length === 0) {
      totalsEl.style.display = 'none';
      contentEl.innerHTML = '';
      return;
    }

    let html = '<div style="display:flex; flex-direction:column; gap:6px;">';
    for (const base of Object.keys(aggObj.totals)) {
      const soma = aggObj.totals[base];
      if (Math.abs(soma) < 1e-9) continue;
      html += `<div style="font-weight:700;">${base} ${formatPesoShort(soma)}</div>`;
    }
    html += `<div style="margin-top:6px; border-top:1px dashed #e6e6e6; padding-top:6px; font-weight:800;">
               Total ${formatPesoShort(aggObj.total || 0)}
             </div>`;
    html += '</div>';

    contentEl.innerHTML = html;
    totalsEl.style.display = 'block';
  }

  // attachRowSelectionHandler: liga listener a uma linha e mantém localStorage atualizado
  function attachRowSelectionHandler(tr) {
    const id = String(tr.dataset.id);
    const cb = tr.querySelector('.select-row');
    if (!cb) return;

    // inicialmente marca conforme estado salvo (útil se setupNFList criar checkboxes)
    if (hasSelectedId(id) || loadSelectAllFlag()) {
      cb.checked = true;
    }

    // remove listener antigo, se houver
    if (cb._persistHandler) cb.removeEventListener('change', cb._persistHandler);

    const handler = (e) => {
      // Se estamos suprimindo handlers (mudança programática), não persistir alterações
      if (suppressRowHandler) return;

      const checked = e.target.checked;
      if (checked) {
        addSelectedId(id);
      } else {
        removeSelectedId(id);
      }

      // se usuário marcou/desmarcou individualmente, descartamos selectAllGlobal
      if (loadSelectAllFlag() && !checked) {
        saveSelectAllFlag(false);
        selectAllGlobal = false;
        const headerCb = document.getElementById('selectAll');
        if (headerCb) headerCb.checked = false;
      }

      updateDeleteBtnVisibility();

      // Atualiza SOMENTE pelo que está visível/selecionado na página atual.
      showAggregatedByBase();
    };

    cb.addEventListener('change', handler);
    cb._persistHandler = handler;
  }

  // restaura seleção salva (marca checkboxes de acordo)
  function restoreSelections() {
    const selectedIds = loadSelectedIds().map(String);
    const selectAllStored = loadSelectAllFlag();
    document.querySelectorAll('#modal-nfs tbody tr[data-id]').forEach(tr => {
      const id = String(tr.dataset.id);
      const cb = tr.querySelector('.select-row');
      if (!cb) return;
      cb.checked = selectAllStored || selectedIds.includes(id) || cb.checked;
    });

    // se existe selectAll armazenado, atualiza checkbox do cabeçalho
    const headerCb = document.getElementById('selectAll');
    if (headerCb) headerCb.checked = selectAllStored;

    // atualiza visibilidade do botão e totais
    updateDeleteBtnVisibility();
    showAggregatedByBase();
  }

  // 1) selectAll com comportamento "todas as páginas"
  const selectAllCheckbox = document.getElementById('selectAll');
  if (selectAllCheckbox) {
    // restaura valor salvo quando inicializar (útil ao abrir modal)
    if (loadSelectAllFlag()) {
      selectAllCheckbox.checked = true;
      selectAllGlobal = true;
    }

    selectAllCheckbox.addEventListener('change', async (e) => {
      const checked = e.target.checked;

      if (checked) {
        // ativa seleção global
        saveSelectedIds([]);           // limpa ids individuais
        saveSelectAllFlag(true);       // grava flag global
        selectAllGlobal = true;

        // marca visualmente todos os checkboxes sem disparar persistência
        suppressRowHandler = true;
        document.querySelectorAll('#modal-nfs tbody .select-row').forEach(cb => cb.checked = true);
        suppressRowHandler = false;

        // atualiza UI e agregados (server)
        updateDeleteBtnVisibility();
        await updateAggregatesForSelection();
      } else {
        // limpa TODAS as seleções
        saveSelectedIds([]);
        saveSelectAllFlag(false);
        selectAllGlobal = false;

        suppressRowHandler = true;
        document.querySelectorAll('#modal-nfs tbody .select-row').forEach(cb => cb.checked = false);
        suppressRowHandler = false;

        // garante header desmarcado (já vem do evento) e atualiza UI
        updateDeleteBtnVisibility();
        clearAggregatedTotalsDisplay();
      }
    });
  }

  // 2) mudança em qualquer checkbox de linha - delegação para tbody (mantemos, mas também usamos attachRowSelectionHandler para cada tr)
  document.querySelectorAll('#modal-nfs tbody').forEach(tbody => {
    tbody.addEventListener('change', e => {
      if (e.target.matches('.select-row')) {
        if (selectAllGlobal) {
          selectAllGlobal = false;
          const selectAllCheckbox = document.getElementById('selectAll');
          if (selectAllCheckbox) selectAllCheckbox.checked = false;
          renderAggregatesFromServer(null);
        }
        updateDeleteBtnVisibility();
        showAggregatedByBase();
      }
    });
  });

  // 3) limpeza após recarregar modal — listener
  window.addEventListener('modalRefreshCleanup', clearAggregatedTotalsDisplay);

  // fechar modal de observação
  const modalObsClose = document.getElementById('modalObsClose');
  if (modalObsClose) {
    modalObsClose.addEventListener('click', () =>
      document.getElementById('modal-obs').classList.remove('show')
    );
  }

  setupNFList();

  // Após setup, anexa handlers às linhas já existentes e restaura seleção
  document.querySelectorAll('#modal-nfs tbody tr[data-id]').forEach(tr => attachRowSelectionHandler(tr));
  restoreSelections();

  // --- FILTRO de busca no modal ---
  const input = document.getElementById('searchNfInput');
  const base  = window.location.pathname;

  function doSearch() {
    const term = input.value.trim();
    const params = new URLSearchParams();

    params.set('page',  '1');
    params.set('modal', '1');

    if (term) {
      params.set('search', term);
    }

    window.location.href = `${base}?${params.toString()}#modal-nfs`;
  }

  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSearch();
      }
    });
  }

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

  if (btnOpenFilter) btnOpenFilter.addEventListener('click', () =>
    modalFiltros.classList.add('show')
  );
  if (btnCloseFilter) btnCloseFilter.addEventListener('click', () =>
    modalFiltros.classList.remove('show')
  );
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') modalFiltros.classList.remove('show');
  });

  // --- EXPORTAÇÃO FILTRADA ---
  async function exportar(formData, tipo) {
    const params = new URLSearchParams();
    for (const [k, v] of formData.entries()) {
      if (v.trim()) params.append(k, v);
    }
    params.append('tipo', tipo);
    window.location = `/saida_nf/exportar_filtrado?${params.toString()}`;
  }

  const btnExportExcel = document.getElementById('btnExportExcel');
  const btnExportPdf = document.getElementById('btnExportPdf');
  if (btnExportExcel) btnExportExcel.addEventListener('click', () => {
    const fd = new FormData(document.getElementById('form-filtros'));
    exportar(fd, 'excel');
  });
  if (btnExportPdf) btnExportPdf.addEventListener('click', () => {
    const fd = new FormData(document.getElementById('form-filtros'));
    exportar(fd, 'pdf');
  });

  // --- Import Modal ---
  const importModal    = document.getElementById('modal-import');
  const btnImportModal = document.getElementById('btnImportModal');
  const importClose    = document.getElementById('importClose');
  const cancelImport   = document.getElementById('cancelImport');

  if (btnImportModal) btnImportModal.addEventListener('click', () => {
    if (importModal) importModal.classList.add('show');
  });
  if (importClose) importClose.addEventListener('click', () => {
    if (importModal) importModal.classList.remove('show');
  });
  if (cancelImport) cancelImport.addEventListener('click', () => {
    if (importModal) importModal.classList.remove('show');
  });

  const formImport = document.getElementById('form-import-excel');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const importMessage = document.getElementById('importMessage');
  const importMsgText = document.getElementById('importMsgText');

  if (formImport) {
    formImport.addEventListener('submit', e => {
      e.preventDefault();

      if (importMessage) {
        importMessage.style.display = 'none';
      }
      if (importMsgText) importMsgText.textContent = '';

      const formData = new FormData(formImport);
      const xhr = new XMLHttpRequest();

      xhr.open('POST', formImport.action, true);

      if (progressContainer && progressBar && progressText) {
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
      }

      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable && progressBar && progressText) {
          const percent = Math.round((e.loaded / e.total) * 100);
          progressBar.style.width = percent + '%';
          progressText.textContent = percent + '%';
        }
      });

      xhr.onload = async () => {
        if (xhr.status === 200) {
          showImportMessage('Importação concluída com sucesso.', true);
          resetProgressBar();

          if (importModal) importModal.classList.remove('show');

          // força recarregar a página inteira — preserva querystring atual
          window.location.href = window.location.pathname + window.location.search;
        } else {
          showImportMessage(
            'Erro ao importar arquivo: ' + (xhr.responseText || xhr.statusText),
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
  }

  // função para mostrar mensagem
  function showImportMessage(msg, success) {
    if (!importMessage || !importMsgText) return;
    importMessage.style.display = 'block';
    importMsgText.textContent = msg;
    importMsgText.style.color = success ? 'green' : 'red';
  }

  // função para resetar barra
  function resetProgressBar() {
    if (!progressBar || !progressText) return;
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    setTimeout(() => {
      if (progressContainer) progressContainer.style.display = 'none';
    }, 1000);
  }

  // fecha clicando fora
  window.addEventListener('click', e => {
    if (e.target === importModal) {
      if (importModal) importModal.classList.remove('show');
    }
  });

  window.addEventListener('load', () => {
    if (window.location.hash === '#modal-nfs') {
      const modalFiltros = document.getElementById('modal-nfs');
      if (modalFiltros) modalFiltros.classList.add('show');
    }
  });

  // --- Exclusão em massa: usa selectAllGlobal ao invés de somente selectAll.checked ---
  if (deleteBtn) {
    
deleteBtn.addEventListener('click', async () => {
      const allChecked = selectAllGlobal || (selectAll && selectAll.checked);
      const term       = (document.getElementById('searchNfInput') || { value: '' }).value.trim();

      let payload;

      if (allChecked) {
        const confirmMsg = term
          ? `Excluir TODAS as NFs que batem em “${term}”?`
          : 'Excluir TODAS as NFs cadastradas?';
        if (!confirm(confirmMsg)) return;
        payload = { all: true, search: term };
      } else {
        const persisted = loadSelectedIds();
        let ids = [];
        if (persisted && persisted.length > 0) {
          ids = persisted;
        } else {
          const checkedBoxes = Array.from(
            document.querySelectorAll('#modal-nfs tbody .select-row:checked')
          );
          ids = checkedBoxes.map(cb => cb.closest('tr').dataset.id);
        }
        if (!ids.length) return;
        if (!confirm(`Excluir ${ids.length} NF(s) selecionada(s) (de todas as páginas)?`)) return;
        payload = { ids };
      }

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

        await refreshModalPage();

        if (selectAll) selectAll.checked = false;
        if (deleteBtn) deleteBtn.style.display = 'none';

        // limpa seleção persistida - importante para não manter ids que já foram deletados
        localStorage.removeItem(SELECT_KEY);
        localStorage.removeItem(SELECT_ALL_KEY);
        selectAllGlobal = false;

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
  }
});
