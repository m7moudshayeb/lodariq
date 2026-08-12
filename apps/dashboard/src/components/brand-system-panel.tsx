'use client';

import { Eye, ListChecks, Paintbrush, ShieldCheck, Sparkles } from 'lucide-react';
import type { WorkspaceThemeDto } from '../lib/api';
import type { DashboardBrandSourceSummary } from '../lib/view-model';
import { BrandDraftTourPreview } from './brand-tour-comparison';
import { BrandApprovalReview } from './brand-system/brand-approval-review';
import { BrandEmptyState } from './brand-system/brand-empty-state';
import { BrandFeedbackBanner } from './brand-system/brand-feedback-banner';
import { BrandImpactPanel } from './brand-system/brand-impact-panel';
import { BrandSourceSummaryCard } from './brand-system/brand-source-summary-card';
import { BrandEssentialEditor, BrandSummary } from './brand-system/brand-theme-editor';
import { useBrandSystemController } from './brand-system/use-brand-system-controller';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface BrandSystemPanelProps {
  themes: WorkspaceThemeDto[];
  canEdit: boolean;
  canApprove: boolean;
  authoringUrl: string;
  sourceSummary: DashboardBrandSourceSummary;
  workspaceId: string;
}

export function BrandSystemPanel({
  themes,
  canEdit,
  canApprove,
  authoringUrl,
  sourceSummary,
  workspaceId,
}: BrandSystemPanelProps): React.ReactElement {
  const controller = useBrandSystemController({ themes, workspaceId });

  if (!controller.themeRows.length) {
    return (
      <div className="grid gap-5">
        <BrandSourceSummaryCard authoringUrl={authoringUrl} summary={sourceSummary} />
        <BrandEmptyState
          canEdit={canEdit}
          error={controller.error}
          pending={controller.pending}
          onCreate={controller.createTheme}
        />
      </div>
    );
  }

  if (!controller.theme || !controller.visibleDraft) {
    return (
      <BrandFeedbackBanner
        error="The selected Brand theme is no longer available. Refresh this workspace."
        message=""
      />
    );
  }

  const theme = controller.theme;
  const visibleDraft = controller.visibleDraft;
  const canMakeDefault = canApprove && Boolean(theme.activeVersion) && !theme.isDefault;

  return (
    <div className="grid gap-5">
      <BrandFeedbackBanner error={controller.error} message={controller.message} />
      <BrandSourceSummaryCard authoringUrl={authoringUrl} summary={sourceSummary} />

      {controller.themeRows.length > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Brand themes">
          {controller.themeRows.map((themeRow) => (
            <Button
              aria-pressed={themeRow.id === theme.id}
              disabled={controller.pending}
              key={themeRow.id}
              onClick={() => controller.selectTheme(themeRow.id)}
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
              disabled={controller.pending}
              onClick={controller.toggleImpact}
              type="button"
              variant="outline"
            >
              <Eye aria-hidden="true" />
              {controller.impactOpen ? 'Hide impact' : 'Preview impact'}
            </Button>
            <Button
              disabled={!canEdit || controller.pending}
              onClick={controller.openEditor}
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
          {controller.editing ? (
            <BrandEssentialEditor
              definition={visibleDraft}
              pending={controller.pending}
              onCancel={controller.cancelEditor}
              onChange={controller.updateDraft}
              onSave={controller.saveDraft}
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
                !canApprove ||
                controller.pending ||
                !controller.hasUnapprovedChanges ||
                controller.editing ||
                controller.approvalReviewOpen
              }
              onClick={controller.openApprovalReview}
              type="button"
            >
              <ListChecks aria-hidden="true" />
              {controller.approvalReviewOpen ? 'Review open' : 'Review & approve'}
            </Button>
            <Button
              disabled={!canMakeDefault || controller.pending}
              onClick={controller.makeDefault}
              type="button"
              variant="outline"
            >
              <Sparkles aria-hidden="true" />
              Make default
            </Button>
          </div>
        </div>
      </Card>

      {controller.approvalReviewOpen && controller.approvalReviewKey ? (
        <BrandApprovalReview
          canApprove={canApprove}
          detail={controller.detail}
          draft={theme.draft}
          pending={controller.pending}
          reviewComplete={controller.reviewComplete}
          reviewKey={controller.approvalReviewKey}
          theme={theme}
          onApprove={controller.approveDraft}
          onClose={controller.closeApprovalReview}
          onPreviewError={controller.markReviewError}
          onPreviewReady={controller.markReviewReady}
        />
      ) : null}

      {controller.impactOpen ? (
        <BrandImpactPanel
          activeVersionId={theme.activeVersionId}
          canEdit={canEdit}
          detail={controller.detail}
          pending={controller.pending}
          onAcknowledge={controller.acknowledgeImpact}
        />
      ) : null}
    </div>
  );
}
