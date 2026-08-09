'use client';

import * as React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  ExternalLink,
  FileCheck2,
  ListChecks,
  Paintbrush,
  RotateCcw,
  Save,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { BrandThemeDefinition } from '@lodariq/schema';
import {
  acknowledgeApprovedBrandThemeAction,
  approveBrandThemeAction,
  createAccessibleBrandThemeAction,
  loadBrandThemeImpactAction,
  makeDefaultBrandThemeAction,
  saveBrandThemeDraftAction,
} from '../app/actions';
import {
  BRAND_FONT_OPTIONS,
  BRAND_RADIUS_OPTIONS,
  brandApprovalReviewKey,
  hasUnapprovedBrandChanges,
  isCurrentBrandApprovalReview,
  safeBrandSwatchColor,
  updateBrandThemeDefinition,
} from '../lib/brand-system';
import type {
  WorkspaceThemeDetailDto,
  WorkspaceThemeDto,
  WorkspaceThemeImpactDto,
} from '../lib/api';
import type { DashboardBrandSourceSummary } from '../lib/view-model';
import { Badge } from './ui/badge';
import { BrandDraftTourPreview, BrandTourComparison } from './brand-tour-comparison';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface BrandSystemPanelProps {
  themes: WorkspaceThemeDto[];
  canEdit: boolean;
  canApprove: boolean;
  authoringUrl: string;
  sourceSummary: DashboardBrandSourceSummary;
}

const EMPTY_MESSAGE = '';
const THEME_BINDING_LABELS = {
  'workspace-current': 'Follows approved',
  pinned: 'Pinned version',
  legacy: 'Legacy fallback',
} as const satisfies Record<WorkspaceThemeImpactDto['bindingPolicy'], string>;

