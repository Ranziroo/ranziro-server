// public/js/login.js
(() => {
  'use strict';

  /**
   * Prefer menggunakan global window.showToast (didefinisikan di admin.js)
   * Jika tidak ada, buat local showToast yang meniru implementasi admin.
   *
   * Note: admin.css memiliki styling untuk .toast-wrap / .toast; namun
   * jika CSS tidak tersedia, script ini menambahkan fallback inline positioning.
   */

  // If admin already provided showToast, reuse it.
  if (typeof window.showToast === 'function') {
    // nothing to do
  } else {
    // create showToast compatible with admin's look & behavior
    function ensureToastContainer() {
      let c = document.querySelector('.toast-wrap');
      if (!c) {
        c = document.createElement('div');
        c.className = 'toast-wrap';
        document.body.appendChild(c);

        // fallback inline positioning only if CSS didn't define position
        const cs = window.getComputedStyle(c);
        if (!cs || (cs.position === 'static' || !cs.position)) {
          c.style.position = 'fixed';
          c.style.right = '1rem';
          c.style.top = '1rem';
          c.style.zIndex = '99999';
          c.style.display = 'flex';
          c.style.flexDirection = 'column';
          c.style.gap = '0.5rem';
          c.style.alignItems = 'flex-end';
          c.style.pointerEvents = 'none';
        }
      }
      return c;
    }

    function showToast(message, type = 'info', options = {}) {
      const duration = (typeof options.duration === 'number') ? options.duration : 3500;
      const container = ensureToastContainer();
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;

      const iconClass = (type === 'success') ? 'fa-solid fa-circle-check'
                      : (type === 'error')   ? 'fa-solid fa-circle-xmark'
                      : 'fa-solid fa-circle-info';

      const iconColor = (type === 'success') ? '#16a34a'
                      : (type === 'error')   ? '#ef4444'
                      : '#2563eb';

      const escapeHtml = (str) => String(str)
        .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

      toast.innerHTML = `
        <div class="icon" style="color: ${iconColor};"><i class="${iconClass}" aria-hidden="true"></i></div>
        <div class="msg">${escapeHtml(message)}</div>
        <div class="close" title="Tutup"><i class="fa-solid fa-xmark" aria-hidden="true" style="color: #fff;"></i></div>
      `;

      // insert at top
      container.prepend(toast);
      // trigger CSS animation (admin.css defines .toast.show)
      requestAnimationFrame(() => toast.classList.add('show'));

      const remove = () => {
        toast.classList.remove('show');
        setTimeout(() => { try { toast.remove(); } catch (e) {} }, 320);
      };

      const closeBtn = toast.querySelector('.close');
      if (closeBtn) closeBtn.addEventListener('click', remove);

      if (duration && duration > 0) setTimeout(remove, duration);
      return toast;
    }

    // expose globally for other scripts (like admin wrapper checking sessionStorage)
    try { window.showToast = showToast; } catch (e) { /* ignore */ }
  }

  // -------------------------
  // Fallback loader (keamanan jika loader.js tidak ada)
  // -------------------------
  function ensureFallbackLoader() {
    if (!document.getElementById('page-loader')) {
      const loader = document.createElement('div');
      loader.id = 'page-loader';
      loader.style.position = 'fixed';
      loader.style.left = '0';
      loader.style.top = '0';
      loader.style.right = '0';
      loader.style.bottom = '0';
      loader.style.display = 'flex';
      loader.style.alignItems = 'center';
      loader.style.justifyContent = 'center';
      loader.style.background = 'rgba(0,0,0,0.5)';
      loader.style.zIndex = '999998';
      loader.innerHTML = `
        <div style="width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.06)">
          <svg width="40" height="40" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg" style="animation:spin 0.9s linear infinite">
            <circle cx="25" cy="25" r="20" stroke="white" stroke-opacity="0.12" stroke-width="6"></circle>
            <path d="M45 25a20 20 0 0 0-20-20" stroke="#fff" stroke-width="6" stroke-linecap="round"></path>
          </svg>
        </div>
        <style>@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>
      `;
      document.body.appendChild(loader);
    }
  }

  function showLoader() {
    if (window.__PAGE_LOADER && typeof window.__PAGE_LOADER.show === 'function') {
      try { window.__PAGE_LOADER.show(); return; } catch (e) {}
    }
    ensureFallbackLoader();
    const el = document.getElementById('page-loader');
    if (el) { el.classList.add('active'); el.style.display = ''; }
  }

  function hideLoader() {
    if (window.__PAGE_LOADER && typeof window.__PAGE_LOADER.hide === 'function') {
      try { window.__PAGE_LOADER.hide(); return; } catch (e) {}
    }
    const el = document.getElementById('page-loader');
    if (el) { el.classList.remove('active'); try { el.remove(); } catch (e) {} }
  }

  // -------------------------
  // Login form logic
  // -------------------------
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form') || document.querySelector('form');
    if (!form) return;

    const btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
    const inputUser = form.querySelector('input[name="username"], input#username');
    const inputPass = form.querySelector('input[name="password"], input#password');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = (inputUser && inputUser.value || '').trim();
      const password = (inputPass && inputPass.value || '').trim();

      if (!username || !password) {
        window.showToast('Username dan password harus diisi', 'error');
        if (inputUser) inputUser.focus();
        return;
      }

      if (String(username).toLowerCase() !== 'admin') {
        window.showToast('Username tidak valid', 'error');
        if (inputUser) inputUser.focus();
        return;
      }

      if (btn) { btn.disabled = true; btn.dataset.prevText = btn.innerHTML; btn.innerHTML = 'Memeriksa...'; }

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username, password })
        });

        const json = await res.json().catch(()=>({ success: false, message: 'Invalid response' }));

        if (res.status === 401 || (!res.ok && json && /invalid credentials/i.test(String(json.message || '')))) {
          window.showToast('Password salah', 'error');
          if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.prevText || 'Login'; }
          if (inputPass) inputPass.focus();
          return;
        }

        if (!res.ok || !json.success) {
          const msg = (json && json.message) ? json.message : 'Login gagal';
          window.showToast(msg, 'error');
          if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.prevText || 'Login'; }
          return;
        }

        // success -> set flag so admin page can show success toast after redirect
        try { sessionStorage.setItem('login_success', '1'); } catch (e) {}

        showLoader();
        // small delay for UX so loader is visible
        setTimeout(() => { window.location.href = '/admin'; }, 700);

      } catch (err) {
        console.error('Login error', err);
        window.showToast('Gagal menghubungi server', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.prevText || 'Login'; }
      }
    });
  });

})();
