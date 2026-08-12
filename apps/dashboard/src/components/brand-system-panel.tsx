'use client';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
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

const COPY = {
  missingTheme: msg({
    id: 'dashboard.brand.panel.missingTheme',
    message: 'The selected Brand theme is no longer available. Refresh this workspace.',
  }),
  themes: msg({ id: 'dashboard.brand.panel.themes', message: 'Brand themes' }),
  defaultSr: msg({ id: 'dashboard.brand.panel.defaultSr', message: ', workspace default' }),
  workspaceDefault: msg({
    id: 'dashboard.brand.panel.workspaceDefault',
    message: 'Workspace default',
  }),
  approvedVersion: msg({
    id: 'dashboard.brand.panel.approvedVersion',
    message: 'Version {version} approved',
  }),
  draftOnly: msg({ id: 'dashboard.brand.panel.draftOnly', message: 'Draft only' }),
  description: msg({
    id: 'dashboard.brand.panel.description',
    message:
      'Customer-facing theme tokens stay separate from dashboard styling. Approval creates an immutable version; releases adopt it explicitly.',
  }),
  hideImpact: msg({ id: 'dashboard.brand.panel.hideImpact', message: 'Hide impact' }),
  previewImpact: msg({ id: 'dashboard.brand.panel.previewImpact', message: 'Preview impact' }),
  editDraft: msg({ id: 'dashboard.brand.panel.editDraft', message: 'Edit draft' }),
  adminApproval: msg({
    id: 'dashboard.brand.panel.adminApproval',
    message: 'Approval and default changes are explicit workspace-admin actions.',
  }),
  askAdmin: msg({
    id: 'dashboard.brand.panel.askAdmin',
    message: 'A workspace admin or owner approves versions and changes the default.',
  }),
  reviewOpen: msg({ id: 'dashboard.brand.panel.reviewOpen', message: 'Review open' }),
  reviewApprove: msg({
    id: 'dashboard.brand.panel.reviewApprove',
    message: 'Review & approve',
  }),
  makeDefault: msg({ id: 'dashboard.brand.panel.makeDefault', message: 'Make default' }),
} as const;

export function BrandSystemPanel({
  themes,
  canEdit,
  canApprove,
  authoringUrl,
  sourceSummary,
  workspaceId,
}: BrandSystemPanelProps): React.ReactElement {
  const { _ } = useLingui();
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
    return <BrandFeedbackBanner error={_(COPY.missingTheme)} message="" />;
  }

  const theme = controller.theme;
  const visibleDraft = controller.visibleDraft;
  const canMakeDefault = canApprove && Boolean(theme.activeVersion) && !theme.isDefault;

  return (
    <div className="grid gap-5">
      <BrandFeedbackBanner error={controller.error} message={controller.message} />
      <BrandSourceSummaryCard authoringUrl={authoringUrl} summary={sourceSummary} />

      {controller.themeRows.length > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label={_(COPY.themes)}>
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
              {themeRow.isDefault ? <span className="sr-only">{_(COPY.defaultSr)}</span> : null}
            </Button>
          ))}
        </nav>
      ) : null}

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="gap-4 border-b border-border bg-[var(--surface-subtle)] sm:flex-row sm:items-start sm:justify-between">
          <div className="grid min-w-0 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl">{theme.name}</CardTitle>
              {theme.isDefault ? <Badge variant="success">{_(COPY.workspaceDefault)}</Badge> : null}
              <Badge variant={theme.activeVersion ? 'outline' : 'warning'}>
                {theme.activeVersion
                  ? _({
                      ...COPY.approvedVersion,
                      values: { version: theme.activeVersion.version },
                    })
                  : _(COPY.draftOnly)}
              </Badge>
            </div>
            <CardDescription className="max-w-2xl leading-6">{_(COPY.description)}</CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              disabled={controller.pending}
              onClick={controller.toggleImpact}
              type="button"
              variant="outline"
            >
              <Eye aria-hidden="true" />
              {controller.impactOpen ? _(COPY.hideImpact) : _(COPY.previewImpact)}
            </Button>
            <Button
              disabled={!canEdit || controller.pending}
              onClick={controller.openEditor}
              type="button"
              variant="outline"
            >
              <Paintbrush aria-hidden="true" />
              {_(COPY.editDraft)}
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
            <p>{canApprove ? _(COPY.adminApproval) : _(COPY.askAdmin)}</p>
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
              {controller.approvalReviewOpen ? _(COPY.reviewOpen) : _(COPY.reviewApprove)}
            </Button>
            <Button
              disabled={!canMakeDefault || controller.pending}
              onClick={controller.makeDefault}
              type="button"
              variant="outline"
            >
              <Sparkles aria-hidden="true" />
              {_(COPY.makeDefault)}
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
