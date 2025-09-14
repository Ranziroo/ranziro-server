// server.js (versi lengkap + route dinamis inline + auth endpoints + ADMIN_PW bootstrap)
require('dotenv').config();

const express = require('express');
const apps = express();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');

// ------------ safety: pastikan folder uploads ada ------------
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// === Multer (upload sementara) ===
const upload = multer({ dest: uploadsDir });

// === CORS config ===
// NOTE: remove trailing slashes from allowed origins to avoid mismatch
const allowedOrigins = [
  'https://ranziro-server-production.up.railway.app',
  'https://ranzirostore.vercel.app',
  'http://localhost:2121',
  'http://localhost:3000'
];

apps.use(cors({
  origin: function (origin, callback) {
    // allow no-origin (eg. same-origin requests from server-side tools, or cURL)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// disable caching
apps.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// body parsers
apps.use(bodyParser.json({ limit: '10mb' }));
apps.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
apps.use(cookieParser());

// ----------------- Supabase client -----------------
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.warn('⚠️ SUPABASE_URL atau SUPABASE_KEY tidak ditemukan di .env. Pastikan variabel env diset jika menggunakan Supabase.');
}
const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '');

// ----------------- Dynamic pages (inline routes) -----------------
/**
 * Dynamic pages array.
 * Jika kamu ingin menambah halaman baru, cukup tambahkan { path, file } ke array.
 *
 * Important: This block is intentionally before express.static so these page routes
 * are handled first (useful if you want to inject meta or handle them specially).
 *
 * Note: we skip '/akun' here because /akun has a custom meta-injection handler below.
 */
const pages = [
  { path: '/mobile-legends', file: 'index.html' },
  { path: '/akun', file: 'akun_ml.html' }, // kept for clarity but /akun handled separately
  { path: '/admin', file: 'admin.html' },
  { path: '/login', file: 'login.html' },
];

pages.forEach(route => {
  if (route.path === '/akun') {
    // skip here — /akun has special logic implemented later (meta injection)
    return;
  }
  apps.get(route.path, (req, res) => {
    try {
      const filePath = path.join(__dirname, 'public', route.file);
      if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
      }
      return res.status(404).send('File not found');
    } catch (err) {
      console.error(`Error serving ${route.path} -> ${route.file}:`, err && err.stack ? err.stack : err);
      return res.status(500).send('Internal Server Error');
    }
  });
});

// serve static public (assets, images, CSS, JS)
apps.use(express.static(path.join(__dirname, 'public')));

// ----------------- Session store (in-memory) & auth helpers -----------------
const sessions = new Map(); // token -> { user, expiresAt }
function genToken() { return crypto.randomBytes(32).toString('hex'); }

// cleanup expired sessions every 30 minutes
setInterval(() => {
  try {
    const now = Date.now();
    for (const [k, v] of sessions.entries()) {
      if (!v || v.expiresAt <= now) sessions.delete(k);
    }
  } catch (e) {
    console.warn('Session cleanup error', e);
  }
}, 30 * 60 * 1000);

/**
 * requireAdmin middleware:
 * - expects cookie 'admin_session'
 * - checks in-memory session store for validity and expiry
 */
function requireAdmin(req, res, next) {
  try {
    const token = req.cookies && req.cookies.admin_session;
    if (!token) return res.status(401).json({ success: false, message: 'Not authorized' });
    const sess = sessions.get(token);
    if (!sess) { res.clearCookie('admin_session'); return res.status(401).json({ success: false, message: 'Not authorized' }); }
    if (Date.now() > sess.expiresAt) { sessions.delete(token); res.clearCookie('admin_session'); return res.status(401).json({ success: false, message: 'Session expired' }); }
    req.user = sess.user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }
}

// ----------------- Bootstrap admin user if missing -----------------
async function ensureAdminExists() {
  try {
    let existing;
    try {
      const q = await supabase
        .from('ranzirostore_loginadmin')
        .select('*')
        .eq('username', 'admin')
        .limit(1)
        .maybeSingle();
      existing = q && q.data !== undefined ? q.data : q;
    } catch (e) {
      const q2 = await supabase
        .from('ranzirostore_loginadmin')
        .select('*')
        .eq('username', 'admin')
        .limit(1);
      existing = (q2 && q2.data && q2.data.length) ? q2.data[0] : null;
    }

    if (existing) {
      console.log('ℹ️ Admin user already exists in ranzirostore_loginadmin.');
      return;
    }

    const adminPlain = process.env.ADMIN_PW;
    if (!adminPlain) {
      console.warn('⚠️ ADMIN_PW not set in env. Skipping creating admin user. Set ADMIN_PW to auto-create admin at startup.');
      return;
    }

    const saltRounds = 12;
    const hash = await bcrypt.hash(String(adminPlain), saltRounds);

    const { data: up, error: upErr } = await supabase
      .from('ranzirostore_loginadmin')
      .insert([{ username: 'admin', password_hash: hash, role: 'admin', created_at: new Date() }])
      .select();

    if (upErr) {
      console.error('Failed to create admin in ranzirostore_loginadmin:', upErr);
    } else {
      console.log('✅ Admin user created in ranzirostore_loginadmin (password hash stored).');
    }
  } catch (err) {
    console.error('ensureAdminExists error:', err && err.stack ? err.stack : err);
  }
}

// Run admin bootstrap (don't block server startup)
ensureAdminExists().catch(err => console.error('ensureAdminExists failed:', err));

// ----------------- Auth endpoints -----------------
apps.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ success: false, message: 'username & password required' });

    if (String(username).toLowerCase() !== 'admin') {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const { data, error } = await supabase
      .from('ranzirostore_loginadmin')
      .select('*')
      .eq('username', 'admin')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Supabase error on login fetch:', error);
      return res.status(500).json({ success: false, message: 'Internal error' });
    }
    if (!data) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const storedHash = String(data.password_hash || data.password || '').trim();
    if (!storedHash) {
      console.error('No password_hash found for admin row.');
      return res.status(500).json({ success: false, message: 'Server misconfigured' });
    }

    const match = await bcrypt.compare(String(password), storedHash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = genToken();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 1 day
    sessions.set(token, { user: 'admin', expiresAt });

    const cookieOptions = {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/'
    };
    if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;

    res.cookie('admin_session', token, cookieOptions);

    try {
      await supabase.from('ranzirostore_loginadmin').update({ last_login: new Date() }).eq('username', 'admin');
    } catch (e) {
      console.warn('Could not write last_login:', e);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('ERR /api/login', err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

apps.post('/api/logout', (req, res) => {
  try {
    const token = req.cookies && req.cookies.admin_session;
    if (token) sessions.delete(token);
    res.clearCookie('admin_session', { path: '/' });
    return res.json({ success: true });
  } catch (err) {
    console.error('ERR /api/logout', err);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

apps.get('/api/check-session', requireAdmin, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ----------------- Helper: escapeHtml & /akun meta injection -----------------
const escapeHtml = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Custom /akun handler (meta injection for social previews)
apps.get('/akun', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'public', 'akun_ml.html');
    if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

    let html = fs.readFileSync(filePath, 'utf8');

    // default meta (absolute)
    const host = req.protocol + '://' + req.get('host');
    // Use absolute supabase public image URL as default
    let ogImage = 'https://lzycriwqrcqbiijtiipa.supabase.co/storage/v1/object/public/gambar/logo/meta_ranziro.webp';
    let title = 'Ranziro Store - Detail Akun';
    let desc = 'Detail akun Mobile Legends di Ranziro Store';

    // prefer id query param (sesuaikan: id / nama / id_akun)
    const qId = req.query.id || req.query.id_akun || req.query.account_id;
    const qNama = req.query.nama || req.query.name;

    if (qId) {
      const { data, error } = await supabase
        .from('ranzirostore_akunml')
        .select('*')
        .eq('id', qId)
        .single();
      if (!error && data) {
        const imgs = Array.isArray(data.gambars) ? data.gambars : (typeof data.gambars === 'string' ? (()=>{ try{return JSON.parse(data.gambars);}catch(e){return[]}})() : []);
        const first = (imgs && imgs[0]) || data.gambar;
        if (first) {
          ogImage = first.startsWith('http') ? first : (host + '/' + first.replace(/^\//, ''));
        }
        title = data.nama || title;
        desc = data.deskripsi || desc;
      }
    } else if (qNama) {
      const { data, error } = await supabase
        .from('ranzirostore_akunml')
        .select('*')
        .ilike('nama', `%${qNama}%`)
        .limit(1);
      if (!error && Array.isArray(data) && data[0]) {
        const d = data[0];
        const imgs = Array.isArray(d.gambars) ? d.gambars : [];
        const first = (imgs && imgs[0]) || d.gambar;
        if (first) ogImage = first.startsWith('http') ? first : (host + '/' + first.replace(/^\//, ''));
        title = d.nama || title;
        desc = d.deskripsi || desc;
      }
    }

    // build meta tags
    const meta = `
      <meta property="og:type" content="website" />
      <meta property="og:title" content="${escapeHtml(title)}" />
      <meta property="og:description" content="${escapeHtml(desc)}" />
      <meta property="og:image" content="${ogImage}" />
      <meta property="og:url" content="${host + req.originalUrl}" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="${escapeHtml(title)}" />
      <meta name="twitter:description" content="${escapeHtml(desc)}" />
      <meta name="twitter:image" content="${ogImage}" />
    `;

    // insert meta before </head>
    if (html.indexOf('</head>') !== -1) {
      html = html.replace('</head>', meta + '\n</head>');
    } else {
      html = meta + '\n' + html;
    }

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('ERR /akun meta inject', err);
    // fallback: kirim file tanpa injection
    res.sendFile(path.join(__dirname, 'public', 'akun_ml.html'));
  }
});

// ----------------- Health check -----------------
apps.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ===================== API: ranzirostore_akunml & gambar =====================

// GET semua akun
apps.get('/api/ranzirostore_akunml', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ranzirostore_akunml')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message || err });
  }
});

// POST tambah akun detail dengan banyak gambar
apps.post('/api/post_akun_detail', upload.array('gambar', 10), async (req, res) => {
  try {
    const {
      nama, harga, id_akun, deskripsi, rank, skin, hero, winrate,
      pertandingan, magic_core, emblem, pribadi_beli, log, bind
    } = req.body;

    const files = req.files || [];
    if (!nama || !harga || !id_akun) {
      return res.status(400).json({ success: false, message: 'nama, harga, id_akun wajib diisi' });
    }

    // upload file ke bucket 'gambar' (Supabase storage)
    const uploadedUrls = [];
    for (const file of files) {
      const ext = path.extname(file.originalname) || '';
      const fileName = `akun_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;

      const up = await supabase.storage
        .from('gambar')
        .upload(fileName, fs.createReadStream(file.path), {
          contentType: file.mimetype,
          duplex: 'half'
        });

      // hapus file lokal
      try { fs.unlinkSync(file.path); } catch (e) {}

      if (up.error) throw up.error;

      const { data: publicUrl } = supabase.storage.from('gambar').getPublicUrl(fileName);
      uploadedUrls.push(publicUrl.publicUrl);
    }

    const firstGambar = uploadedUrls.length ? uploadedUrls[0] : null;

    // baca status dari form (handle string atau boolean)
    const statusRaw = req.body.status;
    const status = (typeof statusRaw === 'string')
      ? (!['sold','false','0'].includes(statusRaw.toLowerCase()))
      : Boolean(statusRaw);

    const { data, error } = await supabase
      .from('ranzirostore_akunml')
      .insert([{
        nama,
        harga,
        id_akun,
        deskripsi,
        rank,
        skin: skin ? parseInt(skin) : null,
        hero: hero ? parseInt(hero) : null,
        winrate,
        pertandingan: pertandingan ? parseInt(pertandingan) : null,
        magic_core,
        emblem,
        pribadi_beli,
        log,
        bind,
        gambar: firstGambar,
        gambars: uploadedUrls,
        status,
      }])
      .select();

    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('POST /api/post_akun_detail ->', err);
    res.status(500).json({ success: false, message: err.message || err });
  }
});

// GET detail akun by id
apps.get('/api/akun_detail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('ranzirostore_akunml')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || err });
  }
});

// POST append images to existing akun
apps.post('/api/upload_images/:id', upload.array('gambar', 10), async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, message: 'Tidak ada file' });

    const { data: existing, error: fetchErr } = await supabase
      .from('ranzirostore_akunml')
      .select('gambars')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    const current = Array.isArray(existing.gambars) ? existing.gambars : [];

    const uploaded = [];
    for (const file of files) {
      const ext = path.extname(file.originalname) || '';
      const fileName = `akun_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;

      const up = await supabase.storage
        .from('gambar')
        .upload(fileName, fs.createReadStream(file.path), {
          contentType: file.mimetype,
          duplex: 'half'
        });

      try { fs.unlinkSync(file.path); } catch (e) {}
      if (up.error) throw up.error;

      const { data: publicUrl } = supabase.storage.from('gambar').getPublicUrl(fileName);
      uploaded.push(publicUrl.publicUrl);
    }

    const newArr = current.concat(uploaded);
    const first = newArr.length ? newArr[0] : null;
    const { data, error } = await supabase
      .from('ranzirostore_akunml')
      .update({ gambars: newArr, gambar: first, updated_at: new Date() })
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || err });
  }
});

// DELETE single image (body: { id, url })
apps.delete('/api/del_image', async (req, res) => {
  try {
    const { id, url } = req.body;
    if (!id || !url) return res.status(400).json({ success: false, message: 'id dan url diperlukan' });

    const { data: akun, error: fetchErr } = await supabase
      .from('ranzirostore_akunml')
      .select('gambars')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    const current = Array.isArray(akun.gambars) ? akun.gambars : [];
    const fileName = url.split('/').pop();

    const { error: removeErr } = await supabase.storage.from('gambar').remove([fileName]);
    if (removeErr) {
      console.warn('removeErr', removeErr.message || removeErr);
    }

    const newArr = current.filter(u => u !== url);
    const first = newArr.length ? newArr[0] : null;
    const { data, error } = await supabase
      .from('ranzirostore_akunml')
      .update({ gambars: newArr, gambar: first, updated_at: new Date() })
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || err });
  }
});

// DELETE all images for an account
apps.delete('/api/del_images/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: akun, error: fetchErr } = await supabase
      .from('ranzirostore_akunml')
      .select('gambars')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    const current = Array.isArray(akun.gambars) ? akun.gambars : [];
    const fileNames = current.map(u => u.split('/').pop()).filter(Boolean);
    if (fileNames.length) {
      const { error: removeErr } = await supabase.storage.from('gambar').remove(fileNames);
      if (removeErr) throw removeErr;
    }

    const { data, error } = await supabase
      .from('ranzirostore_akunml')
      .update({ gambars: [], gambar: null, updated_at: new Date() })
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || err });
  }
});

