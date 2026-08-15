'use client';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Rocket, ShieldCheck, Workflow } from 'lucide-react';
import type { DashboardViewModel } from '../lib/view-model';
import { ReleaseProgress } from './release-progress';
import {
  ReleaseRecoveryPanel,
  type ReleaseRecoveryEnvironmentOption,
} from './release-recovery-panel';
import {
  DashboardEmptyView,
  DashboardPageHeader,
  OpenInProductAction,
} from './dashboard-view-components';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

const COPY = {
  exactArtifactPromotion: msg({
    id: 'dashboard.releases.exactArtifactPromotion',
    message: 'Exact-artifact promotion',
  }),
  exactArtifactDescription: msg({
    id: 'dashboard.releases.exactArtifactDescription',
    message:
      'Production promotion must reuse the verified staging artifact with no rebuild, automatic theme mutation, or environment copy.',
  }),
  emptyTitle: msg({ id: 'dashboard.releases.emptyTitle', message: 'No releases to review' }),
  emptyDescription: msg({
    id: 'dashboard.releases.emptyDescription',
    message:
      'Saved experiences will appear here with the publication records the current API can prove.',
  }),
  openFlowMap: msg({ id: 'dashboard.releases.openFlowMap', message: 'Open Flow Map' }),
} as const;

export function ReleasesView({
  viewModel,
  selectedDocumentId,
  workspaceId,
}: {
  viewModel: DashboardViewModel;
  selectedDocumentId: string;
  workspaceId: string;
}): React.ReactElement {
  const { _ } = useLingui();
  const orderedRows = orderSelectedRelease(viewModel.documentRows, selectedDocumentId);
  const recoveryEnvironments = releaseRecoveryEnvironmentOptions(viewModel.environmentOptions);
  return (
    <>
      <DashboardPageHeader
        view="releases"
        action={<OpenInProductAction url={viewModel.openInProductUrl} />}
      />
      <div className="grid gap-4">
        {orderedRows.length ? (
          orderedRows.map((row) => (
            <article
              className={
                row.id === selectedDocumentId
                  ? 'rounded-xl border border-primary/30 bg-card p-5 shadow-[0_0_0_3px_rgba(11,102,85,.06)]'
                  : 'rounded-xl border border-border bg-card p-5'
              }
              key={row.id}
            >
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{row.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {row.releaseSummary}
                  </p>
                </div>
                <Badge className="w-fit shrink-0" variant={row.queueStatusVariant}>
                  {row.queueStatusLabel}
                </Badge>
              </div>
              <ReleaseProgress compact stages={row.releaseStages} />
              <dl className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-2 xl:grid-cols-5">
                {row.releaseEvidence.map((evidence) => (
                  <div
                    className="grid content-start gap-1 rounded-lg border border-border bg-[var(--surface-subtle)] p-3"
                    key={evidence.id}
                  >
                    <dt className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                      {evidence.label}
                      <Badge variant={evidence.tone}>{evidence.value}</Badge>
                    </dt>
                    <dd className="text-xs leading-5 text-muted-foreground">{evidence.detail}</dd>
                    {evidence.id === 'flow' && row.flowMapUrl ? (
                      <Button asChild className="mt-1 w-fit" size="sm" variant="outline">
                        <a href={row.flowMapUrl} rel="noreferrer" target="_blank">
                          <Workflow aria-hidden="true" />
                          {_(COPY.openFlowMap)}
                        </a>
                      </Button>
                    ) : null}
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="grid gap-0.5">
                  <p className="text-sm font-semibold text-foreground">
                    {_(COPY.exactArtifactPromotion)}
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {_(COPY.exactArtifactDescription)}
                  </p>
                </div>
              </div>
              <ReleaseRecoveryPanel
                documentId={row.id}
                documentTitle={row.title}
                environments={recoveryEnvironments}
                workspaceId={workspaceId}
              />
            </article>
          ))
        ) : (
          <DashboardEmptyView
            icon={<Rocket aria-hidden="true" />}
            title={_(COPY.emptyTitle)}
            description={_(COPY.emptyDescription)}
          />
        )}
      </div>
    </>
  );
}

function releaseRecoveryEnvironmentOptions(
  environments: DashboardViewModel['environmentOptions'],
): ReleaseRecoveryEnvironmentOption[] {
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

function orderSelectedRelease(
  rows: DashboardViewModel['documentRows'],
  selectedDocumentId: string,
): DashboardViewModel['documentRows'] {
  if (!selectedDocumentId) return rows;
  const selected = rows.find((row) => row.id === selectedDocumentId);
  if (!selected) return rows;
  return [selected, ...rows.filter((row) => row.id !== selectedDocumentId)];
}
