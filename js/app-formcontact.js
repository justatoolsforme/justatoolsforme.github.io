/* ============================================================
   TUFI TOOLS — app-formcontact.js  (v3)
   Pipeline drag & drop, auto-save, multi-client, text export
   ============================================================ */
'use strict';

/* ============================================================
   A. CONSTANTES
   ============================================================ */
const FC_STORAGE_KEY = 'tufi_formcontact_draft';
const FC_CLIENTS_KEY = 'tufi_clients_v3';

const FC_FIELD_IDS = [
  'fc-nombres', 'fc-apellidos', 'fc-cedula', 'fc-fechanac',
  'fc-estadocivil', 'fc-celular',
  'fc-ciudad-p', 'fc-barrio-p', 'fc-direccion-p',
  'fc-empresa', 'fc-salario',
  'fc-ciudad-l', 'fc-barrio-l', 'fc-direccion-l', 'fc-lineabaja',
  'fc-referencias', 'fc-monto', 'fc-plazo', 'fc-etapa',
  'fc-cecot', 'fc-idempleador'
];

const STAGES = ['EN_PROCESO', 'APROBADO', 'OFERTA_REALIZADA', 'NUEVOS', 'RECHAZADOS'];
const STAGE_LABEL = {
  EN_PROCESO:       'EN PROCESO',
  APROBADO:         'APROBADO',
  OFERTA_REALIZADA: 'OFERTA REALIZADA',
  NUEVOS:           'NUEVOS',
  RECHAZADOS:       'RECHAZADOS',
};

let fc_activeClientId = null;
let fc_isDirty = false;

/* ============================================================
   B. UTILS
   ============================================================ */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function randomId() {
  return 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

/* ============================================================
   C. STORAGE
   ============================================================ */
function clientsLoad() {
  try { return JSON.parse(localStorage.getItem(FC_CLIENTS_KEY) || '[]'); }
  catch { return []; }
}
function clientsSave(clients) {
  localStorage.setItem(FC_CLIENTS_KEY, JSON.stringify(clients));
}
function clientById(id) {
  return clientsLoad().find(c => c.id === id) || null;
}

/* ============================================================
   D. FORMULARIO — LEER / ESCRIBIR / LIMPIAR
   ============================================================ */
function formRead() {
  const data = {};
  FC_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) data[id] = el.value;
  });
  data._entidades = [...document.querySelectorAll('input[name="entidad"]:checked')]
    .map(cb => cb.value);
  return data;
}

function formWrite(data) {
  if (!data) return;
  FC_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && data[id] !== undefined) el.value = data[id];
  });
  const ents = data._entidades || [];
  document.querySelectorAll('input[name="entidad"]').forEach(cb => {
    cb.checked = ents.includes(cb.value);
  });
}

function formClear() {
  FC_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });
  document.querySelectorAll('input[name="entidad"]').forEach(cb => cb.checked = false);
  const urlOut  = document.getElementById('fc-urlboletas');
  const openBtn = document.getElementById('fc-openurl');
  const copyBtn = document.getElementById('fc-copyurl');
  if (urlOut)  urlOut.value = '';
  if (openBtn) { openBtn.style.display = 'none'; openBtn.href = '#'; }
  if (copyBtn) copyBtn.style.display = 'none';
}

/* ============================================================
   E. BARRA CLIENTE ACTIVO
   ============================================================ */
function uiSetActiveClient(id, nombre) {
  fc_activeClientId = id;
  fc_isDirty = false;
  const bar   = document.getElementById('activeClientBar');
  const name  = document.getElementById('activeClientName');
  const dirty = document.getElementById('activeClientUnsaved');
  if (!bar) return;
  if (id) {
    bar.style.display = 'flex';
    if (name)  name.textContent = nombre || id;
    if (dirty) dirty.style.display = 'none';
  } else {
    bar.style.display = 'none';
  }
}

function uiMarkDirty() {
  if (!fc_activeClientId) return;
  fc_isDirty = true;
  const dirty = document.getElementById('activeClientUnsaved');
  if (dirty) dirty.style.display = 'inline';
}

function uiMarkClean() {
  fc_isDirty = false;
  const dirty = document.getElementById('activeClientUnsaved');
  if (dirty) dirty.style.display = 'none';
}

/* ============================================================
   F. GUARDAR CLIENTE
   ============================================================ */
