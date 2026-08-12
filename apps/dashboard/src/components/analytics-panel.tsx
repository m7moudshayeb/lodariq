'use client';

import * as React from 'react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { DEFAULT_LOCALE, isSupportedLocale } from '@lodariq/i18n';
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

const CANONICAL_ANALYTICS_EVENT_LABELS = {
  sdk_error: msg({ id: 'dashboard.analytics.event.sdkError', message: 'SDK error' }),
  sdk_loaded: msg({ id: 'dashboard.analytics.event.sdkLoaded', message: 'SDK loaded' }),
  target_resolution: msg({
    id: 'dashboard.analytics.event.targetResolution',
    message: 'Target resolution',
  }),
  tour_completed: msg({ id: 'dashboard.analytics.event.tourCompleted', message: 'Tour completed' }),
  tour_dismissed: msg({ id: 'dashboard.analytics.event.tourDismissed', message: 'Tour dismissed' }),
  tour_skipped: msg({ id: 'dashboard.analytics.event.tourSkipped', message: 'Tour skipped' }),
  tour_started: msg({ id: 'dashboard.analytics.event.tourStarted', message: 'Tour started' }),
};

const COPY = {
  reporting: msg({ id: 'dashboard.analytics.reporting', message: 'Analytics reporting' }),
  noEnvironment: msg({
    id: 'dashboard.analytics.noEnvironment',
    message: 'No staging or production analytics environment is configured.',
  }),
  oneEnvironment: msg({
    id: 'dashboard.analytics.oneEnvironment',
    message: 'One environment at a time',
  }),
  isolationDescription: msg({
    id: 'dashboard.analytics.isolationDescription',
    message:
      'Production is the explicit default when configured. Staging and production facts are queried and rendered separately; Lodariq never combines them in this view.',
  }),
  refresh: msg({
    id: 'dashboard.analytics.refresh',
    message: 'Refresh selected environment',
  }),
  environment: msg({ id: 'dashboard.analytics.environment', message: 'Analytics environment' }),
  production: msg({ id: 'dashboard.analytics.production', message: 'Production' }),
  staging: msg({ id: 'dashboard.analytics.staging', message: 'Staging' }),
  default: msg({ id: 'dashboard.analytics.default', message: 'Default' }),
  historyOnly: msg({ id: 'dashboard.analytics.historyOnly', message: 'History only' }),
  namedResults: msg({
    id: 'dashboard.analytics.namedResults',
    message: '{environment} analytics results',
  }),
  results: msg({ id: 'dashboard.analytics.results', message: 'Analytics results' }),
  productionNotConfigured: msg({
    id: 'dashboard.analytics.productionNotConfigured',
    message:
      'Production analytics are not configured. Select staging explicitly to load its isolated facts.',
  }),
  selectedEnvironment: msg({
    id: 'dashboard.analytics.selectedEnvironment',
    message: 'selected environment',
  }),
  loading: msg({
    id: 'dashboard.analytics.loading',
    message: 'Loading {environment} analytics…',
  }),
  unavailable: msg({
    id: 'dashboard.analytics.unavailable',
    message: 'Analytics are temporarily unavailable for the selected environment.',
  }),
  retry: msg({ id: 'dashboard.analytics.retry', message: 'Retry selected environment' }),
  empty: msg({
    id: 'dashboard.analytics.empty',
    message:
      'No aggregate events are recorded for {environment}. No staging or production data was substituted.',
  }),
  loadedRows: msg({
    id: 'dashboard.analytics.loadedRows',
    message: 'Loaded {count} release-scoped aggregate rows for {environment} only.',
  }),
  aggregateFacts: msg({
    id: 'dashboard.analytics.aggregateFacts',
    message: '{environment} aggregate facts',
  }),
  environmentRows: msg({
    id: 'dashboard.analytics.environmentRows',
    message: '{environment} only · {count} release-scoped aggregate rows',
  }),
  environmentOnly: msg({
    id: 'dashboard.analytics.environmentOnly',
    message: '{environment} only',
  }),
  targetFailure: msg({ id: 'dashboard.analytics.targetFailure', message: 'Target failure' }),
  targetFailures: msg({ id: 'dashboard.analytics.targetFailures', message: 'Target failures' }),
  targetFailureBreakdown: msg({
    id: 'dashboard.analytics.targetFailureBreakdown',
    message: 'Ambiguous {ambiguous} · Missing {missing} · Needs review {needsReview}.',
  }),
  targetSuccessBreakdown: msg({
    id: 'dashboard.analytics.targetSuccessBreakdown',
    message:
      'Found {found} · Unknown {unknown}. Found and unknown outcomes are not counted as failures.',
  }),
  rowBound: msg({
    id: 'dashboard.analytics.rowBound',
    message:
      'The API returned the 1,000-row display bound. Additional release-scoped rows may exist; nothing beyond this bound is inferred.',
  }),
  releaseFacts: msg({ id: 'dashboard.analytics.releaseFacts', message: 'Release-scoped facts' }),
  releaseFactsDescription: msg({
    id: 'dashboard.analytics.releaseFactsDescription',
    message:
      'Publication, content hash, and pointer generation remain separate for every event row, including rollbacks that reuse content.',
  }),
  upTo: msg({ id: 'dashboard.analytics.upTo', message: 'Up to {count}' }),
  unknownEvent: msg({
    id: 'dashboard.analytics.unknownEvent',
    message: 'Unknown bounded event',
  }),
  document: msg({ id: 'dashboard.analytics.document', message: 'Document' }),
  publication: msg({ id: 'dashboard.analytics.publication', message: 'Publication' }),
  contentHash: msg({ id: 'dashboard.analytics.contentHash', message: 'Content hash' }),
  pointerGeneration: msg({
    id: 'dashboard.analytics.pointerGeneration',
    message: 'Pointer generation',
  }),
  targetResult: msg({ id: 'dashboard.analytics.targetResult', message: 'Target result' }),
  firstLast: msg({ id: 'dashboard.analytics.firstLast', message: 'First {first} · Last {last}' }),
} as const;

