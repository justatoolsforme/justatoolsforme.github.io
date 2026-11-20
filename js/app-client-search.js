'use strict';

(function initClientSearch() {
  const CLIENTS_STORAGE_KEY = 'tufi_clients_v3';
  const CURRENT_DRAFT_ID = '__current_form_draft__';
  const queryInput = document.getElementById('cs-query');
  const sourceSelect = document.getElementById('cs-source');
  const fieldSelect = document.getElementById('cs-field');
  const stageSelect = document.getElementById('cs-stage');
  const birthFromInput = document.getElementById('cs-birth-from');
  const birthToInput = document.getElementById('cs-birth-to');
  const ageMinInput = document.getElementById('cs-age-min');
  const ageMaxInput = document.getElementById('cs-age-max');
  const nextAgeInput = document.getElementById('cs-next-age');
  const apiCedulaInput = document.getElementById('cs-api-cedula');
  const apiCecotInput = document.getElementById('cs-api-cecot');
  const apiEmployerInput = document.getElementById('cs-api-employer');
  const apiCedulaButton = document.getElementById('cs-api-search-cedula');
  const apiFuncionarioButton = document.getElementById('cs-api-search-funcionario');
  const apiIpButton = document.getElementById('cs-api-search-ip');
  const apiResultsEl = document.getElementById('cs-api-results');
  const clearBtn = document.getElementById('cs-clear');
  const countEl = document.getElementById('cs-count');
  const resultsEl = document.getElementById('cs-results');
  const searchNavBtn = document.querySelector('.nav-btn[data-view="busqueda"]');

  if (!queryInput || !sourceSelect || !fieldSelect || !stageSelect || !clearBtn || !countEl || !resultsEl) return;

  let indexedClients = [];
  let apiSearchRecords = [];

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
    if (Array.isArray(apiClients)) return apiClients;
    if (window.TufiClientStore) return window.TufiClientStore.load();
    try {
      const storedClients = JSON.parse(localStorage.getItem(CLIENTS_STORAGE_KEY) || '[]');
      return Array.isArray(storedClients) ? storedClients : [];
    } catch {
      return [];
    }
  }

  // Límite de tarjetas renderizadas: dibujar miles de tarjetas traba la página.
  const RESULT_LIMIT_KEY = 'tufi_search_limit_v1';
  const DEFAULT_RESULT_LIMIT = 30;
  const limitInput = document.getElementById('cs-limit');

  function getResultLimit() {
    const fromInput = Number(limitInput?.value);
    if (Number.isInteger(fromInput) && fromInput >= 1) return Math.min(fromInput, 1000);
    return DEFAULT_RESULT_LIMIT;
  }

  try {
    const storedLimit = Number(localStorage.getItem(RESULT_LIMIT_KEY));
    if (limitInput) limitInput.value = Number.isInteger(storedLimit) && storedLimit >= 1 ? storedLimit : DEFAULT_RESULT_LIMIT;
  } catch {
    if (limitInput) limitInput.value = DEFAULT_RESULT_LIMIT;
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
        getClientValue(client, 'fechanac'),
        getClientValue(client, 'celular'),
        getClientValue(client, 'empresa'),
        getClientValue(client, 'cargo'),
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
      fechanac: normalizeText(getClientValue(client, 'fechanac')),
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

  function parseBirthDate(value) {
    const text = String(value || '').trim().split('T')[0];
    if (!text) return null;

    let year;
    let month;
    let day;
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      year = Number(match[1]);
      month = Number(match[2]) - 1;
      day = Number(match[3]);
    } else {
      match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (!match) return null;
      day = Number(match[1]);
      month = Number(match[2]) - 1;
      year = Number(match[3]);
    }

    const date = new Date(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
    return date;
  }

  function getAgeInfo(birthDate, today = new Date()) {
    let age = today.getFullYear() - birthDate.getFullYear();
    const birthdayPassed = today.getMonth() > birthDate.getMonth()
      || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
    if (!birthdayPassed) age--;
    return { age, nextBirthdayAge: age + 1 };
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

  function buildResultCard(entry, showActions) {
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

    return `
      <div class="search-card">
        <div class="search-card-top">
          <div class="search-card-title">${escapeHtml(getClientDisplayName(client))}</div>
          <div class="search-card-badges">
            <span class="search-card-badge ${sourceClass}">${escapeHtml(source)}</span>
            <span class="search-card-badge stage">${escapeHtml(stageLabel)}</span>
            <span class="search-card-badge ${client._remoteSynced ? 'cloud-synced' : 'cloud-pending'}">
              ${client._remoteSynced ? '✓ Nube' : 'Pendiente nube'}
            </span>
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
    const birthFrom = birthFromInput?.value ? new Date(`${birthFromInput.value}T00:00:00`) : null;
    const birthTo = birthToInput?.value ? new Date(`${birthToInput.value}T23:59:59.999`) : null;
    const ageMin = ageMinInput?.value === '' ? null : Number(ageMinInput.value);
    const ageMax = ageMaxInput?.value === '' ? null : Number(ageMaxInput.value);
    const nextAge = nextAgeInput?.value === '' ? null : Number(nextAgeInput.value);

    const results = indexedClients.filter(entry => {
      const client = entry.client;
      const clientSource = getClientSource(client);
      const clientStage = getClientStage(client);

      if (selectedSource !== 'ALL' && normalizeText(clientSource) !== normalizeText(selectedSource)) return false;
      if (selectedStage !== 'ALL' && clientStage !== selectedStage) return false;

      if (birthFrom || birthTo || ageMin !== null || ageMax !== null || nextAge !== null) {
        const birthDate = parseBirthDate(getClientValue(client, 'fechanac'));
        if (!birthDate) return false;
        if (birthFrom && birthDate < birthFrom) return false;
        if (birthTo && birthDate > birthTo) return false;
        const { age, nextBirthdayAge } = getAgeInfo(birthDate);
        if (ageMin !== null && age < ageMin) return false;
        if (ageMax !== null && age > ageMax) return false;
        if (nextAge !== null && nextBirthdayAge !== nextAge) return false;
      }

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

    const limit = getResultLimit();
    const visible = results.slice(0, limit);
    countEl.textContent = results.length > visible.length
      ? `Mostrando ${visible.length} de ${results.length} resultados`
      : `${results.length} resultado${results.length === 1 ? '' : 's'}`;

    if (!indexedClients.length) {
      resultsEl.innerHTML = '<div class="search-empty">Todavia no hay clientes guardados para buscar.</div>';
      return;
    }

    if (!results.length) {
      resultsEl.innerHTML = '<div class="search-empty">No hubo coincidencias con esos filtros.</div>';
      return;
    }

    const showActions = isRemoteActive();
    resultsEl.innerHTML = visible.map(entry => buildResultCard(entry, showActions)).join('')
      + (results.length > visible.length
        ? `<div class="search-more">Hay ${results.length - visible.length} resultados más. Afina el filtro o aumenta «Máx. resultados».</div>`
        : '');
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
          const api = getApi();
          const arr = loadStoredClients(api);
          const idx = arr.findIndex(c => String(c.id) === id || String(c.clientId || '') === id);
          if (idx === -1) { showToast('⚠ Cliente no encontrado'); return; }
          arr.splice(idx, 1);
          if (api?.clientsSave) api.clientsSave(arr);
          else {
            window.TufiClientStore?.save(arr);
            window.dispatchEvent(new Event('tufi:clients-changed'));
          }
          showToast('✓ Cliente eliminado localmente');
        } catch (e) { showToast('⚠ Error al eliminar'); }
      });
    });

    // Soft-delete (mark as deleted on server but keep locally) — ask confirmation
    resultsEl.querySelectorAll('.search-soft-delete-btn').forEach(button => {
      button.addEventListener('click', async () => {
        if (!confirm('¿Estás seguro que deseas marcar este cliente como eliminado en el servidor?')) return;
        const id = button.dataset.id;
        const client = indexedClients.find(e => (String(e.client.id) === id))?.client;
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
        const client = indexedClients.find(e => (String(e.client.id) === id))?.client;
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

  function getRemoteSearchValue(client, key) {
    const aliases = {
      nombres: ['nombre', 'firstName', 'first_name'],
      apellidos: ['apellido', 'lastName', 'last_name'],
      cedula: ['ci', 'documento', 'document_number'],
      fechanac: ['fecha_nacimiento', 'fechaNacimiento', 'birthDate', 'birth_date'],
      empresa: ['employer', 'company'],
      salario: ['salary'],
      cecot: ['cecot', 'ips'],
      idempleador: ['id_empleador', 'employerId', 'employer_id']
    };
    const direct = getClientValue(client, key);
    if (direct !== '') return direct;
    for (const alias of aliases[key] || []) {
      if (client?.[alias] !== undefined && client[alias] !== null && String(client[alias]).trim()) return client[alias];
    }
    return '';
  }

  function renderApiSearchResults(records) {
    apiSearchRecords = Array.isArray(records) ? records : [];
    if (!apiResultsEl) return;
    if (!apiSearchRecords.length) {
      apiResultsEl.innerHTML = '<div class="search-empty">La API no devolvió coincidencias.</div>';
      return;
    }

    apiResultsEl.innerHTML = apiSearchRecords.map((record, index) => {
      const fields = [
        ['Nombre', getRemoteSearchValue(record, 'nombres')],
        ['Apellido', getRemoteSearchValue(record, 'apellidos')],
        ['Número de cédula', getRemoteSearchValue(record, 'cedula')],
        ['Fecha de nacimiento', getRemoteSearchValue(record, 'fechanac')],
        ['Empresa', getRemoteSearchValue(record, 'empresa')],
        ['Ingreso', record.ingreso_ultimo_mes ?? getRemoteSearchValue(record, 'salario')],
        ['Meses con aporte', record.meses_aporte],
        ['CECOT', getRemoteSearchValue(record, 'cecot')],
        ['ID empleador', getRemoteSearchValue(record, 'idempleador')]
      ].filter(([, value]) => value !== '' && value !== null && value !== undefined);
      return `
        <article class="search-api-record">
          <dl>${fields.map(([label, value]) => `
            <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
          `).join('')}</dl>
          <button class="btn btn-secondary btn-sm search-api-load-btn" type="button" data-index="${index}">Cargar y guardar cliente</button>
        </article>`;
    }).join('');

    apiResultsEl.querySelectorAll('.search-api-load-btn').forEach(button => {
      button.addEventListener('click', () => {
        const record = apiSearchRecords[Number(button.dataset.index)];
        const api = getApi();
        if (!record || !api?.loadClientData || !api?.saveCurrentClient) {
          showToast('⚠ No se pudo cargar el cliente en el formulario');
          return;
        }
        const formData = {
          'fc-nombres': getRemoteSearchValue(record, 'nombres'),
          'fc-apellidos': getRemoteSearchValue(record, 'apellidos'),
          'fc-cedula': getRemoteSearchValue(record, 'cedula'),
          'fc-fechanac': getRemoteSearchValue(record, 'fechanac'),
          'fc-empresa': getRemoteSearchValue(record, 'empresa'),
          'fc-cargo': record.nombre_laboral || getRemoteSearchValue(record, 'cargo'),
          'fc-salario': getRemoteSearchValue(record, 'salario')
        };
        api.loadClientData(formData);
        const saved = api.saveCurrentClient({ silent: true });
        if (!saved) {
          showToast('⚠ La respuesta no contiene datos suficientes para guardar');
          return;
        }
        activateView('formcontact');
        showToast('✓ Cliente cargado y guardado');
      });
    });
  }

  async function searchRemoteByCedula() {
    const cedula = apiCedulaInput?.value.trim();
    if (!cedula) {
      showToast('⚠ Ingresa una cédula para buscar');
      return;
    }
    if (!window.RemoteSync?.searchByCedula) {
      showToast('⚠ Remote Sync no está disponible');
      return;
    }
    try {
      apiResultsEl.textContent = 'Buscando en la API…';
      renderApiSearchResults(await window.RemoteSync.searchByCedula(cedula));
    } catch (error) {
      console.error('[ClientSearch] Error en búsqueda por cédula:', error);
      apiResultsEl.textContent = 'No se pudo completar la búsqueda en la API.';
      showToast('⚠ Error buscando por cédula en la API');
    }
  }

  async function searchRemoteByIp() {
    const cecot = apiCecotInput?.value.trim() || '';
    const employerId = apiEmployerInput?.value.trim() || '';
    if (!cecot && !employerId) {
      showToast('⚠ Ingresa CECOT o ID empleador para buscar');
      return;
    }
    if (!window.RemoteSync?.searchIp) {
      showToast('⚠ Remote Sync no está disponible');
      return;
    }
    try {
      apiResultsEl.textContent = 'Buscando en la API…';
      renderApiSearchResults(await window.RemoteSync.searchIp({ cecot, idempleador: employerId }));
    } catch (error) {
      console.error('[ClientSearch] Error en búsqueda searchip:', error);
      apiResultsEl.textContent = 'No se pudo completar la búsqueda en la API.';
      showToast('⚠ Error buscando en la API');
    }
  }

  async function searchRemoteFuncionario() {
    const cedula = apiCedulaInput?.value.trim();
    if (!cedula) {
      showToast('⚠ Ingresa una cédula para buscar');
      return;
    }
    if (!window.RemoteSync?.searchFuncionario) {
      showToast('⚠ Remote Sync no está disponible');
      return;
    }
    try {
      apiResultsEl.textContent = 'Buscando funcionario…';
      renderApiSearchResults(await window.RemoteSync.searchFuncionario(cedula));
    } catch (error) {
      console.error('[ClientSearch] Error en búsqueda de funcionario:', error);
      apiResultsEl.textContent = 'No se pudo completar la búsqueda de funcionario.';
      showToast('⚠ Error buscando funcionario');
    }
  }

  // Escribir en el buscador no re-renderiza en cada tecla: espera 150 ms.
  let renderTimer = null;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderResults, 150);
  }

  [queryInput, sourceSelect, fieldSelect, stageSelect, birthFromInput, birthToInput, ageMinInput, ageMaxInput, nextAgeInput].filter(Boolean).forEach(control => {
    control.addEventListener('input', scheduleRender);
    control.addEventListener('change', scheduleRender);
  });

  limitInput?.addEventListener('change', () => {
    const limit = getResultLimit();
    limitInput.value = limit;
    try { localStorage.setItem(RESULT_LIMIT_KEY, String(limit)); } catch { /* ignore */ }
    renderResults();
  });
  limitInput?.addEventListener('input', scheduleRender);

  apiCedulaButton?.addEventListener('click', searchRemoteByCedula);
  apiFuncionarioButton?.addEventListener('click', searchRemoteFuncionario);
  apiIpButton?.addEventListener('click', searchRemoteByIp);

  clearBtn.addEventListener('click', () => {
    queryInput.value = '';
    sourceSelect.value = 'ALL';
    fieldSelect.value = 'all';
    stageSelect.value = 'ALL';
    if (birthFromInput) birthFromInput.value = '';
    if (birthToInput) birthToInput.value = '';
    if (ageMinInput) ageMinInput.value = '';
    if (ageMaxInput) ageMaxInput.value = '';
    if (nextAgeInput) nextAgeInput.value = '';
    renderResults();
  });

  // tufi:clients-changed se dispara con cada autoguardado del formulario. Re-indexar
  // 3.000 clientes en cada tecla causaba lag: sólo se re-indexa si la vista Búsqueda
  // está visible (con debounce); si no, se marca pendiente y se hace al abrirla.
  let indexStale = false;
  let refreshTimer = null;
  function searchViewIsActive() {
    return document.getElementById('view-busqueda')?.classList.contains('active') === true;
  }
  function onClientsChanged() {
    if (!searchViewIsActive()) { indexStale = true; return; }
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshSearch, 250);
  }

  searchNavBtn?.addEventListener('click', () => { indexStale = false; refreshSearch(); });
  window.addEventListener('tufi:clients-changed', onClientsChanged);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && indexStale && searchViewIsActive()) { indexStale = false; refreshSearch(); }
  });

  refreshSearch();
})();
