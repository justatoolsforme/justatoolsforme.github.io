/* ============================================================
   TUFI TOOLS — app-remote-sync.js
   Remote sync: store server config, ping, send clients and PDF notifications
   ============================================================ */
'use strict';

const REMOTE_CONFIG_KEY = 'tufi_remote_config_v1';
const REMOTE_CLIENTS_KEY = 'tufi_clients_v3';
let remoteApplyingServerChanges = false;
let remoteConfigRevision = 0;
const remoteSendingClientIds = new Set();
const remotePendingClients = new Map();

const CLIENT_FIELD_ALIASES = {
  nombres: ['nombre', 'firstName', 'first_name'],
  apellidos: ['apellido', 'lastName', 'last_name'],
  cedula: ['ci', 'documento', 'document_number'],
  fechanac: ['fecha_nacimiento', 'fechaNacimiento', 'birthDate', 'birth_date'],
  empresa: ['employer', 'company'],
  salario: ['salary'],
  cargo: ['jobTitle', 'job_title', 'position'],
  cecot: ['ips'],
  idempleador: ['id_empleador', 'employerId', 'employer_id']
};
const CLIENT_INTERNAL_FIELDS = new Set(['_remoteSynced', '_remoteDeleted', '_deleted', '_searchDraft', '_activeClientId']);

function remoteLoadConfig() {
  try { return JSON.parse(localStorage.getItem(REMOTE_CONFIG_KEY) || '{}'); }
  catch (error) {
    console.error('[RemoteSync] Configuración local inválida:', error);
    showToast('⚠ La configuración de Remote Sync no se pudo leer');
    return {};
  }
}
function remoteSaveConfig(cfg, configChanged = false) {
  const savedConfig = { ...(cfg || {}) };
  if (configChanged) {
    delete savedConfig._lastPing;
    remoteConfigRevision += 1;
  }
  localStorage.setItem(REMOTE_CONFIG_KEY, JSON.stringify(savedConfig));
}
function remoteNotifyPingStatus(ok, revision) {
  window.dispatchEvent(new CustomEvent('tufi:remote-ping-status', {
    detail: { ok: Boolean(ok), revision }
  }));
}

