import { publishReadinessIssueLabel, validateTourPublishReadiness } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import { Check, CircleAlert, LoaderCircle, Rocket } from '../design-system';
import {
  deriveAuthoringReleasePresentation,
  type AuthoringReleaseAction,
} from '../release-presentation';
import type { LocalAuthoringFrameSnapshot } from '../types';

export function ReleaseStatus({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const localIssues = validateTourPublishReadiness(snapshot.documentState);
  const presentation = deriveAuthoringReleasePresentation({
    blockerCount: localIssues.length,
    release: snapshot.release,
    workflow: snapshot.panelWorkflow.release,
  });
  const remoteFindings = deduplicateFindings(snapshot.release.findings);
  const findings = localIssues.length
    ? localIssues.map((issue) => ({
        code: issue.code,
        label: publishReadinessIssueLabel(issue.code),
        severity: 'blocker' as const,
      }))
    : remoteFindings;

  return (
    <section
      className={`tour-release-strip ${presentation.tone}`}
      aria-label="Release status"
      aria-live="polite"
      data-release-action={presentation.action}
      data-release-status={snapshot.release.status}
    >
      <p className="tour-release-truth">{presentation.truth}</p>
      <div className="tour-release-summary">
        <span className="tour-release-icon" aria-hidden="true">
          {releaseStatusIcon(presentation.tone)}
        </span>
        <span className="tour-release-copy">
          <strong>{presentation.title}</strong>
          <span>{presentation.detail}</span>
        </span>
      </div>

      {findings.length > 0 ? (
        <ul className="tour-release-findings" aria-label="Release checks">
          {findings.slice(0, 2).map((finding) => (
            <li className={finding.severity} key={`${finding.severity}:${finding.code}`}>
              <span aria-hidden="true" />
              {finding.label}
            </li>
          ))}
          {findings.length > 2 ? (
            <li>
              <span aria-hidden="true" />+{findings.length - 2} more checks
            </li>
          ) : null}
        </ul>
      ) : null}

      {presentation.actionLabel ? (
        <button
          type="button"
          className="tour-release-action"
          data-panel-entry="release"
          onClick={() => activateReleaseAction(controller, presentation.action)}
        >
          <Rocket size={15} strokeWidth={2.2} aria-hidden="true" />
          {presentation.actionLabel}
        </button>
      ) : null}
    </section>
  );
}

function activateReleaseAction(
  controller: LocalAuthoringFrameController,
  action: AuthoringReleaseAction,
): void {
  if (action === 'publish-staging' || action === 'retry') {
    controller.publishCurrentTourToStaging();
    return;
  }
  if (action === 'verify-staging') {
    controller.verifyCurrentStagingArtifact();
    return;
  }
  if (
    action === 'promote-production' ||
    action === 'request-approval' ||
    action === 'approve-production'
  ) {
    controller.openPromotionConfirmation();
    return;
  }
  if (action === 'review-blockers') controller.openReleaseVerificationMode();
}

function releaseStatusIcon(tone: ReturnType<typeof deriveAuthoringReleasePresentation>['tone']) {
  if (tone === 'busy') {
    return <LoaderCircle className="tour-release-spinner" size={16} strokeWidth={2.2} />;
  }
  if (tone === 'success') return <Check size={16} strokeWidth={2.5} />;
  if (tone === 'warning' || tone === 'danger') {
    return <CircleAlert size={16} strokeWidth={2.2} />;
  }
  return <Rocket size={16} strokeWidth={2.2} />;
}

function deduplicateFindings(findings: LocalAuthoringFrameSnapshot['release']['findings']) {
  const unique = new Map<string, (typeof findings)[number]>();
  for (const finding of findings) {
    unique.set(`${finding.severity}:${finding.code}`, finding);
  }
  return [...unique.values()];
}
