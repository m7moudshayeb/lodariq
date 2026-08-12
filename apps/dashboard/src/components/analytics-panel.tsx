'use client';

import * as React from 'react';
import {
  Activity,
  CircleCheck,
  CircleX,
  Crosshair,
  Eye,
  MousePointerClick,
  RefreshCw,
} from 'lucide-react';
import type { AnalyticsEventAggregate, AnalyticsTargetResolutionStatus } from '@lodariq/schema';
import { useDashboardAnalytics } from '../hooks/use-dashboard-analytics';
import { DASHBOARD_ANALYTICS_AGGREGATE_LIMIT } from '../lib/dashboard-constants';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export interface AnalyticsEnvironmentOption {
  id: string;
  kind: 'staging' | 'production';
  name: string;
  enabled: boolean;
}

interface AnalyticsPanelProps {
  environments: AnalyticsEnvironmentOption[];
  workspaceId: string;
}

const CANONICAL_ANALYTICS_EVENT_LABELS: Readonly<Record<string, string>> = {
  sdk_error: 'SDK error',
  sdk_loaded: 'SDK loaded',
  target_resolution: 'Target resolution',
  tour_completed: 'Tour completed',
  tour_dismissed: 'Tour dismissed',
  tour_skipped: 'Tour skipped',
  tour_started: 'Tour started',
};

const ANALYTICS_FACT_DEFINITIONS = [
  {
    id: 'exposure',
    label: 'Exposure',
    eventName: 'tour_started',
    eventLabel: 'Tour starts',
    description: 'Exact tour_started events; no unique-user or conversion estimate.',
    icon: Eye,
  },
  {
    id: 'interaction',
    label: 'Interaction',
    eventName: 'tour_dismissed',
    eventLabel: 'Tour dismissals',
    description: 'Exact tour_dismissed events emitted by the current runtime.',
    icon: MousePointerClick,
  },
  {
    id: 'skip',
    label: 'Skipped',
    eventName: 'tour_skipped',
    eventLabel: 'Tour skips',
    description: 'Exact tour_skipped events emitted when visitors choose Skip tour.',
    icon: CircleX,
  },
  {
    id: 'completion',
    label: 'Completion',
    eventName: 'tour_completed',
    eventLabel: 'Tour completions',
    description: 'Exact tour_completed events; no inferred completion rate.',
    icon: CircleCheck,
  },
  {
    id: 'release-health',
    label: 'Release health',
    eventName: 'sdk_error',
    eventLabel: 'SDK errors',
    description: 'Exact sdk_error events attributed to immutable release pointers.',
    icon: Activity,
  },
] as const;

const TARGET_RESOLUTION_STATUS_LABELS = {
  found: 'Found',
  ambiguous: 'Ambiguous',
  missing: 'Missing',
  needs_review: 'Needs review',
  unknown: 'Unknown',
} as const satisfies Record<AnalyticsTargetResolutionStatus, string>;

