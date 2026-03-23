/* ============================================================
   TUFI TOOLS — app-pdf.js
   Responsabilidad: Convertidor de imágenes a PDF A4 horizontal
   - Imágenes portrait se rotan a landscape automáticamente
   - Imágenes landscape se escalan para CABER en la página (contain)
   - Soporte Ctrl+V desde portapapeles (cualquier formato)
   ============================================================ */
'use strict';

/* ── Estado ────────────────────────────────────────────────── */
/** @type {Array<{dataUrl: string, name: string}>} */
let pdfImages = [];

/* ── Dimensiones A4 Horizontal (mm) ────────────────────────── */
const PAGE_W = 297;
const PAGE_H = 210;

/* ── Referencias DOM ────────────────────────────────────────── */
const dropzone       = document.getElementById('dropzone');
const fileInput      = document.getElementById('fileInput');
const previewWrapper = document.getElementById('previewWrapper');
const previewGrid    = document.getElementById('previewGrid');
const previewCount   = document.getElementById('previewCount');
const convertBtn     = document.getElementById('pdf-convert');
const addMoreBtn     = document.getElementById('addMoreBtn');

/* ── Drag & Drop ────────────────────────────────────────────── */
dropzone?.addEventListener('dragover', e => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});

dropzone?.addEventListener('dragleave', e => {
  if (!dropzone.contains(e.relatedTarget))
    dropzone.classList.remove('drag-over');
});

dropzone?.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  handlePdfFiles(e.dataTransfer.files);
});

dropzone?.addEventListener('click', e => {
  if (e.target.closest('.dz-btn')) return;
  fileInput?.click();
});

document.getElementById('dz-select-btn')?.addEventListener('click', e => {
  e.stopPropagation();
  fileInput?.click();
});

fileInput?.addEventListener('change', () => {
  handlePdfFiles(fileInput.files);
  fileInput.value = '';
});

addMoreBtn?.addEventListener('click', () => fileInput?.click());

/* ── Pegar imagen desde portapapeles (Ctrl+V) ────────────────
   Maneja:
   · Screenshots / capturas de pantalla
   · "Copy image" desde el navegador
   · Archivos de imagen copiados desde el explorador
   ─────────────────────────────────────────────────────────── */
document.addEventListener('paste', e => {
  const pdfView = document.getElementById('view-convertpdf');
  if (!pdfView?.classList.contains('active')) return;

  const items = Array.from(e.clipboardData?.items || []);

  // Prioridad 1: items directamente de tipo image/*
  const imageItems = items.filter(it => it.type.startsWith('image/'));
  if (imageItems.length) {
    e.preventDefault();
    const files = imageItems.map(it => it.getAsFile()).filter(Boolean);
    if (files.length) {
      handlePdfFiles(files);
      showToast(`✓ ${files.length} imagen(es) pegada(s) desde portapapeles`);
      return;
    }
  }

  // Fallback: archivos de imagen copiados (kind = "file")
  const fileItems = items.filter(it => it.kind === 'file' && it.type.startsWith('image/'));
  if (fileItems.length) {
    e.preventDefault();
    const files = fileItems.map(it => it.getAsFile()).filter(Boolean);
    if (files.length) {
      handlePdfFiles(files);
      showToast(`✓ ${files.length} imagen(es) pegada(s)`);
    }
  }
});

/* ── Procesar archivos ────────────────────────────────────── */
function handlePdfFiles(files) {
  const imgs = Array.from(files).filter(f => f && f.type.startsWith('image/'));
  if (!imgs.length) {
    showToast('⚠ Solo se aceptan imágenes (PNG, JPG, WEBP, GIF, BMP)');
    return;
  }

  let loaded = 0;
  imgs.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      pdfImages.push({
        dataUrl: ev.target.result,
        name: file.name || 'imagen-pegada.jpg'
      });
      if (++loaded === imgs.length) renderPdfPreviews();
    };
    reader.readAsDataURL(file);
  });
}

