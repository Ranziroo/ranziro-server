// api/entry.js
const { URL } = require('url');
const http = require('http');
const https = require('https');

const BACKEND = process.env.RAILWAY_BACKEND_URL;

module.exports = (req, res) => {
  if (!BACKEND) {
    res.statusCode = 500;
    return res.end('RAILWAY_BACKEND_URL not configured');
  }

  try {
    const backendUrl = new URL(req.url, BACKEND);
    const lib = backendUrl.protocol === 'https:' ? https : http;

    const headers = { ...req.headers };
    delete headers.host;

    const options = {
      method: req.method,
      headers
    };

    const proxyReq = lib.request(backendUrl, options, proxyRes => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', err => {
      console.error('proxy error', err);
      if (!res.headersSent) res.writeHead(502);
      res.end('Bad Gateway');
    });

    req.pipe(proxyReq);
  } catch (err) {
    console.error('proxy handler error', err);
    res.statusCode = 500;
    res.end('Internal server error');
  }
};
