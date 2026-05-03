'use strict';

(function initClientSearch() {
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

  function buildFieldText(client) {
    return {
      all: normalizeText([
        client.displayName,
        client['fc-origen'],
        client['fc-nombres'],
        client['fc-apellidos'],
        client['fc-cedula'],
        client['fc-celular'],
        client['fc-empresa'],
        client['fc-ciudad-p'],
        client['fc-ciudad-l'],
        client['fc-barrio-p'],
        client['fc-barrio-l'],
        client['fc-direccion-p'],
        client['fc-direccion-l'],
        client['fc-referencias'],
        client['fc-monto'],
        client['fc-plazo'],
        client['fc-cecot'],
        client['fc-idempleador'],
        client.etapa,
        ...(client._entidades || [])
      ].join(' ')),
      nombres: normalizeText(client['fc-nombres']),
      apellidos: normalizeText(client['fc-apellidos']),
      cedula: normalizeText(client['fc-cedula']),
      celular: normalizeText(client['fc-celular']),
      empresa: normalizeText(client['fc-empresa']),
      origen: normalizeText(client['fc-origen']),
      ciudad: normalizeText([client['fc-ciudad-p'], client['fc-ciudad-l']].join(' ')),
      direccion: normalizeText([
        client['fc-direccion-p'],
        client['fc-direccion-l'],
        client['fc-barrio-p'],
        client['fc-barrio-l']
      ].join(' ')),
      referencias: normalizeText(client['fc-referencias']),
      monto: normalizeText([client['fc-monto'], client['fc-plazo']].join(' ')),
      entidades: normalizeText((client._entidades || []).join(' ')),
      ips: normalizeText([client['fc-cecot'], client['fc-idempleador']].join(' '))
    };
  }

  function indexClients() {
    const api = getApi();
    const clients = api?.clientsLoad?.() || [];

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
    const api = getApi();
    if (!api?.switchToClient) return;

    api.switchToClient(clientId);
    activateView('formcontact');
  }

  function buildResultCard(entry) {
    const client = entry.client;
    const source = client['fc-origen'] || 'WhatsApp';
    const stage = client.etapa || 'EN_PROCESO';
    const stageLabel = getStageLabel(stage);
    const sourceText = normalizeText(source);
    const sourceClass = sourceText.includes('facebook')
      ? 'source-facebook'
      : sourceText.includes('mercately')
        ? 'source-mercately'
        : 'source-whatsapp';

    return `
      <div class="search-card">
        <div class="search-card-top">
          <div class="search-card-title">${escapeHtml(client.displayName || 'Cliente sin nombre')}</div>
          <div class="search-card-badges">
            <span class="search-card-badge ${sourceClass}">${escapeHtml(source)}</span>
            <span class="search-card-badge stage">${escapeHtml(stageLabel)}</span>
          </div>
        </div>
        <div class="search-card-grid">
          <div class="search-card-item">
            <div class="search-card-label">Cedula</div>
            <div class="search-card-value">${escapeHtml(client['fc-cedula'] || '—')}</div>
          </div>
          <div class="search-card-item">
            <div class="search-card-label">Celular</div>
            <div class="search-card-value">${escapeHtml(client['fc-celular'] || '—')}</div>
          </div>
          <div class="search-card-item">
            <div class="search-card-label">Empresa</div>
            <div class="search-card-value">${escapeHtml(client['fc-empresa'] || '—')}</div>
          </div>
          <div class="search-card-item">
            <div class="search-card-label">Ciudad</div>
            <div class="search-card-value">${escapeHtml(client['fc-ciudad-p'] || client['fc-ciudad-l'] || '—')}</div>
          </div>
        </div>
        <div class="search-card-footer">
          <span class="search-card-date">Actualizado: ${escapeHtml(formatDate(client.savedAt))}</span>
          <button class="btn btn-secondary btn-sm search-open-btn" type="button" data-id="${escapeHtml(client.id)}">Abrir</button>
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
      const clientSource = client['fc-origen'] || 'WhatsApp';
      const clientStage = client.etapa || 'EN_PROCESO';

      if (selectedSource !== 'ALL' && normalizeText(clientSource) !== normalizeText(selectedSource)) return false;
      if (selectedStage !== 'ALL' && clientStage !== selectedStage) return false;
      if (!query) return true;

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
