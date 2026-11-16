// End-to-end test of the website with the real backend code (Apps Script simulator).
// 1) node tests/server.js   2) node tests/e2e.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = 'http://127.0.0.1:8791';
const SHOTS = path.join(__dirname, '.shots');
fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0, passes = 0;
const check = (c, m) => { if (c) { passes++; console.log('PASS ' + m); } else { fails++; console.log('FAIL ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const state = () => fetch(S + '/__state').then(r => r.json()).then(j => j.store);
const rows = (st, tab) => { const s = st.sheets[tab]; if (!s) return []; const head = s.rows[0]; return s.rows.slice(1).filter(r => r && r.some(v => v !== '' && v != null)).map(r => Object.fromEntries(head.map((h, i) => [h, typeof r[i] === 'string' ? r[i].replace(/^​/, '') : r[i]]))); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function newPage(opts) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1320, height: 900 }, deviceScaleFactor: 1 }, opts || {}));
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts\.g/.test(m.text())) errors.push(m.text()); });
    return p;
  }
  const shot = (p, name, full) => p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!full });
  const toastText = async p => { await sleep(150); return (await p.$$eval('.toast', ts => ts.map(t => t.textContent).join(' | '))).toString(); };

  // ------------------------------------------------------------ a team signs up
  const A = await newPage();
  await A.goto(S + '/#/'); await sleep(600);
  await shot(A, '01-landing');
  await A.click('text=Create a team account'); await sleep(200);
  await A.click('button:has-text("Create the account")'); await sleep(200);
  check((await toastText(A)).length > 0, 'sign-up refuses an empty form');
  await A.fill('[name=title]', 'Sign language recognition with a webcam');
  await A.selectOption('[name=level]', 'Master');
  await A.selectOption('[name=specialty]', 'ASD');
  await A.fill('[name=keywords]', 'MediaPipe, Python, deep learning');
  const m0 = A.locator('.member-fs').nth(0);
  await m0.locator('[name=lastName]').fill('Benali'); await m0.locator('[name=firstName]').fill('Lina');
  await m0.locator('[name=matricule]').fill('202231000111'); await m0.locator('[name=email]').fill('lina@test.dz');
  await A.click('#reg-add');
  const m1 = A.locator('.member-fs').nth(1);
  await m1.locator('[name=lastName]').fill('Haddad'); await m1.locator('[name=firstName]').fill('Karim'); await m1.locator('[name=matricule]').fill('0031000222');
  await A.check('[name=consent]');
  await shot(A, '02-register', true);
  await A.click('button:has-text("Create the account")'); await sleep(700);
  const code = (await A.textContent('.code-card .code')).trim();
  check(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), 'the team receives its access code ' + code);
  await shot(A, '03-code');
  await A.click('text=Open our team space'); await sleep(200);
  check((await toastText(A)).includes('wrote down'), 'the team must confirm it wrote the code down');
  await A.check('#saved-code');
  await A.click('text=Open our team space'); await sleep(700);
  check(await A.isVisible('text=Who is using this device?'), 'asks who uses the device');
  await A.click('[data-act=pick-actor] >> text=Lina BENALI'); await sleep(400);
  check((await A.textContent('.banner')).includes('waiting for validation'), 'pending banner shown');
  // log out and back in with the code typed in lower case without dash
  await A.click('[data-act=logout]'); await sleep(400);
  await A.fill('input[data-codeinput]', code.toLowerCase().replace('-', ''));
  check((await A.inputValue('input[data-codeinput]')) === code, 'the code field formats the code');
  await A.click('button:has-text("Open my team space")'); await sleep(700);
  check((await A.textContent('main h1')).includes('Sign language recognition'), 'login with the code opens the dashboard');

  // ------------------------------------------------------------ tasks of the week
  await A.goto(S + '/#/week'); await sleep(400);
  const newTask = async (title, opts = {}) => {
    await A.click('#week-tasks [data-act=task-new]'); await sleep(250);
    await A.fill('.modal [name=title]', title);
    if (opts.priority) await A.selectOption('.modal [name=priority]', opts.priority);
    if (opts.assignee) await A.selectOption('.modal [name=assignee]', { label: opts.assignee });
    if (opts.due) await A.fill('.modal [name=dueDate]', opts.due);
    if (opts.steps) for (const s of opts.steps) { await A.fill('.modal .cl-new', s); await A.press('.modal .cl-new', 'Enter'); }
    await A.click('.modal button[type=submit]'); await sleep(450);
  };
  await newTask('Read 5 papers on sign language recognition', { priority: 'high', assignee: 'Lina BENALI', steps: ['Search Google Scholar', 'Write summaries'] });
  await newTask('Write section 1.2 of the thesis', { assignee: 'Karim HADDAD' });
  await newTask('Install MediaPipe and the GPU drivers', { priority: 'low' });
  let st = await state();
  let tasks = rows(st, 'Tasks');
  check(tasks.length === 3 && tasks.every(t => t.week), 'three tasks created in this week');
  check(JSON.parse(tasks[0].checklist).length === 2, 'checklist saved');
  await A.fill('[name=goal]', 'Finish the state of the art');
  await A.selectOption('.wt-row:has-text("Read 5 papers") .status-select', 'done'); await sleep(450);
  await A.selectOption('.wt-row:has-text("Install MediaPipe") .status-select', 'blocked'); await sleep(450);
  check((await A.inputValue('[name=goal]')) === 'Finish the state of the art', 'typed goal survives a refresh of the page');
  await A.fill('[name=done]', 'We read the papers and started the thesis.');
  await A.click('[data-act=week-save][data-submit="1"]'); await sleep(300);
  check((await toastText(A)).includes('unfinished task'), 'cannot submit while unfinished tasks have no reason');
  check(await A.isVisible('.wt-row.need'), 'unfinished tasks without reason are highlighted');
  await A.selectOption('.wt-row:has-text("Install MediaPipe") .why select', 'Technical problem'); await sleep(400);
  await A.fill('.wt-row:has-text("Install MediaPipe") .why input', 'The GPU of the lab is not available'); await A.press('.wt-row:has-text("Install MediaPipe") .why input', 'Tab'); await sleep(500);
  await A.selectOption('.wt-row:has-text("Write section") .why select', 'Lack of time'); await sleep(400);
  await A.fill('.wt-row:has-text("Write section") .why input', 'Exams this week'); await A.press('.wt-row:has-text("Write section") .why input', 'Tab'); await sleep(500);
  check((await A.inputValue('[name=done]')) === 'We read the papers and started the thesis.', 'typed report text survives the task updates');
  await A.check('.seg-choice input[value="3"]', { force: true });
  await A.fill('.hours-grid input >> nth=0', '8');
  await A.check('[name=helpNeeded]');
  await A.fill('[name=helpText]', 'Can you ask the lab for GPU time?');
  await shot(A, '04-week', true);
  await A.click('[data-act=week-save][data-submit="1"]'); await sleep(700);
  st = await state();
  const wk = rows(st, 'Weeks')[0];
  check(wk && wk.status === 'submitted' && JSON.parse(wk.snapshot).length === 3 && wk.helpNeeded === '1', 'weekly report submitted with the snapshot of the tasks');
  check(st.outbox.some(m => /Help requested/.test(m.subject)), 'the supervisor gets an email for the help request');
  check((await A.textContent('.wn-mid')).includes('Submitted'), 'week shows "Submitted"');

  // ------------------------------------------------------------ board and matrix
  await A.goto(S + '/#/tasks'); await sleep(500);
  await A.dragAndDrop('.tcard:has-text("Write section")', '.col-drop[data-status="review"]'); await sleep(700);
  st = await state();
  check(rows(st, 'Tasks').find(t => t.title.startsWith('Write section')).status === 'review', 'drag and drop on the board changes the status');
  await shot(A, '05-board');
  await A.click('[data-act=ui][data-v=list]'); await sleep(300);
  check(await A.isVisible('.tasks-table'), 'list view of the tasks');
  await A.click('[data-act=ui][data-v=board]'); await sleep(300);
  await A.goto(S + '/#/matrix'); await sleep(500);
  await A.dragAndDrop('.mcard:has-text("Install MediaPipe")', '.quad-drop[data-quad="q1"]'); await sleep(700);
  st = await state();
  const iu = rows(st, 'Tasks').find(t => t.title.startsWith('Install MediaPipe'));
  check(iu.quadrant === 'q1' && iu.priority === 'high', 'matrix: drop in "Do now" sets the quadrant and a high priority');
  await shot(A, '06-matrix');

  // ------------------------------------------------------------ milestones, meetings, journal, resources, messages
  await A.goto(S + '/#/timeline'); await sleep(400);
  const firstMs = A.locator('.ms-row').first();
  await firstMs.locator('input[type=range]').evaluate(el => { el.value = 60; el.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(600);
  await A.click('.ms-row >> nth=0 >> .ms-title'); await sleep(250);
  await A.fill('.modal [name=dueDate]', '2026-11-30'); await A.click('.modal button[type=submit]'); await sleep(500);
  await A.click('.ms-row >> nth=1 >> .ms-title'); await sleep(250);
  await A.fill('.modal [name=startDate]', '2026-11-20'); await A.fill('.modal [name=dueDate]', '2026-12-31'); await A.click('.modal button[type=submit]'); await sleep(500);
  st = await state();
  const ms = rows(st, 'Milestones').filter(m => m.teamId === 'T001');
  check(ms.some(m => m.progress === '60' && m.status === 'doing'), 'milestone progress saved');
  check(await A.isVisible('.gantt'), 'timeline (Gantt) displayed');
  await shot(A, '07-timeline');
  await A.goto(S + '/#/meetings'); await sleep(300);
  await A.click('main [data-act=mt-new] >> nth=0'); await sleep(250);
  await A.fill('.modal [name=summary]', 'Presentation of the plan');
  await A.fill('.modal [name=actions]', 'Send chapter 1\nBook the VR room');
  await A.click('.modal button[type=submit]'); await sleep(500);
  await A.click('[data-act=mt-tasks]'); await sleep(250);
  await A.click('.modal button[type=submit]'); await sleep(600);
  st = await state();
  check(rows(st, 'Tasks').some(t => t.title === 'Book the VR room'), 'meeting actions turned into tasks');
  await A.goto(S + '/#/journal'); await sleep(300);
  await A.click('main [data-act=nt-new]'); await sleep(250);
  await A.selectOption('.modal [name=type]', 'risk'); await A.fill('.modal [name=title]', 'The GPU may arrive late'); await A.check('.modal [name=pinned]');
  await A.click('.modal button[type=submit]'); await sleep(500);
  check(await A.isVisible('.note.nt-risk'), 'risk note added to the journal');
  await A.goto(S + '/#/resources/deliverable'); await sleep(300);
  await A.click('main [data-act=rs-new]'); await sleep(250);
  await A.fill('.modal [name=title]', 'Chapter 1 — State of the art'); await A.fill('.modal [name=url]', 'javascript:alert(1)');
  await A.click('.modal button[type=submit]'); await sleep(400);
  check(await A.isVisible('.modal .form-error'), 'a javascript: link is refused');
  await A.fill('.modal [name=url]', 'https://drive.google.com/file/d/abc'); await A.fill('.modal [name=version]', 'v1');
  await A.click('.modal button[type=submit]'); await sleep(500);
  check(await A.isVisible('.res-deliverable'), 'deliverable submitted');
  await A.goto(S + '/#/messages'); await sleep(300);
  await A.fill('.composer textarea', 'Hello, can we meet on Sunday? <b>bold?</b>');
  await A.click('.composer button[type=submit]'); await sleep(500);
  check((await A.textContent('.thread')).includes('<b>bold?</b>'), 'message shown as plain text (no HTML injection)');

  // ------------------------------------------------------------ team page: member, new code
  await A.goto(S + '/#/team'); await sleep(300);
  await A.click('[data-act=mb-new]'); await sleep(250);
  await A.fill('.modal [name=lastName]', 'mansouri'); await A.fill('.modal [name=firstName]', 'Amel'); await A.fill('.modal [name=matricule]', '31000333');
  await A.click('.modal button[type=submit]'); await sleep(500);
  check((await A.textContent('.members')).includes('MANSOURI'), 'member added (last name in capitals)');
  check(!(await A.isVisible('[data-act=mb-new]')), 'cannot add a 4th member (maximum 3)');
  await shot(A, '08-team', true);
  await A.goto(S + '/#/stats'); await sleep(400);
  check(await A.isVisible('.vchart') && await A.isVisible('.segbar'), 'statistics charts drawn');
  await shot(A, '09-stats', true);
  await A.goto(S + '/#/report'); await sleep(300);
  check((await A.textContent('.sheet')).includes('PFE FOLLOW-UP SHEET'), 'printable follow-up sheet');
  await shot(A, '10-sheet', true);
  await A.goto(S + '/#/'); await sleep(400);
  await shot(A, '11-dashboard', true);

  // ------------------------------------------------------------ supervisor
  const T = await newPage();
  await T.goto(S + '/#/admin'); await sleep(300);
  await T.fill('[name=password]', 'wrong-pass'); await T.click('button:has-text("Log in")'); await sleep(500);
  check((await toastText(T)).includes('Wrong password'), 'wrong supervisor password refused');
  await T.fill('[name=password]', 'teacher-2026'); await T.click('button:has-text("Log in")'); await sleep(900);
  check(await T.isVisible('.pending-box'), 'overview shows the team waiting for validation');
  await shot(T, '12-admin-overview', true);
  await T.click('.pending-row [data-status=active]'); await sleep(900);
  st = await state();
  check(rows(st, 'Teams')[0].status === 'active', 'supervisor validates the team');
  check((await T.textContent('.team-list')).includes('Help requested'), 'the help request appears as an alert');
  await T.goto(S + '/#/a/week'); await sleep(700);
  check((await T.textContent('.wr')).includes('The GPU of the lab is not available'), 'weekly review shows the reasons of unfinished tasks');
  await T.fill('.wr .review-form textarea', 'Good start. I will ask the lab for GPU time.');
  await T.selectOption('.wr .review-form select', '3');
  await shot(T, '13-admin-week', true);
  await T.click('.wr .review-form button[type=submit]'); await sleep(700);
  st = await state();
  check(rows(st, 'Weeks')[0].status === 'reviewed' && rows(st, 'Weeks')[0].adminComment.startsWith('Good start'), 'review saved');
  await T.goto(S + '/#/a/messages'); await sleep(500);
  check(await T.isVisible('.inbox-row.unread'), 'unread message highlighted in the inbox');
  await T.click('.inbox-row'); await sleep(700);
  await T.fill('.composer textarea', 'Yes, Sunday at 10:00.'); await T.click('.composer button[type=submit]'); await sleep(600);
  await T.goto(S + '/#/a/t/T001/resources/deliverable'); await sleep(600);
  await T.click('[data-act=rs-edit]'); await sleep(250);
  await T.selectOption('.modal [name=status]', 'revise'); await T.fill('.modal [name=adminComment]', 'Add the UML diagrams.');
  await T.click('.modal button[type=submit]'); await sleep(600);
  await T.click('[data-act=adm-note]'); await sleep(250);
  await T.fill('.modal textarea', 'Serious team. Follow the GPU issue.'); await T.click('.modal button[type=submit]'); await sleep(600);
  await shot(T, '14-admin-team');
  await T.goto(S + '/#/a/news'); await sleep(400);
  await T.click('main [data-act=an-new]'); await sleep(250);
  await T.fill('.modal [name=title]', 'Thesis template'); await T.fill('.modal [name=body]', 'Use the LaTeX template: https://example.org/template'); await T.check('.modal [name=pinned]');
  await T.click('.modal button[type=submit]'); await sleep(600);
  await T.goto(S + '/#/a/settings'); await sleep(500);
  await T.fill('[name=registration_key]', 'PFE2026');
  await T.fill('[name=start_date]', '2026-11-01');
  await T.click('button:has-text("Save the settings")'); await sleep(900);
  const ping = await fetch(S + '/api', { method: 'POST', body: JSON.stringify({ action: 'ping' }) }).then(r => r.json());
  check(ping.data.requires_key === true && ping.data.start_date === '2026-11-01', 'settings saved (sign-up key, start date)');
  await shot(T, '15-admin-settings', true);

  // ------------------------------------------------------------ the team sees the feedback
  await A.goto(S + '/#/'); await A.reload(); await sleep(900);
  const dash = await A.textContent('main');
  check(dash.includes('Good start. I will ask the lab'), 'team sees the supervisor feedback on its dashboard');
  check(dash.includes('Thesis template'), 'team sees the announcement');
  check((await A.textContent('.sidebar')).match(/Messages\s*1/), 'team sees 1 unread message');
  await A.goto(S + '/#/resources/deliverable'); await sleep(400);
  check((await A.textContent('.res-deliverable')).includes('Add the UML diagrams'), 'team sees the verdict on its deliverable');
  st = await state();
  check(!JSON.stringify((await (await fetch(S + '/api', { method: 'POST', body: JSON.stringify({ action: 'login', code }) })).json()).data).includes('Follow the GPU issue'), 'private note never sent to the team');

  // ------------------------------------------------------------ new code
  await A.goto(S + '/#/team'); await sleep(300);
  await A.click('[data-act=team-newcode]'); await sleep(250);
  await A.click('.modal button[type=submit]'); await sleep(700);
  const code2 = (await A.textContent('.modal .code')).trim();
  check(code2 !== code && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code2), 'team creates a new code');
  const oldLogin = await fetch(S + '/api', { method: 'POST', body: JSON.stringify({ action: 'login', code }) }).then(r => r.json());
  check(!oldLogin.ok && oldLogin.error === 'BAD_CODE', 'the old code no longer works');

  // ------------------------------------------------------------ French
  await A.keyboard.press('Escape');
  await A.click('[data-act=lang]'); await sleep(500);
  await A.goto(S + '/#/week'); await sleep(400);
  const fr = await A.textContent('main');
  check(/Semaine du|Objectif de la semaine/.test(fr), 'French interface');
  await shot(A, '16-week-fr', true);
  await A.click('[data-act=lang]'); await sleep(300);

  // ------------------------------------------------------------ phone
  const M = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await M.goto(S + '/#/'); await sleep(500);
  await M.fill('input[data-codeinput]', code2); await M.click('button:has-text("Open my team space")'); await sleep(900);
  if (await M.isVisible('[data-act=pick-actor]')) { await M.click('[data-act=pick-actor] >> nth=1'); await sleep(300); }
  for (const r of ['', 'week', 'tasks', 'matrix', 'timeline', 'stats', 'messages', 'team', 'report']) {
    await M.goto(S + '/#/' + r); await sleep(450);
    const over = await M.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(over <= 1, 'phone: no horizontal scroll on /' + r + (over > 1 ? ' (+' + over + 'px)' : ''));
  }
  await M.goto(S + '/#/'); await sleep(400); await shot(M, '20-phone-dashboard');
  await M.goto(S + '/#/week'); await sleep(400); await shot(M, '21-phone-week');
  await M.goto(S + '/#/tasks'); await sleep(400);
  await M.selectOption('.tcard:has-text("Book the VR room") .tc-move', 'doing'); await sleep(700);
  st = await state();
  check(rows(st, 'Tasks').find(t => t.title === 'Book the VR room').status === 'doing', 'phone: the "move to" list changes the status');
  await shot(M, '22-phone-board');
  await M.click('.tabbar [data-act=nav-toggle]'); await sleep(300);
  check(await M.isVisible('.sidebar a[href="#/matrix"]'), 'phone: menu opens');
  await shot(M, '23-phone-menu');
  const MT = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await MT.goto(S + '/#/admin'); await sleep(300);
  await MT.fill('[name=password]', 'teacher-2026'); await MT.click('button:has-text("Log in")'); await sleep(900);
  const overA = await MT.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overA <= 1, 'phone: supervisor overview fits the screen');
  await shot(MT, '24-phone-admin');

  // ------------------------------------------------------------ dark mode
  await T.goto(S + '/#/a'); await sleep(400);
  await T.click('[data-act=theme]'); await sleep(400);
  await shot(T, '30-dark-overview');
  await A.click('[data-act=theme]'); await sleep(300);
  await A.goto(S + '/#/stats'); await sleep(500); await shot(A, '31-dark-stats', true);

  check(errors.length === 0, 'no JavaScript error' + (errors.length ? ': ' + errors.slice(0, 5).join(' || ') : ''));
  console.log(`\n${passes} passed, ${fails} failed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