function saveCurrentClient(opts = {}) {
  const data    = formRead();
  const nombres = data['fc-nombres']?.trim() || '';
  const apell   = data['fc-apellidos']?.trim() || '';
  const cedula  = data['fc-cedula']?.trim() || '';
  const etapa   = data['fc-etapa'] || 'EN_PROCESO';
  let clients   = clientsLoad();

  // Buscar por id activo o por cédula
  let id = fc_activeClientId;
  if (!id && cedula) {
    const byCI = clients.findIndex(c => c.cedula === cedula);
    if (byCI >= 0) id = clients[byCI].id;
  }

  // Calcular displayName
  let displayName = '';
  if (nombres || apell) {
    displayName = `${nombres} ${apell}`.trim();
  } else if (id) {
    displayName = clientById(id)?.displayName || id;
  } else {
    displayName = opts.autoName || randomId();
  }

  const snapshot = {
    ...data,
    id: id || randomId(),
    displayName,
    cedula,
    etapa,
    savedAt: new Date().toISOString(),
  };

  const idx = clients.findIndex(c => c.id === snapshot.id);
  if (idx >= 0) clients[idx] = snapshot;
  else clients.push(snapshot);

  clientsSave(clients);
  fc_activeClientId = snapshot.id;
  uiSetActiveClient(snapshot.id, snapshot.displayName);
  uiMarkClean();
  pipelineUpdateCounts();
  if (!opts.silent) showToast('✓ Guardado: ' + snapshot.displayName);
  return snapshot;
}

/* ============================================================
   G. CAMBIAR DE CLIENTE (auto-save del anterior)
   ============================================================ */
function switchToClient(newId) {
  // Guardar el actual si tiene datos
  const current = formRead();
  const hasData = FC_FIELD_IDS.some(id => {
    const v = current[id];
    return typeof v === 'string' && v.trim() !== '';
  });
  if (hasData) saveCurrentClient({ silent: true });

  const client = clientById(newId);
  if (!client) return;
  formClear();
  formWrite(client);
  fc_activeClientId = client.id;
  uiSetActiveClient(client.id, client.displayName);

  // Regenerar URL si hay datos
  const cecot = document.getElementById('fc-cecot')?.value.trim();
  const ide   = document.getElementById('fc-idempleador')?.value.trim();
  if (cecot && ide) generateIpsUrl(true);

  showToast('📂 ' + client.displayName);
}

/* ============================================================
   H. TEXTO PARA COPIAR / DESCARGAR
   ============================================================ */
function fcGenerateText() {
  const get = id => document.getElementById(id)?.value.trim() || '—';
  const entsChecked = [...document.querySelectorAll('input[name="entidad"]:checked')].map(cb => cb.value);
  const entLabel = entsChecked.length ? entsChecked.map(e => e.replace('_', ' ')).join(' / ') : 'TUFI';

  return [
    `*SOLICITUD DE CRÉDITO PARA ${entLabel}*`,
    '',
    '*DATOS PERSONALES*',
    `* Nombres: ${get('fc-nombres')}`,
    `* Apellidos: ${get('fc-apellidos')}`,
    `* Cédula Nro.: ${get('fc-cedula')}`,
    `* Fecha de nacimiento: ${get('fc-fechanac')}`,
    `* Estado civil: ${get('fc-estadocivil') || '—'}`,
    `* Ciudad: ${get('fc-ciudad-p')}`,
    `* Barrio: ${get('fc-barrio-p')}`,
    `* Dirección: ${get('fc-direccion-p')}`,
    `* Celular: ${get('fc-celular')}`,
    '',
    '*DATOS LABORALES*',
    `* Empresa: ${get('fc-empresa')}`,
    `* Ciudad: ${get('fc-ciudad-l')}`,
    `* Barrio: ${get('fc-barrio-l')}`,
    `* Dirección: ${get('fc-direccion-l')}`,
    `* Salario: ${get('fc-salario')}`,
    `* Línea baja: ${get('fc-lineabaja')}`,
    '',
    '*REFERENCIAS PERSONALES*',
    get('fc-referencias'),
    '',
    `*MONTO SOLICITADO:* ${get('fc-monto')}`,
    `*PLAZO:* ${get('fc-plazo')}`,
    '',
    '---',
    `*ETAPA:* ${get('fc-etapa')}`,
    `*ENTIDADES:* ${entsChecked.join(', ') || '—'}`,
    '',
    '*IPS*',
    `* CECOT: ${get('fc-cecot')}`,
    `* ID Empleador: ${get('fc-idempleador')}`,
  ].join('\n');
}

