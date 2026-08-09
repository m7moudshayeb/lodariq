/**
 * Realistic SaaS-like fixture UI (PRD §16.1 fixture-host scope).
 *
 * Intentionally includes the host-page conditions the resolver/runtime must
 * survive: client-side routes, a scroll container, a drawer, repeated labels,
 * and lazy-loaded content. Most stable elements carry `data-lodariq-id` so the
 * semantic resolver has a high-confidence signal. The Projects view also has a
 * deliberately marker-free Target Identity V2 surface for resilience checks.
 */
export function renderApp(root: HTMLElement): void {
  root.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <h2>Acme</h2>
        <nav>
          <a data-route="dashboard" class="active">Dashboard</a>
          <a data-route="projects">Projects</a>
          <a data-route="billing">Billing</a>
        </nav>
      </aside>
      <main class="main">
        <div class="toolbar">
          <button class="primary" data-lodariq-id="new-project" aria-label="New project">
            New project
          </button>
          <button data-lodariq-id="open-drawer" aria-label="Open settings">Settings</button>
          <button data-lodariq-id="open-modal" aria-label="Open import modal">Import</button>
          <button data-lodariq-id="start-tour" aria-label="Start tour">Start tour</button>
        </div>
        <section data-view="dashboard" class="dashboard-view">
          <header class="page-heading">
            <div>
              <p class="page-eyebrow">Workspace</p>
              <h1>Dashboard</h1>
              <p>Plan, track, and deliver work that matters.</p>
            </div>
          </header>
          <div class="project-summary" aria-label="Project summary">
            <article><span>Active projects</span><strong>18</strong><small>3 launched this month</small></article>
            <article><span>On track</span><strong>14</strong><small>78% of active work</small></article>
            <article><span>Needs attention</span><strong>4</strong><small>2 due this week</small></article>
          </div>
          <section class="recent-projects" aria-labelledby="recent-projects-title">
            <div class="section-heading">
              <div>
                <h2 id="recent-projects-title">Recent projects</h2>
                <p>Keep the team moving without losing context.</p>
              </div>
              <button type="button">View all</button>
            </div>
            <div class="project-table" role="table" aria-label="Recent projects">
              <div class="project-row project-row-header" role="row">
                <span role="columnheader">Project</span><span role="columnheader">Owner</span><span role="columnheader">Status</span><span role="columnheader">Updated</span>
              </div>
              <div class="project-row" role="row"><strong role="cell">Product launch</strong><span role="cell">Marcus Chen</span><span role="cell"><em class="status-chip on-track">On track</em></span><time role="cell">Today</time></div>
              <div class="project-row" role="row"><strong role="cell">Website redesign</strong><span role="cell">Priya Shah</span><span role="cell"><em class="status-chip planning">Planning</em></span><time role="cell">Yesterday</time></div>
              <div class="project-row" role="row"><strong role="cell">Pricing refresh</strong><span role="cell">Alex Rivera</span><span role="cell"><em class="status-chip at-risk">At risk</em></span><time role="cell">Aug 4</time></div>
              <div class="project-row" role="row"><strong role="cell">Customer research</strong><span role="cell">Jordan Lee</span><span role="cell"><em class="status-chip on-track">On track</em></span><time role="cell">Aug 3</time></div>
            </div>
          </section>
        </section>
        <section data-view="projects" hidden>
          <h1>Projects</h1>
          <section class="target-identity-v2-surface" aria-label="Target identity reliability fixture">
            <div class="target-identity-v2-heading">
              <div>
                <p class="target-identity-v2-eyebrow">Reliability fixture</p>
                <h2 class="target-identity-v2-title">Marker-free project actions</h2>
                <p class="target-identity-v2-description">
                  These controls exercise localization, DOM replacement, and layout reflow.
                </p>
              </div>
              <div class="target-identity-v2-controls" role="group" aria-label="Target stress controls">
                <button type="button" class="target-identity-locale-control">Switch to German</button>
                <button type="button" class="target-identity-rerender-control">Replace target node</button>
                <button type="button" class="target-identity-reflow-control" aria-pressed="false">
                  Reflow layout
                </button>
              </div>
            </div>
            <div class="target-identity-v2-stage">
              <article class="target-identity-v2-card target-identity-v2-primary-card">
                <div>
                  <h3 class="target-identity-v2-primary-heading">Project workspace</h3>
                  <p class="target-identity-v2-primary-description">Start work for your delivery team.</p>
                </div>
                <div class="target-identity-v2-action-slot target-identity-primary"></div>
              </article>
              <aside class="target-identity-v2-card target-identity-v2-distractor-card">
                <div>
                  <h3 class="target-identity-v2-distractor-heading">Project templates</h3>
                  <p class="target-identity-v2-distractor-description">Save a reusable starting point.</p>
                </div>
                <div class="target-identity-v2-action-slot target-identity-distractor"></div>
              </aside>
            </div>
            <p class="target-identity-v2-status" role="status" aria-live="polite">
              Target render 1 is ready in English with the standard layout.
            </p>
          </section>
          <div class="scroll-list" id="project-list"></div>
        </section>
        <section data-view="billing" hidden><h1>Billing</h1><p>Manage your plan.</p></section>
      </main>
      <div class="drawer" id="settings-drawer">
        <h2>Settings</h2>
        <button data-lodariq-id="close-drawer">Close</button>
      </div>
      <div class="modal-backdrop" id="import-modal" hidden>
        <section class="modal" role="dialog" aria-label="Import projects">
          <h2>Import projects</h2>
          <p>Upload a CSV to create projects in bulk.</p>
          <button data-lodariq-id="confirm-import" aria-label="Review import">Review</button>
          <button data-lodariq-id="close-modal" aria-label="Close import modal">Close</button>
        </section>
      </div>
    </div>
  `;

  wireRouting(root);
  wireDrawer(root);
  wireModal(root);
  wireTargetIdentityV2Surface(root);
  populateList(root);
}

type TargetIdentityLocale = 'en' | 'de';

interface TargetIdentityCopy {
  surfaceLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  primaryHeading: string;
  primaryDescription: string;
  primaryAction: string;
  distractorHeading: string;
  distractorDescription: string;
  distractorAction: string;
  localeControl: string;
}

const TARGET_IDENTITY_COPY: Record<TargetIdentityLocale, TargetIdentityCopy> = {
  en: {
    surfaceLabel: 'Target identity reliability fixture',
    eyebrow: 'Reliability fixture',
    title: 'Marker-free project actions',
    description: 'These controls exercise localization, DOM replacement, and layout reflow.',
    primaryHeading: 'Project workspace',
    primaryDescription: 'Start work for your delivery team.',
    primaryAction: 'Create project',
    distractorHeading: 'Project templates',
    distractorDescription: 'Save a reusable starting point.',
    distractorAction: 'Create project template',
    localeControl: 'Switch to German',
  },
  de: {
    surfaceLabel: 'Testbereich für zuverlässige Zielerkennung',
    eyebrow: 'Zuverlässigkeitstest',
    title: 'Projektaktionen ohne technische Markierungen',
    description: 'Diese Steuerelemente testen Sprache, DOM-Austausch und Layout-Änderungen.',
    primaryHeading: 'Projektarbeitsbereich',
    primaryDescription: 'Beginnen Sie die Arbeit für Ihr Projektteam.',
    primaryAction: 'Projekt erstellen',
    distractorHeading: 'Projektvorlagen',
    distractorDescription: 'Speichern Sie einen wiederverwendbaren Ausgangspunkt.',
    distractorAction: 'Projektvorlage erstellen',
    localeControl: 'Zu Englisch wechseln',
  },
};

function wireTargetIdentityV2Surface(root: HTMLElement): void {
  const surface = root.querySelector<HTMLElement>('.target-identity-v2-surface');
  const primarySlot = root.querySelector<HTMLElement>('.target-identity-primary');
  const distractorSlot = root.querySelector<HTMLElement>('.target-identity-distractor');
  const localeControl = root.querySelector<HTMLButtonElement>('.target-identity-locale-control');
  const rerenderControl = root.querySelector<HTMLButtonElement>(
    '.target-identity-rerender-control',
  );
  const reflowControl = root.querySelector<HTMLButtonElement>('.target-identity-reflow-control');
  const status = root.querySelector<HTMLElement>('.target-identity-v2-status');

  if (
    !surface ||
    !primarySlot ||
    !distractorSlot ||
    !localeControl ||
    !rerenderControl ||
    !reflowControl ||
    !status
  ) {
    return;
  }

  let locale: TargetIdentityLocale = 'en';
  let targetRender = 1;
  let isReflowed = false;

  const activatePrimary = (): void => {
    const label = TARGET_IDENTITY_COPY[locale].primaryAction;
    status.textContent = `Activated "${label}" from target render ${targetRender}.`;
  };

  const activateDistractor = (): void => {
    const label = TARGET_IDENTITY_COPY[locale].distractorAction;
    status.textContent = `Activated the semantic distractor "${label}".`;
  };

  const replacePrimaryAction = (): void => {
    primarySlot.replaceChildren(
      createMarkerFreeAction(TARGET_IDENTITY_COPY[locale].primaryAction, activatePrimary),
    );
  };

  const renderLocalizedCopy = (): void => {
    const copy = TARGET_IDENTITY_COPY[locale];
    surface.lang = locale;
    surface.setAttribute('aria-label', copy.surfaceLabel);
    setText(root, '.target-identity-v2-eyebrow', copy.eyebrow);
    setText(root, '.target-identity-v2-title', copy.title);
    setText(root, '.target-identity-v2-description', copy.description);
    setText(root, '.target-identity-v2-primary-heading', copy.primaryHeading);
    setText(root, '.target-identity-v2-primary-description', copy.primaryDescription);
    setText(root, '.target-identity-v2-distractor-heading', copy.distractorHeading);
    setText(root, '.target-identity-v2-distractor-description', copy.distractorDescription);
    setText(primarySlot, '.target-identity-v2-action-label', copy.primaryAction);
    setText(distractorSlot, '.target-identity-v2-action-label', copy.distractorAction);
    localeControl.textContent = copy.localeControl;
  };

  primarySlot.append(
    createMarkerFreeAction(TARGET_IDENTITY_COPY.en.primaryAction, activatePrimary),
  );
  distractorSlot.append(
    createMarkerFreeAction(TARGET_IDENTITY_COPY.en.distractorAction, activateDistractor),
  );

  localeControl.addEventListener('click', () => {
    locale = locale === 'en' ? 'de' : 'en';
    renderLocalizedCopy();
    const localeLabel = locale === 'en' ? 'English' : 'German';
    status.textContent = `Localized the same target intent to ${localeLabel}.`;
  });

  rerenderControl.addEventListener('click', () => {
    targetRender += 1;
    replacePrimaryAction();
    status.textContent = `Replaced the target DOM node with target render ${targetRender}.`;
  });

  reflowControl.addEventListener('click', () => {
    isReflowed = !isReflowed;
    surface.classList.toggle('is-reflowed', isReflowed);
    reflowControl.setAttribute('aria-pressed', String(isReflowed));
    reflowControl.textContent = isReflowed ? 'Restore layout' : 'Reflow layout';
    status.textContent = isReflowed
      ? 'Reflowed the cards without changing the target intent.'
      : 'Restored the standard card layout without changing the target intent.';
  });
}

function createMarkerFreeAction(label: string, onActivate: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';

  const icon = document.createElement('span');
  icon.className = 'target-identity-v2-action-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `
    <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
      <path d="M10 4v12M4 10h12" />
    </svg>
  `;

  const text = document.createElement('span');
  text.className = 'target-identity-v2-action-label';
  text.textContent = label;

  button.append(icon, text);
  button.addEventListener('click', onActivate);
  return button;
}

function setText(root: ParentNode, selector: string, value: string): void {
  const element = root.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}

function wireRouting(root: HTMLElement): void {
  const links = root.querySelectorAll<HTMLAnchorElement>('[data-route]');
  links.forEach((link) => {
    link.addEventListener('click', () => {
      links.forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      const route = link.dataset['route'];
      root.querySelectorAll<HTMLElement>('[data-view]').forEach((view) => {
        view.hidden = view.dataset['view'] !== route;
      });
    });
  });
}

function wireDrawer(root: HTMLElement): void {
  const drawer = root.querySelector<HTMLElement>('#settings-drawer');
  root.querySelector('[data-lodariq-id="open-drawer"]')?.addEventListener('click', () => {
    drawer?.classList.add('open');
  });
  root.querySelector('[data-lodariq-id="close-drawer"]')?.addEventListener('click', () => {
    drawer?.classList.remove('open');
  });
}

function wireModal(root: HTMLElement): void {
  const modal = root.querySelector<HTMLElement>('#import-modal');
  root.querySelector('[data-lodariq-id="open-modal"]')?.addEventListener('click', () => {
    if (modal) modal.hidden = false;
  });
  root.querySelector('[data-lodariq-id="close-modal"]')?.addEventListener('click', () => {
    if (modal) modal.hidden = true;
  });
}

function populateList(root: HTMLElement): void {
  const list = root.querySelector<HTMLElement>('#project-list');
  if (!list) return;
  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton-row';
  skeleton.setAttribute('aria-label', 'Loading projects');
  list.appendChild(skeleton);
  // Lazy-load rows to mimic async tables (PRD §8.6 virtualized/async UI).
  setTimeout(() => {
    list.replaceChildren();
    for (let i = 1; i <= 40; i += 1) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span>Project ${i}</span><button aria-label="Open project">Open</button>`;
      list.appendChild(row);
    }
  }, 300);
}
