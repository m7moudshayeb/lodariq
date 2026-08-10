import {
  publishReadinessIssueLabel,
  validateTourPublishReadiness,
  type LodariqDocument,
} from '@lodariq/schema';
import type { AuthoringReleaseFinding } from '../../local-frame-types';
import { CircleAlert } from '../design-system';
import type { AuthoringReleaseViewStatus } from '../types';

const RELEASE_FINDING_SEVERITY_LABELS = {
  blocker: 'Blocker',
  warning: 'Warning',
} as const satisfies Record<AuthoringReleaseFinding['severity'], string>;

const RELEASE_VIEW_STATUS_LABELS = {
  unavailable: 'Release unavailable',
  checking: 'Checking release',
  publishing: 'Publishing',
  ready: 'Ready to stage',
  current: 'Staging current',
  blocked: 'Needs attention',
  error: 'Release check failed',
} as const satisfies Record<AuthoringReleaseViewStatus, string>;

export function ReleaseFindings({ findings }: { findings: AuthoringReleaseFinding[] }) {
  const uniqueFindings = deduplicateReleaseFindings(findings);
  if (uniqueFindings.length === 0) return null;

  const blockerCount = uniqueFindings.filter((finding) => finding.severity === 'blocker').length;
  const heading = `${uniqueFindings.length} ${
    uniqueFindings.length === 1 ? 'finding' : 'findings'
  }`;

  return (
    <section
      className="panel-mode-section release-findings-section"
      aria-labelledby="release-findings-title"
      data-release-findings-count={uniqueFindings.length}
    >
      <div className="panel-mode-section-heading">
        <span>
          <small>Release findings</small>
          <strong id="release-findings-title">{heading}</strong>
        </span>
        <span className={`panel-status-pill ${blockerCount > 0 ? 'failed' : 'draft'}`}>
          {blockerCount > 0
            ? `${blockerCount} ${blockerCount === 1 ? 'blocker' : 'blockers'}`
            : 'Warnings only'}
        </span>
      </div>
      <ul className="panel-check-list release-finding-list" aria-label="Release findings">
        {uniqueFindings.map((finding) => (
          <li
            className={finding.severity === 'blocker' ? 'failed' : 'warning'}
            key={releaseFindingKey(finding)}
          >
            <CircleAlert size={14} strokeWidth={2.2} aria-hidden="true" />
            <span>
              <strong>{finding.label}</strong>
              <small className="release-finding-severity">
                Severity: {RELEASE_FINDING_SEVERITY_LABELS[finding.severity]}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function deduplicateReleaseFindings(
  findings: AuthoringReleaseFinding[],
): AuthoringReleaseFinding[] {
  const unique = new Map<string, AuthoringReleaseFinding>();
  for (const finding of findings) {
    const key = releaseFindingKey(finding);
    if (!unique.has(key)) unique.set(key, finding);
  }
  return [...unique.values()];
}

export function localPublishReadinessFindings(
  document: LodariqDocument,
): AuthoringReleaseFinding[] {
  return validateTourPublishReadiness(document).map((issue, index) => ({
    code: `local:${index}:${issue.code}`,
    label: publishReadinessIssueLabel(issue.code),
    severity: 'blocker',
  }));
}

export function combinedReleaseFindings(
  document: LodariqDocument,
  remoteFindings: AuthoringReleaseFinding[],
): AuthoringReleaseFinding[] {
  return deduplicateReleaseFindings([
    ...localPublishReadinessFindings(document),
    ...remoteFindings,
  ]);
}

export function releaseFooterSummary(
  status: AuthoringReleaseViewStatus,
  findings: AuthoringReleaseFinding[],
): string {
  const count = deduplicateReleaseFindings(findings).length;
  const statusLabel = RELEASE_VIEW_STATUS_LABELS[status];
  if (count === 0) return statusLabel;
  return `${statusLabel} · ${count} ${count === 1 ? 'finding' : 'findings'}`;
}

function releaseFindingKey(finding: AuthoringReleaseFinding): string {
  return `${finding.severity}:${finding.code}:${finding.label}`;
}