export function AnalyticsPanel({
  environments,
  workspaceId,
}: AnalyticsPanelProps): React.ReactElement {
  const productionEnvironmentId =
    environments.find((environment) => environment.kind === 'production')?.id ?? '';
  const [selectedEnvironmentId, setSelectedEnvironmentId] = React.useState(
    () => productionEnvironmentId,
  );
  const selectedEnvironment = environments.find(
    (environment) => environment.id === selectedEnvironmentId,
  );
  const analyticsQuery = useDashboardAnalytics(
    workspaceId,
    selectedEnvironmentId,
    Boolean(selectedEnvironment),
  );

  React.useEffect(() => {
    if (environments.some((environment) => environment.id === selectedEnvironmentId)) return;
    setSelectedEnvironmentId(productionEnvironmentId);
  }, [environments, productionEnvironmentId, selectedEnvironmentId]);

  const selectedAggregates = analyticsQuery.data?.aggregates ?? null;
  const loadError = analyticsQuery.error
    ? 'Analytics are temporarily unavailable for the selected environment.'
    : '';

  if (!environments.length) {
    return (
      <section
        aria-label="Analytics reporting"
        className="rounded-xl border border-dashed border-border bg-card p-6"
      >
        <p className="text-sm text-muted-foreground">
          No staging or production analytics environment is configured.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Analytics reporting" className="grid gap-5">
      <div className="rounded-xl border border-primary/25 bg-primary/[0.035] p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid gap-1">
            <p className="text-sm font-semibold">One environment at a time</p>
            <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
              Production is the explicit default when configured. Staging and production facts are
              queried and rendered separately; Lodariq never combines them in this view.
            </p>
          </div>
          {selectedEnvironmentId ? (
            <Button
              className="h-9 shrink-0"
              disabled={analyticsQuery.isFetching}
              onClick={() => void analyticsQuery.refetch()}
              type="button"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
              Refresh selected environment
            </Button>
          ) : null}
        </div>

        <div aria-label="Analytics environment" className="mt-4 flex flex-wrap gap-2" role="group">
          {environments.map((environment) => (
            <Button
              aria-controls="analytics-environment-results"
              aria-pressed={environment.id === selectedEnvironmentId}
              className="h-auto min-h-11 flex-wrap"
              key={environment.id}
              onClick={() => setSelectedEnvironmentId(environment.id)}
              type="button"
              variant={environment.id === selectedEnvironmentId ? 'default' : 'outline'}
            >
              <span>{environment.name}</span>
              <Badge variant="outline">{environmentKindLabel(environment.kind)}</Badge>
              {environment.kind === 'production' ? <Badge variant="info">Default</Badge> : null}
              {!environment.enabled ? <Badge variant="outline">History only</Badge> : null}
            </Button>
          ))}
        </div>
      </div>

      <div
        aria-label={
          selectedEnvironment
            ? `${selectedEnvironment.name} analytics results`
            : 'Analytics results'
        }
        className="grid gap-5"
        id="analytics-environment-results"
        role="region"
      >
        {!selectedEnvironment ? (
          <p
            className="rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-950"
            role="status"
          >
            Production analytics are not configured. Select staging explicitly to load its isolated
            facts.
          </p>
        ) : null}

        {analyticsQuery.isFetching ? (
          <p
            className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
            role="status"
          >
            Loading {selectedEnvironment?.name ?? 'selected environment'} analytics…
          </p>
        ) : null}

        {loadError ? (
          <div
            className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <p className="text-sm text-destructive">{loadError}</p>
            {selectedEnvironmentId ? (
              <Button
                className="h-9 shrink-0"
                onClick={() => void analyticsQuery.refetch()}
                type="button"
                variant="outline"
              >
                Retry selected environment
              </Button>
            ) : null}
          </div>
        ) : null}

        {selectedAggregates && selectedEnvironment ? (
          selectedAggregates.length ? (
            <AnalyticsAggregateFacts
              aggregates={selectedAggregates}
              environment={selectedEnvironment}
            />
          ) : (
            <p
              className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground"
              role="status"
            >
              No aggregate events are recorded for {selectedEnvironment?.name}. No staging or
              production data was substituted.
            </p>
          )
        ) : null}
      </div>
    </section>
  );
}

function AnalyticsAggregateFacts({
  aggregates,
  environment,
}: {
  aggregates: AnalyticsEventAggregate[];
  environment: AnalyticsEnvironmentOption;
}): React.ReactElement {
  const counts = aggregateEventCounts(aggregates);
  const targetCounts = aggregateTargetResolutionCounts(aggregates);
  const targetFailureCount =
    targetCounts.ambiguous + targetCounts.missing + targetCounts.needs_review;
  return (
    <>
      <p className="sr-only" role="status">
        Loaded {aggregates.length.toLocaleString()} release-scoped aggregate rows for{' '}
        {environment.name} only.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{environment.name} aggregate facts</h2>
          <p className="text-xs leading-5 text-muted-foreground">
            {environmentKindLabel(environment.kind)} only · {aggregates.length.toLocaleString()}{' '}
            release-scoped aggregate rows
          </p>
        </div>
        <Badge variant={environment.kind === 'production' ? 'success' : 'info'}>
          {environmentKindLabel(environment.kind)} only
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {ANALYTICS_FACT_DEFINITIONS.map((definition) => {
          const Icon = definition.icon;
          const count = counts.get(definition.eventName) ?? 0n;
          return (
            <article className="rounded-xl border border-border bg-card p-4" key={definition.id}>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon aria-hidden="true" className="size-4" />
                <h3 className="text-xs font-semibold uppercase tracking-wide">
                  {definition.label}
                </h3>
              </div>
              <p className="mt-3 text-2xl font-semibold tabular-nums">{count.toLocaleString()}</p>
              <p className="mt-1 text-xs font-semibold">{definition.eventLabel}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {definition.description}
              </p>
            </article>
          );
        })}
        <article className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Crosshair aria-hidden="true" className="size-4" />
            <h3 className="text-xs font-semibold uppercase tracking-wide">Target failure</h3>
          </div>
          <p className="mt-3 text-2xl font-semibold tabular-nums">
            {targetFailureCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs font-semibold">Target failures</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Ambiguous {targetCounts.ambiguous.toLocaleString()} · Missing{' '}
            {targetCounts.missing.toLocaleString()} · Needs review{' '}
            {targetCounts.needs_review.toLocaleString()}.
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Found {targetCounts.found.toLocaleString()} · Unknown{' '}
            {targetCounts.unknown.toLocaleString()}. Found and unknown outcomes are not counted as
            failures.
          </p>
        </article>
      </div>

      {aggregates.length === DASHBOARD_ANALYTICS_AGGREGATE_LIMIT ? (
        <p
          className="rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-xs leading-5 text-amber-950"
          role="status"
        >
          The API returned the 1,000-row display bound. Additional release-scoped rows may exist;
          nothing beyond this bound is inferred.
        </p>
      ) : null}

      <section aria-labelledby="analytics-release-identity-heading" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold" id="analytics-release-identity-heading">
              Release-scoped facts
            </h2>
            <p className="text-xs leading-5 text-muted-foreground">
              Publication, content hash, and pointer generation remain separate for every event row,
              including rollbacks that reuse content.
            </p>
          </div>
          <Badge variant="outline">
            Up to {DASHBOARD_ANALYTICS_AGGREGATE_LIMIT.toLocaleString()}
          </Badge>
        </div>
        <ol className="grid gap-3">
          {aggregates.map((aggregate) => (
            <AnalyticsAggregateRow aggregate={aggregate} key={analyticsAggregateKey(aggregate)} />
          ))}
        </ol>
      </section>
    </>
  );
}

function AnalyticsAggregateRow({
  aggregate,
}: {
  aggregate: AnalyticsEventAggregate;
}): React.ReactElement {
  const knownLabel = CANONICAL_ANALYTICS_EVENT_LABELS[aggregate.name];
  return (
    <li className="grid gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{knownLabel ?? aggregate.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{aggregate.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {!knownLabel ? <Badge variant="outline">Unknown bounded event</Badge> : null}
          <Badge>{aggregate.count.toLocaleString()}</Badge>
        </div>
      </div>
      <dl className="grid gap-2 rounded-lg bg-[var(--surface-subtle)] p-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsIdentityFact label="Document" value={aggregate.documentId} />
        <AnalyticsIdentityFact label="Publication" value={aggregate.publicationId} />
        <AnalyticsIdentityFact label="Content hash" value={aggregate.contentHash} />
        <AnalyticsIdentityFact
          label="Pointer generation"
          value={String(aggregate.pointerGeneration)}
        />
        {isTargetResolutionAggregate(aggregate) ? (
          <AnalyticsIdentityFact
            label="Target result"
            value={TARGET_RESOLUTION_STATUS_LABELS[aggregate.targetResolutionStatus]}
          />
        ) : null}
      </dl>
      <p className="text-xs text-muted-foreground">
        First {formatTimestamp(aggregate.firstTimestamp)} · Last{' '}
        {formatTimestamp(aggregate.lastTimestamp)}
      </p>
    </li>
  );
}

function AnalyticsIdentityFact({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="min-w-0">
      <dt className="font-semibold text-foreground">{label}</dt>
      <dd className="break-all text-muted-foreground">{value}</dd>
    </div>
  );
}

function aggregateEventCounts(aggregates: readonly AnalyticsEventAggregate[]): Map<string, bigint> {
  const counts = new Map<string, bigint>();
  for (const aggregate of aggregates) {
    counts.set(aggregate.name, (counts.get(aggregate.name) ?? 0n) + BigInt(aggregate.count));
  }
  return counts;
}

function aggregateTargetResolutionCounts(
  aggregates: readonly AnalyticsEventAggregate[],
): Record<AnalyticsTargetResolutionStatus, bigint> {
  const counts: Record<AnalyticsTargetResolutionStatus, bigint> = {
    found: 0n,
    ambiguous: 0n,
    missing: 0n,
    needs_review: 0n,
    unknown: 0n,
  };
  for (const aggregate of aggregates) {
    if (!isTargetResolutionAggregate(aggregate)) continue;
    counts[aggregate.targetResolutionStatus] += BigInt(aggregate.count);
  }
  return counts;
}

function analyticsAggregateKey(aggregate: AnalyticsEventAggregate): string {
  return [
    aggregate.environmentId,
    aggregate.documentId,
    aggregate.publicationId,
    aggregate.contentHash,
    aggregate.pointerGeneration,
    aggregate.name,
    isTargetResolutionAggregate(aggregate) ? aggregate.targetResolutionStatus : '',
  ].join(':');
}

function isTargetResolutionAggregate(
  aggregate: AnalyticsEventAggregate,
): aggregate is AnalyticsEventAggregate & {
  name: 'target_resolution';
  targetResolutionStatus: AnalyticsTargetResolutionStatus;
} {
  return aggregate.name === 'target_resolution' && 'targetResolutionStatus' in aggregate;
}

function environmentKindLabel(kind: AnalyticsEnvironmentOption['kind']): string {
  return kind === 'production' ? 'Production' : 'Staging';
}

function formatTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString() : value;
}
