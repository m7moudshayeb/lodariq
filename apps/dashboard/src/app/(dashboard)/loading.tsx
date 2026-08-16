import { DASHBOARD_ERROR_MESSAGES } from '../../i18n/messages';
import { getDashboardI18n } from '../../i18n/server';

export default async function DashboardLoading(): Promise<React.ReactElement> {
  const { i18n } = await getDashboardI18n();
  return (
    <div
      aria-busy="true"
      aria-label={i18n._(DASHBOARD_ERROR_MESSAGES.loading)}
      className="min-h-screen bg-background text-foreground md:grid md:grid-cols-[72px_minmax(0,1fr)]"
    >
      <aside className="sticky top-0 hidden h-screen w-full min-w-0 flex-col border-e border-border bg-card md:flex">
        <div className="flex h-20 items-center justify-center px-2">
          <span className="size-11 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="grid justify-items-center gap-2 px-2">
          {Array.from({ length: 7 }, (_, index) => (
            <span className="size-11 animate-pulse rounded-xl bg-muted" key={index} />
          ))}
        </div>
        <div className="mt-auto grid justify-items-center gap-3 border-t border-border px-2 py-4">
          <span className="size-11 animate-pulse rounded-xl bg-muted" />
          <span className="size-10 animate-pulse rounded-full bg-muted" />
        </div>
      </aside>
      <div className="min-w-0 md:col-start-2">
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 md:hidden">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <span className="h-6 w-28 animate-pulse rounded bg-muted" />
            <span className="size-11 animate-pulse rounded-md bg-muted" />
          </div>
        </header>
        <main
          className="mx-auto min-h-screen w-full px-4 py-6 sm:px-6 md:px-8 md:py-16 lg:px-10"
          id="dashboard-active-view"
        >
          <div className="grid gap-7">
            <div className="grid gap-3">
              <span className="h-3 w-24 animate-pulse rounded bg-muted" />
              <span className="h-10 w-64 max-w-full animate-pulse rounded-lg bg-muted" />
            </div>
            <div className="grid gap-3 rounded-xl border border-border p-5">
              <span className="h-5 w-40 animate-pulse rounded bg-muted" />
              <span className="h-20 animate-pulse rounded-lg bg-muted" />
              <span className="h-20 animate-pulse rounded-lg bg-muted" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
