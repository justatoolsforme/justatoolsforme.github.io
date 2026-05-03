'use strict';

(function initPdfComposer() {
  const utils = window.TufiPdfUtils;
  if (!utils) return;

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const previewWrapper = document.getElementById('previewWrapper');
  const previewGrid = document.getElementById('previewGrid');
  const previewCount = document.getElementById('previewCount');
  const convertBtn = document.getElementById('pdf-convert');
  const convertLabel = document.getElementById('pdf-convert-label');
  const addMoreBtn = document.getElementById('addMoreBtn');
  const clearBtn = document.getElementById('pdf-clear');
  const selectBtn = document.getElementById('dz-select-btn');
  const filenameInput = document.getElementById('pdf-filename');

  let composerItems = [];
  let draggedItemId = null;

  function createItemId() {
    return `pdf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function getSafeFilename() {
    const rawName = filenameInput?.value.trim() || 'documento';
    return rawName.replace(/\.pdf$/i, '') + '.pdf';
  }

  function getPdfRenderer() {
    const renderer = window.pdfjsLib;
    if (!renderer) return null;

    if (!renderer.GlobalWorkerOptions.workerSrc) {
      renderer.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    return renderer;
  }

  function getItemDetail(item) {
    if (item.type === 'pdf') {
      return `${item.pageCount} pagina${item.pageCount === 1 ? '' : 's'}`;
    }

    if (!item.rotation) return 'Rotacion: 0°';
    return `Rotacion: ${item.rotation}°`;
  }

  function updateComposerState() {
    const total = composerItems.length;
    previewCount.textContent = `${total} archivo${total === 1 ? '' : 's'}`;
    previewWrapper.style.display = total ? 'block' : 'none';
    convertBtn.disabled = total === 0;
  }

  function clearDragState() {
    previewGrid.querySelectorAll('.preview-item').forEach(item => {
      item.classList.remove('drag-over', 'dragging');
    });
  }

  function renderPdfPreviewMarkup(item) {
    if (item.previewDataUrl) {
      return `<img src="${utils.escapeHtml(item.previewDataUrl)}" alt="${utils.escapeHtml(item.name)}">`;
    }

    return `
      <div class="preview-pdf">
        <div class="preview-pdf-icon">PDF</div>
        <div class="preview-pdf-pages">${item.pageCount} pagina${item.pageCount === 1 ? '' : 's'}</div>
      </div>
    `;
  }

  function renderComposerItems() {
    previewGrid.innerHTML = '';

    composerItems.forEach((item, index) => {
      const element = document.createElement('div');
      element.className = 'preview-item';
      element.draggable = true;
      element.dataset.id = item.id;

      const previewBody = item.type === 'image'
        ? `
          <div class="preview-media">
            <img src="${utils.escapeHtml(item.dataUrl)}" alt="${utils.escapeHtml(item.name)}" style="transform: rotate(${item.rotation}deg) scale(${item.rotation % 180 === 0 ? 1 : 0.78});">
          </div>
        `
        : `
          <div class="preview-media">
            ${renderPdfPreviewMarkup(item)}
          </div>
        `;

      const rotateButton = item.type === 'image'
        ? '<button class="preview-control-btn preview-rotate-left" data-id="' + item.id + '" title="Rotar a la izquierda">↺</button>'
        : '';

      element.innerHTML = `
        ${previewBody}
        <div class="preview-order">${index + 1}</div>
        <div class="preview-file-badge">${item.type === 'image' ? 'IMG' : 'PDF'}</div>
        <div class="preview-item-actions">
          ${rotateButton}
          <button class="preview-control-btn preview-remove" data-id="${item.id}" title="Eliminar">×</button>
        </div>
        <div class="preview-meta">
          <div class="preview-name">${utils.escapeHtml(item.name)}</div>
          <div class="preview-detail">${utils.escapeHtml(getItemDetail(item))}</div>
        </div>
      `;

      element.addEventListener('dragstart', event => {
        draggedItemId = item.id;
        event.dataTransfer.effectAllowed = 'move';
        element.classList.add('dragging');
      });

      element.addEventListener('dragend', () => {
        draggedItemId = null;
        clearDragState();
      });

      element.addEventListener('dragover', event => {
        event.preventDefault();
        if (draggedItemId && draggedItemId !== item.id) {
          element.classList.add('drag-over');
          event.dataTransfer.dropEffect = 'move';
        }
      });

      element.addEventListener('dragleave', event => {
        if (!element.contains(event.relatedTarget)) {
          element.classList.remove('drag-over');
        }
      });

      element.addEventListener('drop', event => {
        event.preventDefault();
        const fromIndex = composerItems.findIndex(entry => entry.id === draggedItemId);
        const toIndex = composerItems.findIndex(entry => entry.id === item.id);

        if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
          composerItems = utils.reorder(composerItems, fromIndex, toIndex);
          renderComposerItems();
        }
      });

      previewGrid.appendChild(element);
    });

    previewGrid.querySelectorAll('.preview-remove').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        composerItems = composerItems.filter(item => item.id !== button.dataset.id);
        renderComposerItems();
      });
    });

    previewGrid.querySelectorAll('.preview-rotate-left').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const item = composerItems.find(entry => entry.id === button.dataset.id);
        if (!item) return;
        item.rotation = ((item.rotation || 0) + 270) % 360;
        renderComposerItems();
      });
    });

    updateComposerState();
  }

  async function renderPdfPreview(pdfBytes) {
    const renderer = getPdfRenderer();
    if (!renderer) return null;

    const loadingTask = renderer.getDocument({
      data: pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes),
      disableWorker: true
    });

    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const targetWidth = 320;
    const scale = targetWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.ceil(scaledViewport.width);
    canvas.height = Math.ceil(scaledViewport.height);

    await page.render({
      canvasContext: context,
      viewport: scaledViewport
    }).promise;

    return canvas.toDataURL('image/jpeg', 0.9);
  }

  async function createComposerItem(file) {
    if (utils.isImageFile(file)) {
      const dataUrl = await utils.readFileAsDataUrl(file);
      return {
        id: createItemId(),
        type: 'image',
        name: file.name || 'imagen',
        mimeType: file.type || 'image/jpeg',
        dataUrl,
        rotation: 0
      };
    }

    if (utils.isPdfFile(file)) {
      if (typeof window.PDFLib === 'undefined') {
        throw new Error('PDF-lib no esta disponible para leer PDFs');
      }

      const arrayBuffer = await utils.readFileAsArrayBuffer(file);
      const originalBytes = new Uint8Array(arrayBuffer);
      const storedPdfBytes = originalBytes.slice();
      const countPdfBytes = originalBytes.slice();
      const previewPdfBytes = originalBytes.slice();

      const pdfDoc = await window.PDFLib.PDFDocument.load(countPdfBytes);
      const previewDataUrl = await renderPdfPreview(previewPdfBytes).catch(error => {
        console.warn('[PDF Preview]', error);
        return null;
      });

      return {
        id: createItemId(),
        type: 'pdf',
        name: file.name || 'documento.pdf',
        pdfBytes: storedPdfBytes,
        pageCount: pdfDoc.getPageCount(),
        previewDataUrl
      };
    }

    return null;
  }

  async function handleComposerFiles(fileList) {
    const files = Array.from(fileList || []);
    const accepted = files.filter(file => utils.isImageFile(file) || utils.isPdfFile(file));

    if (!accepted.length) {
      showToast('⚠ Solo se aceptan imagenes o archivos PDF');
      return;
    }

    try {
      const items = [];

      for (const file of accepted) {
        const item = await createComposerItem(file);
        if (item) items.push(item);
      }

      composerItems = [...composerItems, ...items];
      renderComposerItems();
      showToast(`✓ ${items.length} archivo(s) agregado(s)`);
    } catch (error) {
      console.error('[PDF Composer]', error);
      showToast(`⚠ Error al cargar archivos: ${error.message}`);
    }
  }

  async function appendImagePage(pdfDoc, item) {
    let imageDataUrl = item.dataUrl;

    if (item.rotation) {
      const rotated = await utils.rotateImageDataUrl(item.dataUrl, item.rotation, item.mimeType);
      imageDataUrl = rotated.dataUrl;
    }

    const imageData = utils.dataUrlToUint8Array(imageDataUrl);
    const embeddedImage = imageData.mimeType === 'image/png'
      ? await pdfDoc.embedPng(imageData.bytes)
      : await pdfDoc.embedJpg(imageData.bytes);

    const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: embeddedImage.width,
      height: embeddedImage.height
    });
  }

  async function appendPdfPages(pdfDoc, item) {
    const sourceDoc = await window.PDFLib.PDFDocument.load(item.pdfBytes.slice());
    const pages = await pdfDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
    pages.forEach(page => pdfDoc.addPage(page));
  }

  async function exportCombinedPdf() {
    if (!composerItems.length) return;
    if (typeof window.PDFLib === 'undefined') {
      showToast('⚠ PDF-lib no esta disponible');
      return;
    }

    const originalLabel = convertLabel.textContent;
    convertBtn.disabled = true;
    convertLabel.textContent = 'Generando PDF...';

    try {
      const pdfDoc = await window.PDFLib.PDFDocument.create();

      for (const item of composerItems) {
        if (item.type === 'pdf') await appendPdfPages(pdfDoc, item);
        else await appendImagePage(pdfDoc, item);
      }

      const bytes = await pdfDoc.save();
      utils.saveBlob(new Blob([bytes], { type: 'application/pdf' }), getSafeFilename());
      showToast(`✓ PDF generado: ${getSafeFilename()}`);
    } catch (error) {
      console.error('[PDF Composer]', error);
      showToast(`⚠ Error al generar PDF: ${error.message}`);
    } finally {
      convertLabel.textContent = originalLabel;
      convertBtn.disabled = composerItems.length === 0;
    }
  }

  function resetComposer() {
    composerItems = [];
    previewGrid.innerHTML = '';
    filenameInput.value = 'documento';
    updateComposerState();
    showToast('🗑 Archivos eliminados');
  }

  dropzone?.addEventListener('dragover', event => {
    event.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone?.addEventListener('dragleave', event => {
    if (!dropzone.contains(event.relatedTarget)) {
      dropzone.classList.remove('drag-over');
    }
  });

  dropzone?.addEventListener('drop', event => {
    event.preventDefault();
    dropzone.classList.remove('drag-over');
    handleComposerFiles(event.dataTransfer.files);
  });

  dropzone?.addEventListener('click', event => {
    if (!event.target.closest('.dz-btn')) fileInput?.click();
  });

  selectBtn?.addEventListener('click', event => {
    event.stopPropagation();
    fileInput?.click();
  });

  fileInput?.addEventListener('change', () => {
    handleComposerFiles(fileInput.files);
    fileInput.value = '';
  });

  addMoreBtn?.addEventListener('click', () => fileInput?.click());
  clearBtn?.addEventListener('click', resetComposer);
  convertBtn?.addEventListener('click', exportCombinedPdf);

  document.addEventListener('paste', event => {
    const pdfView = document.getElementById('view-convertpdf');
    if (!pdfView?.classList.contains('active')) return;

    const items = Array.from(event.clipboardData?.items || []);
    const imageFiles = items
      .filter(item => item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter(Boolean);

    if (!imageFiles.length) return;

    event.preventDefault();
    handleComposerFiles(imageFiles);
  });

  updateComposerState();
})();
