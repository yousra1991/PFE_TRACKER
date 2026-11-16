// Builds a single self-contained demo page (memory routes, backend embedded): node tools/build-demo.js out.html [--full]
const fs = require('fs'), path = require('path');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const out = process.argv[2] || path.join(__dirname, '../dist/pfe-tracker-demo.html');
const full = process.argv.includes('--full');
const safe = s => s.replace(/<\/(script)/gi, '<\\/$1');
const scripts = ['assets/i18n.js', 'assets/core.js', 'assets/charts.js', 'assets/gas-shim.js', 'assets/demo.js', 'assets/team.js', 'assets/admin.js', 'assets/app.js'];
let body = `<title>PFE Tracker Demo</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>
${R('assets/app.css')}
.artifact [data-act="print"], .artifact [data-act="print-code"], .artifact [data-act="a-export"] { display: none !important; }
</style>
<script>try { var th = localStorage.getItem('pfe.theme'); if (th) document.documentElement.setAttribute('data-theme', JSON.parse(th)); } catch (e) { }</script>
<div id="busy"></div>
<div id="app"></div>
<div id="modals"></div>
<div id="toasts" aria-live="polite"></div>
<script>document.body.classList.add('artifact'); window.PFE_CONFIG = { API_URL: '', TITLE: 'PFE Tracker' }; window.PFE_DEMO = true; window.PFE_MEMORY_ROUTES = true;</script>
<script>window.PFE_BACKEND_SRC = ${safe(JSON.stringify(R('backend/Code.gs')))};</script>
${scripts.map(f => '<script>\n' + safe(R(f)) + '\n</script>').join('\n')}
`;
if (full) body = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n' + body + '</body></html>';
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, body);
console.log(out, (body.length / 1024).toFixed(0) + ' KB');