const ANALYTICS_FACT_DEFINITIONS = [
  {
    id: 'exposure',
    label: msg({ id: 'dashboard.analytics.fact.exposure', message: 'Exposure' }),
    eventName: 'tour_started',
    eventLabel: msg({ id: 'dashboard.analytics.fact.tourStarts', message: 'Tour starts' }),
    description: msg({
      id: 'dashboard.analytics.fact.tourStartsDescription',
      message: 'Exact tour_started events; no unique-user or conversion estimate.',
    }),
    icon: Eye,
  },
  {
    id: 'interaction',
    label: msg({ id: 'dashboard.analytics.fact.interaction', message: 'Interaction' }),
    eventName: 'tour_dismissed',
    eventLabel: msg({ id: 'dashboard.analytics.fact.tourDismissals', message: 'Tour dismissals' }),
    description: msg({
      id: 'dashboard.analytics.fact.tourDismissalsDescription',
      message: 'Exact tour_dismissed events emitted by the current runtime.',
    }),
    icon: MousePointerClick,
  },
  {
    id: 'skip',
    label: msg({ id: 'dashboard.analytics.fact.skipped', message: 'Skipped' }),
    eventName: 'tour_skipped',
    eventLabel: msg({ id: 'dashboard.analytics.fact.tourSkips', message: 'Tour skips' }),
    description: msg({
      id: 'dashboard.analytics.fact.tourSkipsDescription',
      message: 'Exact tour_skipped events emitted when visitors choose Skip tour.',
    }),
    icon: CircleX,
  },
  {
    id: 'completion',
    label: msg({ id: 'dashboard.analytics.fact.completion', message: 'Completion' }),
    eventName: 'tour_completed',
    eventLabel: msg({
      id: 'dashboard.analytics.fact.tourCompletions',
      message: 'Tour completions',
    }),
    description: msg({
      id: 'dashboard.analytics.fact.tourCompletionsDescription',
      message: 'Exact tour_completed events; no inferred completion rate.',
    }),
    icon: CircleCheck,
  },
  {
    id: 'release-health',
    label: msg({ id: 'dashboard.analytics.fact.releaseHealth', message: 'Release health' }),
    eventName: 'sdk_error',
    eventLabel: msg({ id: 'dashboard.analytics.fact.sdkErrors', message: 'SDK errors' }),
    description: msg({
      id: 'dashboard.analytics.fact.sdkErrorsDescription',
      message: 'Exact sdk_error events attributed to immutable release pointers.',
    }),
    icon: Activity,
  },
] as const;