export function BrandSystemPanel({
  themes,
  canEdit,
  canApprove,
  authoringUrl,
  sourceSummary,
}: BrandSystemPanelProps): React.ReactElement {
  const [themeRows, setThemeRows] = React.useState(themes);
  const [selectedThemeId, setSelectedThemeId] = React.useState(
    () => themes.find((theme) => theme.isDefault)?.id ?? themes[0]?.id ?? '',
  );
  const selectedThemeIdRef = React.useRef(selectedThemeId);
  const [draft, setDraft] = React.useState<BrandThemeDefinition | null>(
    () => selectedTheme(themes, selectedThemeId)?.draft ?? null,
  );
  const [editing, setEditing] = React.useState(false);
  const [impactOpen, setImpactOpen] = React.useState(false);
  const [approvalReviewOpen, setApprovalReviewOpen] = React.useState(false);
  const [approvalReviewKey, setApprovalReviewKey] = React.useState<string | null>(null);
  const [completedReviewKey, setCompletedReviewKey] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<WorkspaceThemeDetailDto | null>(null);
  const [message, setMessage] = React.useState(EMPTY_MESSAGE);
  const [error, setError] = React.useState(EMPTY_MESSAGE);
  const [pending, startTransition] = React.useTransition();
  const markReviewReady = React.useCallback((reviewKey: string) => {
    setCompletedReviewKey(reviewKey);
  }, []);
  const markReviewError = React.useCallback((_reviewKey: string) => {
    setCompletedReviewKey(null);
    setError('The runtime preview could not be rendered. Close this review and try again.');
  }, []);

  const themeCandidate = selectedTheme(themeRows, selectedThemeId);
  const visibleDraftCandidate = draft ?? themeCandidate?.draft ?? null;

  React.useEffect(() => {
    setThemeRows(themes);
    const currentThemeId = selectedThemeIdRef.current;
    const nextThemeId = themes.some((themeRow) => themeRow.id === currentThemeId)
      ? currentThemeId
      : (themes.find((themeRow) => themeRow.isDefault)?.id ?? themes[0]?.id ?? '');
    const nextTheme = selectedTheme(themes, nextThemeId);
    selectedThemeIdRef.current = nextThemeId;
    setSelectedThemeId(nextThemeId);
    setDraft(nextTheme?.draft ?? null);
    setApprovalReviewOpen(false);
    setApprovalReviewKey(null);
    setCompletedReviewKey(null);
    setDetail(null);
  }, [themes]);

  if (!themeRows.length) {
    return (
      <div className="grid gap-5">
        <BrandSourceSummaryCard authoringUrl={authoringUrl} summary={sourceSummary} />
        <BrandEmptyState
          canEdit={canEdit}
          error={error}
          pending={pending}
          onCreate={() => {
            clearFeedback(setMessage, setError);
            startTransition(async () => {
              const result = await createAccessibleBrandThemeAction();
              if (result.status === 'error' || !result.theme) {
                setError(
                  result.status === 'error' ? result.error : 'Brand system was not returned.',
                );
                return;
              }
              setThemeRows([result.theme]);
              selectedThemeIdRef.current = result.theme.id;
              setSelectedThemeId(result.theme.id);
              setDraft(result.theme.draft);
              setMessage(result.message);
            });
          }}
        />
      </div>
    );
  }

  if (!themeCandidate || !visibleDraftCandidate) {
    return (
      <FeedbackBanner
        error="The selected Brand theme is no longer available. Refresh this workspace."
        message=""
      />
    );
  }

  const theme = themeCandidate;
  const visibleDraft = visibleDraftCandidate;

  const hasUnapprovedChanges = hasUnapprovedBrandChanges(
    theme.draft,
    theme.activeVersion?.snapshot.definition,
  );
  const canMakeDefault = canApprove && Boolean(theme.activeVersion) && !theme.isDefault;

  function updateDraft(patch: Parameters<typeof updateBrandThemeDefinition>[1]): void {
    closeApprovalReview();
    setDraft((current) => (current ? updateBrandThemeDefinition(current, patch) : current));
  }

  function selectTheme(themeId: string): void {
    if (pending || themeId === selectedThemeId) return;
    const nextTheme = selectedTheme(themeRows, themeId);
    selectedThemeIdRef.current = themeId;
    setSelectedThemeId(themeId);
    setDraft(nextTheme?.draft ?? null);
    setEditing(false);
    setImpactOpen(false);
    setApprovalReviewOpen(false);
    setApprovalReviewKey(null);
    setCompletedReviewKey(null);
    setDetail(null);
    clearFeedback(setMessage, setError);
  }

  function replaceTheme(nextTheme: WorkspaceThemeDto): void {
    const replacesSelectedTheme = selectedThemeIdRef.current === nextTheme.id;
    setThemeRows((current) => {
      const defaultChanged = nextTheme.isDefault;
      return current.map((themeRow) => {
        if (themeRow.id === nextTheme.id) return nextTheme;
        return defaultChanged ? { ...themeRow, isDefault: false } : themeRow;
      });
    });
    if (replacesSelectedTheme) setDraft(nextTheme.draft);
  }

  function refreshImpact(): void {
    clearFeedback(setMessage, setError);
    setDetail(null);
    setImpactOpen(true);
    startTransition(async () => {
      const result = await loadBrandThemeImpactAction(theme.id);
      if (result.status === 'error' || !result.detail) {
        setImpactOpen(false);
        setError(result.status === 'error' ? result.error : 'Brand impact was not returned.');
        return;
      }
      replaceTheme(result.detail.theme);
      setDetail(result.detail);
      setImpactOpen(true);
    });
  }

  function saveDraft(): void {
    clearFeedback(setMessage, setError);
    startTransition(async () => {
      const result = await saveBrandThemeDraftAction({
        themeId: theme.id,
        name: theme.name,
        draft: visibleDraft,
        expectedRevision: theme.revision,
        expectedUpdatedAt: theme.updatedAt,
      });
      if (result.status === 'error' || !result.theme) {
        setError(result.status === 'error' ? result.error : 'Brand draft was not returned.');
        return;
      }
      replaceTheme(result.theme);
      setEditing(false);
      setApprovalReviewOpen(false);
      setApprovalReviewKey(null);
      setCompletedReviewKey(null);
      setDetail(null);
      setImpactOpen(false);
      setMessage(result.message);
    });
  }

  function approveDraft(): void {
    if (
      !approvalReviewOpen ||
      approvalReviewKey !== brandApprovalReviewKey(theme) ||
      !isCurrentBrandApprovalReview(completedReviewKey, theme) ||
      !detail
    ) {
      setError('Open the approval review and wait for both runtime previews before approving.');
      return;
    }
    clearFeedback(setMessage, setError);
    startTransition(async () => {
      const result = await approveBrandThemeAction(themeGuard(theme));
      if (result.status === 'error' || !result.theme) {
        setError(result.status === 'error' ? result.error : 'Approved theme was not returned.');
        return;
      }
      replaceTheme(result.theme);
      const refreshed = await loadBrandThemeImpactAction(theme.id);
      if (refreshed.status === 'success' && refreshed.detail) {
        setDetail(refreshed.detail);
        setImpactOpen(refreshed.detail.impact.length > 0);
      }
      setApprovalReviewOpen(false);
      setApprovalReviewKey(null);
      setCompletedReviewKey(null);
      setMessage(result.message);
    });
  }

  function openApprovalReview(): void {
    const nextReviewKey = brandApprovalReviewKey(theme);
    clearFeedback(setMessage, setError);
    setApprovalReviewOpen(true);
    setImpactOpen(false);
    setApprovalReviewKey(nextReviewKey);
    setCompletedReviewKey(null);
    setDetail(null);
    startTransition(async () => {
      const result = await loadBrandThemeImpactAction(theme.id);
      if (result.status === 'error' || !result.detail) {
        setError(result.status === 'error' ? result.error : 'Approval review was not returned.');
        return;
      }
      if (selectedThemeIdRef.current !== theme.id) return;
      const loadedReviewKey = brandApprovalReviewKey(result.detail.theme);
      replaceTheme(result.detail.theme);
      setDetail(result.detail);
      setApprovalReviewKey(loadedReviewKey);
    });
  }

  function closeApprovalReview(): void {
    setApprovalReviewOpen(false);
    setApprovalReviewKey(null);
    setCompletedReviewKey(null);
    if (!impactOpen) setDetail(null);
  }

  function makeDefault(): void {
    clearFeedback(setMessage, setError);
    startTransition(async () => {
      const result = await makeDefaultBrandThemeAction(themeGuard(theme));
      if (result.status === 'error' || !result.theme) {
        setError(result.status === 'error' ? result.error : 'Default theme was not returned.');
        return;
      }
      replaceTheme(result.theme);
      setMessage(result.message);
    });
  }

  function acknowledgeImpact(impact: WorkspaceThemeImpactDto): void {
    const activeVersionId = theme.activeVersionId;
    if (!activeVersionId) return;
    clearFeedback(setMessage, setError);
    startTransition(async () => {
      const result = await acknowledgeApprovedBrandThemeAction({
        documentId: impact.documentId,
        themeId: theme.id,
        themeVersionId: activeVersionId,
      });
      if (result.status === 'error' || !result.detail) {
        setError(result.status === 'error' ? result.error : 'Updated impact was not returned.');
        return;
      }
      replaceTheme(result.detail.theme);
      setDetail(result.detail);
      setMessage(result.message);
    });
  }

  return (
    <div className="grid gap-5">
      <FeedbackBanner error={error} message={message} />

      <BrandSourceSummaryCard authoringUrl={authoringUrl} summary={sourceSummary} />

      {themeRows.length > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Brand themes">
          {themeRows.map((themeRow) => (
            <Button
              aria-pressed={themeRow.id === theme.id}
              disabled={pending}
              key={themeRow.id}
              onClick={() => selectTheme(themeRow.id)}
              size="sm"
              type="button"
              variant={themeRow.id === theme.id ? 'secondary' : 'ghost'}
            >
              {themeRow.name}
              {themeRow.isDefault ? <span className="sr-only">, workspace default</span> : null}
            </Button>
          ))}
        </nav>
      ) : null}

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="gap-4 border-b border-border bg-[var(--surface-subtle)] sm:flex-row sm:items-start sm:justify-between">
          <div className="grid min-w-0 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl">{theme.name}</CardTitle>
              {theme.isDefault ? <Badge variant="success">Workspace default</Badge> : null}
              <Badge variant={theme.activeVersion ? 'outline' : 'warning'}>
                {theme.activeVersion
                  ? `Version ${theme.activeVersion.version} approved`
                  : 'Draft only'}
              </Badge>
            </div>
            <CardDescription className="max-w-2xl leading-6">
              Customer-facing theme tokens stay separate from dashboard styling. Approval creates an
              immutable version; releases adopt it explicitly.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() => {
                if (impactOpen) setImpactOpen(false);
                else {
                  closeApprovalReview();
                  refreshImpact();
                }
              }}
              type="button"
              variant="outline"
            >
              <Eye aria-hidden="true" />
              {impactOpen ? 'Hide impact' : 'Preview impact'}
            </Button>
            <Button
              disabled={!canEdit || pending}
              onClick={() => {
                closeApprovalReview();
                setEditing(true);
              }}
              type="button"
              variant="outline"
            >
              <Paintbrush aria-hidden="true" />
              Edit draft
            </Button>
          </div>
        </CardHeader>

        <CardContent className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)] lg:p-6">
          <BrandDraftTourPreview definition={visibleDraft} name={theme.name} />
          {editing ? (
            <BrandEssentialEditor
              definition={visibleDraft}
              pending={pending}
              onCancel={() => {
                setDraft(theme.draft);
                setEditing(false);
              }}
              onChange={updateDraft}
              onSave={saveDraft}
            />
          ) : (
            <BrandSummary definition={visibleDraft} />
          )}
        </CardContent>

        <div className="flex flex-col gap-3 border-t border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              {canApprove
                ? 'Approval and default changes are explicit workspace-admin actions.'
                : 'A workspace admin or owner approves versions and changes the default.'}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              disabled={
                !canApprove || pending || !hasUnapprovedChanges || editing || approvalReviewOpen
              }
              onClick={openApprovalReview}
              type="button"
            >
              <ListChecks aria-hidden="true" />
              {approvalReviewOpen ? 'Review open' : 'Review & approve'}
            </Button>
            <Button
              disabled={!canMakeDefault || pending}
              onClick={makeDefault}
              type="button"
              variant="outline"
            >
              <Sparkles aria-hidden="true" />
              Make default
            </Button>
          </div>
        </div>
      </Card>

      {approvalReviewOpen && approvalReviewKey ? (
        <BrandApprovalReview
          canApprove={canApprove}
          detail={detail}
          draft={theme.draft}
          pending={pending}
          reviewComplete={isCurrentBrandApprovalReview(completedReviewKey, theme)}
          reviewKey={approvalReviewKey}
          theme={theme}
          onApprove={approveDraft}
          onClose={closeApprovalReview}
          onPreviewError={markReviewError}
          onPreviewReady={markReviewReady}
        />
      ) : null}

      {impactOpen ? (
        <BrandImpactPanel
          activeVersionId={theme.activeVersionId}
          canEdit={canEdit}
          detail={detail}
          pending={pending}
          onAcknowledge={acknowledgeImpact}
        />
      ) : null}
    </div>
  );
}

