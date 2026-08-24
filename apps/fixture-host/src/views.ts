/**
 * Meridian's routes. Markup is deliberately semantic and mostly marker-free:
 * accessible names, roles and landmarks are the resolver's real inputs, so the
 * fixture must exercise those rather than hand it `data-lodariq-id` everywhere.
 * A few controls keep markers so the configured-attribute family stays covered.
 */
import { ACTIVITY, BOARD, COPY, FUNNEL, INVOICES, MEMBERS, PROJECTS, REPORTS, TEMPLATES } from './data';
import { icon } from './icons';
import type { HostState } from './router';

const INVITES: Array<[string, string, string]> = [
  ['sam@acme.io', 'Member', '2 days ago'],
  ['jo@acme.io', 'Admin', '5 days ago'],
];

const esc = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const face = (name: string, hue: number, size = 24): string =>
  `<span class="face" aria-hidden="true" style="width:${size}px;height:${size}px;background:hsl(${hue} 62% 52%)">${esc(
    name.split(/[ .]/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase(),
  )}</span>`;

function spark(points: number[], color = '#4f46e5'): string {
  const w = 140;
  const h = 34;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const d = points
    .map((p, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p - min) / (max - min || 1)) * (h - 4) - 2).toFixed(1)}`)
    .join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    <path d="${d}L${w},${h}L0,${h}Z" fill="${color}" opacity=".08"/></svg>`;
}

function bars(values: number[], labels: string[]): string {
  const max = Math.max(...values);
  return `<div class="bars" aria-hidden="true">${values
    .map(
      (v, i) => `<div class="bar-col"><div class="bar-fill" style="height:${((v / max) * 100).toFixed(0)}%"></div>
      <span>${labels[i]}</span></div>`,
    )
    .join('')}</div>`;
}

/** `[id, label, icon, count]`. The icon is decorative; the label is the name. */
export const SECTIONS: Record<string, Array<[string, string, string, number | null]>> = {
  dashboard: [['overview', 'Overview', 'chart', null], ['activity', 'Activity', 'history', null], ['pinned', 'Pinned reports', 'star', null]],
  projects: [['all', 'All projects', 'folder', 24], ['mine', 'My projects', 'user', 6], ['archived', 'Archived', 'trash', 3], ['templates', 'Templates', 'layers', 9], ['imports', 'Imports', 'upload', 0]],
  reports: [['adoption', 'Adoption', 'rocket', null], ['velocity', 'Velocity', 'gauge', null], ['quality', 'Quality', 'shield', null], ['custom', 'Custom', 'beaker', null]],
  team: [['members', 'Members', 'users', 7], ['invites', 'Pending invites', 'send', 2], ['roles', 'Roles', 'lock', null]],
  billing: [['plan', 'Plan & usage', 'star', null], ['invoices', 'Invoices', 'file', 12], ['payment', 'Payment method', 'file', null]],
  settings: [['general', 'General', 'settings', null], ['branding', 'Branding', 'palette', null], ['integrations', 'Integrations', 'layers', null], ['danger', 'Danger zone', 'alert', null]],
};

export function renderRoute(state: HostState): string {
  const t = COPY[state.locale];
  switch (state.route) {
    case 'dashboard':
      return dashboard();
    case 'projects':
      return projects(state, t);
    case 'reports':
      return reports(t);
    case 'team':
      return team(state, t);
    case 'billing':
      return billing(t);
    case 'settings':
      return settings(state);
    default:
      return '';
  }
}

