/**
 * Realistic SaaS-like fixture UI (PRD §16.1 fixture-host scope).
 *
 * Intentionally includes the host-page conditions the resolver/runtime must
 * survive: client-side routes, a scroll container, a drawer, repeated labels,
 * and lazy-loaded content. Stable elements carry `data-talmeh-id` so the
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
          <button class="primary" data-talmeh-id="new-project" aria-label="New project">
            New project
          </button>
          <button data-talmeh-id="open-drawer" aria-label="Open settings">Settings</button>
          <button data-talmeh-id="start-tour" aria-label="Start tour">Start tour</button>
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
        <button data-talmeh-id="close-drawer">Close</button>
      </div>
    </div>
  `;

  wireRouting(root);
  wireDrawer(root);
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
  root.querySelector('[data-talmeh-id="open-drawer"]')?.addEventListener('click', () => {
    drawer?.classList.add('open');
  });
  root.querySelector('[data-talmeh-id="close-drawer"]')?.addEventListener('click', () => {
    drawer?.classList.remove('open');
  });
}

function populateList(root: HTMLElement): void {
  const list = root.querySelector<HTMLElement>('#project-list');
  if (!list) return;
  // Lazy-load rows to mimic async tables (PRD §8.6 virtualized/async UI).
  setTimeout(() => {
    for (let i = 1; i <= 40; i += 1) {
      const row = document.createElement('div');
      row.className = 'row';
      row.textContent = `Project ${i}`;
      list.appendChild(row);
    }
  }, 300);
}
