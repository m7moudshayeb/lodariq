export function renderCustomerLikeApp(root: HTMLElement): void {
  root.innerHTML = `
    <div class="workspace-shell">
      <header class="topbar">
        <strong>Northstar CRM</strong>
        <button data-talmeh-id="new-project" aria-label="New project">New project</button>
      </header>
      <main class="content">
        <section class="pipeline" aria-label="Pipeline">
          <article>
            <h1>Pipeline</h1>
            <p>Review active opportunities and unresolved handoffs.</p>
            <button aria-label="Review account">Review</button>
          </article>
          <article class="transformed-card">
            <h2>Renewal queue</h2>
            <button aria-label="Review account">Review</button>
          </article>
        </section>
        <aside class="activity">
          <h2>Activity</h2>
          <div class="skeleton" aria-label="Loading activity"></div>
          <ul>
            <li>Contract update requested</li>
            <li>Security review pending</li>
            <li>Invoice approved</li>
          </ul>
        </aside>
      </main>
    </div>
  `;
}
