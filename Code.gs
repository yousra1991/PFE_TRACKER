/**
 * PFE Tracker — backend (Google Apps Script)
 * =============================================================================
 * All the data of the platform lives in THIS Google Sheet, which stays private.
 * The public website (GitHub Pages) talks to this script, published as a web app.
 * The website never sees the sheet: it only receives what this code returns.
 *
 * INSTALL (once)
 *   1. In the Google Sheet: Extensions → Apps Script. Delete everything, paste this file, Save.
 *   2. Reload the Google Sheet. A menu "PFE Tracker" appears → "1. Install / repair"
 *      → allow the access → choose your teacher password.
 *   3. Apps Script: Deploy → New deployment → type "Web app"
 *        Execute as: Me        Who has access: Anyone       → Deploy → copy the Web app URL.
 *   4. Paste that URL in config.js on GitHub (API_URL).
 *
 * UPDATE (after changing this code)
 *   Deploy → Manage deployments → ✏️ → Version: "New version" → Deploy.  The URL stays the same.
 * =============================================================================
 */

var APP_VERSION = '1.0.0';
var ZW = '​'; // invisible guard put before text that the sheet could read as a formula

// ----------------------------------------------------------------- data model
var SCHEMA = {
  Overview: ['teamId', 'status', 'level', 'specialty', 'title', 'members', 'progress', 'tasksDone', 'tasksTotal', 'overdue',
    'thisWeek', 'lastWeek', 'help', 'confidence', 'unread', 'lastActivity', 'alerts'],
  Teams: ['id', 'status', 'level', 'specialty', 'title', 'description', 'keywords', 'host', 'extSupervisor', 'defenseDate',
    'membersText', 'codeHash', 'createdAt', 'updatedAt', 'lastActivity', 'approvedAt'],
  Members: ['id', 'teamId', 'lastName', 'firstName', 'matricule', 'email', 'phone', 'role', 'createdAt', 'updatedAt'],
  Weeks: ['id', 'teamId', 'week', 'goal', 'done', 'difficulties', 'nextPlan', 'remarks', 'helpNeeded', 'helpText', 'confidence',
    'hours', 'snapshot', 'status', 'submittedAt', 'adminComment', 'adminRating', 'reviewedAt', 'createdAt', 'updatedAt', 'updatedBy'],
  Tasks: ['id', 'teamId', 'title', 'description', 'status', 'priority', 'quadrant', 'category', 'assignee', 'milestoneId', 'week',
    'startDate', 'dueDate', 'estimate', 'spent', 'checklist', 'obstacle', 'reason', 'carried', 'order', 'doneAt',
    'createdAt', 'updatedAt', 'createdBy', 'updatedBy'],
  Milestones: ['id', 'teamId', 'title', 'description', 'startDate', 'dueDate', 'progress', 'status', 'deliverableUrl', 'order',
    'createdAt', 'updatedAt', 'updatedBy'],
  Meetings: ['id', 'teamId', 'date', 'type', 'participants', 'summary', 'decisions', 'actions', 'createdAt', 'updatedAt', 'createdBy'],
  Notes: ['id', 'teamId', 'type', 'title', 'body', 'pinned', 'createdAt', 'updatedAt', 'createdBy'],
  Resources: ['id', 'teamId', 'kind', 'title', 'url', 'authors', 'year', 'status', 'version', 'milestoneId', 'notes', 'adminComment',
    'createdAt', 'updatedAt', 'createdBy'],
  Messages: ['id', 'teamId', 'sender', 'author', 'body', 'createdAt', 'readByTeam', 'readByAdmin'],
  Announcements: ['id', 'title', 'body', 'target', 'pinned', 'createdAt', 'updatedAt'],
  AdminNotes: ['teamId', 'note', 'updatedAt'],
  Activity: ['ts', 'teamId', 'actor', 'action', 'detail'],
  Config: ['key', 'value', 'description']
};
var NUM_FIELDS = { confidence: 1, estimate: 1, spent: 1, carried: 1, order: 1, progress: 1, adminRating: 1 };
var BOOL_FIELDS = { helpNeeded: 1, pinned: 1, readByTeam: 1, readByAdmin: 1 };
var JSON_FIELDS = { checklist: '[]', hours: '{}', snapshot: '[]' };
var TEAM_WRITE_LIMIT = 300;   // changes per team per 10 minutes
var ROW_CAPS = { tasks: 2000, milestones: 60, meetings: 400, notes: 800, resources: 800 };
var TEAM_TABS = ['Members', 'Weeks', 'Tasks', 'Milestones', 'Meetings', 'Notes', 'Resources', 'Messages', 'AdminNotes', 'Activity'];

var DEFAULT_CONFIG = [
  ['app_title', 'PFE Tracker', 'Name shown at the top of the website'],
  ['institution', 'Université Alger 1 — Department of Computer Science', 'Shown on the website and on the printed follow-up sheet'],
  ['academic_year', '2026–2027', 'Academic year'],
  ['supervisor_name', 'Supervisor', 'Your name, as the students see it'],
  ['site_url', '', 'Address of the website, e.g. https://yourname.github.io/pfe-tracker/ (used in the emails)'],
  ['default_language', 'en', 'Language of the website for a new visitor: en or fr'],
  ['registration_open', 'yes', 'yes = teams can create an account · no = sign-up closed'],
  ['registration_key', '', 'Key that teams must type to sign up (give it in class). Empty = anyone with the link can sign up'],
  ['require_approval', 'yes', 'yes = a new team waits for your validation (it can already work in its space)'],
  ['max_members', '3', 'Maximum number of students in a team'],
  ['levels', 'Licence, Master', 'Levels, separated by commas'],
  ['specialties', 'ISIL, SI, ASD, Other', 'Specialties, separated by commas'],
  ['week_start', 'sunday', 'First day of the week: sunday or monday'],
  ['start_date', '', 'Start of the PFE (YYYY-MM-DD): numbers the weeks and spreads the milestones'],
  ['deposit_date', '', 'Deadline to deposit the thesis (YYYY-MM-DD)'],
  ['defense_date', '', 'Defence date or start of the defence period (YYYY-MM-DD)'],
  ['milestones_licence', ['Specification (cahier des charges)', 'State of the art', 'Analysis and design', 'Implementation',
    'Testing and validation', 'Thesis writing', 'Thesis deposit', 'Defence preparation'].join('\n'),
    'Milestones created for each new Licence team (one per line)'],
  ['milestones_master', ['Problem statement and objectives', 'State of the art (literature review)', 'Proposed approach and design',
    'Implementation', 'Experiments and evaluation', 'Thesis writing', 'Scientific paper (optional)', 'Thesis deposit and defence'].join('\n'),
    'Milestones created for each new Master team (one per line)'],
  ['task_categories', ['Research', 'Design', 'Development', 'Writing', 'Testing', 'Meeting', 'Other'].join('\n'), 'Task categories (one per line)'],
  ['obstacle_categories', ['Technical problem', 'Lack of time', 'Missing data or resources', 'Unclear subject or requirements',
    'Waiting for supervisor or host', 'Team organisation', 'Personal reason', 'Other'].join('\n'), 'Obstacle types for tasks not done (one per line)'],
  ['email_codes', 'yes', 'yes = the access code is emailed to the team members (and "forgot my code" works)'],
  ['notify_new_team', 'yes', 'yes = email me when a team signs up'],
  ['notify_help', 'yes', 'yes = email me when a team asks for help in its weekly report'],
  ['notify_messages', 'no', 'yes = email me for every new message from a team'],
  ['admin_email', '', 'Where your notifications go. Empty = the owner of this Google Sheet'],
  ['inactive_days', '10', 'A team without activity for this number of days is flagged']
];

