/**
 * Realistic SaaS-like fixture UI (PRD §16.1 fixture-host scope).
 *
 * Intentionally includes the host-page conditions the resolver/runtime must
 * survive: client-side routes, a scroll container, a drawer, repeated labels,
 * and lazy-loaded content. Stable elements carry `data-lodariq-id` so the
 * semantic resolver has a high-confidence signal.
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
        <section data-view="dashboard"><h1>Dashboard</h1><p>Welcome back.</p></section>
        <section data-view="projects" hidden>
          <h1>Projects</h1>
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
  populateList(root);
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
