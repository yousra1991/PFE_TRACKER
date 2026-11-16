/* PFE Tracker — the supervisor space. */
(function () {
  'use strict';
  var App = window.App, h = App.html, t = App.t, S = App.S;
  var P = App.Pages = App.Pages || {};

  var TEAM_STATUS = [['pending', 'Waiting for validation'], ['active', 'Active'], ['suspended', 'Suspended'], ['archived', 'Archived']];
  var HEALTH = { red: 'Needs attention', orange: 'To watch', green: 'On track', grey: 'Not active' };
  var ALERTS = {
    pending: ['clock', 'Waiting for validation', 'info'],
    help: ['help', 'Help requested', 'critical'],
    noReport: ['alert', 'No report last week', 'warning'],
    overdue: ['clock', '{n} overdue task(s)', 'serious'],
    lateMilestone: ['flag', '{n} late milestone(s)', 'critical'],
    inactive: ['alert', 'No activity for {n} days', 'serious'],
    lowConfidence: ['target', 'Low confidence ({n}/5)', 'serious'],
    unread: ['chat', '{n} unread message(s)', 'info'],
    toReview: ['journal', '{n} report(s) to review', 'info']
  };
  App.TEAM_STATUS = TEAM_STATUS;

  function alertChip(code, s) {
    var a = ALERTS[code];
    if (!a) return '';
    var n = { overdue: s.overdue, lateMilestone: s.lateMilestones, inactive: s.daysIdle, lowConfidence: s.confidence, unread: s.unread, toReview: s.toReview }[code];
    return h`<span class="alert-chip a-${a[2]}">${App.icon(a[0])}${t(a[1], { n: n })}</span>`;
  }
  function statusChip(st) { return h`<span class="chip ts-${st}">${App.label(TEAM_STATUS, st)}</span>`; }
  function healthDot(hl) { return h`<span class="health h-${hl}" title="${t(HEALTH[hl])}"><i></i><span class="sr">${t(HEALTH[hl])}</span></span>`; }
  App.teamStatusChip = statusChip;

  // ------------------------------------------------------------ data
  App.loadOverview = function (force) {
    if (S.A.overview && !force && !S.A.stale && Date.now() - S.A.at < 60000) return Promise.resolve(S.A.overview);
    S.A.stale = false;
    return App.api('admin.overview').then(function (o) { S.A.overview = o; S.A.at = Date.now(); return o; });
  };
  App.loadTeam = function (id, force) {
    var c = S.A.teams[id];
    if (c && !force && Date.now() - c.at < 60000) return Promise.resolve(c.data);
    return App.api('admin.team', { teamId: id }).then(function (d) { S.A.teams[id] = { data: d, at: Date.now() }; return d; });
  };
  function teamInOverview(id) { return S.A.overview ? App.byId(S.A.overview.teams, id) : null; }
  function patchOverviewTeam(team) {
    var o = teamInOverview(team.id);
    if (o) Object.keys(team).forEach(function (k) { o[k] = team[k]; });
  }

  // ------------------------------------------------------------ overview
  var F = App.local.get('aFilter', { q: '', level: '', status: 'live', alerts: false });
  P.aOverview = function () {
    var o = S.A.overview, teams = o.teams;
    var live = teams.filter(function (x) { return x.status === 'active' || x.status === 'pending'; });
    var active = teams.filter(function (x) { return x.status === 'active'; });
    var pending = teams.filter(function (x) { return x.status === 'pending'; });
    var sum = function (k) { return live.reduce(function (s, x) { return s + (Number(x.summary[k]) || 0); }, 0); };
    var lastSent = active.filter(function (x) { return x.summary.lastWeek === 'submitted' || x.summary.lastWeek === 'reviewed'; }).length;
    var thisSent = active.filter(function (x) { return x.summary.thisWeek === 'submitted' || x.summary.thisWeek === 'reviewed'; }).length;
    var help = live.filter(function (x) { return x.summary.help; }).length;
    var q = (F.q || '').toLowerCase();
    var list = teams.filter(function (x) {
      if (F.status === 'live' && !(x.status === 'active' || x.status === 'pending')) return false;
      if (F.status && F.status !== 'live' && x.status !== F.status) return false;
      if (F.level && x.level !== F.level) return false;
      if (F.alerts && !x.summary.alerts.filter(function (a) { return a !== 'pending'; }).length) return false;
      if (q && (x.id + ' ' + x.title + ' ' + x.membersText + ' ' + x.keywords).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var rank = { red: 0, orange: 1, green: 2, grey: 3 };
    list.sort(function (a, b) {
      return (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || rank[a.summary.health] - rank[b.summary.health] || b.summary.alerts.length - a.summary.alerts.length || (a.id < b.id ? -1 : 1);
    });
    var levels = (o.config.levels || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var tile = function (value, lab, href, cls) { return h`<a class="tile ${cls || ''}" href="${href || '#/a'}"><b>${value}</b><span>${lab}</span></a>`; };
    return h`${App.pageHead(t('Overview'), t('{a} active team(s) · {b} waiting for validation · week of {d}', { a: active.length, b: pending.length, d: App.weekLabel(App.curWeek()) }),
      h`${App.btn('a-refresh', t('Refresh'), 'refresh', 'ghost')}${App.btn('a-export', t('Export CSV'), 'download', 'ghost')}`)}
      <div class="tiles">
        ${tile(lastSent + '/' + active.length, t('reports for last week'), '#/a/week/' + App.addDays(App.curWeek(), -7))}
        ${tile(thisSent + '/' + active.length, t('reports this week'), '#/a/week')}
        ${tile(help, t('help requests'), '#/a/week', help ? 'hot' : '')}
        ${tile(sum('toReview'), t('reports to review'), '#/a/week', sum('toReview') ? 'warm' : '')}
        ${tile(sum('unread'), t('unread messages'), '#/a/messages', sum('unread') ? 'warm' : '')}
        ${tile(sum('overdue'), t('overdue tasks'), '#/a')}
      </div>
      ${invite(o.config)}
      ${pending.length ? h`<section class="card pending-box"><header class="card-head"><h2>${App.icon('clock')}${t('Teams waiting for your validation')} <span class="count">${pending.length}</span></h2></header>
        ${App.join(pending, function (x) {
          return h`<div class="pending-row"><div><b>${x.id}</b> · ${x.title}<div class="muted small">${x.level}${x.specialty ? ' · ' + x.specialty : ''} · ${App.join(x.members, function (m, i) { return h`${i ? ', ' : ''}${App.fullName(m)} (${m.matricule})`; })} · ${t('signed up {d}', { d: App.ago(x.createdAt) })}</div></div>
            <div class="actions"><a class="btn ghost sm" href="#/a/t/${x.id}/team">${t('Details')}</a>
            <button type="button" class="btn sm ghost danger-text" data-act="adm-status" data-id="${x.id}" data-status="suspended">${t('Refuse')}</button>
            <button type="button" class="btn sm primary" data-act="adm-status" data-id="${x.id}" data-status="active">${App.icon('check')}<span>${t('Validate')}</span></button></div></div>`;
        })}</section>` : ''}
      <div class="toolbar">
        <input type="search" data-chg="afilter" data-k="q" value="${F.q}" placeholder="${t('Search a team, a student, a keyword…')}" aria-label="${t('Search')}">
        <select data-chg="afilter" data-k="status" aria-label="${t('Status')}">${App.join([['live', t('Active and waiting')], ['', t('All teams')]].concat(TEAM_STATUS.map(function (s) { return [s[0], t(s[1])]; })), function (s) { return App.opt(s[0], s[1], F.status); })}</select>
        <select data-chg="afilter" data-k="level" aria-label="${t('Level')}"><option value="">${t('All levels')}</option>${App.options(levels, F.level)}</select>
        <label class="check"><input type="checkbox" data-chg="afilter" data-k="alerts" ${App.checked(F.alerts)}><span>${t('Only teams with alerts')}</span></label>
      </div>
      ${list.length ? h`<div class="team-list">${App.join(list, teamRow)}</div>` : App.empty(teams.length ? t('No team matches these filters.') : t('No team yet. Give the address of the website to your students so that they create their team account.'))}`;
  };

  function invite(c) {
    if (!/^(yes|oui|true|1)$/i.test(c.registration_open || '')) return '';
    var url = c.site_url || (location.origin + location.pathname);
    var key = String(c.registration_key || '').trim();
    var text = t('Create your PFE team account on {u}', { u: url }) + (key ? ' — ' + t('sign-up key: {k}', { k: key }) : '');
    return h`<section class="card invite"><div><b>${App.icon('megaphone')}${t('Invite your students')}</b>
      <p class="muted small">${url}${key ? h` · ${t('Sign-up key')}: <b class="kbd">${key}</b>` : h` · ${t('No sign-up key: anyone with the link can sign up')}`}</p></div>
      <button type="button" class="btn sm" data-act="copy-invite" data-text="${text}">${App.icon('copy')}<span>${t('Copy the invitation')}</span></button></section>`;
  }
  App.act('copy-invite', function (el) { App.copy(el.dataset.text); });

  function teamRow(x) {
    var s = x.summary;
    var wk = function (st, past) {
      if (past && (st === 'none' || st === 'draft')) return h`<span class="rep rep-missing">${t('Missing')}</span>`;
      return h`<span class="rep rep-${st}">${App.reportLabel(st)}</span>`;
    };
    return h`<article class="team-row h-${s.health}" data-act="open-team" data-id="${x.id}" tabindex="0">
      ${healthDot(s.health)}
      <div class="tr-main"><div class="tr-title"><b>${x.id}</b><span>${x.title}</span>${x.status !== 'active' ? statusChip(x.status) : ''}</div>
        <div class="tr-sub">${x.level}${x.specialty ? ' · ' + x.specialty : ''} · ${x.membersText}</div>
        ${s.alerts.length ? h`<div class="alerts">${App.join(s.alerts.filter(function (a) { return a !== 'pending'; }), function (a) { return alertChip(a, s); })}</div>` : ''}</div>
      <div class="tr-prog">${App.Charts.meter(s.progress, s.health === 'red' ? 'late' : '')}<small>${s.progress}% · ${t('{a}/{b} tasks', { a: s.tasksDone, b: s.tasksTotal })}</small></div>
      <div class="tr-weeks"><small>${t('Last week')}</small>${wk(s.lastWeek, x.status === 'active')}<small>${t('This week')}</small>${wk(s.thisWeek)}</div>
      <div class="tr-last"><small>${t('Last activity')}</small><span>${s.lastActivity ? App.ago(s.lastActivity) : '—'}</span></div>
    </article>`;
  }

  App.act('open-team', function (el) { App.setHash('#/a/t/' + el.dataset.id); });
  App.act('a-refresh', function () { return App.loadOverview(true).then(function () { App.toast(t('Updated')); App.refresh(); }); });
  App.chg('afilter', function (el) { F[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; App.local.set('aFilter', F); App.refresh(); });
  App.act('a-export', function () {
    var rows = [['Team', 'Status', 'Level', 'Specialty', 'Title', 'Members', 'Matricules', 'Emails', 'Progress %', 'Tasks done', 'Tasks', 'Overdue', 'Late milestones', 'Last week', 'This week', 'Help', 'Confidence', 'Last activity', 'Alerts']];
    S.A.overview.teams.forEach(function (x) {
      var s = x.summary;
      rows.push([x.id, x.status, x.level, x.specialty, x.title, x.membersText, x.members.map(function (m) { return m.matricule; }).join(' '),
        x.members.map(function (m) { return m.email; }).filter(Boolean).join(' '), s.progress, s.tasksDone, s.tasksTotal, s.overdue, s.lateMilestones,
        s.lastWeek, s.thisWeek, s.help ? 'yes' : '', s.confidence || '', s.lastActivity, s.alerts.join(', ')]);
    });
    App.download('pfe-teams-' + App.today() + '.csv', App.csv(rows));
  });

  // ------------------------------------------------------------ status, code, note, delete
  App.act('adm-status', function (el) {
    var id = el.dataset.id, st = el.dataset.status;
    var go = function () {
      return App.api('admin.teamUpdate', { teamId: id, data: { status: st } }).then(function (team) {
        patchOverviewTeam(team);
        if (S.A.teams[id]) S.A.teams[id].data.team = team;
        App.toast({ active: t('Team validated'), suspended: t('Team suspended'), archived: t('Team archived'), pending: t('Team set back to waiting') }[st]);
        return App.loadOverview(true).then(function () { App.refresh(); });
      });
    };
    if (st === 'suspended') return App.confirm(t('Suspend team {id}? Its members will not be able to log in any more (you can reactivate it later).', { id: id }), { danger: true, ok: t('Suspend') }).then(function (ok) { if (ok) return go(); });
    if (st === 'archived') return App.confirm(t('Archive team {id}? The team keeps read-only access (end of the year, defence done).', { id: id }), { ok: t('Archive') }).then(function (ok) { if (ok) return go(); });
    return go();
  });
  App.act('adm-code', function (el) {
    var id = el.dataset.id, d = S.A.teams[id].data;
    var hasEmail = d.members.some(function (m) { return m.email; }) && d.config.email_codes;
    return App.confirm(t('Create a new access code for team {id}? The current code stops working immediately.', { id: id }), {
      ok: t('Create a new code'), extra: hasEmail ? h`<label class="check"><input type="checkbox" name="email" checked><span>${t('Also send it by email to the members')}</span></label>` : ''
    }).then(function (r) {
      if (!r) return;
      return App.api('admin.resetCode', { teamId: id, email: !!(r && r.email) }).then(function (res) {
        App.showCode(res.code, d.team, t('New access code of team {id}', { id: id }), res.mailed ? t('The code was also sent by email to the members.') : '');
      });
    });
  });
  App.act('adm-note', function (el) {
    var id = el.dataset.id, d = S.A.teams[id].data;
    App.modal({
      title: t('Private note — {id}', { id: id }), wide: true,
      body: h`<p class="muted small">${App.icon('lock')}${t('Only you can read this note. It is never shown to the students.')}</p><textarea name="note" rows="10" maxlength="20000">${d.adminNote || ''}</textarea>`,
      onSubmit: function (data) {
        return App.api('admin.note', { teamId: id, note: data.note }).then(function (r) { d.adminNote = r.note; App.toast(t('Note saved')); App.refresh(); });
      }
    });
  });
  App.act('adm-delete', function (el) {
    var id = el.dataset.id;
    return App.confirm(h`${t('Delete team {id} and ALL its data (tasks, reports, messages…)? This cannot be undone. To keep the history, archive the team instead.', { id: id })}`, {
      danger: true, ok: t('Delete for ever'), extra: h`<label>${t('Type {id} to confirm', { id: id })}<input name="confirm" autocomplete="off" required></label>`,
      check: function (data) { return String(data.confirm || '').trim().toUpperCase() === id; }
    }).then(function (r) {
      if (!r) return;
      return App.api('admin.deleteTeam', { teamId: id, confirm: id }).then(function () {
        delete S.A.teams[id];
        App.toast(t('Team deleted'));
        return App.loadOverview(true).then(function () { App.setHash('#/a'); });
      });
    });
  });
  App.chg('adm-defense', function (el) {
    var id = el.dataset.id;
    return App.api('admin.teamUpdate', { teamId: id, data: { defenseDate: el.value } }).then(function (team) {
      S.A.teams[id].data.team = team; patchOverviewTeam(team); App.toast(t('Saved')); App.refresh();
    });
  });

  // header shown above the team pages when the supervisor opens a team
  App.adminBar = function () {
    var d = S.M.D, team = d.team, s = (teamInOverview(team.id) || {}).summary;
    var st = team.status;
    return h`<section class="admin-bar">
      <div class="ab-main"><a href="#/a" class="back">${App.icon('left')}${t('All teams')}</a>
        <div class="ab-title"><b>${team.id}</b> ${statusChip(st)}${s ? healthDot(s.health) : ''}</div></div>
      <div class="ab-actions">
        ${st !== 'active' ? h`<button type="button" class="btn sm primary" data-act="adm-status" data-id="${team.id}" data-status="active">${App.icon('check')}<span>${st === 'pending' ? t('Validate') : t('Reactivate')}</span></button>` : ''}
        ${st === 'active' || st === 'pending' ? h`<button type="button" class="btn sm ghost" data-act="adm-status" data-id="${team.id}" data-status="suspended">${t('Suspend')}</button>` : ''}
        ${st !== 'archived' ? h`<button type="button" class="btn sm ghost" data-act="adm-status" data-id="${team.id}" data-status="archived">${App.icon('archive')}<span>${t('Archive')}</span></button>` : ''}
        <button type="button" class="btn sm ghost" data-act="adm-code" data-id="${team.id}">${App.icon('key')}<span>${t('New code')}</span></button>
        <button type="button" class="btn sm ghost" data-act="adm-note" data-id="${team.id}">${App.icon('lock')}<span>${t('Private note')}${d.adminNote ? ' •' : ''}</span></button>
        <label class="ab-date">${t('Defence')}<input type="date" data-chg="adm-defense" data-id="${team.id}" value="${team.defenseDate || ''}"></label>
        <button type="button" class="icon-btn sm danger-text" data-act="adm-delete" data-id="${team.id}" aria-label="${t('Delete the team')}" title="${t('Delete the team')}">${App.icon('trash')}</button>
      </div>
      ${s && s.alerts.filter(function (a) { return a !== 'pending'; }).length ? h`<div class="alerts">${App.join(s.alerts.filter(function (a) { return a !== 'pending'; }), function (a) { return alertChip(a, s); })}</div>` : ''}
    </section>`;
  };

  // ------------------------------------------------------------ weekly review of all teams
  var WF = 'all';
  App.loadAdminWeek = function (w, force) {
    if (S.A.week[w] && !force && Date.now() - S.A.week[w].at < 60000) return Promise.resolve(S.A.week[w]);
    return App.api('admin.week', { week: w }).then(function (r) { r.at = Date.now(); S.A.week[w] = r; return r; });
  };
  P.aWeek = function (prm) {
    var w = prm.w, data = S.A.week[w], cw = App.curWeek();
    var items = data.teams.slice().sort(function (a, b) { return a.team.id < b.team.id ? -1 : 1; });
    var counts = {
      all: items.length,
      toReview: items.filter(function (x) { return x.week && x.week.status === 'submitted'; }).length,
      reviewed: items.filter(function (x) { return x.week && x.week.status === 'reviewed'; }).length,
      missing: items.filter(function (x) { return !x.week || x.week.status === 'draft'; }).length,
      help: items.filter(function (x) { return x.week && x.week.helpNeeded; }).length
    };
    var shown = items.filter(function (x) {
      if (WF === 'toReview') return x.week && x.week.status === 'submitted';
      if (WF === 'reviewed') return x.week && x.week.status === 'reviewed';
      if (WF === 'missing') return !x.week || x.week.status === 'draft';
      if (WF === 'help') return x.week && x.week.helpNeeded;
      return true;
    });
    var chip = function (k, l) { return h`<button type="button" class="chip ${WF === k ? 'on' : ''}" data-act="wfilter" data-v="${k}">${l} · ${counts[k]}</button>`; };
    return h`<div class="week-nav">
        <a class="icon-btn" href="#/a/week/${App.addDays(w, -7)}" aria-label="${t('Previous week')}">${App.icon('left')}</a>
        <div class="wn-mid"><h1>${t('Weekly review')}</h1><p class="sub">${t('Week of {d}', { d: App.weekLabel(w) })}${App.pfeWeek(w) ? ' · ' + t('PFE week {n}', { n: App.pfeWeek(w) }) : ''}</p></div>
        <a class="icon-btn" href="#/a/week/${App.addDays(w, 7)}" aria-label="${t('Next week')}">${App.icon('right')}</a>
        ${w !== cw ? h`<a class="btn ghost sm" href="#/a/week">${t('This week')}</a>` : ''}
      </div>
      <div class="chips-filter">${chip('all', t('All'))}${chip('toReview', t('To review'))}${chip('help', t('Help requested'))}${chip('missing', t('No report'))}${chip('reviewed', t('Reviewed'))}</div>
      ${shown.length ? App.join(shown, function (x) { return weekCard(x, w); }) : App.empty(t('Nothing here for this week.'))}`;
  };
  App.act('wfilter', function (el) { WF = el.dataset.v; App.refresh(); });

  function weekCard(x, w) {
    var r = x.week, team = x.team;
    var name = function (id) { var m = App.byId(x.members, id); return m ? App.fullName(m) : t('Whole team'); };
    var snap = r && r.snapshot && r.snapshot.length ? r.snapshot : [];
    var live = x.tasks;
    var rows = snap.slice();
    live.forEach(function (tk) { if (!rows.some(function (s) { return s.id === tk.id; })) rows.push(tk); });
    rows = rows.map(function (s) { var l = App.byId(live, s.id); return l ? Object.assign({}, s, { status: l.status, reason: l.reason || s.reason, obstacle: l.obstacle || s.obstacle }) : s; });
    var done = rows.filter(function (s) { return s.status === 'done'; }).length;
    var hrs = r ? Object.keys(r.hours || {}).reduce(function (s, k) { return s + (Number(r.hours[k]) || 0); }, 0) : 0;
    return h`<section class="card wr" data-team="${team.id}">
      <header class="card-head"><h2><a href="#/a/t/${team.id}/week/${w}">${team.id} · ${team.title}</a></h2><span class="rep rep-${r ? r.status : 'none'}">${App.reportLabel(r ? r.status : 'none')}</span></header>
      <p class="muted small">${team.membersText} · ${team.level}${r && r.submittedAt ? ' · ' + t('submitted {d}', { d: App.fmtTime(r.submittedAt) }) : ''}</p>
      ${r && r.helpNeeded ? h`<p class="help-text">${App.icon('help')}<b>${t('Help requested')}:</b> ${r.helpText || '—'}</p>` : ''}
      <div class="wr-grid">
        <div>${r && r.goal ? h`<p class="goal">${App.icon('target')}<span>${r.goal}</span></p>` : ''}
          ${r && r.done ? h`<h3 class="mini-title">${t('What we did')}</h3><p>${App.nl2br(r.done)}</p>` : h`<p class="muted">${t('No report yet.')}</p>`}
          ${r && r.difficulties ? h`<h3 class="mini-title">${t('Difficulties')}</h3><p>${App.nl2br(r.difficulties)}</p>` : ''}
          ${r && r.nextPlan ? h`<h3 class="mini-title">${t('Plan for next week')}</h3><p>${App.nl2br(r.nextPlan)}</p>` : ''}
          ${r && r.remarks ? h`<h3 class="mini-title">${t('Remarks')}</h3><p>${App.nl2br(r.remarks)}</p>` : ''}
          <div class="hist-stats">${r && r.confidence ? h`<span>${App.icon('target')}${t('Confidence')}: ${r.confidence}/5</span>` : ''}${hrs ? h`<span>${App.icon('clock')}${t('{n} h worked', { n: Math.round(hrs * 10) / 10 })}</span>` : ''}</div></div>
        <div><h3 class="mini-title">${t('Planned tasks')} · ${done}/${rows.length}</h3>
          ${rows.length ? h`<ul class="wr-tasks">${App.join(rows, function (s) {
            return h`<li class="${s.status === 'done' ? 'is-done' : ''}"><span class="chip st-${s.status}">${App.label(App.V.STATUS, s.status)}</span><span>${s.title} <small class="muted">${name(s.assignee)}</small>
              ${s.status !== 'done' && (s.obstacle || s.reason) ? h`<br><small class="why-text">${s.obstacle ? App.tv(s.obstacle) + ' — ' : ''}${s.reason || ''}</small>` : ''}</span></li>`;
          })}</ul>` : h`<p class="muted">${t('No task planned.')}</p>`}</div>
      </div>
      ${App.reviewBox(w, r, team.id)}
    </section>`;
  }

  // ------------------------------------------------------------ messages of all teams
  P.aMessages = function () {
    var teams = S.A.overview.teams.filter(function (x) { return x.summary.messages || x.status === 'active'; });
    teams.sort(function (a, b) {
      return (b.summary.unread - a.summary.unread) || ((b.summary.lastMessage ? b.summary.lastMessage.createdAt : '') > (a.summary.lastMessage ? a.summary.lastMessage.createdAt : '') ? 1 : -1);
    });
    return h`${App.pageHead(t('Messages'), t('Conversations with the teams. Teams with unread messages come first.'))}
      ${teams.length ? h`<div class="inbox">${App.join(teams, function (x) {
        var lm = x.summary.lastMessage;
        return h`<a class="inbox-row ${x.summary.unread ? 'unread' : ''}" href="#/a/t/${x.id}/messages">
          <span class="ib-team"><b>${x.id}</b> ${x.title}</span>
          <span class="ib-last">${lm ? h`<b>${lm.sender === 'admin' ? t('You') : lm.author}:</b> ${lm.body}` : h`<i>${t('No message yet')}</i>`}</span>
          <span class="ib-meta">${lm ? App.ago(lm.createdAt) : ''}${x.summary.unread ? h`<span class="badge">${x.summary.unread}</span>` : ''}</span></a>`;
      })}</div>` : App.empty(t('No team yet.'))}`;
  };

  // ------------------------------------------------------------ announcements
  P.aNews = function () {
    var list = S.A.overview.announcements.slice().sort(function (a, b) { return (b.pinned - a.pinned) || (a.createdAt < b.createdAt ? 1 : -1); });
    return h`${App.pageHead(t('Announcements'), t('Information shown on the dashboard of every team (or of one level only).'), App.btn('an-new', t('New announcement'), 'plus', 'primary'))}
      ${list.length ? App.join(list, function (a) {
        return h`<section class="card ann"><header class="card-head"><h2>${a.pinned ? App.icon('pin') : ''}${a.title}</h2>
          <span class="chip muted">${a.target === 'all' || !a.target ? t('All teams') : a.target}</span>
          <div class="actions"><button type="button" class="icon-btn sm" data-act="an-edit" data-id="${a.id}" aria-label="${t('Edit')}">${App.icon('edit')}</button></div></header>
          <p>${App.linkify(a.body)}</p><small class="muted">${App.fmtTime(a.createdAt)}</small></section>`;
      }) : App.empty(t('No announcement yet.'))}`;
  };
  App.act('an-new', function () { openAnn({ target: 'all' }); });
  App.act('an-edit', function (el) { openAnn(App.byId(S.A.overview.announcements, el.dataset.id)); });
  function openAnn(a) {
    var isNew = !a.id;
    var levels = (S.A.overview.config.levels || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    App.modal({
      title: isNew ? t('New announcement') : t('Edit the announcement'), wide: true,
      body: h`<div class="form-grid"><label class="span2">${t('Title')} <em>*</em><input name="title" required maxlength="200" value="${a.title || ''}"></label>
        <label class="span2">${t('Text')}<textarea name="body" rows="6" maxlength="5000">${a.body || ''}</textarea></label>
        <label>${t('For')}<select name="target">${App.opt('all', t('All teams'), a.target)}${App.join(levels, function (l) { return App.opt(l, l, a.target); })}</select></label>
        <label class="check"><input type="checkbox" name="pinned" ${App.checked(a.pinned)}><span>${t('Pin at the top')}</span></label></div>`,
      left: isNew ? '' : h`<button type="button" class="btn ghost danger-text" data-act="an-del" data-id="${a.id}">${App.icon('trash')}<span>${t('Delete')}</span></button>`,
      onSubmit: function (data) {
        if (!isNew) data.id = a.id;
        return App.api('admin.announce', { record: data }).then(function (rec) { App.upsert(S.A.overview.announcements, rec); App.toast(t('Announcement published')); App.refresh(); });
      }
    });
  }
  App.act('an-del', function (el) {
    return App.confirm(t('Delete this announcement?'), { danger: true, ok: t('Delete') }).then(function (ok) {
      if (!ok) return;
      return App.api('admin.announceDel', { id: el.dataset.id }).then(function () { App.remove(S.A.overview.announcements, el.dataset.id); App.closeModals(); App.refresh(); });
    });
  });

  // ------------------------------------------------------------ settings
  var GROUPS = [
    ['General', [['app_title', 'Name of the platform'], ['institution', 'Institution'], ['academic_year', 'Academic year'], ['supervisor_name', 'Your name (as students see it)'],
      ['site_url', 'Address of the website (for the emails)'], ['default_language', 'Language for new visitors', [['en', 'English'], ['fr', 'Français']]]]],
    ['Sign-up', [['registration_open', 'Teams can create an account', 'yn'], ['registration_key', 'Sign-up key (empty = no key)'], ['require_approval', 'New teams wait for your validation', 'yn'],
      ['max_members', 'Maximum students per team', 'num'], ['levels', 'Levels (comma-separated)'], ['specialties', 'Specialties (comma-separated)']]],
    ['Calendar', [['week_start', 'First day of the week', [['sunday', 'Sunday'], ['monday', 'Monday']]], ['start_date', 'Start of the PFE', 'date'], ['deposit_date', 'Thesis deposit deadline', 'date'],
      ['defense_date', 'Defence date', 'date'], ['inactive_days', 'Flag a team after this many days without activity', 'num']]],
    ['Lists', [['milestones_licence', 'Default milestones — Licence (one per line)', 'text'], ['milestones_master', 'Default milestones — Master (one per line)', 'text'],
      ['task_categories', 'Task categories (one per line)', 'text'], ['obstacle_categories', 'Obstacle types (one per line)', 'text']]],
    ['Emails', [['email_codes', 'Email the access code to the members', 'yn'], ['notify_new_team', 'Email me when a team signs up', 'yn'], ['notify_help', 'Email me when a team asks for help', 'yn'],
      ['notify_messages', 'Email me for every team message', 'yn'], ['admin_email', 'My email for notifications (empty = owner of the sheet)']]]
  ];
  P.aSettings = function () {
    var c = S.A.overview.config;
    var field = function (f) {
      var k = f[0], v = c[k] === undefined ? '' : c[k], kind = f[2];
      if (Array.isArray(kind)) return h`<label>${t(f[1])}<select name="${k}">${App.join(kind, function (o) { return App.opt(o[0], t(o[1]), v); })}</select></label>`;
      if (kind === 'yn') return h`<label class="check"><input type="checkbox" name="${k}" ${App.checked(/^(yes|oui|true|1)$/i.test(v))}><span>${t(f[1])}</span></label>`;
      if (kind === 'text') return h`<label class="span2">${t(f[1])}<textarea name="${k}" rows="5">${v}</textarea></label>`;
      if (kind === 'date') return h`<label>${t(f[1])}<input type="date" name="${k}" value="${v}"></label>`;
      if (kind === 'num') return h`<label>${t(f[1])}<input type="number" name="${k}" min="1" max="99" value="${v}"></label>`;
      return h`<label>${t(f[1])}<input name="${k}" value="${v}" maxlength="300"></label>`;
    };
    return h`${App.pageHead(t('Settings'), t('These settings are saved in the Config tab of your Google Sheet.'))}
      <form data-form="settings">${App.join(GROUPS, function (g) {
        return h`<section class="card"><header class="card-head"><h2>${t(g[0])}</h2>${g[0] === 'Emails' && S.A.overview.emailQuota !== null && S.A.overview.emailQuota !== undefined ? h`<small class="muted">${t('Emails left today: {n}', { n: S.A.overview.emailQuota })}</small>` : ''}</header>
          <div class="form-grid">${App.join(g[1], field)}</div></section>`;
      })}
      <div class="form-actions sticky"><button class="btn primary" type="submit">${t('Save the settings')}</button></div></form>
      <section class="card"><header class="card-head"><h2>${App.icon('lock')}${t('Teacher password')}</h2></header>
        <form data-form="password" class="form-grid">
          <label>${t('Current password')}<input type="password" name="current" required autocomplete="current-password"></label>
          <label>${t('New password (8 characters or more)')}<input type="password" name="next" required minlength="8" autocomplete="new-password"></label>
          <div class="span2 form-actions"><button class="btn" type="submit">${t('Change the password')}</button></div></form></section>
      <section class="card"><header class="card-head"><h2>${App.icon('shield')}${t('Where is the data?')}</h2></header>
        <p>${t('All the data is in your private Google Sheet. The website only shows what the Apps Script returns: each team sees its own data, and only you see everything. You can open the sheet at any time to read, correct or back up the data (File → Make a copy).')}</p>
        <p class="muted small">${t('Version {v}', { v: S.A.overview.version })}</p></section>`;
  };
  App.form('settings', function (f, data) {
    var values = {};
    GROUPS.forEach(function (g) { g[1].forEach(function (fl) { var k = fl[0]; values[k] = fl[2] === 'yn' ? (data[k] ? 'yes' : 'no') : data[k]; }); });
    return App.api('admin.config', { values: values }).then(function (c) {
      S.A.overview.config = c;
      App.lang = App.local.get('lang', null) || App.lang;
      return App.api('ping').then(function (p) { S.ping = p; App.toast(t('Settings saved')); App.refresh(); });
    });
  });
  App.form('password', function (f, data) {
    return App.api('admin.password', { current: data.current, next: data.next }).then(function () { f.reset(); App.toast(t('Password changed')); });
  });
})();

