/* PFE Tracker — core: state, server calls, safe HTML, dates, router, dialogs. */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var CFG = window.PFE_CONFIG || {};
  App.cfg = CFG;

  // ------------------------------------------------------------ safe storage
  function safe(kind) {
    return {
      get: function (k, d) { try { var v = window[kind].getItem('pfe.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
      set: function (k, v) { try { window[kind].setItem('pfe.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
      del: function (k) { try { window[kind].removeItem('pfe.' + k); } catch (e) { /* ignore */ } }
    };
  }
  App.local = safe('localStorage');
  App.session = safe('sessionStorage');

  // ------------------------------------------------------------ HTML with automatic escaping
  function Raw(s) { this.s = s; }
  Raw.prototype.toString = function () { return this.s; };
  var raw = App.raw = function (s) { return new Raw(s === null || s === undefined ? '' : String(s)); };
  var esc = App.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  function val(v) {
    if (v === null || v === undefined || v === false) return '';
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(val).join('');
    return esc(v);
  }
  App.html = function (strings) {
    var out = strings[0];
    for (var i = 1; i < arguments.length; i++) out += val(arguments[i]) + strings[i];
    return new Raw(out);
  };
  App.join = function (list, fn) { return raw((list || []).map(function (x, i) { return val(fn(x, i)); }).join('')); };
  App.safeUrl = function (u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; };
  App.nl2br = function (s) { return raw(esc(s || '').replace(/\n/g, '<br>')); };
  App.linkify = function (s) {
    return raw(esc(s || '').replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>';
    }).replace(/\n/g, '<br>'));
  };

  // ------------------------------------------------------------ translation (dictionary in i18n.js)
  App.lang = App.local.get('lang', null);
  App.t = function (key, vars) {
    var s = key;
    if (App.lang === 'fr' && App.FR && Object.prototype.hasOwnProperty.call(App.FR, key)) s = App.FR[key];
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  };
  // values that come from the settings (categories, default milestones) are translated when they match a known text
  App.tv = function (v) { return v ? App.t(v) : v; };
  App.locale = function () { return App.lang === 'fr' ? 'fr-FR' : 'en-GB'; };

  // ------------------------------------------------------------ dates (YYYY-MM-DD strings, local time)
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  App.ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  App.parse = function (s) {
    s = String(s || '');
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  };
  App.today = function () { return App.ymd(new Date()); };
  App.addDays = function (s, n) { var d = App.parse(s); d.setDate(d.getDate() + n); return App.ymd(d); };
  App.days = function (a, b) { return Math.round((App.parse(b) - App.parse(a)) / 86400000); };
  App.startDay = function () { var c = App.pubCfg(); return c && c.week_start === 'monday' ? 1 : 0; };
  App.weekOf = function (s) { var d = App.parse(s || App.today()); d.setDate(d.getDate() - ((d.getDay() - App.startDay() + 7) % 7)); return App.ymd(d); };
  App.curWeek = function () { return App.weekOf(App.today()); };
  App.fmt = function (s, opt) {
    var d = App.parse(s);
    if (!d) return '';
    return new Intl.DateTimeFormat(App.locale(), opt || { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  };
  App.fmtShort = function (s) { return App.fmt(s, { day: 'numeric', month: 'short' }); };
  App.fmtTime = function (s) {
    var d = App.parse(s);
    if (!d) return '';
    return new Intl.DateTimeFormat(App.locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
  };
  App.weekLabel = function (w) {
    var end = App.addDays(w, 6), a = App.parse(w), b = App.parse(end);
    var sameMonth = a.getMonth() === b.getMonth();
    var left = new Intl.DateTimeFormat(App.locale(), sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' }).format(a);
    return left + ' – ' + App.fmt(end);
  };
  App.pfeWeek = function (w) {
    var c = App.pubCfg();
    if (!c || !c.start_date) return null;
    var n = Math.floor(App.days(App.weekOf(c.start_date), w) / 7) + 1;
    return n >= 1 ? n : null;
  };
  App.ago = function (s) {
    var d = App.parse(s);
    if (!d) return '';
    var sec = (Date.now() - d.getTime()) / 1000;
    var rtf = new Intl.RelativeTimeFormat(App.locale(), { numeric: 'auto' });
    if (sec < 60) return rtf.format(0, 'second');
    if (sec < 3600) return rtf.format(-Math.round(sec / 60), 'minute');
    if (sec < 86400) return rtf.format(-Math.round(sec / 3600), 'hour');
    if (sec < 86400 * 30) return rtf.format(-Math.round(sec / 86400), 'day');
    return App.fmt(s);
  };
  App.inDays = function (s) {
    var n = App.days(App.today(), s);
    var rtf = new Intl.RelativeTimeFormat(App.locale(), { numeric: 'auto' });
    if (Math.abs(n) < 60) return rtf.format(n, 'day');
    return rtf.format(Math.round(n / 7), 'week');
  };

  // ------------------------------------------------------------ state
  var S = App.S = {
    auth: null,      // {role:'team', code} | {role:'admin', token}
    D: null,         // data of the team (team mode)
    A: { overview: null, teams: {}, week: {} },
    M: null,         // current view: {admin, base, D}
    ping: null,
    actor: '',
    busy: 0
  };
  App.pubCfg = function () { return (S.M && S.M.D && S.M.D.config) || (S.D && S.D.config) || S.ping || null; };

  // ------------------------------------------------------------ page address
  // normally the route lives in location.hash; window.PFE_MEMORY_ROUTES keeps it in memory instead
  App.memoryRoutes = !!window.PFE_MEMORY_ROUTES;
  var memHash = '#/';
  App.getHash = function () { return App.memoryRoutes ? memHash : location.hash; };
  App.setHash = function (hsh) {
    if (!App.memoryRoutes) { location.hash = hsh; return; }
    if (memHash === hsh) return;
    memHash = hsh;
    window.dispatchEvent(new Event('hashchange'));
  };
  document.addEventListener('click', function (e) {
    if (!App.memoryRoutes || e.defaultPrevented) return;
    var a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (!a) return;
    e.preventDefault();
    App.setHash(a.getAttribute('href'));
  });

  // ------------------------------------------------------------ server calls
  App.isDemo = function () { return !!App.demo; };
  App.configured = function () { return /^https:\/\/script\.google\.com\/.+\/exec$/.test(String(CFG.API_URL || '').trim()) || !!CFG.TEST_API; };

  function ApiError(code, message) { this.code = code; this.message = message || code; }
  ApiError.prototype = Object.create(Error.prototype);
  App.ApiError = ApiError;

  App.api = function (action, payload) {
    var body = Object.assign({ action: action }, payload || {});
    if (S.auth && S.auth.role === 'team' && !body.code) body.code = S.auth.code;
    if (S.auth && S.auth.role === 'admin' && !body.token) body.token = S.auth.token;
    if (S.actor && !body.actor) body.actor = S.actor;
    // any change made by the supervisor makes the overview out of date
    if (S.auth && S.auth.role === 'admin' && !/^(admin\.overview|admin\.team|admin\.week|ping|load|admin\.login)$/.test(action)) S.A.stale = true;
    busy(1);
    var p;
    if (App.demo) p = App.demo.call(body);
    else {
      var url = CFG.TEST_API || String(CFG.API_URL).trim();
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 45000) : null;
      p = fetch(url, {
        method: 'POST', body: JSON.stringify(body), redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctrl ? ctrl.signal : undefined
      }).then(function (r) {
        if (timer) clearTimeout(timer);
        return r.text();
      }).then(function (txt) {
        try { return JSON.parse(txt); } catch (e) { throw new ApiError('BAD_RESPONSE', txt.slice(0, 200)); }
      }, function (e) {
        if (timer) clearTimeout(timer);
        if (e instanceof ApiError) throw e;
        throw new ApiError('NETWORK', String(e && e.message || e));
      });
    }
    return p.then(function (res) {
      busy(-1);
      if (!res || !res.ok) throw new ApiError(res && res.error || 'SERVER', res && res.message);
      return res.data;
    }, function (e) { busy(-1); throw e; });
  };

  function busy(d) {
    S.busy = Math.max(0, S.busy + d);
    var bar = document.getElementById('busy');
    if (bar) bar.classList.toggle('on', S.busy > 0);
  }

  var ERRORS = {
    NETWORK: 'No connection to the server. Check your internet connection and try again.',
    BAD_RESPONSE: 'The server gave an unexpected answer. The teacher must check the web app deployment.',
    BAD_CODE: 'This access code is not valid.',
    SUSPENDED: 'This team account is suspended. Contact your supervisor.',
    ARCHIVED: 'This project is archived: it can be read but not changed.',
    AUTH: 'Your teacher session has expired. Please log in again.',
    BAD_PASSWORD: 'Wrong password.',
    LOCKED: 'Too many wrong passwords. Wait 15 minutes and try again.',
    NO_ADMIN: 'No teacher password is set yet. Open the Google Sheet → menu PFE Tracker → Set the teacher password.',
    WEAK_PASSWORD: 'The new password must have at least 8 characters.',
    REG_CLOSED: 'Sign-up is closed. Contact your supervisor.',
    REG_KEY: 'The sign-up key is not correct. Ask your supervisor for it.',
    DUPLICATE: 'A student with matricule {m} already belongs to a team.',
    TEAM_FULL: 'The team already has the maximum number of members.',
    LAST_MEMBER: 'A team must keep at least one member.',
    VALIDATION: 'Some information is missing or not valid ({m}).',
    BAD_URL: 'Links must start with http:// or https://',
    REPORT_EMPTY: 'Describe what you did this week before submitting.',
    REASONS_REQUIRED: 'For each unfinished task, choose an obstacle and write why it was not done.',
    NOT_FOUND: 'This item no longer exists. The page was refreshed.',
    EMAIL_DISABLED: 'Codes cannot be sent by email. Ask your supervisor to give you a new code.',
    TOO_MANY: 'Too many attempts. Try again in a few minutes.',
    BUSY: 'The server is busy. Try again in a moment.',
    CONFIRM: 'Confirmation does not match.',
    TOO_LARGE: 'This text is too long.',
    SERVER: 'Server error: {m}'
  };
  App.errText = function (e) {
    var code = e && e.code || 'SERVER';
    var msg = ERRORS[code] ? App.t(ERRORS[code], { m: e.message || '' }) : (e && e.message) || String(e);
    if (code === 'SERVER' || !ERRORS[code]) msg = App.t(ERRORS.SERVER, { m: e && e.message || code });
    return msg;
  };
  App.fail = function (e) {
    if (e && e.code === 'AUTH' && S.auth && S.auth.role === 'admin') { App.logout(true); App.toast(App.errText(e), 'err'); return; }
    if (e && (e.code === 'BAD_CODE' || e.code === 'SUSPENDED') && S.auth && S.auth.role === 'team') { App.logout(true); App.toast(App.errText(e), 'err'); return; }
    App.toast(App.errText(e), 'err');
  };

  // ------------------------------------------------------------ local data helpers
  App.upsert = function (list, rec) {
    if (!list || !rec) return;
    for (var i = 0; i < list.length; i++) if (list[i].id === rec.id) { list[i] = rec; return; }
    list.push(rec);
  };
  App.remove = function (list, id) {
    if (!list) return;
    for (var i = list.length - 1; i >= 0; i--) if (list[i].id === id) list.splice(i, 1);
  };
  App.byId = function (list, id) { return (list || []).filter(function (x) { return x.id === id; })[0] || null; };

  // save an item of the current team (works for the team and for the teacher viewing the team)
  App.save = function (entity, record) {
    var M = S.M, payload = { entity: entity, record: record };
    if (M.admin) payload.teamId = M.D.team.id;
    return App.api('save', payload).then(function (rec) { App.upsert(M.D[entity], rec); return rec; });
  };
  App.saveMany = function (entity, records) {
    var M = S.M, payload = { entity: entity, records: records };
    if (M.admin) payload.teamId = M.D.team.id;
    return App.api('saveMany', payload).then(function (list) { list.forEach(function (r) { App.upsert(M.D[entity], r); }); return list; });
  };
  App.del = function (entity, id) {
    var M = S.M, payload = { entity: entity, id: id };
    if (M.admin) payload.teamId = M.D.team.id;
    return App.api('del', payload).then(function () { App.remove(M.D[entity], id); });
  };
  App.teamCall = function (action, payload) {
    var M = S.M;
    payload = Object.assign({}, payload || {});
    if (M.admin) payload.teamId = M.D.team.id;
    return App.api(action, payload);
  };

  // ------------------------------------------------------------ drafts: text typed in forms survives a re-render
  App.drafts = {};
  App.draft = function (key, value) { return Object.prototype.hasOwnProperty.call(App.drafts, key) ? App.drafts[key] : value; };
  App.clearDrafts = function (prefix) { Object.keys(App.drafts).forEach(function (k) { if (k.indexOf(prefix) === 0) delete App.drafts[k]; }); };
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el && el.dataset && el.dataset.draft) App.drafts[el.dataset.draft] = el.type === 'checkbox' ? el.checked : el.value;
  });

  // ------------------------------------------------------------ events (delegated)
  App.acts = {};
  App.chgs = {};
  App.forms = {};
  App.act = function (name, fn) { App.acts[name] = fn; };
  App.chg = function (name, fn) { App.chgs[name] = fn; };
  App.form = function (name, fn) { App.forms[name] = fn; };
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    // a form control inside a clickable card keeps its own behaviour
    var ctl = e.target.closest('select, input, textarea, label, a[href]');
    if (ctl && ctl !== el && el.contains(ctl)) return;
    var fn = App.acts[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    try { var r = fn(el, e); if (r && r.catch) r.catch(App.fail); } catch (x) { App.fail(x); }
  });
  document.addEventListener('change', function (e) {
    var el = e.target.closest && e.target.closest('[data-chg]');
    if (!el) return;
    var fn = App.chgs[el.dataset.chg];
    if (!fn) return;
    try { var r = fn(el, e); if (r && r.catch) r.catch(App.fail); } catch (x) { App.fail(x); }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.dataset || !f.dataset.form) return;
    e.preventDefault();
    var fn = App.forms[f.dataset.form];
    if (!fn) return;
    var btn = f.querySelector('[type=submit]');
    if (btn) btn.disabled = true;
    var done = function () { if (btn) btn.disabled = false; };
    try {
      var r = fn(f, App.formData(f), e);
      if (r && r.then) r.then(done, function (x) { done(); App.fail(x); }); else done();
    } catch (x) { done(); App.fail(x); }
  });

  App.formData = function (f) {
    var o = {};
    Array.prototype.forEach.call(f.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') { if (el.dataset.multi) { o[el.name] = o[el.name] || []; if (el.checked) o[el.name].push(el.value); } else o[el.name] = el.checked; }
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; else if (!(el.name in o)) o[el.name] = ''; }
      else if (el.type === 'number' || el.type === 'range') o[el.name] = el.value === '' ? '' : Number(el.value);
      else o[el.name] = el.value;
    });
    return o;
  };

  // ------------------------------------------------------------ toast, modal, confirm
  App.toast = function (msg, kind) {
    var box = document.getElementById('toasts');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || 'ok');
    el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 400); }, kind === 'err' ? 6000 : 2600);
  };

  var modalStack = [];
  App.modal = function (opt) {
    var h = App.html, t = App.t;
    var root = document.getElementById('modals');
    var wrap = document.createElement('div');
    wrap.className = 'modal-back';
    wrap.innerHTML = h`<form class="modal ${opt.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${opt.title}" novalidate>
      <header class="modal-head"><h2>${opt.title}</h2><button type="button" class="icon-btn" data-close aria-label="${t('Close')}">${App.icon('x')}</button></header>
      <div class="modal-body">${opt.body}<p class="form-error" hidden></p></div>
      <footer class="modal-foot">${opt.left || ''}<span class="grow"></span>
        ${opt.noCancel ? '' : h`<button type="button" class="btn ghost" data-close>${opt.cancel || t('Cancel')}</button>`}
        ${opt.onSubmit ? h`<button type="submit" class="btn ${opt.danger ? 'danger' : 'primary'}">${opt.submit || t('Save')}</button>` : ''}
      </footer></form>`.s;
    root.appendChild(wrap);
    var form = wrap.querySelector('form');
    var prevFocus = document.activeElement;
    function close() {
      wrap.remove();
      modalStack.pop();
      if (opt.onClose) opt.onClose();
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus();
    }
    modalStack.push(close);
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap && !opt.sticky) close();
      if (e.target.closest('[data-close]')) { e.preventDefault(); close(); }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!opt.onSubmit) return;
      var err = form.querySelector('.form-error');
      err.hidden = true;
      var bad = form.querySelector(':invalid');
      if (bad) { err.textContent = App.t('Please fill in the required fields.'); err.hidden = false; bad.focus(); return; }
      var btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      btn.classList.add('loading');
      Promise.resolve().then(function () { return opt.onSubmit(App.formData(form), form); }).then(function (keep) {
        btn.disabled = false; btn.classList.remove('loading');
        if (keep !== true) close();
      }, function (x) {
        btn.disabled = false; btn.classList.remove('loading');
        err.textContent = App.errText(x); err.hidden = false;
      });
    });
    if (opt.onOpen) opt.onOpen(form, close);
    setTimeout(function () {
      var first = form.querySelector('[autofocus]') || form.querySelector('.modal-body input:not([type=hidden]):not([type=checkbox]), .modal-body textarea, .modal-body select');
      if (first && !opt.noFocus) first.focus();
    }, 30);
    return { close: close, form: form };
  };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modalStack.length) { modalStack[modalStack.length - 1](); }
  });
  App.closeModals = function () { while (modalStack.length) modalStack[modalStack.length - 1](); };

  App.confirm = function (message, opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var answered = false;
      App.modal({
        title: opt.title || App.t('Please confirm'), body: App.html`<p>${message}</p>${opt.extra || ''}`,
        submit: opt.ok || App.t('Confirm'), danger: !!opt.danger, noFocus: true,
        onSubmit: function (data) {
          if (opt.check && !opt.check(data)) throw new ApiError('CONFIRM');
          answered = true; resolve(data || true);
        },
        onClose: function () { if (!answered) resolve(false); }
      });
    });
  };

  // ------------------------------------------------------------ small UI pieces
  App.copy = function (text) {
    var done = function () { App.toast(App.t('Copied')); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { App.toast(text, 'info'); }
      ta.remove();
    }
  };
  App.download = function (name, text, type) {
    try {
      var blob = new Blob(['﻿' + text], { type: type || 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    } catch (e) { App.toast(App.t('Download is not available here.'), 'err'); }
  };
  App.csv = function (rows) {
    return rows.map(function (r) {
      return r.map(function (v) {
        v = v === null || v === undefined ? '' : String(v);
        if (/^[=+\-@]/.test(v)) v = "'" + v;
        return /[",;\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(';');
    }).join('\r\n');
  };
  App.initials = function (m) {
    if (!m) return '?';
    return ((m.firstName || '').charAt(0) + (m.lastName || '').charAt(0)).toUpperCase() || '?';
  };
  App.fullName = function (m) { return m ? (m.firstName + ' ' + m.lastName).trim() : ''; };
  App.color = function (s) {
    var h = 0; s = String(s || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  };
  App.avatar = function (m, size) {
    return App.html`<span class="avatar ${size || ''}" style="--h:${App.color(m && m.id)}" title="${App.fullName(m)}">${App.initials(m)}</span>`;
  };
  App.empty = function (text, action) {
    return App.html`<div class="empty"><p>${text}</p>${action || ''}</div>`;
  };
  App.opt = function (value, label, selected) {
    return App.html`<option value="${value}" ${String(value) === String(selected) ? App.raw('selected') : ''}>${label}</option>`;
  };
  App.options = function (list, selected) {
    return App.join(list, function (o) { return Array.isArray(o) ? App.opt(o[0], o[1], selected) : App.opt(o, App.tv(o), selected); });
  };
  App.checked = function (b) { return b ? App.raw('checked') : ''; };
  App.sel = function (b) { return b ? App.raw('selected') : ''; };

  // ------------------------------------------------------------ icons (simple line icons)
  var ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    week: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8.5 15l2.5 2.5 4.5-4.5"/>',
    board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
    matrix: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c1.8.7 3 2.4 3.5 5.2"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    book: '<path d="M4 4h6a2 2 0 012 2v14a2 2 0 00-2-2H4z"/><path d="M20 4h-6a2 2 0 00-2 2v14a2 2 0 012-2h6z"/>',
    journal: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    meeting: '<circle cx="7" cy="9" r="2.5"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c.5-2.8 2-4.5 4-4.5s3.5 1.7 4 4.5M13 19c.5-2.8 2-4.5 4-4.5s3.5 1.7 4 4.5"/>',
    chart: '<path d="M4 20V4M4 20h16"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    logout: '<path d="M10 4H5v16h5"/><path d="M15 8l4 4-4 4M19 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M10 3h4M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    bell: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 115 0c0 1.8-2.5 2-2.5 4M12 17v.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 119.5 4a6.5 6.5 0 0010.5 10.5z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    up: '<path d="M5 15l7-7 7 7"/>',
    down: '<path d="M5 9l7 7 7-7"/>',
    link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1.5 3h5L16 13h5"/>',
    megaphone: '<path d="M3 10v4h4l9 5V5L7 10z"/><path d="M19 9a4 4 0 010 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.4 8.3-8 9-4.6-.7-8-4-8-9V6z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.5M4 12h.5M4 18h.5"/>',
    timeline: '<path d="M4 6h9M8 12h10M6 18h7"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    pin: '<path d="M9 3h6l-1 6 4 4H6l4-4z"/><path d="M12 13v8"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>',
    filter: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
    idea: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'
  };
  App.icon = function (name, cls) {
    return App.raw('<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>');
  };
})();
