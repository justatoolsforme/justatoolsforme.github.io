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
  'fc-origen',
  'fc-nombres', 'fc-apellidos', 'fc-cedula', 'fc-fechanac',
  'fc-estadocivil', 'fc-celular',
  'fc-ciudad-p', 'fc-barrio-p', 'fc-direccion-p',
  'fc-empresa', 'fc-cargo', 'fc-salario',
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

const FC_IGNORED_MEANINGFUL_FIELDS = new Set(['fc-etapa', 'fc-origen']);

let fc_activeClientId = null;
let fc_isDirty = false;
let fc_autoSaveTimer = null;

const FC_UNDO_LIMIT = 50;
let fc_undoStack = [];
let fc_undoEditSnapshot = null;
let fc_undoApplying = false;

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


const FC_IPS_CONFIG = 'tufi_ips_config_v1';


function parseDateDMY(str) {
  if (!str) return null;
  const parts = str.split('/').map(s => s.trim());
  if (parts.length < 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const y = parseInt(parts[2], 10);
  if (Number.isNaN(d) || Number.isNaN(m) || Number.isNaN(y)) return null;
  
  if (m < 0 || m > 11) return null;
  if (d < 1 || d > 31) return null;
  
  const mdays = new Date(y, m + 1, 0).getDate();
  if (d > mdays) return null;
  return new Date(y, m, d);
}

function fcHasMeaningfulData(data = formRead()) {
  const hasTextData = FC_FIELD_IDS.some(id => {
    if (FC_IGNORED_MEANINGFUL_FIELDS.has(id)) return false;
    const value = data[id];
    if (id === 'fc-estadocivil' && value === 'Soltero/a') return false;
    return typeof value === 'string' && value.trim() !== '';
  });

  return hasTextData || (Array.isArray(data._entidades) && data._entidades.length > 0);
}

function fcHasClientDetails(data = formRead()) {
  const hasTextData = FC_FIELD_IDS.some(id => {
    if (id === 'fc-cedula' || FC_IGNORED_MEANINGFUL_FIELDS.has(id)) return false;
    const value = data?.[id];
    if (id === 'fc-estadocivil' && value === 'Soltero/a') return false;
    return typeof value === 'string' && value.trim() !== '';
  });

  return hasTextData || (Array.isArray(data?._entidades) && data._entidades.length > 0);
}

function fcCanAutoSaveClient(data = formRead()) {
  return fc_activeClientId
    ? fcHasMeaningfulData(data)
    : fcHasClientDetails(data);
}

function normalizeStructuredNameWhitespace(value) {
  return String(value ?? '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatStructuredBirthDate(value) {
  const raw = normalizeStructuredNameWhitespace(value);
  if (!raw) return '';
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  const match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!match) return raw;
  const [, day, month, year] = match;
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
}

function parseStructuredFcNameInput(rawValue) {
  const source = normalizeStructuredNameWhitespace(rawValue);
  if (!source) return null;

  const tokens = source.split(/\s+/).filter(Boolean);
  if (tokens.length < 7) return null;

  const dateIndex = tokens.findIndex(token => /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(token));
  if (dateIndex <= 0 || dateIndex + 4 >= tokens.length) return null;

  const sexo = tokens[dateIndex + 1];
  const acToken = tokens[dateIndex + 2];
  const siToken = tokens[dateIndex + 3];
  const cecotToken = tokens[dateIndex + 4];

  if (!/^(MASCULINO|FEMENINO)$/i.test(sexo)) return null;
  if (!/^AC$/i.test(acToken) || !/^SI$/i.test(siToken)) return null;
  if (!/^\d{5,}$/.test(cecotToken)) return null;

  const nameTokens = tokens.slice(0, dateIndex);
  if (!nameTokens.length) return null;

  let nombres = '';
  let apellidos = '';

  if (nameTokens.length === 2) {
    nombres = nameTokens[0];
    apellidos = nameTokens[1];
  } else {
    nombres = nameTokens.slice(0, -2).join(' ');
    apellidos = nameTokens.slice(-2).join(' ');
  }

  if (!nombres.trim() || !apellidos.trim()) return null;

  return {
    nombres: nombres.trim(),
    apellidos: apellidos.trim(),
    fechanac: formatStructuredBirthDate(tokens[dateIndex]),
    cecot: cecotToken.trim()
  };
}

function applyStructuredFcNamePattern(inputEl) {
  if (!inputEl) return;

  const parsed = parseStructuredFcNameInput(inputEl.value);
  if (!parsed) return;

  const nombresEl = document.getElementById('fc-nombres');
  const apellidosEl = document.getElementById('fc-apellidos');
  const fechaEl = document.getElementById('fc-fechanac');
  const cecotEl = document.getElementById('fc-cecot');

  if (!nombresEl || !apellidosEl || !fechaEl || !cecotEl) return;

  nombresEl.value = parsed.nombres;
  apellidosEl.value = parsed.apellidos;
  fechaEl.value = parsed.fechanac;
  cecotEl.value = parsed.cecot;

  try { updateAgeInfo(); } catch (e) {}
  fcSaveData();
}

/* ============================================================
   C. STORAGE
   ============================================================ */
// Persistencia compacta (v4) con caché en memoria: ver js/app-client-store.js.
function clientsLoad() {
  if (window.TufiClientStore) return window.TufiClientStore.load();
  try { return JSON.parse(localStorage.getItem(FC_CLIENTS_KEY) || '[]'); }
  catch { return []; }
}
function clientsSave(clients) {
  if (window.TufiClientStore) window.TufiClientStore.save(clients);
  else localStorage.setItem(FC_CLIENTS_KEY, JSON.stringify(clients));
  window.dispatchEvent(new Event('tufi:clients-changed'));
}
function clientById(id) {
  if (!id) return null;
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
    if (!el || data[id] === undefined) return;
    if (id === 'fc-estadocivil') {
      const status = String(data[id] || '').trim();
      el.value = !status || status === 'Soltero' ? 'Soltero/a' : status;
      if (!el.value) el.value = 'Soltero/a';
      return;
    }
    el.value = data[id];
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

function loadClientData(data) {
  clearTimeout(fc_autoSaveTimer);
  fc_autoSaveTimer = null;
  fc_activeClientId = null;
  formClear();
  formWrite(data);
  uiSetActiveClient(null, null);
  fcResetUndoHistory();
  try { updateAgeInfo(); } catch (error) { console.warn('[FC] No se pudo actualizar la edad al importar:', error); }
  syncUpperCopyButtonLabel();
  fcSaveData();
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
  clearTimeout(fc_autoSaveTimer);
  fc_autoSaveTimer = null;
  const data    = formRead();
  if (!fcHasMeaningfulData(data)) {
    if (!opts.silent) showToast('âš  CompletÃ¡ al menos un dato del cliente antes de guardar');
    return null;
  }
  const nombres = data['fc-nombres']?.trim() || '';
  const apell   = data['fc-apellidos']?.trim() || '';
  const cedula  = data['fc-cedula']?.trim() || '';
  const etapa   = data['fc-etapa'] || 'EN_PROCESO';
  let clients   = clientsLoad();

  
  let id = fc_activeClientId;
  if (!id && cedula) {
    const normalizeCi = value => String(value || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const normalizedCedula = normalizeCi(cedula);
    const byCI = clients.findIndex(c => normalizeCi(c.cedula || c['fc-cedula']) === normalizedCedula);
    if (byCI >= 0) id = clients[byCI].id;
  }

  
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

  fc_activeClientId = snapshot.id;
  clientsSave(clients);
  const draft = formRead();
  draft._activeClientId = snapshot.id;
  localStorage.setItem(FC_STORAGE_KEY, JSON.stringify(draft));
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
  clearTimeout(fc_autoSaveTimer);
  fc_autoSaveTimer = null;
  
  const current = formRead();
  const hasData = fcHasMeaningfulData(current);
  if (hasData) saveCurrentClient({ silent: true });

  const client = clientById(newId);
  if (!client) return;
  formClear();
  formWrite(client);
  
  tryFillLaborFromSavedCompany(client);
  
  tryFillStreetsFromSimilar(client);
  fc_activeClientId = client.id;
  uiSetActiveClient(client.id, client.displayName);

  
  try { updateAgeInfo(); } catch(e){}

  
  const cecot = document.getElementById('fc-cecot')?.value.trim();
  const ide   = document.getElementById('fc-idempleador')?.value.trim();
  if (cecot && ide) generateIpsUrl(true);

  fcResetUndoHistory();
  showToast('📂 ' + client.displayName);
}

/* ============================================================
   H. TEXTO PARA COPIAR / DESCARGAR
   ============================================================ */
function fcGenerateText() {
  const get = id => document.getElementById(id)?.value.trim() || '—';
  const entsChecked = [...document.querySelectorAll('input[name="entidad"]:checked')].map(cb => cb.value);
  const entLabel = entsChecked.length ? entsChecked.map(e => e.replace('_', ' ')).join(' / ') : 'TUFI';

  const lines = [
    `*SOLICITUD DE CRÉDITO PARA ${entLabel}*`,
    '',
    `*ORIGEN:* ${get('fc-origen')}`,
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
    `* Cargo / nombre laboral: ${get('fc-cargo')}`,
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
  return lines;
}

function getSelectedEntityLabel() {
  const entsChecked = [...document.querySelectorAll('input[name="entidad"]:checked')].map(cb => cb.value);
  return entsChecked.length ? entsChecked.map(e => e.replace('_', ' ')).join(' / ') : 'TUFI';
}

function syncUpperCopyButtonLabel() {
  const btn = document.getElementById('fc-copy-upper');
  if (!btn) return;

  const selected = [...document.querySelectorAll('input[name="entidad"]:checked')].map(cb => cb.value);
  const entity = selected.find(value => value === 'SERFIN' || value === 'FINANCORP');

  if (entity === 'SERFIN') {
    btn.textContent = 'Copiar MAYÚSCULAS (SERFIN S.A.)';
    return;
  }

  if (entity === 'FINANCORP') {
    btn.textContent = 'Copiar MAYÚSCULAS (FINANCORP)';
    return;
  }

  btn.textContent = 'Copiar MAYÚSCULAS (SERFIN S.A.)';
}

function fcGenerateTextUpper() {
  const get = id => (document.getElementById(id)?.value.trim() || '—');
  const entsChecked = [...document.querySelectorAll('input[name="entidad"]:checked')].map(cb => cb.value);
  const entLabel = entsChecked.length ? entsChecked.map(e => e.replace('_', ' ')).join(' / ') : 'SERFIN';

  const lines = [
    `*SOLICITUD DE CRÉDITO PARA ${entLabel}*`,
    '',
    `*ORIGEN:* ${get('fc-origen')}`,
    '',
    '*DATOS PERSONALES*',
    `* NOMBRES: ${get('fc-nombres')}`,
    `* APELLIDOS: ${get('fc-apellidos')}`,
    `* CÉDULA NRO.: ${get('fc-cedula')}`,
    `* FECHA DE NACIMIENTO: ${get('fc-fechanac')}`,
    `* ESTADO CIVIL: ${get('fc-estadocivil') || '—'}`,
    `* CIUDAD: ${get('fc-ciudad-p')}`,
    `* BARRIO: ${get('fc-barrio-p')}`,
    `* DIRECCIÓN: ${get('fc-direccion-p')}`,
    `* CELULAR: ${get('fc-celular')}`,
    '',
    '*DATOS LABORALES*',
    `* EMPRESA: ${get('fc-empresa')}`,
    `* CARGO / NOMBRE LABORAL: ${get('fc-cargo')}`,
    `* CIUDAD: ${get('fc-ciudad-l')}`,
    `* BARRIO: ${get('fc-barrio-l')}`,
    `* DIRECCIÓN: ${get('fc-direccion-l')}`,
    `* SALARIO: ${get('fc-salario')}`,
    `* LÍNEA BAJA: ${get('fc-lineabaja')}`,
    '',
    '*REFERENCIAS PERSONALES*',
    get('fc-referencias'),
    '',
    `*MONTO SOLICITADO:* ${get('fc-monto')}`,
    `*PLAZO:* ${get('fc-plazo')}`,
    '',
    '---',
    `*ETAPA:* ${document.getElementById('fc-etapa')?.value || '—'}`,
    `*ENTIDADES:* ${entLabel}`,
    '',
    '*IPS*',
    `* CECOT: ${get('fc-cecot')}`,
    `* ID EMPLEADOR: ${get('fc-idempleador')}`,
  ].join('\n');
  return lines.toLocaleUpperCase('es-ES');
}

function fcGenerateTextForClient(client) {
  const g = key => client[`fc-${key}`]?.trim() || '—';
  const ents = (client._entidades || []).map(e => e.replace('_', ' ')).join(' / ') || 'TUFI';

  const lines = [
    `*SOLICITUD DE CRÉDITO PARA ${ents}*`,
    '',
    `*ORIGEN:* ${g('origen')}`,
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
    `* Cargo / nombre laboral: ${g('cargo')}`,
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
  return lines;
}

/****/
const input = document.getElementById('fc-salario');

input?.addEventListener('input', () => {
  input.value = input.value.replace(/[.\s]/g, '');
});


const cedEl = document.getElementById('fc-cedula');
let fcLookupRequestId = 0;
let fcLookupInFlightCedula = '';
let fcLookupAvailabilityRequestId = 0;
let fcRemoteLookupReady = false;
let fcLastLookupJson = null;
const fcPositiveIpsResults = new Map();

cedEl?.addEventListener('input', () => {
  cedEl.value = cedEl.value.replace(/[.\s]/g, '');
  cedEl.classList.remove('fc-dup-error');
  if (
    fcLastLookupJson
    && fcNormalizeLookupCedula(cedEl.value) !== fcLastLookupJson.cedula
  ) {
    fcClearLookupJson();
  }
});

function fcLookupCedulaIsCurrent(requestId, cedula) {
  const current = String(cedEl?.value || '').trim().replace(/[.\s-]/g, '');
  return requestId === fcLookupRequestId && current === cedula;
}

function fcLookupText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function fcNormalizeLookupCedula(value) {
  return String(value || '').trim().replace(/[.\s-]/g, '');
}

function fcLookupRecordMatchesCedula(record, source, cedula) {
  const person = source === 'ips' ? record?.cotizante : record;
  const returnedCedula = fcLookupText(
    source === 'ips' ? person?.documento : '',
    record?.['fc-cedula'],
    record?.cedula,
    record?.ci,
    record?.documento,
    person?.cedula
  ).replace(/\D/g, '');
  return Boolean(returnedCedula && returnedCedula === cedula);
}

function fcGetCachedIpsRecords(cedula) {
  const records = fcPositiveIpsResults.get(cedula);
  if (!records) return null;

  const matching = records.filter(record =>
    fcLookupRecordMatchesCedula(record, 'ips', cedula)
  );
  if (!matching.length) {
    fcPositiveIpsResults.delete(cedula);
    return null;
  }
  fcPositiveIpsResults.delete(cedula);
  fcPositiveIpsResults.set(cedula, matching);
  return matching;
}

function fcCachePositiveIpsRecords(cedula, records) {
  const matching = records.filter(record =>
    fcLookupRecordMatchesCedula(record, 'ips', cedula)
  );
  if (!matching.length) return [];

  const cached = JSON.parse(JSON.stringify(matching));
  fcPositiveIpsResults.set(cedula, cached);
  while (fcPositiveIpsResults.size > 200) {
    fcPositiveIpsResults.delete(fcPositiveIpsResults.keys().next().value);
  }
  return cached;
}

function fcLookupConfigIsReady(remote, config) {
  const port = String(config?.port || '').trim();
  const portNumber = Number(port);
  return Boolean(
    remote
    && config?.enabled === true
    && String(config.url || '').trim()
    // Puerto opcional: vacío = el de la URL o el estándar (443 con HTTPS).
    && (port === '' || (/^[0-9]{1,5}$/.test(port) && portNumber >= 1 && portNumber <= 65535))
    && String(config.token || '').trim()
    && typeof remote.testPing === 'function'
    && typeof remote.searchFuncionario === 'function'
    && typeof remote.searchByCedula === 'function'
  );
}

function fcClearLookupJson() {
  fcLastLookupJson = null;
  const viewButton = document.getElementById('fc-view-lookup');
  if (viewButton) viewButton.hidden = true;
  const jsonOutput = document.getElementById('fc-lookup-json');
  if (jsonOutput) jsonOutput.textContent = '';
  const dialog = document.getElementById('fc-lookup-json-dialog');
  if (dialog?.open) dialog.close();
}

function fcSetRemoteLookupAvailability(ready) {
  fcRemoteLookupReady = Boolean(ready);
  const actions = document.getElementById('fc-lookup-actions');
  if (actions) actions.hidden = !fcRemoteLookupReady;
  const searchButton = document.getElementById('fc-search-cedula');
  if (searchButton) {
    searchButton.disabled = !fcRemoteLookupReady || Boolean(fcLookupInFlightCedula);
  }
  if (!fcRemoteLookupReady) fcClearLookupJson();
}

async function fcRefreshRemoteLookupAvailability() {
  const checkId = ++fcLookupAvailabilityRequestId;
  const remote = window.RemoteSync;
  const config = remote?.loadConfig?.();
  if (!fcLookupConfigIsReady(remote, config)) {
    fcSetRemoteLookupAvailability(false);
    return false;
  }

  fcSetRemoteLookupAvailability(false);
  let pingOk = false;
  try {
    pingOk = await remote.testPing();
  } catch (error) {
    console.error('[FC] No se pudo comprobar el ping de Remote Sync:', error);
  }
  if (checkId !== fcLookupAvailabilityRequestId) return false;

  const latestConfig = remote.loadConfig();
  const ready = pingOk
    && fcLookupConfigIsReady(remote, latestConfig)
    && fcRemoteLookupPingIsFresh(latestConfig);
  fcSetRemoteLookupAvailability(ready);
  return ready;
}

window.addEventListener('tufi:remote-config-changed', event => {
  fcPositiveIpsResults.clear();
  if (event.detail?.pingPending === true) {
    fcSetRemoteLookupAvailability(false);
    return;
  }
  void fcRefreshRemoteLookupAvailability();
});
window.addEventListener('tufi:remote-ping-status', event => {
  const remote = window.RemoteSync;
  const config = remote?.loadConfig?.();
  if (event.detail?.revision !== remote?.getConfigRevision?.()) return;
  fcSetRemoteLookupAvailability(
    event.detail?.ok === true
    && fcLookupConfigIsReady(remote, config)
    && fcRemoteLookupPingIsFresh(config)
  );
});

function fcRemoteLookupPingIsFresh(config) {
  const lastPing = Number(config?._lastPing);
  const age = Date.now() - lastPing;
  return Number.isFinite(lastPing) && age >= 0 && age < 60000;
}

function fcShowLookupJson(record, source, cedula) {
  if (!fcLookupRecordMatchesCedula(record, source, cedula)) {
    console.error('[FC] Se descartó un resultado cuya cédula no coincide con la búsqueda.');
    fcClearLookupJson();
    return false;
  }
  fcLastLookupJson = { source, cedula, result: record };
  const viewButton = document.getElementById('fc-view-lookup');
  if (viewButton && fcRemoteLookupReady) viewButton.hidden = false;
  return true;
}

document.getElementById('fc-search-cedula')?.addEventListener('click', async () => {
  const cedula = String(cedEl?.value || '').trim().replace(/[.\s-]/g, '');
  if (!/^[0-9]{5,12}$/.test(cedula)) {
    showToast('⚠ La cédula debe tener entre 5 y 12 dígitos', 4000);
    return;
  }
  await fcSearchByCedula(cedula);
});

document.getElementById('fc-view-lookup')?.addEventListener('click', () => {
  if (!fcRemoteLookupReady || !fcLastLookupJson) return;
  const currentCedula = fcNormalizeLookupCedula(cedEl?.value);
  if (
    currentCedula !== fcLastLookupJson.cedula
    || !fcLookupRecordMatchesCedula(
      fcLastLookupJson.result,
      fcLastLookupJson.source,
      currentCedula
    )
  ) {
    fcClearLookupJson();
    showToast('⚠ El resultado no corresponde a la cédula actual; vuelve a buscar', 5000);
    return;
  }
  const dialog = document.getElementById('fc-lookup-json-dialog');
  const jsonOutput = document.getElementById('fc-lookup-json');
  if (!dialog || !jsonOutput || typeof dialog.showModal !== 'function') {
    showToast('⚠ Este navegador no permite abrir el visor JSON');
    return;
  }
  jsonOutput.textContent = JSON.stringify(fcLastLookupJson, null, 2);
  dialog.showModal();
});

document.getElementById('fc-lookup-json-close')?.addEventListener('click', () => {
  document.getElementById('fc-lookup-json-dialog')?.close();
});

function fcLookupErrorMessage(error) {
  const message = String(error?.message || '');
  if (/remote_error_(401|403)\b/.test(message)) {
    return 'La API rechazó el token; verifica que coincida con API_TOKEN';
  }
  if (/remote_error_429\b|rate_limit_exceeded/.test(message)) {
    return 'Se alcanzó el límite de búsquedas; espera un minuto antes de volver a intentar';
  }
  if (/ips_authentication_failed/.test(message)) {
    return 'IPS rechazó las credenciales configuradas en el servidor';
  }
  if (/lookup_service_unavailable/.test(message)) {
    return 'El servicio de consultas (pc-home) no responde; verifica que esté encendido y conectado a Tailscale';
  }
  if (/ips_busy/.test(message)) {
    return 'IPS está atendiendo muchas consultas; inténtalo en unos segundos';
  }
  if (/remote_error_503\b|ips_temporarily_unavailable/.test(message)) {
    return 'IPS está temporalmente no disponible; inténtalo más tarde';
  }
  if (/remote_error_502\b|ips_response_error/.test(message)) {
    return 'IPS devolvió una respuesta inesperada o incompleta; no se pudo confirmar la búsqueda';
  }
  return 'No se pudo completar la búsqueda en IPS';
}

// Empleador a usar: el activo con ingreso más reciente; si no hay activo, el último.
function fcPickIpsEmployer(record) {
  const employers = Array.isArray(record?.empleadores) ? record.empleadores : [];
  const active = employers
    .filter(item => item?.activo)
    .sort((a, b) => String(b.fecha_ingreso || b.fecha_ingreso_ips || '').localeCompare(String(a.fecha_ingreso || a.fecha_ingreso_ips || '')));
  return active[0] || record?.ultimo_empleador || employers[0] || {};
}

// Clasifica si el cliente es viable según IPS (sin aportes / 1 aporte / sin empleador activo).
// Reglas validadas con la prueba realista (nov/2026):
//  - 0 o 1 aporte, o sin empleadores → no potable.
//  - Sin empleador activo → dudoso; se muestra el último aporte para decidir
//    (p. ej. «último aporte ENERO/2021, hace 70 meses» vs. «AGOSTO/2026, hace 3»).
//  - Empleador activo con último aporte reciente (≤ 3 meses) → potable.
function fcIpsViability(record) {
  const resumen = record?.resumen || {};
  const meses = Number(resumen.total_meses_aportados_reportados || 0);
  const activos = Number(resumen.cantidad_empleadores_activos || 0);
  const last = record?.ultimo_periodo_registrado;
  let lastText = '';
  let monthsAgo = null;
  if (last?.anio && last?.mes) {
    const now = new Date();
    monthsAgo = (now.getFullYear() * 12 + now.getMonth() + 1) - (Number(last.anio) * 12 + Number(last.mes));
    lastText = `último aporte ${last.nombre_mes || last.mes}/${last.anio}${monthsAgo > 0 ? `, hace ${monthsAgo} ${monthsAgo === 1 ? 'mes' : 'meses'}` : ''}`;
  }
  if (!resumen.tiene_empleadores) return { ok: false, text: 'No potable: está en IPS pero sin empleadores' };
  if (meses === 0) return { ok: false, text: 'No potable: 0 aportes en IPS' };
  if (meses === 1) return { ok: false, text: 'No potable: sólo 1 aporte en IPS' };
  if (!activos) return { ok: false, text: `Dudoso: ${meses} aportes, sin empleador activo${lastText ? ` (${lastText})` : ''}` };
  if (monthsAgo !== null && monthsAgo > 3) return { ok: false, text: `Dudoso: empleador activo pero ${lastText}` };
  return { ok: true, text: `${meses} aportes · empleador activo${lastText ? ` · ${lastText}` : ''}` };
}

// IPS responde 503 con retry_after cuando está caído (se restablece en ~1 min).
function fcRetryAfterSeconds(error) {
  const match = String(error?.message || '').match(/"retry_after"\s*:\s*(\d+)/);
  return match ? Math.min(Number(match[1]), 120) : 60;
}

function fcApplyLookupRecord(record, source, cedula) {
  const person = source === 'ips' ? (record?.cotizante || {}) : record;
  const employer = source === 'ips' ? fcPickIpsEmployer(record) : {};
  const additions = {
    'fc-nombres': fcLookupText(record?.['fc-nombres'], record?.nombres, person?.nombre),
    'fc-apellidos': fcLookupText(record?.['fc-apellidos'], record?.apellidos, person?.apellido),
    'fc-cedula': fcLookupText(record?.['fc-cedula'], record?.cedula, person?.documento, cedula),
    'fc-fechanac': formatStructuredBirthDate(fcLookupText(
      record?.['fc-fechanac'], record?.fecha_nacimiento, person?.fecha_nacimiento
    )),
    'fc-cecot': fcLookupText(record?.['fc-cecot'], person?.cecot, person?.ide_asecot),
    'fc-empresa': fcLookupText(record?.['fc-empresa'], record?.entidad, employer?.nombre),
    'fc-cargo': fcLookupText(record?.['fc-cargo'], record?.nombre_laboral),
    'fc-salario': fcLookupText(record?.['fc-salario'], record?.ingreso_ultimo_mes),
    'fc-idempleador': fcLookupText(
      employer?.ide_empleador_numerico, employer?.ide_empleador_id
    )
  };
  const data = formRead();
  let filled = 0;

  Object.entries(additions).forEach(([id, value]) => {
    if (value && !String(data[id] || '').trim()) {
      data[id] = value;
      filled += 1;
    }
  });

  formWrite(data);
  if (String(data['fc-cecot'] || '').trim() && String(data['fc-idempleador'] || '').trim()) {
    generateIpsUrl(true);
  }
  try { updateAgeInfo(); } catch (error) {
    console.warn('[FC] No se pudo actualizar la edad tras la búsqueda:', error);
  }
  fcSaveData();
  return filled;
}

let fcIpsRetryTimer = null;
const FC_IPS_MAX_AUTO_RETRIES = 2;

async function fcSearchByCedula(cedula, { ipsRetry = 0 } = {}) {
  if (fcLookupInFlightCedula === cedula) return;
  clearTimeout(fcIpsRetryTimer);
  fcIpsRetryTimer = null;
  const requestId = ++fcLookupRequestId;
  const remoteRevision = window.RemoteSync?.getConfigRevision?.();
  fcLookupInFlightCedula = cedula;
  const isCurrent = () => (
    fcLookupCedulaIsCurrent(requestId, cedula)
    && window.RemoteSync?.getConfigRevision?.() === remoteRevision
  );
  fcClearLookupJson();
  const searchButton = document.getElementById('fc-search-cedula');
  if (searchButton) searchButton.disabled = true;

  try {
    const remote = window.RemoteSync;
    const config = remote?.loadConfig?.();
    if (!fcLookupConfigIsReady(remote, config)) {
      fcSetRemoteLookupAvailability(false);
      if (isCurrent()) {
        showToast('⚠ Configura host/IP, puerto, token y habilita Remote Sync', 5000);
      }
      return;
    }

    if (!fcRemoteLookupReady || !fcRemoteLookupPingIsFresh(config)) {
      const ready = await fcRefreshRemoteLookupAvailability();
      if (!isCurrent()) return;
      if (!ready) {
        showToast('⚠ No se recibió PONG; verifica la conexión de Remote Sync', 5000);
        return;
      }
    }
    if (!fcRemoteLookupReady) {
      showToast('⚠ No se recibió PONG; verifica la conexión de Remote Sync', 5000);
      return;
    }

    let funcionarios = [];
    let funcionariosError = null;
    showToast('Buscando primero en nómina de funcionarios…', 10000);
    try {
      if (typeof remote.searchFuncionario !== 'function') {
        throw new Error('funcionarios_search_unavailable');
      }
      funcionarios = await remote.searchFuncionario(cedula);
      if (!Array.isArray(funcionarios)) throw new Error('invalid_funcionarios_response');
      const matchingFuncionarios = funcionarios.filter(record =>
        fcLookupRecordMatchesCedula(record, 'funcionarios', cedula)
      );
      if (funcionarios.length && !matchingFuncionarios.length) {
        throw new Error('funcionario_cedula_mismatch');
      }
      funcionarios = matchingFuncionarios;
    } catch (error) {
      funcionariosError = error;
      console.error('[FC] Error buscando en nómina de funcionarios:', error);
    }

    if (!isCurrent()) return;
    if (funcionarios.length) {
      if (!fcShowLookupJson(funcionarios[0], 'funcionarios', cedula)) {
        showToast('⚠ Nómina devolvió datos que no coinciden con la cédula', 5000);
        return;
      }
      const filled = fcApplyLookupRecord(funcionarios[0], 'funcionarios', cedula);
      showToast(
        filled
          ? '✓ Encontrado en nómina de funcionarios; datos completados'
          : '✓ Encontrado en nómina de funcionarios',
        5000
      );
      return;
    }

    let ipsRecords = fcGetCachedIpsRecords(cedula);
    if (ipsRecords === null) {
      showToast(
        funcionariosError
          ? 'No se pudo verificar la nómina; consultando IPS…'
          : 'No se encontró en nómina; consultando IPS…',
        10000
      );

      try {
        if (typeof remote.searchByCedula !== 'function') {
          throw new Error('ips_search_unavailable');
        }
        const fetchedIpsRecords = await remote.searchByCedula(cedula);
        if (!Array.isArray(fetchedIpsRecords)) throw new Error('invalid_ips_response');
        if (!isCurrent()) return;

        const matchingIpsRecords = fetchedIpsRecords.filter(record =>
          fcLookupRecordMatchesCedula(record, 'ips', cedula)
        );
        if (fetchedIpsRecords.length && !matchingIpsRecords.length) {
          console.error('[FC] IPS devolvió resultados que no coinciden con la cédula solicitada.');
          showToast('⚠ IPS devolvió datos que no coinciden con la cédula; no se aplicaron', 5000);
          return;
        }
        ipsRecords = fcCachePositiveIpsRecords(cedula, matchingIpsRecords);
      } catch (error) {
        console.error('[FC] Error buscando en IPS:', error);
        if (!isCurrent()) return;
        const ipsDown = /remote_error_503\b|ips_temporarily_unavailable/.test(String(error?.message || ''));
        if (ipsDown && ipsRetry < FC_IPS_MAX_AUTO_RETRIES) {
          const seconds = fcRetryAfterSeconds(error);
          const detail = String(error?.message || '');
          const what = /lookup_service_unavailable/.test(detail)
            ? 'El servicio de consultas (pc-home) no responde'
            : /ips_busy/.test(detail) ? 'IPS está ocupado' : 'IPS no disponible';
          showToast(`⚠ ${what}; se reintentará automáticamente en ${seconds} s`, 8000);
          fcIpsRetryTimer = setTimeout(() => {
            fcIpsRetryTimer = null;
            if (fcNormalizeLookupCedula(cedEl?.value) !== cedula) return; // el usuario pasó a otra cédula
            void fcSearchByCedula(cedula, { ipsRetry: ipsRetry + 1 });
          }, seconds * 1000);
        } else {
          showToast(`⚠ ${fcLookupErrorMessage(error)}`, 5000);
        }
        return;
      }
    } else {
      showToast('No se encontró en nómina; usando datos IPS validados previamente…', 5000);
    }

    if (!isCurrent()) return;
    if (ipsRecords.length) {
      if (!fcShowLookupJson(ipsRecords[0], 'ips', cedula)) {
        showToast('⚠ El resultado IPS no corresponde a la cédula actual; no se aplicó', 5000);
        return;
      }
      const filled = fcApplyLookupRecord(ipsRecords[0], 'ips', cedula);
      const viability = fcIpsViability(ipsRecords[0]);
      showToast(
        `${viability.ok ? '✓' : '⚠'} Encontrado en IPS: ${viability.text}`
          + (funcionariosError ? ' (no se pudo verificar la nómina)' : ''),
        viability.ok ? 5000 : 8000
      );
      if (!filled) console.info('[FC] La coincidencia no agregó campos porque ya estaban completos.');
      return;
    }

    showToast(
      funcionariosError
        ? '⚠ No potable: sin registro en IPS (no se pudo verificar la nómina)'
        : '⚠ No potable: no está en nómina ni en IPS',
      8000
    );
  } finally {
    if (requestId === fcLookupRequestId && fcLookupInFlightCedula === cedula) {
      fcLookupInFlightCedula = '';
      if (searchButton) searchButton.disabled = !fcRemoteLookupReady;
    }
  }
}

cedEl?.addEventListener('blur', async () => {
  const rawCedula = String(cedEl.value || '').trim();
  const ci = rawCedula.replace(/[.\s-]/g, '');
  if (!ci) return;
  if (!/^[0-9]+$/.test(ci) || ci.length > 12) {
    showToast('⚠ La cédula debe tener entre 5 y 12 dígitos', 4000);
    return;
  }
  if (ci.length < 5) return;

  const clients = clientsLoad();
  const normalizeCi = value => String(value || '').replace(/\D/g, '');
  const active = clients.find(client => client.id === fc_activeClientId);
  if (
    active
    && fcHasClientDetails(active)
    && normalizeCi(active.cedula || active['fc-cedula']) === ci
  ) return;

  const found = clients.find(c =>
    c.id !== fc_activeClientId
    && fcHasClientDetails(c)
    && normalizeCi(c.cedula || c['fc-cedula']) === ci
  );
  if (found) {
    formClear();
    formWrite(found);
    fc_activeClientId = found.id;
    uiSetActiveClient(found.id, found.displayName);
    fcResetUndoHistory();
    cedEl.classList.remove('fc-dup-error');
    showToast('✓ Cliente guardado cargado', 4000);
    return;
  }

  // Sin coincidencia local: la búsqueda remota (nómina → IPS) es manual con el
  // botón «Buscar en nómina e IPS», salvo que el menú Sync active la búsqueda
  // automática. Así no se consulta IPS por cada cédula escrita.
  const remoteConfig = window.RemoteSync?.loadConfig?.() || {};
  if (remoteConfig.autoLookup === true && fcRemoteLookupReady) {
    await fcSearchByCedula(ci);
  } else if (fcRemoteLookupReady) {
    showToast('No está guardado localmente; usa «Buscar en nómina e IPS»', 4000);
  }
});


function normalizePhoneValue(v) {
  if (!v) return '';
  let s = String(v).replace(/[.\s()]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('595')) s = '0' + s.slice(3);
  return s;
}

function normalizarTelefonos(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return '';

  return texto
    .split('\n')
    .map(linea => {
      if (!linea.trim()) return '';

      const regex = /(?<!\d)(?:\+\s*595|595)\s*(\d.*)$/;
      const coincidencia = linea.match(regex);

      if (!coincidencia) return linea.trim();

      const nombre = linea.slice(0, coincidencia.index).trim();
      const numeroLimpio = '0' + coincidencia[1].replace(/\s+/g, '');

      return `${nombre} ${numeroLimpio}`.trim();
    })
    .filter(linea => linea !== '')
    .join('\n');
}

const celEl = document.getElementById('fc-celular');
const bajaEl = document.getElementById('fc-lineabaja');
const referenciasEl = document.getElementById('fc-referencias');
[celEl, bajaEl].forEach(el => {
  if (!el) return;
  el.addEventListener('input', () => {
    const pos = el.selectionStart;
    el.value = normalizePhoneValue(el.value);
    try { el.setSelectionRange(pos, pos); } catch(e){}
  });
});

if (referenciasEl) {
  referenciasEl.addEventListener('paste', () => {
    setTimeout(() => {
      referenciasEl.value = normalizarTelefonos(referenciasEl.value);
    }, 0);
  });

  referenciasEl.addEventListener('blur', () => {
    referenciasEl.value = normalizarTelefonos(referenciasEl.value);
  });

  referenciasEl.addEventListener('input', () => {
    const value = referenciasEl.value || '';
    if (value.includes('+595') || value.includes('595')) {
      referenciasEl.value = normalizarTelefonos(value);
    }
  });
}


const fechaEl = document.getElementById('fc-fechanac');
function ensureAgeInfoElement() {
  let span = document.getElementById('fc-age-info');
  if (!span && fechaEl && fechaEl.parentElement) {
    span = document.createElement('div');
    span.id = 'fc-age-info';
    span.style.fontSize = '0.9em';
    span.style.marginTop = '6px';
    fechaEl.parentElement.appendChild(span);
  }
  return span;
}

function updateAgeInfo() {
  const span = ensureAgeInfoElement();
  if (!span) return;
  
  let raw = (fechaEl?.value || '');
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length >= 8) {
    const d2 = digits.slice(0,2);
    const m2 = digits.slice(2,4);
    const y4 = digits.slice(4,8);
    raw = `${d2}/${m2}/${y4}`;
  } else {
    raw = raw.replace(/[-\s]/g, '/');
  }
  fechaEl.value = raw;
  
  if (!raw || !raw.trim()) { span.textContent = ''; return; }
  let dob = parseDateDMY(raw);
  let usedFallback = false;
  if (!dob || isNaN(dob.getTime())) {
    
    const parts = raw.split('/').map(s => parseInt(s.replace(/[^0-9]/g, ''), 10));
    if (parts.length >= 3 && parts.every(p => !Number.isNaN(p))) {
      const fd = parts[0] || 1;
      const fm = (parts[1] || 1) - 1;
      const fy = parts[2] || 0;
      dob = new Date(fy, fm, fd);
      usedFallback = true;
    } else {
      span.textContent = `Edad: — Fecha inválida`;
      return;
    }
  }
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) years--;

  
  const target = new Date(dob.getFullYear() + 20, dob.getMonth(), dob.getDate());

  
  let monthsLeft = 0;
  let daysLeft = 0;
  let hoursLeft = 0;
  if (now < target) {
    monthsLeft = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
    if (now.getDate() > target.getDate()) monthsLeft = Math.max(0, monthsLeft - 1);
    const ms = target.getTime() - now.getTime();
    daysLeft = Math.floor(ms / (1000 * 60 * 60 * 24));
    hoursLeft = Math.floor(ms / (1000 * 60 * 60));
  }

  
  const ageText = `Edad: ${years} años`;
  if (now < target) {
    const more = `Faltan ${monthsLeft} meses para 20 — ${daysLeft} días — ${hoursLeft} horas`;
    span.textContent = usedFallback ? `${ageText} — ${more}` : `${raw} — ${ageText} — ${more}`;
  } else {
    span.textContent = usedFallback ? `${ageText} — Ya tiene 20 o más años` : `${raw} — ${ageText} — Ya tiene 20 o más años`;
  }
}

fechaEl?.addEventListener('input', () => updateAgeInfo());
fechaEl?.addEventListener('change', () => updateAgeInfo());


function normalizeForCompare(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9\s]/g, '').trim();
}

function companyNameMatches(a, b) {
  if (!a || !b) return false;
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  return na && nb && (na === nb || na.includes(nb) || nb.includes(na));
}

function cityIsPriority(city) {
  if (!city) return false;
  const n = normalizeForCompare(city);
  return n.includes('asunc') || n.includes('central');
}

function cityBelongsToCentralOrAsuncion(city) {
  if (!city) return false;
  const n = normalizeForCompare(city);
  const centralCities = ['luque', 'mariano roque alonso', 'san lorenzo', 'lambare', 'beni', 'villa'];
  if (n.includes('asunc')) return true;
  if (centralCities.some(c => n.includes(c))) return true;
  if (n.includes('central')) return true;
  return false;
}

const FC_ENTITY_RULES = {
  minSalary: 1700000,
  alwaysAllowed: ['TU_FINANCIERA', 'TKING', 'SOLAR', 'JAPONESA'],
  specialCompanyKeywords: ['MINISTERIO', 'PREVISION'],
  ageRule: {
    enabled: true,
    minAge: 19,
    monthsTo20: 6
  },
  byEntity: {
    SOLUCION: {
      departments: ['ASUNCIÓN', 'CENTRAL'],
      cities: ['CAACUPE', 'CIUDAD DEL ESTE'],
      allowSpecialCompany: true
    },
    SERFIN: {
      departments: ['ASUNCIÓN', 'CENTRAL'],
      cities: []
    },
    MARKET: {
      departments: ['ASUNCIÓN', 'CENTRAL'],
      cities: []
    },
    FINANCORP: {
      departments: ['ASUNCIÓN', 'CENTRAL'],
      cities: []
    },
    CARSA: {
      departments: ['ASUNCIÓN', 'CENTRAL'],
      cities: []
    },
    SOLAR: {
      anyCity: true
    },
    JAPONESA: {
      anyCity: true
    },
    TU_FINANCIERA: {
      anyCity: true
    },
    TKING: {
      anyCity: true
    }
  }
};

const FC_ENTITY_ANY_CITY_EXCEPTIONS = new Set(FC_ENTITY_RULES.alwaysAllowed);

function normalizeEntityValue(value) {
  return String(value || '').trim().toUpperCase();
}

function parseSalaryToNumber(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  const n = String(rawValue)
    .replace(/Gs\.?/gi, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.\-]/g, '');
  if (!n) return null;
  const num = Number(n);
  return Number.isFinite(num) ? num : null;
}

