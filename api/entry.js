// api/entry.js
// Minimal serverless "wrapper" untuk Vercel.
// - Membuat satu instance Express di module scope (reuse antara request cold starts).
// - Menyediakan global.expressApp agar route.js dapat self-register.
// - Memanggil route.js (yang tidak mengekspor apa-apa).
// - Mengekspor handler yang mem-forward req/res ke express app.

const express = require('express');
const path = require('path');

if (!global.__EXPRESS_APP__) {
  // create express app once per container
  const app = express();

  // middleware (opsional) — contoh: body parsers
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // static assets: kalau Anda ada folder 'public', pastikan pathnya benar
  app.use(express.static(path.join(__dirname, '..', 'routes')));

  // expose ke global
  global.expressApp = app;
  global.__EXPRESS_APP__ = app;

  // require route.js yang akan langsung mendaftarkan route ke global.expressApp
  // route.js harus berada di root project. sesuaikan path kalau beda.
  require(path.join(__dirname, '..', 'route.js'));
}

// Export single handler for Vercel
module.exports = (req, res) => {
  // forward request to express app that's in global
  const app = global.__EXPRESS_APP__;
  if (!app) {
    res.statusCode = 500;
    return res.end('Express app not initialized');
  }
  return app(req, res);
};