function fcGenerateTextForClient(client) {
  const g = key => client[`fc-${key}`]?.trim() || '—';
  const ents = (client._entidades || []).map(e => e.replace('_', ' ')).join(' / ') || 'TUFI';

  return [
    `*SOLICITUD DE CRÉDITO PARA ${ents}*`,
    '',
    '*DATOS PERSONALES*',
    `* Nombres: ${g('nombres')}`,
    `* Apellidos: ${g('apellidos')}`,
    `* Cédula Nro.: ${g('cedula')}`,
    `* Fecha de nacimiento: ${g('fechanac')}`,
    `* Estado civil: ${g('estadocivil') || '—'}`,
    `* Ciudad: ${g('ciudad-p')}`,
    `* Barrio: ${g('barrio-p')}`,
    `* Dirección: ${g('direccion-p')}`,
    `* Celular: ${g('celular')}`,
    '',
    '*DATOS LABORALES*',
    `* Empresa: ${g('empresa')}`,
    `* Ciudad: ${g('ciudad-l')}`,
    `* Barrio: ${g('barrio-l')}`,
    `* Dirección: ${g('direccion-l')}`,
    `* Salario: ${g('salario')}`,
    `* Línea baja: ${g('lineabaja')}`,
    '',
    '*REFERENCIAS PERSONALES*',
    g('referencias'),
    '',
    `*MONTO SOLICITADO:* ${g('monto')}`,
    `*PLAZO:* ${g('plazo')}`,
    '',
    '---',
    `*ETAPA:* ${client.etapa || '—'}`,
    `*ENTIDADES:* ${(client._entidades || []).join(', ') || '—'}`,
    '',
    '*IPS*',
    `* CECOT: ${g('cecot')}`,
    `* ID Empleador: ${g('idempleador')}`,
  ].join('\n');
}

/* ============================================================
   I. DESCARGAR TXT
   ============================================================ */