// PUT reorder images
apps.put('/api/reorder_images/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ success: false, message: 'order harus array URL' });

    const first = order.length ? order[0] : null;
    const { data, error } = await supabase
      .from('ranzirostore_akunml')
      .update({ gambars: order, gambar: first, updated_at: new Date() })
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || err });
  }
});

// Update existing akun (fields only)
apps.put('/api/upd_ranzirostore_akunml/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};
    if (payload.status !== undefined) {
      if (typeof payload.status === 'string') {
        payload.status = !['sold','false','0'].includes(payload.status.toLowerCase());
      } else {
        payload.status = Boolean(payload.status);
      }
    }
    delete payload.id;

    const { data, error } = await supabase
      .from('ranzirostore_akunml')
      .update({ ...payload, updated_at: new Date() })
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || err });
  }
});

// Delete akun (remove images first)
apps.delete('/api/del_ranzirostore_akunml/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: akunData, error: fetchError } = await supabase
      .from('ranzirostore_akunml')
      .select('gambars')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const fileNames = (akunData.gambars || []).map(u => u.split('/').pop()).filter(Boolean);
    if (fileNames.length) {
      const { error: deleteFileError } = await supabase.storage.from('gambar').remove(fileNames);
      if (deleteFileError) throw deleteFileError;
    }

    const { data, error } = await supabase
      .from('ranzirostore_akunml')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || err });
  }
});

// ----------------- Start server -----------------
const port = process.env.PORT || 2121;
apps.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});

// ----------------- End server -----------------