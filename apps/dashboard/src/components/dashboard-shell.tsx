import { FileText, KeyRound, Megaphone, MousePointer2, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import type { DashboardDataDto } from '../lib/api';
import { buildDashboardViewModel } from '../lib/view-model';
import { AuthoringLaunchPanel } from './authoring-launch-panel';
import { DashboardAuthControls } from './dashboard-auth-controls';
import { DocumentDebugPanel } from './document-debug-panel';
import { DocumentsTable } from './documents-table';
import { SdkSnippetPanel } from './sdk-snippet-panel';
import { ThemeToggle } from './theme-toggle';

interface DashboardShellProps {
  data: DashboardDataDto;
  apiError?: string;
}

export function DashboardShell({ data, apiError }: DashboardShellProps): React.ReactElement {
  const viewModel = buildDashboardViewModel(data);
  const publishedCount = viewModel.documentRows.filter(
    (document) => document.publicationLabel === 'Published',
  ).length;
  const attentionCount = viewModel.documentRows.filter(
    (document) => document.publicationVariant !== 'success',
  ).length;

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[1480px] gap-5 bg-background p-4 text-foreground md:p-6">
      <header className="grid gap-5 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xs shadow-black/5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Lodariq</p>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-normal md:text-4xl">
              Experience workspace
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Draft tours today, then use the same editor flow for announcements and hotspots as
              those formats come online.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2" aria-label="Experience types">
            <ExperienceTypePill active icon={<Sparkles aria-hidden="true" />} label="Tours" />
            <ExperienceTypePill icon={<Megaphone aria-hidden="true" />} label="Announcements" />
            <ExperienceTypePill icon={<MousePointer2 aria-hidden="true" />} label="Hotspots" />
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-start gap-3 lg:justify-end">
          <DashboardAuthControls />
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck aria-hidden="true" />
            <span>Secure workspace</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {apiError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {apiError}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3" aria-label="Workspace summary">
        <SummaryCard
          icon={<FileText aria-hidden="true" />}
          label="Experiences"
          value={viewModel.documentRows.length}
          detail={`${publishedCount} published`}
        />
        <SummaryCard
          icon={<KeyRound aria-hidden="true" />}
          label="Site connections"
          value={viewModel.tokenRows.length}
          detail={viewModel.hasTokens ? 'staging ready' : 'no connected sites'}
        />
        <SummaryCard
          icon={<ShieldCheck aria-hidden="true" />}
          label="Trusted sites"
          value={viewModel.environmentOptions.length}
          detail={attentionCount ? `${attentionCount} need review` : 'publishing state clean'}
        />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
        <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Experience library
            </p>
            <CardTitle id="documents-heading">Experiences</CardTitle>
            <CardDescription>
              Track drafts, readiness, and publishing state for every customer-facing experience.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentsTable rows={viewModel.documentRows} />
          </CardContent>
        </Card>

        <aside className="grid content-start gap-4">
          <AuthoringLaunchPanel
            documentRows={viewModel.documentRows}
            environmentOptions={viewModel.environmentOptions}
            defaultEnvironmentId={viewModel.defaultEnvironmentId}
          />

          <Card>
            <CardHeader>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Sites</p>
              <CardTitle id="environments-heading">Trusted sites</CardTitle>
              <CardDescription>
                Customer website origins where Lodariq can preview, edit, or publish experiences.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {viewModel.environmentOptions.map((environment) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-md border bg-surface-muted/50 p-3"
                  key={environment.id}
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{environment.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {environment.originLabel}
                    </p>
                  </div>
                  <Badge variant="outline">{environment.kind}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <SdkSnippetPanel
            environmentOptions={viewModel.sdkInstallEnvironmentOptions}
            tokenRows={viewModel.tokenRows}
            defaultEnvironmentId={viewModel.defaultSdkEnvironmentId}
          />

          <DocumentDebugPanel documentRows={viewModel.documentRows} />
        </aside>
      </div>
    </main>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-5">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ExperienceTypePill({
  active = false,
  icon,
  label,
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
}): React.ReactElement {
  return (
    <span
      className={
        active
          ? 'inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary'
          : 'inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-muted-foreground'
      }
    >
      <span className="[&_svg]:size-4">{icon}</span>
      {label}
    </span>
  );
}