const TARGET_RESOLUTION_STATUS_LABELS = {
  found: msg({ id: 'dashboard.analytics.target.found', message: 'Found' }),
  ambiguous: msg({ id: 'dashboard.analytics.target.ambiguous', message: 'Ambiguous' }),
  missing: msg({ id: 'dashboard.analytics.target.missing', message: 'Missing' }),
  needs_review: msg({ id: 'dashboard.analytics.target.needsReview', message: 'Needs review' }),
  unknown: msg({ id: 'dashboard.analytics.target.unknown', message: 'Unknown' }),
} as const;

export function AnalyticsPanel({
  environments,
  workspaceId,
}: AnalyticsPanelProps): React.ReactElement {
  const { _, i18n } = useLingui();
  const locale = isSupportedLocale(i18n.locale) ? i18n.locale : DEFAULT_LOCALE;
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
  const loadError = analyticsQuery.error ? _(COPY.unavailable) : '';

  if (!environments.length) {
    return (
      <section
        aria-label={_(COPY.reporting)}
        className="rounded-xl border border-dashed border-border bg-card p-6"
      >
        <p className="text-sm text-muted-foreground">{_(COPY.noEnvironment)}</p>
      </section>
    );
  }

  return (
    <section aria-label={_(COPY.reporting)} className="grid gap-5">
      <div className="rounded-xl border border-primary/25 bg-primary/[0.035] p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid gap-1">
            <p className="text-sm font-semibold">{_(COPY.oneEnvironment)}</p>
            <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
              {_(COPY.isolationDescription)}
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
              {_(COPY.refresh)}
            </Button>
          ) : null}
        </div>

        <div aria-label={_(COPY.environment)} className="mt-4 flex flex-wrap gap-2" role="group">
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
              <Badge variant="outline">{environmentKindLabel(environment.kind, _)}</Badge>
              {environment.kind === 'production' ? (
                <Badge variant="info">{_(COPY.default)}</Badge>
              ) : null}
              {!environment.enabled ? <Badge variant="outline">{_(COPY.historyOnly)}</Badge> : null}
            </Button>
          ))}
        </div>
      </div>

      <div
        aria-label={
          selectedEnvironment
            ? _({ ...COPY.namedResults, values: { environment: selectedEnvironment.name } })
            : _(COPY.results)
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
            {_(COPY.productionNotConfigured)}
          </p>
        ) : null}

        {analyticsQuery.isFetching ? (
          <p
            className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
            role="status"
          >
            {_({
              ...COPY.loading,
              values: { environment: selectedEnvironment?.name ?? _(COPY.selectedEnvironment) },
            })}
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
                {_(COPY.retry)}
              </Button>
            ) : null}
          </div>
        ) : null}

        {selectedAggregates && selectedEnvironment ? (
          selectedAggregates.length ? (
            <AnalyticsAggregateFacts
              aggregates={selectedAggregates}
              environment={selectedEnvironment}
              locale={locale}
            />
          ) : (
            <p
              className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground"
              role="status"
            >
              {_({ ...COPY.empty, values: { environment: selectedEnvironment.name } })}
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
  locale,
}: {
  aggregates: AnalyticsEventAggregate[];
  environment: AnalyticsEnvironmentOption;
  locale: string;
}): React.ReactElement {
  const { _ } = useLingui();
  const counts = aggregateEventCounts(aggregates);
  const targetCounts = aggregateTargetResolutionCounts(aggregates);
  const targetFailureCount =
    targetCounts.ambiguous + targetCounts.missing + targetCounts.needs_review;
  return (
    <>
      <p className="sr-only" role="status">
        {_({
          ...COPY.loadedRows,
          values: {
            count: aggregates.length.toLocaleString(locale),
            environment: environment.name,
          },
        })}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {_({ ...COPY.aggregateFacts, values: { environment: environment.name } })}
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            {_({
              ...COPY.environmentRows,
              values: {
                environment: environmentKindLabel(environment.kind, _),
                count: aggregates.length.toLocaleString(locale),
              },
            })}
          </p>
        </div>
        <Badge variant={environment.kind === 'production' ? 'success' : 'info'}>
          {_({
            ...COPY.environmentOnly,
            values: { environment: environmentKindLabel(environment.kind, _) },
          })}
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
                  {_(definition.label)}
                </h3>
              </div>
              <p className="mt-3 text-2xl font-semibold tabular-nums">
                {count.toLocaleString(locale)}
              </p>
              <p className="mt-1 text-xs font-semibold">{_(definition.eventLabel)}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {_(definition.description)}
              </p>
            </article>
          );
        })}
        <article className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Crosshair aria-hidden="true" className="size-4" />
            <h3 className="text-xs font-semibold uppercase tracking-wide">
              {_(COPY.targetFailure)}
            </h3>
          </div>
          <p className="mt-3 text-2xl font-semibold tabular-nums">
            {targetFailureCount.toLocaleString(locale)}
          </p>
          <p className="mt-1 text-xs font-semibold">{_(COPY.targetFailures)}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {_({
              ...COPY.targetFailureBreakdown,
              values: {
                ambiguous: targetCounts.ambiguous.toLocaleString(locale),
                missing: targetCounts.missing.toLocaleString(locale),
                needsReview: targetCounts.needs_review.toLocaleString(locale),
              },
            })}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {_({
              ...COPY.targetSuccessBreakdown,
              values: {
                found: targetCounts.found.toLocaleString(locale),
                unknown: targetCounts.unknown.toLocaleString(locale),
              },
            })}
          </p>
        </article>
      </div>

      {aggregates.length === DASHBOARD_ANALYTICS_AGGREGATE_LIMIT ? (
        <p
          className="rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-xs leading-5 text-amber-950"
          role="status"
        >
          {_(COPY.rowBound)}
        </p>
      ) : null}

      <section aria-labelledby="analytics-release-identity-heading" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold" id="analytics-release-identity-heading">
              {_(COPY.releaseFacts)}
            </h2>
            <p className="text-xs leading-5 text-muted-foreground">
              {_(COPY.releaseFactsDescription)}
            </p>
          </div>
          <Badge variant="outline">
            {_({
              ...COPY.upTo,
              values: { count: DASHBOARD_ANALYTICS_AGGREGATE_LIMIT.toLocaleString(locale) },
            })}
          </Badge>
        </div>
        <ol className="grid gap-3">
          {aggregates.map((aggregate) => (
            <AnalyticsAggregateRow
              aggregate={aggregate}
              key={analyticsAggregateKey(aggregate)}
              locale={locale}
            />
          ))}
        </ol>
      </section>
    </>
  );
}

