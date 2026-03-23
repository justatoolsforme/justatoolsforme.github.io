/* ============================================================
   TUFI TOOLS — app-formcontact.js
   Responsabilidad: Form Contact, Autocomplete Ciudad, OCR Cédula
   ============================================================ */
'use strict';

/* ============================================================
   A. CONSTANTES & CONFIGURACIÓN
   ============================================================ */
const FC_STORAGE_KEY = 'tufi_formcontact';

const FC_FIELD_IDS = [
  'fc-nombres', 'fc-apellidos', 'fc-cedula', 'fc-fechanac',
  'fc-estadocivil', 'fc-celular',
  'fc-ciudad-p', 'fc-barrio-p', 'fc-direccion-p',
  'fc-empresa', 'fc-salario',
  'fc-ciudad-l', 'fc-barrio-l', 'fc-direccion-l', 'fc-lineabaja',
  'fc-referencias', 'fc-monto', 'fc-plazo'
];

/* ============================================================
   B. PERSISTENCIA (localStorage)
   ============================================================ */
function fcLoadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(FC_STORAGE_KEY) || '{}');
    FC_FIELD_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && saved[id] !== undefined) el.value = saved[id];
    });
  } catch (e) {
    console.warn('[FC] Error al cargar datos:', e);
  }
}

function fcSaveData() {
  const data = {};
  FC_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) data[id] = el.value;
  });
  localStorage.setItem(FC_STORAGE_KEY, JSON.stringify(data));
}

/** Limpia los campos de UI (expuesta globalmente para app-core) */
function fcClearFields() {
  FC_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

/* ============================================================
   C. GENERACIÓN DE TEXTO FORMATEADO
   ============================================================ */
function fcGenerateText() {
  const get  = id => document.getElementById(id)?.value.trim() || '—';
  const line = (label, id) => `* ${label}: ${get(id)}`;

  return [
    '*SOLICITUD DE CRÉDITO PARA TUFI*',
    '',
    '*DATOS PERSONALES*',
    line('Nombres',            'fc-nombres'),
    line('Apellidos',          'fc-apellidos'),
    line('Cédula Nro.',        'fc-cedula'),
    line('Fecha de nacimiento','fc-fechanac'),
    line('Estado civil',       'fc-estadocivil'),
    line('Ciudad',             'fc-ciudad-p'),
    line('Barrio',             'fc-barrio-p'),
    line('Dirección',          'fc-direccion-p'),
    line('Celular',            'fc-celular'),
    '',
    '*DATOS LABORALES*',
    line('Empresa',    'fc-empresa'),
    line('Ciudad',     'fc-ciudad-l'),
    line('Barrio',     'fc-barrio-l'),
    line('Dirección',  'fc-direccion-l'),
    line('Salario',    'fc-salario'),
    line('Línea baja', 'fc-lineabaja'),
    '',
    '*REFERENCIAS PERSONALES*',
    get('fc-referencias'),
    '',
    `*MONTO SOLICITADO:* ${get('fc-monto')}`,
    `*PLAZO:* ${get('fc-plazo')}`,
  ].join('\n');
}

/* ============================================================
   D. AUTOCOMPLETE CIUDADES
   ============================================================ */

/**
 * Crea un autocomplete de ciudad sobre un <input>.
 * Usa GEO_DATA de app-geo.js.
 * @param {HTMLInputElement} input
 */
function createCityAutocomplete(input) {
  if (!input) return;

  // Contenedor dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'ac-dropdown';
  dropdown.setAttribute('role', 'listbox');
  input.parentElement.style.position = 'relative';
  input.parentElement.appendChild(dropdown);

  let activeIdx = -1;
  let currentResults = [];

  function renderDropdown(results) {
    currentResults = results;
    activeIdx = -1;
    dropdown.innerHTML = '';

    if (!results.length) {
      hideDropdown();
      return;
    }

    // Agrupar por departamento
    const byDept = {};
    results.forEach(({ city, dept }) => {
      if (!byDept[dept]) byDept[dept] = [];
      byDept[dept].push(city);
    });

    let itemIdx = 0;
    for (const [dept, cities] of Object.entries(byDept)) {
      const groupLabel = document.createElement('div');
      groupLabel.className = 'ac-group';
      groupLabel.textContent = dept;
      dropdown.appendChild(groupLabel);

      cities.forEach(city => {
        const item = document.createElement('div');
        item.className = 'ac-item';
        item.setAttribute('role', 'option');
        item.dataset.idx = itemIdx;
        item.textContent = city;

        item.addEventListener('mousedown', e => {
          e.preventDefault();
          selectCity(city);
        });

        dropdown.appendChild(item);
        itemIdx++;
      });
    }

    dropdown.style.display = 'block';
  }

  function hideDropdown() {
    dropdown.style.display = 'none';
    activeIdx = -1;
  }

  function selectCity(city) {
    input.value = city;
    hideDropdown();
    fcSaveData();
    input.dispatchEvent(new Event('input'));
  }

  function highlightItem(idx) {
    const items = dropdown.querySelectorAll('.ac-item');
    items.forEach((el, i) => el.classList.toggle('ac-active', i === idx));
    if (items[idx]) {
      items[idx].scrollIntoView({ block: 'nearest' });
    }
    activeIdx = idx;
  }

  // Eventos del input
  input.addEventListener('input', () => {
    const term = input.value.trim();
    if (term.length < 1) { hideDropdown(); return; }
    const results = geoSearch(term, 24);
    renderDropdown(results);
  });

  input.addEventListener('keydown', e => {
    if (dropdown.style.display === 'none') return;
    const items = dropdown.querySelectorAll('.ac-item');
    const count  = items.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightItem((activeIdx + 1) % count);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightItem((activeIdx - 1 + count) % count);
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && activeIdx < currentResults.length) {
        e.preventDefault();
        // Find flat city at activeIdx
        const allItems = dropdown.querySelectorAll('.ac-item');
        selectCity(allItems[activeIdx]?.textContent || '');
      }
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  });

  input.addEventListener('blur', () => {
    // Delay para permitir que el click en item funcione
    setTimeout(hideDropdown, 150);
  });
}