function buildBaseUrl(cfg) {
  if (!cfg || !cfg.url) return null;
  // if user included scheme, use as-is
  if (/^https?:\/\//i.test(cfg.url)) return cfg.url.replace(/\/$/, '');
  const scheme = cfg.useHttps ? 'https' : 'http';
  const port = cfg.port ? `:${cfg.port}` : '';
  return `${scheme}://${cfg.url.replace(/\/$/, '')}${port}`;
}

async function testPing({ allowDisabled = false } = {}) {
  const cfg = remoteLoadConfig();
  if (!cfg || (!cfg.enabled && !allowDisabled)) return false;
  const base = buildBaseUrl(cfg);
  if (!base) return false;
  const pingPath = (cfg.endpoints && cfg.endpoints.ping) || '/ping';
  const url = base + pingPath;
  try {
    const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${cfg.token || ''}` } });
    if (!res.ok) return false;
    const text = await res.text();
    if (!text) return false;
    if (/pong/i.test(text) || /"pong"\s*:\s*true/i.test(text)) {
      try { const c = remoteLoadConfig(); c._lastPing = Date.now(); remoteSaveConfig(c); } catch(e){}
      return true;
    }
    return false;
  } catch (e) { return false; }
}

async function sendJson(path, payload) {
  const cfg = remoteLoadConfig();
  const base = buildBaseUrl(cfg);
  if (!base) throw new Error('remote_not_configured');
  const url = base + (path.startsWith('/') ? path : `/${path}`);
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  const text = await res.text();
  if (!res.ok) throw new Error('remote_error_' + res.status + (text ? `: ${text}` : ''));
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function getClientField(client, field) {
  const value = client?.[`fc-${field}`];
  if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  if (client?.[field] !== undefined && client[field] !== null && String(client[field]).trim() !== '') return client[field];
  for (const alias of CLIENT_FIELD_ALIASES[field] || []) {
    if (client?.[alias] !== undefined && client[alias] !== null && String(client[alias]).trim() !== '') return client[alias];
  }
  return '';
}

function normalizeRemoteClient(client) {
  const normalized = { ...client };
  Object.keys(CLIENT_FIELD_ALIASES).forEach(field => {
    const value = getClientField(client, field);
    if (value !== '') normalized[`fc-${field}`] = value;
  });
  const cedula = getClientField(normalized, 'cedula');
  if (cedula !== '') normalized.cedula = cedula;
  const nombres = getClientField(normalized, 'nombres');
  const apellidos = getClientField(normalized, 'apellidos');
  if (!normalized.displayName && (nombres || apellidos)) normalized.displayName = `${nombres} ${apellidos}`.trim();
  return normalized;
}

function clientToApiPayload(client) {
  const payload = { ...client };
  delete payload._remoteSynced;
  delete payload._remoteDeleted;
  delete payload._searchDraft;
  return payload;
}

function isFilled(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function countFilled(client) {
  const fields = new Set();
  Object.keys(client || {}).forEach(key => {
    if (CLIENT_INTERNAL_FIELDS.has(key) || ['id', 'clientId', 'displayName', 'savedAt', 'created_at', 'updated_at'].includes(key)) return;
    const value = client[key];
    if (!isFilled(value)) return;
    const normalizedKey = key.replace(/^fc-/, '');
    const canonical = Object.keys(CLIENT_FIELD_ALIASES).find(field =>
      field === normalizedKey || CLIENT_FIELD_ALIASES[field].includes(normalizedKey)
    ) || normalizedKey;
    fields.add(canonical);
  });
  return fields.size;
}

function clientContentSignature(client) {
  const normalized = normalizeRemoteClient(client);
  const fields = Object.keys(normalized)
    .filter(key => !CLIENT_INTERNAL_FIELDS.has(key)
      && !['savedAt', 'created_at', 'updated_at'].includes(key))
    .sort()
    .map(key => [key, normalized[key]]);
  return JSON.stringify(fields);
}

function normalizeIdentity(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function clientsMatch(first, second) {
  if (first?.id && second?.id && String(first.id) === String(second.id)) return true;
  const firstCedula = normalizeIdentity(getClientField(first, 'cedula'));
  const secondCedula = normalizeIdentity(getClientField(second, 'cedula'));
  if (firstCedula && secondCedula && firstCedula === secondCedula) return true;
  const firstCecot = normalizeIdentity(getClientField(first, 'cecot'));
  const secondCecot = normalizeIdentity(getClientField(second, 'cecot'));
  const firstEmployer = normalizeIdentity(getClientField(first, 'idempleador'));
  const secondEmployer = normalizeIdentity(getClientField(second, 'idempleador'));
  return Boolean(firstCecot && secondCecot && firstEmployer && secondEmployer
    && firstCecot === secondCecot && firstEmployer === secondEmployer);
}

function mergeClientRecords(first, second, preferredId = '') {
  const normalizedFirst = normalizeRemoteClient(first);
  const normalizedSecond = normalizeRemoteClient(second);
  const firstIsRicher = countFilled(normalizedFirst) >= countFilled(normalizedSecond);
  const winner = firstIsRicher ? normalizedFirst : normalizedSecond;
  const other = firstIsRicher ? normalizedSecond : normalizedFirst;
  const merged = { ...other, ...winner };

  Object.keys(other).forEach(key => {
    if (!key.startsWith('_') && !isFilled(merged[key]) && isFilled(other[key])) merged[key] = other[key];
  });
  if (preferredId) merged.id = preferredId;
  else if (!merged.id) merged.id = merged.clientId || `remote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  if (!isFilled(merged._entidades) && isFilled(other._entidades)) merged._entidades = other._entidades;
  return normalizeRemoteClient(merged);
}

function mergeClientLists(localClients, remoteClients) {
  const merged = [];
  [...localClients, ...remoteClients].forEach(record => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return;
    const existingIndex = merged.findIndex(existing => clientsMatch(existing, record));
    if (existingIndex < 0) {
      merged.push(normalizeRemoteClient(record));
    } else {
      const current = merged[existingIndex];
      merged[existingIndex] = mergeClientRecords(current, record, current.id || record.id || '');
    }
  });
  return merged;
}

function loadLocalClients() {
  const apiClients = window.TufiFormContact?.clientsLoad?.();
  if (Array.isArray(apiClients)) return apiClients;
  try {
    const parsed = JSON.parse(localStorage.getItem(REMOTE_CLIENTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[RemoteSync] No se pudieron leer los clientes locales:', error);
    throw error;
  }
}

function saveLocalClients(clients) {
  remoteApplyingServerChanges = true;
  try {
    if (window.TufiFormContact?.clientsSave) {
      window.TufiFormContact.clientsSave(clients);
    } else {
      localStorage.setItem(REMOTE_CLIENTS_KEY, JSON.stringify(clients));
      window.dispatchEvent(new Event('tufi:clients-changed'));
    }
  } finally {
    remoteApplyingServerChanges = false;
  }
}

function extractClientRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') throw new Error('remote_invalid_response');
  for (const key of ['clients', 'results', 'records', 'data']) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === 'object') return extractClientRecords(payload[key]);
  }
  for (const key of ['client', 'result']) {
    if (payload[key] && typeof payload[key] === 'object') return [payload[key]];
  }
  if (getClientField(payload, 'cedula') || getClientField(payload, 'nombres')) return [payload];
  return [];
}

