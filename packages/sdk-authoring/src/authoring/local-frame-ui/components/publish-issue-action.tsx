import { publishReadinessIssueLabel, type PublishReadinessIssue } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import { ChevronRight, CircleAlert } from '../design-system';
import { publishIssueRepairIntent } from '../publish-issue-repair';

export function PublishIssueAction({
  controller,
  issue,
}: {
  controller: LocalAuthoringFrameController;
  issue: PublishReadinessIssue;
}) {
  const intent = publishIssueRepairIntent(issue);
  const issueLabel = publishReadinessIssueLabel(issue.code);
  return (
    <button
      type="button"
      className="publish-issue-action"
      aria-label={`${intent.actionLabel}: ${issueLabel}. ${issue.message}`}
      data-publish-issue-code={issue.code}
      onClick={() => controller.repairPublishIssue(issue)}
    >
      <CircleAlert size={14} strokeWidth={2.1} aria-hidden="true" />
      <span className="publish-issue-copy">
        <strong>{issueLabel}</strong>
        <small>{issue.message}</small>
      </span>
      <span className="publish-issue-cta">{intent.actionLabel}</span>
      <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}