function companyContainsKeywords(company, keywords) {
  const text = normalizeForCompare(company || '');
  return keywords.some(keyword => text.includes(normalizeForCompare(keyword)));
}

function cityMatchesAny(city, values) {
  const text = normalizeForCompare(city || '');
  return values.some(value => text.includes(normalizeForCompare(value)));
}

function getAgeInfoFromDate(dateString) {
  if (!dateString) return null;
  const dob = parseDateDMY(dateString);
  if (!dob) return null;

  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  let days = now.getDate() - dob.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += prevMonth.getDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  let monthsLeftTo20 = 0;
  const target = new Date(dob.getFullYear() + 20, dob.getMonth(), dob.getDate());
  if (now < target) {
    monthsLeftTo20 = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
    if (now.getDate() > target.getDate()) monthsLeftTo20 = Math.max(0, monthsLeftTo20 - 1);
  }

  return { years, months, days, monthsLeftTo20 };
}

function cityMatchesDepartment(city, departmentNames) {
  const normalizedCity = normalizeForCompare(city || '');
  const geo = (typeof window !== 'undefined' && window.GEO_DATA) ? window.GEO_DATA : (typeof GEO_DATA !== 'undefined' ? GEO_DATA : {});
  const deptNames = departmentNames.map(name => normalizeForCompare(name));

  return Object.entries(geo).some(([dept, cities]) => {
    if (!deptNames.includes(normalizeForCompare(dept))) return false;
    return (cities || []).some(item => {
      const itemNorm = normalizeForCompare(item);
      return itemNorm === normalizedCity || normalizedCity.includes(itemNorm) || itemNorm.includes(normalizedCity);
    });
  });
}