// ----------------------------------------------------------------- entities the website may edit
var ENT = {
  tasks: {
    tab: 'Tasks', prefix: 'tk', label: 'title', fields: {
      title: { t: 'str', max: 200, req: true }, description: { t: 'str', max: 4000 },
      status: { t: 'enum', v: ['todo', 'doing', 'review', 'done', 'blocked'], def: 'todo' },
      priority: { t: 'enum', v: ['high', 'medium', 'low'], def: 'medium' },
      quadrant: { t: 'enum', v: ['', 'q1', 'q2', 'q3', 'q4'], def: '' },
      category: { t: 'str', max: 80 }, assignee: { t: 'str', max: 40 }, milestoneId: { t: 'str', max: 40 },
      week: { t: 'date' }, startDate: { t: 'date' }, dueDate: { t: 'date' },
      estimate: { t: 'num', min: 0, max: 1000 }, spent: { t: 'num', min: 0, max: 10000 },
      checklist: { t: 'checklist' }, obstacle: { t: 'str', max: 80 }, reason: { t: 'str', max: 1000 },
      order: { t: 'num', min: -1e15, max: 1e15 }
    },
    before: function (ctx, patch, old) {
      var status = 'status' in patch ? patch.status : (old ? old.status : 'todo');
      if (!old || patch.status !== undefined) {
        if (status === 'done' && (!old || old.status !== 'done')) patch.doneAt = now_();
        if (status !== 'done') patch.doneAt = '';
      }
      if (!old && !('order' in patch && patch.order !== '')) patch.order = Date.now();
      if (!old) patch.carried = 0;
    }
  },
  milestones: {
    tab: 'Milestones', prefix: 'ms', label: 'title', fields: {
      title: { t: 'str', max: 200, req: true }, description: { t: 'str', max: 2000 },
      startDate: { t: 'date' }, dueDate: { t: 'date' }, progress: { t: 'num', min: 0, max: 100 },
      status: { t: 'enum', v: ['todo', 'doing', 'done'], def: 'todo' }, deliverableUrl: { t: 'url' },
      order: { t: 'num', min: -1e15, max: 1e15 }
    },
    before: function (ctx, patch, old) {
      if (patch.status === 'done') patch.progress = 100;
      else if (patch.progress === 100 && !('status' in patch)) patch.status = 'done';
      else if (patch.status && patch.status !== 'done' && (old && Number(old.progress) === 100) && !('progress' in patch)) patch.progress = 90;
      if (!old && (patch.progress === '' || patch.progress === undefined)) patch.progress = 0;
      if (!old && !('order' in patch && patch.order !== '')) patch.order = Date.now();
    }
  },
  meetings: {
    tab: 'Meetings', prefix: 'mt', label: 'summary', fields: {
      date: { t: 'date', req: true }, type: { t: 'enum', v: ['supervisor', 'team', 'host', 'other'], def: 'supervisor' },
      participants: { t: 'str', max: 300 }, summary: { t: 'str', max: 4000 }, decisions: { t: 'str', max: 4000 },
      actions: { t: 'str', max: 4000 }
    }
  },
  notes: {
    tab: 'Notes', prefix: 'nt', label: 'title', fields: {
      type: { t: 'enum', v: ['note', 'idea', 'remark', 'problem', 'risk'], def: 'note' },
      title: { t: 'str', max: 200 }, body: { t: 'str', max: 5000 }, pinned: { t: 'bool' }
    },
    before: function (ctx, patch, old) {
      var title = 'title' in patch ? patch.title : (old ? old.title : '');
      var body = 'body' in patch ? patch.body : (old ? old.body : '');
      if (!title && !body) throw err_('VALIDATION', 'title');
    }
  },
  resources: {
    tab: 'Resources', prefix: 'rs', label: 'title', fields: {
      kind: { t: 'enum', v: ['link', 'reference', 'deliverable'], def: 'link' },
      title: { t: 'str', max: 300, req: true }, url: { t: 'url' }, authors: { t: 'str', max: 300 }, year: { t: 'str', max: 20 },
      status: { t: 'enum', v: ['', 'toread', 'reading', 'read', 'summarized', 'submitted', 'seen', 'approved', 'revise'], def: '' },
      version: { t: 'str', max: 40 }, milestoneId: { t: 'str', max: 40 }, notes: { t: 'str', max: 4000 },
      adminComment: { t: 'str', max: 2000, admin: true }
    },
    before: function (ctx, patch, old) {
      // only the supervisor gives a verdict on a deliverable
      if (!ctx.isAdmin && ['seen', 'approved', 'revise'].indexOf(patch.status) >= 0) {
        if (old) patch.status = old.status; else patch.status = 'submitted';
      }
      var kind = patch.kind || (old && old.kind);
      // a deliverable changed by the team after a verdict goes back to "submitted"
      if (!ctx.isAdmin && old && old.kind === 'deliverable' && ['seen', 'approved', 'revise'].indexOf(old.status) >= 0 &&
        ['title', 'url', 'version'].some(function (k) { return k in patch && String(patch[k]) !== String(old[k]); })) patch.status = 'submitted';
      if (!old && kind === 'deliverable' && !patch.status) patch.status = 'submitted';
      if (!old && kind === 'reference' && !patch.status) patch.status = 'toread';
    }
  },
  members: {
    tab: 'Members', prefix: 'mb', label: 'lastName', fields: {
      lastName: { t: 'str', max: 60, req: true }, firstName: { t: 'str', max: 60, req: true }, matricule: { t: 'str', max: 30 },
      email: { t: 'email' }, phone: { t: 'str', max: 30 }, role: { t: 'str', max: 60 }
    },
    before: function (ctx, patch, old) {
      if (!old && !ctx.isAdmin) {
        var n = readTeam_('Members', ctx.teamId).length;
        if (n >= cfgNum_('max_members', 3)) throw err_('TEAM_FULL');
      }
      if ('lastName' in patch) patch.lastName = patch.lastName.toUpperCase();
    },
    after: function (ctx) { refreshMembersText_(ctx.teamId); }
  }
};

// ----------------------------------------------------------------- web entry points
function doGet(e) {
  return json_({ ok: true, data: pingData_() });
}

function doPost(e) {
  var out;
  try {
    var body = (e && e.postData && e.postData.contents) || '';
    if (body.length > 400000) throw err_('TOO_LARGE');
    var req = body ? JSON.parse(body) : {};
    out = { ok: true, data: route_(req) };
  } catch (x) {
    out = { ok: false, error: x.code || 'SERVER', message: String((x && x.message) || x) };
    if (!x.code) console.error(x && x.stack ? x.stack : x);
  }
  return json_(out);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

var PUBLIC_ACTIONS = {
  'ping': function () { return pingData_(); },
  'register': function (req) { return register_(req); },
  'login': function (req) { var c = teamCtx_(req); return bundle_(c.teamId, false); },
  'forgot': function (req) { return forgot_(req); },
  'admin.login': function (req) { return adminLogin_(req); }
};

// actions on ONE team's data: a team (with its code) or the supervisor (token + teamId)
var TEAM_ACTIONS = {
  'load': function (req, ctx) { return bundle_(ctx.teamId, ctx.isAdmin); },
  'save': function (req, ctx) { return save_(ctx, req.entity, req.record || {}); },
  'saveMany': function (req, ctx) {
    var recs = Array.isArray(req.records) ? req.records.slice(0, 50) : [];
    return withLock_(function () { return recs.map(function (r) { return save_(ctx, req.entity, r || {}); }); });
  },
  'del': function (req, ctx) { return del_(ctx, req.entity, req.id); },
  'week.save': function (req, ctx) { return weekSave_(ctx, req); },
  'week.carry': function (req, ctx) { return weekCarry_(ctx, req); },
  'team.update': function (req, ctx) { return teamUpdate_(ctx, req.data || {}); },
  'message.send': function (req, ctx) { return messageSend_(ctx, req.body); },
  'message.read': function (req, ctx) { return messageRead_(ctx); },
  'team.newCode': function (req, ctx) {
    if (ctx.isAdmin) throw err_('BAD_ACTION');
    var code = setNewCode_(ctx.teamId);
    log_(ctx, 'team.code', 'new access code');
    return { code: formatCode_(code) };
  }
};

var ADMIN_ACTIONS = {
  'admin.overview': function (req) { return adminOverview_(); },
  'admin.team': function (req) { return bundle_(teamOrThrow_(req.teamId).id, true); },
  'admin.teamUpdate': function (req, ctx) { return teamUpdate_(adminTeamCtx_(req), req.data || {}); },
  'admin.resetCode': function (req) { return adminResetCode_(req); },
  'admin.deleteTeam': function (req) { return adminDeleteTeam_(req); },
  'admin.review': function (req) { return adminReview_(req); },
  'admin.week': function (req) { return adminWeek_(req); },
  'admin.message': function (req) { return messageSend_(adminTeamCtx_(req), req.body); },
  'admin.messageRead': function (req) { return messageRead_(adminTeamCtx_(req)); },
  'admin.note': function (req) { return adminNote_(req); },
  'admin.announce': function (req) { return announceSave_(req.record || {}); },
  'admin.announceDel': function (req) { return announceDel_(req.id); },
  'admin.config': function (req) { return configSave_(req.values || {}); },
  'admin.password': function (req) { return adminPassword_(req); },
  'admin.logout': function (req) { CacheService.getScriptCache().remove('adm_' + String(req.token || '')); return { ok: true }; }
};

function own_(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

function route_(req) {
  var a = String(req.action || '');
  if (own_(PUBLIC_ACTIONS, a)) return PUBLIC_ACTIONS[a](req);
  if (own_(ADMIN_ACTIONS, a)) { var ctx = adminCtx_(req); return ADMIN_ACTIONS[a](req, ctx); }
  if (own_(TEAM_ACTIONS, a)) {
    var c = req.token ? adminTeamCtx_(req) : teamCtx_(req);
    if (!c.isAdmin && a !== 'load' && bump_('rl_' + c.teamId, 600) > TEAM_WRITE_LIMIT) throw err_('TOO_MANY');
    var out = TEAM_ACTIONS[a](req, c);
    if (!c.isAdmin && a !== 'load') touch_(c.teamId);
    return out;
  }
  throw err_('BAD_ACTION', a);
}

// ----------------------------------------------------------------- authentication
function teamCtx_(req) {
  var code = normCode_(req.code);
  if (code.length !== 8) throw err_('BAD_CODE');
  var hash = hmac_(code);
  var team = readAll_('Teams').filter(function (t) { return t.codeHash === hash; })[0];
  if (!team) { Utilities.sleep(400); throw err_('BAD_CODE'); }
  if (team.status === 'suspended') throw err_('SUSPENDED');
  var actor = cleanActor_(req.actor);
  if (actor) {
    var names = readTeam_('Members', team.id).map(function (m) { return (m.firstName + ' ' + m.lastName).trim(); });
    if (names.indexOf(actor) < 0) actor = '';
  }
  return { teamId: team.id, team: team, isAdmin: false, actor: actor || 'Team' };
}

function adminCtx_(req) {
  var tk = String(req.token || '');
  var cache = CacheService.getScriptCache();
  var v = tk ? cache.get('adm_' + tk) : null;
  if (!v) throw err_('AUTH');
  var p = String(v).split(':');
  // a session lasts 12 hours at most, and ends when the password changes
  if (p[0] !== adminEpoch_() || Date.now() - Number(p[1]) > 12 * 3600000) { cache.remove('adm_' + tk); throw err_('AUTH'); }
  cache.put('adm_' + tk, v, 21600);
  return { isAdmin: true, actor: 'Supervisor' };
}

function adminEpoch_() { return PropertiesService.getScriptProperties().getProperty('ADMIN_EPOCH') || '1'; }

function adminTeamCtx_(req) {
  adminCtx_(req);
  var team = teamOrThrow_(req.teamId);
  return { teamId: team.id, team: team, isAdmin: true, actor: 'Supervisor' };
}

function teamOrThrow_(id) {
  var row = findRow_('Teams', 'id', String(id || ''));
  if (!row) throw err_('NOT_FOUND');
  return row.obj;
}

function adminLogin_(req) {
  var props = PropertiesService.getScriptProperties();
  var cache = CacheService.getScriptCache();
  var hash = props.getProperty('ADMIN_HASH'), salt = props.getProperty('ADMIN_SALT');
  if (!hash) throw err_('NO_ADMIN');
  var good = pwHash_(String(req.password || ''), salt) === hash;
  var result = withLock_(function () {
    if (bump_('admFail', 900, true) >= 20) return 'LOCKED';
    if (!good) { bump_('admFail', 900); return 'BAD_PASSWORD'; }
    cache.remove('admFail');
    return 'OK';
  });
  if (result !== 'OK') { if (result === 'BAD_PASSWORD') Utilities.sleep(700); throw err_(result); }
  var token = randStr_(40, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
  cache.put('adm_' + token, adminEpoch_() + ':' + Date.now(), 21600);
  return { token: token };
}

function adminPassword_(req) {
  var props = PropertiesService.getScriptProperties();
  if (pwHash_(String(req.current || ''), props.getProperty('ADMIN_SALT')) !== props.getProperty('ADMIN_HASH')) throw err_('BAD_PASSWORD');
  var next = String(req.next || '');
  if (next.length < 8) throw err_('WEAK_PASSWORD');
  setAdminPassword_(next);
  return { ok: true };
}

function setAdminPassword_(pw) {
  var salt = randStr_(24);
  var props = PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SALT', salt);
  props.setProperty('ADMIN_HASH', pwHash_(pw, salt));
  props.setProperty('ADMIN_EPOCH', String((Number(props.getProperty('ADMIN_EPOCH')) || 1) + 1)); // ends the open sessions
}

// counter over a fixed time window (CacheService): returns the new count (or the current one with peek)
function bump_(key, windowSec, peek) {
  var cache = CacheService.getScriptCache(), now = Date.now();
  var p = String(cache.get(key) || '').split('|');
  var n = Number(p[0]) || 0, start = Number(p[1]) || 0;
  if (!start || now - start > windowSec * 1000) { n = 0; start = now; }
  if (peek) return n;
  n++;
  cache.put(key, n + '|' + start, windowSec);
  return n;
}

function pwHash_(pw, salt) {
  var h = String(salt) + '|' + pw;
  for (var i = 0; i < 300; i++) h = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + salt, Utilities.Charset.UTF_8));
  return h;
}

function pepper_() {
  var props = PropertiesService.getScriptProperties();
  var p = props.getProperty('PEPPER');
  if (!p) { p = randStr_(40); props.setProperty('PEPPER', p); }
  return p;
}

function hmac_(code) { return hex_(Utilities.computeHmacSha256Signature(code, pepper_())); }

function hex_(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) { var b = (bytes[i] + 256) % 256; s += (b < 16 ? '0' : '') + b.toString(16); }
  return s;
}

