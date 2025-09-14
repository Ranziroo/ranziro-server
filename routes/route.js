// routes/route.js
// Self-registering: ketika di-require, file ini akan attach route ke global.expressApp
const path = require('path');
const fs = require('fs');

function attachRoutes(app) {
  if (!app || typeof app.get !== 'function') {
    console.warn('routes/route.js: tidak menemukan express app untuk mendaftarkan route.');
    return;
  }

  const pages = [
    { path: '/', file: 'index.html' },
    { path: '/mobile-legends', file: 'index.html' },
    { path: '/akun', file: 'akun_ml.html' },
    { path: '/admin', file: 'admin.html' },
    { path: '/login', file: 'login.html' }
  ];

  pages.forEach(route => {
    // hindari registrasi ganda
    const already = app._router && app._router.stack && app._router.stack.some(layer => {
      return layer.route && layer.route.path === route.path && layer.route.methods && layer.route.methods.get;
    });
    if (already) return;

    app.get(route.path, (req, res) => {
      try {
        // NOTE: route.js berada di ./routes, jadi public ada di parent folder
        const filePath = path.join(__dirname, '..', 'public', route.file);
        if (fs.existsSync(filePath)) return res.sendFile(filePath);
        return res.status(404).send('File not found');
      } catch (err) {
        console.error(`routes/route.js error for ${route.path}:`, err && err.stack ? err.stack : err);
        return res.status(500).send('Internal Server Error');
      }
    });
  });

  // health (jika belum ada)
  const healthAlready = app._router && app._router.stack && app._router.stack.some(layer => {
    return layer.route && layer.route.path === '/health' && layer.route.methods && layer.route.methods.get;
  });
  if (!healthAlready) {
    app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  }

  console.log('routes/route.js: routes attached');
}

// Auto-attach ke global.expressApp (tidak ada module.exports)
try {
  const appInstance = global.expressApp || global.__EXPRESS_APP__;
  if (appInstance) {
    attachRoutes(appInstance);
  } else {
    console.warn('routes/route.js: global.expressApp tidak ditemukan saat require — routes not attached.');
  }
} catch (e) {
  console.error('routes/route.js init error:', e && e.stack ? e.stack : e);
}