function buildEndpointUrl(path, query = {}) {
  const cfg = remoteLoadConfig();
  const base = buildBaseUrl(cfg);
  if (!base) throw new Error('remote_not_configured');
  const endpoint = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(base + endpoint);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function fetchJson(path, query = {}) {
  const cfg = remoteLoadConfig();
  const base = buildBaseUrl(cfg);
  if (!base) throw new Error('remote_not_configured');
  const url = buildEndpointUrl(path, query);
  const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${cfg.token || ''}` } });
  const text = await res.text();
  if (!res.ok) throw new Error('remote_error_' + res.status + (text ? `: ${text}` : ''));
  if (!text) return null;
  try { return JSON.parse(text); } catch { throw new Error('remote_invalid_json'); }
}

async function fetchPublicJson(path) {
  const cfg = remoteLoadConfig();
  const base = buildBaseUrl(cfg);
  if (!base) throw new Error('remote_not_configured');
  const endpoint = path.startsWith('/') ? path : `/${path}`;
  const res = await fetch(base + endpoint, { method: 'GET', headers: { 'Accept': 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error('remote_error_' + res.status);
  if (!text) return null;
  try { return JSON.parse(text); } catch { throw new Error('remote_invalid_json'); }
}

async function fetchRemoteClientRecords() {
  const cfg = remoteLoadConfig();
  const path = (cfg.endpoints && cfg.endpoints.list) || '/clients';
  return extractClientRecords(await fetchJson(path));
}

function filterDeletedRemoteClients(clients) {
  const isAdmin = !!remoteLoadConfig()._admin;
  return clients.filter(client => !client?._deleted || isAdmin);
}

async function remoteSearchByCedula(cedula) {
  const cfg = remoteLoadConfig();
  if (!cfg?.enabled) throw new Error('remote_not_enabled');
  const path = (cfg.endpoints && cfg.endpoints.search) || '/search';
  const records = filterDeletedRemoteClients(extractClientRecords(await fetchJson(path, { cedula })));
  return records.map(normalizeRemoteClient);
}

async function remoteSearchIp({ cecot = '', idempleador = '' } = {}) {
  const cfg = remoteLoadConfig();
  if (!cfg?.enabled) throw new Error('remote_not_enabled');
  const path = (cfg.endpoints && cfg.endpoints.searchip) || '/searchip';
  const records = filterDeletedRemoteClients(extractClientRecords(await fetchJson(path, { cecot, idempleador })));
  return records.map(normalizeRemoteClient);
}

async function remoteSearchFuncionario(cedula) {
  const cfg = remoteLoadConfig();
  if (!cfg?.enabled) throw new Error('remote_not_enabled');
  const digits = String(cedula || '').replace(/[ .-]/g, '');
  if (!/^[0-9]{5,12}$/.test(digits)) throw new Error('invalid_cedula');
  const path = (cfg.endpoints && cfg.endpoints.funcionarios) || '/funcionarios';
  let payload;
  try {
    payload = await fetchPublicJson(`${path.replace(/\/$/, '')}/${encodeURIComponent(digits)}`);
  } catch (error) {
    if (error.message === 'remote_error_404') return [];
    throw error;
  }
  if (payload?.error === 'not_found') return [];
  if (payload?.error) throw new Error(String(payload.error));
  const employee = payload?.funcionario;
  return employee && typeof employee === 'object' ? [employee] : [];
}

function syncResponseResults(response, expectedCount) {
  if (!response || !Array.isArray(response.results) || response.results.length !== expectedCount) {
    throw new Error('remote_invalid_sync_response');
  }
  const allowed = new Set(['created', 'updated', 'unchanged']);
  if (response.results.some(item => !item || !allowed.has(item.status))) {
    throw new Error('remote_invalid_sync_response');
  }
  return response.results;
}

function markSyncedClients(clients, results) {
  results.forEach(result => {
    const matched = clients.find(client =>
      (result.id && String(client.id || client.clientId || '') === String(result.id))
      || (result.cedula && normalizeIdentity(getClientField(client, 'cedula')) === normalizeIdentity(result.cedula))
    );
    if (matched) matched._remoteSynced = true;
  });
}

async function remoteFetchAllClients() {
  const cfg = remoteLoadConfig();
  if (!cfg || !cfg.enabled) {
    showToast('⚠ Remote sync no configurado');
    return false;
  }
  try {
    const remoteClients = filterDeletedRemoteClients(await fetchRemoteClientRecords());
    const local = loadLocalClients();
    const merged = mergeClientLists(local, remoteClients);
    merged.forEach(client => {
      const serverRecord = remoteClients.find(record => clientsMatch(record, client));
      client._remoteSynced = Boolean(
        serverRecord
        && (
          countFilled(serverRecord) > countFilled(client)
          || clientContentSignature(serverRecord) === clientContentSignature(client)
        )
      );
    });
    saveLocalClients(merged);
    showToast(`✓ ${merged.length} clientes cargados y conciliados desde el servidor`);
    return true;
  } catch (error) {
    console.error('[RemoteSync] Error cargando clientes:', error);
    showToast('⚠ No se pudieron cargar clientes: ' + error.message);
    return false;
  }
}

async function remoteSaveAll() {
  const cfg = remoteLoadConfig();
  if (!cfg || !cfg.enabled) {
    showToast('⚠ Remote sync no configurado');
    return false;
  }
  if (!await testPing()) {
    showToast('⚠ Ping falló: servidor no responde');
    return false;
  }

  try {
    const local = loadLocalClients();
    const pending = local.filter(client => !client._remoteSynced);
    if (!pending.length) {
      showToast('✓ Todos los clientes ya están sincronizados');
      return true;
    }
    const saveAllPath = (cfg.endpoints && cfg.endpoints.saveAll) || '/save-all';
    const response = await sendJson(saveAllPath, {
      clients: pending.map(clientToApiPayload)
    });
    const results = syncResponseResults(response, pending.length);
    markSyncedClients(local, results);
    saveLocalClients(local);
    showToast(`✓ ${results.length} clientes verificados y sincronizados`);
    return true;
  } catch (error) {
    console.error('[RemoteSync] Error sincronizando clientes:', error);
    showToast('⚠ Error sincronizando: ' + error.message);
    return false;
  }
}

async function remoteSendClient(client) {
  const cfg = remoteLoadConfig();
  if (!cfg || !cfg.enabled || remoteApplyingServerChanges) return false;
  const clientId = String(client?.id || client?.cedula || '');
  if (clientId && remoteSendingClientIds.has(clientId)) {
    remotePendingClients.set(clientId, client);
    return false;
  }
  if (clientId) remoteSendingClientIds.add(clientId);

  try {
    const outgoing = normalizeRemoteClient(client);
    const saveAllPath = (cfg.endpoints && cfg.endpoints.saveAll) || '/save-all';
    const response = await sendJson(saveAllPath, {
      clients: [clientToApiPayload(outgoing)]
    });
    const results = syncResponseResults(response, 1);

    const local = loadLocalClients();
    const updated = mergeClientLists(local, [outgoing]);
    markSyncedClients(updated, results);
    saveLocalClients(updated);
    return true;
  } catch (error) {
    console.error('[RemoteSync] Error enviando cliente:', error);
    showToast('⚠ No se pudo sincronizar el cliente: ' + error.message);
    return false;
  } finally {
    if (clientId) {
      remoteSendingClientIds.delete(clientId);
      const pendingClient = remotePendingClients.get(clientId);
      if (pendingClient) {
        remotePendingClients.delete(clientId);
        setTimeout(() => remoteSendClient(pendingClient), 0);
      }
    }
  }
}

// Soft-delete on server (mark as deleted) but keep local copy
async function remoteSoftDeleteClient(client) {
  const cfg = remoteLoadConfig();
  if (!cfg || !cfg.enabled) return false;
  const ok = await testPing();
  if (!ok) return false;
  const path = (cfg.endpoints && cfg.endpoints.softDelete) || '/delete';
  try {
    const payload = { id: client.id, cedula: client.cedula, deleted: true };
    await sendJson(path, payload);
    // mark local record as remote-deleted flag
    try {
      const arr = (function(){ try { return JSON.parse(localStorage.getItem(REMOTE_CLIENTS_KEY) || '[]'); } catch(e){ return []; } })();
      const idx = arr.findIndex(c => c.id === client.id || (c.cedula && client.cedula && c.cedula === client.cedula));
      if (idx >= 0) { arr[idx]._remoteDeleted = true; localStorage.setItem(REMOTE_CLIENTS_KEY, JSON.stringify(arr)); window.dispatchEvent(new Event('tufi:clients-changed')); }
    } catch(e){}
    return true;
  } catch(e) { return false; }
}

// Admin delete on server (permanent) - requires admin token
async function remoteAdminDeleteClient(client) {
  const cfg = remoteLoadConfig();
  if (!cfg || !cfg.enabled || !cfg._admin) return false;
  const ok = await testPing();
  if (!ok) return false;
  const path = (cfg.endpoints && cfg.endpoints.adminDelete) || '/admin-delete';
  try {
    const payload = { id: client.id, cedula: client.cedula };
    await sendJson(path, payload);
    return true;
  } catch(e) { return false; }
}

// Test whether token has admin rights by calling /me or /whoami
async function testAdmin() {
  const cfg = remoteLoadConfig();
  if (!cfg || !cfg.enabled) return false;
  const base = buildBaseUrl(cfg);
  if (!base) return false;
  const mePath = (cfg.endpoints && cfg.endpoints.me) || '/me';
  try {
    const res = await fetch(base + mePath, { method: 'GET', headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${cfg.token || ''}` } });
    if (!res.ok) return false;
    const info = await res.json();
    const isAdmin = !!(info && info.admin);
    // cache small flag
    try { const c = remoteLoadConfig(); c._admin = isAdmin; remoteSaveConfig(c); } catch(e){}
    return isAdmin;
  } catch(e) { return false; }
}