var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
function randStr_(n, alphabet) {
  alphabet = alphabet || CODE_ALPHABET;
  var L = alphabet.length, limit = 256 - (256 % L), s = '';
  while (s.length < n) {
    var u = Utilities.getUuid().replace(/-/g, '');
    for (var i = 0; i + 1 < u.length && s.length < n; i += 2) {
      if (i === 12 || i === 16) continue; // version / variant nibbles are not random
      var b = parseInt(u.substr(i, 2), 16);
      if (b < limit) s += alphabet.charAt(b % L);
    }
  }
  return s;
}

function normCode_(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function formatCode_(c) { return c.slice(0, 4) + '-' + c.slice(4); }

function freshCode_() {
  var taken = {}, code;
  readAll_('Teams').forEach(function (t) { taken[t.codeHash] = 1; });
  do { code = randStr_(8); } while (taken[hmac_(code)]);
  return code;
}

function setNewCode_(teamId, given) {
  return withLock_(function () {
    var row = findRow_('Teams', 'id', teamId);
    if (!row) throw err_('NOT_FOUND');
    var code = given || freshCode_(), hash = hmac_(code);
    row.obj.codeHash = hash;
    row.obj.updatedAt = now_();
    writeRow_('Teams', row.index, row.obj);
    return code;
  });
}

function cleanActor_(a) { return String(a || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 60); }

// ----------------------------------------------------------------- public actions
function pingData_() {
  var c = publicConfig_();
  c.version = APP_VERSION;
  c.today = today_();
  return c;
}

function register_(req) {
  var cfg = getConfig_();
  if (!yes_(cfg.registration_open)) throw err_('REG_CLOSED');
  var key = String(cfg.registration_key || '').trim();
  if (bump_('regKeyFail', 3600, true) >= 30 || bump_('regCount', 3600, true) >= 25) throw err_('TOO_MANY');
  if (key && String(req.regKey || '').trim().toLowerCase() !== key.toLowerCase()) { bump_('regKeyFail', 3600); Utilities.sleep(400); throw err_('REG_KEY'); }

  var levels = list_(cfg.levels);
  var level = String(req.level || '').trim();
  if (levels.indexOf(level) < 0) throw err_('VALIDATION', 'level');
  var title = clip_(req.title, 200);
  if (title.length < 3) throw err_('VALIDATION', 'title');
  var membersIn = Array.isArray(req.members) ? req.members : [];
  var max = cfgNum_('max_members', 3);
  var members = [];
  membersIn.forEach(function (m) {
    m = m || {};
    var o = {
      lastName: clip_(m.lastName, 60).toUpperCase(), firstName: clip_(m.firstName, 60), matricule: clip_(m.matricule, 30),
      email: clip_(m.email, 120).toLowerCase(), phone: clip_(m.phone, 30), role: clip_(m.role, 60)
    };
    if (!o.lastName && !o.firstName && !o.matricule && !o.email) return;
    if (!o.lastName || !o.firstName) throw err_('VALIDATION', 'member name');
    if (!o.matricule) throw err_('VALIDATION', 'matricule');
    if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) throw err_('VALIDATION', 'email');
    members.push(o);
  });
  if (!members.length) throw err_('VALIDATION', 'members');
  if (members.length > max) throw err_('TEAM_FULL');

  return withLock_(function () {
    // a student can belong to one live team only
    var live = {};
    readAll_('Teams').forEach(function (t) { if (t.status !== 'archived') live[t.id] = 1; });
    var mats = {};
    readAll_('Members').forEach(function (m) { if (live[m.teamId] && m.matricule) mats[String(m.matricule).toLowerCase()] = m.teamId; });
    members.forEach(function (m) {
      if (mats[m.matricule.toLowerCase()]) { var e = err_('DUPLICATE', m.matricule); throw e; }
    });
    var allTeams = readAll_('Teams'), used = {};
    allTeams.forEach(function (t) { used[t.id] = 1; });
    var ids = allTeams.map(function (t) { var x = /^T(\d+)$/.exec(t.id); return x ? Number(x[1]) : 0; });
    var next = (ids.length ? Math.max.apply(null, ids) : 0) + 1, teamId;
    do { teamId = 'T' + (next < 1000 ? ('00' + next).slice(-3) : String(next)); next++; } while (used[teamId]);
    var now = now_();
    var status = yes_(cfg.require_approval) ? 'pending' : 'active';
    var specs = list_(cfg.specialties);
    var team = {
      id: teamId, status: status, level: level,
      specialty: clip_(req.specialty, 60), title: title, description: clip_(req.description, 3000),
      keywords: clip_(req.keywords, 300), host: clip_(req.host, 200), extSupervisor: clip_(req.extSupervisor, 200),
      defenseDate: '', membersText: '', codeHash: '', createdAt: now, updatedAt: now, lastActivity: now,
      approvedAt: status === 'active' ? now : ''
    };
    if (specs.length && team.specialty && specs.indexOf(team.specialty) < 0 && team.specialty.length > 60) team.specialty = '';
    var code = freshCode_();
    team.codeHash = hmac_(code);
    team.membersText = members.map(function (m) { return m.lastName + ' ' + m.firstName; }).join('; ');
    appendRow_('Teams', team);
    members.forEach(function (m) {
      m.id = newId_('mb'); m.teamId = teamId; m.createdAt = now; m.updatedAt = now;
      appendRow_('Members', m);
    });
    defaultMilestones_(level).forEach(function (ms, i) {
      ms.id = newId_('ms'); ms.teamId = teamId; ms.order = i + 1; ms.progress = 0; ms.status = 'todo';
      ms.createdAt = now; ms.updatedAt = now; ms.updatedBy = 'PFE Tracker';
      appendRow_('Milestones', ms);
    });
    var ctx = { teamId: teamId, isAdmin: false, actor: members[0].firstName + ' ' + members[0].lastName };
    log_(ctx, 'team.created', title);
    bump_('regCount', 3600);
    var mailed = false;
    if (req.sendEmail !== false && yes_(cfg.email_codes)) mailed = mailCode_(team, members, code, false);
    if (yes_(cfg.notify_new_team) && bump_('mailNewTeam', 3600) <= 15) {
      mail_(adminEmail_(), '[' + cfg.app_title + '] New team ' + teamId + ': ' + title,
        'A new team signed up' + (status === 'pending' ? ' and waits for your validation' : '') + '.\n\n' +
        teamId + ' — ' + title + '\n' + level + (team.specialty ? ' · ' + team.specialty : '') + '\n' + team.membersText + '\n\n' +
        (cfg.site_url || ''));
    }
    return { teamId: teamId, code: formatCode_(code), status: status, mailed: mailed };
  });
}

