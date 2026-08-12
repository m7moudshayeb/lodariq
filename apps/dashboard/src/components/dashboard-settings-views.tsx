'use client';

import * as React from 'react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useEnvironmentApprovalMutation } from '../hooks/use-environment-mutations';
import type { WorkspaceEnvironmentDto } from '../lib/api';
import type { DashboardViewModel } from '../lib/view-model';
import { AuthoringLaunchPanel } from './authoring-launch-panel';
import { BrandSystemPanel } from './brand-system-panel';
import { DashboardPageHeader } from './dashboard-view-components';
import { DocumentDebugPanel } from './document-debug-panel';
import { EnvironmentPolicyEditor } from './environment-policy-editor';
import { SdkSnippetPanel } from './sdk-snippet-panel';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface DashboardSettingsViewProps {
  viewModel: DashboardViewModel;
  workspaceId: string;
}

const COPY = {
  trustedOrigins: msg({ id: 'dashboard.environments.trustedOrigins', message: 'Trusted origins' }),
  productEnvironments: msg({
    id: 'dashboard.environments.productEnvironments',
    message: 'Product environments',
  }),
  productEnvironmentsDescription: msg({
    id: 'dashboard.environments.description',
    message: 'Exact customer origins where Lodariq may load runtime or authoring capabilities.',
  }),
  noProductEnvironments: msg({
    id: 'dashboard.environments.empty',
    message: 'No product environments are configured.',
  }),
  promotionApproval: msg({
    id: 'dashboard.environments.promotionApproval',
    message: 'Promotion approval',
  }),
  approvalRequiredDescription: msg({
    id: 'dashboard.environments.approvalRequiredDescription',
    message: 'One explicit approval is required for the exact verified artifact.',
  }),
  directPromotionDescription: msg({
    id: 'dashboard.environments.directPromotionDescription',
    message: 'A releaser can promote the exact verified artifact directly.',
  }),
  unableToUpdateApproval: msg({
    id: 'dashboard.environments.unableToUpdateApproval',
    message: 'Unable to update release approval.',
  }),
  updating: msg({ id: 'dashboard.environments.updating', message: 'Updating…' }),
  removeApproval: msg({
    id: 'dashboard.environments.removeApproval',
    message: 'Remove approval',
  }),
  requireApproval: msg({
    id: 'dashboard.environments.requireApproval',
    message: 'Require approval',
  }),
  noTrustedOrigins: msg({
    id: 'dashboard.environments.noTrustedOrigins',
    message: 'No trusted origins',
  }),
} as const;

export function BrandSystemView({
  viewModel,
  workspaceId,
}: DashboardSettingsViewProps): React.ReactElement {
  return (
    <>
      <DashboardPageHeader view="brand-system" />
      <BrandSystemPanel
        authoringUrl={viewModel.openInProductUrl}
        sourceSummary={viewModel.brandSourceSummary}
        canApprove={viewModel.canApproveBrandSystem}
        canEdit={viewModel.canEditBrandSystem}
        themes={viewModel.brandThemes}
        workspaceId={workspaceId}
      />
    </>
  );
}

export function EnvironmentsView({
  viewModel,
  workspaceId,
}: DashboardSettingsViewProps): React.ReactElement {
  const { _ } = useLingui();
  return (
    <>
      <DashboardPageHeader view="environments" />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.8fr)]">
        <Card className="shadow-none">
          <CardHeader>
            <p className="text-xs font-semibold text-muted-foreground">{_(COPY.trustedOrigins)}</p>
            <CardTitle>{_(COPY.productEnvironments)}</CardTitle>
            <CardDescription>{_(COPY.productEnvironmentsDescription)}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {viewModel.environmentOptions.length ? (
              viewModel.environmentOptions.map((environment) => (
                <EnvironmentPolicyCard
                  canManage={viewModel.canManageSdkInstallations}
                  environment={environment}
                  environments={viewModel.environmentOptions}
                  key={environment.id}
                  workspaceId={workspaceId}
                />
              ))
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                {_(COPY.noProductEnvironments)}
              </p>
            )}
          </CardContent>
        </Card>

        <SdkSnippetPanel
          canManageSdkInstallations={viewModel.canManageSdkInstallations}
          installationRows={viewModel.installationRows}
          workspaceId={workspaceId}
        />
      </div>
    </>
  );
}

export function SupportView({
  viewModel,
  workspaceId,
}: DashboardSettingsViewProps): React.ReactElement {
  return (
    <>
      <DashboardPageHeader view="support" />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <AuthoringLaunchPanel
          authoringSiteOptions={viewModel.authoringSiteOptions}
          defaultEnvironmentId={viewModel.defaultEnvironmentId}
        />
        <DocumentDebugPanel documentRows={viewModel.documentRows} workspaceId={workspaceId} />
      </div>
    </>
  );
}

