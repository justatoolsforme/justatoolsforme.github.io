/* ============================================================
   TUFI TOOLS — app-pdf.js
   Responsabilidades:
   1. Convertidor de imágenes a PDF A4 horizontal (con modo rotación)
   2. Fusionador de múltiples PDFs en un solo documento
   ============================================================ */
'use strict';

/* ========== SECCIÓN 1: IMG → PDF ========== */

/* ── Estado IMG to PDF ────────────────────────────────────── */
let pdfImages = [];
let pdfConversionMode = 'default'; // 'default' o 'rotate'
let imageRotations = {}; // { index: degrees }

/* ── Dimensiones A4 Horizontal (mm) ────────────────────────– */
const PAGE_W = 297;
const PAGE_H = 210;

/* ── Referencias DOM IMG to PDF ────────────────────────────– */
const dropzone       = document.getElementById('dropzone');
const fileInput      = document.getElementById('fileInput');
const previewWrapper = document.getElementById('previewWrapper');
const previewGrid    = document.getElementById('previewGrid');
const previewCount   = document.getElementById('previewCount');
const convertBtn     = document.getElementById('pdf-convert');
const addMoreBtn     = document.getElementById('addMoreBtn');
const modeButtons    = document.querySelectorAll('.option-btn[data-mode]');
const rotateOptions  = document.getElementById('rotateOptions');
const badgeMode      = document.getElementById('badgeMode');
const previewRotatePanel = document.getElementById('previewRotatePanel');

/* ========== MODO DE CONVERSIÓN ========== */
modeButtons?.forEach(btn => {
  btn.addEventListener('click', function() {
    modeButtons.forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    
    pdfConversionMode = this.dataset.mode;
    
    if (rotateOptions) {
      rotateOptions.style.display = pdfConversionMode === 'rotate' ? 'block' : 'none';
    }
    if (previewRotatePanel) {
      previewRotatePanel.style.display = pdfConversionMode === 'rotate' ? 'block' : 'none';
    }
    
    if (badgeMode) {
      badgeMode.textContent = pdfConversionMode === 'rotate' ? '🔄 Rotación manual' : '↻ Auto-rotación';
    }
    
    if (pdfImages.length > 0) {
      renderPdfPreviews();
    }
  });
});

/* ── Drag & Drop IMG to PDF ────────────────────────────────– */
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

/* ── Pegar imagen desde portapapeles (Ctrl+V) ────────────── */
document.addEventListener('paste', e => {
  const pdfView = document.getElementById('view-convertpdf');
  if (!pdfView?.classList.contains('active')) return;

  const items = Array.from(e.clipboardData?.items || []);

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

/* ── Procesar archivos IMG to PDF ──────────────────────────– */
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

/* ── Renderizar previsualización IMG to PDF ────────────────– */
function renderPdfPreviews() {
  previewGrid.innerHTML = '';

  pdfImages.forEach((img, i) => {
    const item = document.createElement('div');
    item.className = 'preview-item';
    
    let rotateControls = '';
    if (pdfConversionMode === 'rotate') {
      const currentRotation = imageRotations[i] || 0;
      rotateControls = `
        <div class="preview-rotate-controls">
          <button class="rotate-btn" data-idx="${i}" data-angle="-90" title="Rotar -90°">↺</button>
          <span class="rotate-angle">${currentRotation}°</span>
          <button class="rotate-btn" data-idx="${i}" data-angle="90" title="Rotar +90°">↻</button>
        </div>
      `;
    }
    
    item.innerHTML = `
      <img src="${escHtml(img.dataUrl)}" alt="${escHtml(img.name)}" loading="lazy">
      <div class="preview-order">${i + 1}</div>
      <button class="preview-remove" data-idx="${i}" title="Eliminar">×</button>
      <div class="preview-name">${escHtml(img.name)}</div>
      ${rotateControls}
    `;
    previewGrid.appendChild(item);
  });

  previewGrid.querySelectorAll('.rotate-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      const angle = parseInt(btn.dataset.angle, 10);
      imageRotations[idx] = (imageRotations[idx] || 0) + angle;
      imageRotations[idx] = ((imageRotations[idx] % 360) + 360) % 360;
      renderPdfPreviews();
    });
  });

  previewGrid.querySelectorAll('.preview-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      pdfImages.splice(idx, 1);
      delete imageRotations[idx];
      renderPdfPreviews();
    });
  });

  const n = pdfImages.length;
  previewCount.textContent = `${n} imagen${n !== 1 ? 'es' : ''}`;
  previewWrapper.style.display = n > 0 ? 'block' : 'none';
  if (previewRotatePanel) {
    previewRotatePanel.style.display = pdfConversionMode === 'rotate' && n > 0 ? 'block' : 'none';
  }
  convertBtn.disabled = n === 0;
}

