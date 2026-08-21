/* ============================================================
   TUFI TOOLS — app-remote-sync.js
   Remote sync: store server config, ping, send clients and PDF notifications
   ============================================================ */
'use strict';

const REMOTE_CONFIG_KEY = 'tufi_remote_config_v1';
const REMOTE_CLIENTS_KEY = 'tufi_clients_v3';

function remoteLoadConfig() {
  try { return JSON.parse(localStorage.getItem(REMOTE_CONFIG_KEY) || '{}'); }
  catch { return {}; }
}
function remoteSaveConfig(cfg) {
  localStorage.setItem(REMOTE_CONFIG_KEY, JSON.stringify(cfg || {}));
}

function buildBaseUrl(cfg) {
  if (!cfg || !cfg.url) return null;
  // if user included scheme, use as-is
  if (/^https?:\/\//i.test(cfg.url)) return cfg.url.replace(/\/$/, '');
  const scheme = cfg.useHttps ? 'https' : 'http';
  const port = cfg.port ? `:${cfg.port}` : '';
  return `${scheme}://${cfg.url.replace(/\/$/, '')}${port}`;
}

async function testPing() {
  const cfg = remoteLoadConfig();
  if (!cfg || !cfg.enabled) return false;
  const base = buildBaseUrl(cfg);
  if (!base) return false;
  const pingPath = (cfg.endpoints && cfg.endpoints.ping) || '/ping';
  const url = base + pingPath;
  try {
    const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json', 'X-Tufi-Token': cfg.token || '' } });
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
  const url = base + path;
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.token) headers['X-Tufi-Token'] = cfg.token;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error('remote_error_' + res.status);
  try { return await res.json(); } catch(e) { return await res.text(); }
}

async function remoteSaveAll() {
  const cfg = remoteLoadConfig();
  if (!cfg || !cfg.enabled) { showToast('⚠ Remote sync no configurado'); return; }
  const ok = await testPing();
  if (!ok) { showToast('⚠ Ping falló: servidor no responde'); return; }
  const clients = (function(){ try { return JSON.parse(localStorage.getItem(REMOTE_CLIENTS_KEY) || '[]'); } catch(e){ return []; } })();
  const unsynced = clients.filter(c => !c._remoteSynced);
  if (!unsynced.length) { showToast('✓ No hay clientes nuevos para enviar'); return; }

  const saveAllPath = (cfg.endpoints && cfg.endpoints.saveAll) || '/save-all';
  try {
    // Try to send bulk
    await sendJson(saveAllPath, { clients: unsynced });
    // mark as synced
    const all = clients.map(c => ({ ...c, _remoteSynced: true }));
    try { localStorage.setItem(REMOTE_CLIENTS_KEY, JSON.stringify(all)); } catch(e){}
    showToast(`✓ ${unsynced.length} clientes enviados (bulk)`);
  } catch (e) {
    // fallback: send one-by-one
    let sent = 0;
    const perPath = (cfg.endpoints && cfg.endpoints.save) || '/save';
    for (const c of unsynced) {
      try {
        await sendJson(perPath, { client: c });
        c._remoteSynced = true; sent++;
      } catch (err) { /* ignore individual failures */ }
    }
    // persist updated markers
    try {
      const arr = (function(){ try { return JSON.parse(localStorage.getItem(REMOTE_CLIENTS_KEY) || '[]'); } catch(e){ return []; } })();
      const updated = arr.map(a => {
        const found = unsynced.find(u => u.id === a.id);
        return found ? ({ ...a, _remoteSynced: !!found._remoteSynced }) : a;
      });
      localStorage.setItem(REMOTE_CLIENTS_KEY, JSON.stringify(updated));
    } catch (e) { /* ignore */ }
    showToast(`✓ ${sent} clientes enviados (individual)`);
  }
}

async function remoteSendClient(client) {
  const cfg = remoteLoadConfig();
  if (!cfg || !cfg.enabled) return false;
  const ok = await testPing();
  if (!ok) return false;
  const path = (cfg.endpoints && cfg.endpoints.save) || '/save';
  try {
    await sendJson(path, { client });
    // mark client as synced
    try {
      const arr = (function(){ try { return JSON.parse(localStorage.getItem(REMOTE_CLIENTS_KEY) || '[]'); } catch(e){ return []; } })();
      const idx = arr.findIndex(c => c.id === client.id);
      if (idx >= 0) { arr[idx]._remoteSynced = true; localStorage.setItem(REMOTE_CLIENTS_KEY, JSON.stringify(arr)); }
    } catch(e){}
    return true;
  } catch(e) { return false; }
}

// Fetch list of clients from server and merge into local storage.
async function remoteFetchAllClients() {
  const cfg = remoteLoadConfig();
  if (!cfg || !cfg.enabled) return false;
  const base = buildBaseUrl(cfg);
  if (!base) return false;
  const listPath = (cfg.endpoints && cfg.endpoints.list) || '/clients';
  const url = base + listPath;
  try {
    const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json', 'X-Tufi-Token': cfg.token || '' } });
    if (!res.ok) return false;
    const arr = await res.json();
    if (!Array.isArray(arr)) return false;

    // helpers
    const normalizeCi = (ci) => { try { return String(ci || '').replace(/[\.\s\-]/g, '').toLowerCase(); } catch(e){ return String(ci||''); } };
    const isFilled = v => (v !== undefined && v !== null && String(v).trim() !== '');
    const countFilled = (obj) => {
      if (!obj || typeof obj !== 'object') return 0;
      let c = 0;
      for (const k of Object.keys(obj)) {
        if (k.startsWith('_')) continue;
        if (['id','created_at','updated_at'].includes(k)) continue;
        if (isFilled(obj[k])) c++;
      }
      return c;
    };

    // load local clients and index by normalized CI only (user requested)
    const local = (function(){ try { return JSON.parse(localStorage.getItem(REMOTE_CLIENTS_KEY) || '[]'); } catch(e){ return []; } })();
    const byCi = new Map();
    local.forEach(c => { const k = normalizeCi(c.cedula); if (k) byCi.set(k, c); });

    const adminMode = !!cfg._admin;
    let added = 0, filledFromServer = 0, sentToServer = 0;

    // process each server record keyed by CI
    for (const s of arr) {
      const key = normalizeCi(s.cedula);
      if (!key) continue; // only operate by CI
      const isDeleted = !!s._deleted;
      if (isDeleted && !adminMode) continue; // skip deleted unless admin

      const existing = byCi.get(key);
      if (!existing) {
        // create local from server
        const item = Object.assign({}, s, { _remoteSynced: true });
        byCi.set(key, item);
        added++;
        continue;
      }

      // both exist: compare filled field counts
      const serverCount = countFilled(s);
      const localCount = countFilled(existing);

      if (serverCount > localCount) {
        // fill missing fields in local from server (do not overwrite existing local values)
        let changed = false;
        for (const k of Object.keys(s)) {
          if (k.startsWith('_') || ['id','created_at','updated_at'].includes(k)) continue;
          const sv = s[k];
          const lv = existing[k];
          if ((!isFilled(lv)) && isFilled(sv)) {
            existing[k] = sv; changed = true;
          }
        }
        existing._remoteSynced = true;
        if (changed) filledFromServer++;
        byCi.set(key, existing);
      } else if (localCount > serverCount) {
        // local has more data: send update to server (do not overwrite local)
        try {
          const perPath = (cfg.endpoints && cfg.endpoints.save) || '/save';
          await sendJson(perPath, { client: existing });
          existing._remoteSynced = true; sentToServer++;
          byCi.set(key, existing);
        } catch (err) {
          // failed to update server; leave local untouched and continue
        }
      } else {
        // similar amount of data: do nothing
      }
    }

    // persist merged results
    const out = Array.from(byCi.values());
    try { localStorage.setItem(REMOTE_CLIENTS_KEY, JSON.stringify(out)); } catch(e){}
    window.dispatchEvent(new Event('tufi:clients-changed'));
    showToast(`✓ ${added} nuevos, ${filledFromServer} rellenados desde servidor, ${sentToServer} actualizados al servidor`);
    return true;
  } catch(e) { return false; }
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
    const res = await fetch(base + mePath, { method: 'GET', headers: { 'Accept': 'application/json', 'X-Tufi-Token': cfg.token || '' } });
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
  saveAll: remoteSaveAll,
  sendClient: remoteSendClient,
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
      const ntoken = prompt('Token (will be sent as X-Tufi-Token header):', token);
      if (ntoken === null) return;
      const nEnabled = await (window.Swal ? window.Swal.confirm('Enable remote sync now? OK=Yes, Cancel=No') : Promise.resolve(confirm('Enable remote sync now? OK=Yes, Cancel=No')));
      const nping = prompt('Ping endpoint (GET)', endpoints.ping || '/ping'); if (nping === null) return;
      const nsave = prompt('Save endpoint (POST per client)', endpoints.save || '/save'); if (nsave === null) return;
      const nsaveAll = prompt('SaveAll endpoint (POST bulk)', endpoints.saveAll || '/save-all'); if (nsaveAll === null) return;
      const npdf = prompt('PDF notify endpoint (POST)', endpoints.pdf || '/pdf'); if (npdf === null) return;
      const newCfg = { url: nurl.trim(), port: (nport||'').trim(), useHttps: !!nhttps, token: ntoken.trim(), enabled: !!nEnabled, endpoints: { ping: nping.trim(), save: nsave.trim(), saveAll: nsaveAll.trim(), pdf: npdf.trim() } };
      remoteSaveConfig(newCfg);
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
    if (cfg && cfg.enabled && cfg.pingpong) {
      const ok = await testPing();
      if (ok) {
        await testAdmin(); // populate admin flag
        await remoteFetchAllClients();
      }
    }
  } catch(e) {}
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
        const tmp = Object.assign({}, cfg, { url: document.getElementById('rs-host').value.trim(), port: document.getElementById('rs-port').value.trim(), useHttps: !!document.getElementById('rs-https').checked, token: document.getElementById('rs-token').value.trim(), endpoints: { ping: document.getElementById('rs-endpoint-ping').value.trim() || '/ping' } });
        remoteSaveConfig(tmp);
        const ok = await testPing();
        showToast(ok ? '✓ PONG recibido' : '⚠ No hubo respuesta PONG');
      } catch (e) { showToast('⚠ Error test ping'); }
    });

    document.getElementById('rs-save-config')?.addEventListener('click', () => {
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
            save: document.getElementById('rs-endpoint-save').value.trim() || '/save',
            saveAll: document.getElementById('rs-endpoint-saveall').value.trim() || '/save-all',
            softDelete: document.getElementById('rs-endpoint-softdelete').value.trim() || '/delete',
            adminDelete: document.getElementById('rs-endpoint-admindelete').value.trim() || '/admin-delete'
          }
        };
        remoteSaveConfig(cfg);
        showToast('✓ Configuración guardada');
      } catch(e) { showToast('⚠ No se pudo guardar'); }
    });

    document.getElementById('rs-sync')?.addEventListener('click', async () => {
      try { await remoteSaveAll(); } catch(e){ showToast('⚠ Error sincronizando'); }
    });

    document.getElementById('rs-load')?.addEventListener('click', async () => {
      try { const ok = await remoteFetchAllClients(); if (!ok) showToast('⚠ No se pudo cargar desde servidor'); } catch(e){ showToast('⚠ Error cargando'); }
    });
  } catch(e) { /* ignore */ }
})();
