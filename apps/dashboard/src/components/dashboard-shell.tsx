import { FileText, KeyRound, ShieldCheck } from 'lucide-react';
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

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-7xl gap-4 bg-background p-4 text-foreground md:p-6">
      <header className="flex min-h-24 items-center justify-between gap-4 rounded-lg border border-border bg-surface p-5 text-surface-foreground shadow-sm shadow-black/20">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Lodariq</p>
          <h1 className="text-3xl font-semibold tracking-normal">Control plane</h1>
        </div>
        <div className="inline-flex items-center gap-3">
          <DashboardAuthControls />
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck aria-hidden="true" />
            <span>Fly target</span>
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
          label="Documents"
          value={viewModel.documentRows.length}
        />
        <SummaryCard
          icon={<KeyRound aria-hidden="true" />}
          label="Tokens"
          value={viewModel.tokenRows.length}
        />
        <SummaryCard
          icon={<ShieldCheck aria-hidden="true" />}
          label="Environments"
          value={viewModel.environmentOptions.length}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
        <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Canonical JSON</p>
            <CardTitle id="documents-heading">Documents</CardTitle>
            <CardDescription>
              API-backed structured block JSON with publication state by environment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentsTable rows={viewModel.documentRows} />
          </CardContent>
        </Card>

        <aside className="grid content-start gap-4">
          <SdkSnippetPanel
            environmentOptions={viewModel.sdkInstallEnvironmentOptions}
            tokenRows={viewModel.tokenRows}
            defaultEnvironmentId={viewModel.defaultSdkEnvironmentId}
          />

          <AuthoringLaunchPanel
            documentRows={viewModel.documentRows}
            environmentOptions={viewModel.environmentOptions}
            defaultEnvironmentId={viewModel.defaultEnvironmentId}
          />

          <DocumentDebugPanel documentRows={viewModel.documentRows} />

          <Card>
            <CardHeader>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Origins</p>
              <CardTitle id="environments-heading">Environments</CardTitle>
              <CardDescription>
                Exact origins used by staging and development SDK flows.
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
        </aside>
      </div>
    </main>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-5">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