function EnvironmentPolicyCard({
  canManage,
  environment,
  environments,
  workspaceId,
}: {
  canManage: boolean;
  environment: WorkspaceEnvironmentDto & { originLabel: string };
  environments: Array<WorkspaceEnvironmentDto & { originLabel: string }>;
  workspaceId: string;
}): React.ReactElement {
  const { _ } = useLingui();
  const [current, setCurrent] = React.useState(environment);
  const onUpdated = (updated: WorkspaceEnvironmentDto): void => {
    setCurrent({ ...updated, originLabel: environmentOriginLabel(updated, _) });
  };

  if (current.kind === 'production') {
    return (
      <ProductionEnvironmentPolicy
        canManage={canManage}
        environment={current}
        environments={environments}
        onUpdated={onUpdated}
        workspaceId={workspaceId}
      />
    );
  }
  return (
    <EnvironmentPolicyShell environment={current}>
      <EnvironmentPolicyEditor
        canManage={canManage}
        environment={current}
        environments={environments}
        onUpdated={onUpdated}
        workspaceId={workspaceId}
      />
    </EnvironmentPolicyShell>
  );
}

function ProductionEnvironmentPolicy({
  canManage,
  environment,
  environments,
  onUpdated,
  workspaceId,
}: {
  canManage: boolean;
  environment: WorkspaceEnvironmentDto & { originLabel: string };
  environments: Array<WorkspaceEnvironmentDto & { originLabel: string }>;
  onUpdated: (environment: WorkspaceEnvironmentDto) => void;
  workspaceId: string;
}): React.ReactElement {
  const { _ } = useLingui();
  const [feedback, setFeedback] = React.useState<{
    kind: 'error' | 'notice';
    message: string;
  } | null>(null);
  const mutation = useEnvironmentApprovalMutation(workspaceId);
  const approvalRequired = environment.requiredApprovalCount === 1;

  const toggleApproval = (): void => {
    if (!canManage || mutation.isPending) return;
    setFeedback(null);
    mutation.mutate(
      {
        environmentId: environment.id,
        requiredApprovalCount: approvalRequired ? 0 : 1,
        expectedUpdatedAt: environment.updatedAt,
      },
      {
        onSuccess: (result) => {
          if (result.status === 'error') {
            setFeedback({ kind: 'error', message: result.error });
            return;
          }
          onUpdated(result.environment);
          setFeedback({ kind: 'notice', message: result.message });
        },
        onError: () => {
          setFeedback({ kind: 'error', message: _(COPY.unableToUpdateApproval) });
        },
      },
    );
  };

  return (
    <EnvironmentPolicyShell environment={environment}>
      <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-0.5">
          <p className="text-sm font-semibold">{_(COPY.promotionApproval)}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {_(
              approvalRequired ? COPY.approvalRequiredDescription : COPY.directPromotionDescription,
            )}
          </p>
        </div>
        <Button
          className="h-10 shrink-0"
          disabled={!canManage || mutation.isPending}
          onClick={toggleApproval}
          type="button"
          variant="outline"
        >
          {approvalPolicyActionLabel(mutation.isPending, approvalRequired, _)}
        </Button>
      </div>
      {feedback ? (
        <p
          className={
            feedback.kind === 'error'
              ? 'text-xs leading-5 text-destructive'
              : 'text-xs leading-5 text-muted-foreground'
          }
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      ) : null}
      <EnvironmentPolicyEditor
        canManage={canManage}
        environment={environment}
        environments={environments}
        onUpdated={onUpdated}
        workspaceId={workspaceId}
      />
    </EnvironmentPolicyShell>
  );
}

function EnvironmentPolicyShell({
  children,
  environment,
}: {
  children: React.ReactNode;
  environment: WorkspaceEnvironmentDto & { originLabel: string };
}): React.ReactElement {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-[var(--surface-subtle)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{environment.name}</p>
          <p className="truncate text-xs text-muted-foreground">{environment.originLabel}</p>
        </div>
        <Badge variant="outline">{environment.kind}</Badge>
      </div>
      {children}
    </div>
  );
}

function approvalPolicyActionLabel(
  pending: boolean,
  approvalRequired: boolean,
  translate: ReturnType<typeof useLingui>['_'],
): string {
  if (pending) return translate(COPY.updating);
  return translate(approvalRequired ? COPY.removeApproval : COPY.requireApproval);
}

function environmentOriginLabel(
  environment: WorkspaceEnvironmentDto,
  translate: ReturnType<typeof useLingui>['_'],
): string {
  return environment.originAllowlist.length
    ? environment.originAllowlist.join(', ')
    : translate(COPY.noTrustedOrigins);
}