function getEntityAvailabilityMap() {
  const city = document.getElementById('fc-ciudad-p')?.value || '';
  const company = document.getElementById('fc-empresa')?.value || '';
  const salaryRaw = document.getElementById('fc-salario')?.value || '';
  const birthDate = document.getElementById('fc-fechanac')?.value || '';
  const salaryNum = parseSalaryToNumber(salaryRaw);
  const ageInfo = getAgeInfoFromDate(birthDate);
  const hasSpecialEmpresa = companyContainsKeywords(company, FC_ENTITY_RULES.specialCompanyKeywords);

  const ents = new Map();
  document.querySelectorAll('input[name="entidad"]').forEach(cb => {
    ents.set(cb.value, true);
  });

  const isNear20Rule = ageInfo && ageInfo.years === 19 && ageInfo.monthsLeftTo20 <= FC_ENTITY_RULES.ageRule.monthsTo20;
  if (isNear20Rule && FC_ENTITY_RULES.ageRule.enabled) {
    document.querySelectorAll('input[name="entidad"]').forEach(cb => {
      const enabled = cb.value === 'SOLUCION';
      ents.set(cb.value, enabled);
    });
    return ents;
  }

  if (salaryNum !== null && salaryNum < FC_ENTITY_RULES.minSalary) {
    document.querySelectorAll('input[name="entidad"]').forEach(cb => {
      const enabled = ['TU_FINANCIERA', 'TKING', 'MARKET'].includes(cb.value);
      ents.set(cb.value, enabled);
    });
    return ents;
  }

  document.querySelectorAll('input[name="entidad"]').forEach(cb => {
    const value = cb.value;
    const config = FC_ENTITY_RULES.byEntity[value] || {};
    let enabled = true;

    if (hasSpecialEmpresa) {
      if (value === 'SERFIN' || value === 'MARKET') {
        const cityMatchesCentralOrAsuncion = cityMatchesDepartment(city, ['ASUNCIÓN', 'CENTRAL']) || cityMatchesAny(city, ['asuncion', 'asunción', 'central']);
        enabled = cityMatchesCentralOrAsuncion;
      } else {
        enabled = true;
      }
    } else if (config.anyCity) {
      enabled = true;
    } else {
      const cityMatchesDepartmentList = Array.isArray(config.departments)
        ? cityMatchesDepartment(city, config.departments)
        : false;
      const cityMatchesExplicitList = Array.isArray(config.cities)
        ? cityMatchesAny(city, config.cities.map(c => normalizeForCompare(c)))
        : false;

      enabled = cityMatchesDepartmentList || cityMatchesExplicitList;

      if (config.allowSpecialCompany && hasSpecialEmpresa) {
        enabled = true;
      }

      if (value === 'SERFIN' && hasSpecialEmpresa) {
        enabled = cityMatchesDepartmentList || cityMatchesExplicitList;
      }
    }

    ents.set(value, enabled);
  });

  return ents;
}