function forgot_(req) {
  var cfg = getConfig_();
  if (!yes_(cfg.email_codes)) throw err_('EMAIL_DISABLED');
  var email = String(req.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err_('VALIDATION', 'email');
  var cache = CacheService.getScriptCache();
  if (cache.get('fg_' + email)) return { sent: true };
  cache.put('fg_' + email, '1', 600);
  var teamIds = {};
  readAll_('Members').forEach(function (m) { if (String(m.email).toLowerCase() === email) teamIds[m.teamId] = 1; });
  Object.keys(teamIds).forEach(function (id) {
    if (cache.get('fgt_' + id)) return;
    var row = findRow_('Teams', 'id', id);
    if (!row || row.obj.status === 'suspended') return;
    if (bump_('fgd_' + id, 21600) > 3) return; // at most 3 resets per team every 6 hours
    cache.put('fgt_' + id, '1', 600);
    var code = withLock_(function () { return freshCode_(); });
    // the code changes only if the email really left: nobody can lock a team out
    if (mailCode_(row.obj, readTeam_('Members', id), code, true)) {
      setNewCode_(id, code);
      log_({ teamId: id, actor: 'PFE Tracker' }, 'team.code', 'new code sent by email');
    }
  });
  return { sent: true }; // same answer whether the email is known or not
}

function mailCode_(team, members, code, isReset) {
  var cfg = getConfig_();
  var to = members.map(function (m) { return m.email; }).filter(function (e) { return e; });
  if (!to.length) return false;
  var body = (isReset ? 'Here is the NEW access code of your team (the old one no longer works).' :
    'Your team account is created.') + '\n\n' +
    'Team: ' + team.id + '\n\nACCESS CODE:  ' + formatCode_(code) + '\n\n' +
    'Keep this code: all the members of the team use it to open the team space.\n' + (cfg.site_url || '') +
    '\n\n— ' + cfg.app_title + ' · ' + cfg.supervisor_name;
  return mail_(to.join(','), '[' + cfg.app_title + '] ' + (isReset ? 'New access code' : 'Your team access code') + ' — ' + team.id, body);
}

// ----------------------------------------------------------------- team bundle
function bundle_(teamId, isAdmin) {
  var team = teamOrThrow_(teamId);
  var out = {
    team: publicTeam_(team),
    members: readTeam_('Members', teamId),
    tasks: readTeam_('Tasks', teamId),
    weeks: readTeam_('Weeks', teamId),
    milestones: readTeam_('Milestones', teamId),
    meetings: readTeam_('Meetings', teamId),
    notes: readTeam_('Notes', teamId),
    resources: readTeam_('Resources', teamId),
    messages: readTeam_('Messages', teamId),
    activity: readTeam_('Activity', teamId).slice(-60).reverse(),
    announcements: readAll_('Announcements').filter(function (a) {
      return !a.target || a.target === 'all' || a.target === team.level;
    }).map(strip_),
    config: publicConfig_(),
    today: today_(),
    now: now_()
  };
  if (isAdmin) {
    var n = findRow_('AdminNotes', 'teamId', teamId);
    out.adminNote = n ? n.obj.note : '';
  }
  return out;
}

function publicTeam_(t) {
  var o = strip_(t);
  delete o.codeHash;
  return o;
}

function strip_(o) {
  var c = {};
  Object.keys(o).forEach(function (k) { if (k.charAt(0) !== '_') c[k] = o[k]; });
  return c;
}

// ----------------------------------------------------------------- generic save / delete
function writable_(ctx) {
  if (!ctx.isAdmin && ctx.team && ctx.team.status === 'archived') throw err_('ARCHIVED');
}

function save_(ctx, entity, rec) {
  if (!own_(ENT, entity)) throw err_('BAD_ENTITY');
  var E = ENT[entity];
  writable_(ctx);
  return withLock_(function () {
    var now = now_();
    var head = SCHEMA[E.tab];
    if (rec.id) {
      var row = findRow_(E.tab, 'id', String(rec.id));
      if (!row || row.obj.teamId !== ctx.teamId) throw err_('NOT_FOUND');
      var patch = clean_(E, rec, ctx.isAdmin, false);
      if (E.before) E.before(ctx, patch, row.obj);
      var obj = Object.assign({}, row.obj, patch);
      obj.updatedAt = now;
      if (head.indexOf('updatedBy') >= 0) obj.updatedBy = ctx.actor;
      writeRow_(E.tab, row.index, obj);
      log_(ctx, entity + '.update', obj[E.label] || '');
      if (E.after) E.after(ctx, obj);
      return normalize_(E.tab, obj);
    }
    if (!ctx.isAdmin && own_(ROW_CAPS, entity) && readTeam_(E.tab, ctx.teamId).length >= ROW_CAPS[entity]) throw err_('TOO_MANY');
    var o = clean_(E, rec, ctx.isAdmin, true);
    if (E.before) E.before(ctx, o, null);
    o.id = newId_(E.prefix);
    o.teamId = ctx.teamId;
    o.createdAt = now;
    o.updatedAt = now;
    if (head.indexOf('createdBy') >= 0) o.createdBy = ctx.actor;
    if (head.indexOf('updatedBy') >= 0) o.updatedBy = ctx.actor;
    appendRow_(E.tab, o);
    log_(ctx, entity + '.create', o[E.label] || '');
    if (E.after) E.after(ctx, o);
    return normalize_(E.tab, o);
  });
}

function del_(ctx, entity, id) {
  if (!own_(ENT, entity)) throw err_('BAD_ENTITY');
  var E = ENT[entity];
  writable_(ctx);
  return withLock_(function () {
    var row = findRow_(E.tab, 'id', String(id || ''));
    if (!row || row.obj.teamId !== ctx.teamId) throw err_('NOT_FOUND');
    if (entity === 'members' && readTeam_('Members', ctx.teamId).length <= 1) throw err_('LAST_MEMBER');
    sh_(E.tab).deleteRow(row.index);
    log_(ctx, entity + '.delete', row.obj[E.label] || '');
    if (E.after) E.after(ctx, null);
    return { id: id };
  });
}

function clean_(E, rec, isAdmin, isCreate) {
  var out = {};
  Object.keys(E.fields).forEach(function (k) {
    var f = E.fields[k];
    if (f.admin && !isAdmin) return;
    if (!(k in rec)) {
      if (isCreate) {
        if (f.req) throw err_('VALIDATION', k);
        out[k] = f.def !== undefined ? f.def : (f.t === 'bool' ? false : f.t === 'checklist' ? [] : '');
      }
      return;
    }
    out[k] = cleanField_(k, f, rec[k]);
  });
  return out;
}

function cleanField_(k, f, v) {
  if (f.t === 'str') {
    v = v === null || v === undefined ? '' : String(v).trim();
    if (v.length > f.max) v = v.slice(0, f.max);
    if (f.req && !v) throw err_('VALIDATION', k);
    return v;
  }
  if (f.t === 'enum') {
    v = v === null || v === undefined ? '' : String(v);
    if (f.v.indexOf(v) < 0) throw err_('VALIDATION', k);
    return v;
  }
  if (f.t === 'date') {
    v = v === null || v === undefined ? '' : String(v).trim();
    if (v && !validYmd_(v)) throw err_('VALIDATION', k);
    if (f.req && !v) throw err_('VALIDATION', k);
    return v;
  }
  if (f.t === 'num') {
    if (v === '' || v === null || v === undefined) return '';
    v = Number(v);
    if (!isFinite(v)) throw err_('VALIDATION', k);
    return Math.min(f.max, Math.max(f.min, v));
  }
  if (f.t === 'bool') return v === true || v === 'true' || v === 1 || v === '1' || v === 'yes';
  if (f.t === 'url') {
    v = v === null || v === undefined ? '' : String(v).trim();
    if (v && !/^https?:\/\/\S+$/i.test(v)) throw err_('BAD_URL', k);
    return v.slice(0, 1000);
  }
  if (f.t === 'email') {
    v = v === null || v === undefined ? '' : String(v).trim().toLowerCase();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw err_('VALIDATION', k);
    return v.slice(0, 120);
  }
  if (f.t === 'checklist') {
    if (!Array.isArray(v)) return [];
    return v.slice(0, 40).map(function (i) {
      return { t: String((i && i.t) || '').trim().slice(0, 200), d: !!(i && i.d) };
    }).filter(function (i) { return i.t; });
  }
  throw err_('SERVER', 'field type');
}

function refreshMembersText_(teamId) {
  var row = findRow_('Teams', 'id', teamId);
  if (!row) return;
  row.obj.membersText = readTeam_('Members', teamId).map(function (m) { return m.lastName + ' ' + m.firstName; }).join('; ');
  row.obj.updatedAt = now_();
  writeRow_('Teams', row.index, row.obj);
}

// ----------------------------------------------------------------- weeks
var WEEK_FIELDS = {
  goal: { t: 'str', max: 2000 }, done: { t: 'str', max: 6000 }, difficulties: { t: 'str', max: 4000 },
  nextPlan: { t: 'str', max: 4000 }, remarks: { t: 'str', max: 3000 }, helpNeeded: { t: 'bool' },
  helpText: { t: 'str', max: 2000 }, confidence: { t: 'num', min: 1, max: 5 }
};

function weekId_(w) {
  w = String(w || '');
  if (!validYmd_(w)) throw err_('VALIDATION', 'week');
  return weekStartOf_(w);
}

function weekSave_(ctx, req) {
  writable_(ctx);
  var week = weekId_(req.week);
  var data = req.data || {};
  return withLock_(function () {
    var now = now_();
    var id = ctx.teamId + '_' + week;
    var row = findRow_('Weeks', 'id', id);
    var obj = row ? row.obj : newWeek_(ctx.teamId, week, now);
    Object.keys(WEEK_FIELDS).forEach(function (k) { if (k in data) obj[k] = cleanField_(k, WEEK_FIELDS[k], data[k]); });
    if ('hours' in data) obj.hours = cleanHours_(data.hours);
    if (req.submit) {
      if (!String(obj.done || '').trim()) throw err_('REPORT_EMPTY');
      var tasks = readTeam_('Tasks', ctx.teamId).filter(function (t) { return t.week === week; });
      var missing = tasks.filter(function (t) { return t.status !== 'done' && !String(t.reason || '').trim(); });
      if (missing.length) throw err_('REASONS_REQUIRED', missing.map(function (t) { return t.id; }).join(','));
      obj.snapshot = mergeSnapshot_(obj.snapshot, tasks, false);
      obj.status = 'submitted';
      obj.submittedAt = now;
    }
    obj.updatedAt = now;
    obj.updatedBy = ctx.actor;
    if (row) writeRow_('Weeks', row.index, obj); else appendRow_('Weeks', obj);
    log_(ctx, req.submit ? 'week.submit' : 'week.save', week);
    if (req.submit && obj.helpNeeded && yes_(getConfig_().notify_help) && !ctx.isAdmin && bump_('mailHelp_' + ctx.teamId, 3600) <= 1) {
      var cfg = getConfig_();
      mail_(adminEmail_(), '[' + cfg.app_title + '] Help requested by ' + ctx.teamId + ' — ' + ctx.team.title,
        'Week of ' + week + '\n\n' + (obj.helpText || '(no details)') + '\n\nDifficulties: ' + (obj.difficulties || '-') + '\n\n' + (cfg.site_url || ''));
    }
    return normalize_('Weeks', obj);
  });
}

function newWeek_(teamId, week, now) {
  return {
    id: teamId + '_' + week, teamId: teamId, week: week, goal: '', done: '', difficulties: '', nextPlan: '', remarks: '',
    helpNeeded: false, helpText: '', confidence: '', hours: {}, snapshot: [], status: 'draft', submittedAt: '',
    adminComment: '', adminRating: '', reviewedAt: '', createdAt: now, updatedAt: now, updatedBy: ''
  };
}

function cleanHours_(h) {
  var out = {};
  if (!h || typeof h !== 'object') return out;
  Object.keys(h).slice(0, 12).forEach(function (k) {
    var v = Number(h[k]);
    if (isFinite(v) && v > 0) out[String(k).slice(0, 40)] = Math.min(200, Math.round(v * 10) / 10);
  });
  return out;
}

// the snapshot keeps what was planned for the week and its final state, even after tasks move on
function mergeSnapshot_(old, tasks, carried) {
  var map = {}, order = [];
  (Array.isArray(old) ? old : []).forEach(function (s) { if (s && s.id) { map[s.id] = s; order.push(s.id); } });
  tasks.forEach(function (t) {
    if (!map[t.id]) order.push(t.id);
    map[t.id] = {
      id: t.id, title: t.title, status: t.status, priority: t.priority, assignee: t.assignee, category: t.category,
      obstacle: t.status === 'done' ? '' : t.obstacle, reason: t.status === 'done' ? '' : t.reason,
      carried: carried && t.status !== 'done' ? true : !!(map[t.id] && map[t.id].carried && t.status !== 'done')
    };
  });
  return order.map(function (id) { return map[id]; }).slice(0, 80);
}

function weekCarry_(ctx, req) {
  writable_(ctx);
  var week = weekId_(req.week);
  var next = addDays_(week, 7);
  return withLock_(function () {
    var now = now_();
    var all = readTeam_('Tasks', ctx.teamId).filter(function (t) { return t.week === week; });
    var open = all.filter(function (t) { return t.status !== 'done'; });
    if (!open.length) return { moved: [], week: null };
    var missing = open.filter(function (t) { return !String(t.reason || '').trim(); });
    if (missing.length) throw err_('REASONS_REQUIRED', missing.map(function (t) { return t.id; }).join(','));
    var id = ctx.teamId + '_' + week;
    var row = findRow_('Weeks', 'id', id);
    var w = row ? row.obj : newWeek_(ctx.teamId, week, now);
    w.snapshot = mergeSnapshot_(w.snapshot, all, true);
    w.updatedAt = now;
    w.updatedBy = ctx.actor;
    if (row) writeRow_('Weeks', row.index, w); else appendRow_('Weeks', w);
    var moved = open.map(function (t) {
      var r = findRow_('Tasks', 'id', t.id);
      var o = r.obj;
      o.week = next; o.carried = (Number(o.carried) || 0) + 1; o.reason = ''; o.obstacle = '';
      if (o.status === 'blocked') o.status = 'todo';
      o.updatedAt = now; o.updatedBy = ctx.actor;
      writeRow_('Tasks', r.index, o);
      return normalize_('Tasks', o);
    });
    log_(ctx, 'week.carry', moved.length + ' task(s) → ' + next);
    return { moved: moved, week: normalize_('Weeks', w) };
  });
}

// ----------------------------------------------------------------- team info & messages
function teamUpdate_(ctx, data) {
  writable_(ctx);
  var cfg = getConfig_();
  return withLock_(function () {
    var row = findRow_('Teams', 'id', ctx.teamId);
    if (!row) throw err_('NOT_FOUND');
    var t = row.obj, now = now_();
    if ('title' in data) { var title = clip_(data.title, 200); if (title.length < 3) throw err_('VALIDATION', 'title'); t.title = title; }
    if ('level' in data) { if (list_(cfg.levels).indexOf(String(data.level)) < 0) throw err_('VALIDATION', 'level'); t.level = String(data.level); }
    ['specialty:60', 'description:3000', 'keywords:300', 'host:200', 'extSupervisor:200'].forEach(function (p) {
      var k = p.split(':')[0], m = Number(p.split(':')[1]);
      if (k in data) t[k] = clip_(data[k], m);
    });
    if (ctx.isAdmin) {
      if ('status' in data) {
        var st = String(data.status);
        if (['pending', 'active', 'suspended', 'archived'].indexOf(st) < 0) throw err_('VALIDATION', 'status');
        if (st === 'active' && t.status !== 'active' && !t.approvedAt) t.approvedAt = now;
        t.status = st;
      }
      if ('defenseDate' in data) {
        var d = String(data.defenseDate || '');
        if (d && !validYmd_(d)) throw err_('VALIDATION', 'defenseDate');
        t.defenseDate = d;
      }
    }
    t.updatedAt = now;
    writeRow_('Teams', row.index, t);
    log_(ctx, 'team.update', 'status' in data && ctx.isAdmin ? 'status: ' + t.status : t.title);
    return publicTeam_(t);
  });
}

function messageSend_(ctx, body) {
  writable_(ctx);
  body = clip_(body, 3000);
  if (!body) throw err_('VALIDATION', 'body');
  if (!ctx.isAdmin && readTeam_('Messages', ctx.teamId).length >= 3000) throw err_('TOO_MANY');
  var m = withLock_(function () {
    var o = {
      id: newId_('mg'), teamId: ctx.teamId, sender: ctx.isAdmin ? 'admin' : 'team', author: ctx.actor, body: body,
      createdAt: now_(), readByTeam: !ctx.isAdmin, readByAdmin: !!ctx.isAdmin
    };
    appendRow_('Messages', o);
    return o;
  });
  if (!ctx.isAdmin) {
    var cfg = getConfig_();
    if (yes_(cfg.notify_messages) && bump_('mailMsg_' + ctx.teamId, 3600) <= 1) {
      mail_(adminEmail_(), '[' + cfg.app_title + '] Message from ' + ctx.teamId + ' — ' + ctx.team.title,
        m.author + ':\n\n' + body + '\n\n' + (cfg.site_url || ''));
    }
  }
  log_(ctx, 'message.send', body.slice(0, 60));
  return normalize_('Messages', m);
}

function messageRead_(ctx) {
  var field = ctx.isAdmin ? 'readByAdmin' : 'readByTeam';
  var other = ctx.isAdmin ? 'team' : 'admin';
  return withLock_(function () {
    var n = 0;
    readTeam_('Messages', ctx.teamId).forEach(function (m) {
      if (m.sender === other && !m[field]) { setCell_('Messages', m._row, field, true); n++; }
    });
    return { marked: n };
  });
}

// ----------------------------------------------------------------- supervisor actions
function adminOverview_() {
  var cfg = getConfig_();
  var today = today_(), cur = weekStartOf_(today), prev = addDays_(cur, -7);
  var teams = readAll_('Teams');
  var by = {};
  ['Members', 'Tasks', 'Weeks', 'Milestones', 'Messages'].forEach(function (tab) {
    by[tab] = {};
    readAll_(tab).forEach(function (r) { (by[tab][r.teamId] = by[tab][r.teamId] || []).push(r); });
  });
  var rows = teams.map(function (t) {
    var o = publicTeam_(t);
    o.summary = summarize_(t, by.Members[t.id] || [], by.Tasks[t.id] || [], by.Weeks[t.id] || [], by.Milestones[t.id] || [],
      by.Messages[t.id] || [], today, cur, prev, cfgNum_('inactive_days', 10));
    o.members = (by.Members[t.id] || []).map(strip_);
    return o;
  });
  writeOverview_(rows);
  return {
    teams: rows, config: fullConfig_(), today: today, currentWeek: cur,
    announcements: readAll_('Announcements').map(strip_), version: APP_VERSION,
    emailQuota: quota_()
  };
}

function summarize_(t, members, tasks, weeks, milestones, messages, today, cur, prev, inactiveDays) {
  var done = tasks.filter(function (x) { return x.status === 'done'; }).length;
  var overdue = tasks.filter(function (x) { return x.status !== 'done' && x.dueDate && x.dueDate < today; }).length;
  var blocked = tasks.filter(function (x) { return x.status === 'blocked'; }).length;
  var progress = milestones.length
    ? Math.round(milestones.reduce(function (s, m) { return s + (m.status === 'done' ? 100 : (Number(m.progress) || 0)); }, 0) / milestones.length)
    : (tasks.length ? Math.round(100 * done / tasks.length) : 0);
  var lateMilestones = milestones.filter(function (m) { return m.status !== 'done' && m.dueDate && m.dueDate < today; }).length;
  var wCur = weeks.filter(function (w) { return w.week === cur; })[0];
  var wPrev = weeks.filter(function (w) { return w.week === prev; })[0];
  var sent = weeks.filter(function (w) { return w.status !== 'draft'; }).sort(function (a, b) { return a.week < b.week ? 1 : -1; });
  var latest = sent[0];
  var help = !!(latest && latest.helpNeeded && latest.status !== 'reviewed');
  var confidence = latest && latest.confidence ? Number(latest.confidence) : null;
  var unread = messages.filter(function (m) { return m.sender === 'team' && !m.readByAdmin; }).length;
  var lastM = messages.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; }).pop();
  var toReview = weeks.filter(function (w) { return w.status === 'submitted'; }).length;
  var plannedThisWeek = tasks.filter(function (x) { return x.week === cur; }).length;
  var doneThisWeek = tasks.filter(function (x) { return x.week === cur && x.status === 'done'; }).length;
  var last = String(t.lastActivity || t.createdAt || '').slice(0, 10);
  var daysIdle = validYmd_(last) ? daysBetween_(last, today) : 0;
  var createdDay = String(t.createdAt || '').slice(0, 10);
  var alerts = [];
  if (t.status === 'pending') alerts.push('pending');
  if (t.status === 'active' || t.status === 'pending') {
    if (help) alerts.push('help');
    if (validYmd_(createdDay) && createdDay < cur && (!wPrev || wPrev.status === 'draft')) alerts.push('noReport');
    if (overdue) alerts.push('overdue');
    if (lateMilestones) alerts.push('lateMilestone');
    if (daysIdle >= inactiveDays) alerts.push('inactive');
    if (confidence && confidence <= 2) alerts.push('lowConfidence');
    if (unread) alerts.push('unread');
    if (toReview) alerts.push('toReview');
  }
  var red = help || overdue >= 3 || lateMilestones > 0 || daysIdle >= inactiveDays || (confidence && confidence <= 2);
  var orange = alerts.indexOf('noReport') >= 0 || overdue > 0 || blocked > 0;
  return {
    progress: progress, tasksTotal: tasks.length, tasksDone: done, overdue: overdue, blocked: blocked,
    lateMilestones: lateMilestones, milestones: milestones.length,
    thisWeek: wCur ? wCur.status : 'none', lastWeek: wPrev ? wPrev.status : (validYmd_(createdDay) && createdDay >= cur ? 'na' : 'none'),
    plannedThisWeek: plannedThisWeek, doneThisWeek: doneThisWeek,
    help: help, helpText: help ? latest.helpText : '', confidence: confidence, unread: unread, toReview: toReview,
    lastMessage: lastM ? { sender: lastM.sender, author: lastM.author, body: String(lastM.body).slice(0, 140), createdAt: lastM.createdAt } : null,
    messages: messages.length,
    daysIdle: daysIdle, lastActivity: t.lastActivity, lastReportWeek: latest ? latest.week : '',
    alerts: alerts, health: t.status === 'pending' ? 'grey' : (t.status !== 'active' ? 'grey' : red ? 'red' : orange ? 'orange' : 'green')
  };
}

