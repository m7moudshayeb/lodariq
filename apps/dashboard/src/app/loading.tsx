import { DASHBOARD_ERROR_MESSAGES } from '../i18n/messages';
import { getDashboardI18n } from '../i18n/server';

export default async function DashboardLoading(): Promise<React.ReactElement> {
  const { i18n } = await getDashboardI18n();
  return (
    <main
      aria-busy="true"
      aria-label={i18n._(DASHBOARD_ERROR_MESSAGES.loading)}
      className="min-h-screen bg-background p-4 text-foreground sm:p-8"
    >
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl grid-cols-[72px_1fr] overflow-hidden rounded-2xl border border-border bg-card sm:min-h-[calc(100vh-4rem)]">
        <div className="grid content-start justify-center gap-4 border-e border-border py-6">
          {Array.from({ length: 6 }, (_, index) => (
            <span className="size-10 animate-pulse rounded-xl bg-muted" key={index} />
          ))}
        </div>
        <div className="grid content-start gap-7 p-6 sm:p-10">
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
      </div>
    </main>
  );
}