function applyEntityAvailabilityRules() {
  const map = getEntityAvailabilityMap();
  document.querySelectorAll('input[name="entidad"]').forEach(cb => {
    const enabled = map.get(cb.value) !== false;
    const wasChecked = cb.checked;

    cb.disabled = !enabled;
    cb.checked = enabled && wasChecked;

    if (!enabled) {
      cb.checked = false;
    }

    cb.closest('label')?.classList.toggle('entity-disabled', !enabled);
  });
}

function tryFillFromCompany(opts = {}) {
  const empresa = document.getElementById('fc-empresa')?.value.trim();
  if (!empresa) return null;
  const currentCity = document.getElementById('fc-ciudad-p')?.value.trim();
  const clients = clientsLoad();
  const candidates = clients.filter(c => c['fc-empresa'] && companyNameMatches(empresa, c['fc-empresa']));
  if (!candidates.length) return null;

  
  const withId = candidates.find(c => (c['fc-idempleador'] || '').trim());
  if (withId) {
    const ideEl = document.getElementById('fc-idempleador');
    if (ideEl && !ideEl.value.trim()) {
      ideEl.value = withId['fc-idempleador'] || '';
      showToast('✓ ID Empleador autocompletado desde empresa guardada');
      fcSaveData();
    }
  }

  
  let pick = null;
  
  pick = candidates.find(c => cityIsPriority(c['fc-ciudad-l']));
  
  if (!pick && currentCity) {
    pick = candidates.find(c => companyNameMatches(currentCity, c['fc-ciudad-l']));
  }
  
  if (!pick) {
    pick = candidates.find(c => (c['fc-barrio-l'] || c['fc-direccion-l'] || c['fc-lineabaja']));
  }

  if (pick) {
    
    const ciudadL = document.getElementById('fc-ciudad-l');
    const barrioL = document.getElementById('fc-barrio-l');
    const direccionL = document.getElementById('fc-direccion-l');
    const linea = document.getElementById('fc-lineabaja');

    const currentCityLower = (currentCity || '').trim();
    const curIsCentral = cityBelongsToCentralOrAsuncion(currentCityLower);

    if (ciudadL && (!ciudadL.value.trim() || curIsCentral || companyNameMatches(ciudadL.value, pick['fc-ciudad-l']) || cityIsPriority(pick['fc-ciudad-l']))) {
      if (pick['fc-ciudad-l']) ciudadL.value = pick['fc-ciudad-l'];
    }
    if (barrioL && (!barrioL.value.trim())) {
      if (pick['fc-barrio-l']) barrioL.value = pick['fc-barrio-l'];
    }
    if (direccionL && (!direccionL.value.trim())) {
      if (pick['fc-direccion-l']) direccionL.value = pick['fc-direccion-l'];
    }
    if (linea && (!linea.value.trim())) {
      if (pick['fc-lineabaja']) linea.value = pick['fc-lineabaja'];
    }

    showToast('✓ Datos laborales autocompletados desde empresa similar: ' + (pick['fc-empresa'] || ''));
    fcSaveData();
    return pick;
  }

  return null;
}


