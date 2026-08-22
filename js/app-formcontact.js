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

const FC_IGNORED_MEANINGFUL_FIELDS = new Set(['fc-etapa', 'fc-origen']);

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

// IPS config key
const FC_IPS_CONFIG = 'tufi_ips_config_v1';

// Small helper to parse dd/mm/yyyy into Date (returns null if invalid)
function parseDateDMY(str) {
  if (!str) return null;
  const parts = str.split('/').map(s => s.trim());
  if (parts.length < 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const y = parseInt(parts[2], 10);
  if (Number.isNaN(d) || Number.isNaN(m) || Number.isNaN(y)) return null;
  // Validate reasonable month/day ranges
  if (m < 0 || m > 11) return null;
  if (d < 1 || d > 31) return null;
  // validate day against month length
  const mdays = new Date(y, m + 1, 0).getDate();
  if (d > mdays) return null;
  return new Date(y, m, d);
}

function fcHasMeaningfulData(data = formRead()) {
  const hasTextData = FC_FIELD_IDS.some(id => {
    if (FC_IGNORED_MEANINGFUL_FIELDS.has(id)) return false;
    const value = data[id];
    return typeof value === 'string' && value.trim() !== '';
  });

  return hasTextData || (Array.isArray(data._entidades) && data._entidades.length > 0);
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
  window.dispatchEvent(new Event('tufi:clients-changed'));
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
  if (!fcHasMeaningfulData(data)) {
    if (!opts.silent) showToast('âš  CompletÃ¡ al menos un dato del cliente antes de guardar');
    return null;
  }
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
  const hasData = fcHasMeaningfulData(current);
  if (hasData) saveCurrentClient({ silent: true });

  const client = clientById(newId);
  if (!client) return;
  formClear();
  formWrite(client);
  // Try to supplement laboral fields from other saved clients if missing
  tryFillLaborFromSavedCompany(client);
  // Try to fill personal streets if ciudad + barrio match existing records
  tryFillStreetsFromSimilar(client);
  fc_activeClientId = client.id;
  uiSetActiveClient(client.id, client.displayName);

  // Update age display for the loaded client if fecha exists
  try { updateAgeInfo(); } catch(e){}

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

function fcGenerateTextUpper() {
  const entLabel = 'SERFIN S.A.'; // force entity when copying upper
  const get = id => (document.getElementById(id)?.value.trim() || '—');

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

// Sanitize cédula (remove dots and spaces)
const cedEl = document.getElementById('fc-cedula');
cedEl?.addEventListener('input', () => {
  cedEl.value = cedEl.value.replace(/[.\s]/g, '');
  cedEl.classList.remove('fc-dup-error');
});

// Duplicate CI check on blur: if exists, load client data, mark input red, clear and blur
cedEl?.addEventListener('blur', () => {
  const ci = cedEl.value.trim();
  if (!ci) return;
  const clients = clientsLoad();
  const found = clients.find(c => (c.cedula || '') === ci);
  if (found) {
    // Load existing client data, but visually block editing cedula
    formClear();
    formWrite(found);
    fc_activeClientId = found.id;
    uiSetActiveClient(found.id, found.displayName);
    cedEl.classList.add('fc-dup-error');
    cedEl.blur();
    showToast('⚠ Cédula ya existe — cargando datos guardados');
  }
});

// Sanitize celular and lineabaja: remove dots/spaces, remove +, replace leading 595 with 0
function normalizePhoneValue(v) {
  if (!v) return '';
  let s = String(v).replace(/[.\s]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('595')) s = '0' + s.slice(3);
  return s;
}
const celEl = document.getElementById('fc-celular');
const bajaEl = document.getElementById('fc-lineabaja');
[celEl, bajaEl].forEach(el => {
  if (!el) return;
  el.addEventListener('input', () => {
    const pos = el.selectionStart;
    el.value = normalizePhoneValue(el.value);
    try { el.setSelectionRange(pos, pos); } catch(e){}
  });
});

// Fecha de nacimiento: normalize separators to '/', compute age live
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
  // format if user typed continuous digits like 12121212 -> 12/12/1212
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
  // If there's no value, clear the span and exit
  if (!raw || !raw.trim()) { span.textContent = ''; return; }
  let dob = parseDateDMY(raw);
  let usedFallback = false;
  if (!dob || isNaN(dob.getTime())) {
    // try a permissive fallback: extract numeric parts and build a Date even if month/day out of range
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

  // target 20th birthday
  const target = new Date(dob.getFullYear() + 20, dob.getMonth(), dob.getDate());

  // compute months, days, hours difference (if future)
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

  // Build display text. If we used permissive fallback, do not prefix with the raw date.
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

// Helpers to match company names/cities
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

// Try to find company info from saved clients and apply to form
function tryFillFromCompany(opts = {}) {
  const empresa = document.getElementById('fc-empresa')?.value.trim();
  if (!empresa) return null;
  const currentCity = document.getElementById('fc-ciudad-p')?.value.trim();
  const clients = clientsLoad();
  const candidates = clients.filter(c => c['fc-empresa'] && companyNameMatches(empresa, c['fc-empresa']));
  if (!candidates.length) return null;

  // Fill ID Empleador from first candidate that has it
  const withId = candidates.find(c => (c['fc-idempleador'] || '').trim());
  if (withId) {
    const ideEl = document.getElementById('fc-idempleador');
    if (ideEl && !ideEl.value.trim()) {
      ideEl.value = withId['fc-idempleador'] || '';
      showToast('✓ ID Empleador autocompletado desde empresa guardada');
      fcSaveData();
    }
  }

  // Choose best candidate for address/line fill
  let pick = null;
  // Priority 1: candidate whose company city is Asuncion or Central
  pick = candidates.find(c => cityIsPriority(c['fc-ciudad-l']));
  // Priority 2: if user provided currentCity, match company city to it
  if (!pick && currentCity) {
    pick = candidates.find(c => companyNameMatches(currentCity, c['fc-ciudad-l']));
  }
  // Priority 3: any candidate with useful fields
  if (!pick) {
    pick = candidates.find(c => (c['fc-barrio-l'] || c['fc-direccion-l'] || c['fc-lineabaja']));
  }

  if (pick) {
    // Fill LABORAL fields from company data when empty or when currentCity logic applies
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

// Listen to empresa blur and ciudad-p change
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

// Try to complete laboral data for a loaded client from other saved clients
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

    // Prefer candidates in Asuncion/Central or matching city
    let pick = matches.find(c => cityIsPriority(c['fc-ciudad-l']));
    if (!pick && client['fc-ciudad-l']) pick = matches.find(c => companyNameMatches(c['fc-ciudad-l'], client['fc-ciudad-l']));
    if (!pick) pick = matches.find(c => (c['fc-idempleador'] || c['fc-barrio-l'] || c['fc-direccion-l'] || c['fc-lineabaja']));
    if (!pick) return null;

    // Apply to DOM and persist to saved client
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

    // Persist changes into clients storage for this client
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

// If a loaded client's ciudad-p and barrio-p are similar to some saved client,
// fill the personal direccion-p from the first match found.
function tryFillStreetsFromSimilar(client) {
  try {
    if (!client) return null;
    const ciudad = (client['fc-ciudad-p'] || '').trim();
    const barrio = (client['fc-barrio-p'] || '').trim();
    if (!ciudad || !barrio) return null;

    // If client already has direccion-p, nothing to do
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

    // Apply to DOM and persist
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

// Autocomplete for company input: show company + city suggestions from saved clients
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
    // fill laboral fields
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
  // Load stored cod_period (single-time configurable by user)
  let cfg = {};
  try { cfg = JSON.parse(localStorage.getItem(FC_IPS_CONFIG) || '{}'); } catch(e) { cfg = {}; }
  const codPeriod = cfg.cod_period || '1002,1001,1000';
  const url = `https://servicios.ips.gov.py/miips/inf_tarjetita_pdf.php?ide_emplea=${encodeURIComponent(ide)}&cod_period=${encodeURIComponent(codPeriod)}&ide_asecot=${encodeURIComponent(cecot)}&order=`;
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

  // Add an Edit button to configure cod_period once (persists until edited)
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
    // Ensure age info is updated after loading draft data
    try { updateAgeInfo(); } catch(e){}
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
    const hasData = fcHasMeaningfulData(data);
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
  // Autocomplete empresas (show company + city suggestions)
  createCompanyAutocomplete(document.getElementById('fc-empresa'));

  initUrlGenerator();
  initEntityTooltips();
  // Defaults: estado civil = Soltero (if empty)
  try {
    const est = document.getElementById('fc-estadocivil');
    if (est && (!est.value || est.value.trim() === '')) est.value = 'Soltero';
  } catch(e){}

  // Entities: by default mark checked and add marker (will not change labels)
  document.querySelectorAll('input[name="entidad"]').forEach(cb => {
    try { cb.checked = true; cb.dataset.default = 'negative'; } catch(e){}
  });

  // Add button to copy entire form in UPPERCASE and set entidad to SERFIN S.A. in the copied text
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

// Alias de compatibilidad
function fcClearFields() { formClear(); }

window.TufiFormContact = {
  buildFilename,
  clientById,
  clientsLoad,
  fcHasMeaningfulData,
  fcGenerateText,
  fcGenerateTextForClient,
  formRead,
  saveCurrentClient,
  stageLabelMap: STAGE_LABEL,
  switchToClient,
  getActiveClientId: () => fc_activeClientId
};