function writeOverview_(rows) {
  try {
    var s = sh_('Overview'), head = header_('Overview');
    var lr = s.getLastRow();
    if (lr > 1) s.getRange(2, 1, lr - 1, head.length).clearContent();
    if (!rows.length) return;
    var vals = rows.map(function (t) {
      var m = t.summary;
      var o = {
        teamId: t.id, status: t.status, level: t.level, specialty: t.specialty, title: t.title, members: t.membersText,
        progress: m.progress + '%', tasksDone: m.tasksDone, tasksTotal: m.tasksTotal, overdue: m.overdue,
        thisWeek: m.thisWeek, lastWeek: m.lastWeek, help: m.help ? 'yes' : '', confidence: m.confidence || '',
        unread: m.unread || '', lastActivity: t.lastActivity, alerts: m.alerts.join(', ')
      };
      return head.map(function (h) { return ser_(h, o[h]); });
    });
    ensureRows_(s, vals.length + 1);
    s.getRange(2, 1, vals.length, head.length).setNumberFormat('@').setValues(vals);
  } catch (e) { console.warn('overview: ' + e); }
}

function adminWeek_(req) {
  var week = weekId_(req.week || today_());
  var teams = readAll_('Teams').filter(function (t) { return t.status === 'active' || t.status === 'pending'; });
  var weeks = {}, tasks = {}, members = {};
  readAll_('Weeks').forEach(function (w) { if (w.week === week) weeks[w.teamId] = strip_(w); });
  readAll_('Tasks').forEach(function (t) { if (t.week === week) (tasks[t.teamId] = tasks[t.teamId] || []).push(strip_(t)); });
  readAll_('Members').forEach(function (m) { (members[m.teamId] = members[m.teamId] || []).push(strip_(m)); });
  return {
    week: week,
    teams: teams.map(function (t) {
      return { team: publicTeam_(t), week: weeks[t.id] || null, tasks: tasks[t.id] || [], members: members[t.id] || [] };
    })
  };
}