function downloadTxt(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function buildFilename(client) {
  const name   = (client?.displayName || 'cliente')
    .replace(/[^a-zA-Z0-9\u00C0-\u024F\s\-_]/g, '')
    .replace(/\s+/g, '_').trim();
  const cedula = (client?.cedula || '').replace(/[^0-9]/g, '');
  if (name && cedula) return `${name}_${cedula}.txt`;
  if (name)   return `${name}.txt`;
  if (cedula) return `${cedula}.txt`;
  return 'solicitud-tufi.txt';
}

function downloadAllClients() {
  const clients = clientsLoad();
  if (!clients.length) { showToast('⚠ No hay clientes guardados'); return; }
  const content = clients.map(c => `${'='.repeat(50)}\n${fcGenerateTextForClient(c)}\n`).join('\n');
  downloadTxt(content, 'todos_los_clientes_tufi.txt');
  showToast(`✓ ${clients.length} clientes descargados`);
}

/* ============================================================
   J. PIPELINE DRAG & DROP KANBAN
   ============================================================ */
let draggedClientId = null;

function pipelineUpdateCounts() {
  const clients = clientsLoad();
  STAGES.forEach(stage => {
    const cnt = clients.filter(c => c.etapa === stage).length;
    const el  = document.getElementById(`cnt-${stage}`);
    if (el) el.textContent = cnt;
  });
}

function stageDotClass(stage) {
  const map = { EN_PROCESO:'proceso', APROBADO:'aprobado', OFERTA_REALIZADA:'oferta', NUEVOS:'nuevos', RECHAZADOS:'rechazados' };
  return map[stage] || 'proceso';
}

function buildKanban() {
  const board = document.getElementById('kanbanBoard');
  if (!board) return;
  const clients = clientsLoad();

  board.innerHTML = STAGES.map(stage => {
    const sc = clients.filter(c => c.etapa === stage);
    const cards = sc.map(c => `
      <div class="kcard${c.id === fc_activeClientId ? ' kcard--active' : ''}"
           draggable="true" data-id="${escapeHtml(c.id)}" data-stage="${stage}">
        <div class="kcard-name">${escapeHtml(c.displayName)}</div>
        <div class="kcard-ci">${escapeHtml(c.cedula || '—')}</div>
        <div class="kcard-actions">
          <button class="kcard-btn kcard-load" data-id="${escapeHtml(c.id)}" title="Cargar en formulario">✎ Editar</button>
          <button class="kcard-btn kcard-del" data-id="${escapeHtml(c.id)}" title="Eliminar">✕</button>
        </div>
      </div>
    `).join('');

    return `
      <div class="kcol" data-stage="${stage}">
        <div class="kcol-header">
          <span class="pipe-dot dot-${stageDotClass(stage)}"></span>
          <span class="kcol-title">${STAGE_LABEL[stage]}</span>
          <span class="kcol-count">${sc.length}</span>
        </div>
        <div class="kcol-body" data-stage="${stage}">
          ${cards}
          <div class="kcol-drop-hint">Arrastrá aquí</div>
        </div>
      </div>
    `;
  }).join('');

  // Eventos drag en cards
  board.querySelectorAll('.kcard').forEach(card => {
    card.addEventListener('dragstart', e => {
      draggedClientId = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      draggedClientId = null;
      board.querySelectorAll('.kcol-body').forEach(col => col.classList.remove('drag-over'));
    });
  });

  // Cargar cliente
  board.querySelectorAll('.kcard-load').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      switchToClient(btn.dataset.id);
      document.getElementById('clientListPanel').style.display = 'none';
      document.querySelectorAll('.pipeline-tab').forEach(t => t.classList.remove('active'));
    });
  });

  // Eliminar cliente
  board.querySelectorAll('.kcard-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) return;
      const clients = clientsLoad().filter(c => c.id !== btn.dataset.id);
      clientsSave(clients);
      if (fc_activeClientId === btn.dataset.id) {
        fc_activeClientId = null;
        formClear();
        uiSetActiveClient(null, null);
        localStorage.removeItem(FC_STORAGE_KEY);
      }
      pipelineUpdateCounts();
      buildKanban();
      showToast('🗑 Cliente eliminado');
    });
  });

  // Drop zones
  board.querySelectorAll('.kcol-body').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
    });
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      if (!draggedClientId) return;
      const newStage = col.dataset.stage;
      const clients  = clientsLoad();
      const client   = clients.find(c => c.id === draggedClientId);
      if (!client || client.etapa === newStage) return;
      client.etapa = newStage;
      clientsSave(clients);
      if (fc_activeClientId === draggedClientId) {
        const etapaEl = document.getElementById('fc-etapa');
        if (etapaEl) etapaEl.value = newStage;
        fcSaveData();
      }
      pipelineUpdateCounts();
      buildKanban();
      showToast(`↪ Movido a ${STAGE_LABEL[newStage]}`);
    });
  });
}

/* ============================================================
   K. AUTOCOMPLETE CIUDADES
   ============================================================ */
function createCityAutocomplete(input) {
  if (!input) return;
  const dropdown = document.createElement('div');
  dropdown.className = 'ac-dropdown';
  dropdown.setAttribute('role', 'listbox');
  input.parentElement.style.position = 'relative';
  input.parentElement.appendChild(dropdown);

  let activeIdx = -1;

  function renderDropdown(results) {
    activeIdx = -1; dropdown.innerHTML = '';
    if (!results.length) { hideDropdown(); return; }
    const byDept = {};
    results.forEach(({ city, dept }) => { if (!byDept[dept]) byDept[dept] = []; byDept[dept].push(city); });
    let itemIdx = 0;
    for (const [dept, cities] of Object.entries(byDept)) {
      const g = document.createElement('div'); g.className = 'ac-group'; g.textContent = dept; dropdown.appendChild(g);
      cities.forEach(city => {
        const item = document.createElement('div');
        item.className = 'ac-item'; item.setAttribute('role','option');
        item.dataset.idx = itemIdx; item.textContent = city;
        item.addEventListener('mousedown', e => { e.preventDefault(); selectCity(city); });
        dropdown.appendChild(item); itemIdx++;
      });
    }
    dropdown.style.display = 'block';
  }

  function hideDropdown() { dropdown.style.display = 'none'; activeIdx = -1; }
  function selectCity(city) { input.value = city; hideDropdown(); fcSaveData(); input.dispatchEvent(new Event('input')); }
  function highlightItem(idx) {
    const items = dropdown.querySelectorAll('.ac-item');
    items.forEach((el, i) => el.classList.toggle('ac-active', i === idx));
    if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
    activeIdx = idx;
  }

  input.addEventListener('input', () => {
    const term = input.value.trim();
    if (term.length < 1) { hideDropdown(); return; }
    if (typeof geoSearch === 'function') renderDropdown(geoSearch(term, 24));
  });
  input.addEventListener('keydown', e => {
    if (dropdown.style.display === 'none') return;
    const items = dropdown.querySelectorAll('.ac-item'); const count = items.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlightItem((activeIdx+1)%count); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlightItem((activeIdx-1+count)%count); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectCity(items[activeIdx]?.textContent||''); }
    else if (e.key === 'Escape') hideDropdown();
  });
  input.addEventListener('blur', () => setTimeout(hideDropdown, 150));
}

