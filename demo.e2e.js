// Demo mode: the real backend runs inside the browser (no server). Also produces the screenshots of the README.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const S = 'http://127.0.0.1:8791';
const SHOTS = path.join(__dirname, '.shots');
fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0, passes = 0;
const check = (c, m) => { if (c) { passes++; console.log('PASS ' + m); } else { fails++; console.log('FAIL ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const errors = [];
  const mk = async (vp, scale) => { const c = await b.newContext({ viewport: vp, deviceScaleFactor: scale || 1 }); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts/.test(m.text())) errors.push(m.text()); }); return p; };
  const p = await mk({ width: 1360, height: 900 }, 2);
  const t0 = Date.now();
  await p.goto(S + '/?demo=1#/');
  await p.waitForSelector('.demo-codes', { timeout: 20000 });
  check(true, 'demo seeded and ready in ' + (Date.now() - t0) + ' ms');
  const codes = await p.$$eval('.demo-team b', bs => bs.map(x => x.textContent));
  check(codes.length === 4, 'landing lists 3 team codes + the supervisor password');
  await p.screenshot({ path: path.join(SHOTS, 'demo-landing.png') });
  await p.click('.demo-team >> nth=0'); await sleep(900);
  if (await p.isVisible('[data-act=pick-actor]')) { await p.click('[data-act=pick-actor] >> nth=0'); await sleep(400); }
  const dash = await p.textContent('main');
  check(dash.includes('Real-time sign language recognition'), 'demo team A dashboard');
  check(/Supervisor feedback[\s\S]*(Excellent|Good)/.test(dash), 'history: supervisor feedback present');
  await p.screenshot({ path: path.join(SHOTS, 'demo-dashboard.png'), fullPage: true });
  for (const [r, name] of [['week', 'demo-week'], ['tasks', 'demo-board'], ['matrix', 'demo-matrix'], ['timeline', 'demo-timeline'], ['history', 'demo-history'], ['stats', 'demo-stats'], ['resources/deliverable', 'demo-resources'], ['messages', 'demo-messages'], ['report', 'demo-sheet']]) {
    await p.goto(S + '/?demo=1#/' + r); await sleep(700);
    await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: r === 'report' || r === 'history' });
    if (r === 'stats') check(await p.$$eval('.vc-bar:not(.zero)', x => x.length) >= 8, 'stats: several weeks of bars');
  }
  await p.goto(S + '/?demo=1#/'); await sleep(500);
  await p.click('[data-act=logout]'); await sleep(600);
  await p.click('.demo-team.admin'); await sleep(400);
  await p.fill('[name=password]', 'demo1234'); await p.click('button:has-text("Log in")'); await sleep(1200);
  const ov = await p.textContent('main');
  check(ov.includes('T001') && ov.includes('T002') && ov.includes('T003'), 'supervisor sees the 3 demo teams');
  check(await p.isVisible('.pending-box'), 'demo: one team waits for validation');
  check(/No report last week|overdue/.test(ov), 'demo: alerts shown for the late team');
  await p.screenshot({ path: path.join(SHOTS, 'demo-admin-overview.png'), fullPage: true });
  await p.goto(S + '/?demo=1#/a/week'); await sleep(900);
  await p.screenshot({ path: path.join(SHOTS, 'demo-admin-week.png') });
  await p.goto(S + '/?demo=1#/a/week/' + (await p.evaluate(() => App.addDays(App.curWeek(), -7)))); await sleep(900);
  await p.screenshot({ path: path.join(SHOTS, 'demo-admin-lastweek.png'), fullPage: true });
  await p.goto(S + '/?demo=1#/a/t/T001'); await sleep(900);
  await p.screenshot({ path: path.join(SHOTS, 'demo-admin-team.png') });
  // phone + dark
  const m = await mk({ width: 390, height: 844 }, 2);
  await m.goto(S + '/?demo=1#/'); await m.waitForSelector('.demo-codes', { timeout: 20000 });
  await m.click('.demo-team >> nth=0'); await sleep(900);
  if (await m.isVisible('[data-act=pick-actor]')) { await m.click('[data-act=pick-actor] >> nth=1'); await sleep(400); }
  await m.screenshot({ path: path.join(SHOTS, 'demo-phone-dashboard.png') });
  await m.goto(S + '/?demo=1#/week'); await sleep(600); await m.screenshot({ path: path.join(SHOTS, 'demo-phone-week.png') });
  await m.goto(S + '/?demo=1#/matrix'); await sleep(600); await m.screenshot({ path: path.join(SHOTS, 'demo-phone-matrix.png') });
  for (const r of ['', 'week', 'tasks', 'matrix', 'timeline', 'stats', 'history', 'messages', 'report']) {
    await m.goto(S + '/?demo=1#/' + r); await sleep(450);
    const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(over <= 1, 'phone (demo data): no horizontal scroll on /' + r + (over > 1 ? ' (+' + over + ')' : ''));
  }
  await m.click('[data-act=theme]'); await sleep(300);
  await m.goto(S + '/?demo=1#/stats'); await sleep(600); await m.screenshot({ path: path.join(SHOTS, 'demo-phone-dark-stats.png'), fullPage: true });
  check(errors.length === 0, 'no JavaScript error' + (errors.length ? ': ' + errors.slice(0, 4).join(' || ') : ''));
  console.log(`\n${passes} passed, ${fails} failed`);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