function AnalyticsAggregateRow({
  aggregate,
  locale,
}: {
  aggregate: AnalyticsEventAggregate;
  locale: string;
}): React.ReactElement {
  const { _ } = useLingui();
  const knownLabel =
    CANONICAL_ANALYTICS_EVENT_LABELS[
      aggregate.name as keyof typeof CANONICAL_ANALYTICS_EVENT_LABELS
    ];
  return (
    <li className="grid gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{knownLabel ? _(knownLabel) : aggregate.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{aggregate.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {!knownLabel ? <Badge variant="outline">{_(COPY.unknownEvent)}</Badge> : null}
          <Badge>{aggregate.count.toLocaleString(locale)}</Badge>
        </div>
      </div>
      <dl className="grid gap-2 rounded-lg bg-[var(--surface-subtle)] p-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsIdentityFact label={_(COPY.document)} value={aggregate.documentId} />
        <AnalyticsIdentityFact label={_(COPY.publication)} value={aggregate.publicationId} />
        <AnalyticsIdentityFact label={_(COPY.contentHash)} value={aggregate.contentHash} />
        <AnalyticsIdentityFact
          label={_(COPY.pointerGeneration)}
          value={String(aggregate.pointerGeneration)}
        />
        {isTargetResolutionAggregate(aggregate) ? (
          <AnalyticsIdentityFact
            label={_(COPY.targetResult)}
            value={_(TARGET_RESOLUTION_STATUS_LABELS[aggregate.targetResolutionStatus])}
          />
        ) : null}
      </dl>
      <p className="text-xs text-muted-foreground">
        {_({
          ...COPY.firstLast,
          values: {
            first: formatTimestamp(aggregate.firstTimestamp, locale),
            last: formatTimestamp(aggregate.lastTimestamp, locale),
          },
        })}
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

function environmentKindLabel(
  kind: AnalyticsEnvironmentOption['kind'],
  translate: ReturnType<typeof useLingui>['_'],
): string {
  return translate(kind === 'production' ? COPY.production : COPY.staging);
}

function formatTimestamp(value: string, locale: string): string {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString(locale) : value;
}