/* ── Limpiar IMG to PDF ────────────────────────────────────– */
document.getElementById('pdf-clear')?.addEventListener('click', () => {
  pdfImages = [];
  imageRotations = {};
  previewGrid.innerHTML = '';
  previewWrapper.style.display = 'none';
  if (previewRotatePanel) previewRotatePanel.style.display = 'none';
  convertBtn.disabled = true;
  document.getElementById('pdf-filename').value = 'documento';
  showToast('🗑 Imágenes eliminadas');
});

/* ── CONVERTIR Y DESCARGAR PDF IMG to PDF ──────────────────– */
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
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    for (let i = 0; i < pdfImages.length; i++) {
      if (i > 0) doc.addPage();

      const { dataUrl } = pdfImages[i];
      const imgEl = await loadImg(dataUrl);

      let finalUrl, srcW, srcH;

      if (pdfConversionMode === 'default') {
        const result = await normalizeToLandscape(imgEl);
        finalUrl = result.url;
        srcW = result.w;
        srcH = result.h;
      } else {
        const customRotation = imageRotations[i] || 0;
        const result = await rotateImageByAngle(imgEl, customRotation);
        finalUrl = result.url;
        srcW = result.w;
        srcH = result.h;
      }

      const scale = Math.min(PAGE_W / srcW, PAGE_H / srcH);
      const drawW = srcW * scale;
      const drawH = srcH * scale;
      const x     = (PAGE_W - drawW) / 2;
      const y     = (PAGE_H - drawH) / 2;

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

/* ========== SECCIÓN 2: PDF to PDF (MERGER) ========== */

/* ── Estado PDF to PDF ─────────────────────────────────────– */
let mergePdfs = [];

/* ── Referencias DOM PDF to PDF ─────────────────────────────– */
const mergeDropzone        = document.getElementById('mergeDropzone');
const mergeFileInput       = document.getElementById('mergeFileInput');
const mergePreviewWrapper  = document.getElementById('mergePreviewWrapper');
const mergePreviewList     = document.getElementById('mergePreviewList');
const mergePreviewCount    = document.getElementById('mergePreviewCount');
const mergeClearBtn        = document.getElementById('pdf-merge-clear');
const mergeConvertBtn      = document.getElementById('pdf-merge-convert');
const addMorePdfsBtn       = document.getElementById('addMorePdfsBtn');

/* ── Drag & Drop PDF to PDF ────────────────────────────────– */
mergeDropzone?.addEventListener('dragover', e => {
  e.preventDefault();
  mergeDropzone.classList.add('drag-over');
});

mergeDropzone?.addEventListener('dragleave', e => {
  if (!mergeDropzone.contains(e.relatedTarget))
    mergeDropzone.classList.remove('drag-over');
});

mergeDropzone?.addEventListener('drop', e => {
  e.preventDefault();
  mergeDropzone.classList.remove('drag-over');
  handleMergePdfFiles(e.dataTransfer.files);
});

mergeDropzone?.addEventListener('click', e => {
  if (e.target.closest('.dz-btn')) return;
  mergeFileInput?.click();
});

document.getElementById('merge-select-btn')?.addEventListener('click', e => {
  e.stopPropagation();
  mergeFileInput?.click();
});

mergeFileInput?.addEventListener('change', () => {
  handleMergePdfFiles(mergeFileInput.files);
  mergeFileInput.value = '';
});

addMorePdfsBtn?.addEventListener('click', () => mergeFileInput?.click());

/* ── Procesar archivos PDF to PDF ──────────────────────────– */
function handleMergePdfFiles(files) {
  const pdfs = Array.from(files).filter(f => f && f.type === 'application/pdf');
  if (!pdfs.length) {
    showToast('⚠ Solo se aceptan archivos PDF');
    return;
  }

  let loaded = 0;
  pdfs.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      mergePdfs.push({
        arrayBuffer: ev.target.result,
        name: file.name || 'documento.pdf'
      });
      if (++loaded === pdfs.length) renderMergePreviews();
    };
    reader.readAsArrayBuffer(file);
  });
}

