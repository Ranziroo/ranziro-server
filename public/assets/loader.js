// loader.js — delegated link loader (works with dynamic anchors)
(function () {
  'use strict';

  // optional small debug toggle
  const DEBUG = false;

  // ensure loader overlay exists (create on DOMContentLoaded)
  function ensureLoader() {
    if (!document.getElementById('page-loader')) {
      const loader = document.createElement('div');
      loader.id = 'page-loader';
      loader.innerHTML = `
        <div class="loader-ripple">
          <div></div><div></div>
        </div>
      `;
      document.body.appendChild(loader);
    }
  }

  function showLoader() {
    ensureLoader();
    const overlay = document.getElementById('page-loader');
    if (overlay) overlay.classList.add('active');
  }

  function hideLoader() {
    const overlay = document.getElementById('page-loader');
    if (overlay) overlay.classList.remove('active');
    if (navTimer) {
      clearTimeout(navTimer);
      navTimer = null;
    }
  }

  let navTimer = null;

  // Decide whether a click on element should trigger loader/navigation
  function shouldHandleAnchor(a) {
    if (!a) return false;
    // skip anchors without href or anchors with hash only
    const href = a.getAttribute('href');
    if (!href) return false;
    if (href.startsWith('#')) return false;
    // skip anchors explicitly opted out
    if (a.hasAttribute('data-no-loader')) return false;
    // skip external downloads or mailto/tel
    if (href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    // if anchor has target=_blank or user used modifier keys, do not hijack
    const target = a.getAttribute('target');
    if (target && target.toLowerCase() === '_blank') return false;
    return true;
  }

  // find nearest ancestor anchor (including self)
  function findAnchor(el) {
    while (el && el !== document.documentElement) {
      if (el.tagName && el.tagName.toLowerCase() === 'a' && el.hasAttribute('href')) return el;
      el = el.parentElement;
    }
    return null;
  }

  // delegated click handler
  function onDocumentClick(e) {
    // ignore right click / ctrl/meta / middle-click
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const a = findAnchor(e.target);
    if (!a) return;

    if (!shouldHandleAnchor(a)) return;

    // okay, intercept navigation to show loader
    e.preventDefault();
    const href = a.getAttribute('href');

    if (DEBUG) console.debug('[loader] delegated click ->', href);

    showLoader();

    // small delay to allow loader animation to be seen — adjust if you want
    navTimer = setTimeout(() => {
      // allow normal navigation
      window.location.href = href;
    }, 900); // 900ms like original behavior (was 1200)
  }

  // hide loader on history navigation / page show
  window.addEventListener('popstate', hideLoader);
  window.addEventListener('pageshow', hideLoader);

  // Setup: create loader (DOMContentLoaded) and attach delegated listener immediately
  document.addEventListener('DOMContentLoaded', () => {
    try {
      ensureLoader();
    } catch (e) {}
  });

  // attach delegation at capture phase after parsed — safe even if run before DOMContentLoaded
  document.addEventListener('click', onDocumentClick, true);

  // expose small API for backwards compatibility (optional)
  window.__PAGE_LOADER = {
    show: showLoader,
    hide: hideLoader
  };

})();
