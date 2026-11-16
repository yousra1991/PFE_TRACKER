/* PFE Tracker — demo mode: the real backend (backend/Code.gs) runs in the browser on a simulated sheet.
   Open the site with ?demo=1. The data stays in this browser only. */
(function () {
  'use strict';
  var App = window.App;
  var params = new URLSearchParams(location.search);
  if (!(window.PFE_DEMO === true || params.has('demo'))) return;
  var h = App.html, t = App.t;
  var KEY = 'pfe.demo.v1';
  var offset = 0, rt = null;
  var demo = App.demo = {};

  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(rt.store)); } catch (e) { /* storage not available: memory only */ } }
  function source() {
    if (window.PFE_BACKEND_SRC) return Promise.resolve(window.PFE_BACKEND_SRC);
    return fetch('backend/Code.gs', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('backend/Code.gs ' + r.status); return r.text(); });
  }

  demo.ready = source().then(function (src) {
    var store = load();
    var fresh = !store || !store.sheets || !store.sheets.Teams || !store.demoCodes;
    rt = window.GasSim.createRuntime(src, { store: fresh ? undefined : store, now: function () { return Date.now() + offset; }, ownerEmail: 'supervisor@demo.example' });
    if (fresh) { try { seed(); } catch (e) { console.error('demo seed', e); } offset = 0; }
    save();
  }).catch(function (e) {
    console.error(e);
    document.getElementById('app').innerHTML = '<p style="padding:2rem">The demo could not start: ' + App.esc(String(e.message || e)) + '</p>';
  });

  demo.call = function (body) {
    return new Promise(function (resolve) {
      setTimeout(function () { var r = rt.post(body); save(); resolve(r); }, 90);
    });
  };
  demo.reset = function () {
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('pfe.') === 0) localStorage.removeItem(k); }); sessionStorage.clear(); } catch (e) { /* ignore */ }
    if (!App.memoryRoutes) location.hash = '#/';
    location.reload();
  };
  demo.codes = function () { return (rt && rt.store.demoCodes) || []; };
  demo.outbox = function () { return (rt && rt.store.outbox) || []; };

  demo.bar = function () {
    return h`<div class="demo-bar" role="note">${App.icon('play')}<span>${t('Demo: the data stays in this browser.')} ${t('Supervisor password')}: <b>demo1234</b></span>
      <button type="button" class="link" data-act="demo-info">${t('Codes and help')}</button><button type="button" class="link" data-act="demo-reset">${t('Reset the demo')}</button></div>`;
  };
  demo.codesCard = function () {
    return h`<section class="card demo-codes"><h2>${App.icon('play')}${t('Try the demo')}</h2>
      <p class="muted">${t('Open a team space with one of these codes, or the supervisor space with the password demo1234.')}</p>
      <div class="demo-list">${App.join(demo.codes(), function (c) {
        return h`<button type="button" class="demo-team" data-act="demo-use" data-code="${c.code}"><b>${c.code}</b><span>${c.teamId} · ${c.title}</span><small>${c.note}</small></button>`;
      })}<a class="demo-team admin" href="#/admin"><b>demo1234</b><span>${t('Supervisor space')}</span><small>${t('Overview, weekly review, messages…')}</small></a></div></section>`;
  };
  App.act('demo-use', function (el) {
    var inp = document.querySelector('input[data-codeinput]');
    if (!inp) { App.setHash('#/'); return; }
    inp.value = el.dataset.code;
    inp.form.requestSubmit ? inp.form.requestSubmit() : inp.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  App.act('demo-reset', function () {
    return App.confirm(t('Erase every change and start the demo again?'), { ok: t('Reset the demo') }).then(function (ok) { if (ok) demo.reset(); });
  });
  App.act('demo-info', function () {
    var mails = demo.outbox().slice(-5).reverse();
    App.modal({
      title: t('About the demo'), noCancel: true, submit: t('Close'), onSubmit: function () { },
      body: h`<p>${t('This demo runs the real server code in your browser. Nothing is sent anywhere; reset it whenever you want.')}</p>
        <h3 class="mini-title">${t('Codes')}</h3><ul>${App.join(demo.codes(), function (c) { return h`<li><b>${c.code}</b> — ${c.teamId} · ${c.title}</li>`; })}<li><b>demo1234</b> — ${t('Supervisor space')}</li></ul>
        ${mails.length ? h`<h3 class="mini-title">${t('Emails the platform would have sent')}</h3><ul class="small">${App.join(mails, function (m) { return h`<li><b>${m.subject}</b><br><span class="muted">${t('to')} ${m.to}</span></li>`; })}</ul>` : ''}`
    });
  });

  // ------------------------------------------------------------ realistic history
  function seed() {
    var real = Date.now(), DAY = 86400000;
    var start = new Date(real); start.setHours(0, 0, 0, 0);
    var w0 = new Date(start); w0.setDate(w0.getDate() - w0.getDay()); // weeks start on Sunday (default setting)
    var daysFromW0 = Math.round((start - w0) / DAY);
    var ymd = function (d) { return App.ymd(d); };
    var dayDate = function (k, dow) { var d = new Date(w0); d.setDate(d.getDate() - 7 * k + dow); return d; };
    var W = function (k) { return ymd(dayDate(k, 0)); };
    var day = function (k, dow) { return ymd(dayDate(k, dow)); };
    var at = function (k, dow, hour) {
      var target = dayDate(k, dow).getTime() + (hour || 10) * 3600000;
      offset = Math.min(0, target - real);
    };
    var post = function (action, body) {
      var r = rt.post(Object.assign({ action: action }, body || {}));
      if (!r.ok) throw new Error(action + ': ' + r.error + ' ' + r.message);
      return r.data;
    };
    var token;
    var admin = function (action, body) { token = post('admin.login', { password: 'demo1234' }).token; return post(action, Object.assign({ token: token }, body)); };
    var teamSave = function (code, actor, entity, rec) { return post('save', { code: code, actor: actor, entity: entity, record: rec }); };

    at(5, 0, 8);
    rt.run('install');
    rt.run('setAdminPassword_', 'demo1234');
    var end = new Date(start); end.setDate(end.getDate() + 150);
    var def = new Date(start); def.setDate(def.getDate() + 168);
    admin('admin.config', { values: { start_date: W(5), deposit_date: ymd(end), defense_date: ymd(def), supervisor_name: 'Dr. K. Amrani', registration_key: '' } });

    // ---------------- teams
    at(5, 2, 11);
    var A = post('register', {
      level: 'Master', specialty: 'ASD', title: 'Real-time sign language recognition with a webcam',
      description: 'Recognise signs from a webcam with hand landmarks and a neural network, and show the translation as text.',
      keywords: 'MediaPipe, deep learning, Python, React', host: 'AI lab of the department', sendEmail: false,
      members: [{ lastName: 'Benali', firstName: 'Lina', matricule: 'DEMO0001', email: 'lina.benali@demo.example' },
        { lastName: 'Haddad', firstName: 'Karim', matricule: 'DEMO0002', email: 'karim.haddad@demo.example' }]
    });
    at(5, 2, 15);
    var B = post('register', {
      level: 'Licence', specialty: 'ISIL', title: 'Hospital appointment booking web app', sendEmail: false,
      description: 'A web application where patients book, move or cancel an appointment, and where the secretary manages the agenda of the doctors.',
      keywords: 'React, Node.js, MySQL',
      members: [{ lastName: 'Larbi', firstName: 'Ines', matricule: 'DEMO0003', email: 'ines.larbi@demo.example' },
        { lastName: 'Belkacem', firstName: 'Yanis', matricule: 'DEMO0004' }, { lastName: 'Cherif', firstName: 'Rania', matricule: 'DEMO0005' }]
    });
    at(5, 3, 9);
    admin('admin.teamUpdate', { teamId: A.teamId, data: { status: 'active' } });
    admin('admin.teamUpdate', { teamId: B.teamId, data: { status: 'active' } });
    var dA = post('login', { code: A.code }), dB = post('login', { code: B.code });
    var lina = dA.members[0], karim = dA.members[1], farah = dB.members[0], amine = dB.members[1], yasmina = dB.members[2];
    var L = 'Lina BENALI', K = 'Karim HADDAD', Fa = 'Ines LARBI', Am = 'Yanis BELKACEM', Ya = 'Rania CHERIF';
    var ca = A.code, cb = B.code;
    var task = function (code, actor, rec) { return teamSave(code, actor, 'tasks', rec); };
    var upd = function (code, actor, id, patch) { return teamSave(code, actor, 'tasks', Object.assign({ id: id }, patch)); };
    var week = function (code, actor, w, data, submit) { return post('week.save', { code: code, actor: actor, week: w, data: data, submit: !!submit }); };

    // ---------------- team A, week -4
    at(4, 0, 9);
    var a1 = task(ca, L, { title: 'Read 10 papers on sign language recognition', category: 'Research', priority: 'high', assignee: lina.id, week: W(4), dueDate: day(4, 4), estimate: 10 });
    var a2 = task(ca, K, { title: 'Write the problem statement', category: 'Writing', assignee: karim.id, week: W(4), dueDate: day(4, 3), estimate: 4 });
    var a3 = task(ca, K, { title: 'Create the Git repository and the Overleaf project', category: 'Development', priority: 'low', assignee: karim.id, week: W(4), estimate: 1 });
    week(ca, L, W(4), { goal: 'Understand the state of the art and define the problem' });
    at(4, 2, 17); upd(ca, K, a3.id, { status: 'done', spent: 1 });
    at(4, 3, 16); upd(ca, K, a2.id, { status: 'done', spent: 5 });
    at(4, 4, 15); upd(ca, L, a1.id, { status: 'done', spent: 12 });
    at(4, 4, 19);
    week(ca, L, W(4), { done: 'We read 12 papers (summaries in the Overleaf project) and wrote a first version of the problem statement.', difficulties: 'Many papers use datasets we cannot access.', nextPlan: 'Compare the datasets, start chapter 1, install the tools.', confidence: 4, hours: (function () { var o = {}; o[lina.id] = 12; o[karim.id] = 9; return o; })() }, true);
    at(4, 6, 10);
    admin('admin.review', { teamId: A.teamId, week: W(4), adminComment: 'Good start. Focus the state of the art on facial rehabilitation, not on emotion recognition in general.', adminRating: 3, reviewed: true });
    admin('save', { teamId: A.teamId, entity: 'milestones', record: { id: dA.milestones[0].id, status: 'done' } });

    // ---------------- team A, week -3
    at(3, 0, 9);
    var a4 = task(ca, K, { title: 'Compare the datasets (WLASL, MS-ASL, our own videos)', category: 'Research', assignee: karim.id, week: W(3), estimate: 4 });
    var a5 = task(ca, L, { title: 'Write chapter 1: state of the art', category: 'Writing', priority: 'high', assignee: lina.id, week: W(3), dueDate: day(3, 4), estimate: 12, milestoneId: dA.milestones[1].id });
    var a6 = task(ca, K, { title: 'Install MediaPipe and the GPU drivers', category: 'Development', assignee: karim.id, week: W(3), estimate: 3 });
    week(ca, K, W(3), { goal: 'Finish the first version of chapter 1' });
    at(3, 1, 10);
    post('save', { code: ca, actor: L, entity: 'meetings', record: { date: day(3, 1), type: 'supervisor', participants: 'Dr. Amrani, Lina BENALI, Karim HADDAD', summary: 'Presentation of the problem statement and of the list of papers.', decisions: 'Record our own videos while waiting for the GPU.\nWrite chapter 1 in English.', actions: 'Ask the lab for GPU time\nAdd a comparison table of the datasets\nSend chapter 1 before the end of the month' } });
    at(3, 2, 16); upd(ca, K, a4.id, { status: 'done', spent: 5 });
    at(3, 3, 11); upd(ca, K, a6.id, { status: 'blocked', obstacle: 'Technical problem', reason: 'The GPU of the lab is not available yet' });
    at(3, 4, 18); upd(ca, L, a5.id, { status: 'doing', obstacle: 'Lack of time', reason: 'Exams of the other modules this week', spent: 6 });
    week(ca, L, W(3), { done: 'Datasets compared (table in chapter 1). Half of chapter 1 written.', difficulties: 'Exams this week. No GPU, so no training yet.', nextPlan: 'Finish chapter 1, record the videos.', helpNeeded: true, helpText: 'Can you ask the lab for GPU time?', confidence: 3, hours: (function () { var o = {}; o[lina.id] = 8; o[karim.id] = 7; return o; })() }, true);
    at(3, 6, 9);
    admin('admin.review', { teamId: A.teamId, week: W(3), adminComment: 'I asked the lab for GPU time. Meanwhile, record your videos so that you do not lose time.', adminRating: 3, reviewed: true });
    at(3, 6, 12);
    post('week.carry', { code: ca, actor: L, week: W(3) });

    // ---------------- team A, week -2
    at(2, 0, 10);
    var a7 = task(ca, K, { title: 'Record 300 videos of 20 signs', category: 'Research', assignee: karim.id, week: W(2), estimate: 3 });
    var a8 = task(ca, K, { title: 'Extract the hand landmarks (MediaPipe)', category: 'Development', assignee: karim.id, week: W(2), estimate: 8, checklist: [{ t: 'Detect the hands', d: true }, { t: 'Normalise the coordinates', d: true }, { t: 'Cut the sequences', d: false }] });
    week(ca, L, W(2), { goal: 'Chapter 1 v1 finished and the data ready' });
    at(2, 2, 15); upd(ca, K, a7.id, { status: 'done', spent: 2 });
    at(2, 3, 20); upd(ca, L, a5.id, { status: 'done', spent: 14 });
    post('save', { code: ca, actor: L, entity: 'resources', record: { kind: 'deliverable', title: 'Chapter 1 — State of the art', version: 'v1', url: 'https://www.overleaf.com/project/demo-chapter1', milestoneId: dA.milestones[1].id, notes: '24 pages, 38 references.' } });
    at(2, 4, 17); upd(ca, K, a8.id, { status: 'done', spent: 9 });
    upd(ca, K, a6.id, { status: 'blocked', obstacle: 'Waiting for supervisor or host', reason: 'The lab promised the GPU for next week' });
    at(2, 4, 19);
    week(ca, K, W(2), { done: 'Chapter 1 v1 sent to the supervisor. 300 videos recorded and the hand landmarks extracted.', difficulties: 'Still no GPU.', nextPlan: 'Train a first model, design the interface.', confidence: 4, hours: (function () { var o = {}; o[lina.id] = 14; o[karim.id] = 12; return o; })() }, true);
    at(2, 6, 9);
    var resA = post('load', { code: ca }).resources.filter(function (r) { return r.kind === 'deliverable'; })[0];
    admin('save', { teamId: A.teamId, entity: 'resources', record: { id: resA.id, status: 'revise', adminComment: 'Good chapter. Add a comparison table of the datasets and shorten section 1.3.' } });
    admin('admin.review', { teamId: A.teamId, week: W(2), adminComment: 'Excellent progress this week. See my comments on chapter 1.', adminRating: 4, reviewed: true });
    admin('save', { teamId: A.teamId, entity: 'milestones', record: { id: dA.milestones[1].id, progress: 80, status: 'doing' } });
    post('week.carry', { code: ca, actor: K, week: W(2) });

    // ---------------- team A, week -1
    at(1, 0, 9);
    var a9 = task(ca, K, { title: 'Train a first LSTM model', category: 'Development', priority: 'high', assignee: karim.id, week: W(1), estimate: 10 });
    var a10 = task(ca, L, { title: 'Design the web interface', category: 'Design', assignee: lina.id, week: W(1), estimate: 6, milestoneId: dA.milestones[2].id });
    var a11 = task(ca, L, { title: 'Write section 2.1 (proposed approach)', category: 'Writing', assignee: lina.id, week: W(1), estimate: 5 });
    week(ca, L, W(1), { goal: 'First model trained and the VR scenario designed' });
    at(1, 1, 11);
    post('save', { code: ca, actor: L, entity: 'meetings', record: { date: day(1, 1), type: 'host', participants: 'The lab engineer, Lina BENALI, Karim HADDAD', summary: 'Visit of the AI lab. Discussion of the interface with the engineer.', decisions: 'Start with 20 signs; show the translation in large letters.', actions: 'Send the mock-up to the engineer\nBook the lab room for the user tests' } });
    upd(ca, K, a6.id, { status: 'done', spent: 3 });
    at(1, 3, 16); upd(ca, K, a9.id, { status: 'done', spent: 11 });
    at(1, 4, 12); upd(ca, L, a11.id, { status: 'done', spent: 5 });
    upd(ca, L, a10.id, { status: 'review', obstacle: 'Waiting for supervisor or host', reason: 'The lab engineer must validate the mock-up' });
    at(1, 4, 19);
    week(ca, L, W(1), { done: 'First LSTM model trained: 78% accuracy on 20 signs. Section 2.1 written. Interface drafted.', difficulties: 'The interface depends on the validation of the lab.', nextPlan: 'Start the webcam prototype, chapter 1 v2.', remarks: 'We finally got GPU time, thank you!', confidence: 4, hours: (function () { var o = {}; o[lina.id] = 11; o[karim.id] = 15; return o; })() }, true);
    at(1, 5, 18);
    post('message.send', { code: ca, actor: L, body: 'Hello Dr. Amrani, could we meet on Sunday to discuss the interface?' });
    at(1, 6, 10);
    post('admin.message', { token: post('admin.login', { password: 'demo1234' }).token, teamId: A.teamId, body: 'Yes, Sunday at 10:00 in room 12. Bring the mock-up.' });
    post('week.carry', { code: ca, actor: L, week: W(1) });

    // ---------------- team A, this week
    at(0, 0, 9);
    var a12 = task(ca, K, { title: 'Build the webcam prototype', category: 'Development', priority: 'high', quadrant: 'q1', assignee: karim.id, week: W(0), startDate: day(0, 0), dueDate: day(0, 3), estimate: 12, milestoneId: dA.milestones[3].id });
    task(ca, L, { title: 'Write chapter 1 v2 (supervisor comments)', category: 'Writing', quadrant: 'q2', assignee: lina.id, week: W(0), dueDate: day(0, 5), estimate: 6, milestoneId: dA.milestones[1].id });
    task(ca, L, { title: 'Meet the lab engineer', category: 'Meeting', priority: 'high', quadrant: 'q1', week: W(0), dueDate: day(0, 2) });
    task(ca, L, { title: 'Prepare the user study', category: 'Research', quadrant: 'q2', assignee: lina.id, startDate: day(0, 7), dueDate: day(0, 21), milestoneId: dA.milestones[4].id });
    task(ca, K, { title: 'Buy a better webcam', category: 'Other', priority: 'low', quadrant: 'q3' });
    task(ca, L, { title: 'Submit a paper to a conference (optional)', category: 'Writing', priority: 'low', quadrant: 'q4' });
    task(ca, K, { title: 'Clean the Git repository', category: 'Development', priority: 'low' });
    week(ca, K, W(0), { goal: 'A first webcam demo and chapter 1 v2' });
    admin('save', { teamId: A.teamId, entity: 'milestones', record: { id: dA.milestones[2].id, progress: 40, status: 'doing' } });
    admin('save', { teamId: A.teamId, entity: 'milestones', record: { id: dA.milestones[3].id, progress: 10, status: 'doing' } });
    if (daysFromW0 >= 1) { at(0, 1, 14); upd(ca, K, a12.id, { status: 'doing', spent: 4 }); }
    post('save', { code: ca, actor: L, entity: 'notes', record: { type: 'risk', title: 'The lab GPU may be busy before the deadline', body: 'Book GPU time two weeks in advance.', pinned: true } });
    post('save', { code: ca, actor: K, entity: 'notes', record: { type: 'idea', title: 'Transfer learning', body: 'Start from a model trained on a large public dataset and fine-tune it on our videos.' } });
    post('save', { code: ca, actor: L, entity: 'notes', record: { type: 'remark', title: 'Lighting', body: 'Recognition drops in dark rooms: test with three light levels.' } });
    post('save', { code: ca, actor: K, entity: 'resources', record: { kind: 'link', title: 'GitHub repository of the project', url: 'https://github.com/example/sign-language-webcam' } });
    post('save', { code: ca, actor: L, entity: 'resources', record: { kind: 'link', title: 'Thesis on Overleaf', url: 'https://www.overleaf.com/project/demo' } });
    post('save', { code: ca, actor: L, entity: 'resources', record: { kind: 'reference', title: 'Word-level deep sign language recognition from video: a new large-scale dataset', authors: 'Li et al.', year: '2020', status: 'read', notes: '2,000 signs, more than 20,000 videos.' } });
    post('save', { code: ca, actor: L, entity: 'resources', record: { kind: 'reference', title: 'MediaPipe Hands: on-device real-time hand tracking', authors: 'Zhang et al.', year: '2020', status: 'toread' } });
    if (daysFromW0 >= 1) { at(0, Math.min(daysFromW0, 1), 8); post('message.send', { code: ca, actor: K, body: 'Here is a short video of the first demo: https://example.org/demo1' }); }

    // ---------------- team B
    at(3, 0, 14);
    var b1 = task(cb, Fa, { title: 'Write the specification (cahier des charges)', category: 'Writing', priority: 'high', assignee: farah.id, week: W(3), estimate: 6 });
    var b2 = task(cb, Am, { title: 'Interview the secretary of the hospital', category: 'Research', assignee: amine.id, week: W(3), estimate: 2 });
    at(3, 3, 15); upd(cb, Fa, b1.id, { status: 'done' }); upd(cb, Am, b2.id, { status: 'done' });
    at(3, 4, 20); week(cb, Fa, W(3), { done: 'Specification written and validated with the secretary.', nextPlan: 'UML diagrams and choice of the technologies.', confidence: 4, hours: (function () { var o = {}; o[farah.id] = 6; o[amine.id] = 4; o[yasmina.id] = 3; return o; })() }, true);
    at(3, 6, 11); admin('admin.review', { teamId: B.teamId, week: W(3), adminComment: 'Clear specification. Add the non-functional requirements (security, availability).', adminRating: 3, reviewed: true });
    admin('save', { teamId: B.teamId, entity: 'milestones', record: { id: dB.milestones[0].id, status: 'done' } });
    at(2, 0, 15);
    var b3 = task(cb, Ya, { title: 'Use case diagram', category: 'Design', assignee: yasmina.id, week: W(2) });
    var b4 = task(cb, Am, { title: 'Class diagram', category: 'Design', assignee: amine.id, week: W(2), dueDate: day(2, 4) });
    var b5 = task(cb, Fa, { title: 'Choose the technologies', category: 'Research', assignee: farah.id, week: W(2) });
    at(2, 3, 16); upd(cb, Ya, b3.id, { status: 'done' }); upd(cb, Fa, b5.id, { status: 'done' });
    at(2, 4, 21); upd(cb, Am, b4.id, { status: 'doing', obstacle: 'Lack of time', reason: 'Two of us had exams' });
    week(cb, Fa, W(2), { done: 'Use case diagram done. Stack chosen: React + Node.js + MySQL.', difficulties: 'Exams.', nextPlan: 'Class diagram and database.', confidence: 3 }, true);
    admin('save', { teamId: B.teamId, entity: 'milestones', record: { id: dB.milestones[1].id, progress: 60, status: 'doing' } });
    admin('save', { teamId: B.teamId, entity: 'milestones', record: { id: dB.milestones[2].id, progress: 30, status: 'doing' } });
    post('week.carry', { code: cb, actor: Fa, week: W(2) });
    at(1, 1, 10);
    task(cb, Ya, { title: 'Database schema', category: 'Design', assignee: yasmina.id, week: W(1), dueDate: day(1, 3) });
    task(cb, Fa, { title: 'Login page', category: 'Development', assignee: farah.id, week: W(1), dueDate: day(1, 4) });
    task(cb, Am, { title: 'Appointment form', category: 'Development', assignee: amine.id, dueDate: day(0, 4) });
    task(cb, Fa, { title: 'Mock-up of the secretary dashboard', category: 'Design', priority: 'low' });

    // ---------------- team C waits for validation
    var cDays = Math.max(0, daysFromW0 - 1);
    at(0, cDays, 9);
    var C = post('register', {
      level: 'Licence', specialty: 'SI', title: 'Smart attendance with QR codes', sendEmail: false,
      description: 'Students scan a QR code shown by the teacher; the attendance sheet is filled automatically.',
      members: [{ lastName: 'Meziane', firstName: 'Sofiane', matricule: 'DEMO0006', email: 'sofiane.meziane@demo.example' }, { lastName: 'Kaci', firstName: 'Amira', matricule: 'DEMO0007' }]
    });

    // ---------------- announcements
    at(3, 2, 9);
    admin('admin.announce', { record: { title: 'Thesis template', body: 'Use the LaTeX template of the department on Overleaf: https://www.overleaf.com/latex/templates — you can write in English or in French.', target: 'all', pinned: true } });
    at(1, 2, 9);
    admin('admin.announce', { record: { title: 'Mid-term presentations', body: 'Each Master team presents its progress in 10 minutes, in four weeks. Prepare 6 slides maximum.', target: 'Master' } });

    offset = 0;
    rt.store.demoCodes = [
      { teamId: A.teamId, code: A.code, title: 'Sign language recognition', note: 'Master · ' + t('5 weeks of history') },
      { teamId: B.teamId, code: B.code, title: 'Hospital appointment app', note: 'Licence · ' + t('late on its report') },
      { teamId: C.teamId, code: C.code, title: 'Smart attendance with QR codes', note: 'Licence · ' + t('waiting for validation') }
    ];
    rt.store.outbox = [];
  }
})();
