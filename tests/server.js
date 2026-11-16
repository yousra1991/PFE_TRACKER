// Local test server: serves the website and runs backend/Code.gs in the Apps Script simulator.
// node tests/server.js [port]      then open http://127.0.0.1:8791/
const http = require('http'), fs = require('fs'), path = require('path');
const Sim = require('../assets/gas-shim.js');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8791);
let offset = 0;
const rt = Sim.createRuntime(fs.readFileSync(path.join(ROOT, 'backend/Code.gs'), 'utf8'), { now: () => Date.now() + offset });
rt.run('install');
rt.run('setAdminPassword_', 'teacher-2026');
{ const tk = rt.post({ action: 'admin.login', password: 'teacher-2026' }).data.token; rt.post({ action: 'admin.config', token: tk, values: { registration_key: '' } }); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.gs': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/api') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let out;
      try { out = rt.post(JSON.parse(body || '{}')); } catch (e) { out = { ok: false, error: 'SERVER', message: String(e) }; }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  if (url.pathname === '/__state') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ store: rt.store })); }
  if (url.pathname === '/__time') { offset = Number(url.searchParams.get('offset') || 0); res.writeHead(200); return res.end('ok'); }
  if (url.pathname === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end('window.PFE_CONFIG = { API_URL: "", TEST_API: "http://127.0.0.1:' + PORT + '/api", TITLE: "PFE Tracker" };');
  }
  const f = path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(PORT, '127.0.0.1', () => console.log('test server on http://127.0.0.1:' + PORT));
