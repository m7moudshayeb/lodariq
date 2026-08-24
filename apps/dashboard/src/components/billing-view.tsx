'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLingui } from '@lingui/react';
import {
  COMMERCIAL_PLAN_IDS,
  COMMERCIAL_PLAN_LABELS,
  type CommercialPlanId,
  type CommercialUsageValue,
  type ControlPlaneRole,
} from '@lodariq/schema';
import type {
  BillingMeterBatch,
  BillingOverview,
  BillingSubscriptionStatus,
} from '@lodariq/schema/commercial-billing';
import {
  createBillingCheckoutSession,
  createBillingPortalSession,
  loadWorkspaceBilling,
} from '../lib/client-dashboard-api';
import { dashboardQueryKeys } from '../lib/dashboard-query-keys';
import { DashboardPageHeader } from './dashboard-view-components';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { StatusBanner } from './ui/status-banner';

const USAGE_ROWS = [
  ['engagedUsers', 'Engaged users'],
  ['liveExperiences', 'Live experiences'],
  ['creatorSeats', 'Creator seats'],
  ['applications', 'Applications'],
  ['locales', 'Locales'],
  ['environments', 'Environments'],
  ['aiCredits', 'AI credits'],
  ['themeGenerationRuns', 'Theme generation runs'],
  ['analyticsExports', 'Analytics exports'],
] as const satisfies ReadonlyArray<readonly [UsageMetricKey, string]>;

type UsageMetricKey =
  | 'engagedUsers'
  | 'liveExperiences'
  | 'creatorSeats'
  | 'applications'
  | 'locales'
  | 'environments'
  | 'aiCredits'
  | 'themeGenerationRuns'
  | 'analyticsExports';

const SELECTABLE_PLAN_IDS = COMMERCIAL_PLAN_IDS.filter((planId) => planId !== 'free');