async function handlePdfNotification(filename, content) {
  const cfg = remoteLoadConfig();
  if (!cfg || !cfg.enabled) return false;
  const ok = await testPing();
  if (!ok) return false;
  // decide by filename/key words
  const name = String(filename || '').toLowerCase();
  if (!/\b(ci|cedula|cedula nro|c)\b/i.test(name)) return false;
  const path = (cfg.endpoints && cfg.endpoints.pdf) || '/pdf';
  try {
    await sendJson(path, { filename, content });
    showToast('✓ Notificación PDF enviada');
    return true;
  } catch(e) { return false; }
}

// Expose API and wire to UI/buttons/events
window.RemoteSync = {
  loadConfig: remoteLoadConfig,
  saveConfig: remoteSaveConfig,
  testPing,
  getConfigRevision: () => remoteConfigRevision,
  saveAll: remoteSaveAll,
  syncAll: remoteSaveAll,
  sendClient: remoteSendClient,
  searchByCedula: remoteSearchByCedula,
  searchIp: remoteSearchIp,
  searchFuncionario: remoteSearchFuncionario,
  notifyPdfGenerated: handlePdfNotification,
  fetchAll: remoteFetchAllClients,
  softDelete: remoteSoftDeleteClient,
  adminDelete: remoteAdminDeleteClient,
  testAdmin
};

