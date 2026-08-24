import type { DashboardViewModel } from '../lib/view-model';
import { AnalyticsPanel, type AnalyticsEnvironmentOption } from './analytics-panel';
import { ApplicationsPanel } from './applications-panel';
import { ExperienceMeasurementPanel } from './experience-measurement-panel';
import { DocumentsTable } from './documents-table';
import { LaunchQueue } from './launch-queue';
import { RecentActivity } from './recent-activity';
import { DashboardPageHeader, OpenInProductAction } from './dashboard-view-components';
import { Card, CardContent } from './ui/card';

export function OverviewView({
  viewModel,
  onReviewRelease,
  onViewAll,
}: {
  viewModel: DashboardViewModel;
  onReviewRelease: (documentId: string) => void;
  onViewAll: () => void;
}): React.ReactElement {
  return (
    <>
      <DashboardPageHeader
        view="overview"
        action={<OpenInProductAction url={viewModel.openInProductUrl} />}
        editorial
      />
      <LaunchQueue rows={viewModel.documentRows} onReviewRelease={onReviewRelease} />
      <RecentActivity activities={viewModel.recentActivity} onViewAll={onViewAll} />
    </>
  );
}

export function ExperiencesView({
  viewModel,
}: {
  viewModel: DashboardViewModel;
}): React.ReactElement {
  return (
    <>
      <DashboardPageHeader view="experiences" />
      <Card className="shadow-none">
        <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
          <DocumentsTable rows={viewModel.documentRows} />
        </CardContent>
      </Card>
    </>
  );
}

export function AnalyticsView({
  viewModel,
  workspaceId,
}: {
  viewModel: DashboardViewModel;
  workspaceId: string;
}): React.ReactElement {
  const environments = analyticsEnvironmentOptions(viewModel.environmentOptions);
  // Production when it exists: the question "did this work" is about real users.
  const measured =
    environments.find((environment) => environment.kind === 'production') ?? environments[0];
  return (
    <>
      <DashboardPageHeader view="analytics" />
      <AnalyticsPanel environments={environments} workspaceId={workspaceId} />
      {measured ? (
        <ExperienceMeasurementPanel
          environmentId={measured.id}
          experiences={viewModel.documentRows.map((row) => ({ id: row.id, name: row.title }))}
          workspaceId={workspaceId}
        />
      ) : null}
    </>
  );
}

export function ApplicationsView({
  workspaceId,
}: {
  workspaceId: string;
}): React.ReactElement {
  return (
    <>
      <DashboardPageHeader view="applications" />
      <ApplicationsPanel workspaceId={workspaceId} />
    </>
  );
}

function analyticsEnvironmentOptions(
  environments: DashboardViewModel['environmentOptions'],
): AnalyticsEnvironmentOption[] {
  return environments.flatMap((environment) => {
    if (environment.kind !== 'staging' && environment.kind !== 'production') return [];
    return [
      {
        id: environment.id,
        kind: environment.kind,
        name: environment.name,
        enabled: environment.enabled ?? true,
      },
    ];
  });
}
