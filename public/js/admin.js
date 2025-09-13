// ===== admin.js (merged: session-check + logout handler + full original file) =====

(function(){
  'use strict';

  // --- Wrapper: session check on load + logout handler ---
  async function checkSessionOrRedirect() {
    try {
      const r = await fetch('/api/check-session', { method: 'GET', credentials: 'same-origin' });
      if (!r.ok) {
        // redirect to login route
        window.location.href = '/login';
        return false;
      }
      const j = await r.json().catch(()=>({success:false}));
      if (!j || !j.success) {
        window.location.href = '/login';
        return false;
      }
      return true;
    } catch (e) {
      console.error('Session check failed:', e);
      window.location.href = '/login';
      return false;
    }
  }

  async function doLogoutFlow() {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (e) {
      console.error('Logout request failed:', e);
    } finally {
      // Always redirect to login after attempting logout
      window.location.href = '/login';
    }
  }

  // Attach a lightweight handler early to ensure logout works even if original code overrides DOM handlers.
  document.addEventListener('DOMContentLoaded', async () => {
    // Check session; if invalid this will redirect immediately.
    const ok = await checkSessionOrRedirect();
    if (!ok) return;

    // If login just happened (login.js set sessionStorage flag), show success toast
    try {
      const s = sessionStorage.getItem('login_success');
      if (s) {
        // showToast is attached to window by the later block (below).
        // by the time DOMContentLoaded fires, the second IIFE in this file has executed,
        // and window.showToast should be available.
        if (typeof window.showToast === 'function') {
          window.showToast('Berhasil login', 'success', { duration: 3000 });
        } else {
          // fallback small alert if showToast not available
          try { alert('Berhasil login'); } catch(e) {}
        }
        sessionStorage.removeItem('login_success');
      }
    } catch (e) {
      // ignore storage/other errors
    }

    // Bind logout button (if present)
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (ev) => {
        try { ev.preventDefault(); } catch (e) {}
        let confirmed = false;
        try {
          if (typeof showConfirm === 'function') {
            // assume showConfirm returns a Promise that resolves to true/false
            confirmed = await showConfirm('Yakin ingin logout?', { title: 'Logout', confirmText: 'Lanjutkan', cancelText: 'Batal' });
          } else {
            confirmed = window.confirm('Yakin ingin logout?');
          }
        } catch (e) {
          confirmed = window.confirm('Yakin ingin logout?');
        }
        if (!confirmed) return;
        await doLogoutFlow();
      });
    }
  });

  // expose helper for debugging if needed
  window._checkSessionOrRedirect = checkSessionOrRedirect;
  window._doLogoutFlow = doLogoutFlow;

})(); 
// ===== end wrapper =====

/* ======================================================================
   admin.js (modifikasi penuh: toast + panel-wide update + skip gambar/status
   + custom confirm)
   ====================================================================== */

(() => {
  // === Configuration (dari file asli) ===
  const API_BASE = `${location.protocol}//${location.host}/api`;
  const API_GET = `${API_BASE}/ranzirostore_akunml`;
  const API_POST = `${API_BASE}/post_akun_detail`;
  const API_DELETE = `${API_BASE}/del_ranzirostore_akunml`;
  const API_UPLOAD_IMAGES = `${API_BASE}/upload_images`;
  const API_DEL_IMAGE = `${API_BASE}/del_image`;
  const API_DEL_IMAGES = `${API_BASE}/del_images`;
  const API_REORDER = `${API_BASE}/reorder_images`;
  const API_UPD = `${API_BASE}/upd_ranzirostore_akunml`;
  const API_DETAIL = `${API_BASE}/akun_detail`;

  // DOM references (sesuaikan id di admin.html)
  const formEl = document.getElementById("form-akun");
  const bodyIndex = document.getElementById("akun-body");
  const bodyUtama = document.getElementById('akun-detail-body-utama');
  const bodyTambahan = document.getElementById('akun-detail-body-tambahan');
  const bodyGambar = document.getElementById('gambar-body');

  // Caches
  let originalDataCache = null;
  let latestDataCache = null;

  /***************************************************************************
   * TOAST helper (popup kanan atas) — icon warna dinamis per type
   ***************************************************************************/
  function ensureToastContainer() {
    let c = document.querySelector('.toast-wrap');
    if (!c) {
      c = document.createElement('div');
      c.className = 'toast-wrap';
      document.body.appendChild(c);
    }
    return c;
  }

  /**
   * showToast(message, type='info', options)
   * type: 'success' | 'error' | 'info'
   * options.duration: ms (default 3500). 0 = sticky.
   */
  function showToast(message, type = 'info', options = {}) {
    const duration = options.duration === undefined ? 3500 : options.duration;
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // pilih icon dan warna berdasarkan tipe
    const iconClass = (type === 'success') ? 'fa-solid fa-circle-check'
                     : (type === 'error') ? 'fa-solid fa-circle-xmark'
                     : 'fa-solid fa-circle-info';

    const iconColor = (type === 'success') ? '#16a34a'   // green-600
                    : (type === 'error')   ? '#ef4444'   // red-500
                    : '#2563eb';                           // blue-600 (info)

    const escapeHtml = (str) => String(str)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

    // ikon mewarisi warna dari parent .icon
    toast.innerHTML = `
      <div class="icon" style="color: ${iconColor};"><i class="${iconClass}" aria-hidden="true"></i></div>
      <div class="msg">${escapeHtml(message)}</div>
      <div class="close" title="Tutup"><i class="fa-solid fa-xmark" aria-hidden="true" style="color: #fff;"></i></div>
    `;

    container.prepend(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    const remove = () => {
      toast.classList.remove('show');
      setTimeout(() => { try { toast.remove(); } catch (e) {} }, 320);
    };

    toast.querySelector('.close').addEventListener('click', remove);
    if (duration && duration > 0) setTimeout(remove, duration);
    return toast;
  }

  // ensure container exists early
  if (!document.querySelector('.toast-wrap')) ensureToastContainer();

  // expose showToast globally so wrapper can call it after session check
  try { window.showToast = showToast; } catch (e) { /* ignore if cannot attach */ }

  /***************************************************************************
   * Custom Confirm dialog (returns Promise<boolean>)
   * Background / panel color set to match modal panel (#111)
   * Usage: const ok = await showConfirm("Yakin akan hapus?");
   ***************************************************************************/
  function showConfirm(message, options = {}) {
    // options: title (string), confirmText, cancelText
    const title = options.title || 'Konfirmasi';
    const confirmText = options.confirmText || 'Ya';
    const cancelText = options.cancelText || 'Batal';
    return new Promise((resolve) => {
      // create overlay + dialog
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.style.position = 'fixed';
      overlay.style.left = '0';
      overlay.style.top = '0';
      overlay.style.right = '0';
      overlay.style.bottom = '0';
      overlay.style.background = 'rgba(0,0,0,0.45)';
      overlay.style.zIndex = 300000;
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';

      const dialog = document.createElement('div');
      dialog.className = 'confirm-dialog';
      dialog.style.minWidth = '320px';
      dialog.style.maxWidth = '92%';
      // background disamakan dengan panel/modal => '#111'
      dialog.style.background = '#111';
      dialog.style.color = '#fff';
      dialog.style.borderRadius = '10px';
      dialog.style.boxShadow = '0 18px 50px rgba(0,0,0,0.6)';
      dialog.style.padding = '18px';
      dialog.style.fontFamily = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
      dialog.innerHTML = `
        <div style="display:flex;gap:.6rem;align-items:flex-start">
          <div style="font-size:1.4rem;color:#ffd166"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <div style="flex:1">
            <div style="font-weight:600;margin-bottom:.25rem">${title}</div>
            <div class="confirm-message" style="color:#d1d5db">${String(message)}</div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:14px">
          <button class="confirm-cancel" style="background:none;border:1px solid #334155;color:#cbd5e1;padding:.45rem .8rem;border-radius:8px;cursor:pointer">${cancelText}</button>
          <button class="confirm-ok" style="background:#ef4444;border:none;color:#fff;padding:.45rem .9rem;border-radius:8px;cursor:pointer">${confirmText}</button>
        </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      const btnOk = dialog.querySelector('.confirm-ok');
      const btnCancel = dialog.querySelector('.confirm-cancel');

      const cleanup = (val) => {
        try { overlay.remove(); } catch (e) {}
        window.removeEventListener('keydown', onKey);
        resolve(Boolean(val));
      };

      function onKey(e) {
        if (e.key === 'Escape') { cleanup(false); }
        if (e.key === 'Enter') { cleanup(true); }
      }

      btnOk.addEventListener('click', () => cleanup(true));
      btnCancel.addEventListener('click', () => cleanup(false));
      // keyboard support
      window.addEventListener('keydown', onKey);

      // autofocus OK button
      setTimeout(() => {
        try { btnOk.focus(); } catch (e) {}
      }, 30);
    });
  }

  try { window.showConfirm = showConfirm; } catch (e) { /* ignore if cannot attach */ }

  // minimal styles for confirm overlay/dialog (if developer CSS missing)
  (function insertConfirmStyles() {
    if (document.getElementById('confirm-styles')) return;
    const s = document.createElement('style');
    s.id = 'confirm-styles';
    s.textContent = `
      .confirm-overlay { animation: confirmFade .12s ease; }
      @keyframes confirmFade { from { opacity:0 } to { opacity:1 } }
      .confirm-dialog button:focus { outline: 2px solid rgba(255,255,255,0.08); outline-offset:2px }
    `;
    document.head.appendChild(s);
  })();

  /***************************************************************************
   * Helpers from original file
   ***************************************************************************/
  function parseGambarsField(item) {
    if (!item) return [];
    if (Array.isArray(item)) return item;
    if (typeof item === 'string' && item.length) {
      try { const parsed = JSON.parse(item); return Array.isArray(parsed) ? parsed : []; } catch(e) { return []; }
    }
    return [];
  }
  function formatPrice(v) {
    try {
      const n = Number(v || 0);
      return 'Rp ' + n.toLocaleString('id-ID');
    } catch (e) { return v || ''; }
  }
  function isAvailableVal(val) {
    return (val === true) || (String(val).toLowerCase() === 'available') || (String(val) === '1');
  }

  /***************************************************************************
   * Renderers (sama seperti asli, hanya tidak mengubah)
   ***************************************************************************/
  function renderIndex(data) {
    if (!bodyIndex) return;
    if (!Array.isArray(data)) {
      bodyIndex.innerHTML = `<tr><td colspan="6" class="text-center py-4">No data</td></tr>`;
      return;
    }
    if (!data.length) {
      bodyIndex.innerHTML = `<tr><td colspan="6" class="text-center py-4">Belum ada akun</td></tr>`;
      return;
    }
    bodyIndex.innerHTML = '';
    data.forEach((akun) => {
      const gambars = parseGambarsField(akun.gambars);
      const thumb = gambars.length ? gambars[0] : (akun.gambar || 'logo/meta_ranziro.webp');

      const isAvailable = isAvailableVal(akun.status);
      const selectedAvailable = isAvailable ? 'selected' : '';
      const selectedSold = !isAvailable ? 'selected' : '';

      const statusSelect = `
        <select onchange="changeStatus(${akun.id}, this)" class="status-select" data-bind="status">
          <option value="available" ${selectedAvailable}>Available</option>
          <option value="sold" ${selectedSold}>Sold</option>
        </select>
      `;

      bodyIndex.innerHTML += `
        <tr>
          <td class="border px-4 py-2">${akun.id}</td>
          <td class="border px-4 py-2">${akun.nama}</td>
          <td class="border px-4 py-2">${formatPrice(akun.harga)}</td>
          <td class="border px-4 py-2">
            <img src="${thumb}" alt="Gambar" class="w-16 h-16 object-cover rounded-lg">
          </td>
          <td class="border px-4 py-2">${statusSelect}</td>
          <td class="border px-4 py-2 text-center">
            <button onclick="openEdit(${akun.id})" class="btn-action edit">Update</button>
            <button onclick="hapusAkun(${akun.id})" class="btn-action delete">Hapus</button>
          </td>
        </tr>`;
    });
  }

  function renderAkunDetail(data) {
    if (!bodyUtama || !bodyTambahan) return;
    if (!Array.isArray(data) || !data.length) {
      bodyUtama.innerHTML = `<tr><td colspan="8" class="text-center py-4">Tidak ada data</td></tr>`;
      bodyTambahan.innerHTML = `<tr><td colspan="10" class="text-center py-4">Tidak ada data</td></tr>`;
      return;
    }

    bodyUtama.innerHTML = '';
    bodyTambahan.innerHTML = '';
    data.forEach(a => {
      const idAkunDisplay = a.id_akun ?? '';
      bodyUtama.innerHTML += `
        <tr>
          <td>${a.id}</td>
          <td>${a.nama}</td>
          <td>${formatPrice(a.harga)}</td>
          <td>${idAkunDisplay}</td>
          <td>${a.deskripsi || ''}</td>
          <td>${a.rank || ''}</td>
          <td>${a.skin || ''}</td>
          <td>${a.hero || ''}</td>
        </tr>`;

      const gambarPreview = (parseGambarsField(a.gambars)[0]) || a.gambar || '';
      const isAvailableDetail = isAvailableVal(a.status);
      const selAvail = isAvailableDetail ? 'selected' : '';
      const selSold = !isAvailableDetail ? 'selected' : '';
      const statusSelectDetail = `
        <select onchange="changeStatus(${a.id}, this)" class="status-select" data-bind="status">
          <option value="available" ${selAvail}>Available</option>
          <option value="sold" ${selSold}>Sold</option>
        </select>
      `;

      bodyTambahan.innerHTML += `
        <tr>
          <td>${a.winrate || ''}</td>
          <td>${a.pertandingan || ''}</td>
          <td>${a.magic_core || ''}</td>
          <td>${a.emblem || ''}</td>
          <td>${a.pribadi_beli || ''}</td>
          <td>${a.log || ''}</td>
          <td>${a.bind || ''}</td>
          <td>${statusSelectDetail}</td>
          <td><img src="${gambarPreview || 'logo/meta_ranziro.webp'}" width="45" height="45" /></td>
          <td>
            <button class="btn-action edit" onclick="openEdit(${a.id})">Update</button>
            <button class="btn-action delete" onclick="hapusAkun(${a.id})">Hapus</button>
          </td>
        </tr>`;
    });
  }

  function renderGambarDetail(data) {
    if (!bodyGambar) return;
    if (!Array.isArray(data) || !data.length) {
      bodyGambar.innerHTML = `<tr><td colspan="4" class="text-center py-4">Tidak ada data</td></tr>`;
      return;
    }
    bodyGambar.innerHTML = '';
    data.forEach(akun => {
      const images = Array.isArray(akun.gambars) ? akun.gambars : (akun.gambar ? [akun.gambar] : []);
      const imagesHtml = images.map((url, idx) => `
        <div class="gambar-box" draggable="true" data-id="${akun.id}" data-url="${url}">
          <button class="img-remove" data-id="${akun.id}" data-url="${url}" title="Hapus gambar">×</button>
          <img src="${url}" alt="img-${idx}" />
        </div>`).join('');

      bodyGambar.innerHTML += `
        <tr>
          <td>${akun.id}</td>
          <td>${akun.nama}</td>
          <td>
            <div class="gambar-grid" data-akun="${akun.id}">
              ${imagesHtml || '<div style="color:#aaa">Tidak ada gambar</div>'}
            </div>
            <div style="margin-top:.5rem;">
              <input type="file" accept="image/*" multiple data-upload-id="${akun.id}" class="upload-input" />
              <button data-upload-btn="${akun.id}" class="btn-action">Upload</button>
            </div>
          </td>
          <td class="text-center">
            <button class="btn-action delete" onclick="hapusSemuaGambar(${akun.id})">Hapus semua gambar</button>
          </td>
        </tr>`;
    });

    attachGambarListeners();
  }

  /***************************************************************************
   * Fetchers
   ***************************************************************************/
  async function fetchAkunFromServer() {
    try {
      const res = await fetch(API_GET);
      const result = await res.json();
      if (!result.success) throw new Error(result.message || 'Fetch failed');
      originalDataCache = result.data || [];
      latestDataCache = originalDataCache.slice();
      return originalDataCache;
    } catch (err) {
      console.error('fetchAkunFromServer error', err);
      originalDataCache = originalDataCache || [];
      latestDataCache = latestDataCache || [];
      return originalDataCache;
    }
  }

  async function fetchAkun(providedData) {
    if (providedData) {
      latestDataCache = Array.isArray(providedData) ? providedData.slice() : [];
      renderIndex(latestDataCache);
      return latestDataCache;
    }
    if (originalDataCache === null) {
      await fetchAkunFromServer();
    } else {
      latestDataCache = originalDataCache.slice();
    }
    renderIndex(latestDataCache);
    return latestDataCache;
  }

  async function fetchAkunDetail(providedData) {
    const data = providedData || latestDataCache || originalDataCache || [];
    renderAkunDetail(data);
  }

  async function fetchGambarDetail(providedData) {
    const data = providedData || latestDataCache || originalDataCache || [];
    renderGambarDetail(data);
  }

  /***************************************************************************
   * Attach gambar listeners (replaced alerts -> showToast, confirm -> showConfirm)
   ***************************************************************************/
  function attachGambarListeners() {
    document.querySelectorAll('.img-remove').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const url = btn.dataset.url;
        const ok = await showConfirm('Hapus gambar ini?', { title: 'Hapus gambar', confirmText: 'Hapus', cancelText: 'Batal' });
        if (!ok) return;
        try {
          const res = await fetch(API_DEL_IMAGE, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: parseInt(id), url })
          });
          const r = await res.json();
          if (!r.success) throw new Error(r.message || 'Gagal hapus');
          await refreshAll();
          showToast('Gambar dihapus', 'success');
        } catch (err) {
          console.error('del single image error', err);
          showToast('Gagal hapus gambar: ' + (err.message || err), 'error');
        }
      };
    });

    document.querySelectorAll('.upload-input').forEach(input => {
      const id = input.dataset.uploadId;
      const btn = document.querySelector(`[data-upload-btn="${id}"]`);
      if (!btn) return;
      btn.onclick = async () => {
        const files = input.files;
        if (!files.length) {
          showToast('Pilih minimal 1 gambar', 'info');
          return;
        }
        const fd = new FormData();
        for (let i=0;i<files.length;i++) fd.append('gambar', files[i]);
        try {
          const res = await fetch(`${API_UPLOAD_IMAGES}/${id}`, { method: 'POST', body: fd });
          const r = await res.json();
          if (!r.success) throw new Error(r.message || 'Gagal upload');
          input.value = '';
          await refreshAll();
          showToast('Upload berhasil', 'success');
        } catch (err) {
          console.error('upload error', err);
          showToast('Gagal upload: ' + (err.message || err), 'error');
        }
      };
    });

    // drag & drop reorder
    let dragEl = null;
    document.querySelectorAll('.gambar-box').forEach(box => {
      box.addEventListener('dragstart', (e) => { dragEl = box; box.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      box.addEventListener('dragend', () => { if (dragEl) dragEl.classList.remove('dragging'); dragEl = null; });
      box.addEventListener('dragover', (e) => {
        e.preventDefault();
        const target = e.currentTarget;
        if (dragEl && target !== dragEl && target.parentElement === dragEl.parentElement) {
          const parent = target.parentElement;
          const rect = target.getBoundingClientRect();
          const insertBefore = (e.clientX - rect.left) / rect.width < 0.5;
          parent.insertBefore(dragEl, insertBefore ? target : target.nextSibling);
        }
      });
      box.addEventListener('drop', async (e) => {
        e.preventDefault();
        const parent = e.currentTarget.parentElement;
        const urls = Array.from(parent.querySelectorAll('.gambar-box')).map(n => n.dataset.url);
        const akunId = parent.getAttribute('data-akun') || parent.dataset.akun;
        try {
          const res = await fetch(`${API_REORDER}/${akunId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: urls })
          });
          const r = await res.json();
          if (!r.success) throw new Error(r.message || 'Gagal reorder');
          await refreshAll();
          showToast('Urutan gambar disimpan', 'success');
        } catch (err) {
          console.error('reorder error', err);
          showToast('Gagal reorder: ' + (err.message || err), 'error');
        }
      });
    });
  }

  /***************************************************************************
   * Panel-wide validation & send update helpers
   ***************************************************************************/
  function getElementValue(el) {
    if (!el) return null;
    const tag = (el.tagName || '').toLowerCase();
    const type = (el.type || '').toLowerCase();

    if (tag === 'select') return el.value;
    if (tag === 'textarea') return el.value.trim();
    if (tag === 'input') {
      if (type === 'checkbox') return el.checked;
      if (type === 'file') return el.files; // FileList
      return el.value.trim();
    }
    if (el.isContentEditable) return (el.textContent || '').trim();
    if (el.dataset && typeof el.dataset.value !== 'undefined') return el.dataset.value;
    return (el.textContent || '').trim();
  }

  function validateAndCollectPanel(panel) {
    const boundEls = Array.from(panel.querySelectorAll('[data-bind]'));
    const payload = {};
    let missingEl = null;

    for (const el of boundEls) {
      const bindKey = el.getAttribute('data-bind') || el.dataset.bind;
      if (!bindKey) continue;
      const lower = String(bindKey).toLowerCase();
      const skip = lower === 'gambar' || lower === 'status' || el.dataset.skipValidation === 'true';
      const val = getElementValue(el);
      payload[bindKey] = val;

      if (skip) continue;

      if (val instanceof FileList) {
        if (el.dataset.requireFiles === 'true' && val.length === 0) { missingEl = el; break; }
      } else if (typeof val === 'string') {
        if (val.trim() === '') { missingEl = el; break; }
      } else if (typeof val === 'undefined' || val === null) {
        missingEl = el; break;
      }
    }

    return { valid: !missingEl, missingEl, payload };
  }

  async function sendPanelUpdate(panel, payload) {
    const id = panel.dataset.id || panel.getAttribute('data-id') || null;
    const url = id ? `${API_UPD}/${id}` : API_POST;
    const method = id ? 'PUT' : 'POST';

    const hasFiles = Object.values(payload).some(v => (v instanceof FileList && v.length > 0) || (v instanceof File));

    try {
      if (hasFiles) {
        const fd = new FormData();
        for (const key of Object.keys(payload)) {
          const v = payload[key];
          if (v instanceof FileList) {
            for (let i=0;i<v.length;i++) fd.append(`${key}[]`, v[i]);
          } else if (v instanceof File) fd.append(key, v);
          else fd.append(key, String(v));
        }
        const res = await fetch(url, { method, body: fd });
        if (!res.ok) throw new Error(await res.text().catch(()=>res.statusText));
        return await res.json().catch(()=>({ success: true }));
      } else {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text().catch(()=>res.statusText));
        return await res.json().catch(()=>({ success: true }));
      }
    } catch (err) {
      throw err;
    }
  }

  /***************************************************************************
   * Update modal builder (used by openEdit)
   * Creates a floating modal with inputs that have data-bind attributes
   ***************************************************************************/
  function buildEditModal(akun) {
    // Remove existing modal if any
    const existing = document.getElementById('edit-akun-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'edit-akun-modal';
    modal.style.position = 'fixed';
    modal.style.left = '50%';
    modal.style.top = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.zIndex = 200000;
    modal.style.background = '#111';
    modal.style.color = '#fff';
    modal.style.padding = '1rem';
    modal.style.borderRadius = '8px';
    modal.style.width = '720px';
    modal.style.maxWidth = '95%';
    modal.style.boxShadow = '0 20px 60px rgba(0,0,0,0.6)';
    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong>Edit Akun #${akun.id || ''}</strong>
        <div style="display:flex;gap:.5rem;align-items:center">
          <button id="close-edit-modal" title="Tutup" style="background:none;border:none;color:#fff;font-size:1.1rem;cursor:pointer"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div id="edit-akun-panel" class="panel" data-id="${akun.id || ''}" style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;align-items:start">
        <div>
          <label>Nama</label>
          <input data-bind="nama" type="text" value="${(akun.nama||'').toString().replaceAll('"','&quot;')}" />
        </div>
        <div>
          <label>Harga</label>
          <input data-bind="harga" type="text" value="${(akun.harga||'').toString().replaceAll('"','&quot;')}" />
        </div>
        <div style="grid-column:1/3">
          <label>Deskripsi</label>
          <textarea data-bind="deskripsi" rows="3">${(akun.deskripsi||'').toString()}</textarea>
        </div>
        <div>
          <label>Rank</label>
          <input data-bind="rank" type="text" value="${(akun.rank||'').toString().replaceAll('"','&quot;')}" />
        </div>
        <div>
          <label>Skin</label>
          <input data-bind="skin" type="text" value="${(akun.skin||'').toString().replaceAll('"','&quot;')}" />
        </div>
        <div>
          <label>Hero</label>
          <input data-bind="hero" type="text" value="${(akun.hero||'').toString().replaceAll('"','&quot;')}" />
        </div>
        <div>
          <label>Winrate</label>
          <input data-bind="winrate" type="text" value="${(akun.winrate||'').toString().replaceAll('"','&quot;')}" />
        </div>
        <div>
          <label>Pertandingan</label>
          <input data-bind="pertandingan" type="text" value="${(akun.pertandingan||'').toString().replaceAll('"','&quot;')}" />
        </div>
        <div>
          <label>Magic Core</label>
          <input data-bind="magic_core" type="text" value="${(akun.magic_core||'').toString().replaceAll('"','&quot;')}" />
        </div>
        <div>
          <label>Emblem</label>
          <input data-bind="emblem" type="text" value="${(akun.emblem||'').toString().replaceAll('"','&quot;')}" />
        </div>
        <div>
          <label>Pribadi Beli</label>
          <input data-bind="pribadi_beli" type="text" value="${(akun.pribadi_beli||'').toString().replaceAll('"','&quot;')}" />
        </div>
        <div>
          <label>Log</label>
          <input data-bind="log" type="text" value="${(akun.log||'').toString().replaceAll('"','&quot;')}" />
        </div>
        <div>
          <label>Bind</label>
          <input data-bind="bind" type="text" value="${(akun.bind||'').toString().replaceAll('"','&quot;')}" />
        </div>
        <div style="grid-column:1/3;display:flex;gap:.5rem;align-items:center">
          <label style="min-width:64px">Status</label>
          <select data-bind="status" data-skip-validation="true">
            <option value="available" ${(isAvailableVal(akun.status) ? 'selected' : '')}>Available</option>
            <option value="sold" ${(!isAvailableVal(akun.status) ? 'selected' : '')}>Sold</option>
          </select>
          <div style="flex:1"></div>
          <button id="btn-update-panel" class="btn-action" style="padding:.45rem .8rem">Update</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // close handler
    modal.querySelector('#close-edit-modal').addEventListener('click', () => modal.remove());

    // Update button handler: use panel-wide validation
    modal.querySelector('#btn-update-panel').addEventListener('click', async (ev) => {
      const panel = modal.querySelector('#edit-akun-panel');
      const { valid, missingEl, payload } = validateAndCollectPanel(panel);
      if (!valid) {
        showToast('Isi semua data', 'error');
        if (missingEl && typeof missingEl.focus === 'function') missingEl.focus();
        return;
      }
      const btn = ev.currentTarget;
      btn.setAttribute('disabled','disabled');
      const prev = btn.innerHTML;
      btn.innerHTML = 'Menyimpan...';
      try {
        await sendPanelUpdate(panel, payload);
        showToast('Data berhasil disimpan', 'success');
        modal.remove();
        await refreshAll();
      } catch (err) {
        console.error('Update error', err);
        showToast('Gagal menyimpan: ' + (err.message || err), 'error');
      } finally {
        try { btn.removeAttribute('disabled'); btn.innerHTML = prev; } catch(e){}
      }
    });

    return modal;
  }

  /***************************************************************************
   * Actions: hapus, hapus semua gambar, openEdit (diganti), changeStatus
   * NOTE: confirm() replaced with showConfirm()
   ***************************************************************************/
  window.hapusAkun = async function(id) {
    const ok = await showConfirm("Yakin mau hapus akun ini? (termasuk semua gambarnya)", { title: 'Hapus Akun', confirmText: 'Hapus', cancelText: 'Batal' });
    if (!ok) return;
    try {
      const res = await fetch(`${API_DELETE}/${id}`, { method: "DELETE" });
      const result = await res.json();
      if (!result.success) throw new Error(result.message || 'Gagal hapus');
      await refreshAll();
      showToast("Akun berhasil dihapus!", 'success');
    } catch (err) {
      console.error('hapusAkun error', err);
      showToast("Gagal hapus akun: " + (err.message || err), 'error');
    }
  };

  window.hapusSemuaGambar = async function(id) {
    const ok = await showConfirm('Yakin hapus semua gambar untuk akun ini? Tindakan ini tidak dapat dibatalkan.', { title: 'Hapus Semua Gambar', confirmText: 'Hapus semua', cancelText: 'Batal' });
    if (!ok) return;
    try {
      const res = await fetch(`${API_DEL_IMAGES}/${id}`, { method: 'DELETE' });
      const r = await res.json();
      if (!r.success) throw new Error(r.message || 'Gagal hapus semua gambar');
      await refreshAll();
      showToast('Semua gambar berhasil dihapus', 'success');
    } catch (err) {
      console.error('hapusSemuaGambar error', err);
      showToast('Gagal menghapus semua gambar: ' + (err.message || err), 'error');
    }
  };

  // openEdit: buka modal edit (bukan prompt). Modal fields menggunakan data-bind sehingga update validator bekerja.
  window.openEdit = async function(id) {
    try {
      const res = await fetch(`${API_DETAIL}/${id}`);
      const r = await res.json();
      if (!r.success) throw new Error(r.message || 'Gagal ambil data');
      const akun = r.data || {};
      buildEditModal(akun);
    } catch (err) {
      console.error('openEdit error', err);
      showToast('Gagal ambil data: ' + (err.message || err), 'error');
    }
  };

  window.changeStatus = async function(id, selectEl) {
    if (!selectEl) return;
    try {
      selectEl.disabled = true;
      const val = String(selectEl.value);
      const statusBool = val === 'available';
      const res = await fetch(`${API_UPD}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusBool })
      });
      const r = await res.json();
      if (!r.success) throw new Error(r.message || 'Gagal update status');
      await refreshAll();
      showToast('Status berhasil diubah', 'success');
    } catch (err) {
      console.error('changeStatus error', err);
      showToast('Gagal mengganti status: ' + (err.message || err), 'error');
      await refreshAll();
    } finally {
      try { selectEl.disabled = false; } catch(e){}
    }
  };

  /***************************************************************************
   * refreshAll
   ***************************************************************************/
  async function refreshAll() {
    await fetchAkunFromServer();
    await fetchAkun();
    await fetchAkunDetail();
    await fetchGambarDetail();
  }

  /***************************************************************************
   * Search helpers (sama)
   ***************************************************************************/
  function prioritizeDataByQuery(data = [], rawQuery = '') {
    const q = String(rawQuery || '').trim();
    if (!q) return data.slice();

    const matched = [];
    const others = [];
    const qLower = q.toLowerCase();

    data.forEach(item => {
      let isMatch = false;
      if (!isNaN(q) && String(item.id) === String(q)) isMatch = true;
      if (!isMatch && item.id_akun !== undefined && String(item.id_akun) === q) isMatch = true;
      if (!isMatch && item.nama && String(item.nama).toLowerCase().includes(qLower)) isMatch = true;

      if (isMatch) matched.push(item);
      else others.push(item);
    });

    if (matched.length) return matched.concat(others);
    return data.slice();
  }

  function debounce(fn, wait = 300) {
    let t = null;
    const wrapper = (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
    wrapper.cancel = () => clearTimeout(t);
    return wrapper;
  }

  
  /***************************************************************************
   * DOM wiring / init
   ***************************************************************************/
  document.addEventListener("DOMContentLoaded", () => {
    const searchContainerEl = document.querySelector(".admin-container-search");
    if (searchContainerEl && searchContainerEl.parentElement) {
      searchContainerEl.parentElement.removeChild(searchContainerEl);
    }

    const sidebar = document.querySelector(".sidebar-admin");
    const btnMenu = document.querySelector(".btn-menu");
    const btnClose = document.querySelector("#btnClose");
    const inputSearch = document.querySelector("#input-search");

    const sections = document.querySelectorAll(".panel-section, #panel-form");
    const sidebarBtns = document.querySelectorAll(".sidebar-btn");
    function openSidebar() { if (sidebar) sidebar.style.transform = "translateX(0)"; }
    function closeSidebar() { if (sidebar) sidebar.style.transform = "translateX(-100%)"; }
    if (btnMenu) btnMenu.addEventListener("click", openSidebar);
    if (btnClose) btnClose.addEventListener("click", closeSidebar);

    function showSection(id) {
      sections.forEach(sec => {
        if (sec.id === id) sec.classList.add("active");
        else sec.classList.remove("active");
      });
    }
    sidebarBtns.forEach((btn, index) => {
      btn.addEventListener("click", () => {
        if (index === 0) showSection("panel-form");
        if (index === 1) showSection("panel-index");
        if (index === 2) showSection("panel-detail");
        if (index === 3) showSection("gambar-detail");
        closeSidebar();
      });
    });

    closeSidebar();
    showSection("panel-form");

    const doSearch = debounce(async (value) => {
      const q = (value || '').trim();
      if (!q) {
        if (originalDataCache === null) await fetchAkunFromServer();
        latestDataCache = originalDataCache.slice();
        await fetchAkun(latestDataCache);
        await fetchAkunDetail(latestDataCache);
        await fetchGambarDetail(latestDataCache);
        return;
      }
      if (originalDataCache === null) await fetchAkunFromServer();
      const prioritized = prioritizeDataByQuery(originalDataCache, q);
      latestDataCache = prioritized.slice();
      await fetchAkun(prioritized);
      await fetchAkunDetail(prioritized);
      await fetchGambarDetail(prioritized);
    }, 300);

    if (inputSearch) {
      inputSearch.onfocus = null;
      inputSearch.onblur = null;
      inputSearch.addEventListener('input', (e) => {
        doSearch(e.target.value || '');
      });
      inputSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSearch.cancel && doSearch.cancel();
          (async () => { await doSearch(e.target.value || ''); })();
        }
      });
    }
  });

  /***************************************************************************
   * Form submit: ubah alert -> toast dan validasi panel-wide jika perlu
   ***************************************************************************/
  if (formEl) {
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        // jika form inputs memiliki data-bind, kita dapat lakukan validasi panel-wide
        const { valid, missingEl } = validateAndCollectPanel(formEl);
        if (!valid) {
          showToast('Isi semua data', 'error');
          if (missingEl && typeof missingEl.focus === 'function') missingEl.focus();
          return;
        }

        const formData = new FormData(formEl);
        const res = await fetch(API_POST, { method: "POST", body: formData });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Gagal menyimpan');
        formEl.reset();
        await refreshAll();
        showToast("Akun berhasil ditambahkan!", 'success');
      } catch (err) {
        console.error('submit error', err);
        showToast("Harap isi semua data : " + (err.message || err), 'error');
      }
    });
  }

  // initial load
  (async function init() {
    await fetchAkunFromServer();
    await fetchAkun();
    await fetchAkunDetail();
    await fetchGambarDetail();
  })();

  // expose for debug
  window._fetchAkun = fetchAkun;
  window._fetchAkunDetail = fetchAkunDetail;
  window._fetchGambarDetail = fetchGambarDetail;

})();
