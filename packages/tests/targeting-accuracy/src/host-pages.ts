/**
 * Host page fixtures.
 *
 * Each page mirrors a shape that actually occurs in customer applications, and
 * each names one ground-truth target. Pages are built fresh per trial so a
 * mutation can never leak into the next measurement.
 *
 * `hardness` is documentation, not scoring input: it records why the case is in
 * the corpus so a future reader can tell a genuine regression from a case that
 * was always expected to abstain.
 */

export interface HostPage {
  /** Stable id used in the report. */
  id: string;
  /** What real-world shape this stands in for. */
  description: string;
  /** Why this case is interesting. */
  hardness: 'easy' | 'moderate' | 'hostile';
  /**
   * The target sits in a set of look-alikes the evidence cannot separate.
   *
   * On these pages an author who supplied no selection policy was asked "which
   * of these three?" and never answered, so **abstaining is the correct
   * outcome and resolving is the failure** — the resolver would be guessing.
   * Marked on the fixture rather than by page id in the scorer so adding a
   * fixture cannot silently opt out of the contract.
   */
  ambiguousWithoutSelection?: boolean;
  /**
   * What the author was doing when they picked the target.
   *
   * Step 1 found capture recorded `'anchor'` on every page, so the actionability
   * guard had never run. `'observe-click'` is what the one-click authoring path
   * records for a control the author actually clicked, and it makes the resolver
   * reject candidates that are disabled or unclickable — a filter the corpus was
   * measuring the resolver without.
   *
   * It also decides how much a mistake costs. A highlight step that lands on the
   * wrong button shows the user a card in the wrong place; an action step presses
   * it. Rules that withhold a step turn on this, so a corpus where nothing acts
   * prices them all at zero.
   */
  captureAction?: 'anchor' | 'observe-click';
  /** Builds the page into `container` and returns the ground-truth element. */
  build: (container: HTMLElement) => Element;
}