// Insert a small config button next to fc-genurl if present
try {
  const genBtn = document.getElementById('fc-genurl');
  if (genBtn && !document.getElementById('fc-remote-config-btn')) {
    const btn = document.createElement('button');
    btn.id = 'fc-remote-config-btn'; btn.type = 'button'; btn.className = 'btn small';
    btn.style.marginLeft = '6px'; btn.textContent = 'Remote Sync';
    genBtn.parentElement?.insertBefore(btn, genBtn.nextSibling);
    btn.addEventListener('click', async () => {
      const cfg = remoteLoadConfig();
      const base = cfg.url || '';
      const port = cfg.port || '';
      const https = !!cfg.useHttps;
      const token = cfg.token || '';
      const enabled = !!cfg.enabled;
      const endpoints = Object.assign({ ping: '/ping', save: '/save', saveAll: '/save-all', pdf: '/pdf' }, cfg.endpoints || {});
      const ok = await (window.Swal ? window.Swal.confirm(`Remote sync is ${enabled ? 'ENABLED' : 'DISABLED'}\n\nPress OK to edit configuration in prompts.`) : Promise.resolve(confirm(`Remote sync is ${enabled ? 'ENABLED' : 'DISABLED'}\n\nPress OK to edit configuration in prompts.`)));
      if (!ok) return;
      const nurl = prompt('Server host (domain or ip):', base);
      if (nurl === null) return;
      const nport = prompt('Port (optional):', port);
      if (nport === null) return;
      const nhttps = await (window.Swal ? window.Swal.confirm('Use HTTPS? Click OK for yes, Cancel for no') : Promise.resolve(confirm('Use HTTPS? Click OK for yes, Cancel for no')));
      const ntoken = prompt('Token (se enviará como Authorization: Bearer):', token);
      if (ntoken === null) return;
      const nEnabled = await (window.Swal ? window.Swal.confirm('Enable remote sync now? OK=Yes, Cancel=No') : Promise.resolve(confirm('Enable remote sync now? OK=Yes, Cancel=No')));
      const nping = prompt('Ping endpoint (GET)', endpoints.ping || '/ping'); if (nping === null) return;
      const nsave = prompt('Save endpoint (POST per client)', endpoints.save || '/save'); if (nsave === null) return;
      const nsaveAll = prompt('SaveAll endpoint (POST bulk)', endpoints.saveAll || '/save-all'); if (nsaveAll === null) return;
      const npdf = prompt('PDF notify endpoint (POST)', endpoints.pdf || '/pdf'); if (npdf === null) return;
      const newCfg = { url: nurl.trim(), port: (nport||'').trim(), useHttps: !!nhttps, token: ntoken.trim(), enabled: !!nEnabled, endpoints: { ping: nping.trim(), save: nsave.trim(), saveAll: nsaveAll.trim(), pdf: npdf.trim() } };
      remoteSaveConfig(newCfg, true);
      window.dispatchEvent(new CustomEvent('tufi:remote-config-changed'));
      showToast('✓ Remote config guardada');
    });
  }
} catch(e) { /* ignore */ }

