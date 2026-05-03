/* ============================================================
   TUFI TOOLS — app-core.js
   Responsabilidad: Toast, Navegación, Sidebar, Scroll-to-top, Clear All
   ============================================================ */
'use strict';

/* ── Toast global ─────────────────────────────────────────── */
function showToast(msg, duration = 2800) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerHTML = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

/* ── Sidebar collapse ──────────────────────────────────────── */
(function initSidebar() {
  const sidebar     = document.getElementById('sidebar');
  const collapseBtn = document.getElementById('collapseBtn');
  if (!sidebar || !collapseBtn) return;

  if (localStorage.getItem('tufi_sidebar_collapsed') === '1') {
    sidebar.classList.add('collapsed');
  }

  collapseBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem(
      'tufi_sidebar_collapsed',
      sidebar.classList.contains('collapsed') ? '1' : '0'
    );
  });
})();

/* ── Navegación de vistas ──────────────────────────────────── */
(function initNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const views   = document.querySelectorAll('.view');
  const main    = document.getElementById('mainContent');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetId = 'view-' + btn.dataset.view;
      views.forEach(v => v.classList.remove('active'));
      document.getElementById(targetId)?.classList.add('active');

      // Volver al tope al cambiar de vista
      if (main) main.scrollTop = 0;
    });
  });
})();

/* ── Scroll-to-top ─────────────────────────────────────────── */
(function initScrollTop() {
  const btn  = document.getElementById('scrollTopBtn');
  const main = document.getElementById('mainContent');
  if (!btn || !main) return;

  main.addEventListener('scroll', () => {
    btn.classList.toggle('visible', main.scrollTop > 220);
  });

  btn.addEventListener('click', () => {
    main.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

/* ── FAQ Acordeón ──────────────────────────────────────────── */
(function initFAQ() {
  document.addEventListener('click', e => {
    const trigger = e.target.closest('.faq-trigger');
    if (!trigger) return;

    const item   = trigger.closest('.faq-item');
    const id     = trigger.dataset.faq;
    const body   = document.getElementById('faq-' + id);
    if (!item || !body) return;

    const isOpen = item.classList.contains('open');

    // Cerrar todos
    document.querySelectorAll('.faq-item.open').forEach(el => {
      el.classList.remove('open');
      el.querySelector('.faq-body').style.display = 'none';
    });

    // Si no estaba abierto, abrir éste
    if (!isOpen) {
      item.classList.add('open');
      body.style.display = 'block';
    }
  });
})();

(function initClearAll() {
  const btn = document.getElementById('clearAllBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!confirm('¿Limpiar TODOS los datos guardados?\nEsto borrará el formulario y las preferencias.')) return;

    Object.keys(localStorage)
      .filter(k => k.startsWith('tufi_'))
      .forEach(k => localStorage.removeItem(k));

    // Delegar limpieza de UI a cada módulo si está disponible
    if (typeof fcClearFields === 'function') fcClearFields();
    window.dispatchEvent(new Event('tufi:clients-changed'));

    showToast('🗑 Todos los datos fueron limpiados');
  });
})();