/* ============================================================
   E. OCR — ESCÁNER DE CÉDULA
   ============================================================ */

/** Convierte resultado OCR en campos del formulario */
function parseOCRText(rawText) {
  const text = rawText;
  const UP   = rawText.toUpperCase();
  const result = {};

  // ── Cédula número ───────────────────────────────────────
  // Formatos: 1.234.567 / 12345678 / Nº 1.234.567
  const ciPatterns = [
    /N[ºO°]?\s*:?\s*(\d{1,3}(?:\.\d{3})+)/,   // N° 1.234.567
    /C[ÉE]DULA[^0-9]*(\d{1,3}(?:\.\d{3})+)/i,
    /\b(\d{1,3}(?:\.\d{3})+)\b/,               // solo el número con puntos
  ];
  for (const pat of ciPatterns) {
    const m = text.match(pat);
    if (m) { result.cedula = m[1]; break; }
  }

  // ── Fecha de nacimiento ─────────────────────────────────
  // DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY
  const dateMatch = text.match(/\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})\b/);
  if (dateMatch) {
    result.fechaNac = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
  }

  // ── Nombres ─────────────────────────────────────────────
  // Línea con NOMBRES: o que contiene varias palabras en mayúscula
  const nombresMatch = UP.match(/NOMBRES?\s*:?\s*([A-ZÁÉÍÓÚÜÑ]+(?: [A-ZÁÉÍÓÚÜÑ]+){0,3})/);
  if (nombresMatch) {
    result.nombres = toTitleCase(nombresMatch[1].trim());
  }

  // ── Apellidos ────────────────────────────────────────────
  const apellidosMatch = UP.match(/APELLIDOS?\s*:?\s*([A-ZÁÉÍÓÚÜÑ]+(?: [A-ZÁÉÍÓÚÜÑ]+){0,3})/);
  if (apellidosMatch) {
    result.apellidos = toTitleCase(apellidosMatch[1].trim());
  }

  // ── Sexo / Estado civil ──────────────────────────────────
  if (/\bSOLTERO\b|\bSOLTERA\b/.test(UP)) result.estadoCivil = 'Soltero/a';
  else if (/\bCASADO\b|\bCASADA\b/.test(UP)) result.estadoCivil = 'Casado/a';
  else if (/\bDIVORCIADO\b|\bDIVORCIADA\b/.test(UP)) result.estadoCivil = 'Divorciado/a';
  else if (/\bVIUDO\b|\bVIUDA\b/.test(UP)) result.estadoCivil = 'Viudo/a';
  else if (/UNI[ÓO]N LIBRE/.test(UP)) result.estadoCivil = 'Unión libre';

  // ── Ciudad (buscar en GEO_DATA) ──────────────────────────
  const allCities = geoGetAllCities ? geoGetAllCities() : [];
  for (const { city } of allCities) {
    if (UP.includes(city.toUpperCase())) {
      result.ciudad = city;
      break;
    }
  }

  return result;
}

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/** Aplica los datos OCR al formulario */
function applyOCRToForm(parsed) {
  const fieldMap = {
    cedula:      'fc-cedula',
    fechaNac:    'fc-fechanac',
    nombres:     'fc-nombres',
    apellidos:   'fc-apellidos',
    estadoCivil: 'fc-estadocivil',
    ciudad:      'fc-ciudad-p',
  };

  let applied = 0;
  for (const [key, id] of Object.entries(fieldMap)) {
    if (!parsed[key]) continue;
    const el = document.getElementById(id);
    if (!el) continue;

    if (el.tagName === 'SELECT') {
      // Buscar opción por texto
      const opt = [...el.options].find(o =>
        o.text.toLowerCase().includes(parsed[key].toLowerCase())
      );
      if (opt) { el.value = opt.value; applied++; }
    } else {
      el.value = parsed[key];
      applied++;
    }
  }

  fcSaveData();
  return applied;
}