function el(
  tag: string,
  attributes: Record<string, string> = {},
  text?: string,
): HTMLElement {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function row(attributes: Record<string, string> = {}): HTMLElement {
  return el('div', { ...attributes, 'data-harness-row': '' });
}

export const HOST_PAGES: readonly HostPage[] = [
  {
    id: 'header-actions-tied',
    description: 'Three unlabelled header buttons with no id, testid or aria-*',
    hardness: 'hostile',
    // An action step: the tour clicks this control, it does not point at it.
    captureAction: 'observe-click',
    build: (container) => {
      const header = el('header', { class: 'page-head' });
      header.appendChild(el('h1', { class: 'title' }, 'Adoption report'));
      const actions = row({ class: 'head-actions' });
      const exportCsv = el('button', { type: 'button', class: 'btn' }, 'Export CSV');
      const schedule = el('button', { type: 'button', class: 'btn' }, 'Schedule report');
      const save = el('button', { type: 'button', class: 'btn' }, 'Save report');
      actions.append(exportCsv, schedule, save);
      header.appendChild(actions);
      container.appendChild(header);
      // Deliberately the middle one: an off-by-one resolves to a real button.
      return schedule;
    },
  },
  {
    id: 'sidebar-route-anchor',
    description: 'Delegated sidebar nav anchors carrying data-route',
    hardness: 'easy',
    // An action step: the tour clicks this control, it does not point at it.
    captureAction: 'observe-click',
    build: (container) => {
      const aside = el('aside', { class: 'sidebar' });
      aside.appendChild(el('h2', { class: 'org' }, 'Acme'));
      const nav = el('nav', { class: 'nav', 'aria-label': 'Primary' });
      const dashboard = el('a', { href: '/dashboard', 'data-route': 'dashboard' }, 'Dashboard');
      const projects = el('a', { href: '/projects', 'data-route': 'projects' }, 'Projects');
      const billing = el('a', { href: '/billing', 'data-route': 'billing' }, 'Billing');
      nav.append(dashboard, projects, billing);
      aside.appendChild(nav);
      container.appendChild(aside);
      return projects;
    },
  },
  {
    id: 'settings-labelled-input',
    description: 'Form control reachable only through its <label for>',
    hardness: 'easy',
    build: (container) => {
      const form = el('form', { class: 'settings' });
      const nameField = el('div', { class: 'field' });
      nameField.appendChild(el('label', { for: 'workspace-name' }, 'Workspace name'));
      nameField.appendChild(el('input', { id: 'workspace-name', type: 'text' }));
      const slugField = el('div', { class: 'field' });
      slugField.appendChild(el('label', { for: 'workspace-slug' }, 'Workspace URL'));
      const slug = el('input', { id: 'workspace-slug', type: 'text' });
      slugField.appendChild(slug);
      form.append(nameField, slugField);
      container.appendChild(form);
      return slug;
    },
  },
  {
    id: 'table-row-action',
    description: 'Per-row action button inside a sortable collection',
    hardness: 'hostile',
    ambiguousWithoutSelection: true,
    build: (container) => {
      const table = el('div', { class: 'table', role: 'table' });
      const rows = ['Acme Inc', 'Globex', 'Initech'];
      let targetButton: Element | null = null;
      for (const name of rows) {
        const record = row({ class: 'tr', role: 'row' });
        record.appendChild(el('span', { class: 'td', role: 'cell' }, name));
        const action = el('button', { type: 'button', class: 'td-action' }, 'Manage');
        record.appendChild(action);
        table.appendChild(record);
        if (name === 'Globex') targetButton = action;
      }
      container.appendChild(table);
      if (!targetButton) throw new Error('table-row-action fixture did not build a target');
      return targetButton;
    },
  },
  {
    id: 'modal-primary-cta',
    description: 'Primary confirm button inside a labelled dialog',
    hardness: 'moderate',
    // An action step: the tour clicks this control, it does not point at it.
    captureAction: 'observe-click',
    build: (container) => {
      const dialog = el('div', { role: 'dialog', 'aria-label': 'Invite teammates' });
      dialog.appendChild(el('h2', { class: 'modal-title' }, 'Invite teammates'));
      dialog.appendChild(el('p', { class: 'modal-copy' }, 'They will get an email invite.'));
      const footer = row({ class: 'modal-footer' });
      const cancel = el('button', { type: 'button', class: 'ghost' }, 'Cancel');
      const confirm = el('button', { type: 'button', class: 'primary' }, 'Send invites');
      footer.append(cancel, confirm);
      dialog.appendChild(footer);
      container.appendChild(dialog);
      return confirm;
    },
  },
  {
    id: 'pricing-card-cta',
    description: 'Repeated pricing cards whose CTAs share identical copy',
    hardness: 'hostile',
    ambiguousWithoutSelection: true,
    build: (container) => {
      const grid = row({ class: 'pricing' });
      const plans = ['Starter', 'Growth', 'Scale'];
      let targetCta: Element | null = null;
      for (const plan of plans) {
        const card = el('article', { class: 'card' });
        card.appendChild(el('h3', { class: 'plan' }, plan));
        card.appendChild(el('p', { class: 'price' }, 'Contact us'));
        const cta = el('button', { type: 'button', class: 'cta' }, 'Choose plan');
        card.appendChild(cta);
        grid.appendChild(card);
        if (plan === 'Growth') targetCta = cta;
      }
      container.appendChild(grid);
      if (!targetCta) throw new Error('pricing-card-cta fixture did not build a target');
      return targetCta;
    },
  },
  {
    id: 'toolbar-testid-button',
    description: 'Well-instrumented button carrying a data-testid',
    hardness: 'easy',
    build: (container) => {
      const toolbar = row({ class: 'toolbar' });
      toolbar.appendChild(el('button', { type: 'button', 'data-testid': 'undo' }, 'Undo'));
      const publish = el(
        'button',
        { type: 'button', 'data-testid': 'publish', class: 'primary' },
        'Publish',
      );
      toolbar.appendChild(publish);
      container.appendChild(toolbar);
      return publish;
    },
  },

  /*
   * Step 4 widening starts here. Each fixture below exists because the first
   * corpus could not express a hazard we know ships in real applications.
   */

  {
    id: 'radix-dialog-trigger',
    description: 'Radix-style trigger whose id is regenerated on every mount',
    hardness: 'hostile',
    // An action step: the tour clicks this control, it does not point at it.
    captureAction: 'observe-click',
    build: (container) => {
      const shell = row({ class: 'panel' });
      // Radix emits `radix-:r<n>:`. It looks exactly like a hand-written id and
      // survives nothing: a remount, a re-render order change, or another
      // component mounting first all reissue it.
      const settings = el(
        'button',
        { type: 'button', class: 'ghost', id: 'radix-:r3:', 'aria-haspopup': 'dialog' },
        'Settings',
      );
      const invite = el(
        'button',
        { type: 'button', class: 'ghost', id: 'radix-:r5:', 'aria-haspopup': 'dialog' },
        'Invite people',
      );
      shell.append(settings, invite);
      container.appendChild(shell);
      return invite;
    },
  },
  {
    id: 'headless-menu-item',
    description: 'Headless UI menu items carrying counter-suffixed generated ids',
    hardness: 'hostile',
    build: (container) => {
      const menu = el('div', { class: 'menu', role: 'menu', 'aria-label': 'Row actions' });
      const names = ['Duplicate', 'Move', 'Archive'];
      let target: Element | null = null;
      for (let index = 0; index < names.length; index += 1) {
        const name = names[index] ?? '';
        const item = el(
          'button',
          {
            type: 'button',
            role: 'menuitem',
            class: 'menu-item',
            id: `headlessui-menu-item-${index + 2}`,
          },
          name,
        );
        menu.appendChild(item);
        if (name === 'Move') target = item;
      }
      container.appendChild(menu);
      if (!target) throw new Error('headless-menu-item fixture did not build a target');
      return target;
    },
  },
  {
    id: 'tailwind-utility-soup',
    description: 'Siblings sharing one long identical utility class string',
    hardness: 'hostile',
    // Abstention is the contract, and the reason is worth stating: `class` is
    // not captured at all, so a Tailwind bar with no test id and no ARIA leaves
    // `element-semantics` as the *only* durable family — one short of the
    // quorum. The resolver refuses, correctly. This is the common real-world
    // shape where our answer has to be "instrument it", not "we will guess".
    ambiguousWithoutSelection: true,
    build: (container) => {
      // Our `class-rename` models CSS Modules, where the class is a unique hash
      // and therefore evidence. Tailwind is different in kind: the same string
      // is on every button, so class evidence is present and non-discriminating.
      const utility =
        'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 ' +
        'text-sm font-medium shadow-sm ring-1 ring-inset ring-gray-300 ' +
        'hover:bg-gray-50 focus-visible:outline focus-visible:outline-2';
      const bar = row({ class: 'flex items-center gap-3' });
      const preview = el('button', { type: 'button', class: utility }, 'Preview');
      const share = el('button', { type: 'button', class: utility }, 'Share');
      const publish = el('button', { type: 'button', class: utility }, 'Publish changes');
      bar.append(preview, share, publish);
      container.appendChild(bar);
      return share;
    },
  },
  {
    id: 'tailwind-instrumented-cta',
    description: 'The same utility soup, but the target carries a data-testid',
    hardness: 'moderate',
    // The other half of the Tailwind question. `tailwind-utility-soup` shows the
    // resolver refusing when utilities are the only class evidence; this shows
    // whether a utility rewrite damages a target that *is* instrumented, which
    // is the case a paying customer actually has.
    build: (container) => {
      const utility =
        'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 ' +
        'text-sm font-medium shadow-sm ring-1 ring-inset ring-gray-300 ' +
        'hover:bg-gray-50 focus-visible:outline focus-visible:outline-2';
      const bar = row({ class: 'flex items-center gap-3' });
      const preview = el('button', { type: 'button', class: utility }, 'Preview');
      const share = el(
        'button',
        { type: 'button', class: utility, 'data-testid': 'share-doc' },
        'Share',
      );
      const publish = el('button', { type: 'button', class: utility }, 'Publish changes');
      bar.append(preview, share, publish);
      container.appendChild(bar);
      return share;
    },
  },
  {
    id: 'app-shell-modal',
    description: 'Dialog rendered inline inside the app shell, before any portal',
    hardness: 'moderate',
    // An action step: the tour clicks this control, it does not point at it.
    captureAction: 'observe-click',
    build: (container) => {
      // Captured while the dialog is nested in <main>, so `ancestorRoles` and
      // `ancestorLandmarks` record the shell. The `modal-portalled` mutation
      // then reparents it to <body>, which is what adopting a portal-based
      // modal library does to an already-authored step.
      const main = el('main', { class: 'shell' });
      main.appendChild(el('h1', { class: 'title' }, 'Projects'));
      const region = el('section', { class: 'region', 'aria-label': 'Project list' });
      region.appendChild(el('p', { class: 'copy' }, 'Three projects'));
      const dialog = el('div', { role: 'dialog', 'aria-label': 'Delete project', class: 'dlg' });
      dialog.appendChild(el('h2', { class: 'dlg-title' }, 'Delete project'));
      const footer = row({ class: 'dlg-footer' });
      const keep = el('button', { type: 'button', class: 'ghost' }, 'Keep it');
      const remove = el('button', { type: 'button', class: 'danger' }, 'Delete forever');
      footer.append(keep, remove);
      dialog.appendChild(footer);
      region.appendChild(dialog);
      main.appendChild(region);
      container.appendChild(main);
      return remove;
    },
  },
  {
    id: 'role-button-lookalikes',
    description: 'A real <button> among <div role="button"> twins with the same copy',
    hardness: 'hostile',
    // Same one-durable-family refusal as the Tailwind bar; abstaining is right.
    // Its value is as the pre-registered Step 5b control, and `wrong` is tracked
    // independently of the contract, so nothing here can mask a new one.
    ambiguousWithoutSelection: true,
    build: (container) => {
      // Pre-registered control for Step 5b. Today `element-semantics` is an
      // all-or-nothing conjunction including the tag, so the divs fail it and
      // the real button is separated for free. Letting an explicit ARIA role
      // substitute for the tag makes the divs newly satisfy the family — this
      // is the fixture that says whether that manufactures a `wrong`.
      // The target sits last so `siblings-reordered` can hand the positional
      // bonus to a div, which is the path by which a tie could become a loss.
      const list = row({ class: 'approvals' });
      list.append(
        el('div', { role: 'button', tabindex: '0', class: 'act' }, 'Approve'),
        el('div', { role: 'button', tabindex: '0', class: 'act' }, 'Approve'),
        el('button', { type: 'button', class: 'act' }, 'Approve'),
      );
      container.appendChild(list);
      const target = list.lastElementChild;
      if (!target) throw new Error('role-button-lookalikes fixture did not build a target');
      return target;
    },
  },
  {
    id: 'identical-twin-controls',
    description: 'Two controls identical in every durable signal, including copy',
    hardness: 'hostile',
    ambiguousWithoutSelection: true,
    build: (container) => {
      // Adversarial by construction: nothing durable separates these, so the
      // only correct behaviour is to abstain. Unlike `header-actions-tied` the
      // copy is identical too, which removes the localized-text tiebreak that
      // page still leaves available.
      const split = row({ class: 'split-pane' });
      const left = el('section', { class: 'pane' });
      const right = el('section', { class: 'pane' });
      left.appendChild(el('button', { type: 'button', class: 'act' }, 'Compare'));
      right.appendChild(el('button', { type: 'button', class: 'act' }, 'Compare'));
      split.append(left, right);
      container.appendChild(split);
      const target = right.firstElementChild;
      if (!target) throw new Error('identical-twin-controls fixture did not build a target');
      return target;
    },
  },
  {
    id: 'wizard-next-click',
    description: 'Click-captured wizard control beside a disabled look-alike',
    hardness: 'moderate',
    // The only fixture that exercises the actionability guard. Step 1 found
    // every page captured `anchor`, so `requiredActionsPass` had never rejected
    // anything and the corpus was measuring a filter that was switched off.
    captureAction: 'observe-click',
    build: (container) => {
      const footer = row({ class: 'wizard-footer' });
      const back = el('button', { type: 'button', class: 'step' }, 'Back');
      const skip = el('button', { type: 'button', class: 'step', disabled: '' }, 'Continue');
      // Instrumented on purpose. Without a second durable family the page would
      // abstain for reasons that have nothing to do with actionability, and the
      // guard — the only thing this fixture exists to exercise — would never be
      // the deciding factor in either direction.
      const next = el(
        'button',
        { type: 'button', class: 'step', 'data-testid': 'wizard-next' },
        'Continue',
      );
      footer.append(back, skip, next);
      container.appendChild(footer);
      return next;
    },
  },
];

/**
 * Arm B only, and deliberately not in `HOST_PAGES`.
 *
 * `table-row-action` and `pricing-card-cta` differ in one way that turns out to
 * decide whether a content-anchored policy works at all: a pricing card owns a
 * direct-child `<h3>`, so `containerLabelOf` can name it, while a table row
 * carries its identity in a *sibling cell* and has no accessible name. This
 * fixture is the same table with the row labelled, isolating that one variable.
 *
 * Kept out of `HOST_PAGES` so Arm A's 77 trials stay comparable with the Step 1
 * and Step 2 baselines; widening the corpus is Step 4's job, not this one.
 */
export const POLICY_PROBE_PAGES: readonly HostPage[] = [
  {
    id: 'table-row-action-labelled',
    description: 'Same row action, but each row carries aria-label with its record name',
    hardness: 'hostile',
    ambiguousWithoutSelection: true,
    build: (container) => {
      const table = el('div', { class: 'table', role: 'table' });
      const rows = ['Acme Inc', 'Globex', 'Initech'];
      let targetButton: Element | null = null;
      for (const name of rows) {
        const record = row({ class: 'tr', role: 'row', 'aria-label': name });
        record.appendChild(el('span', { class: 'td', role: 'cell' }, name));
        const action = el('button', { type: 'button', class: 'td-action' }, 'Manage');
        record.appendChild(action);
        table.appendChild(record);
        if (name === 'Globex') targetButton = action;
      }
      container.appendChild(table);
      if (!targetButton) throw new Error('table-row-action-labelled fixture did not build a target');
      return targetButton;
    },
  },
  {
    id: 'table-row-action-sorted',
    description: 'Sortable table declaring its order, target in the newest row',
    hardness: 'hostile',
    ambiguousWithoutSelection: true,
    // The only fixture where `newest-in-collection` can do anything at all:
    // `orderedByDeclaredRecency` refuses unless the product states its own
    // ordering, so without an `aria-sort` header that policy abstains on every
    // trial and a change to what it counts would go unmeasured.
    //
    // The target is the *first* row on purpose. Pointing a "first"/"newest"
    // policy at row two would report `intent-violated` on the pristine page and
    // on every mutation alike, which measures the fixture, not the resolver.
    build: (container) => {
      const table = el('div', { class: 'table', role: 'table' });
      const head = row({ class: 'tr', role: 'row' });
      head.appendChild(
        el('span', { class: 'th', role: 'columnheader', 'aria-sort': 'descending' }, 'Created'),
      );
      head.appendChild(el('span', { class: 'th', role: 'columnheader' }, 'Actions'));
      table.appendChild(head);
      const rows = ['Acme Inc', 'Globex', 'Initech'];
      let targetButton: Element | null = null;
      for (const name of rows) {
        const record = row({ class: 'tr', role: 'row' });
        record.appendChild(el('span', { class: 'td', role: 'cell' }, name));
        const action = el('button', { type: 'button', class: 'td-action' }, 'Manage');
        record.appendChild(action);
        table.appendChild(record);
        if (name === 'Acme Inc') targetButton = action;
      }
      container.appendChild(table);
      if (!targetButton) throw new Error('table-row-action-sorted fixture did not build a target');
      return targetButton;
    },
  },
];
