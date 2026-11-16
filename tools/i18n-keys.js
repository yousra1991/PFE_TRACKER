// Lists every interface string (t('...') calls, vocabularies, settings defaults) and the ones missing in French.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '../assets');
const files = ['core.js', 'charts.js', 'team.js', 'admin.js', 'app.js', 'demo.js'];
const keys = new Set();
const add = s => { if (s && /[A-Za-z]/.test(s) && !/^[a-z0-9_.-]+$/.test(s)) keys.add(s.replace(/\\'/g, "'")); };
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1]);
  for (const m of src.matchAll(/\[\s*(?:'[^']*'|\d+)\s*,\s*'((?:[^'\\]|\\.)*)'(?:\s*,\s*'((?:[^'\\]|\\.)*)')?\s*\]/g)) { add(m[1]); if (m[2] && /\s/.test(m[2])) add(m[2]); }
  if (f === 'team.js') for (const m of src.matchAll(/\b(?:title|sub):\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1]);
  for (const m of src.matchAll(/^\s+[A-Z_]+:\s*'((?:[^'\\]|\\.)*)',?$/gm)) add(m[1]);
  for (const m of src.matchAll(/'[a-z]+\.[a-z]+':\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1]);
  for (const m of src.matchAll(/\b(?:red|orange|green|grey):\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1]);
  for (const m of src.matchAll(/\['(?:Overview|Plan|Record|Communicate|Team|General|Sign-up|Calendar|Lists|Emails)'/g)) add(m[0].slice(2, -1));
}
// default values of the settings shown through App.tv()
const gs = fs.readFileSync(path.join(__dirname, '../backend/Code.gs'), 'utf8');
for (const k of ['milestones_licence', 'milestones_master', 'task_categories', 'obstacle_categories']) {
  const m = new RegExp("\\['" + k + "', \\[([^\\]]*)\\]").exec(gs);
  if (m) for (const x of m[1].matchAll(/'([^']*)'/g)) add(x[1]);
}
global.window = {};
require(path.join(dir, 'i18n.js'));
const FR = window.App.FR;
['Home', 'Week', 'Teams', 'Review'].forEach(add);
const missing = [...keys].filter(k => !(k in FR)).sort();
const unused = Object.keys(FR).filter(k => !keys.has(k));
if (process.argv[2] === '--json') console.log(JSON.stringify(missing, null, 1));
else { console.log('keys:', keys.size, ' translated:', keys.size - missing.length, ' missing:', missing.length, ' unused:', unused.length); if (process.argv[2] === '--list') missing.forEach(k => console.log(k)); if (process.argv[2] === '--unused') unused.forEach(k => console.log(k)); }
process.exitCode = missing.length ? 1 : 0;