/* ============================================================
   L. GENERADOR URL BOLETAS IPS
   ============================================================ */
function generateIpsUrl(silent) {
  const cecot = document.getElementById('fc-cecot')?.value.trim();
  const ide   = document.getElementById('fc-idempleador')?.value.trim();
  const urlOut  = document.getElementById('fc-urlboletas');
  const openBtn = document.getElementById('fc-openurl');
  const copyBtn = document.getElementById('fc-copyurl');
  if (!cecot || !ide) { if (!silent) showToast('⚠ Completá CECOT e ID Empleador'); return; }
  const url = `https://servicios.ips.gov.py/miips/inf_tarjetita_pdf.php?ide_emplea=${encodeURIComponent(ide)}&cod_period=994,993,992&ide_asecot=${encodeURIComponent(cecot)}&order=`;
  if (urlOut)  urlOut.value = url;
  if (openBtn) { openBtn.href = url; openBtn.style.display = 'inline-flex'; }
  if (copyBtn) copyBtn.style.display = 'inline-flex';
  if (!silent) showToast('✓ URL generada');
  fcSaveData();
}

function initUrlGenerator() {
  document.getElementById('fc-genurl')?.addEventListener('click', () => generateIpsUrl(false));
  document.getElementById('fc-copyurl')?.addEventListener('click', () => {
    const url = document.getElementById('fc-urlboletas')?.value;
    if (!url) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(() => showToast('✓ URL copiada'));
    } else {
      const ta = Object.assign(document.createElement('textarea'), { value: url, style: 'position:fixed;opacity:0' });
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      showToast('✓ URL copiada');
    }
  });
  ['fc-cecot', 'fc-idempleador'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      const c = document.getElementById('fc-cecot')?.value.trim();
      const i = document.getElementById('fc-idempleador')?.value.trim();
      if (c && i) generateIpsUrl(true);
    });
  });
}

/* ============================================================
   M. ENTITY TOOLTIPS
   ============================================================ */
function initEntityTooltips() {
  const tooltip = document.getElementById('entityTooltip');
  if (!tooltip) return;
  document.querySelectorAll('.entity-info-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      tooltip.textContent = btn.dataset.info || '';
      tooltip.style.display = 'block';
      const rect  = btn.getBoundingClientRect();
      const cRect = btn.closest('.entities-grid')?.getBoundingClientRect();
      tooltip.style.top  = (rect.bottom - (cRect?.top  || 0) + 4) + 'px';
      tooltip.style.left = (rect.left   - (cRect?.left || 0)) + 'px';
    });
    btn.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  });
}

/* ============================================================
   N. PERSISTENCIA DRAFT
   ============================================================ */
function fcSaveData() {
  const data = formRead();
  data._activeClientId = fc_activeClientId;
  localStorage.setItem(FC_STORAGE_KEY, JSON.stringify(data));
  if (fc_activeClientId) uiMarkDirty();
  pipelineUpdateCounts();
}

function fcLoadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(FC_STORAGE_KEY) || '{}');
    if (saved._activeClientId) {
      const client = clientById(saved._activeClientId);
      if (client) {
        fc_activeClientId = client.id;
        uiSetActiveClient(client.id, client.displayName);
      }
    }
    formWrite(saved);
    const cecot = document.getElementById('fc-cecot')?.value.trim();
    const ide   = document.getElementById('fc-idempleador')?.value.trim();
    if (cecot && ide) generateIpsUrl(true);
  } catch(e) {
    console.warn('[FC] Error cargando draft:', e);
  }
}

/* ============================================================
   O. AVISO AL SALIR
   ============================================================ */
window.addEventListener('beforeunload', e => {
  if (fc_isDirty) {
    e.preventDefault();
    e.returnValue = '¡Guardá antes de salir! Tenés cambios sin guardar.';
    return e.returnValue;
  }
});