// Wire saveAll action to existing downloadAllBtn if present
try {
  const saveAllBtn = document.getElementById('downloadAllBtn');
  if (saveAllBtn) saveAllBtn.addEventListener('click', (e) => { setTimeout(() => { RemoteSync.saveAll(); }, 50); });
} catch(e) {}

// Listen for clients-changed and try to send active client
window.addEventListener('tufi:clients-changed', () => {
  if (remoteApplyingServerChanges) return;
  try {
    const id = (window.TufiFormContact && window.TufiFormContact.getActiveClientId) ? window.TufiFormContact.getActiveClientId() : null;
    if (!id) return;
    const client = (window.TufiFormContact && window.TufiFormContact.clientById) ? window.TufiFormContact.clientById(id) : null;
    if (!client) return;
    // Fire-and-forget
    setTimeout(() => { RemoteSync.sendClient(client); }, 200);
  } catch(e) {}
});

// Provide a custom event listener for PDF generation notifications
window.addEventListener('tufi:pdf-generated', e => {
  try { const { filename, content } = e.detail || {}; RemoteSync.notifyPdfGenerated(filename, content); } catch(e){}
});

// Ensure module loaded
console.log('[Tufi] RemoteSync loaded');

// On load: if pingpong enabled, try to fetch server clients and merge
(async function(){
  try {
    const cfg = remoteLoadConfig();
    if (cfg && cfg.enabled) {
      const revision = remoteConfigRevision;
      const ok = await testPing();
      remoteNotifyPingStatus(ok, revision);
      if (ok) {
        await testAdmin(); // populate admin flag
        await remoteFetchAllClients();
      }
    }
  } catch(e) { console.error('[RemoteSync] Error inicializando sincronización:', e); }
})();

