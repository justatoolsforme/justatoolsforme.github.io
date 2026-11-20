/* ============================================================
   TUFI TOOLS — app-client-store.js
   Almacenamiento compacto de clientes en localStorage (formato v4).

   v3 guardaba un array de objetos: cada cliente repetía todos los nombres
   de campo ("fc-direccion-p": ...) y los campos vacíos. Con ~3.000 clientes
   eso supera la cuota de localStorage.

   v4 es columnar: los nombres de campo se guardan una sola vez y cada
   cliente es un array de valores. Además se omiten vacíos y campos
   redundantes (cedula, etapa y displayName cuando se derivan del
   formulario) y savedAt se guarda como número. Ocupa ~3-4 veces menos.

   La migración desde v3 es automática y no destructiva: v3 sólo se borra
   después de escribir y verificar v4. Si algo falla, se sigue usando v3.
   ============================================================ */
'use strict';

(function initClientStore() {
  const LEGACY_KEY = 'tufi_clients_v3';
  const STORE_KEY = 'tufi_clients_v4';
  const ABSENT = 0; // centinela para "sin valor" dentro de una fila
  const PREFERRED_ORDER = [
    'id', 'savedAt', 'fc-origen', 'fc-nombres', 'fc-apellidos', 'fc-cedula', 'fc-fechanac',
    'fc-estadocivil', 'fc-celular', 'fc-ciudad-p', 'fc-barrio-p', 'fc-direccion-p',
    'fc-empresa', 'fc-cargo', 'fc-salario', 'fc-ciudad-l', 'fc-barrio-l', 'fc-direccion-l',
    'fc-lineabaja', 'fc-referencias', 'fc-monto', 'fc-plazo', 'fc-etapa', 'fc-cecot',
    'fc-idempleador', '_entidades', '_remoteSynced'
  ];

  let cache = null;       // array de clientes decodificados
  let usingLegacy = false; // true si no se pudo migrar y seguimos en v3

  function isEmpty(value) {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }

  function derivedName(client) {
    return `${String(client['fc-nombres'] || '').trim()} ${String(client['fc-apellidos'] || '').trim()}`.trim();
  }

  function compactClient(client) {
    const out = {};
    Object.keys(client || {}).forEach(key => {
      const value = client[key];
      if (isEmpty(value)) return;
      if (key === 'cedula' && String(value) === String(client['fc-cedula'] || '')) return;
      if (key === 'etapa' && String(value) === String(client['fc-etapa'] || '')) return;
      if (key === 'displayName' && String(value) === derivedName(client)) return;
      if (key === 'savedAt') {
        const ms = Date.parse(value);
        out[key] = Number.isFinite(ms) ? ms : value;
        return;
      }
      out[key] = value === 0 ? '0' : value;
    });
    return out;
  }

  function expandClient(compact) {
    const client = { ...compact };
    if (typeof client.savedAt === 'number') client.savedAt = new Date(client.savedAt).toISOString();
    if (client.cedula === undefined) client.cedula = client['fc-cedula'] || '';
    if (client.etapa === undefined && client['fc-etapa']) client.etapa = client['fc-etapa'];
    if (client.displayName === undefined) client.displayName = derivedName(client) || client.cedula || client.id || '';
    return client;
  }

  function encode(clients) {
    const compacted = clients.map(compactClient);
    const keySet = new Set();
    compacted.forEach(record => Object.keys(record).forEach(key => keySet.add(key)));
    const keys = [
      ...PREFERRED_ORDER.filter(key => keySet.has(key)),
      ...[...keySet].filter(key => !PREFERRED_ORDER.includes(key)).sort()
    ];
    // Diccionario de valores repetidos (empresa, cargo, ciudad, etapa...): se guardan una
    // vez y las filas usan una referencia entera negativa (-1 = dict[0]).
    const counts = new Map();
    compacted.forEach(record => Object.values(record).forEach(value => {
      if (typeof value === 'string' && value.length >= 4) counts.set(value, (counts.get(value) || 0) + 1);
    }));
    const dict = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([value]) => value);
    const dictIndex = new Map(dict.map((value, index) => [value, index]));
    const encodeValue = value => {
      if (typeof value === 'string' && dictIndex.has(value)) return -1 - dictIndex.get(value);
      if (typeof value === 'number' && value < 0) return String(value); // reservado para referencias
      return value;
    };
    const rows = compacted.map(record => {
      const row = keys.map(key => (key in record ? encodeValue(record[key]) : ABSENT));
      while (row.length && row[row.length - 1] === ABSENT) row.pop();
      return row;
    });
    return JSON.stringify({ v: 4, keys, dict, rows });
  }

  function decode(text) {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.v !== 4 || !Array.isArray(parsed.keys) || !Array.isArray(parsed.rows)) {
      throw new Error('client_store_invalid_format');
    }
    const dict = Array.isArray(parsed.dict) ? parsed.dict : [];
    return parsed.rows.map(row => {
      const record = {};
      parsed.keys.forEach((key, index) => {
        if (index >= row.length || row[index] === ABSENT) return;
        const value = row[index];
        record[key] = (typeof value === 'number' && value < 0 && Number.isInteger(value)) ? dict[-1 - value] : value;
      });
      return expandClient(record);
    });
  }

  function isQuotaError(error) {
    return error && (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014
      || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
  }

  function notify(message) {
    try { if (typeof showToast === 'function') showToast(message, 6000); } catch (e) { /* ignore */ }
    console.warn('[ClientStore]', message);
  }

  function readLegacy() {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }

  /** Escribe v4. Devuelve true si se escribió; lanza si la cuota no alcanza. */
  function writeV4(clients) {
    const text = encode(clients);
    try {
      localStorage.setItem(STORE_KEY, text);
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      // Liberar la copia v3 (si existe) y reintentar; restaurarla si aun así no entra.
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy === null) throw error;
      localStorage.removeItem(LEGACY_KEY);
      try {
        localStorage.setItem(STORE_KEY, text);
      } catch (retryError) {
        try { localStorage.setItem(LEGACY_KEY, legacy); } catch (e) { /* ignore */ }
        throw retryError;
      }
    }
    return text.length;
  }

  function migrateFromLegacy(legacyClients) {
    try {
      writeV4(legacyClients);
      const verified = decode(localStorage.getItem(STORE_KEY));
      if (verified.length !== legacyClients.length) throw new Error('client_store_migration_mismatch');
      localStorage.removeItem(LEGACY_KEY);
      usingLegacy = false;
      console.info(`[ClientStore] Migrados ${legacyClients.length} clientes a formato compacto v4`);
    } catch (error) {
      console.error('[ClientStore] No se pudo migrar a v4; se sigue usando v3:', error);
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
      usingLegacy = true;
    }
  }

  function loadFromStorage() {
    const v4 = localStorage.getItem(STORE_KEY);
    if (v4) {
      try {
        const clients = decode(v4);
        usingLegacy = false;
        // Si quedó un v3 residual (migración interrumpida), se descarta: v4 es la fuente.
        if (localStorage.getItem(LEGACY_KEY) !== null) localStorage.removeItem(LEGACY_KEY);
        return clients;
      } catch (error) {
        console.error('[ClientStore] v4 ilegible; se intenta v3:', error);
      }
    }
    try {
      const legacy = readLegacy();
      if (legacy === null) return [];
      migrateFromLegacy(legacy);
      return legacy;
    } catch (error) {
      console.error('[ClientStore] No se pudieron leer los clientes guardados:', error);
      return [];
    }
  }

  function load() {
    if (!cache) cache = loadFromStorage();
    return cache.slice();
  }

  function save(clients) {
    const list = Array.isArray(clients) ? clients : [];
    try {
      if (usingLegacy) {
        try {
          localStorage.setItem(LEGACY_KEY, JSON.stringify(list));
        } catch (error) {
          if (!isQuotaError(error)) throw error;
          migrateFromLegacy(list);
          if (usingLegacy) throw error;
        }
      } else {
        writeV4(list);
      }
      cache = list.slice();
      return true;
    } catch (error) {
      console.error('[ClientStore] Error guardando clientes:', error);
      notify(isQuotaError(error)
        ? '⚠ Almacenamiento local lleno: sincroniza y elimina clientes antiguos'
        : '⚠ No se pudieron guardar los clientes localmente');
      // La memoria mantiene los cambios para no perder lo escrito en esta sesión.
      cache = list.slice();
      return false;
    }
  }

  function invalidate() { cache = null; }

  function usage() {
    const raw = localStorage.getItem(usingLegacy ? LEGACY_KEY : STORE_KEY) || '';
    return { format: usingLegacy ? 'v3' : 'v4', chars: raw.length, clients: (cache || load()).length };
  }

  // Otra pestaña cambió los clientes: invalidar caché.
  window.addEventListener('storage', event => {
    if (event.key === STORE_KEY || event.key === LEGACY_KEY || event.key === null) {
      invalidate();
      window.dispatchEvent(new Event('tufi:clients-changed'));
    }
  });

  window.TufiClientStore = { load, save, invalidate, usage, encode, decode };
})();