/* ============================================================
   F. PANEL OCR — LÓGICA UI
   ============================================================ */
(function initOCRPanel() {
  const toggleBtn    = document.getElementById('ocrToggle');
  const ocrBody      = document.getElementById('ocrBody');
  const ocrDropzone  = document.getElementById('ocrDropzone');
  const ocrFileInput = document.getElementById('ocrFileInput');
  const ocrScanBtn   = document.getElementById('ocrScanBtn');
  const ocrPreview   = document.getElementById('ocrPreview');
  const ocrStatus    = document.getElementById('ocrStatus');
  const ocrFields    = document.getElementById('ocrFields');
  const ocrApplyBtn  = document.getElementById('ocrApplyBtn');

  if (!toggleBtn) return;

  let ocrImageFile = null;
  let ocrParsed    = null;

  // Toggle panel
  toggleBtn.addEventListener('click', () => {
    const expanded = ocrBody.style.display !== 'none';
    ocrBody.style.display = expanded ? 'none' : 'block';
    toggleBtn.classList.toggle('open', !expanded);
  });

  // Drag & drop en zona OCR
  ocrDropzone?.addEventListener('dragover', e => {
    e.preventDefault();
    ocrDropzone.classList.add('drag-over');
  });

  ocrDropzone?.addEventListener('dragleave', e => {
    if (!ocrDropzone.contains(e.relatedTarget))
      ocrDropzone.classList.remove('drag-over');
  });

  ocrDropzone?.addEventListener('drop', e => {
    e.preventDefault();
    ocrDropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) loadOCRImage(file);
  });

  ocrDropzone?.addEventListener('click', e => {
    if (e.target.closest('#ocrScanBtn')) return;
    ocrFileInput?.click();
  });

  ocrFileInput?.addEventListener('change', () => {
    const file = ocrFileInput.files[0];
    if (file) loadOCRImage(file);
    ocrFileInput.value = '';
  });

  // Pegar imagen Ctrl+V en la vista formcontact
  document.addEventListener('paste', e => {
    const view = document.getElementById('view-formcontact');
    if (!view?.classList.contains('active')) return;
    if (ocrBody?.style.display === 'none') return;

    for (const item of (e.clipboardData?.items || [])) {
      if (item.type.startsWith('image/')) {
        loadOCRImage(item.getAsFile());
        break;
      }
    }
  });

  function loadOCRImage(file) {
    ocrImageFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
      if (ocrPreview) {
        ocrPreview.src = ev.target.result;
        ocrPreview.style.display = 'block';
      }
      if (ocrStatus) ocrStatus.textContent = 'Imagen cargada. Presioná "Escanear".';
      if (ocrFields) ocrFields.innerHTML = '';
      if (ocrApplyBtn) ocrApplyBtn.style.display = 'none';
      if (ocrScanBtn) ocrScanBtn.disabled = false;
    };
    reader.readAsDataURL(file);
  }

  // Escanear
  ocrScanBtn?.addEventListener('click', async () => {
    if (!ocrImageFile) return;

    if (typeof Tesseract === 'undefined') {
      if (ocrStatus) ocrStatus.innerHTML = '⚠ Tesseract.js no cargó. Verificá tu conexión.';
      return;
    }

    ocrScanBtn.disabled = true;
    ocrScanBtn.textContent = 'Escaneando…';
    if (ocrStatus) ocrStatus.innerHTML = '<span class="ocr-progress">Iniciando OCR…</span>';
    if (ocrFields) ocrFields.innerHTML = '';
    if (ocrApplyBtn) ocrApplyBtn.style.display = 'none';

    try {
      const { data: { text } } = await Tesseract.recognize(
        ocrImageFile,
        'spa',
        {
          logger: m => {
            if (m.status === 'recognizing text' && ocrStatus) {
              const pct = Math.round(m.progress * 100);
              ocrStatus.innerHTML = `<span class="ocr-progress">Reconociendo texto… ${pct}%</span>`;
            }
          }
        }
      );

      ocrParsed = parseOCRText(text);

      // Mostrar campos detectados
      const keys = Object.keys(ocrParsed);
      if (!keys.length) {
        if (ocrStatus) ocrStatus.innerHTML = '⚠ No se detectaron datos. Intentá con una foto más clara.';
        ocrScanBtn.disabled = false;
        ocrScanBtn.textContent = 'Escanear';
        return;
      }

      const labelMap = {
        cedula:      'Cédula',
        fechaNac:    'Fecha nac.',
        nombres:     'Nombres',
        apellidos:   'Apellidos',
        estadoCivil: 'Estado civil',
        ciudad:      'Ciudad',
      };

      if (ocrFields) {
        ocrFields.innerHTML = keys.map(k => `
          <div class="ocr-field-item">
            <span class="ocr-field-label">${labelMap[k] || k}</span>
            <span class="ocr-field-value">${escapeHtml(ocrParsed[k])}</span>
          </div>
        `).join('');
      }

      if (ocrStatus) ocrStatus.innerHTML = `✓ Se detectaron <strong>${keys.length}</strong> campo(s).`;
      if (ocrApplyBtn) ocrApplyBtn.style.display = 'inline-flex';

    } catch (err) {
      console.error('[OCR]', err);
      if (ocrStatus) ocrStatus.innerHTML = `⚠ Error: ${err.message}`;
    }

    ocrScanBtn.disabled = false;
    ocrScanBtn.textContent = 'Escanear';
  });

  // Aplicar al formulario
  ocrApplyBtn?.addEventListener('click', () => {
    if (!ocrParsed) return;
    const n = applyOCRToForm(ocrParsed);
    showToast(`✓ ${n} campo(s) completado(s) desde la cédula`);
    ocrApplyBtn.style.display = 'none';
  });
})();

