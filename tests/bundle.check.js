// Checks the single-file demo (memory routes) in a browser, without any server.
const { chromium } = require('playwright');
const file = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|fonts/.test(m.text())) errs.push(m.text()); });
  await p.goto('file://' + file);
  await p.waitForSelector('.demo-codes', { timeout: 20000 });
  await p.click('.demo-team >> nth=0'); await p.waitForTimeout(900);
  if (await p.isVisible('[data-act=pick-actor]')) { await p.click('[data-act=pick-actor] >> nth=0'); await p.waitForTimeout(300); }
  const h1 = await p.textContent('main h1');
  await p.click('.sidebar a[href="#/tasks"]'); await p.waitForTimeout(500);
  const t = await p.textContent('main h1');
  await p.click('.sidebar a[href="#/week"]'); await p.waitForTimeout(500);
  const w = await p.textContent('main h1');
  const hash = await p.evaluate(() => location.hash);
  await p.click('[data-act=logout]'); await p.waitForTimeout(500);
  await p.click('.demo-team.admin'); await p.waitForTimeout(400);
  await p.fill('[name=password]', 'demo1234'); await p.click('button:has-text("Log in")'); await p.waitForTimeout(1000);
  await p.click('.team-row >> nth=1'); await p.waitForTimeout(900);
  const adminTeam = await p.textContent('.admin-bar');
  console.log(JSON.stringify({ h1, t, w, realHash: hash, adminTeam: adminTeam.slice(0, 40), errors: errs }));
  await b.close();
})();
