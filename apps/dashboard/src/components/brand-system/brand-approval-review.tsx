import { ArrowRight, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import type { BrandThemeDefinition } from '@lodariq/schema';
import type {
  WorkspaceThemeDetailDto,
  WorkspaceThemeDto,
  WorkspaceThemeImpactDto,
} from '../../lib/api';
import { BrandTourComparison } from '../brand-tour-comparison';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { formatThemeBinding, impactCountLabel } from './brand-system-view-helpers';

export function BrandApprovalReview({
  canApprove,
  detail,
  draft,
  pending,
  reviewComplete,
  reviewKey,
  theme,
  onApprove,
  onClose,
  onPreviewError,
  onPreviewReady,
}: {
  canApprove: boolean;
  detail: WorkspaceThemeDetailDto | null;
  draft: BrandThemeDefinition;
  pending: boolean;
  reviewComplete: boolean;
  reviewKey: string;
  theme: WorkspaceThemeDto;
  onApprove: () => void;
  onClose: () => void;
  onPreviewError: (reviewKey: string) => void;
  onPreviewReady: (reviewKey: string) => void;
}): React.ReactElement {
  return (
    <Card className="overflow-hidden border-primary/30 shadow-[0_18px_60px_rgba(20,45,38,.08)]">
      <CardHeader className="gap-4 border-b border-border bg-[linear-gradient(135deg,var(--surface-subtle),var(--card))] sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">Approval review</Badge>
            <span className="text-xs font-semibold text-muted-foreground">Saved draft</span>
          </div>
          <div>
            <CardTitle className="font-serif text-2xl font-medium tracking-[-0.02em]">
              See the change where customers will
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl leading-6">
              Compare the current approved look with this draft in Lodariq’s production Tour
              renderer, then check every linked experience before approval.
            </CardDescription>
          </div>
        </div>
        <Button
          aria-label="Close approval review"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </CardHeader>

      <CardContent className="grid gap-6 p-4 sm:p-5 lg:p-6">
        <div className="flex items-start gap-3 rounded-xl border border-[var(--info-border)] bg-[var(--info-bg)] px-4 py-3 text-sm text-[var(--info-fg)]">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p className="leading-6">
            Approval creates an immutable Brand version only. No document, compiled artifact, or
            environment is published from this review.
          </p>
        </div>

        {!detail ? (
          <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-border bg-[var(--surface-subtle)] p-6 text-center">
            <div>
              <p className="font-semibold">Preparing approval review…</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Loading linked experiences and the runtime comparison.
              </p>
            </div>
          </div>
        ) : (
          <>
            <section className="grid gap-3" aria-labelledby="brand-runtime-comparison-title">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Before and after
                  </p>
                  <h3 className="mt-1 font-semibold" id="brand-runtime-comparison-title">
                    Actual Tour renderer
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">Same content · theme change only</p>
              </div>
              <BrandTourComparison
                activeVersion={theme.activeVersion}
                draft={draft}
                key={reviewKey}
                name={theme.name}
                reviewKey={reviewKey}
                onError={onPreviewError}
                onReady={onPreviewReady}
              />
            </section>

            <AffectedExperienceReview impact={detail.impact} />

            <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm">
                {reviewComplete ? (
                  <>
                    <CheckCircle2 aria-hidden="true" className="size-4 text-[var(--success-fg)]" />
                    <span className="font-semibold text-[var(--success-fg)]">
                      Runtime comparison ready
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      aria-hidden="true"
                      className="size-2 animate-pulse rounded-full bg-muted-foreground"
                    />
                    <span className="text-muted-foreground">Complete the preview to approve</span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button disabled={pending} onClick={onClose} type="button" variant="ghost">
                  Not yet
                </Button>
                <Button
                  disabled={!canApprove || pending || !reviewComplete}
                  onClick={onApprove}
                  type="button"
                >
                  <CheckCircle2 aria-hidden="true" />
                  {pending ? 'Approving…' : 'Approve version'}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AffectedExperienceReview({
  impact,
}: {
  impact: WorkspaceThemeImpactDto[];
}): React.ReactElement {
  return (
    <section className="grid gap-3" aria-labelledby="brand-affected-experiences-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Scope
          </p>
          <h3 className="mt-1 font-semibold" id="brand-affected-experiences-title">
            Affected experiences
          </h3>
        </div>
        <Badge variant="outline">{impactCountLabel(impact.length)}</Badge>
      </div>
      {impact.length ? (
        <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {impact.map((item) => (
            <article
              className="flex flex-col gap-2 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              key={item.documentId}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.activeEnvironmentIds.length
                    ? `${item.activeEnvironmentIds.length} active environment${item.activeEnvironmentIds.length === 1 ? '' : 's'}`
                    : 'Not active in an environment'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">{formatThemeBinding(item.bindingPolicy)}</Badge>
                <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">
                  {item.bindingPolicy === 'workspace-current'
                    ? 'Review after approval'
                    : 'Unchanged'}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-[var(--surface-subtle)] p-5">
          <p className="font-semibold">No linked experiences</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            This first approval creates a reusable Brand version; publishing stays a separate step.
          </p>
        </div>
      )}
    </section>
  );
}