function dashboard(): string {
  return `
  <header class="page-head">
    <div><h1>Good morning, Mahmoud</h1>
      <p class="sub">Acme Momentum workspace · 24 active projects · 7 people</p></div>
    <div class="head-actions">
      <button type="button" class="btn">Share dashboard</button>
      <button type="button" class="btn primary" data-open-modal="report">New report</button>
    </div>
  </header>
  <div class="grid g4">
    ${[
      ['Active projects', '24', '+3 this week', 'up', [12, 14, 13, 17, 19, 18, 22, 24], '#4f46e5'],
      ['Median cycle time', '6.2d', '−1.4d', 'up', [9, 8.6, 8.1, 7.7, 7.2, 6.9, 6.4, 6.2], '#067647'],
      ['Blocked items', '5', '+2', 'down', [1, 2, 2, 3, 2, 4, 3, 5], '#b42318'],
    ]
      .map(
        ([label, value, delta, dir, pts, color]) => `<section class="card" aria-label="${esc(label as string)}">
          <p class="lbl">${label}</p><p class="stat">${value}</p>
          <p class="delta ${dir}">${delta}</p>${spark(pts as number[], color as string)}</section>`,
      )
      .join('')}
    <section class="card" aria-label="Seats in use"><p class="lbl">Seats in use</p>
      <p class="stat">7 <span class="stat-of">/ 10</span></p>
      <div class="prog"><i style="width:70%"></i></div>
      <p class="hint">3 seats free on Growth</p></section>
  </div>
  <div class="grid g2">
    <section class="card" aria-label="Throughput by week"><h2>Throughput by week</h2>
      ${bars([14, 18, 12, 22, 26, 19, 28, 31], ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'])}</section>
    <section class="card" aria-label="Recent activity"><h2>Recent activity</h2>
      <ul class="feed">${ACTIVITY.map(
        ([who, hue, what, when]) => `<li>${face(who, hue)}<span><b>${esc(who)}</b> ${what}</span><time>${when}</time></li>`,
      ).join('')}</ul></section>
  </div>
  <section class="card" aria-label="Project board"><h2>This week</h2>
    <div class="board">${BOARD.map(
      ([column, items], ci) => `<div class="board-col"><h3>${esc(column)}<span class="chip mut">${items.length}</span></h3>
        ${items
          .map(
            (item, ii) => `<article class="ticket" aria-label="${esc(item)}"><p>${esc(item)}</p>
            <p class="ticket-meta">MER-${120 + ci * 7 + ii}</p></article>`,
          )
          .join('')}</div>`,
    ).join('')}</div></section>`;
}

