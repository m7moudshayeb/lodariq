'use client';

import * as React from 'react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import type { BrandThemeDefinition } from '@lodariq/schema';
import { useBrandSystemMutations } from '../../hooks/use-brand-system-mutations';
import {
  brandApprovalReviewKey,
  hasUnapprovedBrandChanges,
  isCurrentBrandApprovalReview,
  updateBrandThemeDefinition,
} from '../../lib/brand-system';
import type {
  WorkspaceThemeDto,
  WorkspaceThemeImpactDto,
  WorkspaceThemeDetailDto,
} from '../../lib/api';

const EMPTY_MESSAGE = '';

const COPY = {
  impactMissing: msg({
    id: 'dashboard.brand.controller.impactMissing',
    message: 'Brand impact was not returned.',
  }),
  systemMissing: msg({
    id: 'dashboard.brand.controller.systemMissing',
    message: 'Brand system was not returned.',
  }),
  draftMissing: msg({
    id: 'dashboard.brand.controller.draftMissing',
    message: 'Brand draft was not returned.',
  }),
  reviewRequired: msg({
    id: 'dashboard.brand.controller.reviewRequired',
    message: 'Open the approval review and wait for both runtime previews before approving.',
  }),
  approvedMissing: msg({
    id: 'dashboard.brand.controller.approvedMissing',
    message: 'Approved theme was not returned.',
  }),
  reviewMissing: msg({
    id: 'dashboard.brand.controller.reviewMissing',
    message: 'Approval review was not returned.',
  }),
  defaultMissing: msg({
    id: 'dashboard.brand.controller.defaultMissing',
    message: 'Default theme was not returned.',
  }),
  updatedImpactMissing: msg({
    id: 'dashboard.brand.controller.updatedImpactMissing',
    message: 'Updated impact was not returned.',
  }),
  previewFailed: msg({
    id: 'dashboard.brand.controller.previewFailed',
    message: 'The runtime preview could not be rendered. Close this review and try again.',
  }),
} as const;

