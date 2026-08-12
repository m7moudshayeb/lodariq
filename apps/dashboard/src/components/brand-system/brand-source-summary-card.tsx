import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { ExternalLink, ScanSearch } from 'lucide-react';
import type { DashboardBrandSourceSummary } from '../../lib/view-model';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

const COPY = {
  source: msg({ id: 'dashboard.brand.source.title', message: 'Product match source' }),
  roles: msg({ id: 'dashboard.brand.source.roles', message: 'Semantic Brand roles' }),
  rematch: msg({
    id: 'dashboard.brand.source.rematch',
    message: 'Open product to rematch',
  }),
} as const;

export function BrandSourceSummaryCard({
  authoringUrl,
  summary,
}: {
  authoringUrl: string;
  summary: DashboardBrandSourceSummary;
}): React.ReactElement {
  const { _ } = useLingui();
  return (
    <Card className="overflow-hidden border-primary/15 shadow-none">
      <CardContent className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:p-6">
        <div className="grid min-w-0 gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
              <ScanSearch aria-hidden="true" className="size-4" />
            </span>
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-foreground">{_(COPY.source)}</p>
                <Badge variant={summary.statusVariant}>{summary.statusLabel}</Badge>
              </div>
              <p className="text-sm font-semibold text-foreground">{summary.sourceLabel}</p>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {summary.sourceDetail}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 ps-0 sm:ps-[52px]">
            <Badge variant="outline">{summary.revisionLabel}</Badge>
            {summary.confidenceLabel ? (
              <Badge variant="outline">{summary.confidenceLabel}</Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">{summary.checkedAtLabel}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 ps-0 sm:ps-[52px]" aria-label={_(COPY.roles)}>
            {summary.semanticRoles.map((role) => (
              <span
                className="rounded-md border border-border bg-[var(--surface-subtle)] px-2 py-1 text-[11px] font-semibold text-muted-foreground"
                key={role}
              >
                {role}
              </span>
            ))}
          </div>
        </div>
        {authoringUrl ? (
          <Button asChild className="h-11" variant="outline">
            <a href={authoringUrl} rel="noreferrer" target="_blank">
              {_(COPY.rematch)}
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
        ) : (
          <Button className="h-11" disabled type="button" variant="outline">
            {_(COPY.rematch)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
