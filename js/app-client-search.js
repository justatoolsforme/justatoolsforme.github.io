'use strict';

(function initClientSearch() {
  const CLIENTS_STORAGE_KEY = 'tufi_clients_v3';
  const CURRENT_DRAFT_ID = '__current_form_draft__';
  const queryInput = document.getElementById('cs-query');
  const sourceSelect = document.getElementById('cs-source');
  const fieldSelect = document.getElementById('cs-field');
  const stageSelect = document.getElementById('cs-stage');
  const clearBtn = document.getElementById('cs-clear');
  const countEl = document.getElementById('cs-count');
  const resultsEl = document.getElementById('cs-results');
  const searchNavBtn = document.querySelector('.nav-btn[data-view="busqueda"]');

  if (!queryInput || !sourceSelect || !fieldSelect || !stageSelect || !clearBtn || !countEl || !resultsEl) return;

  let indexedClients = [];

  function getApi() {
    return window.TufiFormContact || null;
  }

  function normalizeText(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function getClientValue(client, key) {
    if (!client || typeof client !== 'object') return '';

    const fcValue = client[`fc-${key}`];
    if (fcValue !== undefined && fcValue !== null && String(fcValue).trim() !== '') return fcValue;

    const legacyValue = client[key];
    if (legacyValue !== undefined && legacyValue !== null) return legacyValue;

    return '';
  }

  function getClientEntities(client) {
    if (Array.isArray(client?._entidades)) return client._entidades;
    if (Array.isArray(client?.entidades)) return client.entidades;
    return [];
  }

  function getClientId(client) {
    return String(client?.id || client?.clientId || '');
  }

  function getClientDisplayName(client) {
    const displayName = String(client?.displayName || '').trim();
    if (displayName) return displayName;

    const fullName = `${getClientValue(client, 'nombres')} ${getClientValue(client, 'apellidos')}`.trim();
    if (fullName) return fullName;

    const cedula = String(getClientValue(client, 'cedula') || '').trim();
    if (cedula) return cedula;

    return 'Cliente sin nombre';
  }

  function getClientSource(client) {
    return String(getClientValue(client, 'origen') || 'WhatsApp').trim() || 'WhatsApp';
  }

  function getClientStage(client) {
    return String(client?.etapa || getClientValue(client, 'etapa') || 'EN_PROCESO').trim() || 'EN_PROCESO';
  }

  function loadStoredClients(api) {
    const apiClients = api?.clientsLoad?.();
    if (Array.isArray(apiClients) && apiClients.length) return apiClients;

    try {
      const storedClients = JSON.parse(localStorage.getItem(CLIENTS_STORAGE_KEY) || '[]');
      return Array.isArray(storedClients) ? storedClients : [];
    } catch {
      return Array.isArray(apiClients) ? apiClients : [];
    }
  }

  function buildCurrentDraftClient(api, clients) {
    if (typeof api?.formRead !== 'function' || typeof api?.fcHasMeaningfulData !== 'function') return null;

    const draft = api.formRead();
    if (!api.fcHasMeaningfulData(draft)) return null;

    const draftId = String(api.getActiveClientId?.() || draft._activeClientId || '');
    const draftCedula = normalizeText(draft['fc-cedula']);
    const alreadyIndexed = clients.some(client => {
      if (draftId && getClientId(client) === draftId) return true;

      const clientCedula = normalizeText(getClientValue(client, 'cedula'));
      return Boolean(draftCedula && clientCedula && clientCedula === draftCedula);
    });

    if (alreadyIndexed) return null;

    return {
      ...draft,
      id: CURRENT_DRAFT_ID,
      displayName: `${draft['fc-nombres'] || ''} ${draft['fc-apellidos'] || ''}`.trim() || draft['fc-cedula'] || 'Borrador actual',
      cedula: draft['fc-cedula'] || '',
      etapa: draft['fc-etapa'] || 'EN_PROCESO',
      savedAt: new Date().toISOString(),
      _searchDraft: true
    };
  }

  function buildFieldText(client) {
    return {
      all: normalizeText([
        getClientDisplayName(client),
        getClientSource(client),
        getClientValue(client, 'nombres'),
        getClientValue(client, 'apellidos'),
        getClientValue(client, 'cedula'),
        getClientValue(client, 'celular'),
        getClientValue(client, 'empresa'),
        getClientValue(client, 'ciudad-p'),
        getClientValue(client, 'ciudad-l'),
        getClientValue(client, 'barrio-p'),
        getClientValue(client, 'barrio-l'),
        getClientValue(client, 'direccion-p'),
        getClientValue(client, 'direccion-l'),
        getClientValue(client, 'referencias'),
        getClientValue(client, 'monto'),
        getClientValue(client, 'plazo'),
        getClientValue(client, 'cecot'),
        getClientValue(client, 'idempleador'),
        getClientStage(client),
        ...getClientEntities(client)
      ].join(' ')),
      nombres: normalizeText(getClientValue(client, 'nombres')),
      apellidos: normalizeText(getClientValue(client, 'apellidos')),
      cedula: normalizeText(getClientValue(client, 'cedula')),
      celular: normalizeText(getClientValue(client, 'celular')),
      salario: normalizeText(getClientValue(client, 'salario')),
      empresa: normalizeText(getClientValue(client, 'empresa')),
      origen: normalizeText(getClientSource(client)),
      ciudad: normalizeText([getClientValue(client, 'ciudad-p'), getClientValue(client, 'ciudad-l')].join(' ')),
      direccion: normalizeText([
        getClientValue(client, 'direccion-p'),
        getClientValue(client, 'direccion-l'),
        getClientValue(client, 'barrio-p'),
        getClientValue(client, 'barrio-l')
      ].join(' ')),
      referencias: normalizeText(getClientValue(client, 'referencias')),
      monto: normalizeText([getClientValue(client, 'monto'), getClientValue(client, 'plazo')].join(' ')),
      entidades: normalizeText(getClientEntities(client).join(' ')),
      ips: normalizeText([getClientValue(client, 'cecot'), getClientValue(client, 'idempleador')].join(' '))
    };
  }

  // Determine whether remote server actions should be visible:
  function isRemoteActive() {
    try {
      const cfg = (window.RemoteSync && window.RemoteSync.loadConfig) ? window.RemoteSync.loadConfig() : JSON.parse(localStorage.getItem('tufi_remote_config_v1') || '{}');
      if (!cfg || !cfg.enabled) return false;
      if (!cfg.pingpong) return false;
      const last = Number(cfg._lastPing || 0);
      if (!last) return false;
      return (Date.now() - last) <= (3 * 60 * 1000); // 3 minutes
    } catch (e) { return false; }
  }

  function indexClients() {
    const api = getApi();
    const storedClients = loadStoredClients(api);
    const draftClient = buildCurrentDraftClient(api, storedClients);
    const clients = draftClient ? [draftClient, ...storedClients] : storedClients;

    indexedClients = clients
      .map(client => ({
        client,
        fields: buildFieldText(client),
        savedAt: Date.parse(client.savedAt || 0) || 0
      }))
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  function formatDate(isoDate) {
    if (!isoDate) return 'Sin fecha';
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return 'Sin fecha';
    return date.toLocaleString('es-PY');
  }

  function getStageLabel(stage) {
    const api = getApi();
    return api?.stageLabelMap?.[stage] || stage || 'EN PROCESO';
  }

  function activateView(viewName) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    document.querySelectorAll('.view').forEach(view => {
      view.classList.toggle('active', view.id === `view-${viewName}`);
    });

    const main = document.getElementById('mainContent');
    if (main) main.scrollTop = 0;
  }

  function openClient(clientId) {
    if (clientId === CURRENT_DRAFT_ID) {
      activateView('formcontact');
      return;
    }

    const api = getApi();
    if (!api?.switchToClient) return;

    api.switchToClient(clientId);
    activateView('formcontact');
  }

  function buildResultCard(entry) {
    const client = entry.client;
    const source = getClientSource(client);
    const stage = getClientStage(client);
    const stageLabel = getStageLabel(stage);
    const sourceText = normalizeText(source);
    const sourceClass = sourceText.includes('facebook')
      ? 'source-facebook'
      : sourceText.includes('mercately')
        ? 'source-mercately'
        : 'source-whatsapp';
    const updatedLabel = client._searchDraft
      ? 'Borrador actual'
      : `Actualizado: ${formatDate(client.savedAt)}`;

    const showActions = isRemoteActive();

    return `
      <div class="search-card">
        <div class="search-card-top">
          <div class="search-card-title">${escapeHtml(getClientDisplayName(client))}</div>
          <div class="search-card-badges">
            <span class="search-card-badge ${sourceClass}">${escapeHtml(source)}</span>
            <span class="search-card-badge stage">${escapeHtml(stageLabel)}</span>
          </div>
        </div>
        <div class="search-card-grid">
          <div class="search-card-item">
            <div class="search-card-label">Cedula</div>
            <div class="search-card-value">${escapeHtml(getClientValue(client, 'cedula') || '—')}</div>
          </div>
          <div class="search-card-item">
            <div class="search-card-label">Celular</div>
            <div class="search-card-value">${escapeHtml(getClientValue(client, 'celular') || '—')}</div>
          </div>
          <div class="search-card-item">
            <div class="search-card-label">Empresa</div>
            <div class="search-card-value">${escapeHtml(getClientValue(client, 'empresa') || '—')}</div>
          </div>
          <div class="search-card-item">
            <div class="search-card-label">Salario</div>
            <div class="search-card-value">${escapeHtml(getClientValue(client, 'salario') || '—')}</div>
          </div>
          <div class="search-card-item">
            <div class="search-card-label">Ciudad</div>
            <div class="search-card-value">${escapeHtml(getClientValue(client, 'ciudad-p') || getClientValue(client, 'ciudad-l') || '—')}</div>
          </div>
        </div>
        <div class="search-card-footer">
          <span class="search-card-date">${escapeHtml(updatedLabel)}</span>
          <div class="search-card-actions">
            <button class="btn btn-secondary btn-sm search-open-btn" type="button" data-id="${escapeHtml(getClientId(client) || CURRENT_DRAFT_ID)}">${client._searchDraft ? 'Volver' : 'Abrir'}</button>
            <button class="btn btn-danger btn-sm search-delete-local-btn" type="button" data-id="${escapeHtml(getClientId(client) || '')}">Eliminar</button>
            ${showActions ? (`<button class="btn btn-danger btn-sm search-soft-delete-btn" type="button" data-id="${escapeHtml(getClientId(client) || '')}">Marcar Eliminado (Server)</button>`) : ''}
            ${showActions ? (`<button class="btn btn-warning btn-sm search-admin-delete-btn" type="button" data-id="${escapeHtml(getClientId(client) || '')}">Eliminar en servidor (Admin)</button>`) : ''}
          </div>
        </div>
      </div>
    `;
  }

  function renderResults() {
    const query = normalizeText(queryInput.value);
    const selectedSource = sourceSelect.value;
    const selectedField = fieldSelect.value;
    const selectedStage = stageSelect.value;

    const results = indexedClients.filter(entry => {
      const client = entry.client;
      const clientSource = getClientSource(client);
      const clientStage = getClientStage(client);

      if (selectedSource !== 'ALL' && normalizeText(clientSource) !== normalizeText(selectedSource)) return false;
      if (selectedStage !== 'ALL' && clientStage !== selectedStage) return false;
      if (!query) return true;

      // Special numeric comparison for salary: if searching in 'salario' and query is numeric,
      // return clients whose salary numeric value is >= query number.
      if (selectedField === 'salario') {
        const qDigits = query.replace(/[^0-9]/g, '');
        if (qDigits) {
          const qNum = parseInt(qDigits, 10);
          const salRaw = String(getClientValue(client, 'salario') || '');
          const sDigits = salRaw.replace(/[^0-9]/g, '');
          const sNum = sDigits ? parseInt(sDigits, 10) : NaN;
          if (!Number.isNaN(sNum)) return sNum >= qNum;
          return false;
        }
        // fallback to text match when query is not numeric
        const haystack = entry.fields['salario'] || '';
        return haystack.includes(query);
      }

      const haystack = selectedField === 'all'
        ? entry.fields.all
        : (entry.fields[selectedField] || '');

      return haystack.includes(query);
    });

    countEl.textContent = `${results.length} resultado${results.length === 1 ? '' : 's'}`;

    if (!indexedClients.length) {
      resultsEl.innerHTML = '<div class="search-empty">Todavia no hay clientes guardados para buscar.</div>';
      return;
    }

    if (!results.length) {
      resultsEl.innerHTML = '<div class="search-empty">No hubo coincidencias con esos filtros.</div>';
      return;
    }

    resultsEl.innerHTML = results.map(buildResultCard).join('');
    resultsEl.querySelectorAll('.search-open-btn').forEach(button => {
      button.addEventListener('click', () => openClient(button.dataset.id));
    });

    // Local delete (remove saved client from localStorage) — ask confirmation
    resultsEl.querySelectorAll('.search-delete-local-btn').forEach(button => {
      button.addEventListener('click', () => {
        const id = String(button.dataset.id || '');
        if (!id) { showToast('⚠ Cliente no encontrado'); return; }
        if (id === CURRENT_DRAFT_ID) { showToast('⚠ No se puede eliminar el borrador actual'); return; }
        if (!confirm('¿Estás seguro que deseas eliminar este cliente localmente?')) return;
        try {
          const arr = JSON.parse(localStorage.getItem(CLIENTS_STORAGE_KEY) || '[]');
          const idx = arr.findIndex(c => String(c.id) === id || String(c.clientId || '') === id);
          if (idx === -1) { showToast('⚠ Cliente no encontrado'); return; }
          arr.splice(idx, 1);
          localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(arr));
          window.dispatchEvent(new Event('tufi:clients-changed'));
          showToast('✓ Cliente eliminado localmente');
        } catch (e) { showToast('⚠ Error al eliminar'); }
      });
    });

    // Soft-delete (mark as deleted on server but keep locally) — ask confirmation
    resultsEl.querySelectorAll('.search-soft-delete-btn').forEach(button => {
      button.addEventListener('click', async () => {
        if (!confirm('¿Estás seguro que deseas marcar este cliente como eliminado en el servidor?')) return;
        const id = button.dataset.id;
        const client = indexedClients.find(e => (String(e.client.id) === id)).client;
        if (!client) { showToast('⚠ Cliente no encontrado'); return; }
        if (!window.RemoteSync) { showToast('⚠ RemoteSync no disponible'); return; }
        const ok = await window.RemoteSync.softDelete(client);
        if (ok) showToast('✓ Cliente marcado como eliminado en servidor');
        else showToast('⚠ No se pudo marcar eliminado en servidor');
      });
    });

    // Admin-delete (permanent) - requires admin token
    resultsEl.querySelectorAll('.search-admin-delete-btn').forEach(button => {
      button.addEventListener('click', async () => {
        if (!confirm('¿Estás seguro que deseas eliminar este cliente en el servidor? Esta acción es irreversible.')) return;
        const id = button.dataset.id;
        const client = indexedClients.find(e => (String(e.client.id) === id)).client;
        if (!client) { showToast('⚠ Cliente no encontrado'); return; }
        if (!window.RemoteSync) { showToast('⚠ RemoteSync no disponible'); return; }
        const isAdmin = await (window.RemoteSync.testAdmin ? window.RemoteSync.testAdmin() : Promise.resolve(false));
        if (!isAdmin) { showToast('⚠ Token no tiene permisos de administrador'); return; }
        const ok = await window.RemoteSync.adminDelete(client);
        if (ok) showToast('✓ Cliente eliminado en servidor (admin)');
        else showToast('⚠ No se pudo eliminar en servidor');
      });
    });
  }

  function refreshSearch() {
    indexClients();
    renderResults();
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  [queryInput, sourceSelect, fieldSelect, stageSelect].forEach(control => {
    control.addEventListener('input', renderResults);
    control.addEventListener('change', renderResults);
  });

  clearBtn.addEventListener('click', () => {
    queryInput.value = '';
    sourceSelect.value = 'ALL';
    fieldSelect.value = 'all';
    stageSelect.value = 'ALL';
    renderResults();
  });

  searchNavBtn?.addEventListener('click', refreshSearch);
  window.addEventListener('tufi:clients-changed', refreshSearch);

  refreshSearch();
})();
