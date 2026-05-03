'use strict';

(function initPdfUtils() {
  const A4_LANDSCAPE = {
    width: 841.89,
    height: 595.28
  };

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isPdfFile(file) {
    return Boolean(file) && (
      file.type === 'application/pdf' ||
      /\.pdf$/i.test(file.name || '')
    );
  }

  function isImageFile(file) {
    return Boolean(file) && typeof file.type === 'string' && file.type.startsWith('image/');
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => resolve(event.target.result);
      reader.onerror = () => reject(new Error(`No se pudo leer ${file?.name || 'la imagen'}`));
      reader.readAsDataURL(file);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => resolve(event.target.result);
      reader.onerror = () => reject(new Error(`No se pudo leer ${file?.name || 'el PDF'}`));
      reader.readAsArrayBuffer(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
      img.src = src;
    });
  }

  async function rotateImageDataUrl(dataUrl, degrees, mimeType) {
    const image = await loadImage(dataUrl);
    const normalizedDegrees = ((degrees % 360) + 360) % 360;

    if (normalizedDegrees === 0) {
      return {
        dataUrl,
        width: image.naturalWidth,
        height: image.naturalHeight
      };
    }

    const radians = (normalizedDegrees * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const width = Math.round(image.naturalWidth * cos + image.naturalHeight * sin);
    const height = Math.round(image.naturalWidth * sin + image.naturalHeight * cos);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.translate(width / 2, height / 2);
    ctx.rotate(radians);
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

    const outputMime = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    return {
      dataUrl: canvas.toDataURL(outputMime, 0.92),
      width,
      height
    };
  }

  function dataUrlToUint8Array(dataUrl) {
    const [header, base64] = String(dataUrl).split(',');
    const binary = atob(base64 || '');
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return {
      bytes,
      mimeType: header.includes('image/png') ? 'image/png' : 'image/jpeg'
    };
  }

  function fitBox(srcWidth, srcHeight, maxWidth, maxHeight) {
    const scale = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
    const width = srcWidth * scale;
    const height = srcHeight * scale;

    return {
      width,
      height,
      x: (maxWidth - width) / 2,
      y: (maxHeight - height) / 2
    };
  }

  function reorder(list, fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list;
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: filename
    });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  window.TufiPdfUtils = {
    A4_LANDSCAPE,
    dataUrlToUint8Array,
    escapeHtml,
    fitBox,
    isImageFile,
    isPdfFile,
    loadImage,
    readFileAsArrayBuffer,
    readFileAsDataUrl,
    reorder,
    rotateImageDataUrl,
    saveBlob
  };
})();