document.getElementById('fc-empresa')?.addEventListener('blur', () => tryFillFromCompany({ from: 'empresa' }));
document.getElementById('fc-ciudad-p')?.addEventListener('change', () => tryFillFromCompany({ from: 'ciudad' }));

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
  const currentData = formRead();
  const hasCurrentData = fcHasMeaningfulData(currentData);
  if (hasCurrentData) saveCurrentClient({ silent: true });

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
        <div class="kcard-sync-status${c._remoteSynced ? ' is-synced' : ''}">
          ${c._remoteSynced ? '✓ Guardado en nube' : 'Pendiente de sincronizar'}
        </div>
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

  
  board.querySelectorAll('.kcard-load').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      switchToClient(btn.dataset.id);
      document.getElementById('clientListPanel').style.display = 'none';
      document.querySelectorAll('.pipeline-tab').forEach(t => t.classList.remove('active'));
    });
  });

  
  board.querySelectorAll('.kcard-del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const ok = await (window.Swal ? window.Swal.confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.') : Promise.resolve(confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')));
      if (!ok) return;
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
  function selectCity(city) {
    input.value = city;
    hideDropdown();
    fcSaveData();
    applyEntityAvailabilityRules();
    input.dispatchEvent(new Event('input'));
  }
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


function tryFillLaborFromSavedCompany(client) {
  try {
    if (!client || !client['fc-empresa']) return null;
    const all = clientsLoad().filter(c => c.id !== client.id && c['fc-empresa']);
    if (!all.length) return null;

    const matches = all.filter(c => companyNameMatches(c['fc-empresa'], client['fc-empresa']));
    if (!matches.length) return null;

    const needId = !(client['fc-idempleador'] || '').trim();
    const needCiudad = !(client['fc-ciudad-l'] || '').trim();
    const needBarrio = !(client['fc-barrio-l'] || '').trim();
    const needDireccion = !(client['fc-direccion-l'] || '').trim();
    const needLinea = !(client['fc-lineabaja'] || '').trim();
    if (!needId && !needCiudad && !needBarrio && !needDireccion && !needLinea) return null;

    
    let pick = matches.find(c => cityIsPriority(c['fc-ciudad-l']));
    if (!pick && client['fc-ciudad-l']) pick = matches.find(c => companyNameMatches(c['fc-ciudad-l'], client['fc-ciudad-l']));
    if (!pick) pick = matches.find(c => (c['fc-idempleador'] || c['fc-barrio-l'] || c['fc-direccion-l'] || c['fc-lineabaja']));
    if (!pick) return null;

    
    const ideEl = document.getElementById('fc-idempleador');
    const ciudadL = document.getElementById('fc-ciudad-l');
    const barrioL = document.getElementById('fc-barrio-l');
    const direccionL = document.getElementById('fc-direccion-l');
    const lineaEl = document.getElementById('fc-lineabaja');

    if (needId && pick['fc-idempleador']) {
      if (ideEl) ideEl.value = pick['fc-idempleador'];
      client['fc-idempleador'] = pick['fc-idempleador'];
    }
    if (needCiudad && pick['fc-ciudad-l']) {
      if (ciudadL) ciudadL.value = pick['fc-ciudad-l'];
      client['fc-ciudad-l'] = pick['fc-ciudad-l'];
    }
    if (needBarrio && pick['fc-barrio-l']) {
      if (barrioL) barrioL.value = pick['fc-barrio-l'];
      client['fc-barrio-l'] = pick['fc-barrio-l'];
    }
    if (needDireccion && pick['fc-direccion-l']) {
      if (direccionL) direccionL.value = pick['fc-direccion-l'];
      client['fc-direccion-l'] = pick['fc-direccion-l'];
    }
    if (needLinea && pick['fc-lineabaja']) {
      if (lineaEl) lineaEl.value = pick['fc-lineabaja'];
      client['fc-lineabaja'] = pick['fc-lineabaja'];
    }

    
    try {
      const arr = clientsLoad();
      const idx = arr.findIndex(c => c.id === client.id);
      if (idx >= 0) {
        arr[idx] = Object.assign({}, arr[idx], client);
        clientsSave(arr);
      }
    } catch (e) { /* ignore */ }

    showToast('✓ Datos laborales completados desde otras solicitudes guardadas');
    fcSaveData();
    return pick;
  } catch (e) { return null; }
}



function tryFillStreetsFromSimilar(client) {
  try {
    if (!client) return null;
    const ciudad = (client['fc-ciudad-p'] || '').trim();
    const barrio = (client['fc-barrio-p'] || '').trim();
    if (!ciudad || !barrio) return null;

    
    if ((client['fc-direccion-p'] || '').trim()) return null;

    const others = clientsLoad().filter(c => c.id !== client.id);
    if (!others.length) return null;

    const match = others.find(c => {
      const cc = (c['fc-ciudad-p'] || c['fc-ciudad-l'] || '').trim();
      const bb = (c['fc-barrio-p'] || c['fc-barrio-l'] || '').trim();
      if (!cc || !bb) return false;
      return companyNameMatches(cc, ciudad) && companyNameMatches(bb, barrio);
    });
    if (!match) return null;

    const direccion = match['fc-direccion-p'] || match['fc-direccion-l'] || '';
    if (!direccion) return null;

    
    const dirEl = document.getElementById('fc-direccion-p');
    if (dirEl) dirEl.value = direccion;
    client['fc-direccion-p'] = direccion;

    try {
      const arr = clientsLoad();
      const idx = arr.findIndex(c => c.id === client.id);
      if (idx >= 0) { arr[idx] = Object.assign({}, arr[idx], client); clientsSave(arr); }
    } catch (e) { /* ignore */ }

    showToast('✓ Calle autocompletada desde solicitud similar');
    fcSaveData();
    return match;
  } catch (e) { return null; }
}


function createCompanyAutocomplete(input) {
  if (!input) return;
  const dropdown = document.createElement('div');
  dropdown.className = 'ac-dropdown ac-companies';
  dropdown.setAttribute('role', 'listbox');
  input.parentElement.style.position = 'relative';
  input.parentElement.appendChild(dropdown);

  let activeIdx = -1;

  function render(results) {
    activeIdx = -1; dropdown.innerHTML = '';
    if (!results.length) { hide(); return; }
    results.forEach((r, i) => {
      const item = document.createElement('div');
      item.className = 'ac-item ac-company-item';
      item.setAttribute('role','option');
      item.dataset.idx = i;
      item.innerHTML = `<strong>${escapeHtml(r.company)}</strong> <span class="ac-muted">— ${escapeHtml(r.city||'')}</span>`;
      item.addEventListener('mousedown', e => { e.preventDefault(); select(r); });
      dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
  }
  function hide() { dropdown.style.display = 'none'; activeIdx = -1; }
  function select(r) {
    input.value = r.company || '';
    
    if (r.city) document.getElementById('fc-ciudad-l').value = r.city;
    if (r.barrio) document.getElementById('fc-barrio-l').value = r.barrio;
    if (r.direccion) document.getElementById('fc-direccion-l').value = r.direccion;
    if (r.idempleador) document.getElementById('fc-idempleador').value = r.idempleador;
    if (r.linea) document.getElementById('fc-lineabaja').value = r.linea;
    hide();
    fcSaveData();
  }
  function highlight(idx) {
    const items = dropdown.querySelectorAll('.ac-item');
    items.forEach((el,i)=>el.classList.toggle('ac-active', i===idx));
    if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
    activeIdx = idx;
  }

  input.addEventListener('input', () => {
    const term = input.value.trim();
    if (term.length < 1) { hide(); return; }
    const all = clientsLoad();
    const map = new Map();
    const nt = normalizeForCompare(term);
    for (const c of all) {
      if (!c['fc-empresa']) continue;
      const nc = normalizeForCompare(c['fc-empresa']);
      if (!nc.includes(nt)) continue;
      const key = nc + '|' + (normalizeForCompare(c['fc-ciudad-l']) || '');
      if (map.has(key)) continue;
      map.set(key, {
        company: c['fc-empresa'],
        city: c['fc-ciudad-l'] || c['fc-ciudad-p'] || '',
        barrio: c['fc-barrio-l'] || '',
        direccion: c['fc-direccion-l'] || '',
        idempleador: c['fc-idempleador'] || '',
        linea: c['fc-lineabaja'] || ''
      });
    }
    render(Array.from(map.values()).slice(0, 12));
  });

  input.addEventListener('keydown', e => {
    if (dropdown.style.display === 'none') return;
    const items = dropdown.querySelectorAll('.ac-item'); const count = items.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight((activeIdx+1)%count); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight((activeIdx-1+count)%count); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); const items = dropdown.querySelectorAll('.ac-item'); items[activeIdx] && items[activeIdx].dispatchEvent(new Event('mousedown')); }
    else if (e.key === 'Escape') hide();
  });

  input.addEventListener('blur', () => setTimeout(hide, 150));
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
  if (!/^[0-9]+$/.test(ide)) {
    if (!silent) showToast('⚠ El ID Empleador debe ser numérico');
    return;
  }
  
  let cfg = {};
  try { cfg = JSON.parse(localStorage.getItem(FC_IPS_CONFIG) || '{}'); } catch(e) { cfg = {}; }
  const codPeriod = cfg.cod_period || '1002,1001,1000';
  const url = new URL('https://servicios.ips.gov.py/miips/inf_tarjetita_pdf.php');
  url.search = new URLSearchParams({
    ide_emplea: ide,
    cod_period: codPeriod,
    ide_asecot: cecot,
    order: ''
  }).toString();
  
  if (urlOut)  urlOut.value = url.toString();
  if (openBtn) { openBtn.href = url.toString(); openBtn.style.display = 'inline-flex'; }
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

  
  try {
    const genBtn = document.getElementById('fc-genurl');
    if (genBtn && !document.getElementById('fc-edit-ips-config')) {
      const editBtn = document.createElement('button');
      editBtn.id = 'fc-edit-ips-config';
      editBtn.type = 'button';
      editBtn.className = 'btn small';
      editBtn.style.marginLeft = '6px';
      editBtn.textContent = 'Editar cod_period';
      genBtn.parentElement?.insertBefore(editBtn, genBtn.nextSibling);
      editBtn.addEventListener('click', () => {
        let cfg = {};
        try { cfg = JSON.parse(localStorage.getItem(FC_IPS_CONFIG) || '{}'); } catch(e) { cfg = {}; }
        const current = cfg.cod_period || '1002,1001,1000';
        const val = prompt('Ingrese cod_period (coma separado):', current);
        if (val === null) return;
        cfg.cod_period = val.trim() || current;
        localStorage.setItem(FC_IPS_CONFIG, JSON.stringify(cfg));
        showToast('✓ cod_period guardado');
      });
    }
  } catch(e) { /* ignore DOM issues */ }
}

/* ============================================================
   M. ENTITY TOOLTIPS
   ============================================================ */
function initEntityTooltips() {
  const tooltip = document.getElementById('entityTooltip');
  if (!tooltip) return;
  const buttons = [...document.querySelectorAll('.entity-info-btn')];
  if (!buttons.length) return;

  let activeBtn = null;

  function hideTooltip() {
    activeBtn = null;
    tooltip.style.display = 'none';
    tooltip.classList.remove('is-visible');
    tooltip.removeAttribute('data-placement');
  }

  function positionTooltip(btn) {
    if (!btn) return;

    tooltip.style.display = 'block';
    tooltip.classList.add('is-visible');
    tooltip.style.visibility = 'hidden';

    const rect = btn.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const gap = 12;
    const viewportPadding = 12;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - tooltipRect.width - viewportPadding);
    const left = Math.min(
      Math.max(rect.left + (rect.width / 2) - (tooltipRect.width / 2), viewportPadding),
      maxLeft
    );

    let top = rect.top - tooltipRect.height - gap;
    let placement = 'top';
    if (top < viewportPadding) {
      top = Math.min(rect.bottom + gap, window.innerHeight - tooltipRect.height - viewportPadding);
      placement = 'bottom';
    }

    const arrowLeft = Math.min(
      Math.max((rect.left + (rect.width / 2)) - left, 16),
      Math.max(16, tooltipRect.width - 16)
    );

    tooltip.dataset.placement = placement;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.setProperty('--tooltip-arrow-left', `${arrowLeft}px`);
    tooltip.style.visibility = 'visible';
  }

  function showTooltip(btn) {
    activeBtn = btn;
    tooltip.textContent = btn.dataset.info || '';
    positionTooltip(btn);
  }

  buttons.forEach(btn => {
    btn.addEventListener('pointerenter', () => showTooltip(btn));
    btn.addEventListener('pointermove', () => {
      if (activeBtn === btn) positionTooltip(btn);
    });
    btn.addEventListener('pointerleave', () => {
      if (activeBtn === btn) hideTooltip();
    });
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (activeBtn === btn) {
        hideTooltip();
        return;
      }
      showTooltip(btn);
    });
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.entity-info-btn')) hideTooltip();
  });

  window.addEventListener('resize', () => {
    if (activeBtn) positionTooltip(activeBtn);
  });

  window.addEventListener('scroll', () => {
    if (activeBtn) positionTooltip(activeBtn);
  }, true);
}