export default function BillingView({
  currentRole,
  workspaceId,
}: {
  currentRole: ControlPlaneRole;
  workspaceId: string;
}): React.ReactElement {
  const { i18n } = useLingui();
  const canManageBilling = currentRole === 'admin' || currentRole === 'owner';
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: dashboardQueryKeys.billing(workspaceId),
    queryFn: ({ signal }) => loadWorkspaceBilling(workspaceId, signal),
    enabled: canManageBilling,
    staleTime: 30_000,
  });
  const [selectedPlan, setSelectedPlan] = React.useState<CommercialPlanId>('starter');
  const [actionError, setActionError] = React.useState('');
  const checkout = useMutation({
    mutationFn: (overview: BillingOverview) =>
      createBillingCheckoutSession({
        planId: selectedPlan,
        expectedSubscriptionRevision: overview.subscription.revision,
        returnUrl: billingReturnUrl(),
      }),
    onSuccess: (session) => window.location.assign(session.url),
    onError: () => setActionError('The billing checkout could not be opened.'),
  });
  const portal = useMutation({
    mutationFn: () => createBillingPortalSession({ returnUrl: billingReturnUrl() }),
    onSuccess: (session) => window.location.assign(session.url),
    onError: () => setActionError('The billing portal could not be opened.'),
  });

  React.useEffect(() => {
    if (!query.data) return;
    const fallback =
      query.data.subscription.planId === 'free' ? 'starter' : query.data.subscription.planId;
    setSelectedPlan(fallback);
  }, [query.data]);

  if (!canManageBilling) {
    return (
      <>
        <DashboardPageHeader view="billing" />
        <StatusBanner
          kind="warning"
          title="Workspace billing is available to administrators and owners."
        />
      </>
    );
  }

  return (
    <>
      <DashboardPageHeader view="billing" />
      {query.isPending ? <BillingLoading /> : null}
      {query.isError ? (
        <StatusBanner kind="error" title="Workspace billing could not be loaded.">
          <div className="mt-2">
            <Button
              onClick={() =>
                void queryClient.invalidateQueries({
                  queryKey: dashboardQueryKeys.billing(workspaceId),
                })
              }
            >
              Try again
            </Button>
          </div>
        </StatusBanner>
      ) : null}
      {query.data ? (
        <div className="grid gap-5">
          {actionError ? <StatusBanner kind="error" title={actionError} /> : null}
          <BillingSummary
            checkoutPending={checkout.isPending}
            locale={i18n.locale}
            onCheckout={() => {
              setActionError('');
              checkout.mutate(query.data);
            }}
            onOpenPortal={() => {
              setActionError('');
              portal.mutate();
            }}
            onPlanChange={setSelectedPlan}
            overview={query.data}
            portalPending={portal.isPending}
            selectedPlan={selectedPlan}
          />
          <UsageGrid overview={query.data} />
          <div className="grid items-start gap-5 xl:grid-cols-2">
            <InvoiceHistory locale={i18n.locale} overview={query.data} />
            <MeteringHistory locale={i18n.locale} metering={query.data.metering} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function BillingSummary({
  checkoutPending,
  locale,
  onCheckout,
  onOpenPortal,
  onPlanChange,
  overview,
  portalPending,
  selectedPlan,
}: {
  checkoutPending: boolean;
  locale: string;
  onCheckout: () => void;
  onOpenPortal: () => void;
  onPlanChange: (plan: CommercialPlanId) => void;
  overview: BillingOverview;
  portalPending: boolean;
  selectedPlan: CommercialPlanId;
}): React.ReactElement {
  const subscription = overview.subscription;
  return (
    <Card className="shadow-none">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Current plan
          </p>
          <CardTitle className="text-2xl">{subscription.planLabel}</CardTitle>
          <CardDescription>
            {formatDate(subscription.currentPeriodStart, locale)} –{' '}
            {formatDate(subscription.currentPeriodEnd, locale)}
          </CardDescription>
        </div>
        <BillingStatus status={subscription.status} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-end sm:justify-between">
        <label className="grid min-w-56 gap-1.5 text-sm font-semibold">
          Change plan
          <select
            className="h-10 rounded-md border border-input bg-card px-3 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35"
            onChange={(event) => onPlanChange(event.target.value as CommercialPlanId)}
            value={selectedPlan}
          >
            {SELECTABLE_PLAN_IDS.map((planId) => (
              <option key={planId} value={planId}>
                {COMMERCIAL_PLAN_LABELS[planId]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {subscription.managedByProvider ? (
            <Button disabled={portalPending} onClick={onOpenPortal} variant="outline">
              {portalPending ? 'Opening…' : 'Manage billing'}
            </Button>
          ) : null}
          <Button
            disabled={checkoutPending || selectedPlan === subscription.planId}
            onClick={onCheckout}
          >
            {checkoutPending ? 'Opening…' : 'Continue to checkout'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UsageGrid({ overview }: { overview: BillingOverview }): React.ReactElement {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Current-period usage</CardTitle>
        <CardDescription>
          Limits come from plan version {overview.usage.planVersion}. Ledger totals remain scoped to
          this workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {USAGE_ROWS.map(([key, label]) => {
          const value = overview.usage[key] as CommercialUsageValue;
          return <UsageCard key={key} label={label} value={value} />;
        })}
      </CardContent>
    </Card>
  );
}

function UsageCard({
  label,
  value,
}: {
  label: string;
  value: CommercialUsageValue;
}): React.ReactElement {
  const percentage =
    value.limit === null || value.limit === 0 ? 0 : Math.min(value.used / value.limit, 1);
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-[var(--surface-subtle)] p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <Badge variant={value.status === 'exceeded' ? 'destructive' : 'outline'}>
          {value.status}
        </Badge>
      </div>
      <p className="text-xl font-semibold tabular-nums">
        {formatCount(value.used)}
        <span className="text-sm font-medium text-muted-foreground">
          {' '}
          / {value.limit === null ? 'Unlimited' : formatCount(value.limit)}
        </span>
      </p>
      {value.limit !== null ? (
        <div
          aria-label={`${label}: ${Math.round(percentage * 100)}% used`}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(percentage * 100)}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.round(percentage * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function InvoiceHistory({
  locale,
  overview,
}: {
  locale: string;
  overview: BillingOverview;
}): React.ReactElement {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Invoices</CardTitle>
        <CardDescription>
          Provider updates are idempotent and ordered before display.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {overview.invoices.length ? (
          overview.invoices.map((invoice) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              key={invoice.id}
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  {formatCurrency(invoice.amountDueMinor, invoice.currency, locale)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Issued {formatDate(invoice.issuedAt, locale)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{invoice.status}</Badge>
                {invoice.hostedInvoiceUrl ? (
                  <Button asChild size="sm" variant="ghost">
                    <a href={invoice.hostedInvoiceUrl} rel="noreferrer" target="_blank">
                      View
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <EmptyState>No provider invoices have been received.</EmptyState>
        )}
      </CardContent>
    </Card>
  );
}

function MeteringHistory({
  locale,
  metering,
}: {
  locale: string;
  metering: BillingOverview['metering'];
}): React.ReactElement {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Meter reconciliation</CardTitle>
        <CardDescription>
          Closed periods are submitted once and checked against provider readback.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {metering.length ? (
          metering.map((batch) => <MeteringRow batch={batch} key={batch.id} locale={locale} />)
        ) : (
          <EmptyState>No billing period has closed yet.</EmptyState>
        )}
      </CardContent>
    </Card>
  );
}

function MeteringRow({ batch, locale }: { batch: BillingMeterBatch; locale: string }) {
  return (
    <div className="grid gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">
          {formatDate(batch.periodStart, locale)} – {formatDate(batch.periodEnd, locale)}
        </p>
        <Badge variant={batch.status === 'failed' ? 'destructive' : 'outline'}>
          {batch.status}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {batch.items.map((item) => `${item.metric}: ${formatCount(item.quantity)}`).join(' · ')}
      </p>
    </div>
  );
}

function BillingStatus({ status }: { status: BillingSubscriptionStatus }): React.ReactElement {
  return (
    <Badge variant={status === 'past_due' ? 'destructive' : 'outline'}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

function BillingLoading(): React.ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
      Loading plan, usage, and invoices…
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function billingReturnUrl(): string {
  return `${window.location.origin}${window.location.pathname}#billing`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

function formatCurrency(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountMinor / 100);
}
