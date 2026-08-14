import { DASHBOARD_VIEW_MODEL_MESSAGES } from '../i18n/messages';
import type { WorkspaceThemeDto } from './api';
import { formatDateTime } from './view-model-formatters';
import type { DashboardViewModelLocalization } from './view-model-localization';
import type { DashboardStatusVariant } from './view-model-types';

export interface DashboardBrandSourceSummary {
  sourceLabel: string;
  sourceDetail: string;
  statusLabel: string;
  statusVariant: DashboardStatusVariant;
  revisionLabel: string;
  checkedAtLabel: string;
  confidenceLabel: string | null;
  semanticRoles: string[];
}

export function buildBrandSourceSummary(
  themes: WorkspaceThemeDto[],
  localization: DashboardViewModelLocalization,
): DashboardBrandSourceSummary {
  const { locale, translate } = localization;
  const semanticRoles = [
    translate(DASHBOARD_VIEW_MODEL_MESSAGES.accent),
    translate(DASHBOARD_VIEW_MODEL_MESSAGES.surface),
    translate(DASHBOARD_VIEW_MODEL_MESSAGES.text),
    translate(DASHBOARD_VIEW_MODEL_MESSAGES.typography),
    translate(DASHBOARD_VIEW_MODEL_MESSAGES.radius),
  ];
  const theme = themes.find((item) => item.isDefault) ?? themes[0];
  if (!theme) {
    return {
      sourceLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.accessibleFallback),
      sourceDetail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.semanticDefaultsActive),
      statusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.safeFallback),
      statusVariant: 'outline',
      revisionLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.noApprovedVersion),
      checkedAtLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.productMatchNotRecorded),
      confidenceLabel: null,
      semanticRoles,
    };
  }
  const styleSource = theme.latestStyleSource;
  if (styleSource) {
    return {
      sourceLabel: productStyleSourceLabel(styleSource.kind, translate),
      sourceDetail: productStyleSourceDetail(styleSource.kind, theme.name, translate),
      statusLabel: translate(
        theme.activeVersion
          ? DASHBOARD_VIEW_MODEL_MESSAGES.approvedSource
          : DASHBOARD_VIEW_MODEL_MESSAGES.needsApproval,
      ),
      statusVariant: theme.activeVersion ? 'success' : 'warning',
      revisionLabel: styleSource.revision
        ? translate(DASHBOARD_VIEW_MODEL_MESSAGES.sourceRevision, {
            revision: styleSource.revision,
          })
        : translate(DASHBOARD_VIEW_MODEL_MESSAGES.themeRevision, { revision: theme.revision }),
      checkedAtLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.checkedAt, {
        date: formatDateTime(styleSource.capturedAt, locale, translate),
      }),
      confidenceLabel: productStyleConfidenceLabel(styleSource.confidence, translate),
      semanticRoles,
    };
  }
  if (!theme.activeVersion) {
    return {
      sourceLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.workspaceDraft, { theme: theme.name }),
      sourceDetail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.tokensSavedAsDraft),
      statusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.needsApproval),
      statusVariant: 'warning',
      revisionLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.draftRevision, {
        revision: theme.revision,
      }),
      checkedAtLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.updatedAt, {
        date: formatDateTime(theme.updatedAt, locale, translate),
      }),
      confidenceLabel: null,
      semanticRoles,
    };
  }
  return {
    sourceLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.workspaceApprovedTokens),
    sourceDetail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.themeCompiledSnapshot, {
      theme: theme.name,
    }),
    statusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.approvedSource),
    statusVariant: 'success',
    revisionLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.version, {
      version: theme.activeVersion.version,
    }),
    checkedAtLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.approvedAt, {
      date: formatDateTime(theme.activeVersion.approvedAt, locale, translate),
    }),
    confidenceLabel: null,
    semanticRoles,
  };
}

type ProductStyleSourceKind = NonNullable<WorkspaceThemeDto['latestStyleSource']>['kind'];
type Translate = DashboardViewModelLocalization['translate'];

function productStyleSourceLabel(kind: ProductStyleSourceKind, translate: Translate): string {
  if (kind === 'registered_tokens') {
    return translate(DASHBOARD_VIEW_MODEL_MESSAGES.registeredDesignTokens);
  }
  if (kind === 'selected_element') {
    return translate(DASHBOARD_VIEW_MODEL_MESSAGES.selectedProductElement);
  }
  if (kind === 'nearby_control') {
    return translate(DASHBOARD_VIEW_MODEL_MESSAGES.nearbyProductControls);
  }
  if (kind === 'page_typography') {
    return translate(DASHBOARD_VIEW_MODEL_MESSAGES.productTypography);
  }
  if (kind === 'ancestor_context') {
    return translate(DASHBOARD_VIEW_MODEL_MESSAGES.productSurfaceContext);
  }
  return translate(DASHBOARD_VIEW_MODEL_MESSAGES.accessibleFallbackShort);
}

function productStyleSourceDetail(
  kind: ProductStyleSourceKind,
  themeName: string,
  translate: Translate,
): string {
  if (kind === 'registered_tokens') {
    return translate(DASHBOARD_VIEW_MODEL_MESSAGES.groundedInTokens, { theme: themeName });
  }
  if (kind === 'selected_element') {
    return translate(DASHBOARD_VIEW_MODEL_MESSAGES.proposedFromElement, { theme: themeName });
  }
  return translate(DASHBOARD_VIEW_MODEL_MESSAGES.privacySafeEvidence, { theme: themeName });
}

function productStyleConfidenceLabel(confidence: number, translate: Translate): string {
  if (confidence >= 80) return translate(DASHBOARD_VIEW_MODEL_MESSAGES.highConfidenceEvidence);
  if (confidence >= 60) return translate(DASHBOARD_VIEW_MODEL_MESSAGES.reviewRecommended);
  return translate(DASHBOARD_VIEW_MODEL_MESSAGES.lowConfidenceEvidence);
}
