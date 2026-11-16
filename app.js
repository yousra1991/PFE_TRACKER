/* PFE Tracker — layout, navigation, sign-up and login, start-up. */
(function () {
  'use strict';
  var App = window.App, h = App.html, t = App.t, S = App.S, P = App.Pages;

  App.title = function () { return (S.ping && S.ping.app_title) || App.cfg.TITLE || 'PFE Tracker'; };
  // navigate; the page is drawn once (by the hashchange event, or now if the address does not change)
  App.go = function (hash) { if (App.getHash() === hash) render(); else App.setHash(hash); };

  // ------------------------------------------------------------ session
  App.rememberCode = function (code) {
    if (App.local.get('code', null)) App.local.set('code', code); else App.session.set('code', code);
  };
  App.setActor = function (d) {
    var id = App.local.get('actor.' + d.team.id, '');
    var m = App.byId(d.members, id);
    S.actor = m ? App.fullName(m) : (d.members.length === 1 ? App.fullName(d.members[0]) : 'Team');
  };
  function startTeam(code, data, remember) {
    S.auth = { role: 'team', code: code };
    S.D = data;
    S.D.at = Date.now();
    if (remember) App.local.set('code', code); else { App.local.del('code'); App.session.set('code', code); }
    App.setActor(data);
  }
  App.logout = function (silent) {
    var tk = S.auth && S.auth.role === 'admin' ? S.auth.token : null;
    if (tk && !silent) App.api('admin.logout', { token: tk }).catch(function () { /* ignore */ });
    S.auth = null; S.D = null; S.M = null; S.A = { overview: null, teams: {}, week: {} };
    App.local.del('code'); App.session.del('code'); App.session.del('token');
    App.drafts = {};
    App.closeModals();
    App.go('#/');
  };
  App.act('logout', function () { App.logout(false); });

  // ------------------------------------------------------------ navigation
  var TEAM_NAV = [
    ['Overview', [['', 'Dashboard', 'home']]],
    ['Plan', [['week', 'This week', 'week'], ['tasks', 'Tasks', 'board'], ['matrix', 'Priority matrix', 'matrix'], ['timeline', 'Milestones', 'flag']]],
    ['Record', [['history', 'History', 'clock'], ['meetings', 'Meetings', 'meeting'], ['journal', 'Journal', 'journal'], ['resources', 'Resources', 'book']]],
    ['Communicate', [['messages', 'Messages', 'chat'], ['news', 'Announcements', 'megaphone']]],
    ['Team', [['team', 'Team and project', 'users'], ['stats', 'Statistics', 'chart'], ['report', 'Follow-up sheet', 'print']]]
  ];
  var ADMIN_NAV = [['', 'Overview', 'home'], ['week', 'Weekly review', 'week'], ['messages', 'Messages', 'chat'], ['news', 'Announcements', 'megaphone'], ['settings', 'Settings', 'settings']];

  function badgeFor(key, d, admin) {
    if (!d) return 0;
    if (key === 'messages') return App.unreadFor(d, admin);
    if (key === 'news' && !admin) {
      var seen = App.local.get('seenAnn.' + d.team.id, '');
      return d.announcements.filter(function (a) { return a.createdAt > seen; }).length;
    }
    return 0;
  }
  function navTeam(base, cur, d, admin) {
    return App.join(TEAM_NAV, function (g) {
      return h`<div class="nav-group"><div class="nav-title">${t(g[0])}</div>${App.join(g[1], function (it) {
        var b = badgeFor(it[0], d, admin);
        return h`<a href="${base}/${it[0]}" class="${cur === it[0] ? 'on' : ''}">${App.icon(it[2])}<span>${t(it[1])}</span>${b ? h`<span class="badge">${b}</span>` : ''}</a>`;
      })}</div>`;
    });
  }
  function sidebar(route) {
    if (S.auth.role === 'team') return navTeam('#', route.page, S.D, false);
    var o = S.A.overview, pend = 0, unread = 0, review = 0;
    if (o) o.teams.forEach(function (x) { if (x.status === 'pending') pend++; unread += x.summary.unread || 0; review += x.summary.toReview || 0; });
    var counts = { '': pend, week: review, messages: unread };
    return h`<div class="nav-group"><div class="nav-title">${t('Supervision')}</div>${App.join(ADMIN_NAV, function (it) {
      var on = !route.teamId && route.page === it[0];
      return h`<a href="#/a${it[0] ? '/' + it[0] : ''}" class="${on ? 'on' : ''}">${App.icon(it[2])}<span>${t(it[1])}</span>${counts[it[0]] ? h`<span class="badge">${counts[it[0]]}</span>` : ''}</a>`;
    })}</div>
    ${route.teamId && S.M ? h`<div class="nav-team"><div class="nav-title">${t('Team')} ${route.teamId}</div><div class="nav-team-title">${S.M.D.team.title}</div></div>${navTeam('#/a/t/' + route.teamId, route.page, S.M.D, true)}` : ''}`;
  }
  function tabbar(route) {
    var items = S.auth.role === 'team'
      ? [['#/', '', 'home', 'Home'], ['#/week', 'week', 'week', 'Week'], ['#/tasks', 'tasks', 'board', 'Tasks'], ['#/messages', 'messages', 'chat', 'Messages']]
      : [['#/a', '', 'home', 'Teams'], ['#/a/week', 'week', 'week', 'Review'], ['#/a/messages', 'messages', 'chat', 'Messages'], ['#/a/settings', 'settings', 'settings', 'Settings']];
    return h`<nav class="tabbar" aria-label="${t('Main sections')}">${App.join(items, function (it) {
      var on = route.page === it[1] && !route.teamId;
      var b = S.auth.role === 'team' && it[1] === 'messages' ? App.unreadFor(S.D, false) : 0;
      return h`<a href="${it[0]}" class="${on ? 'on' : ''}">${App.icon(it[2])}<span>${t(it[3])}</span>${b ? h`<i class="dot"></i>` : ''}</a>`;
    })}<button type="button" data-act="nav-toggle">${App.icon('menu')}<span>${t('More')}</span></button></nav>`;
  }
  App.act('nav-toggle', function () { document.body.classList.toggle('nav-open'); });
  document.addEventListener('click', function (e) {
    if (e.target.closest('.sidebar a') || e.target.classList.contains('scrim')) document.body.classList.remove('nav-open');
  });

  function topbar() {
    var who = '';
    if (S.auth && S.auth.role === 'team') who = h`<a class="user-chip" href="#/team" title="${t('Who uses this device?')}">${App.icon('user')}<span>${S.actor === 'Team' ? S.D.team.id : S.actor}</span></a>`;
    if (S.auth && S.auth.role === 'admin') who = h`<span class="user-chip">${App.icon('shield')}<span>${t('Supervisor')}</span></span>`;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    return h`<header class="topbar">
      ${S.auth ? h`<button type="button" class="icon-btn menu-btn" data-act="nav-toggle" aria-label="${t('Menu')}">${App.icon('menu')}</button>` : ''}
      <a class="brand" href="${S.auth && S.auth.role === 'admin' ? '#/a' : '#/'}">${logo()}<span>${App.title()}</span></a>
      <span class="grow"></span>
      ${App.demo ? h`<button type="button" class="demo-chip" data-act="demo-info">${t('Demo')}</button>` : ''}
      <button type="button" class="icon-btn" data-act="lang" aria-label="${t('Language')}" title="${App.lang === 'fr' ? 'English' : 'Français'}"><b class="lang">${App.lang === 'fr' ? 'EN' : 'FR'}</b></button>
      <button type="button" class="icon-btn" data-act="theme" aria-label="${t('Dark or light mode')}">${App.icon(dark ? 'sun' : 'moon')}</button>
      ${who}
      ${S.auth ? h`<button type="button" class="icon-btn" data-act="logout" aria-label="${t('Log out')}" title="${t('Log out')}">${App.icon('logout')}</button>` : ''}
    </header>`;
  }
  function logo() {
    return App.raw('<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--primary)"/><path d="M8 22V10h6.5a4 4 0 010 8H8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.5 21.5l2.6 2.6L25 18" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  }
  App.act('lang', function () {
    App.lang = App.lang === 'fr' ? 'en' : 'fr';
    App.local.set('lang', App.lang);
    document.documentElement.lang = App.lang;
    render();
  });
  App.act('theme', function () {
    var cur = document.documentElement.getAttribute('data-theme');
    var dark = cur === 'dark' || (!cur && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    var next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    App.local.set('theme', next);
    render();
  });

  // ------------------------------------------------------------ routes
  function parseRoute() {
    var seg = App.getHash().replace(/^#\/?/, '').split('?')[0].split('/').filter(function (s, i) { return s !== '' || i === 0; });
    if (seg.length === 1 && seg[0] === '') seg = [];
    if (S.auth && S.auth.role === 'admin') {
      if (seg[0] !== 'a') return { redirect: '#/a' };
      if (seg[1] === 't' && seg[2]) return { area: 'admin', teamId: decodeURIComponent(seg[2]).toUpperCase(), page: seg[3] || '', arg: seg[4] || '' };
      return { area: 'admin', page: seg[1] || '', arg: seg[2] || '' };
    }
    if (S.auth && S.auth.role === 'team') {
      if (seg[0] === 'a' || seg[0] === 'admin' || seg[0] === 'register' || seg[0] === 'forgot') return { redirect: '#/' };
      return { area: 'team', page: seg[0] || '', arg: seg[1] || '' };
    }
    return { area: 'public', page: seg[0] || '', arg: seg[1] || '' };
  }

  var TEAM_PAGES = {
    '': ['dashboard', 'Dashboard'], week: ['week', 'This week'], history: ['history', 'History'], tasks: ['tasks', 'Tasks'],
    matrix: ['matrix', 'Priority matrix'], timeline: ['timeline', 'Milestones'], meetings: ['meetings', 'Meetings'],
    journal: ['journal', 'Journal'], resources: ['resources', 'Resources'], messages: ['messages', 'Messages'],
    news: ['news', 'Announcements'], team: ['team', 'Team and project'], stats: ['stats', 'Statistics'], report: ['report', 'Follow-up sheet']
  };
  var AFTER = { tasks: function () { App.bindBoard(); }, matrix: function () { App.bindMatrix(); }, messages: function () { App.scrollThread(); } };

  var renderSeq = 0;
  function render() {
    var seq = ++renderSeq;
    var route = parseRoute();
    if (route.redirect) { if (App.memoryRoutes) App.setHash(route.redirect); else location.replace(route.redirect); return; }
    document.documentElement.lang = App.lang || 'en';
    var app = document.getElementById('app');
    if (route.area === 'public') { S.M = null; return paint(publicPage(route), route, false); }
    if (route.area === 'team') {
      S.M = { admin: false, base: '#', D: S.D };
      var pg = TEAM_PAGES[route.page] ? route.page : '';
      route.page = pg;
      paint(P[TEAM_PAGES[pg][0]]({ w: route.arg, k: route.arg }), route, true, TEAM_PAGES[pg][1]);
      if (S.pendingActor) { S.pendingActor = false; askActor(S.D); }
      return;
    }
    // supervisor
    var needOverview = !S.A.overview || S.A.stale || Date.now() - (S.A.at || 0) > 120000;
    var loading = [];
    if (needOverview) loading.push(App.loadOverview());
    if (route.teamId) loading.push(App.loadTeam(route.teamId));
    if (route.page === 'week' && !route.teamId) {
      route.arg = route.arg && /^\d{4}-\d{2}-\d{2}$/.test(route.arg) ? App.weekOf(route.arg) : App.curWeek();
      loading.push(App.loadAdminWeek(route.arg));
    }
    var go = function () {
      if (seq !== renderSeq) return;
      if (route.teamId) {
        var d = S.A.teams[route.teamId].data;
        S.M = { admin: true, base: '#/a/t/' + route.teamId, D: d };
        var tp = TEAM_PAGES[route.page] ? route.page : '';
        route.page = tp;
        return paint(h`<div data-team="${route.teamId}">${App.adminBar()}${P[TEAM_PAGES[tp][0]]({ w: route.arg, k: route.arg })}</div>`, route, true, d.team.id + ' · ' + t(TEAM_PAGES[tp][1]));
      }
      S.M = null;
      var map = { '': ['aOverview', 'Overview'], week: ['aWeek', 'Weekly review'], messages: ['aMessages', 'Messages'], news: ['aNews', 'Announcements'], settings: ['aSettings', 'Settings'] };
      var p = map[route.page] || map[''];
      if (!map[route.page]) route.page = '';
      paint(P[p[0]]({ w: route.arg }), route, true, t(p[1]));
    };
    if (loading.length) {
      if (!app.querySelector('.shell')) paint(h`<div class="loading">${t('Loading…')}</div>`, route, true);
      else { var main = document.getElementById('main'); if (main) main.classList.add('dim'); }
      Promise.all(loading).then(go, function (e) {
        if (seq !== renderSeq) return;
        App.fail(e);
        if (e && e.code === 'NOT_FOUND') { App.setHash('#/a'); return; }
        if (S.auth) paint(App.empty(App.errText(e), h`<button type="button" class="btn" data-act="reload">${t('Try again')}</button>`), route, true);
      });
    } else go();
  }
  App.act('reload', function () { render(); });

  function paint(content, route, shell, title) {
    var app = document.getElementById('app');
    var ae = document.activeElement, key = ae && ae.dataset ? (ae.dataset.draft || (ae.dataset.chg && ae.dataset.id ? ae.dataset.chg + ae.dataset.id : '')) : '';
    var selS = null, selE = null;
    try { selS = ae.selectionStart; selE = ae.selectionEnd; } catch (e) { /* not a text field */ }
    var sameRoute = app.dataset.route === App.getHash();
    var y = window.scrollY;
    if (shell) {
      app.innerHTML = h`${topbar()}<div class="shell"><aside class="sidebar" id="sidebar" aria-label="${t('Navigation')}">${sidebar(route)}</aside><div class="scrim"></div>
        <main id="main" tabindex="-1">${content}</main></div>${tabbar(route)}`.s;
    } else {
      app.innerHTML = h`${topbar()}<main id="main" class="public" tabindex="-1">${content}</main>`.s;
    }
    if (App.demo) app.insertAdjacentHTML('afterbegin', App.demo.bar().s);
    document.title = (title ? t(title) + ' · ' : '') + App.title();
    app.dataset.route = App.getHash();
    if (sameRoute) window.scrollTo(0, y); else window.scrollTo(0, 0);
    if (key) {
      var el = app.querySelector('[data-draft="' + key + '"]') || Array.prototype.filter.call(app.querySelectorAll('[data-chg][data-id]'), function (x) { return x.dataset.chg + x.dataset.id === key; })[0];
      if (el) { el.focus({ preventScroll: true }); try { if (selS !== null) el.setSelectionRange(selS, selE); } catch (e) { /* ignore */ } }
    }
    if (route && AFTER[route.page] && (route.area === 'team' || route.teamId)) AFTER[route.page]();
  }
  App.refresh = function () { render(); };
  App.refreshNav = function () {
    var r = parseRoute(), sb = document.getElementById('sidebar');
    if (sb && S.auth) sb.innerHTML = sidebar(r).s;
  };
  window.addEventListener('hashchange', function () { App.closeModals(); render(); });

  // data refresh when the visitor comes back to the page
  var lastFocus = Date.now();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !S.auth) return;
    if (Date.now() - lastFocus < 90000) return;
    lastFocus = Date.now();
    if (document.querySelector('.modal-back')) return;
    var ae = document.activeElement;
    if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
    reloadData().then(render, function () { /* keep the old data */ });
  });
  function reloadData() {
    if (S.auth.role === 'team') return App.api('load', {}).then(function (d) { S.D = d; S.D.at = Date.now(); App.setActor(d); });
    var r = parseRoute();
    var p = [App.loadOverview(true)];
    if (r.teamId) p.push(App.loadTeam(r.teamId, true));
    return Promise.all(p);
  }
  App.act('refresh-data', function () { return reloadData().then(function () { App.toast(t('Updated')); render(); }); });

  // ------------------------------------------------------------ public pages
  function publicPage(route) {
    if (!App.configured() && !App.demo) return setupPage();
    if (route.page === 'register') return registerPage();
    if (route.page === 'welcome') return welcomePage();
    if (route.page === 'forgot') return forgotPage();
    if (route.page === 'admin') return adminLoginPage();
    return landing();
  }

  function setupPage() {
    return h`<section class="hero small">${logo()}<h1>${App.title()}</h1><p>${t('This website is not connected to its database yet.')}</p></section>
      <section class="card narrow"><h2>${t('For the teacher: finish the installation')}</h2>
        <ol class="steps"><li>${t('Open your Google Sheet → Extensions → Apps Script, paste backend/Code.gs and save.')}</li>
          <li>${t('Reload the sheet → menu PFE Tracker → Install, and choose your password.')}</li>
          <li>${t('Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone) and copy the URL.')}</li>
          <li>${t('Paste the URL in config.js (API_URL) in the GitHub repository.')}</li></ol>
        <p>${t('Meanwhile you can try the full platform in demo mode (the data stays in your browser).')}</p>
        <a class="btn primary" href="?demo=1#/">${App.icon('play')}<span>${t('Open the demo')}</span></a></section>`;
  }

  function landing() {
    var p = S.ping || {};
    return h`<section class="hero">${logo()}<h1>${App.title()}</h1>
        <p class="lead">${t('Follow your final-year project week after week: plan, record what is done and what is not, set priorities and get feedback from your supervisor.')}</p>
        <p class="muted">${p.institution || ''}${p.academic_year ? ' · ' + p.academic_year : ''}${p.supervisor_name ? ' · ' + t('Supervisor') + ': ' + p.supervisor_name : ''}</p></section>
      ${App.demo ? App.demo.codesCard() : ''}
      <div class="auth-grid">
        <form class="card auth" data-form="login" autocomplete="off">
          <h2>${App.icon('key')}${t('Team space')}</h2>
          <p class="muted">${t('Enter the access code of your team.')}</p>
          <label class="sr" for="code">${t('Access code')}</label>
          <input id="code" name="code" class="code-input" required maxlength="12" placeholder="XXXX-XXXX" autocapitalize="characters" spellcheck="false" inputmode="text" data-codeinput>
          <label class="check"><input type="checkbox" name="remember" checked><span>${t('Stay connected on this device')}</span></label>
          <button class="btn primary block" type="submit">${t('Open my team space')}</button>
          <div class="auth-links"><a href="#/forgot">${t('Forgot the code?')}</a></div>
        </form>
        <div class="card auth alt">
          <h2>${App.icon('users')}${t('New team?')}</h2>
          <p>${t('Create the account of your team in two minutes: the title of the project and the members. You receive your access code at once.')}</p>
          ${p.registration_open === false ? h`<p class="banner">${t('Sign-up is closed. Contact your supervisor.')}</p>` : h`<a class="btn block" href="#/register">${App.icon('plus')}<span>${t('Create a team account')}</span></a>`}
          <hr><a class="teacher-link" href="#/admin">${App.icon('shield')}<span>${t('Supervisor space')}</span></a>
        </div>
      </div>
      <section class="features">${App.join([
        ['week', 'Weekly plan and report', 'Plan the week, mark each task done or not, explain the obstacles.'],
        ['board', 'Task board', 'To do, in progress, to review, blocked, done — drag and drop.'],
        ['matrix', 'Priority matrix', 'Urgent or important? Do first what matters.'],
        ['flag', 'Milestones and timeline', 'The big steps of the PFE on a timeline, with deadlines.'],
        ['chat', 'Feedback and messages', 'Your supervisor reviews each week and answers your questions.'],
        ['shield', 'Private data', 'Each team sees only its own space. The data stays in the supervisor’s private Google Sheet.']
      ], function (f) { return h`<div class="feature">${App.icon(f[0])}<h3>${t(f[1])}</h3><p>${t(f[2])}</p></div>`; })}</section>
      <footer class="foot">${App.title()} · ${t('Open-source code; the data stays private.')}</footer>`;
  }

  document.addEventListener('input', function (e) {
    if (!e.target.hasAttribute || !e.target.hasAttribute('data-codeinput')) return;
    var v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    e.target.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v;
  });

  App.form('login', function (f, data) {
    var code = String(data.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 8) { App.toast(t('The code has 8 characters, for example K7M2-Q9TX.'), 'err'); return; }
    code = code.slice(0, 4) + '-' + code.slice(4);
    return App.api('login', { code: code }).then(function (d) {
      startTeam(code, d, !!data.remember);
      S.pendingActor = true;
      App.go('#/');
    });
  });

  function askActor(d) {
    if (App.local.get('actor.' + d.team.id, null) !== null || d.members.length < 2) return;
    App.modal({
      title: t('Who is using this device?'), noCancel: false, cancel: t('Skip'),
      body: h`<p>${t('Your name will be written next to what you do (it stays on this device).')}</p><div class="who-pick">${App.join(d.members, function (m) {
        return h`<button type="button" class="btn ghost" data-act="pick-actor" data-id="${m.id}">${App.avatar(m)}<span>${App.fullName(m)}</span></button>`;
      })}</div>`,
      onClose: function () { if (App.local.get('actor.' + d.team.id, null) === null) App.local.set('actor.' + d.team.id, ''); }
    });
  }
  App.act('pick-actor', function (el) {
    App.local.set('actor.' + S.D.team.id, el.dataset.id);
    App.setActor(S.D);
    App.closeModals();
    render();
  });

  // ---------------- sign-up
  function memberFields(i, m) {
    m = m || {};
    return h`<fieldset class="member-fs" data-i="${i}"><legend>${t('Student {n}', { n: i + 1 })}${i > 0 ? h` <button type="button" class="link danger-text" data-act="reg-del">${t('Remove')}</button>` : ''}</legend>
      <div class="form-grid">
        <label>${t('Last name')} <em>*</em><input name="lastName" required maxlength="60" value="${m.lastName || ''}" autocomplete="family-name"></label>
        <label>${t('First name')} <em>*</em><input name="firstName" required maxlength="60" value="${m.firstName || ''}" autocomplete="given-name"></label>
        <label>${t('Matricule')} <em>*</em><input name="matricule" required maxlength="30" value="${m.matricule || ''}" inputmode="numeric"></label>
        <label>${t('Email')}<input type="email" name="email" maxlength="120" value="${m.email || ''}" autocomplete="email"></label>
      </div></fieldset>`;
  }
  function registerPage() {
    var p = S.ping || {};
    if (p.registration_open === false) return h`<section class="card narrow"><h1>${t('Sign-up is closed')}</h1><p>${t('Contact your supervisor.')}</p><a href="#/" class="btn">${t('Back')}</a></section>`;
    var levels = p.levels || ['Licence', 'Master'];
    return h`<section class="card narrow reg">
      <a href="#/" class="back">${App.icon('left')}${t('Back')}</a>
      <h1>${t('Create a team account')}</h1>
      <p class="muted">${t('One account per team. All the members will use the same access code.')}</p>
      <form data-form="register" novalidate>
        <h2 class="step">1 · ${t('The project')}</h2>
        <div class="form-grid">
          <label class="span2">${t('Title of the project')} <em>*</em><input name="title" required minlength="3" maxlength="200"></label>
          <label>${t('Level')} <em>*</em><select name="level" required>${App.options(levels, levels[0])}</select></label>
          <label>${t('Specialty')}<select name="specialty"><option value="">—</option>${App.options(p.specialties || [], '')}</select></label>
          <label class="span2">${t('Short description and objectives')}<textarea name="description" rows="3" maxlength="3000"></textarea></label>
          <label class="span2">${t('Keywords and technologies')}<input name="keywords" maxlength="300" placeholder="${t('e.g. React, Firebase, machine learning')}"></label>
          <label>${t('Host organisation (if any)')}<input name="host" maxlength="200"></label>
          <label>${t('External supervisor (if any)')}<input name="extSupervisor" maxlength="200"></label>
        </div>
        <h2 class="step">2 · ${t('The members')} <small>(${t('maximum {n}', { n: p.max_members || 3 })})</small></h2>
        <div id="reg-members">${memberFields(0)}</div>
        <button type="button" class="btn ghost sm" data-act="reg-add" id="reg-add">${App.icon('plus')}<span>${t('Add a student')}</span></button>
        <h2 class="step">3 · ${t('Confirmation')}</h2>
        ${p.requires_key ? h`<label>${t('Sign-up key (given by your supervisor)')} <em>*</em><input name="regKey" required maxlength="40" autocomplete="off"></label>` : ''}
        <label class="check"><input type="checkbox" name="consent" required><span>${t('I agree that this information is stored for the follow-up of our PFE. Only our team and our supervisor can see it.')}</span></label>
        <div class="form-actions"><button class="btn primary" type="submit">${t('Create the account')}</button></div>
      </form></section>`;
  }
  App.act('reg-add', function () {
    var box = document.getElementById('reg-members'), n = box.querySelectorAll('.member-fs').length, max = (S.ping && S.ping.max_members) || 3;
    if (n >= max) { App.toast(t('A team has at most {n} students.', { n: max }), 'info'); return; }
    box.insertAdjacentHTML('beforeend', memberFields(n).s);
    box.lastElementChild.querySelector('input').focus();
    if (n + 1 >= max) document.getElementById('reg-add').hidden = true;
  });
  App.act('reg-del', function (el) {
    el.closest('.member-fs').remove();
    document.querySelectorAll('#reg-members .member-fs legend').forEach(function (l, i) { l.firstChild.textContent = t('Student {n}', { n: i + 1 }) + (i > 0 ? ' ' : ''); });
    document.getElementById('reg-add').hidden = false;
  });
  App.form('register', function (f) {
    var bad = f.querySelector(':invalid');
    if (bad) { App.toast(bad.name === 'consent' ? t('Please accept the storage of your information.') : t('Please fill in the required fields.'), 'err'); bad.focus(); return; }
    var val = function (n) { var el = f.querySelector('[name="' + n + '"]'); return el ? el.value : ''; };
    var members = Array.prototype.map.call(f.querySelectorAll('.member-fs'), function (fs) {
      var g = function (n) { return fs.querySelector('[name="' + n + '"]').value; };
      return { lastName: g('lastName'), firstName: g('firstName'), matricule: g('matricule'), email: g('email') };
    });
    var payload = {
      title: val('title'), level: val('level'), specialty: val('specialty'), description: val('description'), keywords: val('keywords'),
      host: val('host'), extSupervisor: val('extSupervisor'), members: members, regKey: val('regKey')
    };
    return App.api('register', payload).then(function (r) {
      S.newTeam = { code: r.code, teamId: r.teamId, status: r.status, mailed: r.mailed, title: payload.title };
      App.setHash('#/welcome');
    });
  });
  function welcomePage() {
    var n = S.newTeam;
    if (!n) return landing();
    return h`<section class="card narrow welcome">
      <h1>${App.icon('check')}${t('Your team account is created')}</h1>
      <p>${t('Team {id} · {t}', { id: n.teamId, t: n.title })}</p>
      ${codeCard(n.code)}
      <p class="banner info">${App.icon('key')}<span>${t('Write this code down now and share it with your team-mates. It is the only way to open your team space.')}${n.mailed ? ' ' + t('It was also sent to the email addresses you gave.') : ''}</span></p>
      ${n.status === 'pending' ? h`<p class="muted">${t('Your supervisor will validate the team. You can already start working.')}</p>` : ''}
      <label class="check"><input type="checkbox" id="saved-code"><span>${t('I wrote down the code')}</span></label>
      <div class="form-actions"><button type="button" class="btn primary" data-act="welcome-go">${t('Open our team space')}</button></div>
    </section>`;
  }
  function codeCard(code) {
    return h`<div class="code-card" id="code-card"><small>${t('Access code')}</small><b class="code">${code}</b>
      <div class="cc-actions"><button type="button" class="btn sm ghost" data-act="copy-code" data-code="${code}">${App.icon('copy')}<span>${t('Copy')}</span></button>
      <button type="button" class="btn sm ghost" data-act="print-code">${App.icon('print')}<span>${t('Print')}</span></button></div></div>`;
  }
  App.act('copy-code', function (el) { App.copy(el.dataset.code); });
  App.act('print-code', function () { document.body.classList.add('printing-code'); window.print(); setTimeout(function () { document.body.classList.remove('printing-code'); }, 500); });
  App.act('welcome-go', function () {
    var n = S.newTeam, cb = document.getElementById('saved-code');
    if (cb && !cb.checked) { App.toast(t('Please confirm that you wrote down the code.'), 'err'); cb.focus(); return; }
    return App.api('login', { code: n.code }).then(function (d) {
      startTeam(n.code, d, true);
      S.newTeam = null;
      S.pendingActor = true;
      App.go('#/');
    });
  });
  App.showCode = function (code, team, title, extra) {
    App.modal({
      title: title || t('Access code'), noCancel: true,
      body: h`<p>${team.id} · ${team.title}</p>${codeCard(code)}<p class="muted">${t('Give this code to the members of the team. The previous code no longer works.')}</p>${extra ? h`<p>${extra}</p>` : ''}`,
      onSubmit: function () { }, submit: t('Done')
    });
  };

  // ---------------- forgot the code
  function forgotPage() {
    var p = S.ping || {};
    return h`<section class="card narrow"><a href="#/" class="back">${App.icon('left')}${t('Back')}</a><h1>${t('Forgot the code?')}</h1>
      ${p.email_codes === false ? h`<p>${t('Ask your supervisor: she can give your team a new code.')}</p>` : h`
      <p>${t('Type the email address of one of the members. If it belongs to a team, a NEW code is sent to all the members of that team (the old code stops working).')}</p>
      <form data-form="forgot" class="form-grid"><label class="span2">${t('Email')}<input type="email" name="email" required autocomplete="email"></label>
        <div class="span2 form-actions"><button class="btn primary" type="submit">${t('Send me a new code')}</button></div></form>
      <p class="muted small">${t('No email received after a few minutes? Check the spam folder, or ask your supervisor.')}</p>`}</section>`;
  }
  App.form('forgot', function (f, data) {
    return App.api('forgot', { email: data.email }).then(function () {
      App.toast(t('If this email belongs to a team, a new code has been sent.'));
      f.reset();
    });
  });

  // ---------------- supervisor login
  function adminLoginPage() {
    return h`<section class="card narrow auth"><a href="#/" class="back">${App.icon('left')}${t('Back')}</a><h1>${App.icon('shield')}${t('Supervisor space')}</h1>
      <form data-form="admin-login" class="form-grid"><label class="span2">${t('Password')}<input type="password" name="password" required autocomplete="current-password" autofocus></label>
        <div class="span2 form-actions"><button class="btn primary" type="submit">${t('Log in')}</button></div></form></section>`;
  }
  App.form('admin-login', function (f, data) {
    return App.api('admin.login', { password: data.password }).then(function (r) {
      S.auth = { role: 'admin', token: r.token };
      App.session.set('token', r.token);
      App.go('#/a');
    });
  });

  // ------------------------------------------------------------ start-up
  function boot() {
    var theme = App.local.get('theme', null);
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    if (!App.lang) App.lang = /^fr/i.test(navigator.language || '') ? 'fr' : 'en';
    var ready = App.demo ? App.demo.ready : Promise.resolve();
    ready.then(function () {
      if (!App.configured() && !App.demo) { render(); return; }
      var code = App.local.get('code', null) || App.session.get('code', null);
      var token = App.session.get('token', null);
      var ping = App.api('ping').then(function (p) {
        S.ping = p;
        if (!App.local.get('lang', null) && p.default_language) App.lang = p.default_language;
      }, function (e) { App.fail(e); });
      var restore;
      if (code) {
        restore = App.api('login', { code: code }).then(function (d) {
          startTeam(code, d, !!App.local.get('code', null));
        }, function (e) { App.local.del('code'); App.session.del('code'); if (e.code !== 'BAD_CODE') App.fail(e); });
      } else if (token) {
        S.auth = { role: 'admin', token: token };
        restore = App.loadOverview().catch(function () { S.auth = null; App.session.del('token'); });
      } else restore = Promise.resolve();
      Promise.all([ping, restore]).then(render, render);
    });
    document.getElementById('app').innerHTML = h`<div class="loading boot">${logo()}<span>${t('Loading…')}</span></div>`.s;
  }
  App.render = render;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