function projects(state: HostState, t: Record<string, string>): string {
  if (state.section === 'archived') {
    return `
    <header class="page-head"><div><h1>${esc(t['archived'] ?? 'Archived')}</h1>
      <p class="sub">Projects you closed. Archived projects free their slot immediately.</p></div></header>
    <section class="empty" aria-label="No archived projects">
      <h2>Nothing archived yet</h2>
      <p>When you archive a project it lands here, with its history intact.</p>
      <button type="button" class="btn">Learn about archiving</button></section>`;
  }
  if (state.section === 'templates') {
    return `
    <header class="page-head"><div><h1>${esc(t['templates'] ?? 'Templates')}</h1>
      <p class="sub">Nine starting points, or build your own.</p></div>
      <div class="head-actions"><button type="button" class="btn primary">New template</button></div></header>
    <div class="grid g3">${TEMPLATES.map(
      ([name, steps, uses]) => `<section class="card" aria-label="${esc(name)} template">
        <h3>${esc(name)}</h3><p class="hint">${steps} steps · used ${uses}×</p></section>`,
    ).join('')}</div>`;
  }
  if (state.section === 'imports') {
    return `
    <header class="page-head"><div><h1>Imports</h1><p class="sub">Nothing imported yet.</p></div>
      <div class="head-actions">
        <button type="button" class="btn" data-open-pop="import" aria-haspopup="menu">${esc(t['import'] ?? 'Import')}</button>
      </div></header>
    <section class="empty" aria-label="No imports"><h2>No imports yet</h2>
      <p>Bring projects, tasks or people across from a CSV or another tool.</p></section>`;
  }

  const rows = [...PROJECTS].sort((a, b) =>
    state.sort === 'name' ? a.name.localeCompare(b.name)
      : state.sort === 'owner' ? a.owner.localeCompare(b.owner)
      : b.createdAt - a.createdAt,
  );
  const mine = state.section === 'mine';
  const shown = mine ? rows.filter((p) => ['D. Okonkwo', 'M. Haddad'].includes(p.owner)) : rows;

  return `
  <header class="page-head">
    <div><h1>${esc(t['projects'] ?? 'Projects')}</h1>
      <p class="sub">Acme Momentum · ${shown.length} shown · sorted by ${state.sort === 'updated' ? 'last updated' : state.sort}</p></div>
    <div class="head-actions">
      <button type="button" class="btn" data-open-pop="import" aria-haspopup="menu"
        aria-expanded="${state.pop === 'import'}">${icon('upload', 14)}${esc(t['import'] ?? 'Import')}${icon('chevron', 13)}</button>
      <button type="button" class="btn" data-open-pop="filter" aria-haspopup="menu"
        aria-expanded="${state.pop === 'filter'}">${icon('filter', 14)}${esc(t['filter'] ?? 'Filter')}</button>
      <button type="button" class="btn primary" data-lodariq-id="new-project"
        data-open-modal="create">${icon('plus', 14)}${esc(t['createProject'] ?? 'Create project')}</button>
    </div>
  </header>

  ${reliabilitySurface(state, t)}

  <div class="toolrow">
    <div class="seg" role="group" aria-label="Sort projects">
      ${[['updated', 'Recent'], ['name', 'A–Z'], ['owner', 'By owner']]
        .map(([k, n]) => `<button type="button" data-sort="${k}" class="${state.sort === k ? 'on' : ''}"
          aria-pressed="${state.sort === k}">${n}</button>`)
        .join('')}
    </div>
    <span class="grow"></span>
    <p class="hint">Showing 1–${shown.length} of 24</p>
  </div>

  <table class="tbl" aria-label="Projects">
    <thead><tr><th scope="col" class="pick"><span class="sr-only">Select</span></th>
      <th scope="col">Project</th><th scope="col">Owner</th><th scope="col">Team</th>
      <th scope="col">Status</th><th scope="col">Progress</th><th scope="col">Updated</th>
      <th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${shown
      .map(
        (p, i) => `<tr aria-label="${esc(p.name)} row" data-row="${i}" data-newest="${i === 0 ? '1' : '0'}">
        <td class="pick"><input type="checkbox" aria-label="Select ${esc(p.name)}"></td>
        <th scope="row">${esc(p.name)}</th>
        <td><span class="people">${face(p.owner, p.hue)}${esc(p.owner)}</span></td>
        <td><span class="chip mut">${esc(p.team)}</span></td>
        <td><span class="chip ${p.status === 'Active' ? 'ok' : p.status === 'At risk' ? 'warn' : p.status === 'Blocked' ? 'bad' : 'mut'}"><i class="dot" aria-hidden="true"></i>${esc(p.status)}</span></td>
        <td><div class="prog"><i style="width:${p.progress}%"></i></div></td>
        <td>${esc(p.updated)}</td>
        <td class="right"><button type="button" class="icon-btn" data-open-pop="row:${i}"
          aria-haspopup="menu" aria-label="More actions for ${esc(p.name)}">${icon('more', 15)}</button></td></tr>`,
      )
      .join('')}</tbody>
  </table>

  <section class="card scroll-card" aria-label="All project activity">
    <h2>Everything else</h2>
    <div class="scroll-list" id="project-list" role="list" aria-label="Project list"></div>
  </section>`;
}

/**
 * Same intent, hostile conditions: two semantically identical actions in
 * different containers, a locale switch, a DOM replacement and a reflow.
 */
function reliabilitySurface(state: HostState, t: Record<string, string>): string {
  return `
  <section class="reliability ${state.reflow ? 'is-reflowed' : ''}" aria-label="Project workspace setup" lang="${state.locale}">
    <div class="reliability-head">
      <h2>${esc(t['workspaceHeading'] ?? 'Project workspace')}</h2>
      <div class="reliability-controls" role="group" aria-label="Fixture controls">
        <button type="button" class="btn sm" data-toggle-locale>${esc(t['localeToggle'] ?? 'Switch to German')}</button>
        <button type="button" class="btn sm" data-bump-render>Replace target node</button>
        <button type="button" class="btn sm" data-toggle-reflow aria-pressed="${state.reflow}">
          ${state.reflow ? 'Restore layout' : 'Reflow layout'}</button>
      </div>
    </div>
    <div class="reliability-stage" data-render="${state.render}">
      <article class="card" aria-label="${esc(t['workspaceHeading'] ?? 'Project workspace')}">
        <h3>${esc(t['workspaceHeading'] ?? 'Project workspace')}</h3>
        <p class="hint">Start work for your delivery team.</p>
        <button type="button" class="btn primary">${esc(t['createProject'] ?? 'Create project')}</button>
      </article>
      <article class="card" aria-label="${esc(t['templatesHeading'] ?? 'Project templates')}">
        <h3>${esc(t['templatesHeading'] ?? 'Project templates')}</h3>
        <p class="hint">Save a reusable starting point.</p>
        <button type="button" class="btn">${esc(t['createTemplate'] ?? 'Create project template')}</button>
      </article>
    </div>
    <p class="reliability-status" role="status" aria-live="polite" data-reliability-status>
      Target render ${state.render} is ready in ${state.locale === 'en' ? 'English' : 'German'} with the
      ${state.reflow ? 'reflowed' : 'standard'} layout.</p>
  </section>`;
}

