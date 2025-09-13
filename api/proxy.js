// api/proxy.js
// Universal proxy: meneruskan semua request ke Railway server

const TARGET_BASE = "https://ranziro-server-production.up.railway.app";

module.exports = async (req, res) => {
  try {
    // Gabungkan path + query ke Railway
    const target = TARGET_BASE + req.url;

    // Salin headers tapi buang host
    const headers = { ...req.headers };
    delete headers.host;

    // Baca body request (kalau ada)
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    // Kirim request ke Railway
    const fetchRes = await fetch(target, {
      method: req.method,
      headers,
      body: body.length ? body : undefined,
    });

    // Set status code
    res.statusCode = fetchRes.status;

    // Salin headers dari Railway ke response
    fetchRes.headers.forEach((value, key) => {
      if (["transfer-encoding", "content-encoding", "connection"].includes(key))
        return;
      res.setHeader(key, value);
    });

    // Kirim balik body response
    const arrayBuf = await fetchRes.arrayBuffer();
    res.end(Buffer.from(arrayBuf));
  } catch (err) {
    console.error("proxy error", err);
    res.statusCode = 502;
    res.end("Bad Gateway");
  }
};
