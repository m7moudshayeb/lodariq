import type { SupportedLocale } from '@lodariq/i18n';
import {
  documentTypeSupportsTourFlow,
  TOUR_FLOW_ISSUE_CODES,
  type DashboardPublishReadinessIssue,
} from '@lodariq/schema';
import { DASHBOARD_VIEW_MODEL_MESSAGES } from '../i18n/messages';
import { dashboardPublishIssueCopy } from '../i18n/server-feedback';
import type { DocumentSummaryDto } from './api';
import { buildAuthoringLaunchUrl } from './authoring-launch-url';
import type { DashboardViewModelLocalization } from './view-model-localization';

const FLOW_READINESS_ISSUE_CODE_SET = new Set<string>(TOUR_FLOW_ISSUE_CODES);

export interface DashboardFlowEvidence {
  detail: string;
  tone: 'success' | 'warning';
  value: string;
}

export function documentFlowIssues(document: DocumentSummaryDto): DashboardPublishReadinessIssue[] {
  if (!documentTypeSupportsTourFlow(document.type)) return [];
  return document.publishReadinessIssues.filter((issue) =>
    FLOW_READINESS_ISSUE_CODE_SET.has(issue.code),
  );
}

export function describeDocumentFlowEvidence(
  document: DocumentSummaryDto,
  localization: DashboardViewModelLocalization,
): DashboardFlowEvidence | null {
  if (!documentTypeSupportsTourFlow(document.type)) return null;
  const { translate } = localization;
  const issues = documentFlowIssues(document);
  if (issues.length === 0) {
    return {
      value: translate(DASHBOARD_VIEW_MODEL_MESSAGES.flowHealthy),
      detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.flowHealthyDetail),
      tone: 'success',
    };
  }

  const firstIssue = issues[0];
  const firstIssueMessage = firstIssue
    ? translate(dashboardPublishIssueCopy(firstIssue.code).message)
    : '';
  let detail = firstIssueMessage;
  if (issues.length > 1) {
    detail = translate(DASHBOARD_VIEW_MODEL_MESSAGES.flowIssueSummary, {
      first: firstIssueMessage,
      remaining: issues.length - 1,
    });
  }
  return {
    value: translate(DASHBOARD_VIEW_MODEL_MESSAGES.flowIssues, { count: issues.length }),
    detail,
    tone: 'warning',
  };
}

export function buildDocumentFlowMapUrl(
  exactOrigin: string | undefined,
  document: DocumentSummaryDto,
  focusBlockId: string | undefined,
  locale: SupportedLocale,
): string {
  if (!exactOrigin || !documentTypeSupportsTourFlow(document.type)) return '';
  return buildAuthoringLaunchUrl(exactOrigin, locale, {
    documentId: document.id,
    workspace: 'flowMap',
    ...(focusBlockId ? { focusBlockId } : {}),
  });
}