/* ============================================================
   N. PERSISTENCIA DRAFT
   ============================================================ */
function fcSaveData() {
  const data = formRead();
  data._activeClientId = fc_activeClientId;
  localStorage.setItem(FC_STORAGE_KEY, JSON.stringify(data));
  if (fc_activeClientId) uiMarkDirty();
  fcScheduleClientAutoSave();
  applyEntityAvailabilityRules();
  pipelineUpdateCounts();
}

function fcScheduleClientAutoSave() {
  clearTimeout(fc_autoSaveTimer);
  if (!fcCanAutoSaveClient()) return;

  fc_autoSaveTimer = setTimeout(() => {
    fc_autoSaveTimer = null;
    const saved = saveCurrentClient({ silent: true });
    const panel = document.getElementById('clientListPanel');
    if (saved && panel?.style.display !== 'none') buildKanban();
  }, 500);
}

function fcFlushAutoSave() {
  clearTimeout(fc_autoSaveTimer);
  fc_autoSaveTimer = null;
  if (fcCanAutoSaveClient()) saveCurrentClient({ silent: true });
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
    
    try { updateAgeInfo(); } catch(e){}
    const cecot = document.getElementById('fc-cecot')?.value.trim();
    const ide   = document.getElementById('fc-idempleador')?.value.trim();
    if (cecot && ide) generateIpsUrl(true);
  } catch(e) {
    console.warn('[FC] Error cargando draft:', e);
  }
  fcResetUndoHistory();
}

