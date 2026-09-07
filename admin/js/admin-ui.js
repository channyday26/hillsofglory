// ============================================
// Hills of Glory — Admin Shared UI
// Theme toggle + mobile sidebar (loaded on all admin pages)
// ============================================

(function () {
  'use strict';

  const html = document.documentElement;

  // --- Lucide Icons ---
  // The admin pages render icons as <i data-lucide="..."> placeholders. They
  // are converted to inline SVGs by lucide.createIcons(), which on admin pages
  // is not wired into any page flow — so we call it explicitly here and again
  // after the CMS re-injects rows into the DOM.
  function initIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  }
  // Exposed so admin-cms.js can re-render icons after injecting dynamic rows.
  window.initIcons = initIcons;
  initIcons();

  // --- Theme (early theme is applied by an inline <head> script) ---
  const themeToggle = document.getElementById('themeToggle');

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (themeToggle) {
      const icon = themeToggle.querySelector('[data-lucide]');
      if (icon) {
        icon.setAttribute('data-lucide', theme === 'light' ? 'sun' : 'moon');
      }
    }
    // Re-render icons so the sun/moon toggle reflects the new theme.
    initIcons();
  }

  // Sync the toggle icon with whatever theme is currently set
  applyTheme(html.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  // --- Mobile Sidebar ---
  const sidebar = document.querySelector('.sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  function openSidebar() {
    if (sidebar) sidebar.classList.add('is-open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('is-open');
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('is-open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('is-open');
  }

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', function () {
      if (sidebar.classList.contains('is-open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeSidebar);
  }

  // Close the mobile sidebar when a nav link is tapped
  if (sidebar) {
    sidebar.querySelectorAll('.sidebar__link').forEach(function (link) {
      link.addEventListener('click', closeSidebar);
    });
  }
})();
