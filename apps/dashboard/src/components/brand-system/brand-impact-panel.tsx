import { CheckCircle2, FileCheck2 } from 'lucide-react';
import type { WorkspaceThemeDetailDto, WorkspaceThemeImpactDto } from '../../lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { formatThemeBinding, impactCountLabel } from './brand-system-view-helpers';

export function BrandImpactPanel({
  activeVersionId,
  canEdit,
  detail,
  pending,
  onAcknowledge,
}: {
  activeVersionId: string | null;
  canEdit: boolean;
  detail: WorkspaceThemeDetailDto | null;
  pending: boolean;
  onAcknowledge: (impact: WorkspaceThemeImpactDto) => void;
}): React.ReactElement {
  return (
    <Card className="shadow-none">
      <CardHeader className="border-b border-border sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Experience impact</CardTitle>
          <CardDescription className="mt-1 leading-6">
            Preview who is linked to this theme. Each experience adopts a new approved version
            explicitly; publication remains a separate action.
          </CardDescription>
        </div>
        {detail ? <Badge variant="outline">{impactCountLabel(detail.impact.length)}</Badge> : null}
      </CardHeader>
      <CardContent className="grid gap-2 p-4 sm:p-5">
        {!detail ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading impact…</p>
        ) : detail.impact.length ? (
          detail.impact.map((impact) => {
            const needsAcknowledgement =
              Boolean(activeVersionId) &&
              impact.bindingPolicy === 'workspace-current' &&
              impact.acknowledgedThemeVersionId !== activeVersionId;
            return (
              <article
                className="flex flex-col gap-3 rounded-xl border border-border bg-[var(--surface-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between"
                key={impact.documentId}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{impact.title}</p>
                    <Badge variant="outline">{formatThemeBinding(impact.bindingPolicy)}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {impact.activeEnvironmentIds.length
                      ? `${impact.activeEnvironmentIds.length} active environment${impact.activeEnvironmentIds.length === 1 ? '' : 's'} · next publish required`
                      : 'Not active in an environment'}
                  </p>
                </div>
                <ImpactAdoptionState
                  canAcknowledge={canEdit && needsAcknowledgement}
                  impact={impact}
                  needsAcknowledgement={needsAcknowledgement}
                  pending={pending}
                  onAcknowledge={onAcknowledge}
                />
              </article>
            );
          })
        ) : (
          <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-border p-6 text-center">
            <div>
              <p className="font-semibold">No linked experiences</p>
              <p className="mt-1 text-sm text-muted-foreground">
                New experiences can use this theme after its first approval.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImpactAdoptionState({
  canAcknowledge,
  impact,
  needsAcknowledgement,
  pending,
  onAcknowledge,
}: {
  canAcknowledge: boolean;
  impact: WorkspaceThemeImpactDto;
  needsAcknowledgement: boolean;
  pending: boolean;
  onAcknowledge: (impact: WorkspaceThemeImpactDto) => void;
}): React.ReactElement {
  if (canAcknowledge) {
    return (
      <Button
        className="shrink-0"
        disabled={pending}
        onClick={() => onAcknowledge(impact)}
        size="sm"
        type="button"
        variant="outline"
      >
        <FileCheck2 aria-hidden="true" />
        Use approved version
      </Button>
    );
  }
  if (needsAcknowledgement) {
    return (
      <span className="shrink-0 text-xs font-semibold text-[var(--warning-fg)]">
        Workspace member action needed
      </span>
    );
  }
  if (impact.bindingPolicy === 'pinned') {
    return <span className="shrink-0 text-xs font-semibold">Pinned intentionally</span>;
  }
  if (impact.bindingPolicy === 'legacy') {
    return (
      <span className="shrink-0 text-xs font-semibold text-[var(--warning-fg)]">
        Legacy binding
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--success-fg)]">
      <CheckCircle2 aria-hidden="true" className="size-4" />
      Up to date
    </span>
  );
}