/* ============================================================
   N.1 DESHACER (Ctrl+Z) — solo dentro del formulario actual
   ============================================================ */
function fcUpdateUndoButtonState() {
  const btn = document.getElementById('fc-undo');
  if (btn) btn.disabled = fc_undoStack.length === 0;
}

function fcResetUndoHistory() {
  fc_undoStack = [];
  fc_undoEditSnapshot = null;
  fcUpdateUndoButtonState();
}

function fcCaptureUndoSnapshot() {
  if (fc_undoApplying) return;
  fc_undoEditSnapshot = JSON.stringify(formRead());
}

function fcCommitUndoSnapshot() {
  if (fc_undoApplying || fc_undoEditSnapshot === null) return;
  const before = fc_undoEditSnapshot;
  fc_undoEditSnapshot = null;
  const current = JSON.stringify(formRead());
  if (current === before) return;
  const last = fc_undoStack[fc_undoStack.length - 1];
  if (last === before) return;
  fc_undoStack.push(before);
  if (fc_undoStack.length > FC_UNDO_LIMIT) fc_undoStack.shift();
  fcUpdateUndoButtonState();
}

function fcApplyUndoSnapshot(snapshot) {
  fc_undoApplying = true;
  try {
    formWrite(snapshot);
    try { updateAgeInfo(); } catch(e){}
    try { applyEntityAvailabilityRules(); } catch(e){}
    try { syncUpperCopyButtonLabel(); } catch(e){}
    fcSaveData();
  } finally {
    fc_undoApplying = false;
  }
  showToast('↩ Cambio deshecho');
}