function reports(t: Record<string, string>): string {
  return `
  <header class="page-head"><div><h1>${esc(t['reports'] ?? 'Reports')}</h1>
    <p class="sub">Adoption · refreshed 14 minutes ago</p></div>
    <div class="head-actions">
      <button type="button" class="btn">${esc(t['exportCsv'] ?? 'Export CSV')}</button>
      <button type="button" class="btn">Schedule report</button>
      <button type="button" class="btn primary">Save report</button></div></header>
  <div class="grid g3">
    ${[['Weekly active', '4,182', '+11.4%', [2900, 3100, 3050, 3400, 3600, 3900, 4050, 4182], '#4f46e5'],
       ['Activation rate', '63%', '+9pt', [41, 44, 47, 49, 53, 57, 61, 63], '#067647'],
       ['Time to first project', '4m 12s', '−1m 30s', [9, 8, 7.4, 6.9, 6, 5.2, 4.6, 4.2], '#067647']]
      .map(([l, v, d, pts, c]) => `<section class="card" aria-label="${esc(l as string)}">
        <p class="lbl">${l}</p><p class="stat">${v}</p><p class="delta up">${d}</p>
        ${spark(pts as number[], c as string)}</section>`).join('')}
  </div>
  <section class="card" aria-label="Activation funnel"><h2>Activation funnel</h2>
    ${FUNNEL.map(([label, n, pct]) => `<div class="funnel-row"><span>${esc(label)}</span>
      <div class="prog tall"><i style="width:${pct}%"></i></div>
      <span class="right">${n.toLocaleString()} · ${pct}%</span></div>`).join('')}</section>
  <table class="tbl" aria-label="Saved reports">
    <thead><tr><th scope="col">Report</th><th scope="col">Owner</th><th scope="col">Audience</th>
      <th scope="col">Last run</th><th scope="col">Schedule</th></tr></thead>
    <tbody>${REPORTS.map(([n, o, hue, a, r, s]) => `<tr aria-label="${esc(n as string)} report">
      <th scope="row">${esc(n as string)}</th>
      <td><span class="people">${face(o as string, hue as number)}${esc(o as string)}</span></td>
      <td>${esc(a as string)}</td><td>${esc(r as string)}</td>
      <td><span class="chip ${s === '—' ? 'mut' : 'ok'}">${esc(s as string)}</span></td></tr>`).join('')}</tbody>
  </table>`;
}

function team(state: HostState, t: Record<string, string>): string {
  if (state.section === 'invites') {
    return `
    <header class="page-head"><div><h1>Pending invites</h1><p class="sub">2 waiting · invites expire after 14 days</p></div>
      <div class="head-actions"><button type="button" class="btn primary" data-open-modal="invite">${esc(t['invite'] ?? 'Invite people')}</button></div></header>
    <table class="tbl" aria-label="Pending invites"><thead><tr><th scope="col">Email</th><th scope="col">Role</th>
      <th scope="col">Sent</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${INVITES.map(([e, r, sent]) => `<tr aria-label="${esc(e)} invite"><th scope="row">${esc(e)}</th>
        <td><span class="chip mut">${esc(r)}</span></td><td>${esc(sent)}</td>
        <td class="right"><button type="button" class="btn sm">Resend invite</button></td></tr>`).join('')}</tbody></table>`;
  }
  return `
  <header class="page-head"><div><h1>${esc(t['team'] ?? 'Team')}</h1><p class="sub">7 members · 3 seats free on Growth</p></div>
    <div class="head-actions">
      <button type="button" class="btn">Export members</button>
      <button type="button" class="btn primary" data-open-modal="invite">${esc(t['invite'] ?? 'Invite people')}</button></div></header>
  <div class="grid g3">${MEMBERS.map(
    (m) => `<section class="card member" aria-label="${esc(m.name)}">
      <div class="member-head">${face(m.name, m.hue, 36)}
        <div><p class="member-name">${esc(m.name)}</p><p class="hint">${esc(m.email)}</p></div></div>
      <div class="member-foot"><button type="button" class="btn sm" aria-label="Change role for ${esc(m.name)}">${m.role}</button>
        <span class="chip ${m.presence === 'online' ? 'ok' : 'mut'}">${esc(m.presence)}</span></div></section>`,
  ).join('')}</div>`;
}

