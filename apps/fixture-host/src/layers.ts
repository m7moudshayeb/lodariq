/**
 * Transient layers — menus, dialogs, a drawer. These are the surfaces that make
 * targeting hard: they appear on interaction, close on blur, and hold targets
 * that only exist while they are open. Their open/closed state lives in the URL
 * so a reload puts them back.
 */
import { COPY, PROJECTS } from './data';
import type { HostState } from './router';

const esc = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export function renderPop(state: HostState): string {
  if (!state.pop) return '';
  const t = COPY[state.locale];
  const [kind, arg] = state.pop.split(':');
  const items = (() => {
    switch (kind) {
      case 'account':
        return { label: 'Account menu', anchor: '[data-open-pop="account"]', head: 'you@meridian.io',
          rows: ['Profile', 'Preferences', 'API keys', '—', 'Switch workspace', 'Sign out'] };
      case 'notify':
        return { label: 'Notifications', anchor: '[data-open-pop="notify"]', head: 'Notifications',
          rows: ['D. Okonkwo mentioned you', 'Import finished — 1,204 rows', 'Q3 pricing moved to Review', '—', 'See all notifications'] };
      case 'import':
        return { label: 'Import menu', anchor: '[data-open-pop="import"]', head: 'Import from',
          rows: [t['csvFile'] ?? 'CSV file', 'Jira', 'Linear', 'Google Sheets'] };
      case 'filter':
        return { label: 'Filter menu', anchor: '[data-open-pop="filter"]', head: 'Filter projects',
          rows: ['Status is Active', 'Owner is me', 'Team is Product', 'Updated this week', '—', 'Save this filter'] };
      case 'row': {
        const project = PROJECTS[Number.parseInt(arg ?? '0', 10)];
        return { label: `Actions for ${project?.name ?? 'project'}`, anchor: `[data-open-pop="row:${arg}"]`,
          head: project?.name ?? 'Project', rows: ['Open', 'Rename', 'Duplicate', '—', 'Archive project'] };
      }
      default:
        return null;
    }
  })();
  if (!items) return '';
  return `<div class="pop" role="menu" aria-label="${esc(items.label)}" data-pop-anchor="${esc(items.anchor)}">
    <p class="pop-head">${esc(items.head)}</p>
    ${items.rows
      .map((row) =>
        row === '—'
          ? '<hr>'
          : `<button type="button" role="menuitem"${
              row === (t['csvFile'] ?? 'CSV file') ? ' data-open-modal="import"' : ''
            }>${esc(row)}</button>`,
      )
      .join('')}
    ${kind === 'import' ? '<p class="pop-note">Imports never overwrite. Everything lands in a review queue first.</p>' : ''}
  </div>`;
}

interface DialogSpec {
  title: string;
  lede: string;
  body: string;
  confirm: string;
}

export function renderModal(state: HostState): string {
  if (!state.modal) return '';
  const t = COPY[state.locale];
  const specs: Record<string, DialogSpec> = {
    create: {
      title: t['createProject'] ?? 'Create project',
      lede: 'Projects keep related work, files and people together.',
      confirm: t['createProject'] ?? 'Create project',
      body: `<p class="field"><label for="dlg-name">Project name</label>
          <input id="dlg-name" type="text" placeholder="e.g. Website refresh"></p>
        <p class="field"><label for="dlg-template">Template</label>
          <select id="dlg-template"><option>Blank project</option><option>Product launch</option>
          <option>Customer onboarding</option></select></p>
        <p class="field"><label for="dlg-team">Team</label>
          <select id="dlg-team"><option>Product</option><option>Marketing</option><option>Platform</option></select></p>`,
    },
    import: {
      title: 'Import data',
      lede: 'Upload a CSV and we will map the columns for you.',
      confirm: 'Start import',
      body: `<div class="dropzone" role="button" tabindex="0" aria-label="Drop a CSV file here">
          Drop a CSV here, or <b>browse</b><span class="hint">Up to 50,000 rows · UTF-8</span></div>
        <p class="field"><label for="dlg-kind">What are these rows?</label>
          <select id="dlg-kind"><option>Projects</option><option>Tasks</option><option>People</option></select></p>`,
    },
    invite: {
      title: t['invite'] ?? 'Invite people',
      lede: 'They get an email with a link that expires in 14 days.',
      confirm: 'Send invites',
      body: `<p class="field"><label for="dlg-emails">Email addresses</label>
          <textarea id="dlg-emails" rows="3" placeholder="name@company.com"></textarea></p>
        <p class="field"><label for="dlg-role">Role</label>
          <select id="dlg-role"><option>Member</option><option>Admin</option><option>Viewer</option></select></p>`,
    },
    plan: {
      title: t['choosePlan'] ?? 'Choose a plan',
      lede: 'Change takes effect at the start of the next cycle.',
      confirm: 'Continue',
      body: `<div class="plans">${[['Starter', '$99', '15,000 engaged users'],
          ['Growth', '$349', '75,000 engaged users'], ['Scale', '$899', '300,000 engaged users']]
          .map(([n, p, d], i) => `<label class="plan ${i === 1 ? 'on' : ''}">
            <input type="radio" name="plan" ${i === 1 ? 'checked' : ''}>
            <span class="plan-name">${n}</span><span class="plan-price">${p}</span>
            <span class="hint">${d}</span></label>`).join('')}</div>`,
    },
    report: {
      title: 'New report',
      lede: 'Start from a metric, then filter it down.',
      confirm: 'Create report',
      body: `<p class="field"><label for="dlg-metric">Metric</label>
          <select id="dlg-metric"><option>Weekly active users</option><option>Activation rate</option>
          <option>Cycle time</option></select></p>
        <p class="field"><label for="dlg-group">Group by</label>
          <select id="dlg-group"><option>Plan</option><option>Team</option><option>Signup cohort</option></select></p>`,
    },
  };
  const spec = specs[state.modal];
  if (!spec) return '';
  return `<div class="modal-backdrop" data-close-modal></div>
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(spec.title)}">
      <header><div><h2>${esc(spec.title)}</h2><p class="hint">${esc(spec.lede)}</p></div>
        <button type="button" class="icon-btn" data-close-modal aria-label="Close">✕</button></header>
      <div class="modal-body">${spec.body}</div>
      <footer><button type="button" class="btn" data-close-modal>Cancel</button>
        <button type="button" class="btn primary">${esc(spec.confirm)}</button></footer>
    </div>`;
}

export function renderDrawer(state: HostState): string {
  if (!state.drawer) return '';
  return `<aside class="drawer" role="complementary" aria-label="Advanced settings">
    <header><h2>Advanced</h2>
      <button type="button" class="icon-btn" data-close-drawer aria-label="Close advanced settings">✕</button></header>
    <p class="field"><label for="drw-region">Data region</label>
      <select id="drw-region"><option>EU (Ireland)</option><option>US (Oregon)</option></select></p>
    <p class="field"><label for="drw-retention">Activity retention</label>
      <select id="drw-retention"><option>12 months</option><option>24 months</option></select></p>
    <button type="button" class="btn primary">Apply advanced settings</button>
  </aside>`;
}