function fcUndo() {

  if (fc_undoEditSnapshot !== null) {
    const before = fc_undoEditSnapshot;
    const current = JSON.stringify(formRead());
    fc_undoEditSnapshot = null;
    if (before !== current) {
      fcApplyUndoSnapshot(JSON.parse(before));
      fcUpdateUndoButtonState();
      return;
    }
  }

  if (!fc_undoStack.length) { showToast('⚠ No hay cambios para deshacer'); return; }
  fcApplyUndoSnapshot(JSON.parse(fc_undoStack.pop()));
  fcUpdateUndoButtonState();
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
    clearTimeout(fc_autoSaveTimer);
    fc_autoSaveTimer = null;
    
    const data = formRead();
    const hasData = fcHasMeaningfulData(data);
    if (hasData) saveCurrentClient({ silent: true });

    fc_activeClientId = null;
    formClear();

    const est = document.getElementById('fc-estadocivil');
    if (est) est.value = 'Soltero/a';

    uiSetActiveClient(null, null);
    if (panel) panel.style.display = 'none';
    localStorage.removeItem(FC_STORAGE_KEY);
    document.querySelectorAll('.pipeline-tab').forEach(t => t.classList.remove('active'));
    fcResetUndoHistory();
    showToast('🆕 Formulario listo para nuevo cliente');
  });

  document.getElementById('fc-save-client')?.addEventListener('click', () => {
    saveCurrentClient();
    const panel = document.getElementById('clientListPanel');
    if (panel?.style.display !== 'none') buildKanban();
  });

  // Envío al servidor sólo bajo demanda (antes se enviaba con cada cambio de input).
  document.getElementById('fc-sync-client')?.addEventListener('click', () => {
    const saved = saveCurrentClient({ silent: true });
    if (!saved) {
      showToast('⚠ Completá al menos un dato del cliente antes de sincronizar');
      return;
    }
    if (!window.RemoteSync?.queueClient) {
      showToast('⚠ Remote Sync no está disponible');
      return;
    }
    window.RemoteSync.queueClient(saved);
  });

  document.getElementById('downloadAllBtn')?.addEventListener('click', downloadAllClients);

  // Los contadores también cambian cuando llegan clientes del servidor o se
  // borran desde Búsqueda/Sync (antes quedaban en 0 tras la descarga inicial).
  let countsFrame = 0;
  window.addEventListener('tufi:clients-changed', () => {
    if (countsFrame) return;
    countsFrame = requestAnimationFrame(() => { countsFrame = 0; pipelineUpdateCounts(); });
  });

  pipelineUpdateCounts();
})();

/* ============================================================
   Q. EVENTOS FORMULARIO
   ============================================================ */
(function initFormContact() {
  const form = document.getElementById('creditForm');

  form?.addEventListener('submit', event => {
    event.preventDefault();
    saveCurrentClient();
    const panel = document.getElementById('clientListPanel');
    if (panel?.style.display !== 'none') buildKanban();
  });

  FC_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input',  fcSaveData);
    el.addEventListener('change', fcSaveData);
    el.addEventListener('focus', fcCaptureUndoSnapshot);
    el.addEventListener('blur',  fcCommitUndoSnapshot);
    el.addEventListener('change', fcCommitUndoSnapshot);
    el.addEventListener('blur', fcFlushAutoSave);
    el.addEventListener('change', fcFlushAutoSave);
  });

  document.querySelectorAll('input[name="entidad"]').forEach(cb => {
    cb.addEventListener('focus', fcCaptureUndoSnapshot);
    cb.addEventListener('change', fcCommitUndoSnapshot);
    cb.addEventListener('blur', fcFlushAutoSave);
  });

  document.getElementById('fc-undo')?.addEventListener('click', fcUndo);

  document.getElementById('creditForm')?.closest('.form-container')?.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    fcUndo();
  });

  const nombresInput = document.getElementById('fc-nombres');
  if (nombresInput) {
    nombresInput.addEventListener('input', () => applyStructuredFcNamePattern(nombresInput));
    nombresInput.addEventListener('change', () => applyStructuredFcNamePattern(nombresInput));
    nombresInput.addEventListener('paste', () => {
      setTimeout(() => applyStructuredFcNamePattern(nombresInput), 0);
    });
  }

  document.querySelectorAll('input[name="entidad"]').forEach(cb => {
    cb.addEventListener('change', () => {
      fcSaveData();
      syncUpperCopyButtonLabel();
      applyEntityAvailabilityRules();
      fcFlushAutoSave();
    });
  });

  ['fc-ciudad-p', 'fc-empresa', 'fc-salario', 'fc-fechanac'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      applyEntityAvailabilityRules();
      fcSaveData();
    });
    el.addEventListener('change', () => {
      applyEntityAvailabilityRules();
      fcSaveData();
    });
  });

  applyEntityAvailabilityRules();
  syncUpperCopyButtonLabel();

  
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

  
  document.getElementById('fc-clear')?.addEventListener('click', () => {
    if (!confirm('¿Limpiar todos los campos?')) return;
    clearTimeout(fc_autoSaveTimer);
    fc_autoSaveTimer = null;
    fc_activeClientId = null;
    uiSetActiveClient(null, null);
    formClear();
    localStorage.removeItem(FC_STORAGE_KEY);
    fcResetUndoHistory();
    showToast('🗑 Formulario limpiado');
  });

  
  document.getElementById('fc-copy')?.addEventListener('click', () => {
    const text = fcGenerateText();
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => showToast('✓ Copiado al portapapeles'))
        .catch(() => fallbackCopy(text));
    } else { fallbackCopy(text); }
  });

  
  document.getElementById('fc-download')?.addEventListener('click', () => {
    saveCurrentClient({ silent: true });
    const client   = fc_activeClientId ? clientById(fc_activeClientId) : null;
    const filename = buildFilename(client || { displayName: 'solicitud', cedula: '' });
    downloadTxt(fcGenerateText(), filename);
    showToast('✓ Descargado: ' + filename);
  });

  
  createCityAutocomplete(document.getElementById('fc-ciudad-p'));
  createCityAutocomplete(document.getElementById('fc-ciudad-l'));
  
  createCompanyAutocomplete(document.getElementById('fc-empresa'));

  initUrlGenerator();
  initEntityTooltips();
  
  try {
    const est = document.getElementById('fc-estadocivil');
    if (est && (!est.value || est.value.trim() === '' || est.value === 'Soltero')) {
      est.value = 'Soltero/a';
    }
  } catch(e){}

  
  document.querySelectorAll('input[name="entidad"]').forEach(cb => {
    try {
      cb.checked = false;
      cb.dataset.default = 'negative';
    } catch(e){}
  });
  applyEntityAvailabilityRules();

  
  try {
    const copyBtn = document.getElementById('fc-copy');
    if (copyBtn && !document.getElementById('fc-copy-upper')) {
      const upBtn = document.createElement('button');
      upBtn.id = 'fc-copy-upper';
      upBtn.type = 'button';
      upBtn.className = 'btn';
      upBtn.style.marginLeft = '6px';
      upBtn.textContent = 'Copiar MAYÚSCULAS (SERFIN S.A.)';
      copyBtn.parentElement?.insertBefore(upBtn, copyBtn.nextSibling);
      syncUpperCopyButtonLabel();
      upBtn.addEventListener('click', () => {
        const text = fcGenerateTextUpper();
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(() => showToast('✓ Copiado en mayúsculas'))
            .catch(() => fallbackCopy(text));
        } else { fallbackCopy(text); }
      });
    }
  } catch(e){}

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


function fcClearFields() { formClear(); }

window.TufiFormContact = {
  buildFilename,
  clientById,
  clientsLoad,
  fcHasMeaningfulData,
  fcGenerateText,
  fcGenerateTextForClient,
  loadClientData,
  formRead,
  saveCurrentClient,
  clientsSave,
  stageLabelMap: STAGE_LABEL,
  switchToClient,
  getActiveClientId: () => fc_activeClientId
};