// Secret UI: open remoteSyncPanel by left-clicking calculadora button 7 times
(function(){
  try {
    const calcBtn = document.querySelector('.nav-btn[data-view="calculadora"]');
    const panel = document.getElementById('remoteSyncPanel');
    if (!calcBtn || !panel) return;
    let clicks = 0; let timer = null;
    calcBtn.addEventListener('click', (e) => {
      if (e.button !== 0) return; // left click only
      clicks++;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { clicks = 0; }, 2500);
      if (clicks >= 7) {
        clicks = 0; if (timer) clearTimeout(timer);
        try {
          console.log('[RemoteSync] secret activated');
          const realPanel = document.getElementById('remoteSyncPanel') || panel;
          if (!realPanel) { console.warn('[RemoteSync] panel element not found'); return; }

          // reveal Sync sidebar button
          const syncBtn = document.getElementById('sync_button');
          if (syncBtn) syncBtn.style.display = '';

          // activate view-sync
          const viewSync = document.getElementById('view-sync');
          const current = document.querySelector('.view.active');
          if (current && viewSync && current !== viewSync) current.classList.remove('active');
          if (viewSync) viewSync.classList.add('active');
          // update nav active state
          document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
          const navSync = document.querySelector('.nav-btn[data-view="sync"]');
          if (navSync) navSync.classList.add('active');

          // ensure panel is inside view-sync
          if (viewSync) {
            const header = viewSync.querySelector('.view-header');
            if (header && header.parentNode && header.nextSibling !== realPanel) header.parentNode.insertBefore(realPanel, header.nextSibling);
            else if (!viewSync.contains(realPanel)) viewSync.appendChild(realPanel);
          }

          // show it
          realPanel.style.display = 'inherit';
          try { realPanel.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(e){}

          // populate fields from config
          const cfg = remoteLoadConfig() || {};
          document.getElementById('rs-host').value = cfg.url || '';
          document.getElementById('rs-port').value = cfg.port || '';
          document.getElementById('rs-https').checked = !!cfg.useHttps;
          document.getElementById('rs-token').value = cfg.token || '';
          document.getElementById('rs-pingpong').checked = !!cfg.pingpong;
          document.getElementById('rs-enabled').checked = !!cfg.enabled;
          const eps = cfg.endpoints || {};
          document.getElementById('rs-endpoint-ping').value = eps.ping || '/ping';
          document.getElementById('rs-endpoint-list').value = eps.list || '/clients';
          document.getElementById('rs-endpoint-search').value = eps.search || '/search';
          document.getElementById('rs-endpoint-searchip').value = eps.searchip || '/searchip';
          document.getElementById('rs-endpoint-funcionarios').value = eps.funcionarios || '/funcionarios';
          document.getElementById('rs-endpoint-save').value = eps.save || '/save';
          document.getElementById('rs-endpoint-saveall').value = eps.saveAll || '/save-all';
          document.getElementById('rs-endpoint-softdelete').value = eps.softDelete || '/delete';
          document.getElementById('rs-endpoint-admindelete').value = eps.adminDelete || '/admin-delete';
        } catch (err) { console.error('[RemoteSync] show error', err); }
      }
    });

    // Wire panel buttons
    document.getElementById('rs-close')?.addEventListener('click', () => {
      try { panel.style.display = 'none'; } catch(e){}
      try { const sb = document.getElementById('sync_button'); if (sb) sb.style.display = 'none'; } catch(e){}
    });
    document.getElementById('rs-test-ping')?.addEventListener('click', async () => {
      const cfg = remoteLoadConfig();
      try { // temporarily set config from inputs to allow test
        const tmp = Object.assign({}, cfg, { url: document.getElementById('rs-host').value.trim(), port: document.getElementById('rs-port').value.trim(), useHttps: !!document.getElementById('rs-https').checked, token: document.getElementById('rs-token').value.trim(), endpoints: { ...(cfg.endpoints || {}), ping: document.getElementById('rs-endpoint-ping').value.trim() || '/ping' } });
        remoteSaveConfig(tmp, true);
        window.dispatchEvent(new CustomEvent('tufi:remote-config-changed', { detail: { pingPending: true } }));
        const revision = remoteConfigRevision;
        const ok = await testPing({ allowDisabled: true });
        remoteNotifyPingStatus(ok, revision);
        showToast(ok ? '✓ PONG recibido' : '⚠ No hubo respuesta PONG');
      } catch (e) { showToast('⚠ Error test ping'); }
    });

    document.getElementById('rs-save-config')?.addEventListener('click', async () => {
      try {
        const cfg = {
          url: document.getElementById('rs-host').value.trim(),
          port: document.getElementById('rs-port').value.trim(),
          useHttps: !!document.getElementById('rs-https').checked,
          token: document.getElementById('rs-token').value.trim(),
          pingpong: !!document.getElementById('rs-pingpong').checked,
          enabled: !!document.getElementById('rs-enabled').checked,
          endpoints: {
            ping: document.getElementById('rs-endpoint-ping').value.trim() || '/ping',
            list: document.getElementById('rs-endpoint-list').value.trim() || '/clients',
            search: document.getElementById('rs-endpoint-search').value.trim() || '/search',
            searchip: document.getElementById('rs-endpoint-searchip').value.trim() || '/searchip',
            funcionarios: document.getElementById('rs-endpoint-funcionarios').value.trim() || '/funcionarios',
            save: document.getElementById('rs-endpoint-save').value.trim() || '/save',
            saveAll: document.getElementById('rs-endpoint-saveall').value.trim() || '/save-all',
            softDelete: document.getElementById('rs-endpoint-softdelete').value.trim() || '/delete',
            adminDelete: document.getElementById('rs-endpoint-admindelete').value.trim() || '/admin-delete'
          }
        };
        remoteSaveConfig(cfg, true);
        window.dispatchEvent(new CustomEvent('tufi:remote-config-changed', { detail: { pingPending: true } }));
        showToast('✓ Configuración guardada');
        const revision = remoteConfigRevision;
        const pingOk = cfg.enabled && await testPing();
        remoteNotifyPingStatus(pingOk, revision);
        if (pingOk) await remoteFetchAllClients();
      } catch(e) {
        console.error('[RemoteSync] No se pudo guardar la configuración:', e);
        showToast('⚠ No se pudo guardar la configuración');
      }
    });

    document.getElementById('rs-sync')?.addEventListener('click', async () => {
      try { await remoteSaveAll(); } catch(e){ showToast('⚠ Error sincronizando'); }
    });

    document.getElementById('rs-load')?.addEventListener('click', async () => {
      try { const ok = await remoteFetchAllClients(); if (!ok) showToast('⚠ No se pudo cargar desde servidor'); } catch(e){ showToast('⚠ Error cargando'); }
    });
  } catch(e) { /* ignore */ }
})();
