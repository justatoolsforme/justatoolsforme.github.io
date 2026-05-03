'use strict';

(function initFormContactExport() {
  const menu = document.getElementById('exportAllMenu');
  const trigger = document.getElementById('exportAllMenuBtn');
  const dropdown = document.getElementById('exportAllDropdown');
  const exportZipBtn = document.getElementById('exportAllZipBtn');
  const txtBtn = document.getElementById('downloadAllBtn');

  if (!menu || !trigger || !dropdown || !exportZipBtn) return;

  function setMenuOpen(open) {
    dropdown.hidden = !open;
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function getFormApi() {
    return window.TufiFormContact || null;
  }

  function formHasData(api) {
    if (typeof api?.fcHasMeaningfulData === 'function') {
      return api.fcHasMeaningfulData(api.formRead?.() || {});
    }

    const data = api?.formRead?.() || {};
    return Object.entries(data).some(([key, value]) => {
      if (key === 'fc-etapa') return false;
      if (key === 'fc-origen') return false;
      if (key === '_entidades') return Array.isArray(value) && value.length > 0;
      return typeof value === 'string' && value.trim() !== '';
    });
  }

  function ensureCurrentClientSaved(api) {
    if (!api?.saveCurrentClient) return;
    if (!formHasData(api)) return;
    api.saveCurrentClient({ silent: true });
  }

  function stripTxtExtension(filename) {
    return String(filename || 'cliente').replace(/\.txt$/i, '');
  }

  async function exportAllAsZip() {
    const api = getFormApi();
    if (!api) {
      showToast('⚠ No se pudo iniciar la exportación');
      return;
    }
    if (typeof window.JSZip === 'undefined') {
      showToast('⚠ JSZip no está disponible');
      return;
    }

    ensureCurrentClientSaved(api);
    const clients = api.clientsLoad?.() || [];
    if (!clients.length) {
      showToast('⚠ No hay clientes guardados');
      return;
    }

    const zip = new window.JSZip();
    const jsonFolder = zip.folder('json');
    const txtFolder = zip.folder('txt');
    const usedNames = new Map();
    const exportedFiles = [];

    clients.forEach(client => {
      const rawBaseName = stripTxtExtension(api.buildFilename?.(client));
      const repeatCount = usedNames.get(rawBaseName) || 0;
      const baseName = repeatCount ? `${rawBaseName}_${repeatCount + 1}` : rawBaseName;
      usedNames.set(rawBaseName, repeatCount + 1);
      exportedFiles.push(baseName);
      const jsonPayload = {
        exportadoEn: new Date().toISOString(),
        cliente: client
      };

      jsonFolder.file(`${baseName}.json`, JSON.stringify(jsonPayload, null, 2));
      txtFolder.file(`${baseName}.txt`, api.fcGenerateTextForClient(client));
    });

    zip.file(
      'resumen.json',
      JSON.stringify(
        {
          exportadoEn: new Date().toISOString(),
          totalClientes: clients.length,
          archivos: exportedFiles
        },
        null,
        2
      )
    );

    exportZipBtn.disabled = true;
    const originalLabel = exportZipBtn.textContent;
    exportZipBtn.textContent = 'Generando ZIP...';

    try {
      const blob = await zip.generateAsync({ type: 'blob' });
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), {
        href: url,
        download: `tufi_export_${stamp}.zip`
      });
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`✓ ZIP generado con ${clients.length} cliente(s)`);
      setMenuOpen(false);
    } catch (error) {
      console.error('[FC Export]', error);
      showToast(`⚠ Error al exportar: ${error.message}`);
    } finally {
      exportZipBtn.disabled = false;
      exportZipBtn.textContent = originalLabel;
    }
  }

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    setMenuOpen(dropdown.hidden);
  });

  exportZipBtn.addEventListener('click', event => {
    event.stopPropagation();
    exportAllAsZip();
  });

  txtBtn?.addEventListener('click', () => {
    setMenuOpen(false);
  });

  document.addEventListener('click', event => {
    if (!menu.contains(event.target)) setMenuOpen(false);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setMenuOpen(false);
  });
})();
