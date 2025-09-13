const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const pages = [
  { path: '/ml', file: 'index.html' },
  { path: '/akun', file: 'akun_ml.html' },
  { path: '/admin', file: 'admin.html' },
  { path: '/login', file: 'login.html' },
];

pages.forEach(route => {
  router.get(route.path, (req, res) => {
    const filePath = path.join(__dirname, '..', 'public', route.file);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send('File not found');
    }
  });
});

module.exports = router; // <-- ekspor langsung