function adminReview_(req) {
  var ctx = adminTeamCtx_(req);
  var week = weekId_(req.week);
  return withLock_(function () {
    var now = now_();
    var row = findRow_('Weeks', 'id', ctx.teamId + '_' + week);
    var w = row ? row.obj : newWeek_(ctx.teamId, week, now);
    if ('adminComment' in req) w.adminComment = clip_(req.adminComment, 3000);
    if ('adminRating' in req) {
      var r = req.adminRating === '' || req.adminRating === null ? '' : Math.min(4, Math.max(1, Math.round(Number(req.adminRating) || 0)));
      w.adminRating = r || '';
    }
    if (req.reviewed) { w.status = 'reviewed'; w.reviewedAt = now; }
    else if (req.reviewed === false && w.status === 'reviewed') w.status = w.submittedAt ? 'submitted' : 'draft';
    w.updatedAt = now;
    if (row) writeRow_('Weeks', row.index, w); else appendRow_('Weeks', w);
    log_(ctx, 'week.review', week);
    return normalize_('Weeks', w);
  });
}

function adminNote_(req) {
  var ctx = adminTeamCtx_(req);
  var note = clip_(req.note, 20000);
  return withLock_(function () {
    var row = findRow_('AdminNotes', 'teamId', ctx.teamId);
    var o = { teamId: ctx.teamId, note: note, updatedAt: now_() };
    if (row) writeRow_('AdminNotes', row.index, o); else appendRow_('AdminNotes', o);
    return { note: note, updatedAt: o.updatedAt };
  });
}