function billing(t: Record<string, string>): string {
  return `
  <header class="page-head"><div><h1>${esc(t['billing'] ?? 'Billing')}</h1><p class="sub">Growth · renews 1 October 2026</p></div>
    <div class="head-actions"><button type="button" class="btn">Billing history</button>
      <button type="button" class="btn primary" data-open-modal="plan">${esc(t['choosePlan'] ?? 'Choose a plan')}</button></div></header>
  <div class="grid g3">
    ${[['Engaged users this month', '41,200', 'of 75,000 included', 55],
       ['Live experiences', '11 <span class="stat-of">/ 60</span>', 'Archived and draft do not count', 18],
       ['AI credits', '1,180 <span class="stat-of">/ 1,500</span>', 'Resets in 13 days', 79]]
      .map(([l, v, h, pct]) => `<section class="card" aria-label="${esc(l as string)}">
        <p class="lbl">${l}</p><p class="stat">${v}</p><div class="prog"><i style="width:${pct}%"></i></div>
        <p class="hint">${h}</p></section>`).join('')}
  </div>
  <section class="card" aria-label="Invoices"><h2>Invoices</h2>
    <table class="tbl bare"><thead><tr><th scope="col">Invoice</th><th scope="col">Period</th>
      <th scope="col">Amount</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Download</span></th></tr></thead>
      <tbody>${INVOICES.map(([n, p, a]) => `<tr aria-label="${esc(n)}"><th scope="row">${esc(n)}</th>
        <td>${esc(p)}</td><td>${esc(a)}</td><td><span class="chip ok">Paid</span></td>
        <td class="right"><button type="button" class="btn sm" aria-label="Download ${esc(n)}">PDF</button></td></tr>`).join('')}</tbody>
    </table></section>`;
}

function settings(state: HostState): string {
  if (state.section === 'danger') {
    return `
    <header class="page-head"><div><h1>Danger zone</h1><p class="sub">These actions cannot be undone.</p></div></header>
    <section class="card danger" aria-label="Danger zone">
      <div class="row"><div><p class="row-title">Transfer ownership</p>
        <p class="hint">Move this workspace to another admin.</p></div>
        <button type="button" class="btn danger">Transfer ownership</button></div>
      <div class="row"><div><p class="row-title">Delete workspace</p>
        <p class="hint">All projects and history are removed after 30 days.</p></div>
        <button type="button" class="btn danger">Delete workspace</button></div></section>`;
  }
  return `
  <header class="page-head"><div><h1>Settings</h1><p class="sub">Workspace preferences</p></div>
    <div class="head-actions">
      <button type="button" class="btn" data-open-drawer>Advanced</button>
      <button type="button" class="btn primary">Save changes</button></div></header>
  <div class="grid g2">
    <section class="card" aria-label="Workspace"><h2>Workspace</h2>
      <p class="field"><label for="ws-name">Workspace name</label>
        <input id="ws-name" type="text" value="Acme Momentum"></p>
      <p class="field"><label for="ws-tz">Default timezone</label>
        <select id="ws-tz"><option>Europe/London</option><option>America/New_York</option></select></p>
      <p class="field"><label for="ws-week">Week starts on</label>
        <select id="ws-week"><option>Monday</option><option>Sunday</option></select></p></section>
    <section class="card" aria-label="Preferences"><h2>Preferences</h2>
      ${[['Weekly digest', 'A summary of what moved, every Monday.', true],
         ['Product announcements', 'Occasional notes about new features.', true],
         ['Compact rows', 'Fit more projects on screen.', false]]
        .map(([title, desc, on]) => `<div class="row"><div><p class="row-title">${title}</p>
          <p class="hint">${desc}</p></div>
          <button type="button" class="toggle ${on ? 'on' : ''}" role="switch"
            aria-checked="${on}" aria-label="${title}"><i></i></button></div>`).join('')}
    </section>
  </div>`;
}