/* ============================================================
   G. EVENTOS FORMULARIO
   ============================================================ */
(function initFormContact() {
  // Auto-guardar
  FC_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input',  fcSaveData);
    el.addEventListener('change', fcSaveData);
  });

  // Limpiar solo formulario
  document.getElementById('fc-clear')?.addEventListener('click', () => {
    if (!confirm('¿Limpiar todos los campos del formulario?')) return;
    fcClearFields();
    localStorage.removeItem(FC_STORAGE_KEY);
    showToast('🗑 Formulario limpiado');
  });

  // Copiar
  document.getElementById('fc-copy')?.addEventListener('click', () => {
    const text = fcGenerateText();
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => showToast('✓ Copiado al portapapeles'))
        .catch(() => fcFallbackCopy(text));
    } else {
      fcFallbackCopy(text);
    }
  });

  // Descargar .txt
  document.getElementById('fc-download')?.addEventListener('click', () => {
    const text = fcGenerateText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: 'solicitud-credito-tufi.txt'
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✓ Archivo descargado');
  });

  // Autocomplete ciudades — personales y laborales
  createCityAutocomplete(document.getElementById('fc-ciudad-p'));
  createCityAutocomplete(document.getElementById('fc-ciudad-l'));

  // Cargar datos guardados al iniciar
  fcLoadData();
})();

/* ── Helper escapeHtml (si no está definido en otro módulo) ── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fcFallbackCopy(text) {
  const ta = Object.assign(document.createElement('textarea'), {
    value: text,
    style: 'position:fixed;opacity:0;left:-9999px'
  });
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try {
    document.execCommand('copy');
    showToast('✓ Copiado al portapapeles');
  } catch {
    showToast('⚠ No se pudo copiar automáticamente');
  }
  document.body.removeChild(ta);
}