/* PFE Tracker — the team space (also used by the teacher when she opens a team). */
(function () {
  'use strict';
  var App = window.App, h = App.html, t = App.t, S = App.S;
  var P = App.Pages = App.Pages || {};

  // ------------------------------------------------------------ vocabularies
  var STATUS = [['todo', 'To do'], ['doing', 'In progress'], ['review', 'To review'], ['blocked', 'Blocked'], ['done', 'Done']];
  var PRIORITY = [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
  var QUAD = {
    q1: { title: 'Do now', sub: 'Urgent and important' },
    q2: { title: 'Plan it', sub: 'Important, not urgent' },
    q3: { title: 'Delegate or do quickly', sub: 'Urgent, less important' },
    q4: { title: 'Later or drop', sub: 'Neither urgent nor important' }
  };
  var QUAD_PRIORITY = { q1: 'high', q2: 'medium', q3: 'medium', q4: 'low' };
  var MS_STATUS = [['todo', 'Not started'], ['doing', 'In progress'], ['done', 'Done']];
  var MEETING_TYPES = [['supervisor', 'With the supervisor'], ['team', 'Team meeting'], ['host', 'With the host organisation'], ['other', 'Other']];
  var NOTE_TYPES = [['note', 'Note'], ['idea', 'Idea'], ['remark', 'Remark'], ['problem', 'Problem'], ['risk', 'Risk']];
  var REF_STATUS = [['toread', 'To read'], ['reading', 'Reading'], ['read', 'Read'], ['summarized', 'Summarised']];
  var DEL_STATUS = [['submitted', 'Submitted'], ['seen', 'Seen by the supervisor'], ['approved', 'Approved'], ['revise', 'To revise']];
  var CONF = [[1, 'Very worried'], [2, 'Worried'], [3, 'Not sure'], [4, 'Confident'], [5, 'Very confident']];
  var RATING = [[1, 'Insufficient'], [2, 'Fair'], [3, 'Good'], [4, 'Excellent']];
  App.V = { STATUS: STATUS, PRIORITY: PRIORITY, QUAD: QUAD, MS_STATUS: MS_STATUS, CONF: CONF, RATING: RATING, MEETING_TYPES: MEETING_TYPES, NOTE_TYPES: NOTE_TYPES, DEL_STATUS: DEL_STATUS };

  function label(list, v) { var x = list.filter(function (o) { return String(o[0]) === String(v); })[0]; return x ? t(x[1]) : (v || ''); }
  function opts(list, sel) { return App.join(list, function (o) { return App.opt(o[0], t(o[1]), sel); }); }
  App.label = label;

  // ------------------------------------------------------------ helpers on the current team
  function M() { return S.M; }
  function D() { return S.M.D; }
  function cfg() { return D().config || {}; }
  function link(p) { return M().base + (p ? '/' + p : '/'); }
  App.link = link;
  function editable() { return M().admin || D().team.status !== 'archived'; }
  function member(id) { return App.byId(D().members, id); }
  function byOrder(a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); }
  function byDue(a, b) { return (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : (a.dueDate || '9999') > (b.dueDate || '9999') ? 1 : byOrder(a, b); }
  function isOverdue(x) { return x.status !== 'done' && x.dueDate && x.dueDate < App.today(); }
  function msSorted() { return D().milestones.slice().sort(byOrder); }
  function msLate(m) { return m.status !== 'done' && m.dueDate && m.dueDate < App.today(); }
  function progressOf(d) {
    var ms = d.milestones;
    if (ms.length) return Math.round(ms.reduce(function (s, m) { return s + (m.status === 'done' ? 100 : Number(m.progress) || 0); }, 0) / ms.length);
    var n = d.tasks.length;
    return n ? Math.round(100 * d.tasks.filter(function (x) { return x.status === 'done'; }).length / n) : 0;
  }
  App.progressOf = progressOf;
  function unreadFor(d, admin) {
    return d.messages.filter(function (m) { return admin ? (m.sender === 'team' && !m.readByAdmin) : (m.sender === 'admin' && !m.readByTeam); }).length;
  }
  App.unreadFor = unreadFor;
  function weekTag(w) {
    if (!w) return t('Backlog');
    var cw = App.curWeek();
    if (w === cw) return t('This week');
    if (w === App.addDays(cw, 7)) return t('Next week');
    if (w === App.addDays(cw, -7)) return t('Last week');
    return App.fmtShort(w);
  }
  function statusChip(s) { return h`<span class="chip st-${s}">${label(STATUS, s)}</span>`; }
  function priChip(p) { return p && p !== 'medium' ? h`<span class="chip pri-${p}">${label(PRIORITY, p)}</span>` : ''; }
  function dueChip(x) {
    if (!x.dueDate) return '';
    var late = isOverdue(x);
    return h`<span class="chip ${late ? 'late' : 'muted'}" title="${t('Due date')}">${App.icon('clock')}${App.fmtShort(x.dueDate)}${late ? ' · ' + t('late') : ''}</span>`;
  }
  function who(id) {
    var m = member(id);
    return m ? App.avatar(m, 'sm') : h`<span class="avatar sm team" title="${t('Whole team')}">${App.icon('users')}</span>`;
  }
  function pageHead(title, sub, actions) {
    return h`<div class="page-head"><div><h1>${title}</h1>${sub ? h`<p class="sub">${sub}</p>` : ''}</div><div class="actions">${actions || ''}</div></div>`;
  }
  App.pageHead = pageHead;
  function card(title, body, extra) {
    return h`<section class="card ${extra && extra.cls || ''}">${title ? h`<header class="card-head"><h2>${title}</h2>${extra && extra.right || ''}</header>` : ''}${body}</section>`;
  }
  App.card = card;
  function btn(act, label_, icon, cls, attrs) {
    return h`<button type="button" class="btn ${cls || ''}" data-act="${act}" ${App.raw(attrs || '')}>${icon ? App.icon(icon) : ''}<span>${label_}</span></button>`;
  }
  App.btn = btn;
  function banner() {
    var st = D().team.status;
    if (M().admin) return '';
    if (st === 'pending') return h`<div class="banner info">${App.icon('clock')}<span>${t('Your team is waiting for validation by your supervisor. You can already plan and record your work.')}</span></div>`;
    if (st === 'archived') return h`<div class="banner">${App.icon('archive')}<span>${t('This project is archived: you can read it but not change it.')}</span></div>`;
    return '';
  }

  // ------------------------------------------------------------ dashboard
  P.dashboard = function () {
    var d = D(), team = d.team, c = cfg(), today = App.today(), cw = App.curWeek();
    var tasks = d.tasks, done = tasks.filter(function (x) { return x.status === 'done'; }).length;
    var prog = progressOf(d);
    var wk = d.weeks.filter(function (w) { return w.week === cw; })[0];
    var wt = tasks.filter(function (x) { return x.week === cw; });
    var wtDone = wt.filter(function (x) { return x.status === 'done'; }).length;
    var ms = msSorted();
    var nextMs = ms.filter(function (m) { return m.status !== 'done' && m.dueDate; }).sort(byDue)[0];
    var late = ms.filter(msLate);
    var overdue = tasks.filter(isOverdue).sort(byDue).slice(0, 5);
    var q1 = tasks.filter(function (x) { return x.status !== 'done' && x.quadrant === 'q1'; }).sort(byDue).slice(0, 5);
    var fb = d.weeks.filter(function (w) { return w.adminComment; }).sort(function (a, b) { return a.week < b.week ? 1 : -1; })[0];
    var unread = unreadFor(d, M().admin);
    var lastMsg = d.messages[d.messages.length - 1];
    var anns = d.announcements.slice().sort(function (a, b) { return (b.pinned - a.pinned) || (a.createdAt < b.createdAt ? 1 : -1); }).slice(0, 3);
    var defense = team.defenseDate || c.defense_date;
    var dl = [];
    if (nextMs) dl.push({ label: t('Next milestone') + ': ' + App.tv(nextMs.title), date: nextMs.dueDate });
    if (c.deposit_date) dl.push({ label: t('Thesis deposit'), date: c.deposit_date });
    if (defense) dl.push({ label: t('Defence'), date: defense });
    var pw = App.pfeWeek(cw);
    var reportState = wk ? wk.status : 'none';

    return h`${banner()}
    <div class="dash-hero">
      <div class="dash-title">
        <div class="eyebrow">${team.id} · ${team.level}${team.specialty ? ' · ' + team.specialty : ''}</div>
        <h1>${team.title}</h1>
        <div class="members-line">${App.join(d.members, function (m) { return h`<span class="mchip">${App.avatar(m, 'sm')}${App.fullName(m)}</span>`; })}</div>
      </div>
      ${App.Charts.ring(prog, t('done'))}
    </div>
    <div class="grid dash">
      ${card(t('This week'), h`
        <p class="muted">${App.weekLabel(cw)}${pw ? ' · ' + t('PFE week {n}', { n: pw }) : ''}</p>
        ${wk && wk.goal ? h`<p class="goal">${App.icon('target')}<span>${wk.goal}</span></p>` : h`<p class="muted">${t('No goal set for this week yet.')}</p>`}
        <div class="stat-row"><div class="stat"><b>${wtDone}/${wt.length}</b><span>${t('tasks done')}</span></div>
          <div class="stat"><b class="rep-${reportState}">${reportLabel(reportState)}</b><span>${t('weekly report')}</span></div></div>
        ${App.Charts.meter(wt.length ? 100 * wtDone / wt.length : 0)}
        <a class="btn primary block" href="${link('week')}">${t('Open this week')}</a>`, { cls: 'span2' })}
      ${card(t('Deadlines'), dl.length ? h`<ul class="deadlines">${App.join(dl, function (x) {
        var n = App.days(today, x.date);
        return h`<li class="${n < 0 ? 'late' : n <= 14 ? 'soon' : ''}"><span>${x.label}</span><b>${App.fmt(x.date)}</b><small>${App.inDays(x.date)}</small></li>`;
      })}</ul>` : App.empty(t('No deadline yet. Add due dates to your milestones.')))}
      ${card(t('Project progress'), h`
        <div class="stat-row"><div class="stat"><b>${prog}%</b><span>${t('milestones')}</span></div><div class="stat"><b>${done}/${tasks.length}</b><span>${t('tasks done')}</span></div></div>
        ${late.length ? h`<p class="warn-line">${App.icon('alert')}${t('{n} milestone(s) late', { n: late.length })}</p>` : ''}
        <ul class="mini-ms">${App.join(ms.slice(0, 8), function (m) {
          return h`<li><span class="${msLate(m) ? 'late' : ''}">${App.tv(m.title)}</span>${App.Charts.meter(m.status === 'done' ? 100 : m.progress, msLate(m) ? 'late' : m.status === 'done' ? 'good' : '')}</li>`;
        })}</ul><a href="${link('timeline')}" class="more">${t('Milestones and timeline')} →</a>`)}
      ${card(t('Do now'), q1.length ? taskMiniList(q1) : App.empty(t('Nothing in “Do now”. Classify your tasks in the priority matrix.')), { right: h`<a href="${link('matrix')}" class="more">${t('Matrix')} →</a>` })}
      ${card(t('Overdue tasks'), overdue.length ? taskMiniList(overdue) : App.empty(t('No overdue task. Well done!')))}
      ${card(t('Supervisor feedback'), fb ? h`<div class="feedback"><div class="muted">${t('Week of {d}', { d: App.weekLabel(fb.week) })}${fb.adminRating ? h` · <b>${label(RATING, fb.adminRating)}</b>` : ''}</div>
        <p>${App.nl2br(fb.adminComment)}</p></div>` : App.empty(t('No feedback yet.')), { right: h`<a href="${link('history')}" class="more">${t('History')} →</a>` })}
      ${card(t('Messages'), h`${unread ? h`<p class="badge-line">${App.icon('chat')}<b>${t('{n} new message(s)', { n: unread })}</b></p>` : ''}
        ${lastMsg ? h`<blockquote class="last-msg"><small>${lastMsg.author} · ${App.ago(lastMsg.createdAt)}</small>${lastMsg.body.slice(0, 180)}</blockquote>` : App.empty(t('No message yet.'))}
        <a href="${link('messages')}" class="more">${t('Open the messages')} →</a>`)}
      ${card(t('Announcements'), anns.length ? h`<ul class="anns">${App.join(anns, function (a) {
        return h`<li>${a.pinned ? App.icon('pin') : ''}<b>${a.title}</b><span>${App.linkify(a.body.length > 160 ? a.body.slice(0, 160) + '…' : a.body)}</span><small>${App.ago(a.createdAt)}</small></li>`;
      })}</ul>` : App.empty(t('No announcement.')), { right: h`<a href="${link('news')}" class="more">${t('All')} →</a>` })}
      ${card(t('Recent activity'), d.activity.length ? h`<ul class="activity">${App.join(d.activity.slice(0, 8), function (a) {
        return h`<li><span class="who">${a.actor}</span> <span>${actionText(a)}</span><small>${App.ago(a.ts)}</small></li>`;
      })}</ul>` : App.empty(t('No activity yet.')))}
    </div>`;
  };

  function reportLabel(s) {
    return { none: t('Not started'), draft: t('Draft'), submitted: t('Submitted'), reviewed: t('Reviewed'), na: '—' }[s] || s;
  }
  App.reportLabel = reportLabel;
  function actionText(a) {
    var map = {
      'tasks.create': 'created the task', 'tasks.update': 'updated the task', 'tasks.delete': 'deleted the task',
      'milestones.create': 'added the milestone', 'milestones.update': 'updated the milestone', 'milestones.delete': 'deleted the milestone',
      'meetings.create': 'recorded a meeting', 'meetings.update': 'updated a meeting', 'meetings.delete': 'deleted a meeting',
      'notes.create': 'wrote a note', 'notes.update': 'updated a note', 'notes.delete': 'deleted a note',
      'resources.create': 'added a resource', 'resources.update': 'updated a resource', 'resources.delete': 'deleted a resource',
      'members.create': 'added a member', 'members.update': 'updated a member', 'members.delete': 'removed a member',
      'week.save': 'saved the week', 'week.submit': 'submitted the weekly report', 'week.carry': 'carried tasks over',
      'week.review': 'reviewed the week', 'message.send': 'sent a message', 'team.update': 'updated the project',
      'team.created': 'created the team', 'team.code': 'changed the access code'
    };
    var verb = map[a.action] ? t(map[a.action]) : a.action;
    var detail = a.action.indexOf('week') === 0 && /^\d{4}-\d{2}-\d{2}$/.test(a.detail) ? App.weekLabel(a.detail) : a.detail;
    return h`${verb}${detail ? h` <i>${App.tv(detail)}</i>` : ''}`;
  }
  App.actionText = actionText;
  function taskMiniList(list) {
    return h`<ul class="tmini">${App.join(list, function (x) {
      return h`<li><button type="button" class="link" data-act="task-edit" data-id="${x.id}">${x.title}</button>${dueChip(x)}${who(x.assignee)}</li>`;
    })}</ul>`;
  }

  // ------------------------------------------------------------ the week: plan + report
  P.week = function (prm) {
    var d = D(), w = prm && prm.w ? App.weekOf(prm.w) : App.curWeek(), cw = App.curWeek();
    var rec = d.weeks.filter(function (x) { return x.week === w; })[0] || null;
    var tasks = d.tasks.filter(function (x) { return x.week === w; }).sort(byOrder);
    var moved = rec && rec.snapshot ? rec.snapshot.filter(function (s) { return !tasks.some(function (x) { return x.id === s.id; }); }) : [];
    var open = tasks.filter(function (x) { return x.status !== 'done'; });
    var done = tasks.length - open.length;
    var pw = App.pfeWeek(w);
    var k = 'wk.' + w + '.';
    var v = function (f, def) { return App.draft(k + f, rec ? rec[f] : def); };
    var ro = !editable();
    var status = rec ? rec.status : 'none';
    var hours = rec ? rec.hours || {} : {};
    var obstacles = cfg().obstacle_categories || [];

    return h`${banner()}
    <div class="week-nav">
      <a class="icon-btn" href="${link('week/' + App.addDays(w, -7))}" aria-label="${t('Previous week')}">${App.icon('left')}</a>
      <div class="wn-mid"><h1>${t('Week of {d}', { d: App.weekLabel(w) })}</h1>
        <p class="sub">${pw ? t('PFE week {n}', { n: pw }) + ' · ' : ''}${w === cw ? t('This week') : w < cw ? t('Past week') : t('Coming week')} · <span class="rep rep-${status}">${reportLabel(status)}</span></p></div>
      <a class="icon-btn" href="${link('week/' + App.addDays(w, 7))}" aria-label="${t('Next week')}">${App.icon('right')}</a>
      ${w !== cw ? h`<a class="btn ghost sm" href="${link('week')}">${t('This week')}</a>` : ''}
    </div>

    ${rec && (rec.adminComment || rec.status === 'reviewed') && !M().admin ? h`<section class="card feedback-card">
      <header class="card-head"><h2>${App.icon('star')}${t('Supervisor feedback')}</h2>${rec.adminRating ? h`<span class="chip good">${label(RATING, rec.adminRating)}</span>` : ''}</header>
      <p>${App.nl2br(rec.adminComment || t('Reviewed.'))}</p></section>` : ''}
    ${M().admin ? reviewBox(w, rec) : ''}

    <form data-form="week" data-week="${w}" class="week-form">
    <section class="card">
      <header class="card-head"><h2>${App.icon('target')}${t('Goal of the week')}</h2></header>
      <textarea name="goal" rows="2" maxlength="2000" data-draft="${k}goal" placeholder="${t('What must be achieved by the end of the week?')}" ${ro ? App.raw('disabled') : ''}>${v('goal', '')}</textarea>
    </section>

    <section class="card" id="week-tasks">
      <header class="card-head"><h2>${App.icon('list')}${t('Planned tasks')} <span class="count">${done}/${tasks.length}</span></h2>
        <div class="actions">${ro ? '' : h`${btn('task-new', t('New task'), 'plus', 'sm', 'data-week="' + w + '"')}${btn('week-pick', t('From the backlog'), 'inbox', 'sm ghost', 'data-week="' + w + '"')}`}</div></header>
      ${tasks.length ? App.Charts.meter(100 * done / tasks.length, 'good') : ''}
      ${tasks.length ? h`<div class="wt-list">${App.join(tasks, function (x) { return weekTaskRow(x, obstacles, ro); })}</div>`
        : App.empty(t('No task planned for this week. Add new tasks or take some from the backlog.'))}
      ${moved.length ? h`<div class="moved"><h3>${t('Planned this week, moved on')}</h3>${App.join(moved, function (s) {
        return h`<div class="wt-row ghosted"><span class="chip st-${s.status}">${label(STATUS, s.status)}</span><span class="wt-title">${s.title}</span>
          ${s.carried ? h`<span class="chip muted">↻ ${t('carried to next week')}</span>` : ''}${s.obstacle ? h`<span class="chip warn">${App.tv(s.obstacle)}</span>` : ''}
          ${s.reason ? h`<span class="why-text">${s.reason}</span>` : ''}</div>`;
      })}</div>` : ''}
      ${open.length && w <= cw && !ro ? h`<div class="carry">${btn('week-carry', t('Carry the {n} unfinished task(s) over to next week', { n: open.length }), 'right', 'ghost sm', 'data-week="' + w + '"')}</div>` : ''}
    </section>

    <section class="card">
      <header class="card-head"><h2>${App.icon('journal')}${t('Weekly report')}</h2><span class="rep rep-${status}">${reportLabel(status)}${rec && rec.submittedAt ? ' · ' + App.fmtTime(rec.submittedAt) : ''}</span></header>
      <div class="form-grid">
        <label class="span2">${t('What we did this week')} <em>*</em>
          <textarea name="done" rows="4" maxlength="6000" data-draft="${k}done" placeholder="${t('Results, finished work, what you learned…')}" ${ro ? App.raw('disabled') : ''}>${v('done', '')}</textarea></label>
        <label>${t('Difficulties and obstacles')}
          <textarea name="difficulties" rows="3" maxlength="4000" data-draft="${k}difficulties" ${ro ? App.raw('disabled') : ''}>${v('difficulties', '')}</textarea></label>
        <label>${t('Plan for next week')}
          <textarea name="nextPlan" rows="3" maxlength="4000" data-draft="${k}nextPlan" ${ro ? App.raw('disabled') : ''}>${v('nextPlan', '')}</textarea></label>
        <label class="span2">${t('Remarks for the supervisor')}
          <textarea name="remarks" rows="2" maxlength="3000" data-draft="${k}remarks" ${ro ? App.raw('disabled') : ''}>${v('remarks', '')}</textarea></label>
      </div>
      <fieldset class="conf"><legend>${t('How confident are you about finishing on time?')}</legend>
        <div class="seg-choice">${App.join(CONF, function (c) {
          return h`<label><input type="radio" name="confidence" value="${c[0]}" data-draft="${k}confidence" ${String(v('confidence', '')) === String(c[0]) ? App.raw('checked') : ''} ${ro ? App.raw('disabled') : ''}><span>${c[0]}</span><small>${t(c[1])}</small></label>`;
        })}</div></fieldset>
      <fieldset class="hours"><legend>${t('Hours worked this week')}</legend>
        <div class="hours-grid">${App.join(d.members, function (m) {
          return h`<label>${App.avatar(m, 'sm')}<span>${App.fullName(m)}</span><input type="number" name="h_${m.id}" min="0" max="200" step="0.5" inputmode="decimal" data-draft="${k}h_${m.id}" value="${App.draft(k + 'h_' + m.id, hours[m.id] || '')}" ${ro ? App.raw('disabled') : ''}></label>`;
        })}</div></fieldset>
      <div class="help-box">
        <label class="check"><input type="checkbox" name="helpNeeded" data-draft="${k}helpNeeded" ${App.checked(v('helpNeeded', false))} ${ro ? App.raw('disabled') : ''}><span>${t('We need help from the supervisor')}</span></label>
        <textarea name="helpText" rows="2" maxlength="2000" data-draft="${k}helpText" placeholder="${t('What kind of help?')}" ${ro ? App.raw('disabled') : ''}>${v('helpText', '')}</textarea>
      </div>
      ${ro ? '' : h`<div class="form-actions">
        <button type="button" class="btn ghost" data-act="week-save" data-submit="0">${t('Save draft')}</button>
        <button type="button" class="btn primary" data-act="week-save" data-submit="1">${App.icon('send')}<span>${status === 'submitted' || status === 'reviewed' ? t('Update the report') : t('Submit the report')}</span></button>
      </div>`}
    </section>
    </form>`;
  };

  function weekTaskRow(x, obstacles, ro) {
    var notDone = x.status !== 'done';
    return h`<div class="wt-row ${x.status === 'done' ? 'is-done' : ''}" data-id="${x.id}">
      <select class="status-select st-${x.status}" data-chg="task-status" data-id="${x.id}" aria-label="${t('Status')}" ${ro ? App.raw('disabled') : ''}>${opts(STATUS, x.status)}</select>
      <button type="button" class="wt-title link" data-act="task-edit" data-id="${x.id}">${x.title}</button>
      <span class="wt-meta">${priChip(x.priority)}${dueChip(x)}${x.carried ? h`<span class="chip muted" title="${t('Carried over from a previous week')}">↻ ${x.carried}</span>` : ''}${who(x.assignee)}</span>
      ${notDone ? h`<div class="why">
        <span class="why-label">${t('If not done, why?')}</span>
        <select data-chg="task-obstacle" data-id="${x.id}" aria-label="${t('Obstacle')}" ${ro ? App.raw('disabled') : ''}><option value="">${t('Obstacle…')}</option>${App.options(obstacles, x.obstacle)}</select>
        <input type="text" maxlength="1000" data-chg="task-reason" data-id="${x.id}" data-draft="tr.${x.id}" value="${App.draft('tr.' + x.id, x.reason || '')}" placeholder="${t('Explain in a few words')}" aria-label="${t('Reason')}" ${ro ? App.raw('disabled') : ''}>
      </div>` : ''}
    </div>`;
  }

  function reviewBox(w, rec, teamId) {
    teamId = teamId || D().team.id;
    var key = 'rv.' + teamId + '.' + w;
    return h`<section class="card review-card"><header class="card-head"><h2>${App.icon('star')}${t('Your review of this week')}</h2>
      ${rec && rec.reviewedAt && rec.status === 'reviewed' ? h`<span class="chip good">${t('Reviewed')} · ${App.fmtTime(rec.reviewedAt)}</span>` : ''}</header>
      <form data-form="review" data-week="${w}" data-team="${teamId}" class="review-form">
        <textarea name="adminComment" rows="3" maxlength="3000" data-draft="${key}" placeholder="${t('Feedback for the team (they will see it)')}">${App.draft(key, rec ? rec.adminComment : '')}</textarea>
        <div class="row">
          <select name="adminRating" aria-label="${t('Appreciation')}"><option value="">${t('Appreciation…')}</option>${opts(RATING, rec ? rec.adminRating : '')}</select>
          <label class="check"><input type="checkbox" name="reviewed" checked><span>${t('Mark as reviewed')}</span></label>
          <button class="btn primary" type="submit">${t('Save the review')}</button>
        </div>
      </form></section>`;
  }
  App.reviewBox = reviewBox;

  App.form('review', function (f, data) {
    var w = f.dataset.week, teamId = f.dataset.team;
    return App.api('admin.review', { teamId: teamId, week: w, adminComment: data.adminComment, adminRating: data.adminRating, reviewed: !!data.reviewed }).then(function (rec) {
      App.clearDrafts('rv.' + teamId + '.' + w);
      var td = S.A.teams[teamId];
      if (td) App.upsert(td.data.weeks, rec);
      if (S.A.week[w]) S.A.week[w].teams.forEach(function (x) { if (x.team.id === teamId) x.week = rec; });
      App.toast(t('Review saved'));
      App.refresh();
    });
  });

  App.act('week-save', function (el) {
    var f = el.closest('form'), w = f.dataset.week, submit = el.dataset.submit === '1';
    var data = App.formData(f), d = D();
    var hours = {};
    d.members.forEach(function (m) { if (data['h_' + m.id] !== '' && data['h_' + m.id] !== undefined) hours[m.id] = data['h_' + m.id]; });
    var payload = {
      goal: data.goal, done: data.done, difficulties: data.difficulties, nextPlan: data.nextPlan, remarks: data.remarks,
      helpNeeded: !!data.helpNeeded, helpText: data.helpText, confidence: data.confidence || '', hours: hours
    };
    if (submit) {
      if (!String(data.done || '').trim()) { App.toast(t('Describe what you did this week before submitting.'), 'err'); f.querySelector('[name=done]').focus(); return; }
      var missing = d.tasks.filter(function (x) { return x.week === w && x.status !== 'done' && !String(x.reason || '').trim(); });
      if (missing.length) {
        App.toast(t('For each unfinished task, choose an obstacle and write why it was not done.'), 'err');
        var first = document.querySelector('.wt-row[data-id="' + missing[0].id + '"] input');
        if (first) first.focus();
        missing.forEach(function (x) { var r = document.querySelector('.wt-row[data-id="' + x.id + '"]'); if (r) r.classList.add('need'); });
        return;
      }
    }
    el.disabled = true;
    return App.teamCall('week.save', { week: w, data: payload, submit: submit }).then(function (rec) {
      el.disabled = false;
      App.upsert(d.weeks, rec);
      App.clearDrafts('wk.' + w + '.');
      App.toast(submit ? t('Report submitted. Your supervisor can read it now.') : t('Draft saved'));
      App.refresh();
    }, function (e) { el.disabled = false; throw e; });
  });

  App.act('week-carry', function (el) {
    var w = el.dataset.week, d = D(), next = App.addDays(w, 7);
    var open = d.tasks.filter(function (x) { return x.week === w && x.status !== 'done'; });
    var missing = open.filter(function (x) { return !String(x.reason || '').trim(); });
    if (missing.length) {
      App.toast(t('First say why each unfinished task was not done: it stays in this week’s history.'), 'err');
      missing.forEach(function (x) { var r = document.querySelector('.wt-row[data-id="' + x.id + '"]'); if (r) r.classList.add('need'); });
      return;
    }
    return App.confirm(t('Move the {n} unfinished task(s) to the week of {d}? Their reasons stay in this week’s history.', { n: open.length, d: App.weekLabel(next) }), { ok: t('Carry over') }).then(function (ok) {
      if (!ok) return;
      return App.teamCall('week.carry', { week: w }).then(function (r) {
        r.moved.forEach(function (x) { App.upsert(d.tasks, x); });
        if (r.week) App.upsert(d.weeks, r.week);
        App.toast(t('{n} task(s) moved to next week', { n: r.moved.length }));
        App.setHash(link('week/' + next));
      });
    });
  });

  App.act('week-pick', function (el) {
    var w = el.dataset.week, d = D();
    var list = d.tasks.filter(function (x) { return !x.week && x.status !== 'done'; }).sort(byDue);
    var later = d.tasks.filter(function (x) { return x.week && x.week < w && x.status !== 'done'; }).sort(byDue);
    if (!list.length && !later.length) { App.toast(t('The backlog is empty. Create a new task.'), 'info'); return; }
    var row = function (x) { return h`<label class="pick"><input type="checkbox" name="pick" value="${x.id}" data-multi="1"><span>${x.title}</span>${dueChip(x)}${x.week ? h`<small>${weekTag(x.week)}</small>` : ''}</label>`; };
    App.modal({
      title: t('Plan tasks for this week'), submit: t('Add to the week'),
      body: h`${list.length ? h`<h3 class="mini-title">${t('Backlog')}</h3>${App.join(list, row)}` : ''}
        ${later.length ? h`<h3 class="mini-title">${t('Unfinished from earlier weeks')}</h3>${App.join(later, row)}` : ''}`,
      onSubmit: function (data) {
        var ids = data.pick || [];
        if (!ids.length) return;
        return App.saveMany('tasks', ids.map(function (id) { return { id: id, week: w }; })).then(function () { App.toast(t('Added to the week')); App.refresh(); });
      }
    });
  });

  App.chg('task-status', function (el) {
    var x = App.byId(D().tasks, el.dataset.id);
    if (!x) return;
    var st = el.value;
    return App.save('tasks', { id: x.id, status: st }).then(function () {
      if (st === 'done') App.toast(t('Well done! Task completed.'));
      App.refresh();
    });
  });
  App.chg('task-obstacle', function (el) { return App.save('tasks', { id: el.dataset.id, obstacle: el.value }).then(function () { markOk(el); }); });
  App.chg('task-reason', function (el) {
    return App.save('tasks', { id: el.dataset.id, reason: el.value }).then(function () { delete App.drafts['tr.' + el.dataset.id]; markOk(el); });
  });
  function markOk(el) {
    var row = el.closest('.wt-row');
    if (row) { row.classList.remove('need'); row.classList.add('saved'); setTimeout(function () { row.classList.remove('saved'); }, 900); }
  }

  // ------------------------------------------------------------ history of the weeks
  P.history = function () {
    var d = D();
    var weeks = d.weeks.slice().sort(function (a, b) { return a.week < b.week ? 1 : -1; });
    return h`${pageHead(t('History of the weeks'), t('Every weekly report, with what was planned and the feedback of the supervisor.'))}
      ${weeks.length ? App.join(weeks, function (w) {
        var snap = w.snapshot || [];
        var doneN = snap.filter(function (s) { return s.status === 'done'; }).length;
        var hrs = Object.keys(w.hours || {}).reduce(function (s, k) { return s + (Number(w.hours[k]) || 0); }, 0);
        return h`<section class="card hist" data-team="${d.team.id}">
          <header class="card-head"><h2><a href="${link('week/' + w.week)}">${t('Week of {d}', { d: App.weekLabel(w.week) })}</a></h2>
            <span class="rep rep-${w.status}">${reportLabel(w.status)}</span></header>
          <div class="hist-stats"><span>${App.icon('check')}${t('{a}/{b} planned tasks done', { a: doneN, b: snap.length })}</span>
            ${hrs ? h`<span>${App.icon('clock')}${t('{n} h worked', { n: Math.round(hrs * 10) / 10 })}</span>` : ''}
            ${w.confidence ? h`<span>${App.icon('target')}${t('Confidence')}: ${w.confidence}/5</span>` : ''}
            ${w.helpNeeded ? h`<span class="chip warn">${App.icon('help')}${t('Help requested')}</span>` : ''}</div>
          ${w.goal ? h`<p class="goal">${App.icon('target')}<span>${w.goal}</span></p>` : ''}
          ${w.done ? h`<h3 class="mini-title">${t('What we did')}</h3><p>${App.nl2br(w.done)}</p>` : ''}
          ${w.difficulties ? h`<h3 class="mini-title">${t('Difficulties')}</h3><p>${App.nl2br(w.difficulties)}</p>` : ''}
          ${snap.filter(function (s) { return s.status !== 'done'; }).length ? h`<h3 class="mini-title">${t('Not done')}</h3><ul class="notdone">${App.join(snap.filter(function (s) { return s.status !== 'done'; }), function (s) {
            return h`<li><b>${s.title}</b>${s.obstacle ? h` <span class="chip warn">${App.tv(s.obstacle)}</span>` : ''} ${s.reason}</li>`;
          })}</ul>` : ''}
          ${w.helpNeeded && w.helpText ? h`<p class="help-text">${App.icon('help')}${w.helpText}</p>` : ''}
          ${w.adminComment && !M().admin ? h`<div class="feedback"><b>${t('Supervisor feedback')}${w.adminRating ? ' · ' + label(RATING, w.adminRating) : ''}</b><p>${App.nl2br(w.adminComment)}</p></div>` : ''}
          ${M().admin ? reviewBox(w.week, w) : ''}
        </section>`;
      }) : App.empty(t('No weekly report yet.'), h`<a class="btn primary" href="${link('week')}">${t('Open this week')}</a>`)}`;
  };

  // ------------------------------------------------------------ tasks: board and list
  var ui = App.ui = App.local.get('ui', { view: 'board', who: '', week: '', pri: '', cat: '', q: '', sort: 'due', showDone: false });
  function saveUi() { App.local.set('ui', ui); }

  function filtered() {
    var d = D(), cw = App.curWeek(), q = (ui.q || '').toLowerCase();
    return d.tasks.filter(function (x) {
      if (ui.who === '_none' && x.assignee) return false;
      if (ui.who && ui.who !== '_none' && x.assignee !== ui.who) return false;
      if (ui.week === 'this' && x.week !== cw) return false;
      if (ui.week === 'next' && x.week !== App.addDays(cw, 7)) return false;
      if (ui.week === 'backlog' && x.week) return false;
      if (ui.week === 'late' && !isOverdue(x)) return false;
      if (ui.pri && x.priority !== ui.pri) return false;
      if (ui.cat && x.category !== ui.cat) return false;
      if (q && (x.title + ' ' + x.description).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  P.tasks = function () {
    var d = D(), list = filtered(), ro = !editable();
    var toolbar = h`<div class="toolbar">
      <div class="seg" role="group" aria-label="${t('View')}">
        <button type="button" class="${ui.view === 'board' ? 'on' : ''}" data-act="ui" data-k="view" data-v="board">${App.icon('board')}<span>${t('Board')}</span></button>
        <button type="button" class="${ui.view === 'list' ? 'on' : ''}" data-act="ui" data-k="view" data-v="list">${App.icon('list')}<span>${t('List')}</span></button></div>
      <select data-chg="ui" data-k="who" aria-label="${t('Member')}"><option value="">${t('Everybody')}</option>${App.join(d.members, function (m) { return App.opt(m.id, App.fullName(m), ui.who); })}${App.opt('_none', t('Whole team'), ui.who)}</select>
      <select data-chg="ui" data-k="week" aria-label="${t('Week')}">${opts([['', 'All weeks'], ['this', 'This week'], ['next', 'Next week'], ['backlog', 'Backlog'], ['late', 'Overdue']], ui.week)}</select>
      <select data-chg="ui" data-k="pri" aria-label="${t('Priority')}"><option value="">${t('All priorities')}</option>${opts(PRIORITY, ui.pri)}</select>
      <select data-chg="ui" data-k="cat" aria-label="${t('Category')}"><option value="">${t('All categories')}</option>${App.options(cfg().task_categories || [], ui.cat)}</select>
      <input type="search" data-chg="ui" data-k="q" value="${ui.q || ''}" placeholder="${t('Search…')}" aria-label="${t('Search')}">
    </div>`;
    return h`${banner()}${pageHead(t('Tasks'), t('{n} task(s) · drag a card to change its status', { n: d.tasks.length }), ro ? '' : btn('task-new', t('New task'), 'plus', 'primary'))}
      ${toolbar}${ui.view === 'list' ? taskTable(list) : board(list, ro)}`;
  };

  function board(list, ro) {
    return h`<div class="board">${App.join(STATUS, function (s) {
      var col = list.filter(function (x) { return x.status === s[0]; }).sort(s[0] === 'done' ? function (a, b) { return a.doneAt < b.doneAt ? 1 : -1; } : byOrder);
      return h`<section class="col col-${s[0]}" data-status="${s[0]}">
        <header><span class="dot st-${s[0]}"></span><h2>${t(s[1])}</h2><span class="count">${col.length}</span>
          ${ro || s[0] === 'done' ? '' : h`<button type="button" class="icon-btn sm" data-act="task-new" data-status="${s[0]}" aria-label="${t('New task')}">${App.icon('plus')}</button>`}</header>
        <div class="col-drop" data-status="${s[0]}">${App.join(col, function (x) { return taskCard(x, ro); })}</div></section>`;
    })}</div>`;
  }

  function taskCard(x, ro) {
    var cl = x.checklist || [], cld = cl.filter(function (i) { return i.d; }).length;
    return h`<article class="tcard pri-${x.priority}" ${ro ? '' : App.raw('draggable="true"')} data-id="${x.id}" data-act="task-edit" tabindex="0">
      <div class="tc-title">${x.title}</div>
      <div class="tc-meta">${priChip(x.priority)}${x.category ? h`<span class="chip muted">${App.tv(x.category)}</span>` : ''}
        <span class="chip ${x.week === App.curWeek() ? 'accent' : 'muted'}">${weekTag(x.week)}</span>${dueChip(x)}
        ${cl.length ? h`<span class="chip muted">${App.icon('check')}${cld}/${cl.length}</span>` : ''}
        ${x.carried ? h`<span class="chip muted" title="${t('Carried over from a previous week')}">↻ ${x.carried}</span>` : ''}</div>
      ${x.status === 'blocked' && x.reason ? h`<div class="tc-why">${App.icon('alert')}${x.reason}</div>` : ''}
      <div class="tc-foot">${who(x.assignee)}
        ${ro ? '' : h`<select class="tc-move" data-chg="task-status" data-id="${x.id}" aria-label="${t('Move to')}">${opts(STATUS, x.status)}</select>`}</div>
    </article>`;
  }

  function taskTable(list) {
    var key = ui.sort || 'due';
    var sorters = {
      due: byDue, title: function (a, b) { return a.title.localeCompare(b.title); },
      status: function (a, b) { return STATUS.map(function (s) { return s[0]; }).indexOf(a.status) - STATUS.map(function (s) { return s[0]; }).indexOf(b.status); },
      priority: function (a, b) { return ['high', 'medium', 'low'].indexOf(a.priority) - ['high', 'medium', 'low'].indexOf(b.priority); },
      week: function (a, b) { return (a.week || '0') < (b.week || '0') ? -1 : 1; }
    };
    list = list.slice().sort(sorters[key] || byDue);
    var th = function (k, l) { return h`<th><button type="button" class="link ${key === k ? 'on' : ''}" data-act="ui" data-k="sort" data-v="${k}">${l}</button></th>`; };
    if (!list.length) return App.empty(t('No task matches these filters.'));
    return h`<div class="table-wrap"><table class="table tasks-table"><thead><tr>${th('title', t('Task'))}${th('status', t('Status'))}${th('priority', t('Priority'))}<th>${t('Assigned to')}</th>${th('week', t('Week'))}${th('due', t('Due date'))}<th>${t('Category')}</th></tr></thead>
      <tbody>${App.join(list, function (x) {
        var m = member(x.assignee);
        return h`<tr><td><button type="button" class="link" data-act="task-edit" data-id="${x.id}">${x.title}</button></td><td>${statusChip(x.status)}</td><td>${label(PRIORITY, x.priority)}</td>
          <td>${m ? App.fullName(m) : t('Whole team')}</td><td>${weekTag(x.week)}</td><td class="${isOverdue(x) ? 'late' : ''}">${x.dueDate ? App.fmt(x.dueDate) : '—'}</td><td>${App.tv(x.category) || '—'}</td></tr>`;
      })}</tbody></table></div>`;
  }

  App.act('ui', function (el) { ui[el.dataset.k] = el.dataset.v; saveUi(); App.refresh(); });
  App.chg('ui', function (el) { ui[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; saveUi(); App.refresh(); });

  // drag and drop on the board (desktop) — on phones, the small "move to" list does the same
  App.bindBoard = function () {
    var main = document.getElementById('main'), dragId = null;
    main.querySelectorAll('.tcard[draggable]').forEach(function (c) {
      c.addEventListener('dragstart', function (e) { dragId = c.dataset.id; c.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (x) { /* ignore */ } });
      c.addEventListener('dragend', function () { c.classList.remove('dragging'); dragId = null; main.querySelectorAll('.over').forEach(function (z) { z.classList.remove('over'); }); });
    });
    main.querySelectorAll('.col-drop').forEach(function (zone) {
      zone.addEventListener('dragover', function (e) { if (!dragId) return; e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', function (e) { if (!zone.contains(e.relatedTarget)) zone.classList.remove('over'); });
      zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.classList.remove('over');
        var id = dragId || e.dataTransfer.getData('text/plain');
        var x = App.byId(D().tasks, id);
        if (!x) return;
        var cards = Array.prototype.filter.call(zone.querySelectorAll('.tcard'), function (c) { return c.dataset.id !== id; });
        var idx = cards.length;
        for (var i = 0; i < cards.length; i++) { var r = cards[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { idx = i; break; } }
        var prev = cards[idx - 1] && App.byId(D().tasks, cards[idx - 1].dataset.id), next = cards[idx] && App.byId(D().tasks, cards[idx].dataset.id);
        var order = prev && next ? (Number(prev.order) + Number(next.order)) / 2 : prev ? Number(prev.order) + 1000 : next ? Number(next.order) - 1000 : Date.now();
        var st = zone.dataset.status;
        var old = { status: x.status, order: x.order };
        x.status = st; x.order = order;
        App.refresh();
        App.save('tasks', { id: id, status: st, order: order }).then(function () { if (st === 'done' && old.status !== 'done') App.toast(t('Well done! Task completed.')); App.refresh(); }, function (err) {
          x.status = old.status; x.order = old.order; App.refresh(); App.fail(err);
        });
      });
    });
  };

  // ------------------------------------------------------------ task editor
  App.act('task-new', function (el) {
    openTask({ status: el.dataset.status || 'todo', week: el.dataset.week || '', quadrant: el.dataset.quad || '', priority: el.dataset.quad ? QUAD_PRIORITY[el.dataset.quad] : 'medium' });
  });
  App.act('task-edit', function (el) {
    var x = App.byId(D().tasks, el.dataset.id);
    if (x) openTask(x);
  });

  function weekChoices(cur) {
    var cw = App.curWeek(), list = [['', t('Backlog (no week)')]];
    for (var i = -1; i <= 6; i++) { var w = App.addDays(cw, 7 * i); list.push([w, (i === 0 ? t('This week') : i === 1 ? t('Next week') : i === -1 ? t('Last week') : t('Week of {d}', { d: App.weekLabel(w) })) + (i >= -1 && i <= 1 ? ' (' + App.weekLabel(w) + ')' : '')]); }
    if (cur && !list.some(function (o) { return o[0] === cur; })) list.push([cur, t('Week of {d}', { d: App.weekLabel(cur) })]);
    return list;
  }

  function checklistRow(i) {
    return h`<div class="cl-row"><input type="checkbox" class="cl-d" ${App.checked(i.d)} aria-label="${t('Done')}"><input type="text" class="cl-t" value="${i.t}" maxlength="200" aria-label="${t('Step')}"><button type="button" class="icon-btn sm" data-act="cl-del" aria-label="${t('Remove')}">${App.icon('x')}</button></div>`;
  }

  function openTask(x) {
    var d = D(), isNew = !x.id, ro = !editable(), c = cfg();
    var cats = (c.task_categories || []).slice();
    if (x.category && cats.indexOf(x.category) < 0) cats.push(x.category);
    App.modal({
      title: isNew ? t('New task') : t('Edit the task'), wide: true, submit: isNew ? t('Create') : t('Save'),
      body: h`<div class="form-grid">
        <label class="span2">${t('Title')} <em>*</em><input name="title" required maxlength="200" value="${x.title || ''}" autofocus ${ro ? App.raw('disabled') : ''}></label>
        <label class="span2">${t('Description')}<textarea name="description" rows="3" maxlength="4000">${x.description || ''}</textarea></label>
        <label>${t('Status')}<select name="status">${opts(STATUS, x.status || 'todo')}</select></label>
        <label>${t('Priority')}<select name="priority">${opts(PRIORITY, x.priority || 'medium')}</select></label>
        <label>${t('Assigned to')}<select name="assignee"><option value="">${t('Whole team')}</option>${App.join(d.members, function (m) { return App.opt(m.id, App.fullName(m), x.assignee); })}</select></label>
        <label>${t('Week')}<select name="week">${App.join(weekChoices(x.week), function (o) { return App.opt(o[0], o[1], x.week || ''); })}</select></label>
        <label>${t('Category')}<select name="category"><option value="">—</option>${App.options(cats, x.category)}</select></label>
        <label>${t('Milestone')}<select name="milestoneId"><option value="">—</option>${App.join(msSorted(), function (m) { return App.opt(m.id, App.tv(m.title), x.milestoneId); })}</select></label>
        <label>${t('Start date')}<input type="date" name="startDate" value="${x.startDate || ''}"></label>
        <label>${t('Due date')}<input type="date" name="dueDate" value="${x.dueDate || ''}"></label>
        <label>${t('Estimated time (hours)')}<input type="number" name="estimate" min="0" max="1000" step="0.5" value="${x.estimate === '' || x.estimate === undefined ? '' : x.estimate}"></label>
        <label>${t('Time spent (hours)')}<input type="number" name="spent" min="0" max="10000" step="0.25" value="${x.spent === '' || x.spent === undefined ? '' : x.spent}"></label>
        <label class="span2">${t('Priority matrix')}<select name="quadrant"><option value="">${t('Not classified')}</option>${App.join(['q1', 'q2', 'q3', 'q4'], function (q) { return App.opt(q, t(QUAD[q].title) + ' — ' + t(QUAD[q].sub), x.quadrant); })}</select></label>
      </div>
      <fieldset class="checklist"><legend>${t('Checklist (steps)')}</legend><div class="cl-list">${App.join(x.checklist || [], checklistRow)}</div>
        <div class="cl-add"><input type="text" class="cl-new" maxlength="200" placeholder="${t('Add a step and press Enter')}"><button type="button" class="btn sm ghost" data-act="cl-add">${App.icon('plus')}<span>${t('Add')}</span></button></div></fieldset>
      <fieldset class="whyset"><legend>${t('If it is not done or blocked')}</legend><div class="form-grid">
        <label>${t('Obstacle')}<select name="obstacle"><option value="">—</option>${App.options(c.obstacle_categories || [], x.obstacle)}</select></label>
        <label>${t('Reason')}<input name="reason" maxlength="1000" value="${x.reason || ''}"></label></div></fieldset>`,
      left: isNew ? (ro ? '' : '') : h`${ro ? '' : h`<button type="button" class="btn ghost danger-text" data-act="task-del" data-id="${x.id}">${App.icon('trash')}<span>${t('Delete')}</span></button>`}
        <button type="button" class="btn ghost" data-act="focus-start" data-id="${x.id}">${App.icon('bolt')}<span>${t('Focus 25 min')}</span></button>`,
      onOpen: function (form) {
        var inp = form.querySelector('.cl-new');
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addStep(form); } });
        if (ro) form.querySelectorAll('input,select,textarea').forEach(function (i) { i.disabled = true; });
      },
      onSubmit: ro ? null : function (data, form) {
        var pending = form.querySelector('.cl-new').value.trim();
        if (pending) addStep(form);
        var checklist = Array.prototype.map.call(form.querySelectorAll('.cl-row'), function (r) {
          return { t: r.querySelector('.cl-t').value.trim(), d: r.querySelector('.cl-d').checked };
        }).filter(function (i) { return i.t; });
        var rec = {
          title: data.title, description: data.description, status: data.status, priority: data.priority, assignee: data.assignee,
          week: data.week, category: data.category, milestoneId: data.milestoneId, startDate: data.startDate, dueDate: data.dueDate,
          estimate: data.estimate, spent: data.spent, quadrant: data.quadrant, checklist: checklist, obstacle: data.obstacle, reason: data.reason
        };
        if (rec.startDate && rec.dueDate && rec.dueDate < rec.startDate) throw new App.ApiError('VALIDATION', t('the due date is before the start date'));
        if (!isNew) rec.id = x.id;
        return App.save('tasks', rec).then(function () { App.toast(isNew ? t('Task created') : t('Task saved')); App.refresh(); });
      }
    });
  }
  App.openTask = openTask;
  function addStep(form) {
    var inp = form.querySelector('.cl-new'), v = inp.value.trim();
    if (!v) return;
    var div = document.createElement('div');
    div.innerHTML = checklistRow({ t: v, d: false }).s;
    form.querySelector('.cl-list').appendChild(div.firstChild);
    inp.value = '';
    inp.focus();
  }
  App.act('cl-add', function (el) { addStep(el.closest('form')); });
  App.act('cl-del', function (el) { el.closest('.cl-row').remove(); });
  App.act('task-del', function (el) {
    var x = App.byId(D().tasks, el.dataset.id);
    return App.confirm(t('Delete the task “{t}”?', { t: x.title }), { danger: true, ok: t('Delete') }).then(function (ok) {
      if (!ok) return;
      return App.del('tasks', x.id).then(function () { App.closeModals(); App.toast(t('Task deleted')); App.refresh(); });
    });
  });

  // ------------------------------------------------------------ focus timer (25 minutes)
  var focus = null;
  App.act('focus-start', function (el) {
    var x = App.byId(D().tasks, el.dataset.id);
    App.closeModals();
    if (focus) stopFocus(false);
    focus = { id: x.id, title: x.title, end: Date.now() + 25 * 60000, start: Date.now(), paused: 0, timer: null, M: S.M };
    var box = document.createElement('div');
    box.className = 'focus-box';
    box.id = 'focus-box';
    document.body.appendChild(box);
    tick();
    focus.timer = setInterval(tick, 1000);
  });
  function tick() {
    if (!focus) return;
    var box = document.getElementById('focus-box');
    var left = focus.paused ? focus.paused : Math.max(0, focus.end - Date.now());
    var mm = Math.floor(left / 60000), ss = Math.floor(left % 60000 / 1000);
    box.innerHTML = h`<div class="fb-time">${App.icon('bolt')}<b>${(mm < 10 ? '0' : '') + mm}:${(ss < 10 ? '0' : '') + ss}</b></div><div class="fb-task">${focus.title}</div>
      <div class="fb-actions"><button type="button" class="icon-btn sm" data-act="focus-pause" aria-label="${focus.paused ? t('Resume') : t('Pause')}">${App.icon(focus.paused ? 'play' : 'pause')}</button>
      <button type="button" class="icon-btn sm" data-act="focus-stop" aria-label="${t('Stop')}">${App.icon('check')}</button></div>`.s;
    document.title = (focus.paused ? '⏸ ' : '⏱ ') + (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss + ' — ' + App.title();
    if (!focus.paused && left <= 0) { try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ } stopFocus(true); }
  }
  App.act('focus-pause', function () {
    if (!focus) return;
    if (focus.paused) { focus.end = Date.now() + focus.paused; focus.paused = 0; } else focus.paused = Math.max(0, focus.end - Date.now());
    tick();
  });
  App.act('focus-stop', function () { stopFocus(true); });
  function stopFocus(ask) {
    if (!focus) return;
    clearInterval(focus.timer);
    var f = focus;
    focus = null;
    var box = document.getElementById('focus-box');
    if (box) box.remove();
    document.title = App.title();
    var minutes = Math.round(((f.paused ? (f.end - f.start) - f.paused : Math.min(Date.now(), f.end) - f.start)) / 60000);
    if (!ask || minutes < 1) return;
    App.confirm(t('Focus session finished: {n} min on “{t}”. Add this time to the task?', { n: minutes, t: f.title }), { ok: t('Add the time') }).then(function (ok) {
      if (!ok) return;
      var prev = S.M; S.M = f.M;
      var x = App.byId(S.M.D.tasks, f.id);
      var spent = Math.round(((Number(x && x.spent) || 0) + minutes / 60) * 100) / 100;
      App.save('tasks', { id: f.id, spent: spent }).then(function () { S.M = prev; App.toast(t('Time added')); App.refresh(); }, function (e) { S.M = prev; App.fail(e); });
    });
  }

  // ------------------------------------------------------------ priority matrix
  P.matrix = function () {
    var d = D(), ro = !editable();
    var list = d.tasks.filter(function (x) { return ui.showDone || x.status !== 'done'; });
    var tray = list.filter(function (x) { return !x.quadrant; }).sort(byDue);
    var mini = function (x) {
      return h`<article class="mcard ${x.status === 'done' ? 'is-done' : ''}" ${ro ? '' : App.raw('draggable="true"')} data-id="${x.id}" data-act="task-edit" tabindex="0">
        <span class="mc-title">${x.title}</span><span class="mc-meta">${dueChip(x)}${who(x.assignee)}
        ${ro ? '' : h`<select class="tc-move" data-chg="task-quad" data-id="${x.id}" aria-label="${t('Move to')}"><option value="">${t('Not classified')}</option>${App.join(['q1', 'q2', 'q3', 'q4'], function (q) { return App.opt(q, t(QUAD[q].title), x.quadrant); })}</select>`}</span></article>`;
    };
    var quad = function (q) {
      var items = list.filter(function (x) { return x.quadrant === q; }).sort(byDue);
      return h`<section class="quad ${q}" data-quad="${q}"><header><h2>${t(QUAD[q].title)}</h2><small>${t(QUAD[q].sub)}</small><span class="count">${items.length}</span>
        ${ro ? '' : h`<button type="button" class="icon-btn sm" data-act="task-new" data-quad="${q}" aria-label="${t('New task')}">${App.icon('plus')}</button>`}</header>
        <div class="quad-drop" data-quad="${q}">${App.join(items, mini)}</div></section>`;
    };
    return h`${banner()}${pageHead(t('Priority matrix'), t('Classify every task by urgency and importance, then work on “Do now” first and protect time for “Plan it”.'),
      h`<label class="check"><input type="checkbox" data-chg="ui" data-k="showDone" ${App.checked(ui.showDone)}><span>${t('Show done tasks')}</span></label>`)}
      <section class="card tray"><header class="card-head"><h2>${t('Not classified yet')} <span class="count">${tray.length}</span></h2><small class="muted">${t('Drag each task into a box')}</small></header>
        <div class="quad-drop tray-drop" data-quad="">${tray.length ? App.join(tray, mini) : h`<p class="muted">${t('All tasks are classified.')}</p>`}</div></section>
      <div class="matrix">
        <div class="axis-top"><span>${t('Urgent')}</span><span>${t('Not urgent')}</span></div>
        <div class="axis-left"><span>${t('Important')}</span><span>${t('Less important')}</span></div>
        <div class="quads">${quad('q1')}${quad('q2')}${quad('q3')}${quad('q4')}</div>
      </div>`;
  };

  App.chg('task-quad', function (el) { return setQuad(el.dataset.id, el.value); });
  function setQuad(id, q) {
    var x = App.byId(D().tasks, id);
    if (!x || x.quadrant === q) return;
    var rec = { id: id, quadrant: q };
    if (q) rec.priority = QUAD_PRIORITY[q];
    var old = { quadrant: x.quadrant, priority: x.priority };
    x.quadrant = q; if (q) x.priority = rec.priority;
    App.refresh();
    return App.save('tasks', rec).then(function () { App.refresh(); }, function (e) { x.quadrant = old.quadrant; x.priority = old.priority; App.refresh(); App.fail(e); });
  }
  App.bindMatrix = function () {
    var main = document.getElementById('main'), dragId = null;
    main.querySelectorAll('.mcard[draggable]').forEach(function (c) {
      c.addEventListener('dragstart', function (e) { dragId = c.dataset.id; c.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', dragId); } catch (x) { /* ignore */ } });
      c.addEventListener('dragend', function () { c.classList.remove('dragging'); dragId = null; });
    });
    main.querySelectorAll('.quad-drop').forEach(function (z) {
      z.addEventListener('dragover', function (e) { if (dragId) { e.preventDefault(); z.classList.add('over'); } });
      z.addEventListener('dragleave', function (e) { if (!z.contains(e.relatedTarget)) z.classList.remove('over'); });
      z.addEventListener('drop', function (e) { e.preventDefault(); z.classList.remove('over'); var id = dragId || e.dataTransfer.getData('text/plain'); if (id) setQuad(id, z.dataset.quad); });
    });
  };

  // ------------------------------------------------------------ milestones and timeline
  P.timeline = function () {
    var d = D(), c = cfg(), ms = msSorted(), ro = !editable(), today = App.today();
    var dates = [];
    ms.forEach(function (m) { if (m.startDate) dates.push(m.startDate); if (m.dueDate) dates.push(m.dueDate); });
    var withTasks = ui.ganttTasks ? d.tasks.filter(function (x) { return x.dueDate; }) : [];
    withTasks.forEach(function (x) { dates.push(x.startDate || x.dueDate, x.dueDate); });
    [c.start_date, c.deposit_date, c.defense_date, d.team.defenseDate].forEach(function (x) { if (x) dates.push(x); });
    var gantt = '';
    if (ms.some(function (m) { return m.dueDate; }) || withTasks.length) {
      dates.push(today);
      dates.sort();
      var from = App.addDays(dates[0], -3), to = App.addDays(dates[dates.length - 1], 7);
      var rows = [];
      ms.forEach(function (m, i) {
        var start = m.startDate || (i > 0 && ms[i - 1].dueDate) || c.start_date || String(d.team.createdAt || '').slice(0, 10);
        var kind = m.status === 'done' ? 'k-done' : msLate(m) ? 'k-late' : m.status === 'doing' || m.progress > 0 ? 'k-doing' : 'k-todo';
        rows.push({ label: App.tv(m.title), start: start && start <= m.dueDate ? start : m.dueDate, end: m.dueDate, kind: kind, pct: m.status === 'done' ? 100 : Number(m.progress) || 0, tip: (m.status === 'done' ? 100 : Number(m.progress) || 0) + '%' + (msLate(m) ? ' · ' + t('late') : '') });
        withTasks.filter(function (x) { return x.milestoneId === m.id; }).forEach(function (x) { rows.push(taskRow(x)); });
      });
      withTasks.filter(function (x) { return !x.milestoneId || !App.byId(ms, x.milestoneId); }).forEach(function (x) { rows.push(taskRow(x)); });
      [[c.deposit_date, t('Thesis deposit')], [d.team.defenseDate || c.defense_date, t('Defence')]].forEach(function (p) { if (p[0]) rows.push({ label: p[1], end: p[0], point: true, kind: 'k-key' }); });
      gantt = App.Charts.gantt({ from: from, to: to, rows: rows, today: today });
    }
    function taskRow(x) { return { label: x.title, sub: true, start: x.startDate || x.dueDate, end: x.dueDate, kind: x.status === 'done' ? 'k-done' : isOverdue(x) ? 'k-late' : 'k-task', tip: label(STATUS, x.status) }; }

    return h`${banner()}${pageHead(t('Milestones and timeline'), t('The big steps of the project. Keep their dates and progress up to date.'), ro ? '' : btn('ms-new', t('New milestone'), 'plus', 'primary'))}
      <section class="card"><header class="card-head"><h2>${App.icon('timeline')}${t('Timeline')}</h2>
        <label class="check"><input type="checkbox" data-chg="ui" data-k="ganttTasks" ${App.checked(ui.ganttTasks)}><span>${t('Show tasks with dates')}</span></label></header>
        ${gantt || App.empty(t('Add due dates to the milestones to see the timeline.'))}
        <div class="legend"><span class="key"><i class="sw rect k-done"></i>${t('Done')}</span><span class="key"><i class="sw rect k-doing"></i>${t('In progress')}</span>
          <span class="key"><i class="sw rect k-todo"></i>${t('Not started')}</span><span class="key"><i class="sw rect k-late"></i>${App.icon('alert')}${t('Late')}</span>${ui.ganttTasks ? h`<span class="key"><i class="sw rect k-task"></i>${t('Task')}</span>` : ''}</div>
      </section>
      <section class="card"><header class="card-head"><h2>${App.icon('flag')}${t('Milestones')}</h2></header>
        ${ms.length ? h`<div class="ms-list">${App.join(ms, function (m, i) {
          var late = msLate(m), nTasks = d.tasks.filter(function (x) { return x.milestoneId === m.id; });
          var nDone = nTasks.filter(function (x) { return x.status === 'done'; }).length;
          return h`<div class="ms-row ${late ? 'late' : ''} ${m.status === 'done' ? 'is-done' : ''}">
            <div class="ms-order">${ro ? '' : h`<button type="button" class="icon-btn sm" data-act="ms-move" data-id="${m.id}" data-dir="-1" ${i === 0 ? App.raw('disabled') : ''} aria-label="${t('Move up')}">${App.icon('up')}</button>
              <button type="button" class="icon-btn sm" data-act="ms-move" data-id="${m.id}" data-dir="1" ${i === ms.length - 1 ? App.raw('disabled') : ''} aria-label="${t('Move down')}">${App.icon('down')}</button>`}</div>
            <div class="ms-main"><button type="button" class="link ms-title" data-act="ms-edit" data-id="${m.id}">${App.tv(m.title)}</button>
              <div class="ms-sub">${m.startDate ? App.fmt(m.startDate) + ' → ' : ''}${m.dueDate ? h`<b>${App.fmt(m.dueDate)}</b>` : h`<i>${t('no due date')}</i>`}
                ${late ? h`<span class="chip late">${App.icon('alert')}${t('late')}</span>` : ''}${nTasks.length ? h`<span class="chip muted">${t('{a}/{b} tasks', { a: nDone, b: nTasks.length })}</span>` : ''}
                ${App.safeUrl(m.deliverableUrl) ? h`<a class="chip accent" href="${App.safeUrl(m.deliverableUrl)}" target="_blank" rel="noopener noreferrer">${App.icon('link')}${t('Deliverable')}</a>` : ''}</div></div>
            <div class="ms-prog"><input type="range" min="0" max="100" step="10" value="${m.status === 'done' ? 100 : m.progress || 0}" data-chg="ms-progress" data-id="${m.id}" aria-label="${t('Progress')}" ${ro ? App.raw('disabled') : ''}><b>${m.status === 'done' ? 100 : m.progress || 0}%</b></div>
            <select class="status-select ms-${m.status}" data-chg="ms-status" data-id="${m.id}" aria-label="${t('Status')}" ${ro ? App.raw('disabled') : ''}>${opts(MS_STATUS, m.status)}</select>
          </div>`;
        })}</div>` : App.empty(t('No milestone yet.'))}
      </section>`;
  };

  App.act('ms-new', function () { openMs({}); });
  App.act('ms-edit', function (el) { var m = App.byId(D().milestones, el.dataset.id); if (m) openMs(m); });
  function openMs(m) {
    var isNew = !m.id, ro = !editable();
    App.modal({
      title: isNew ? t('New milestone') : t('Edit the milestone'), submit: isNew ? t('Create') : t('Save'),
      body: h`<div class="form-grid">
        <label class="span2">${t('Title')} <em>*</em><input name="title" required maxlength="200" value="${m.title ? App.tv(m.title) : ''}"></label>
        <label class="span2">${t('Description / expected deliverable')}<textarea name="description" rows="3" maxlength="2000">${m.description || ''}</textarea></label>
        <label>${t('Start date')}<input type="date" name="startDate" value="${m.startDate || ''}"></label>
        <label>${t('Due date')}<input type="date" name="dueDate" value="${m.dueDate || ''}"></label>
        <label>${t('Status')}<select name="status">${opts(MS_STATUS, m.status || 'todo')}</select></label>
        <label>${t('Progress (%)')}<input type="number" name="progress" min="0" max="100" step="5" value="${m.progress || 0}"></label>
        <label class="span2">${t('Link to the deliverable (Drive, GitHub, Overleaf…)')}<input type="url" name="deliverableUrl" maxlength="1000" value="${m.deliverableUrl || ''}" placeholder="https://"></label></div>`,
      left: isNew || ro ? '' : h`<button type="button" class="btn ghost danger-text" data-act="ms-del" data-id="${m.id}">${App.icon('trash')}<span>${t('Delete')}</span></button>`,
      onSubmit: ro ? null : function (data) {
        if (data.startDate && data.dueDate && data.dueDate < data.startDate) throw new App.ApiError('VALIDATION', t('the due date is before the start date'));
        var rec = { title: data.title, description: data.description, startDate: data.startDate, dueDate: data.dueDate, status: data.status, progress: data.progress, deliverableUrl: data.deliverableUrl };
        if (!isNew) { rec.id = m.id; if (App.tv(m.title) === data.title) delete rec.title; }
        return App.save('milestones', rec).then(function () { App.toast(t('Milestone saved')); App.refresh(); });
      }
    });
  }
  App.act('ms-del', function (el) {
    var m = App.byId(D().milestones, el.dataset.id);
    return App.confirm(t('Delete the milestone “{t}”?', { t: App.tv(m.title) }), { danger: true, ok: t('Delete') }).then(function (ok) {
      if (!ok) return;
      return App.del('milestones', m.id).then(function () { App.closeModals(); App.refresh(); });
    });
  });
  App.act('ms-move', function (el) {
    var ms = msSorted(), i = ms.findIndex(function (m) { return m.id === el.dataset.id; }), j = i + Number(el.dataset.dir);
    if (j < 0 || j >= ms.length) return;
    var a = ms[i], b = ms[j], oa = Number(a.order) || i, ob = Number(b.order) || j;
    if (oa === ob) ob = oa + Number(el.dataset.dir);
    return App.saveMany('milestones', [{ id: a.id, order: ob }, { id: b.id, order: oa }]).then(function () { App.refresh(); });
  });
  App.chg('ms-progress', function (el) {
    var v = Number(el.value);
    return App.save('milestones', { id: el.dataset.id, progress: v, status: v >= 100 ? 'done' : v > 0 ? 'doing' : 'todo' }).then(function () { App.refresh(); });
  });
  App.chg('ms-status', function (el) { return App.save('milestones', { id: el.dataset.id, status: el.value }).then(function () { App.refresh(); }); });

  // ------------------------------------------------------------ meetings
  P.meetings = function () {
    var d = D(), ro = !editable();
    var list = d.meetings.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return h`${banner()}${pageHead(t('Meetings'), t('Minutes of the meetings: what was said, what was decided, who does what.'), ro ? '' : btn('mt-new', t('New meeting'), 'plus', 'primary'))}
      ${list.length ? App.join(list, function (m) {
        var actions = (m.actions || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        return h`<section class="card meeting"><header class="card-head"><h2>${App.icon('meeting')}${App.fmt(m.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
          <span class="chip muted">${label(MEETING_TYPES, m.type)}</span>
          <div class="actions">${ro ? '' : h`<button type="button" class="icon-btn sm" data-act="mt-edit" data-id="${m.id}" aria-label="${t('Edit')}">${App.icon('edit')}</button>`}</div></header>
          ${m.participants ? h`<p class="muted">${App.icon('users')}${m.participants}</p>` : ''}
          ${m.summary ? h`<h3 class="mini-title">${t('Summary')}</h3><p>${App.linkify(m.summary)}</p>` : ''}
          ${m.decisions ? h`<h3 class="mini-title">${t('Decisions')}</h3><p>${App.linkify(m.decisions)}</p>` : ''}
          ${actions.length ? h`<h3 class="mini-title">${t('Actions')}</h3><ul class="actions-list">${App.join(actions, function (a) { return h`<li>${a}</li>`; })}</ul>
            ${ro ? '' : h`<button type="button" class="btn sm ghost" data-act="mt-tasks" data-id="${m.id}">${App.icon('plus')}<span>${t('Turn the actions into tasks')}</span></button>`}` : ''}
        </section>`;
      }) : App.empty(t('No meeting recorded yet.'), ro ? '' : btn('mt-new', t('Record a meeting'), 'plus', 'primary'))}`;
  };
  App.act('mt-new', function () { openMeeting({ date: App.today(), type: 'supervisor' }); });
  App.act('mt-edit', function (el) { openMeeting(App.byId(D().meetings, el.dataset.id)); });
  function openMeeting(m) {
    var isNew = !m.id, d = D();
    App.modal({
      title: isNew ? t('New meeting') : t('Edit the meeting'), wide: true,
      body: h`<div class="form-grid">
        <label>${t('Date')} <em>*</em><input type="date" name="date" required value="${m.date || ''}"></label>
        <label>${t('Type')}<select name="type">${opts(MEETING_TYPES, m.type)}</select></label>
        <label class="span2">${t('Participants')}<input name="participants" maxlength="300" value="${m.participants || (isNew ? d.members.map(App.fullName).join(', ') : '')}"></label>
        <label class="span2">${t('Summary')}<textarea name="summary" rows="4" maxlength="4000">${m.summary || ''}</textarea></label>
        <label class="span2">${t('Decisions')}<textarea name="decisions" rows="3" maxlength="4000">${m.decisions || ''}</textarea></label>
        <label class="span2">${t('Actions to do (one per line)')}<textarea name="actions" rows="3" maxlength="4000">${m.actions || ''}</textarea></label></div>`,
      left: isNew ? '' : h`<button type="button" class="btn ghost danger-text" data-act="mt-del" data-id="${m.id}">${App.icon('trash')}<span>${t('Delete')}</span></button>`,
      onSubmit: function (data) {
        if (!isNew) data.id = m.id;
        return App.save('meetings', data).then(function () { App.toast(t('Meeting saved')); App.refresh(); });
      }
    });
  }
  App.act('mt-del', function (el) {
    return App.confirm(t('Delete this meeting?'), { danger: true, ok: t('Delete') }).then(function (ok) {
      if (!ok) return;
      return App.del('meetings', el.dataset.id).then(function () { App.closeModals(); App.refresh(); });
    });
  });
  App.act('mt-tasks', function (el) {
    var m = App.byId(D().meetings, el.dataset.id);
    var lines = (m.actions || '').split('\n').map(function (s) { return s.replace(/^[-*•\d.)\s]+/, '').trim(); }).filter(Boolean);
    var cats = cfg().task_categories || [];
    return App.confirm(h`${t('Create {n} task(s) for this week?', { n: lines.length })}<ul>${App.join(lines, function (l) { return h`<li>${l}</li>`; })}</ul>`, { ok: t('Create the tasks') }).then(function (ok) {
      if (!ok) return;
      return App.saveMany('tasks', lines.map(function (l) { return { title: l.slice(0, 200), week: App.curWeek(), category: cats.indexOf('Meeting') >= 0 ? 'Meeting' : '' }; })).then(function () { App.toast(t('Tasks created')); App.refresh(); });
    });
  });

  // ------------------------------------------------------------ journal (notes, ideas, remarks, risks)
  P.journal = function () {
    var d = D(), ro = !editable(), f = ui.noteType || '';
    var list = d.notes.filter(function (n) { return !f || n.type === f; }).sort(function (a, b) { return (b.pinned - a.pinned) || (a.updatedAt < b.updatedAt ? 1 : -1); });
    return h`${banner()}${pageHead(t('Journal'), t('Notes, ideas, remarks, problems and risks of the project.'), ro ? '' : btn('nt-new', t('New note'), 'plus', 'primary'))}
      <div class="chips-filter"><button type="button" class="chip ${!f ? 'on' : ''}" data-act="ui" data-k="noteType" data-v="">${t('All')} · ${d.notes.length}</button>
        ${App.join(NOTE_TYPES, function (n) { var c = d.notes.filter(function (x) { return x.type === n[0]; }).length; return h`<button type="button" class="chip nt-${n[0]} ${f === n[0] ? 'on' : ''}" data-act="ui" data-k="noteType" data-v="${n[0]}">${t(n[1])} · ${c}</button>`; })}</div>
      ${list.length ? h`<div class="notes">${App.join(list, function (n) {
        return h`<article class="note nt-${n.type}" data-act="${ro ? '' : 'nt-edit'}" data-id="${n.id}" tabindex="0">
          <header><span class="chip nt-${n.type}">${label(NOTE_TYPES, n.type)}</span>${n.pinned ? App.icon('pin') : ''}</header>
          ${n.title ? h`<h3>${n.title}</h3>` : ''}<p>${App.linkify(n.body.length > 400 ? n.body.slice(0, 400) + '…' : n.body)}</p>
          <footer>${n.createdBy || ''} · ${App.ago(n.updatedAt)}</footer></article>`;
      })}</div>` : App.empty(t('Nothing written yet.'))}`;
  };
  App.act('nt-new', function () { openNote({ type: ui.noteType || 'note' }); });
  App.act('nt-edit', function (el) { openNote(App.byId(D().notes, el.dataset.id)); });
  function openNote(n) {
    var isNew = !n.id;
    App.modal({
      title: isNew ? t('New note') : t('Edit the note'),
      body: h`<div class="form-grid"><label>${t('Type')}<select name="type">${opts(NOTE_TYPES, n.type)}</select></label>
        <label class="check pin-check"><input type="checkbox" name="pinned" ${App.checked(n.pinned)}><span>${t('Pin at the top')}</span></label>
        <label class="span2">${t('Title')}<input name="title" maxlength="200" value="${n.title || ''}"></label>
        <label class="span2">${t('Text')}<textarea name="body" rows="7" maxlength="5000">${n.body || ''}</textarea></label></div>`,
      left: isNew ? '' : h`<button type="button" class="btn ghost danger-text" data-act="nt-del" data-id="${n.id}">${App.icon('trash')}<span>${t('Delete')}</span></button>`,
      onSubmit: function (data) {
        if (!data.title.trim() && !data.body.trim()) throw new App.ApiError('VALIDATION', t('write a title or a text'));
        if (!isNew) data.id = n.id;
        return App.save('notes', data).then(function () { App.refresh(); });
      }
    });
  }
  App.act('nt-del', function (el) {
    return App.confirm(t('Delete this note?'), { danger: true, ok: t('Delete') }).then(function (ok) {
      if (!ok) return;
      return App.del('notes', el.dataset.id).then(function () { App.closeModals(); App.refresh(); });
    });
  });

  // ------------------------------------------------------------ resources: links, references, deliverables
  var KINDS = [['link', 'Links'], ['reference', 'References'], ['deliverable', 'Deliverables']];
  P.resources = function (prm) {
    var d = D(), ro = !editable(), kind = prm && prm.k && KINDS.some(function (k) { return k[0] === prm.k; }) ? prm.k : 'link';
    var list = d.resources.filter(function (r) { return r.kind === kind; }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    var addLabel = { link: t('New link'), reference: t('New reference'), deliverable: t('Submit a deliverable') }[kind];
    return h`${banner()}${pageHead(t('Resources'), t('Useful links, the bibliography and the deliverables you submit to the supervisor.'), ro ? '' : btn('rs-new', addLabel, 'plus', 'primary', 'data-kind="' + kind + '"'))}
      <nav class="tabs">${App.join(KINDS, function (k) {
        var n = d.resources.filter(function (r) { return r.kind === k[0]; }).length;
        return h`<a href="${link('resources/' + k[0])}" class="${k[0] === kind ? 'on' : ''}">${t(k[1])} <span class="count">${n}</span></a>`;
      })}</nav>
      ${kind === 'reference' && list.length ? h`<div class="toolbar">${btn('rs-copyrefs', t('Copy the reference list'), 'copy', 'sm ghost')}</div>` : ''}
      ${list.length ? h`<div class="res-list">${App.join(list, function (r) { return resRow(r, ro); })}</div>` : App.empty({
        link: t('No link yet. Add your Drive folder, GitHub repository, Overleaf project…'),
        reference: t('No reference yet. Keep here the papers and books you read.'),
        deliverable: t('No deliverable yet. Submit here each version of a chapter or report for review.')
      }[kind])}`;
  };
  function resRow(r, ro) {
    var url = App.safeUrl(r.url);
    var st = r.kind === 'reference' ? label(REF_STATUS, r.status) : r.kind === 'deliverable' ? label(DEL_STATUS, r.status) : '';
    return h`<article class="res res-${r.kind}">
      <span class="res-ic">${App.icon(r.kind === 'link' ? 'link' : r.kind === 'reference' ? 'book' : 'file')}</span>
      <div class="res-main"><div class="res-title">${url ? h`<a href="${url}" target="_blank" rel="noopener noreferrer">${r.title}</a>` : r.title}${r.version ? h` <span class="chip muted">${r.version}</span>` : ''}</div>
        <div class="res-sub">${r.authors ? r.authors + (r.year ? ' (' + r.year + ')' : '') + ' · ' : ''}${st ? h`<span class="chip ds-${r.status}">${st}</span>` : ''} <small>${r.createdBy || ''} · ${App.fmt(String(r.createdAt).slice(0, 10))}</small></div>
        ${r.notes ? h`<p class="res-notes">${App.linkify(r.notes)}</p>` : ''}
        ${r.adminComment ? h`<p class="res-admin">${App.icon('star')}<b>${t('Supervisor')}:</b> ${App.linkify(r.adminComment)}</p>` : ''}</div>
      ${ro && !M().admin ? '' : h`<button type="button" class="icon-btn sm" data-act="rs-edit" data-id="${r.id}" aria-label="${t('Edit')}">${App.icon('edit')}</button>`}
    </article>`;
  }
  App.act('rs-new', function (el) { openRes({ kind: el.dataset.kind || 'link' }); });
  App.act('rs-edit', function (el) { openRes(App.byId(D().resources, el.dataset.id)); });
  function openRes(r) {
    var isNew = !r.id, k = r.kind, admin = M().admin;
    App.modal({
      title: isNew ? { link: t('New link'), reference: t('New reference'), deliverable: t('Submit a deliverable') }[k] : t('Edit'),
      body: h`<div class="form-grid">
        <label class="span2">${k === 'reference' ? t('Title of the paper or book') : t('Title')} <em>*</em><input name="title" required maxlength="300" value="${r.title || ''}"></label>
        <label class="span2">${t('Link')}<input type="url" name="url" maxlength="1000" value="${r.url || ''}" placeholder="https://"></label>
        ${k === 'reference' ? h`<label>${t('Authors')}<input name="authors" maxlength="300" value="${r.authors || ''}"></label>
          <label>${t('Year')}<input name="year" maxlength="20" value="${r.year || ''}"></label>
          <label class="span2">${t('Reading status')}<select name="status">${opts(REF_STATUS, r.status || 'toread')}</select></label>` : ''}
        ${k === 'deliverable' ? h`<label>${t('Version')}<input name="version" maxlength="40" value="${r.version || ''}" placeholder="v1"></label>
          <label>${t('Milestone')}<select name="milestoneId"><option value="">—</option>${App.join(msSorted(), function (m) { return App.opt(m.id, App.tv(m.title), r.milestoneId); })}</select></label>` : ''}
        <label class="span2">${k === 'reference' ? t('Notes / summary') : t('Notes')}<textarea name="notes" rows="3" maxlength="4000">${r.notes || ''}</textarea></label>
        ${k === 'deliverable' && admin ? h`<label>${t('Your verdict')}<select name="status">${opts(DEL_STATUS, r.status || 'submitted')}</select></label>
          <label class="span2">${t('Your comment for the team')}<textarea name="adminComment" rows="3" maxlength="2000">${r.adminComment || ''}</textarea></label>` : ''}
      </div>`,
      left: isNew ? '' : h`<button type="button" class="btn ghost danger-text" data-act="rs-del" data-id="${r.id}">${App.icon('trash')}<span>${t('Delete')}</span></button>`,
      onSubmit: function (data) {
        data.kind = k;
        if (!isNew) data.id = r.id;
        return App.save('resources', data).then(function () { App.toast(t('Saved')); App.refresh(); });
      }
    });
  }
  App.act('rs-del', function (el) {
    return App.confirm(t('Delete this item?'), { danger: true, ok: t('Delete') }).then(function (ok) {
      if (!ok) return;
      return App.del('resources', el.dataset.id).then(function () { App.closeModals(); App.refresh(); });
    });
  });
  App.act('rs-copyrefs', function () {
    var refs = D().resources.filter(function (r) { return r.kind === 'reference'; }).sort(function (a, b) { return (a.authors || a.title).localeCompare(b.authors || b.title); });
    App.copy(refs.map(function (r, i) { return '[' + (i + 1) + '] ' + (r.authors ? r.authors + ' ' : '') + (r.year ? '(' + r.year + '). ' : '') + r.title + '.' + (r.url ? ' ' + r.url : ''); }).join('\n'));
  });

  // ------------------------------------------------------------ messages with the supervisor
  P.messages = function () {
    var d = D(), admin = M().admin, ro = !editable() && !admin;
    if (unreadFor(d, admin) && !App.readingNow) {
      App.readingNow = true;
      App.teamCall(admin ? 'admin.messageRead' : 'message.read', {}).then(function () {
        d.messages.forEach(function (m) { if (admin && m.sender === 'team') m.readByAdmin = true; if (!admin && m.sender === 'admin') m.readByTeam = true; });
        App.readingNow = false;
        App.refreshNav();
      }, function () { App.readingNow = false; });
    }
    var list = d.messages.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    return h`${banner()}${pageHead(t('Messages'), admin ? t('Conversation with team {id}.', { id: d.team.id }) : t('Ask your questions and give news to your supervisor, {name}.', { name: cfg().supervisor_name || '' }))}
      <section class="card chat">
        <div class="thread" id="thread">${list.length ? App.join(list, function (m) {
          var mine = admin ? m.sender === 'admin' : m.sender === 'team';
          return h`<div class="msg ${mine ? 'mine' : 'theirs'} ${m.sender}"><div class="bubble">${App.linkify(m.body)}</div>
            <small>${m.sender === 'admin' ? (cfg().supervisor_name || t('Supervisor')) : m.author} · ${App.fmtTime(m.createdAt)}</small></div>`;
        }) : App.empty(t('No message yet. Write the first one!'))}</div>
        ${ro ? '' : h`<form data-form="msg" class="composer"><textarea name="body" rows="2" maxlength="3000" required data-draft="msg.${d.team.id}" placeholder="${t('Write a message…')}">${App.draft('msg.' + d.team.id, '')}</textarea>
          <button class="btn primary" type="submit">${App.icon('send')}<span>${t('Send')}</span></button></form>`}
      </section>`;
  };
  App.form('msg', function (f, data) {
    var body = String(data.body || '').trim();
    if (!body) return;
    var d = D(), admin = M().admin;
    return App.teamCall(admin ? 'admin.message' : 'message.send', { body: body }).then(function (m) {
      d.messages.push(m);
      App.clearDrafts('msg.' + d.team.id);
      App.refresh();
      var th = document.getElementById('thread');
      if (th) th.scrollTop = th.scrollHeight;
    });
  });
  App.scrollThread = function () { var th = document.getElementById('thread'); if (th) th.scrollTop = th.scrollHeight; };

  // ------------------------------------------------------------ announcements
  P.news = function () {
    var d = D();
    var list = d.announcements.slice().sort(function (a, b) { return (b.pinned - a.pinned) || (a.createdAt < b.createdAt ? 1 : -1); });
    if (!M().admin && list.length) App.local.set('seenAnn.' + d.team.id, list.reduce(function (m, a) { return a.createdAt > m ? a.createdAt : m; }, ''));
    return h`${pageHead(t('Announcements'), t('Information from your supervisor for all the teams.'))}
      ${list.length ? App.join(list, function (a) {
        return h`<section class="card ann">${a.pinned ? h`<span class="chip accent">${App.icon('pin')}${t('Pinned')}</span>` : ''}<h2>${a.title}</h2><p>${App.linkify(a.body)}</p><small class="muted">${App.fmtTime(a.createdAt)}</small></section>`;
      }) : App.empty(t('No announcement.'))}`;
  };

  // ------------------------------------------------------------ the team: project, members, contributions
  P.team = function () {
    var d = D(), team = d.team, c = cfg(), ro = !editable(), admin = M().admin;
    var hours = {};
    d.weeks.forEach(function (w) { Object.keys(w.hours || {}).forEach(function (k) { hours[k] = (hours[k] || 0) + (Number(w.hours[k]) || 0); }); });
    var levels = c.levels || ['Licence', 'Master'], specs = (c.specialties || []).slice();
    if (team.specialty && specs.indexOf(team.specialty) < 0) specs.push(team.specialty);
    var me = App.local.get('actor.' + team.id, '');
    return h`${banner()}${pageHead(t('Team and project'), team.id + ' · ' + t('created {d}', { d: App.fmt(String(team.createdAt).slice(0, 10)) }))}
      <div class="grid two">
        <section class="card"><header class="card-head"><h2>${App.icon('target')}${t('Project')}</h2></header>
          <form data-form="team-info" class="form-grid">
            <label class="span2">${t('Title of the project')} <em>*</em><input name="title" required minlength="3" maxlength="200" value="${team.title}" ${ro ? App.raw('disabled') : ''}></label>
            <label>${t('Level')}<select name="level" ${ro ? App.raw('disabled') : ''}>${App.options(levels, team.level)}</select></label>
            <label>${t('Specialty')}<select name="specialty" ${ro ? App.raw('disabled') : ''}><option value="">—</option>${App.options(specs, team.specialty)}</select></label>
            <label class="span2">${t('Description and objectives')}<textarea name="description" rows="4" maxlength="3000" ${ro ? App.raw('disabled') : ''}>${team.description}</textarea></label>
            <label class="span2">${t('Keywords and technologies')}<input name="keywords" maxlength="300" value="${team.keywords}" ${ro ? App.raw('disabled') : ''}></label>
            <label>${t('Host organisation')}<input name="host" maxlength="200" value="${team.host}" ${ro ? App.raw('disabled') : ''}></label>
            <label>${t('External supervisor')}<input name="extSupervisor" maxlength="200" value="${team.extSupervisor}" ${ro ? App.raw('disabled') : ''}></label>
            ${ro ? '' : h`<div class="span2 form-actions"><button class="btn primary" type="submit">${t('Save')}</button></div>`}
          </form></section>
        <section class="card"><header class="card-head"><h2>${App.icon('users')}${t('Members')} <span class="count">${d.members.length}/${c.max_members || 3}</span></h2>
          ${ro || (!admin && d.members.length >= (c.max_members || 3)) ? '' : btn('mb-new', t('Add'), 'plus', 'sm')}</header>
          <div class="members">${App.join(d.members, function (m) {
            var mine = d.tasks.filter(function (x) { return x.assignee === m.id; });
            var dn = mine.filter(function (x) { return x.status === 'done'; }).length;
            return h`<div class="member">${App.avatar(m, 'lg')}<div><b>${App.fullName(m)}</b>${m.role ? h` <span class="chip muted">${m.role}</span>` : ''}
              <div class="muted small">${m.matricule}${m.email ? ' · ' + m.email : ''}${m.phone ? ' · ' + m.phone : ''}</div>
              <div class="small">${t('{a}/{b} tasks done', { a: dn, b: mine.length })} · ${t('{n} h logged', { n: Math.round((hours[m.id] || 0) * 10) / 10 })}</div></div>
              ${ro ? '' : h`<button type="button" class="icon-btn sm" data-act="mb-edit" data-id="${m.id}" aria-label="${t('Edit')}">${App.icon('edit')}</button>`}</div>`;
          })}</div>
          ${admin ? '' : h`<div class="device"><label>${t('Who uses this device?')}<select data-chg="actor">${App.opt('', t('Nobody in particular'), me)}${App.join(d.members, function (m) { return App.opt(m.id, App.fullName(m), me); })}</select></label>
            <small class="muted">${t('Your name is written next to what you do. It stays on this device only.')}</small></div>`}
        </section>
      </div>
      ${admin ? '' : h`<section class="card"><header class="card-head"><h2>${App.icon('key')}${t('Access code')}</h2></header>
        <p>${t('All the members use the same code. If you think someone else knows it, create a new one: the old code stops working immediately.')}</p>
        ${ro ? '' : btn('team-newcode', t('Create a new code'), 'refresh', 'ghost')}</section>`}`;
  };
  App.form('team-info', function (f, data) {
    var d = D();
    return App.teamCall(M().admin ? 'admin.teamUpdate' : 'team.update', { data: data }).then(function (team) {
      d.team = team;
      App.toast(t('Project saved'));
      App.refresh();
    });
  });
  App.chg('actor', function (el) {
    var d = D();
    App.local.set('actor.' + d.team.id, el.value);
    App.setActor(d);
    App.toast(t('Saved'));
    App.refreshNav();
  });
  App.act('mb-new', function () { openMember({}); });
  App.act('mb-edit', function (el) { openMember(App.byId(D().members, el.dataset.id)); });
  function openMember(m) {
    var isNew = !m.id;
    App.modal({
      title: isNew ? t('New member') : t('Edit the member'),
      body: h`<div class="form-grid">
        <label>${t('Last name')} <em>*</em><input name="lastName" required maxlength="60" value="${m.lastName || ''}"></label>
        <label>${t('First name')} <em>*</em><input name="firstName" required maxlength="60" value="${m.firstName || ''}"></label>
        <label>${t('Matricule')}<input name="matricule" maxlength="30" value="${m.matricule || ''}"></label>
        <label>${t('Role in the team')}<input name="role" maxlength="60" value="${m.role || ''}" placeholder="${t('e.g. developer, writer')}"></label>
        <label>${t('Email')}<input type="email" name="email" maxlength="120" value="${m.email || ''}"></label>
        <label>${t('Phone')}<input name="phone" maxlength="30" value="${m.phone || ''}"></label></div>`,
      left: isNew ? '' : h`<button type="button" class="btn ghost danger-text" data-act="mb-del" data-id="${m.id}">${App.icon('trash')}<span>${t('Remove')}</span></button>`,
      onSubmit: function (data) {
        if (!isNew) data.id = m.id;
        return App.save('members', data).then(function () { App.toast(t('Saved')); App.refresh(); });
      }
    });
  }
  App.act('mb-del', function (el) {
    var m = App.byId(D().members, el.dataset.id);
    return App.confirm(t('Remove {n} from the team?', { n: App.fullName(m) }), { danger: true, ok: t('Remove') }).then(function (ok) {
      if (!ok) return;
      return App.del('members', m.id).then(function () { App.closeModals(); App.refresh(); });
    });
  });
  App.act('team-newcode', function () {
    return App.confirm(t('Create a new access code? The current code will stop working for everybody, on every device.'), { ok: t('Create a new code') }).then(function (ok) {
      if (!ok) return;
      return App.api('team.newCode', {}).then(function (r) {
        S.auth.code = r.code;
        App.rememberCode(r.code);
        App.showCode(r.code, D().team, t('Your new access code'));
      });
    });
  });

  // ------------------------------------------------------------ statistics
  P.stats = function () {
    var d = D(), cw = App.curWeek(), C = App.Charts;
    var weeksSet = {};
    d.weeks.forEach(function (w) { weeksSet[w.week] = 1; });
    d.tasks.forEach(function (x) { if (x.week && x.week <= cw) weeksSet[x.week] = 1; });
    var start = d.config.start_date ? App.weekOf(d.config.start_date) : null;
    var keys = Object.keys(weeksSet).filter(function (w) { return !start || w >= start; }).sort();
    if (keys.length) { var all = []; for (var w = keys[0]; w <= cw; w = App.addDays(w, 7)) all.push(w); keys = all.slice(-12); }
    var labels = keys.map(function (w) { var n = App.pfeWeek(w); return n ? t('W{n}', { n: n }) : App.fmtShort(w); });
    var full = keys.map(function (w) { return App.weekLabel(w); });
    var planned = [], doneV = [], hrs = [], conf = [];
    keys.forEach(function (w) {
      var rec = d.weeks.filter(function (x) { return x.week === w; })[0];
      var live = d.tasks.filter(function (x) { return x.week === w; });
      var snap = rec && rec.snapshot && rec.snapshot.length ? rec.snapshot : null;
      var list = snap ? snap.concat(live.filter(function (x) { return !snap.some(function (s) { return s.id === x.id; }); })) : live;
      planned.push(list.length);
      doneV.push(list.filter(function (x) { var cur = App.byId(d.tasks, x.id); return (cur && cur.week === w ? cur.status : x.status) === 'done'; }).length);
      hrs.push(rec ? Object.keys(rec.hours || {}).reduce(function (s, k) { return s + (Number(rec.hours[k]) || 0); }, 0) : 0);
      conf.push(rec && rec.confidence ? Number(rec.confidence) : null);
    });
    var obst = {};
    var seen = {};
    d.weeks.forEach(function (w) { (w.snapshot || []).forEach(function (s) { if (s.obstacle && s.status !== 'done') { obst[s.obstacle] = (obst[s.obstacle] || 0) + 1; seen[s.id + w.week] = 1; } }); });
    d.tasks.forEach(function (x) { if (x.obstacle && x.status !== 'done' && !seen[x.id + x.week]) obst[x.obstacle] = (obst[x.obstacle] || 0) + 1; });
    var obstItems = Object.keys(obst).map(function (k) { return { label: App.tv(k), value: obst[k] }; }).sort(function (a, b) { return b.value - a.value; });
    var stItems = STATUS.map(function (s) { return { label: t(s[1]), value: d.tasks.filter(function (x) { return x.status === s[0]; }).length, cls: 'st-' + s[0] }; });
    var hoursBy = {};
    d.weeks.forEach(function (w) { Object.keys(w.hours || {}).forEach(function (k) { hoursBy[k] = (hoursBy[k] || 0) + (Number(w.hours[k]) || 0); }); });
    var est = d.tasks.reduce(function (s, x) { return s + (Number(x.estimate) || 0); }, 0), spent = d.tasks.reduce(function (s, x) { return s + (Number(x.spent) || 0); }, 0);
    return h`${pageHead(t('Statistics'), t('How the work goes, week after week.'))}
      <div class="grid two">
        ${card(t('Planned and done tasks per week'), C.columns({ title: t('Planned and done tasks per week'), labels: labels, tableLabels: full, series: [{ name: t('Planned'), values: planned, slot: 1 }, { name: t('Done'), values: doneV, slot: 3 }] }))}
        ${card(t('Hours worked per week'), C.columns({ title: t('Hours worked per week'), labels: labels, tableLabels: full, unit: 'h', series: [{ name: t('Hours'), values: hrs, slot: 1 }] }))}
        ${card(t('Confidence to finish on time'), C.line({ title: t('Confidence'), name: t('Confidence'), labels: labels, values: conf, min: 1, max: 5, fmt: function (v) { return v + '/5 · ' + label(CONF, v); } }))}
        ${card(t('Obstacles of the unfinished tasks'), C.hbars(obstItems, { empty: t('No obstacle reported. Great!') }))}
        ${card(t('Tasks by status'), C.segbar(stItems))}
        ${card(t('Contribution of each member'), h`<div class="table-wrap"><table class="table"><thead><tr><th>${t('Member')}</th><th class="num">${t('Tasks')}</th><th class="num">${t('Done')}</th><th class="num">${t('Hours')}</th></tr></thead>
          <tbody>${App.join(d.members, function (m) {
            var mine = d.tasks.filter(function (x) { return x.assignee === m.id; });
            return h`<tr><th scope="row">${App.fullName(m)}</th><td class="num">${mine.length}</td><td class="num">${mine.filter(function (x) { return x.status === 'done'; }).length}</td><td class="num">${Math.round((hoursBy[m.id] || 0) * 10) / 10}</td></tr>`;
          })}</tbody></table></div>
          <p class="muted small">${t('Estimated time of all tasks: {a} h · time spent recorded: {b} h', { a: Math.round(est * 10) / 10, b: Math.round(spent * 10) / 10 })}</p>`)}
      </div>`;
  };

  // ------------------------------------------------------------ printable follow-up sheet
  P.report = function () {
    var d = D(), team = d.team, c = cfg();
    var weeks = d.weeks.filter(function (w) { return w.status !== 'draft' || w.done; }).sort(function (a, b) { return a.week < b.week ? -1 : 1; });
    var ms = msSorted();
    var meetings = d.meetings.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return h`<div class="no-print">${pageHead(t('Follow-up sheet'), t('A printable summary of the project: weekly work, milestones and meetings, with room for signatures.'), btn('print', t('Print'), 'print', 'primary'))}</div>
      <article class="sheet">
        <header class="sheet-head"><div><b>${c.institution || ''}</b><br>${t('Academic year')} ${c.academic_year || ''}</div><div class="sheet-title">${t('PFE FOLLOW-UP SHEET')}</div><div class="right">${t('Printed on {d}', { d: App.fmt(App.today()) })}</div></header>
        <table class="sheet-info"><tbody>
          <tr><th>${t('Project')}</th><td colspan="3"><b>${team.title}</b></td></tr>
          <tr><th>${t('Team')}</th><td>${team.id} · ${team.level}${team.specialty ? ' · ' + team.specialty : ''}</td><th>${t('Supervisor')}</th><td>${c.supervisor_name || ''}</td></tr>
          <tr><th>${t('Students')}</th><td colspan="3">${App.join(d.members, function (m, i) { return h`${i ? ' · ' : ''}${App.fullName(m)}${m.matricule ? ' (' + m.matricule + ')' : ''}`; })}</td></tr>
          ${team.host || team.extSupervisor ? h`<tr><th>${t('Host organisation')}</th><td>${team.host || '—'}</td><th>${t('External supervisor')}</th><td>${team.extSupervisor || '—'}</td></tr>` : ''}
          <tr><th>${t('Progress')}</th><td colspan="3">${progressOf(d)}% · ${t('{a}/{b} tasks done', { a: d.tasks.filter(function (x) { return x.status === 'done'; }).length, b: d.tasks.length })}</td></tr>
        </tbody></table>
        <h2>${t('Weekly follow-up')}</h2>
        <table class="sheet-table"><thead><tr><th>${t('Week')}</th><th>${t('Work done')}</th><th>${t('Difficulties')}</th><th>${t('Next steps')}</th><th>${t('Supervisor remarks')}</th><th class="sig">${t('Signature')}</th></tr></thead>
          <tbody>${weeks.length ? App.join(weeks, function (w) {
            return h`<tr><td class="nowrap">${App.weekLabel(w.week)}${App.pfeWeek(w.week) ? h`<br><small>${t('PFE week {n}', { n: App.pfeWeek(w.week) })}</small>` : ''}</td><td>${App.nl2br(w.done)}</td><td>${App.nl2br(w.difficulties)}</td><td>${App.nl2br(w.nextPlan)}</td>
              <td>${App.nl2br(w.adminComment)}${w.adminRating ? h`<br><b>${label(RATING, w.adminRating)}</b>` : ''}</td><td></td></tr>`;
          }) : h`<tr><td colspan="6" class="muted">${t('No weekly report yet.')}</td></tr>`}</tbody></table>
        <h2>${t('Milestones')}</h2>
        <table class="sheet-table"><thead><tr><th>${t('Milestone')}</th><th>${t('Due date')}</th><th>${t('Progress')}</th><th>${t('Status')}</th></tr></thead>
          <tbody>${App.join(ms, function (m) { return h`<tr><td>${App.tv(m.title)}</td><td class="nowrap">${m.dueDate ? App.fmt(m.dueDate) : '—'}</td><td>${m.status === 'done' ? 100 : m.progress || 0}%</td><td>${label(MS_STATUS, m.status)}${msLate(m) ? ' · ' + t('late') : ''}</td></tr>`; })}</tbody></table>
        ${meetings.length ? h`<h2>${t('Meetings')}</h2><table class="sheet-table"><thead><tr><th>${t('Date')}</th><th>${t('Type')}</th><th>${t('Summary and decisions')}</th></tr></thead>
          <tbody>${App.join(meetings, function (m) { return h`<tr><td class="nowrap">${App.fmt(m.date)}</td><td>${label(MEETING_TYPES, m.type)}</td><td>${App.nl2br(m.summary)}${m.decisions ? h`<br><b>${t('Decisions')}:</b> ${App.nl2br(m.decisions)}` : ''}</td></tr>`; })}</tbody></table>` : ''}
        <div class="signatures"><div>${t('The students')}</div><div>${t('The supervisor')}</div></div>
      </article>`;
  };
  App.act('print', function () { window.print(); });
})();
