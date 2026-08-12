import { authoringText } from '../../../i18n';
import {
  publishReadinessIssueLabel,
  validateTourPublishReadiness,
  type LodariqDocument,
} from '@lodariq/schema';
import type { AuthoringReleaseFinding } from '../../local-frame-types';
import { CircleAlert } from '../design-system';
import type { AuthoringReleaseViewStatus } from '../types';

const RELEASE_FINDING_SEVERITY_LABELS = {
  blocker: authoringText('Blocker'),
  warning: authoringText('Warning'),
} as const satisfies Record<AuthoringReleaseFinding['severity'], string>;

const RELEASE_VIEW_STATUS_LABELS = {
  unavailable: authoringText('Release unavailable'),
  checking: authoringText('Checking release'),
  publishing: authoringText('Publishing'),
  ready: authoringText('Ready to stage'),
  current: authoringText('Staging current'),
  blocked: authoringText('Needs attention'),
  error: authoringText('Release check failed'),
} as const satisfies Record<AuthoringReleaseViewStatus, string>;

export function ReleaseFindings({ findings }: { findings: AuthoringReleaseFinding[] }) {
  const uniqueFindings = deduplicateReleaseFindings(findings);
  if (uniqueFindings.length === 0) return null;

  const blockerCount = uniqueFindings.filter((finding) => finding.severity === 'blocker').length;
  const heading = authoringText(
    uniqueFindings.length === 1 ? '{count} finding' : '{count} findings',
    { count: uniqueFindings.length },
  );

  return (
    <section
      className="panel-mode-section release-findings-section"
      aria-labelledby="release-findings-title"
      data-release-findings-count={uniqueFindings.length}
    >
      <div className="panel-mode-section-heading">
        <span>
          <small>{authoringText('Release findings')}</small>
          <strong id="release-findings-title">{heading}</strong>
        </span>
        <span className={`panel-status-pill ${blockerCount > 0 ? 'failed' : 'draft'}`}>
          {blockerCount > 0
            ? authoringText(blockerCount === 1 ? '{count} blocker' : '{count} blockers', {
                count: blockerCount,
              })
            : authoringText('Warnings only')}
        </span>
      </div>
      <ul
        className="panel-check-list release-finding-list"
        aria-label={authoringText('Release findings')}
      >
        {uniqueFindings.map((finding) => (
          <li
            className={finding.severity === 'blocker' ? 'failed' : 'warning'}
            key={releaseFindingKey(finding)}
          >
            <CircleAlert size={14} strokeWidth={2.2} aria-hidden="true" />
            <span>
              <strong>{authoringText(finding.label)}</strong>
              <small className="release-finding-severity">
                {authoringText('Severity:')} {RELEASE_FINDING_SEVERITY_LABELS[finding.severity]}
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
    label: authoringText(publishReadinessIssueLabel(issue.code)),
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
  return authoringText(count === 1 ? '{status} · {count} finding' : '{status} · {count} findings', {
    status: statusLabel,
    count,
  });
}

function releaseFindingKey(finding: AuthoringReleaseFinding): string {
  return `${finding.severity}:${finding.code}:${finding.label}`;
}
