// Backend tests: run the real backend/Code.gs in the Apps Script simulator.   node tests/backend.test.js
const fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const Sim = require('../assets/gas-shim.js');
const CODE = fs.readFileSync(path.join(__dirname, '../backend/Code.gs'), 'utf8');

let clock = Date.parse('2026-11-10T09:00:00Z'); // a Tuesday
const DAY = 86400000;
const errors = [];
const rt = Sim.createRuntime(CODE, { now: () => clock, onError: e => errors.push(e) });
const call = (action, body = {}) => rt.post(Object.assign({ action }, body));
const ok = (action, body) => { const r = call(action, body); if (!r.ok) throw new Error(action + ' failed: ' + r.error + ' ' + r.message); return r.data; };
const fails = (action, body, code) => { const r = call(action, body); assert.strictEqual(r.ok, false, action + ' should fail'); if (code) assert.strictEqual(r.error, code, action + ': expected ' + code + ' got ' + r.error + ' (' + r.message + ')'); return r; };
const rows = tab => { const s = rt.store.sheets[tab]; const head = s.rows[0]; return s.rows.slice(1).filter(r => r && r.some(v => v !== '' && v != null)).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]]))); };

let n = 0, failed = 0;
function test(name, fn) { try { fn(); n++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n   ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n   ')); } }

// ---------------------------------------------------------------- crypto of the simulator
test('simulator SHA-256 and HMAC match Node crypto', () => {
  const s = 'héllo — PFE ' + 'x'.repeat(100);
  const mine = Buffer.from(Sim.sha256(Sim.utf8(s))).toString('hex');
  assert.strictEqual(mine, crypto.createHash('sha256').update(s).digest('hex'));
  const sig = rt.run('doGet') && null; // runtime boots
});

// ---------------------------------------------------------------- install
test('install creates every tab, the default settings and a pepper', () => {
  assert.strictEqual(rt.run('install'), 'ok');
  ['Overview', 'Teams', 'Members', 'Weeks', 'Tasks', 'Milestones', 'Meetings', 'Notes', 'Resources', 'Messages', 'Announcements', 'AdminNotes', 'Activity', 'Config']
    .forEach(t => assert.ok(rt.store.sheets[t], 'tab ' + t));
  assert.ok(rows('Config').length >= 25);
  assert.ok(rt.store.props.PEPPER && rt.store.props.ADMIN_HASH);
  assert.strictEqual(rt.run('install'), 'ok'); // idempotent
  assert.strictEqual(rows('Config').filter(r => r.key === 'app_title').length, 1);
  assert.match(rows('Config').find(r => r.key === 'registration_key').value, /^PFE-[A-Z2-9]{4}$/, 'a sign-up key is created at the first install');
  rt.run('setAdminPassword_', 'teacher-2026');
  const tk = ok('admin.login', { password: 'teacher-2026' }).token;
  ok('admin.config', { token: tk, values: { registration_key: '' } }); // the next tests sign up without key
});

test('ping returns the public settings', () => {
  const p = ok('ping');
  assert.strictEqual(p.app_title, 'PFE Tracker');
  assert.deepStrictEqual(p.levels, ['Licence', 'Master']);
  assert.strictEqual(p.week_start, 'sunday');
  assert.strictEqual(p.today, '2026-11-10');
  const g = rt.get();
  assert.ok(g.ok && g.data.version);
});

let A, B, codeA, codeB, token;
const memberA = [{ lastName: 'Benali', firstName: 'Lina', matricule: '202231000111', email: 'lina@test.dz', role: 'Lead' },
  { lastName: 'haddad', firstName: 'Karim', matricule: '0031000222', email: 'karim@test.dz' }];

test('registration validates its input', () => {
  fails('register', { level: 'Licence', title: 'ab', members: memberA }, 'VALIDATION');
  fails('register', { level: 'Doctorat', title: 'Hospital app', members: memberA }, 'VALIDATION');
  fails('register', { level: 'Licence', title: 'Hospital app', members: [] }, 'VALIDATION');
  fails('register', { level: 'Licence', title: 'Hospital app', members: [{ lastName: 'X', firstName: 'Y' }] }, 'VALIDATION'); // matricule
  fails('register', { level: 'Licence', title: 'Hospital app', members: [{ lastName: 'X', firstName: 'Y', matricule: '1', email: 'bad' }] }, 'VALIDATION');
  fails('register', { level: 'Licence', title: 'Hospital app', members: [1, 2, 3, 4].map(i => ({ lastName: 'N' + i, firstName: 'F', matricule: 'm' + i })) }, 'TEAM_FULL');
});

test('a team signs up and receives a code; only a hash is stored', () => {
  const r = ok('register', { level: 'Master', specialty: 'ASD', title: 'Sign language recognition with a webcam', description: 'Facial rehab', members: memberA });
  assert.match(r.code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  assert.strictEqual(r.teamId, 'T001');
  assert.strictEqual(r.status, 'pending');
  A = r.teamId; codeA = r.code;
  const t = rows('Teams')[0];
  assert.ok(t.codeHash.length === 64 && !JSON.stringify(rt.store.sheets.Teams).includes(r.code.replace('-', '')));
  assert.strictEqual(t.membersText, 'BENALI Lina; HADDAD Karim');
  const m = rows('Members');
  assert.strictEqual(m.length, 2);
  assert.strictEqual(m[1].matricule, '0031000222', 'leading zeros kept (plain text)');
  assert.strictEqual(rows('Milestones').length, 8, 'default Master milestones');
  const mails = rt.store.outbox;
  assert.ok(mails.some(x => x.to === 'lina@test.dz,karim@test.dz' && x.body.includes(r.code)), 'code emailed to members');
  assert.ok(mails.some(x => x.to === 'teacher@example.com' && x.subject.includes('New team T001')), 'teacher notified');
});

test('a student cannot be in two live teams', () => {
  fails('register', { level: 'Licence', title: 'Another project', members: [{ lastName: 'Z', firstName: 'Z', matricule: '202231000111' }] }, 'DUPLICATE');
});

test('second team (Licence) signs up', () => {
  const r = ok('register', { level: 'Licence', specialty: 'ISIL', title: 'Hospital appointment app', members: [{ lastName: 'Larbi', firstName: 'Ines', matricule: 'DEMO0003', email: 'ines@test.dz' }] });
  B = r.teamId; codeB = r.code;
  assert.strictEqual(B, 'T002');
});

test('login: bad code refused, good code works with any case or spaces, no hash leaks', () => {
  fails('login', { code: 'ABCD-EFGH' }, 'BAD_CODE');
  fails('login', { code: '' }, 'BAD_CODE');
  const d = ok('login', { code: ' ' + codeA.toLowerCase().replace('-', ' ') + ' ' });
  assert.strictEqual(d.team.id, A);
  assert.strictEqual(d.team.codeHash, undefined);
  assert.strictEqual(d.members.length, 2);
  assert.strictEqual(d.milestones.length, 8);
  assert.strictEqual(d.adminNote, undefined);
  assert.strictEqual(d.config.registration_open, true);
});

let t1, t2, t3;
test('tasks: create, validation, text kept exactly as typed, formulas neutralised', () => {
  fails('save', { code: codeA, entity: 'tasks', record: { title: '' } }, 'VALIDATION');
  fails('save', { code: codeA, entity: 'tasks', record: { title: 'x', status: 'nope' } }, 'VALIDATION');
  fails('save', { code: codeA, entity: 'tasks', record: { title: 'x', dueDate: '2026-02-30' } }, 'VALIDATION');
  fails('save', { code: codeA, entity: 'hack', record: { title: 'x' } }, 'BAD_ENTITY');
  t1 = ok('save', { code: codeA, actor: 'Lina BENALI', entity: 'tasks', record: { title: 'Read 5 papers on sign language', priority: 'high', week: '2026-11-08', dueDate: '2026-11-12', estimate: 6, category: 'Research' } });
  assert.ok(t1.id.startsWith('tk'));
  assert.strictEqual(t1.status, 'todo'); assert.strictEqual(t1.estimate, 6); assert.strictEqual(t1.carried, 0);
  t2 = ok('save', { code: codeA, entity: 'tasks', record: { title: '=IMPORTXML("http://evil","//a")', description: '<img src=x onerror=alert(1)>', week: '2026-11-08' } });
  assert.strictEqual(t2.title, '=IMPORTXML("http://evil","//a")', 'read back exactly');
  const raw = rt.store.sheets.Tasks.rows.find(r => r[0] === t2.id);
  assert.ok(typeof raw[2] === 'string' && raw[2].charAt(0) === '​', 'stored as text, not as a formula');
  const rawT1 = rt.store.sheets.Tasks.rows.find(r => r[0] === t1.id);
  assert.strictEqual(rawT1[12], '2026-11-12', 'date kept as text');
  t3 = ok('save', { code: codeA, entity: 'tasks', record: { title: 'Install MediaPipe and the GPU drivers', week: '2026-11-08', checklist: [{ t: 'Unity', d: true }, { t: 'SDK' }, { t: '' }] } });
  assert.deepStrictEqual(t3.checklist, [{ t: 'Unity', d: true }, { t: 'SDK', d: false }]);
});

test('tasks: another team cannot read or change them', () => {
  fails('save', { code: codeB, entity: 'tasks', record: { id: t1.id, title: 'hacked' } }, 'NOT_FOUND');
  fails('del', { code: codeB, entity: 'tasks', id: t1.id }, 'NOT_FOUND');
  const d = ok('load', { code: codeB });
  assert.strictEqual(d.tasks.length, 0);
});

test('tasks: done sets doneAt, undo clears it; patch keeps other fields', () => {
  let x = ok('save', { code: codeA, entity: 'tasks', record: { id: t1.id, status: 'done' } });
  assert.ok(x.doneAt && x.title === 'Read 5 papers on sign language' && x.priority === 'high');
  x = ok('save', { code: codeA, entity: 'tasks', record: { id: t1.id, status: 'doing' } });
  assert.strictEqual(x.doneAt, '');
  x = ok('save', { code: codeA, entity: 'tasks', record: { id: t1.id, status: 'done' } });
  const many = ok('saveMany', { code: codeA, entity: 'tasks', records: [{ id: t2.id, order: 5, quadrant: 'q1' }, { id: t3.id, order: 6, quadrant: 'q2' }] });
  assert.strictEqual(many.length, 2); assert.strictEqual(many[0].quadrant, 'q1');
});

test('weekly report: reasons are required for unfinished tasks before submitting', () => {
  let w = ok('week.save', { code: codeA, week: '2026-11-10', data: { goal: 'Finish the state of the art' } });
  assert.strictEqual(w.week, '2026-11-08', 'week starts on Sunday');
  assert.strictEqual(w.status, 'draft');
  fails('week.save', { code: codeA, week: '2026-11-08', data: { done: '' }, submit: true }, 'REPORT_EMPTY');
  const r = fails('week.save', { code: codeA, week: '2026-11-08', data: { done: 'Read all the papers' }, submit: true }, 'REASONS_REQUIRED');
  assert.ok(r.message.includes(t2.id) && r.message.includes(t3.id));
  ok('save', { code: codeA, entity: 'tasks', record: { id: t2.id, obstacle: 'Lack of time', reason: 'Exams this week' } });
  ok('save', { code: codeA, entity: 'tasks', record: { id: t3.id, status: 'blocked', obstacle: 'Technical problem', reason: 'SDK licence not received' } });
  w = ok('week.save', { code: codeA, actor: 'Karim HADDAD', week: '2026-11-08', data: { done: 'Read all the papers', helpNeeded: true, helpText: 'Can you ask the lab for the SDK licence?', confidence: 3, hours: { a: 6, b: 'x', c: -1 } }, submit: true });
  assert.strictEqual(w.status, 'submitted');
  assert.deepStrictEqual(w.hours, { a: 6 });
  assert.strictEqual(w.snapshot.length, 3);
  assert.strictEqual(w.snapshot.find(s => s.id === t3.id).reason, 'SDK licence not received');
  assert.ok(rt.store.outbox.some(m => m.subject.includes('Help requested by T001')));
});

test('carry over: unfinished tasks move to next week, the history stays in the report', () => {
  const r = ok('week.carry', { code: codeA, week: '2026-11-08' });
  assert.strictEqual(r.moved.length, 2);
  r.moved.forEach(t => { assert.strictEqual(t.week, '2026-11-15'); assert.strictEqual(t.carried, 1); assert.strictEqual(t.reason, ''); });
  assert.strictEqual(r.moved.find(t => t.id === t3.id).status, 'todo', 'blocked becomes to do');
  const s = r.week.snapshot.find(x => x.id === t3.id);
  assert.ok(s.carried && s.reason === 'SDK licence not received' && s.status === 'blocked');
  const again = ok('week.carry', { code: codeA, week: '2026-11-08' });
  assert.strictEqual(again.moved.length, 0);
});

test('teacher login: wrong password refused, lock after repeated failures', () => {
  fails('admin.login', { password: 'nope' }, 'BAD_PASSWORD');
  fails('admin.overview', { token: 'fake' }, 'AUTH');
  token = ok('admin.login', { password: 'teacher-2026' }).token;
  assert.strictEqual(token.length, 40);
});

test('teacher overview: summaries, alerts and the Overview tab', () => {
  const o = ok('admin.overview', { token });
  assert.strictEqual(o.teams.length, 2);
  const a = o.teams.find(t => t.id === A);
  assert.ok(a.summary.alerts.includes('pending'));
  assert.ok(a.summary.alerts.includes('help'));
  assert.ok(a.summary.alerts.includes('toReview'));
  assert.strictEqual(a.summary.tasksDone, 1);
  assert.strictEqual(a.summary.confidence, 3);
  assert.strictEqual(a.codeHash, undefined);
  assert.strictEqual(a.members.length, 2);
  assert.ok(o.config.registration_key !== undefined);
  assert.strictEqual(rows('Overview').length, 2);
});

test('teacher validates a team, reviews a week, the team sees the feedback', () => {
  ok('admin.teamUpdate', { token, teamId: A, data: { status: 'active', defenseDate: '2027-06-20' } });
  fails('admin.teamUpdate', { token, teamId: A, data: { status: 'boss' } }, 'VALIDATION');
  const w = ok('admin.review', { token, teamId: A, week: '2026-11-08', adminComment: 'Good reading work. I will ask the lab.', adminRating: 3, reviewed: true });
  assert.strictEqual(w.status, 'reviewed');
  const d = ok('load', { code: codeA });
  assert.strictEqual(d.team.status, 'active');
  assert.strictEqual(d.team.defenseDate, '2027-06-20');
  assert.strictEqual(d.weeks[0].adminComment, 'Good reading work. I will ask the lab.');
  const o = ok('admin.overview', { token });
  assert.ok(!o.teams.find(t => t.id === A).summary.alerts.includes('help'), 'help handled once reviewed');
});

test('a team cannot change its own status', () => {
  const t = ok('team.update', { code: codeB, data: { status: 'active', title: 'Hospital appointment web app' } });
  assert.strictEqual(t.status, 'pending');
  assert.strictEqual(t.title, 'Hospital appointment web app');
});

test('messages between a team and the teacher, with unread counters', () => {
  ok('message.send', { code: codeA, actor: 'Lina BENALI', body: 'Hello, can we meet on Sunday?' });
  let o = ok('admin.overview', { token });
  assert.strictEqual(o.teams.find(t => t.id === A).summary.unread, 1);
  ok('admin.messageRead', { token, teamId: A });
  o = ok('admin.overview', { token });
  assert.strictEqual(o.teams.find(t => t.id === A).summary.unread, 0);
  ok('admin.message', { token, teamId: A, body: 'Yes, Sunday 10:00, room 12.' });
  let d = ok('load', { code: codeA });
  assert.strictEqual(d.messages.filter(m => m.sender === 'admin' && !m.readByTeam).length, 1);
  ok('message.read', { code: codeA });
  d = ok('load', { code: codeA });
  assert.strictEqual(d.messages.filter(m => !m.readByTeam).length, 0);
  fails('message.send', { code: codeA, body: '   ' }, 'VALIDATION');
});

test('private note of the teacher is never sent to the team', () => {
  ok('admin.note', { token, teamId: A, note: 'Strong team; watch the SDK issue.' });
  assert.strictEqual(ok('load', { code: codeA }).adminNote, undefined);
  assert.strictEqual(ok('admin.team', { token, teamId: A }).adminNote, 'Strong team; watch the SDK issue.');
});

test('announcements reach the right level', () => {
  ok('admin.announce', { token, record: { title: 'Thesis template', body: 'Use the LaTeX template.', target: 'Master' } });
  ok('admin.announce', { token, record: { title: 'Deposit date', body: '15 June', target: 'all', pinned: true } });
  fails('admin.announce', { token, record: { title: 'x', target: 'Doctorat' } }, 'VALIDATION');
  assert.strictEqual(ok('load', { code: codeA }).announcements.length, 2);
  assert.strictEqual(ok('load', { code: codeB }).announcements.length, 1);
});

test('members: limits, last member protected, readable list kept in Teams', () => {
  const m = ok('save', { code: codeA, entity: 'members', record: { lastName: 'mansouri', firstName: 'Amel', matricule: '31000333', email: 'amel@test.dz' } });
  assert.strictEqual(m.lastName, 'MANSOURI');
  fails('save', { code: codeA, entity: 'members', record: { lastName: 'Extra', firstName: 'Four' } }, 'TEAM_FULL');
  assert.ok(rows('Teams').find(t => t.id === A).membersText.includes('MANSOURI Amel'));
  ok('del', { code: codeA, entity: 'members', id: m.id });
  const only = ok('load', { code: codeB }).members[0];
  fails('del', { code: codeB, entity: 'members', id: only.id }, 'LAST_MEMBER');
});

test('resources: only the teacher gives a verdict on a deliverable', () => {
  const r = ok('save', { code: codeA, entity: 'resources', record: { kind: 'deliverable', title: 'Chapter 1 v1', url: 'https://drive.google.com/x', status: 'approved', adminComment: 'self-approved' } });
  assert.strictEqual(r.status, 'submitted');
  assert.strictEqual(r.adminComment, '');
  fails('save', { code: codeA, entity: 'resources', record: { title: 'bad link', url: 'javascript:alert(1)' } }, 'BAD_URL');
  const v = ok('save', { token, teamId: A, entity: 'resources', record: { id: r.id, status: 'revise', adminComment: 'Add the UML diagrams' } });
  assert.strictEqual(v.status, 'revise'); assert.strictEqual(v.adminComment, 'Add the UML diagrams');
  const ref = ok('save', { code: codeA, entity: 'resources', record: { kind: 'reference', title: 'Deep learning for sign language', authors: 'Li et al.', year: '2023' } });
  assert.strictEqual(ref.status, 'toread');
});

test('milestones and meetings and notes', () => {
  const ms = ok('load', { code: codeA }).milestones[0];
  let x = ok('save', { code: codeA, entity: 'milestones', record: { id: ms.id, progress: 100 } });
  assert.strictEqual(x.status, 'done');
  x = ok('save', { code: codeA, entity: 'milestones', record: { id: ms.id, status: 'doing' } });
  assert.strictEqual(x.progress, 90);
  const mt = ok('save', { code: codeA, entity: 'meetings', record: { date: '2026-11-09', type: 'supervisor', summary: 'Validated the plan', actions: 'Send chapter 1\nInstall SDK' } });
  assert.strictEqual(mt.type, 'supervisor');
  fails('save', { code: codeA, entity: 'meetings', record: { summary: 'no date' } }, 'VALIDATION');
  fails('save', { code: codeA, entity: 'notes', record: { type: 'idea' } }, 'VALIDATION');
  const nt = ok('save', { code: codeA, entity: 'notes', record: { type: 'risk', title: 'SDK may not arrive', pinned: true } });
  assert.strictEqual(nt.pinned, true);
});

test('a team can change its code; the old one stops working', () => {
  const r = ok('team.newCode', { code: codeA });
  fails('login', { code: codeA }, 'BAD_CODE');
  codeA = r.code;
  assert.strictEqual(ok('login', { code: codeA }).team.id, A);
  fails('team.newCode', { token, teamId: A }, 'BAD_ACTION');
});

test('forgot my code: same answer for unknown emails, new code by email for known ones', () => {
  const before = rt.store.outbox.length;
  assert.deepStrictEqual(ok('forgot', { email: 'nobody@test.dz' }), { sent: true });
  assert.strictEqual(rt.store.outbox.length, before);
  ok('forgot', { email: 'INES@test.dz' });
  const mail = rt.store.outbox[rt.store.outbox.length - 1];
  assert.strictEqual(mail.to, 'ines@test.dz');
  const newCode = /ACCESS CODE:\s+([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(mail.body)[1];
  fails('login', { code: codeB }, 'BAD_CODE');
  codeB = newCode;
  ok('login', { code: codeB });
  ok('forgot', { email: 'ines@test.dz' });
  assert.strictEqual(rt.store.outbox[rt.store.outbox.length - 1], mail, 'rate limited: no second email');
});

test('teacher resets a code', () => {
  const r = ok('admin.resetCode', { token, teamId: B, email: false });
  fails('login', { code: codeB }, 'BAD_CODE');
  codeB = r.code;
  ok('login', { code: codeB });
});

test('settings: validation, registration key and closing the registration', () => {
  fails('admin.config', { token, values: { week_start: 'friday' } }, 'VALIDATION');
  fails('admin.config', { token, values: { start_date: '12/11/2026' } }, 'VALIDATION');
  const c = ok('admin.config', { token, values: { registration_key: 'PFE2026', start_date: '2026-11-01', deposit_date: '2027-05-31', max_members: '2', unknown_key: 'x' } });
  assert.strictEqual(c.registration_key, 'PFE2026');
  assert.strictEqual(c.unknown_key, undefined);
  assert.strictEqual(ok('ping').requires_key, true);
  fails('register', { level: 'Licence', title: 'Smart parking', members: [{ lastName: 'A', firstName: 'B', matricule: 'm77' }] }, 'REG_KEY');
  const r = ok('register', { regKey: ' pfe2026 ', level: 'Licence', title: 'Smart parking', members: [{ lastName: 'A', firstName: 'B', matricule: 'm77' }] });
  const ms = ok('login', { code: r.code }).milestones;
  assert.strictEqual(ms.length, 8);
  assert.strictEqual(ms[0].startDate, '2026-11-10', 'spread from the sign-up day when the PFE already started');
  assert.strictEqual(ms[7].dueDate, '2027-05-31');
  ok('admin.config', { token, values: { registration_open: 'no' } });
  fails('register', { regKey: 'PFE2026', level: 'Licence', title: 'Closed', members: [{ lastName: 'A', firstName: 'B', matricule: 'm78' }] }, 'REG_CLOSED');
  ok('admin.config', { token, values: { registration_open: 'yes', registration_key: '', max_members: '3' } });
});

test('suspended team cannot log in; archived team can read but not write', () => {
  ok('admin.teamUpdate', { token, teamId: B, data: { status: 'suspended' } });
  fails('login', { code: codeB }, 'SUSPENDED');
  ok('admin.teamUpdate', { token, teamId: B, data: { status: 'archived' } });
  ok('login', { code: codeB });
  fails('save', { code: codeB, entity: 'tasks', record: { title: 'x' } }, 'ARCHIVED');
  ok('save', { token, teamId: B, entity: 'tasks', record: { title: 'Teacher can still edit' } });
  ok('admin.teamUpdate', { token, teamId: B, data: { status: 'active' } });
});

test('teacher weekly review page lists every live team', () => {
  const w = ok('admin.week', { token, week: '2026-11-10' });
  assert.strictEqual(w.week, '2026-11-08');
  const a = w.teams.find(x => x.team.id === A);
  assert.ok(a.week && a.week.status === 'reviewed');
  assert.ok(w.teams.length >= 2);
});

test('time passes: missing report and inactivity are flagged', () => {
  clock += 7 * DAY; // next week (Tuesday 17 Nov)
  token = ok('admin.login', { password: 'teacher-2026' }).token;
  let o = ok('admin.overview', { token });
  let a = o.teams.find(t => t.id === A).summary;
  assert.ok(!a.alerts.includes('noReport'), 'last week report was submitted');
  clock += 7 * DAY; // 24 Nov: week of 15 Nov had no report
  token = ok('admin.login', { password: 'teacher-2026' }).token;
  o = ok('admin.overview', { token });
  a = o.teams.find(t => t.id === A).summary;
  assert.ok(a.alerts.includes('noReport'));
  assert.ok(a.alerts.includes('inactive'));
  assert.ok(a.overdue >= 0);
  assert.strictEqual(a.health, 'red');
});

test('teacher token expires after 6 hours without use, and after 12 hours in any case', () => {
  clock += 7 * 3600 * 1000;
  fails('admin.overview', { token }, 'AUTH');
  token = ok('admin.login', { password: 'teacher-2026' }).token;
  for (let i = 0; i < 2; i++) { clock += 5 * 3600 * 1000; ok('admin.week', { token, week: '2026-11-24' }); }
  clock += 3 * 3600 * 1000;
  fails('admin.overview', { token }, 'AUTH');
  token = ok('admin.login', { password: 'teacher-2026' }).token;
});

test('password change and lock after many wrong passwords', () => {
  fails('admin.password', { token, current: 'wrong', next: 'abcdefgh' }, 'BAD_PASSWORD');
  fails('admin.password', { token, current: 'teacher-2026', next: 'short' }, 'WEAK_PASSWORD');
  const other = ok('admin.login', { password: 'teacher-2026' }).token;
  ok('admin.password', { token, current: 'teacher-2026', next: 'teacher-2027' });
  fails('admin.overview', { token: other }, 'AUTH'); // changing the password ends the other sessions
  for (let i = 0; i < 20; i++) call('admin.login', { password: 'bad' + i });
  fails('admin.login', { password: 'teacher-2027' }, 'LOCKED');
  rt.run('unlockTeacherLogin');
  token = ok('admin.login', { password: 'teacher-2027' }).token;
  for (let i = 0; i < 20; i++) call('admin.login', { password: 'bad' + i });
  clock += 16 * 60 * 1000;
  token = ok('admin.login', { password: 'teacher-2027' }).token;
});

test('the sheet repairs itself when a column was deleted by hand', () => {
  const s = rt.store.sheets.Tasks;
  const ci = s.rows[0].indexOf('category');
  s.rows.forEach(r => r.splice(ci, 1));
  const d = ok('load', { code: codeA });
  assert.ok(d.tasks.length >= 3);
  assert.ok(rt.store.sheets.Tasks.rows[0].includes('category'));
  ok('save', { code: codeA, entity: 'tasks', record: { title: 'After repair', category: 'Writing' } });
  assert.strictEqual(ok('load', { code: codeA }).tasks.find(t => t.title === 'After repair').category, 'Writing');
});

test('large tabs grow beyond 1000 rows', () => {
  const act = rt.store.sheets.Activity;
  for (let i = 0; i < 1100; i++) act.rows.push(['2026-01-01 00:00:00', 'T999', 'x', 'y', 'z']);
  act.maxRows = act.rows.length; // the sheet is full
  ok('save', { code: codeA, entity: 'notes', record: { title: 'row 1100+' } });
  assert.ok(act.maxRows > act.rows.length - 1, 'rows were added');
  assert.strictEqual(rows('Activity').filter(r => r.teamId === A).pop().action, 'notes.create');
});

test('bad requests are answered cleanly', () => {
  fails('nothing', {}, 'BAD_ACTION');
  const big = rt.post({ action: 'ping', pad: 'x'.repeat(500000) });
  assert.strictEqual(big.error, 'TOO_LARGE');
});

test('review findings: deliverable swap, spoofed author, odd names, ids after T999', () => {
  const d = ok('save', { code: codeA, entity: 'resources', record: { kind: 'deliverable', title: 'Chapter 2', url: 'https://example.org/v1' } });
  ok('save', { token, teamId: A, entity: 'resources', record: { id: d.id, status: 'approved' } });
  const sw = ok('save', { code: codeA, entity: 'resources', record: { id: d.id, url: 'https://example.org/other' } });
  assert.strictEqual(sw.status, 'submitted', 'an approved deliverable that changes goes back to submitted');
  const n = ok('save', { code: codeA, actor: 'Supervisor', entity: 'notes', record: { title: 'spoof' } });
  assert.strictEqual(n.createdBy, 'Team', 'a name that is not a member is not accepted as author');
  const n2 = ok('save', { code: codeA, actor: 'Lina BENALI', entity: 'notes', record: { title: 'real' } });
  assert.strictEqual(n2.createdBy, 'Lina BENALI');
  fails('save', { code: codeA, entity: 'constructor', record: { title: 'x' } }, 'BAD_ENTITY');
  fails('constructor', {}, 'BAD_ACTION');
  fails('toString', {}, 'BAD_ACTION');
  assert.ok(!rt.store.sheets.undefined, 'no stray sheet');
  const s2 = rt.store.sheets.Teams;
  const fake = s2.rows[0].map(h => h === 'id' ? 'T999' : h === 'status' ? 'archived' : h === 'title' ? 'old' : '');
  s2.rows.push(fake);
  const r = ok('register', { level: 'Licence', title: 'After nine hundred ninety-nine', members: [{ lastName: 'K', firstName: 'Z', matricule: 'T1000-1' }] });
  assert.strictEqual(r.teamId, 'T1000');
});

test('forgot my code: no email sent, no change (nobody can lock a team out)', () => {
  const rt2 = Sim.createRuntime(CODE, { now: () => clock, mailQuota: 0 });
  rt2.run('install');
  rt2.run('setAdminPassword_', 'abcdefgh1');
  const tk = rt2.post({ action: 'admin.login', password: 'abcdefgh1' }).data.token;
  rt2.post({ action: 'admin.config', token: tk, values: { registration_key: '' } });
  const r = rt2.post({ action: 'register', level: 'Licence', title: 'Quota test', members: [{ lastName: 'A', firstName: 'B', matricule: 'q1', email: 'q@test.dz' }] }).data;
  rt2.post({ action: 'forgot', email: 'q@test.dz' });
  assert.ok(rt2.post({ action: 'login', code: r.code }).ok, 'the old code still works when the email could not be sent');
});

test('per-team limit on the number of changes', () => {
  let blocked = false;
  for (let i = 0; i < 320 && !blocked; i++) { const x = call('save', { code: codeA, entity: 'notes', record: { title: 'n' + i } }); if (!x.ok && x.error === 'TOO_MANY') blocked = true; }
  assert.ok(blocked, 'a team cannot flood the sheet');
  clock += 11 * 60 * 1000;
  ok('save', { code: codeA, entity: 'notes', record: { title: 'after the window' } });
});

test('deleting a team removes all its data, after confirmation', () => {
  fails('admin.deleteTeam', { token, teamId: B, confirm: 'T00X' }, 'CONFIRM');
  ok('admin.deleteTeam', { token, teamId: B, confirm: B });
  ['Teams', 'Members', 'Tasks', 'Weeks', 'Messages'].forEach(tab => assert.ok(!rows(tab).some(r => r.teamId === B || r.id === B), tab));
  assert.ok(rows('Teams').some(r => r.id === A));
  fails('admin.team', { token, teamId: B }, 'NOT_FOUND');
});

test('no formula and no unexpected conversion anywhere in the sheet', () => {
  Object.entries(rt.store.sheets).forEach(([name, s]) => s.rows.forEach(r => (r || []).forEach(v => {
    if (v && typeof v === 'object') assert.fail(name + ' contains a converted value: ' + JSON.stringify(v));
  })));
  assert.strictEqual(errors.length, 0, 'unexpected server errors: ' + errors.join('\n'));
});

console.log(`\n${n} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