/* ============================================================
   P. INIT PIPELINE UI
   ============================================================ */
(function initPipeline() {
  const panel = document.getElementById('clientListPanel');

  document.querySelectorAll('.pipeline-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const isOpen = panel?.style.display !== 'none';
      if (isOpen) {
        panel.style.display = 'none';
        document.querySelectorAll('.pipeline-tab').forEach(t => t.classList.remove('active'));
      } else {
        panel.style.display = 'block';
        buildKanban();
        document.querySelectorAll('.pipeline-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      }
    });
  });

  document.getElementById('closeClientList')?.addEventListener('click', () => {
    if (panel) panel.style.display = 'none';
    document.querySelectorAll('.pipeline-tab').forEach(t => t.classList.remove('active'));
  });

  document.getElementById('newClientBtn')?.addEventListener('click', () => {
    // Auto-guardar el actual
    const data = formRead();
    const hasData = FC_FIELD_IDS.some(id => {
      const v = data[id]; return typeof v === 'string' && v.trim() !== '';
    });
    if (hasData) saveCurrentClient({ silent: true });

    fc_activeClientId = null;
    formClear();
    uiSetActiveClient(null, null);
    if (panel) panel.style.display = 'none';
    localStorage.removeItem(FC_STORAGE_KEY);
    document.querySelectorAll('.pipeline-tab').forEach(t => t.classList.remove('active'));
    showToast('🆕 Formulario listo para nuevo cliente');
  });

  document.getElementById('fc-save-client')?.addEventListener('click', () => {
    saveCurrentClient();
    const panel = document.getElementById('clientListPanel');
    if (panel?.style.display !== 'none') buildKanban();
  });

  document.getElementById('downloadAllBtn')?.addEventListener('click', downloadAllClients);

  pipelineUpdateCounts();
})();

/* ============================================================
   Q. EVENTOS FORMULARIO
   ============================================================ */
(function initFormContact() {
  FC_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input',  fcSaveData);
    el.addEventListener('change', fcSaveData);
  });
  document.querySelectorAll('input[name="entidad"]').forEach(cb => {
    cb.addEventListener('change', fcSaveData);
  });

  // Actualizar nombre visible en tiempo real
  ['fc-nombres', 'fc-apellidos'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      if (!fc_activeClientId) return;
      const n = document.getElementById('fc-nombres')?.value.trim() || '';
      const a = document.getElementById('fc-apellidos')?.value.trim() || '';
      const name = `${n} ${a}`.trim();
      if (!name) return;
      const nameEl = document.getElementById('activeClientName');
      if (nameEl) nameEl.textContent = name;
    });
  });

  // Limpiar
  document.getElementById('fc-clear')?.addEventListener('click', () => {
    if (!confirm('¿Limpiar todos los campos?')) return;
    fc_activeClientId = null;
    uiSetActiveClient(null, null);
    formClear();
    localStorage.removeItem(FC_STORAGE_KEY);
    showToast('🗑 Formulario limpiado');
  });

  // Copiar al portapapeles
  document.getElementById('fc-copy')?.addEventListener('click', () => {
    const text = fcGenerateText();
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => showToast('✓ Copiado al portapapeles'))
        .catch(() => fallbackCopy(text));
    } else { fallbackCopy(text); }
  });

  // Descargar .txt
  document.getElementById('fc-download')?.addEventListener('click', () => {
    saveCurrentClient({ silent: true });
    const client   = fc_activeClientId ? clientById(fc_activeClientId) : null;
    const filename = buildFilename(client || { displayName: 'solicitud', cedula: '' });
    downloadTxt(fcGenerateText(), filename);
    showToast('✓ Descargado: ' + filename);
  });

  // Autocomplete ciudades
  createCityAutocomplete(document.getElementById('fc-ciudad-p'));
  createCityAutocomplete(document.getElementById('fc-ciudad-l'));

  initUrlGenerator();
  initEntityTooltips();
  fcLoadDraft();
})();

/* ============================================================
   R. HELPERS GLOBALES
   ============================================================ */
function fallbackCopy(text) {
  const ta = Object.assign(document.createElement('textarea'), {
    value: text, style: 'position:fixed;opacity:0;left:-9999px'
  });
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); showToast('✓ Copiado al portapapeles'); }
  catch { showToast('⚠ No se pudo copiar'); }
  document.body.removeChild(ta);
}

// Alias de compatibilidad
function fcClearFields() { formClear(); }