function BrandSourceSummaryCard({
  authoringUrl,
  summary,
}: {
  authoringUrl: string;
  summary: DashboardBrandSourceSummary;
}): React.ReactElement {
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
                <p className="font-semibold text-foreground">Product match source</p>
                <Badge variant={summary.statusVariant}>{summary.statusLabel}</Badge>
              </div>
              <p className="text-sm font-semibold text-foreground">{summary.sourceLabel}</p>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {summary.sourceDetail}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-[52px]">
            <Badge variant="outline">{summary.revisionLabel}</Badge>
            {summary.confidenceLabel ? (
              <Badge variant="outline">{summary.confidenceLabel}</Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">{summary.checkedAtLabel}</span>
          </div>
          <div
            className="flex flex-wrap gap-1.5 pl-0 sm:pl-[52px]"
            aria-label="Semantic Brand roles"
          >
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
              Open product to rematch
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
        ) : (
          <Button className="h-11" disabled type="button" variant="outline">
            Open product to rematch
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function BrandApprovalReview({
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

function BrandEmptyState({
  canEdit,
  error,
  pending,
  onCreate,
}: {
  canEdit: boolean;
  error: string;
  pending: boolean;
  onCreate: () => void;
}): React.ReactElement {
  return (
    <Card className="overflow-hidden border-dashed shadow-none">
      <div className="grid min-h-[360px] items-center gap-8 p-7 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.75fr)]">
        <div className="grid max-w-xl gap-5">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Paintbrush aria-hidden="true" className="size-5" />
          </span>
          <div className="grid gap-2">
            <h2 className="font-serif text-3xl font-medium tracking-[-0.025em]">
              Make every experience feel native
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Start from Lodariq’s accessible foundation, then adjust five essentials. No CSS,
              selectors, or theme configuration maze.
            </p>
          </div>
          <div>
            <Button disabled={!canEdit || pending} onClick={onCreate} type="button">
              <Sparkles aria-hidden="true" />
              {pending ? 'Creating…' : 'Create Brand system'}
            </Button>
            {!canEdit ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Ask a workspace member, admin, or owner to create it.
              </p>
            ) : null}
            {error ? (
              <p className="mt-3 text-sm font-medium text-[var(--danger-fg)]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <div
          aria-hidden="true"
          className="rounded-2xl border border-border bg-[var(--surface-subtle)] p-4 shadow-[0_18px_50px_rgba(12,33,28,.08)]"
        >
          <div className="rounded-xl border border-[#d7dce5] bg-white p-5 text-[#172033] shadow-[0_8px_24px_rgba(16,24,40,.12)]">
            <p className="text-base font-semibold">Welcome to your workspace</p>
            <p className="mt-2 text-sm leading-6 text-[#5d6678]">
              A clear, accessible starting point for every product experience.
            </p>
            <button
              className="pointer-events-none mt-5 h-9 rounded-[10px] bg-[#2457ff] px-4 text-sm font-semibold text-white"
              tabIndex={-1}
              type="button"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function BrandSummary({ definition }: { definition: BrandThemeDefinition }): React.ReactElement {
  const colors = definition.tokens.modes.light.colors;
  const fontFamily = definition.tokens.typography.fontFamilies[0] ?? 'system-ui';
  return (
    <section className="grid content-start gap-5" aria-labelledby="brand-summary-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Essentials
        </p>
        <h3 className="mt-1 font-semibold" id="brand-summary-title">
          One glance, five decisions
        </h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ThemeSwatch label="Accent" value={colors.accent} />
        <ThemeSwatch label="Surface" value={colors.surface} />
        <ThemeSwatch label="Text" value={colors.text} />
      </div>
      <dl className="divide-y divide-border rounded-xl border border-border">
        <SummaryRow label="Font family" value={fontFamily} />
        <SummaryRow label="Card radius" value={`${definition.tokens.radii.md}px`} />
        <SummaryRow
          label="Dark mode"
          value={definition.tokens.modes.dark ? 'Included' : 'Uses light theme'}
        />
      </dl>
    </section>
  );
}

function BrandEssentialEditor({
  definition,
  pending,
  onCancel,
  onChange,
  onSave,
}: {
  definition: BrandThemeDefinition;
  pending: boolean;
  onCancel: () => void;
  onChange: (patch: Parameters<typeof updateBrandThemeDefinition>[1]) => void;
  onSave: () => void;
}): React.ReactElement {
  const colors = definition.tokens.modes.light.colors;
  const currentFontFamily = definition.tokens.typography.fontFamilies[0] ?? 'system-ui';
  const fontOptions = withCurrentOption(BRAND_FONT_OPTIONS, currentFontFamily, 'Current font');
  const currentRadius = definition.tokens.radii.md;
  const radiusOptions = withCurrentOption(BRAND_RADIUS_OPTIONS, currentRadius, 'Current radius');
  return (
    <section className="grid content-start gap-5" aria-labelledby="brand-editor-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Editing draft
        </p>
        <h3 className="mt-1 font-semibold" id="brand-editor-title">
          Brand essentials
        </h3>
      </div>
      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-3">
          <ColorControl
            label="Accent"
            value={colors.accent}
            onChange={(accent) => onChange({ accent })}
          />
          <ColorControl
            label="Surface"
            value={colors.surface}
            onChange={(surface) => onChange({ surface })}
          />
          <ColorControl label="Text" value={colors.text} onChange={(text) => onChange({ text })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="brand-font-family">Font family</Label>
            <Select
              value={currentFontFamily}
              onValueChange={(fontFamily) => onChange({ fontFamily })}
            >
              <SelectTrigger id="brand-font-family">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fontOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="brand-card-radius">Card radius</Label>
            <Select
              value={String(currentRadius)}
              onValueChange={(radius) => onChange({ radius: Number(radius) })}
            >
              <SelectTrigger id="brand-card-radius">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {radiusOptions.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label} · {option.value}px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button disabled={pending} onClick={onCancel} type="button" variant="ghost">
          <RotateCcw aria-hidden="true" />
          Cancel
        </Button>
        <Button disabled={pending} onClick={onSave} type="button">
          <Save aria-hidden="true" />
          {pending ? 'Saving…' : 'Save draft'}
        </Button>
      </div>
    </section>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  const id = React.useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background p-1.5 pr-2 text-xs font-medium outline-none focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/35">
        <input
          aria-label={`${label} color`}
          className="size-8 cursor-pointer rounded-md border-0 bg-transparent p-0"
          id={id}
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={safeBrandSwatchColor(value)}
        />
        <span className="truncate text-muted-foreground">Choose</span>
      </div>
    </div>
  );
}

function BrandImpactPanel({
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
            const canAcknowledge = canEdit && needsAcknowledgement;
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
                  canAcknowledge={canAcknowledge}
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

function ThemeSwatch({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-xl border border-border bg-[var(--surface-subtle)] p-2">
      <span
        aria-hidden="true"
        className="block aspect-[4/3] w-full rounded-lg border border-black/10"
        style={{ backgroundColor: safeBrandSwatchColor(value) }}
      />
      <p className="mt-2 truncate text-xs font-semibold">{label}</p>
    </div>
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

function SummaryRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-sm font-semibold">{value}</dd>
    </div>
  );
}

function FeedbackBanner({
  error,
  message,
}: {
  error: string;
  message: string;
}): React.ReactElement {
  if (!error && !message) return <></>;
  return (
    <div
      aria-live="polite"
      className={
        error
          ? 'rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm font-medium text-[var(--danger-fg)]'
          : 'rounded-lg border border-[var(--success-border)] bg-[var(--success-bg)] px-4 py-3 text-sm font-medium text-[var(--success-fg)]'
      }
      role={error ? 'alert' : 'status'}
    >
      {error || message}
    </div>
  );
}

function selectedTheme(
  themes: readonly WorkspaceThemeDto[],
  selectedThemeId: string,
): WorkspaceThemeDto | undefined {
  return themes.find((theme) => theme.id === selectedThemeId) ?? themes[0];
}

function themeGuard(theme: WorkspaceThemeDto): {
  themeId: string;
  expectedRevision: number;
  expectedUpdatedAt: string;
} {
  return {
    themeId: theme.id,
    expectedRevision: theme.revision,
    expectedUpdatedAt: theme.updatedAt,
  };
}

function clearFeedback(
  setMessage: React.Dispatch<React.SetStateAction<string>>,
  setError: React.Dispatch<React.SetStateAction<string>>,
): void {
  setMessage(EMPTY_MESSAGE);
  setError(EMPTY_MESSAGE);
}

function impactCountLabel(count: number): string {
  return `${count} experience${count === 1 ? '' : 's'}`;
}

function formatThemeBinding(binding: WorkspaceThemeImpactDto['bindingPolicy']): string {
  return THEME_BINDING_LABELS[binding];
}

function withCurrentOption<T extends string | number>(
  options: readonly { value: T; label: string }[],
  currentValue: T,
  currentLabel: string,
): Array<{ value: T; label: string }> {
  if (options.some((option) => option.value === currentValue)) return [...options];
  return [{ value: currentValue, label: `${currentLabel} · ${currentValue}` }, ...options];
}