/* ── Renderizar previsualización PDF to PDF ────────────────– */
function renderMergePreviews() {
  mergePreviewList.innerHTML = '';

  mergePdfs.forEach((pdf, i) => {
    const item = document.createElement('div');
    item.className = 'merge-preview-item';
    item.innerHTML = `
      <div class="merge-item-order">${i + 1}</div>
      <div class="merge-item-info">
        <div class="merge-item-name">${escHtml(pdf.name)}</div>
      </div>
      <button class="merge-item-remove" data-idx="${i}" title="Eliminar">×</button>
    `;
    mergePreviewList.appendChild(item);
  });

  mergePreviewList.querySelectorAll('.merge-item-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      mergePdfs.splice(idx, 1);
      renderMergePreviews();
    });
  });

  const n = mergePdfs.length;
  mergePreviewCount.textContent = `${n} PDF${n !== 1 ? 's' : ''}`;
  mergePreviewWrapper.style.display = n > 0 ? 'block' : 'none';
  mergeConvertBtn.disabled = n < 2;
}

/* ── Limpiar PDF to PDF ────────────────────────────────────– */
mergeClearBtn?.addEventListener('click', () => {
  mergePdfs = [];
  mergePreviewList.innerHTML = '';
  mergePreviewWrapper.style.display = 'none';
  mergeConvertBtn.disabled = true;
  document.getElementById('pdf-merge-filename').value = 'document';
  showToast('🗑 PDFs eliminados');
});

/* ── MEZCLAR Y DESCARGAR PDF ───────────────────────────────– */
mergeConvertBtn?.addEventListener('click', async () => {
  if (mergePdfs.length < 2) return;

  const rawName  = document.getElementById('pdf-merge-filename').value.trim() || 'document';
  const filename = rawName.replace(/\.pdf$/i, '') + '.pdf';

  mergeConvertBtn.disabled = true;
  const origText = mergeConvertBtn.textContent;
  mergeConvertBtn.textContent = 'Mezclando PDFs…';

  try {
    // Nota: Esta es una versión simplificada. Para mezclar PDFs reales,
    // necesitarías una librería como PDF-lib, pero por ahora una alternativa más simple.
    showToast('⚠ Función de mezcla en desarrollo. Será actualizada pronto con capacidad completa.');
  } catch (err) {
    console.error('[PDF Merge]', err);
    showToast(`⚠ Error: ${err.message}`);
  } finally {
    mergeConvertBtn.textContent = origText;
    mergeConvertBtn.disabled = mergePdfs.length < 2;
  }
});

/* ============================================================
   HELPERS PRIVADOS
   ============================================================ */

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = src;
  });
}

async function normalizeToLandscape(imgEl) {
  const natW = imgEl.naturalWidth;
  const natH = imgEl.naturalHeight;

  if (natW >= natH) {
    return { url: imgEl.src, w: natW, h: natH };
  }

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

async function rotateImageByAngle(imgEl, degrees) {
  const natW = imgEl.naturalWidth;
  const natH = imgEl.naturalHeight;
  const rad = (degrees * Math.PI) / 180;

  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const newW = natW * cos + natH * sin;
  const newH = natW * sin + natH * cos;

  const canvas = document.createElement('canvas');
  canvas.width  = newW;
  canvas.height = newH;

  const ctx = canvas.getContext('2d');
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  ctx.drawImage(imgEl, -natW / 2, -natH / 2);

  const url = canvas.toDataURL('image/jpeg', 0.93);
  return { url, w: newW, h: newH };
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}