function adminResetCode_(req) {
  var ctx = adminTeamCtx_(req);
  var code = setNewCode_(ctx.teamId);
  var mailed = false;
  if (req.email && yes_(getConfig_().email_codes)) mailed = mailCode_(ctx.team, readTeam_('Members', ctx.teamId), code, true);
  log_(ctx, 'team.code', 'code reset by the supervisor');
  return { code: formatCode_(code), mailed: mailed };
}

function adminDeleteTeam_(req) {
  var ctx = adminTeamCtx_(req);
  if (String(req.confirm || '') !== ctx.teamId) throw err_('CONFIRM');
  return withLock_(function () {
    TEAM_TABS.forEach(function (tab) { rewriteTab_(tab, function (o) { return o.teamId !== ctx.teamId; }); });
    rewriteTab_('Teams', function (o) { return o.id !== ctx.teamId; });
    return { deleted: ctx.teamId };
  });
}

function announceSave_(rec) {
  var title = clip_(rec.title, 200), body = clip_(rec.body, 5000);
  if (!title) throw err_('VALIDATION', 'title');
  var levels = list_(getConfig_().levels);
  var target = String(rec.target || 'all');
  if (target !== 'all' && levels.indexOf(target) < 0) throw err_('VALIDATION', 'target');
  return withLock_(function () {
    var now = now_();
    if (rec.id) {
      var row = findRow_('Announcements', 'id', String(rec.id));
      if (!row) throw err_('NOT_FOUND');
      var o = Object.assign(row.obj, { title: title, body: body, target: target, pinned: !!rec.pinned, updatedAt: now });
      writeRow_('Announcements', row.index, o);
      return normalize_('Announcements', o);
    }
    var n = { id: newId_('an'), title: title, body: body, target: target, pinned: !!rec.pinned, createdAt: now, updatedAt: now };
    appendRow_('Announcements', n);
    return normalize_('Announcements', n);
  });
}

function announceDel_(id) {
  return withLock_(function () {
    var row = findRow_('Announcements', 'id', String(id || ''));
    if (!row) throw err_('NOT_FOUND');
    sh_('Announcements').deleteRow(row.index);
    return { id: id };
  });
}

// ----------------------------------------------------------------- configuration
var CFG_CACHE_ = null;
function getConfig_() {
  if (CFG_CACHE_) return CFG_CACHE_;
  var c = {};
  DEFAULT_CONFIG.forEach(function (d) { c[d[0]] = d[1]; });
  readAll_('Config').forEach(function (r) { if (r.key) c[String(r.key).trim()] = String(r.value); });
  CFG_CACHE_ = c;
  return c;
}

function publicConfig_() {
  var c = getConfig_();
  return {
    app_title: c.app_title, institution: c.institution, academic_year: c.academic_year, supervisor_name: c.supervisor_name,
    site_url: c.site_url, default_language: c.default_language === 'fr' ? 'fr' : 'en',
    registration_open: yes_(c.registration_open), requires_key: !!String(c.registration_key || '').trim(),
    require_approval: yes_(c.require_approval), max_members: cfgNum_('max_members', 3),
    levels: list_(c.levels), specialties: list_(c.specialties), week_start: c.week_start === 'monday' ? 'monday' : 'sunday',
    start_date: validYmd_(c.start_date) ? c.start_date : '', deposit_date: validYmd_(c.deposit_date) ? c.deposit_date : '',
    defense_date: validYmd_(c.defense_date) ? c.defense_date : '',
    task_categories: lines_(c.task_categories), obstacle_categories: lines_(c.obstacle_categories),
    email_codes: yes_(c.email_codes)
  };
}

function fullConfig_() {
  var c = getConfig_(), out = {};
  DEFAULT_CONFIG.forEach(function (d) { out[d[0]] = c[d[0]]; });
  return out;
}

var CFG_RULES = {
  default_language: ['en', 'fr'], week_start: ['sunday', 'monday'],
  registration_open: 'yn', require_approval: 'yn', email_codes: 'yn', notify_new_team: 'yn', notify_help: 'yn', notify_messages: 'yn',
  start_date: 'date', deposit_date: 'date', defense_date: 'date', max_members: 'int', inactive_days: 'int',
  admin_email: 'email', site_url: 'url'
};

function configSave_(values) {
  var known = {};
  DEFAULT_CONFIG.forEach(function (d) { known[d[0]] = d; });
  var clean = {};
  Object.keys(values).forEach(function (k) {
    if (!known[k]) return;
    var v = String(values[k] === null || values[k] === undefined ? '' : values[k]).trim().slice(0, 4000);
    var r = CFG_RULES[k];
    if (Array.isArray(r) && r.indexOf(v) < 0) throw err_('VALIDATION', k);
    if (r === 'yn') v = yes_(v) ? 'yes' : 'no';
    if (r === 'date' && v && !validYmd_(v)) throw err_('VALIDATION', k);
    if (r === 'int') { v = String(Math.max(1, Math.min(99, Math.round(Number(v) || 0)))); }
    if (r === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw err_('VALIDATION', k);
    if (r === 'url' && v && !/^https?:\/\/\S+$/i.test(v)) throw err_('VALIDATION', k);
    if ((k === 'levels') && !list_(v).length) throw err_('VALIDATION', k);
    clean[k] = v;
  });
  return withLock_(function () {
    var rows = readAll_('Config');
    Object.keys(clean).forEach(function (k) {
      var r = rows.filter(function (x) { return String(x.key).trim() === k; })[0];
      if (r) setCell_('Config', r._row, 'value', clean[k]);
      else appendRow_('Config', { key: k, value: clean[k], description: known[k][2] });
    });
    CFG_CACHE_ = null;
    return fullConfig_();
  });
}

function yes_(v) { return /^(yes|y|true|1|oui|o)$/i.test(String(v || '').trim()); }
function list_(v) { return String(v || '').split(/[,\n]/).map(function (s) { return s.trim(); }).filter(function (s) { return s; }); }
function lines_(v) { return String(v || '').split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; }); }
function cfgNum_(k, d) { var n = Number(getConfig_()[k]); return isFinite(n) && n > 0 ? n : d; }

function defaultMilestones_(level) {
  var c = getConfig_();
  var titles = lines_(/master/i.test(level) ? c.milestones_master : c.milestones_licence).slice(0, 20);
  // a team that signs up late gets its milestones spread from its sign-up day to the deadline
  var start = validYmd_(c.start_date) ? (c.start_date < today_() ? today_() : c.start_date) : '';
  var end = validYmd_(c.deposit_date) ? c.deposit_date : (validYmd_(c.defense_date) ? c.defense_date : '');
  var span = start && end ? daysBetween_(start, end) : 0;
  return titles.map(function (title, i) {
    var o = { title: title, description: '', startDate: '', dueDate: '', deliverableUrl: '' };
    if (span > titles.length) {
      o.startDate = addDays_(start, Math.round(span * i / titles.length));
      o.dueDate = addDays_(start, Math.round(span * (i + 1) / titles.length));
    }
    return o;
  });
}

// ----------------------------------------------------------------- email
function mail_(to, subject, body) {
  try {
    if (!to) return false;
    if (MailApp.getRemainingDailyQuota() < 1) return false;
    MailApp.sendEmail({ to: to, subject: subject, body: body, name: getConfig_().app_title });
    return true;
  } catch (e) {
    console.warn('mail: ' + e);
    return false;
  }
}

function adminEmail_() {
  var c = getConfig_();
  if (c.admin_email) return c.admin_email;
  try { return Session.getEffectiveUser().getEmail(); } catch (e) { return ''; }
}

function quota_() { try { return MailApp.getRemainingDailyQuota(); } catch (e) { return null; } }

// ----------------------------------------------------------------- activity
function log_(ctx, action, detail) {
  try {
    withLock_(function () {
      appendRow_('Activity', { ts: now_(), teamId: ctx.teamId || '', actor: ctx.actor || '', action: action, detail: clip_(detail, 200) });
    });
  } catch (e) { console.warn('log: ' + e); }
}

function touch_(teamId) {
  try {
    var cache = CacheService.getScriptCache();
    if (cache.get('la_' + teamId)) return;
    cache.put('la_' + teamId, '1', 600);
    withLock_(function () {
      var row = findRow_('Teams', 'id', teamId);
      if (row) setCell_('Teams', row.index, 'lastActivity', now_());
    });
  } catch (e) { console.warn('touch: ' + e); }
}

// ----------------------------------------------------------------- sheet data layer
var SS_ = null, SHEETS_ = {}, HEAD_ = {}, LOCKED_ = false;

function ss_() {
  if (SS_) return SS_;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (id) { try { SS_ = SpreadsheetApp.openById(id); } catch (e) { SS_ = null; } }
  if (!SS_) SS_ = SpreadsheetApp.getActiveSpreadsheet();
  return SS_;
}

function sh_(name) {
  if (SHEETS_[name]) return SHEETS_[name];
  var s = ss_().getSheetByName(name);
  if (!s) { s = ss_().insertSheet(name); }
  ensureHeader_(s, name);
  SHEETS_[name] = s;
  return s;
}