/* ── Renderizar previsualización ──────────────────────────── */
function renderPdfPreviews() {
  previewGrid.innerHTML = '';

  pdfImages.forEach((img, i) => {
    const item = document.createElement('div');
    item.className = 'preview-item';
    item.innerHTML = `
      <img src="${escHtml(img.dataUrl)}" alt="${escHtml(img.name)}" loading="lazy">
      <div class="preview-order">${i + 1}</div>
      <button class="preview-remove" data-idx="${i}" title="Eliminar">×</button>
      <div class="preview-name">${escHtml(img.name)}</div>
    `;
    previewGrid.appendChild(item);
  });

  previewGrid.querySelectorAll('.preview-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      pdfImages.splice(parseInt(btn.dataset.idx, 10), 1);
      renderPdfPreviews();
    });
  });

  const n = pdfImages.length;
  previewCount.textContent = `${n} imagen${n !== 1 ? 'es' : ''}`;
  previewWrapper.style.display = n > 0 ? 'block' : 'none';
  convertBtn.disabled = n === 0;
}

/* ── Limpiar converter ────────────────────────────────────── */
document.getElementById('pdf-clear')?.addEventListener('click', () => {
  pdfImages = [];
  previewGrid.innerHTML = '';
  previewWrapper.style.display = 'none';
  convertBtn.disabled = true;
  document.getElementById('pdf-filename').value = 'documento';
  showToast('🗑 Imágenes eliminadas');
});

/* ── CONVERTIR Y DESCARGAR PDF ───────────────────────────── */
convertBtn?.addEventListener('click', async () => {
  if (!pdfImages.length) return;

  const rawName  = document.getElementById('pdf-filename').value.trim() || 'documento';
  const filename = rawName.replace(/\.pdf$/i, '') + '.pdf';
  const label    = document.getElementById('pdf-convert-label');
  const origText = label.textContent;

  convertBtn.disabled = true;
  label.textContent = 'Generando PDF…';

  try {
    if (typeof window.jspdf === 'undefined') {
      throw new Error('jsPDF no cargó. Verificá tu conexión a internet.');
    }

    const { jsPDF } = window.jspdf;

    // A4 Horizontal: 297 × 210 mm
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    for (let i = 0; i < pdfImages.length; i++) {
      if (i > 0) doc.addPage();

      const { dataUrl } = pdfImages[i];

      // 1. Cargar imagen
      const imgEl = await loadImg(dataUrl);

      // 2. Rotar a landscape si es portrait
      const { url: finalUrl, w: srcW, h: srcH } = await normalizeToLandscape(imgEl);

      // 3. ── CONTAIN ──────────────────────────────────────────
      //    Math.min → la imagen se escala hasta que su lado más
      //    grande toca el borde de la página.
      //    Nunca desborda, nunca se recorta.
      // ─────────────────────────────────────────────────────────
      const scale = Math.min(PAGE_W / srcW, PAGE_H / srcH);
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      const x     = (PAGE_W - drawW) / 2;   // centrado horizontal
      const y     = (PAGE_H - drawH) / 2;   // centrado vertical

      const fmt = finalUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(finalUrl, fmt, x, y, drawW, drawH);
    }

    doc.save(filename);
    showToast(`✓ PDF generado: ${filename}`);

  } catch (err) {
    console.error('[PDF]', err);
    showToast(`⚠ Error: ${err.message}`);
  } finally {
    label.textContent = origText;
    convertBtn.disabled = pdfImages.length === 0;
  }
});

/* ============================================================
   HELPERS PRIVADOS
   ============================================================ */

/**
 * Carga una imagen desde un dataUrl y devuelve el HTMLImageElement.
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = src;
  });
}

/**
 * Si la imagen es portrait (alto > ancho) la rota 90° horario.
 * Devuelve { url, w, h } con las dimensiones finales.
 *
 * @param {HTMLImageElement} imgEl
 * @returns {Promise<{url: string, w: number, h: number}>}
 */
async function normalizeToLandscape(imgEl) {
  const natW = imgEl.naturalWidth;
  const natH = imgEl.naturalHeight;

  // Ya landscape o cuadrada: sin cambios
  if (natW >= natH) {
    return { url: imgEl.src, w: natW, h: natH };
  }

  // Portrait → canvas rotado 90° horario
  // canvas.width  = natH  (se convierte en el nuevo ancho)
  // canvas.height = natW  (se convierte en el nuevo alto)
  const canvas = document.createElement('canvas');
  canvas.width  = natH;
  canvas.height = natW;

  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(imgEl, -natW / 2, -natH / 2);

  const url = canvas.toDataURL('image/jpeg', 0.93);
  return { url, w: canvas.width, h: canvas.height };
}

/** Escape básico para innerHTML */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}