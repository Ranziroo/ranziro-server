// api/entry.js
const express = require('express');
const path = require('path');

if (!global.__EXPRESS_APP__) {
  const app = express();

  // middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // serve static assets dari folder public (root/public)
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // expose app supaya routes self-registering dapat menemukan app
  global.expressApp = app;
  global.__EXPRESS_APP__ = app;

  // REQUIRE routes file yang berada di routes/route.js (tanpa export)
  try {
    require(path.join(__dirname, '..', 'routes', 'route.js'));
    console.log('routes/route.js loaded');
  } catch (e) {
    console.warn('Failed to load routes/route.js:', e && e.message ? e.message : e);
  }
}

// Vercel handler: forward ke express instance
module.exports = (req, res) => {
  const app = global.__EXPRESS_APP__;
  if (!app) {
    res.statusCode = 500;
    return res.end('Express not initialized');
  }
  return app(req, res);
};