function ensureHeader_(s, name) {
  var lc = s.getLastColumn();
  var head = lc ? s.getRange(1, 1, 1, lc).getValues()[0].map(function (v) { return String(v).trim(); }) : [];
  while (head.length && !head[head.length - 1]) head.pop();
  var missing = SCHEMA[name].filter(function (c) { return head.indexOf(c) < 0; });
  if (missing.length) {
    var need = head.length + missing.length;
    if (s.getMaxColumns() < need) s.insertColumnsAfter(s.getMaxColumns(), need - s.getMaxColumns());
    s.getRange(1, head.length + 1, 1, missing.length).setValues([missing]);
    if (!head.length) {
      s.getRange(1, 1, 1, missing.length).setFontWeight('bold').setBackground('#e8eaf6');
      s.setFrozenRows(1);
      s.getRange(1, 1, s.getMaxRows(), missing.length).setNumberFormat('@');
    }
    head = head.concat(missing);
  }
  HEAD_[name] = head;
}

function header_(name) { if (!HEAD_[name]) sh_(name); return HEAD_[name]; }

function readAll_(name) {
  var s = sh_(name), head = header_(name), lr = s.getLastRow();
  if (lr < 2) return [];
  var vals = s.getRange(2, 1, lr - 1, head.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var row = vals[i], empty = true;
    for (var j = 0; j < row.length; j++) if (row[j] !== '' && row[j] !== null) { empty = false; break; }
    if (empty) continue;
    var o = fromRow_(head, row);
    o._row = i + 2;
    out.push(o);
  }
  return out;
}

function readTeam_(name, teamId) {
  return readAll_(name).filter(function (o) { return o.teamId === teamId; }).map(function (o) {
    if (name === 'Messages' || name === 'Weeks' || name === 'Tasks') return o; // _row kept for internal updates
    return o;
  });
}

function findRow_(name, col, value) {
  var s = sh_(name), head = header_(name), ci = head.indexOf(col), lr = s.getLastRow();
  if (lr < 2 || ci < 0 || !value) return null;
  var found = s.getRange(2, ci + 1, lr - 1, 1).createTextFinder(String(value)).matchEntireCell(true).matchCase(true).findNext();
  if (!found) return null;
  var r = found.getRow();
  var o = fromRow_(head, s.getRange(r, 1, 1, head.length).getValues()[0]);
  if (String(o[col]) !== String(value)) return null;
  o._row = r;
  return { index: r, obj: o };
}

function writeRow_(name, r, obj) {
  var head = header_(name);
  sh_(name).getRange(r, 1, 1, head.length).setNumberFormat('@').setValues([toRow_(head, obj)]);
}

function appendRow_(name, obj) {
  var s = sh_(name), head = header_(name);
  var r = s.getLastRow() + 1;
  ensureRows_(s, r);
  s.getRange(r, 1, 1, head.length).setNumberFormat('@').setValues([toRow_(head, obj)]);
  return r;
}

function ensureRows_(s, r) {
  var max = s.getMaxRows();
  if (r > max) s.insertRowsAfter(max, Math.max(200, r - max));
}

function setCell_(name, r, col, value) {
  var ci = header_(name).indexOf(col);
  if (ci < 0) return;
  sh_(name).getRange(r, ci + 1).setNumberFormat('@').setValue(ser_(col, value));
}

function rewriteTab_(name, keep) {
  var s = sh_(name), head = header_(name), lr = s.getLastRow();
  if (lr < 2) return;
  var vals = s.getRange(2, 1, lr - 1, head.length).getValues();
  var kept = vals.filter(function (row) { return keep(fromRow_(head, row)); });
  if (kept.length === vals.length) return;
  if (kept.length) s.getRange(2, 1, kept.length, head.length).setNumberFormat('@').setValues(kept);
  s.getRange(2 + kept.length, 1, vals.length - kept.length, head.length).clearContent();
}

function fromRow_(head, row) {
  var o = {};
  for (var i = 0; i < head.length; i++) if (head[i]) o[head[i]] = deser_(head[i], row[i]);
  return o;
}

function toRow_(head, obj) {
  return head.map(function (h) { return ser_(h, obj[h]); });
}

function normalize_(tab, obj) { return fromRow_(header_(tab), toRow_(header_(tab), obj)); }

function ser_(field, v) {
  if (v === null || v === undefined) v = '';
  if (JSON_FIELDS[field]) v = typeof v === 'string' ? v : JSON.stringify(v);
  else if (BOOL_FIELDS[field]) v = v === true || v === 'true' || v === '1' || v === 1 ? '1' : '';
  else if (v instanceof Date) v = Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm:ss');
  else v = String(v);
  if (/^[=+\-@']/.test(v)) v = ZW + v;
  return v;
}

function deser_(field, v) {
  if (v instanceof Date) {
    v = Utilities.formatDate(v, tz_(), /At$|^ts$|lastActivity/.test(field) ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
  }
  v = v === null || v === undefined ? '' : String(v);
  if (v.charAt(0) === ZW) v = v.slice(1);
  if (NUM_FIELDS[field]) { if (v === '') return ''; var n = Number(v); return isFinite(n) ? n : ''; }
  if (BOOL_FIELDS[field]) return v === '1' || /^(true|yes)$/i.test(v);
  if (JSON_FIELDS[field]) { try { return v ? JSON.parse(v) : JSON.parse(JSON_FIELDS[field]); } catch (e) { return JSON.parse(JSON_FIELDS[field]); } }
  return v;
}

function withLock_(fn) {
  if (LOCKED_) return fn();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw err_('BUSY');
  LOCKED_ = true;
  try { return fn(); }
  finally { LOCKED_ = false; SpreadsheetApp.flush(); lock.releaseLock(); }
}

// ----------------------------------------------------------------- small helpers
function err_(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
function clip_(v, n) { return String(v === null || v === undefined ? '' : v).trim().slice(0, n); }
function newId_(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function tz_() { try { return ss_().getSpreadsheetTimeZone() || 'Africa/Algiers'; } catch (e) { return 'Africa/Algiers'; } }
function now_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function ymdToUtc_(s) { var p = String(s).split('-'); return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
function utcToYmd_(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
function addDays_(s, n) { return utcToYmd_(ymdToUtc_(s) + n * 86400000); }
function daysBetween_(a, b) { return Math.round((ymdToUtc_(b) - ymdToUtc_(a)) / 86400000); }
function validYmd_(s) { s = String(s || ''); return /^\d{4}-\d{2}-\d{2}$/.test(s) && utcToYmd_(ymdToUtc_(s)) === s; }
function weekStartOf_(s) {
  var startDay = getConfig_().week_start === 'monday' ? 1 : 0;
  var t = ymdToUtc_(s), dow = new Date(t).getUTCDay();
  return utcToYmd_(t - ((dow - startDay + 7) % 7) * 86400000);
}

// ----------------------------------------------------------------- menu in the Google Sheet
function onOpen() {
  SpreadsheetApp.getUi().createMenu('PFE Tracker')
    .addItem('1. Install / repair', 'install')
    .addItem('2. Set the teacher password', 'setTeacherPassword')
    .addItem('Unlock the teacher login (after too many wrong passwords)', 'unlockTeacherLogin')
    .addSeparator()
    .addItem('How to publish the web app', 'showHelp')
    .addToUi();
}

function install() {
  var ss = ss_();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  Object.keys(SCHEMA).forEach(function (name) { sh_(name); });
  var have = {};
  readAll_('Config').forEach(function (r) { have[String(r.key).trim()] = 1; });
  DEFAULT_CONFIG.forEach(function (d) {
    if (have[d[0]]) return;
    var v = d[0] === 'registration_key' ? 'PFE-' + randStr_(4) : d[1]; // a sign-up key from the start: only your students can sign up
    appendRow_('Config', { key: d[0], value: v, description: d[2] });
  });
  CFG_CACHE_ = null;
  pepper_();
  var ui = ui_();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_HASH')) {
    if (ui) setTeacherPassword();
    else {
      var pw = randStr_(10);
      setAdminPassword_(pw);
      console.log('Teacher password (change it in the website settings): ' + pw);
    }
  }
  if (ui) showHelp();
  return 'ok';
}

function setTeacherPassword() {
  var ui = ui_();
  if (!ui) throw new Error('Run this from the Google Sheet menu "PFE Tracker".');
  var r = ui.prompt('Teacher password', 'Choose the password of the teacher space (at least 8 characters).', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var pw = r.getResponseText();
  if (pw.length < 8) { ui.alert('The password must have at least 8 characters. Nothing was changed.'); return; }
  var r2 = ui.prompt('Teacher password', 'Type the same password again.', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  if (r2.getResponseText() !== pw) { ui.alert('The two passwords are different. Nothing was changed.'); return; }
  setAdminPassword_(pw);
  ui.alert('Teacher password saved ✓');
}

function unlockTeacherLogin() {
  CacheService.getScriptCache().remove('admFail');
  var ui = ui_();
  if (ui) ui.alert('The teacher login is unlocked ✓');
}

function showHelp() {
  var ui = ui_();
  var msg = 'The database is ready ✓\n\nPublish the web app (once):\n' +
    '1. Extensions → Apps Script\n2. Deploy → New deployment → ⚙ → Web app\n' +
    '3. Execute as: Me — Who has access: Anyone → Deploy\n4. Copy the Web app URL and paste it in config.js (API_URL) on GitHub.\n\n' +
    'After a change of the code: Deploy → Manage deployments → ✏️ → New version → Deploy.';
  if (ui) ui.alert('PFE Tracker', msg, ui.ButtonSet.OK); else console.log(msg);
}

function ui_() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }
