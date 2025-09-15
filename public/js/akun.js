// akun.js — lengkap + reliable mobile-only gallery-2 trigger
(function () {
  'use strict';

  const API = `https://ranziro-server-production.up.railway.app/api/ranzirostore_akunml`;
  const DEFAULT_WA = '6285863146541';

  /* ---------- helpers ---------- */
  const pick = (obj, keys = []) => {
    if (!obj) return undefined;
    for (const k of keys) {
      if (k in obj && obj[k] !== null && obj[k] !== undefined) {
        const v = obj[k];
        if (typeof v === 'string' && v.trim() === '') continue;
        return v;
      }
    }
    return undefined;
  };

  const parseImages = (v) => {
    if (!v && v !== 0) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
      try {
        const j = JSON.parse(v);
        if (Array.isArray(j)) return j;
      } catch (e) {}
      if (v.indexOf(',') !== -1) return v.split(',').map(s => s.trim()).filter(Boolean);
      return [v.trim()];
    }
    return [String(v)];
  };

  const safeImg = (src) => {
    if (!src) return 'logo/meta_ranziro.webp';
    src = String(src);
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) return src;
    return `img-webp/${src}`;
  };

  const formatPrice = (v) => {
    if (v === null || v === undefined || v === '') return '-';
    const s = String(v);
    if (/Rp/i.test(s)) return s;
    const n = Number(s.replace(/[^0-9.-]/g, '')) || 0;
    return 'Rp ' + n.toLocaleString('id-ID');
  };

  const isAvailableFromVal = (val) => {
    if (val === undefined || val === null) return true;
    const s = String(val).toLowerCase();
    if (s === 'false' || s === '0' || s === 'sold' || s === 'no' || s === 'tidak') return false;
    return true;
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ---------- DOM refs ---------- */
  const sliderImagesEl = $('#slider-images');
  const soldOverlayEl = $('.container-sold-slider');
  const accountNameEl = $('#account-name');
  const accountIdEl = $('#account-id');
  const accountPriceEl = $('#account-price');
  const rekberBtn = $('.btn-rekber');
  const triggerGalleryBtn = document.querySelector('.trigger-gallery-2');
  const gallery2Panel = document.querySelector('.gallery-2');

  /* ---------- slider state ---------- */
  let sliderState = { idx: 0, width: 0 };

  function updateSliderSizing() {
    const sliderWrap = $('.slider');
    if (!sliderWrap || !sliderImagesEl) return;
    sliderState.width = Math.max(240, sliderWrap.clientWidth || sliderWrap.getBoundingClientRect().width || 300);
    $$('.slider-images .slide').forEach(img => {
      img.style.minWidth = `${sliderState.width}px`;
      img.style.maxWidth = `${sliderState.width}px`;
      img.style.objectFit = 'cover';
      img.style.display = 'block';
    });
  }

  function updateSliderPosition() {
    if (!sliderImagesEl) return;
    sliderImagesEl.style.transform = `translateX(${-sliderState.idx * sliderState.width}px)`;
  }

  window.prevSlide = function () {
    const slides = $$('.slider-images .slide');
    if (!slides.length) return;
    sliderState.idx = (sliderState.idx > 0) ? sliderState.idx - 1 : slides.length - 1;
    updateSliderPosition();
  };
  window.nextSlide = function () {
    const slides = $$('.slider-images .slide');
    if (!slides.length) return;
    sliderState.idx = (sliderState.idx < slides.length - 1) ? sliderState.idx + 1 : 0;
    updateSliderPosition();
  };

  window.addEventListener('resize', () => setTimeout(() => { updateSliderSizing(); updateSliderPosition(); }, 60));

  /* ---------- fill detail (labels included) ---------- */
  const FIELD_MAP = [
    { selector: '.deskripsi-akun', keys: ['deskripsi','detail','description','desc'], label: 'Deskripsi' },
    { selector: '.rank-tertinggi', keys: ['rank','rankTertinggi','rank_tertinggi'], label: 'Rank Tertinggi' },
    { selector: '.total-skin', keys: ['skin','totalSkin','total_skin'], label: 'Total Skin' },
    { selector: '.total-hero', keys: ['totalHero','total-hero','hero','totalHeroCount'], label: 'Total Hero' },
    { selector: '.total-winrate', keys: ['winrate','totalWinrate','win_rate'], label: 'Winrate' },
    { selector: '.total-pertandingan', keys: ['pertandingan','totalPertandingan','matches','total_matches'], label: 'Total Pertandingan' },
    { selector: '.total-magic-core', keys: ['magic_core','totalMagicCore','magicCore'], label: 'Total Magic Core' },
    { selector: '.level-emblem', keys: ['emblem','levelEmblem','level_emblem'], label: 'Level Emblem' },
    { selector: '.bukti-top-up', keys: ['bukti_top_up','buktiTopUp','bukti_topup'], label: 'Bukti Top Up' },
    { selector: '.akun-pribadi', keys: ['pribadi_beli','akunPribadi','akun_pribadi','type','kondisi'], label: 'Akun Pribadi/Beli' },
    { selector: '.akun-log', keys: ['log','history','akun_log'], label: 'Log Akun' },
    { selector: '.bind-akun', keys: ['bind','bind_akun','nama-bind','nama_bind','bindakun'], label: 'Bind' }
  ];

  function setLabeledText(selector, label, value) {
    const el = $(selector);
    if (!el) return;
    const safe = (value === undefined || value === null || value === '') ? '-' : value;
    el.textContent = `${label} : ${safe}`;
  }

  function fillDetail(item) {
    if (!item) return;
    const rawName = pick(item, ['nama-bind','nama_bind','nama','namaAkun','name','account_name']) || '';
    const nameClean = String(rawName).split('|')[0].split('-')[0].trim();
    const id = pick(item, ['id_akun','id','account_id','idAccount']) || '';
    const price = formatPrice(pick(item, ['harga','price','price_display','hargaAkun'])) || '-';
    const wa = pick(item, ['wa','waRekber','wa_rekber','admin_wa','whatsapp']) || DEFAULT_WA;

    if (accountNameEl) accountNameEl.textContent = nameClean || rawName || '-';
    if (accountIdEl) accountIdEl.textContent = id || '-';
    if (accountPriceEl) accountPriceEl.textContent = price;

    FIELD_MAP.forEach(({ selector, keys, label }) => {
      const v = pick(item, keys);
      setLabeledText(selector, label, v);
    });

    if (rekberBtn) {
      const message = `Halo Admin, saya ingin menanyakan akun: ${nameClean || rawName || '-'} (ID: ${id || '-'}) - Harga: ${price}`;
      const cleanWA = String(wa).replace(/[^\d+]/g,'') || DEFAULT_WA;
      rekberBtn.href = `https://wa.me/${cleanWA}?text=${encodeURIComponent(message)}`;
      rekberBtn.target = '_blank';
      rekberBtn.rel = 'noopener noreferrer';
    }

    // images
    let imgs = parseImages(pick(item, ['gambars','gallery','gallery_images','images','gambar','imgAkun','img','photos','foto']));
    if (!imgs.length) {
      const single = pick(item, ['gambar','image','img','photo']);
      if (single) imgs = parseImages(single);
    }
    if (!imgs.length) imgs = ['logo/meta_ranziro.webp'];

    if (sliderImagesEl) {
      sliderImagesEl.innerHTML = '';
      const frag = document.createDocumentFragment();
      imgs.forEach(src => {
        const img = document.createElement('img');
        img.className = 'slide';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = nameClean || rawName || '';
        img.src = safeImg(src);
        frag.appendChild(img);
      });
      sliderImagesEl.appendChild(frag);
      sliderState.idx = 0;
      setTimeout(() => { updateSliderSizing(); updateSliderPosition(); }, 120);
    }

    // sold overlay
    const statusVal = pick(item, ['status','available','is_available','isAvailable','sold','is_sold']);
    const available = isAvailableFromVal(statusVal);
    if (soldOverlayEl) soldOverlayEl.style.display = available ? 'none' : 'grid';
  }

  /* ---------- find and fetch ---------- */
  function findAccountByQuery(data, qname, qid) {
    if (!Array.isArray(data)) return null;
    const norm = s => String(s||'').toLowerCase().trim();
    return data.find(item => {
      const idv = pick(item, ['id_akun','id','account_id','idAccount']);
      if (qid && idv && String(idv) === String(qid)) return true;
      const nm = pick(item, ['nama-bind','nama_bind','nama','namaAkun','name','account_name']) || '';
      const nmClean = String(nm).split('|')[0].split('-')[0].trim();
      if (qname) {
        if (norm(nm) === norm(qname)) return true;
        if (norm(nmClean) === norm(qname)) return true;
        if (norm(nm).includes(norm(qname))) return true;
      }
      // fallback: search any string field
      if (qname) {
        for (const fk of Object.keys(item)) {
          try {
            if (String(item[fk]).toLowerCase().includes(qname.toLowerCase())) return true;
          } catch (e) {}
        }
      }
      return false;
    }) || null;
  }

  async function fetchData() {
    try {
      const res = await fetch(API, { cache: 'no-cache' });
      const json = await res.json();
      if (!json) return [];
      const data = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : (json.data || []));
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('akun.js fetch error', err);
      return [];
    }
  }

  /* ---------- MOBILE gallery-2 trigger (robust) ---------- */
  function setupGallery2TriggerMobile() {
    const btn = triggerGalleryBtn;
    const panel = gallery2Panel;
    if (!btn || !panel) {
      console.debug('[g2] trigger or panel not found');
      return;
    }

    // match media
    const mq = window.matchMedia('(max-width:480px)');
    let active = false;
    let onBtn, onDoc, onKey;

    const open = () => {
      // Force display block (in case CSS sets display:none)
      panel.style.display = 'block';
      // compute and animate via maxHeight
      const fullH = panel.scrollHeight;
      panel.style.maxHeight = '0px';
      // force reflow
      panel.getBoundingClientRect();
      panel.style.transition = 'max-height 260ms ease';
      panel.style.maxHeight = fullH + 'px';
      panel.classList.add('open-mobile');
      btn.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      // cleanup after transition
      const end = () => {
        panel.style.maxHeight = ''; // allow CSS to manage
        panel.removeEventListener('transitionend', end);
      };
      panel.addEventListener('transitionend', end);
      // optional scroll
      setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'center' }), 260);
      console.debug('[g2] open');
    };

    const close = () => {
      // animate to 0 then hide
      const curH = panel.scrollHeight;
      panel.style.maxHeight = curH + 'px';
      // reflow
      panel.getBoundingClientRect();
      panel.style.transition = 'max-height 200ms ease';
      panel.style.maxHeight = '0px';
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      const end = () => {
        panel.classList.remove('open-mobile');
        panel.style.display = 'none';
        panel.style.maxHeight = '';
        panel.style.transition = '';
        panel.removeEventListener('transitionend', end);
      };
      panel.addEventListener('transitionend', end);
      console.debug('[g2] close');
    };

    const toggle = (ev) => {
      if (ev) ev.preventDefault();
      const isOpen = panel.classList.contains('open-mobile') && getComputedStyle(panel).maxHeight !== '0px';
      if (isOpen) close();
      else open();
    };

    function enable() {
      if (active) return;
      // ensure panel starts closed on mobile
      panel.classList.remove('open-mobile');
      panel.style.display = 'none';
      panel.style.maxHeight = '0px';
      btn.setAttribute('aria-expanded', 'false');

      onBtn = toggle;
      onDoc = (e) => {
        const t = e.target;
        if (!panel || !btn) return;
        if (panel.contains(t) || btn.contains(t)) return;
        // close if open
        if (panel.classList.contains('open-mobile')) close();
      };
      onKey = (e) => {
        if (e.key === 'Escape' && panel.classList.contains('open-mobile')) close();
      };

      btn.addEventListener('click', onBtn);
      document.addEventListener('click', onDoc);
      document.addEventListener('keydown', onKey);
      active = true;
      console.debug('[g2] handlers enabled (mobile)');
    }

    function disable() {
      if (!active) return;
      btn.removeEventListener('click', onBtn);
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
      onBtn = onDoc = onKey = null;
      // cleanup so desktop CSS controls it
      panel.classList.remove('open-mobile');
      panel.style.display = '';
      panel.style.maxHeight = '';
      panel.style.transition = '';
      btn.setAttribute('aria-expanded', 'false');
      btn.classList.remove('open');
      active = false;
      console.debug('[g2] handlers disabled (desktop)');
    }

    const mqHandler = (e) => {
      if (e.matches) enable();
      else disable();
    };

    // initial
    if (mq.matches) enable(); else disable();

    // listen changes
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', mqHandler);
    else if (typeof mq.addListener === 'function') mq.addListener(mqHandler);

    // return controller
    return { enable, disable, destroy() { disable(); if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', mqHandler); else if (typeof mq.removeListener === 'function') mq.removeListener(mqHandler); } };
  }

  /* ---------- init ---------- */
  (async function init() {
    const data = await fetchData();
    window.__AKUN_DATA = data || [];

    const params = new URLSearchParams(location.search);
    const qname = params.get('nama') ? decodeURIComponent(params.get('nama')) : null;
    const qid = params.get('id') ? params.get('id') : null;

    if (qname || qid) {
      const acc = findAccountByQuery(data, qname, qid);
      if (acc) fillDetail(acc);
      else {
        console.warn('akun.js: account not found', { qname, qid });
        if (data && data.length) fillDetail(data[0]);
      }
    } else {
      // choose featured / available / first
      let featured = (data || []).find(x => {
        const f = pick(x, ['featured','is_featured','highlight','pilihan']);
        return f === true || String(f).toLowerCase() === 'true';
      });
      if (!featured) featured = (data || []).find(x => isAvailableFromVal(pick(x, ['status','available','is_available'])));
      if (!featured && data && data.length) featured = data[0];
      if (featured) fillDetail(featured);
    }

    // small footer fill
    try { if ($('#year')) $('#year').textContent = new Date().getFullYear(); if ($('#last-accessed')) $('#last-accessed').textContent = new Date().toLocaleString(); } catch (e){}

    // set up mobile trigger after DOM ready
    try {
      // Delay a bit so CSS loads and computed styles are stable
      setTimeout(() => {
        setupGallery2TriggerMobile();
      }, 60);
    } catch (e) { console.error(e); }

  })();

  /* ---------- helper: findAccountByQuery used in init (copied here) ---------- */
  function findAccountByQuery(data, qname, qid) {
    if (!Array.isArray(data)) return null;
    const norm = s => String(s||'').toLowerCase().trim();
    return data.find(item => {
      const idv = pick(item, ['id_akun','id','account_id','idAccount']);
      if (qid && idv && String(idv) === String(qid)) return true;
      const nm = pick(item, ['nama-bind','nama_bind','nama','namaAkun','name','account_name']) || '';
      const nmClean = String(nm).split('|')[0].split('-')[0].trim();
      if (qname) {
        if (norm(nm) === norm(qname)) return true;
        if (norm(nmClean) === norm(qname)) return true;
        if (norm(nm).includes(norm(qname))) return true;
      }
      if (qname) {
        for (const fk of Object.keys(item)) {
          try {
            if (String(item[fk]).toLowerCase().includes(qname.toLowerCase())) return true;
          } catch (e) {}
        }
      }
      return false;
    }) || null;
  }

  /* ---------- end ---------- */
})();