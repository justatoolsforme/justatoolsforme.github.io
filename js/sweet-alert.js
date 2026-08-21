(function(){
  // Minimal SweetAlert-like implementation
  const css = `
  .swal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1100}
  .swal-box{background:#fff;border-radius:12px;max-width:520px;width:90%;padding:18px;box-shadow:0 8px 30px rgba(0,0,0,0.28);font-family:inherit}
  .swal-body{margin:8px 0 14px;color:#222}
  .swal-title{font-weight:700;margin-bottom:6px}
  .swal-actions{display:flex;gap:10px;justify-content:flex-end}
  .swal-btn{padding:8px 12px;border-radius:8px;border:1px solid #ddd;background:#f6f6f6;cursor:pointer}
  .swal-btn.primary{background:var(--accent,#e8a020);color:#111;border-color:rgba(232,160,32,0.22)}
  .swal-btn.ghost{background:transparent;border:1px solid #ddd}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const overlay = document.createElement('div'); overlay.className = 'swal-overlay'; overlay.style.display = 'none';
  overlay.innerHTML = `
    <div class="swal-box" role="dialog" aria-modal="true">
      <div class="swal-title" id="swal-title"></div>
      <div class="swal-body" id="swal-body"></div>
      <div class="swal-actions" id="swal-actions"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  function show(message, title){
    const t = overlay.querySelector('#swal-title');
    const b = overlay.querySelector('#swal-body');
    t.textContent = title || '';
    b.textContent = message || '';
    overlay.style.display = 'flex';
  }
  function hide(){ overlay.style.display = 'none'; overlay.querySelector('#swal-actions').innerHTML = ''; }

  window.Swal = {
    confirm: function(message, options){
      options = options || {};
      return new Promise((resolve) => {
        show(message, options.title);
        const actions = overlay.querySelector('#swal-actions');
        actions.innerHTML = '';
        const cancel = document.createElement('button'); cancel.className = 'swal-btn'; cancel.textContent = options.cancelText || 'Cancelar';
        const ok = document.createElement('button'); ok.className = 'swal-btn primary'; ok.textContent = options.okText || 'Aceptar';
        actions.appendChild(cancel); actions.appendChild(ok);
        function cleanup(){
          cancel.removeEventListener('click', onCancel);
          ok.removeEventListener('click', onOk);
          document.removeEventListener('keydown', onKey);
        }
        function onCancel(){ cleanup(); hide(); resolve(false); }
        function onOk(){ cleanup(); hide(); resolve(true); }
        function onKey(e){ if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') onOk(); }
        cancel.addEventListener('click', onCancel);
        ok.addEventListener('click', onOk);
        document.addEventListener('keydown', onKey);
        // focus OK by default
        setTimeout(()=> ok.focus(), 20);
      });
    },
    alert: function(message, options){
      options = options || {};
      return new Promise((resolve) => {
        show(message, options.title);
        const actions = overlay.querySelector('#swal-actions');
        actions.innerHTML = '';
        const ok = document.createElement('button'); ok.className = 'swal-btn primary'; ok.textContent = options.okText || 'Aceptar';
        actions.appendChild(ok);
        function cleanup(){ ok.removeEventListener('click', onOk); document.removeEventListener('keydown', onKey); }
        function onOk(){ cleanup(); hide(); resolve(); }
        function onKey(e){ if (e.key === 'Enter' || e.key === 'Escape') onOk(); }
        ok.addEventListener('click', onOk);
        document.addEventListener('keydown', onKey);
        setTimeout(()=> ok.focus(), 20);
      });
    }
  };
})();