export function useBrandSystemController({
  themes,
  workspaceId,
}: {
  themes: WorkspaceThemeDto[];
  workspaceId: string;
}) {
  const { _ } = useLingui();
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
  const [transitionPending, startTransition] = React.useTransition();
  const brandMutations = useBrandSystemMutations(workspaceId);
  const pending = transitionPending || brandMutations.isPending;
  const theme = selectedTheme(themeRows, selectedThemeId);
  const visibleDraft = draft ?? theme?.draft ?? null;

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

  const closeApprovalReview = (): void => {
    setApprovalReviewOpen(false);
    setApprovalReviewKey(null);
    setCompletedReviewKey(null);
    if (!impactOpen) setDetail(null);
  };

  const replaceTheme = (nextTheme: WorkspaceThemeDto): void => {
    const replacesSelectedTheme = selectedThemeIdRef.current === nextTheme.id;
    setThemeRows((current) =>
      current.map((themeRow) => {
        if (themeRow.id === nextTheme.id) return nextTheme;
        return nextTheme.isDefault ? { ...themeRow, isDefault: false } : themeRow;
      }),
    );
    if (replacesSelectedTheme) setDraft(nextTheme.draft);
  };

  const refreshImpact = (): void => {
    if (!theme) return;
    clearFeedback(setMessage, setError);
    setDetail(null);
    setImpactOpen(true);
    startTransition(async () => {
      const result = await brandMutations.loadImpact.mutateAsync(theme.id);
      if (result.status === 'error' || !result.detail) {
        setImpactOpen(false);
        setError(result.status === 'error' ? result.error : _(COPY.impactMissing));
        return;
      }
      replaceTheme(result.detail.theme);
      setDetail(result.detail);
      setImpactOpen(true);
    });
  };

  const createTheme = (): void => {
    clearFeedback(setMessage, setError);
    startTransition(async () => {
      const result = await brandMutations.create.mutateAsync();
      if (result.status === 'error' || !result.theme) {
        setError(result.status === 'error' ? result.error : _(COPY.systemMissing));
        return;
      }
      setThemeRows([result.theme]);
      selectedThemeIdRef.current = result.theme.id;
      setSelectedThemeId(result.theme.id);
      setDraft(result.theme.draft);
      setMessage(result.message);
    });
  };

  const selectTheme = (themeId: string): void => {
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
  };

  const updateDraft = (patch: Parameters<typeof updateBrandThemeDefinition>[1]): void => {
    closeApprovalReview();
    setDraft((current) => (current ? updateBrandThemeDefinition(current, patch) : current));
  };

  const saveDraft = (): void => {
    if (!theme || !visibleDraft) return;
    clearFeedback(setMessage, setError);
    startTransition(async () => {
      const result = await brandMutations.saveDraft.mutateAsync({
        themeId: theme.id,
        name: theme.name,
        draft: visibleDraft,
        expectedRevision: theme.revision,
        expectedUpdatedAt: theme.updatedAt,
      });
      if (result.status === 'error' || !result.theme) {
        setError(result.status === 'error' ? result.error : _(COPY.draftMissing));
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
  };

  const approveDraft = (): void => {
    if (
      !theme ||
      !approvalReviewOpen ||
      approvalReviewKey !== brandApprovalReviewKey(theme) ||
      !isCurrentBrandApprovalReview(completedReviewKey, theme) ||
      !detail
    ) {
      setError(_(COPY.reviewRequired));
      return;
    }
    clearFeedback(setMessage, setError);
    startTransition(async () => {
      const result = await brandMutations.approve.mutateAsync(themeGuard(theme));
      if (result.status === 'error' || !result.theme) {
        setError(result.status === 'error' ? result.error : _(COPY.approvedMissing));
        return;
      }
      replaceTheme(result.theme);
      const refreshed = await brandMutations.loadImpact.mutateAsync(theme.id);
      if (refreshed.status === 'success' && refreshed.detail) {
        setDetail(refreshed.detail);
        setImpactOpen(refreshed.detail.impact.length > 0);
      }
      setApprovalReviewOpen(false);
      setApprovalReviewKey(null);
      setCompletedReviewKey(null);
      setMessage(result.message);
    });
  };

  const openApprovalReview = (): void => {
    if (!theme) return;
    const nextReviewKey = brandApprovalReviewKey(theme);
    clearFeedback(setMessage, setError);
    setApprovalReviewOpen(true);
    setImpactOpen(false);
    setApprovalReviewKey(nextReviewKey);
    setCompletedReviewKey(null);
    setDetail(null);
    startTransition(async () => {
      const result = await brandMutations.loadImpact.mutateAsync(theme.id);
      if (result.status === 'error' || !result.detail) {
        setError(result.status === 'error' ? result.error : _(COPY.reviewMissing));
        return;
      }
      if (selectedThemeIdRef.current !== theme.id) return;
      replaceTheme(result.detail.theme);
      setDetail(result.detail);
      setApprovalReviewKey(brandApprovalReviewKey(result.detail.theme));
    });
  };

  const makeDefault = (): void => {
    if (!theme) return;
    clearFeedback(setMessage, setError);
    startTransition(async () => {
      const result = await brandMutations.makeDefault.mutateAsync(themeGuard(theme));
      if (result.status === 'error' || !result.theme) {
        setError(result.status === 'error' ? result.error : _(COPY.defaultMissing));
        return;
      }
      replaceTheme(result.theme);
      setMessage(result.message);
    });
  };

  const acknowledgeImpact = (impact: WorkspaceThemeImpactDto): void => {
    const activeVersionId = theme?.activeVersionId;
    if (!theme || !activeVersionId) return;
    clearFeedback(setMessage, setError);
    startTransition(async () => {
      const result = await brandMutations.acknowledge.mutateAsync({
        documentId: impact.documentId,
        themeId: theme.id,
        themeVersionId: activeVersionId,
      });
      if (result.status === 'error' || !result.detail) {
        setError(result.status === 'error' ? result.error : _(COPY.updatedImpactMissing));
        return;
      }
      replaceTheme(result.detail.theme);
      setDetail(result.detail);
      setMessage(result.message);
    });
  };

  const hasUnapprovedChanges = theme
    ? hasUnapprovedBrandChanges(theme.draft, theme.activeVersion?.snapshot.definition)
    : false;
  const reviewComplete = theme ? isCurrentBrandApprovalReview(completedReviewKey, theme) : false;

  return {
    themeRows,
    selectedThemeId,
    theme,
    visibleDraft,
    editing,
    impactOpen,
    approvalReviewOpen,
    approvalReviewKey,
    detail,
    message,
    error,
    pending,
    hasUnapprovedChanges,
    reviewComplete,
    createTheme,
    selectTheme,
    updateDraft,
    refreshImpact,
    saveDraft,
    approveDraft,
    openApprovalReview,
    closeApprovalReview,
    makeDefault,
    acknowledgeImpact,
    openEditor: () => {
      closeApprovalReview();
      setEditing(true);
    },
    cancelEditor: () => {
      setDraft(theme?.draft ?? null);
      setEditing(false);
    },
    toggleImpact: () => {
      if (impactOpen) setImpactOpen(false);
      else {
        closeApprovalReview();
        refreshImpact();
      }
    },
    markReviewReady: (reviewKey: string) => setCompletedReviewKey(reviewKey),
    markReviewError: (_reviewKey: string) => {
      setCompletedReviewKey(null);
      setError(_(COPY.previewFailed));
    },
  };
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
