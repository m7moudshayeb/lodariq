import { validateTourPublishReadiness, type PublishReadinessIssue } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringButton, AuthoringTabs, Eye, FileJson, Save } from '../design-system';
import type { LocalAuthoringFrameSnapshot } from '../types';

export function Inspector({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const issues = validateTourPublishReadiness(snapshot.documentState, {
    targetDiagnostics: snapshot.targetDiagnostics,
  });
  const previewReady = snapshot.compiledText !== '';
  const reviewTitle = reviewTitleForIssueCount(issues.length);
  const reviewDetail = reviewDetailForState(issues.length, previewReady);
  const reviewStatus = reviewStatusForIssueCount(issues.length);
  return (
    <aside className="inspector document-review" aria-label="Review and preview">
      <details className="review-drawer">
        <summary>
          <div className="review-summary-copy">
            <strong>{reviewTitle}</strong>
            <span>{reviewDetail}</span>
          </div>
          <span className={`review-status ${reviewStatus.className}`}>
            {reviewStatus.label}
          </span>
        </summary>

        <div className="review-panel">
          <section className="preview-workbench" aria-label="Preview workflow">
            <div className="preview-copy">
              <strong>Test before publishing</strong>
              <span>
                {previewReady
                  ? 'Latest preview is ready'
                  : 'Try the experience on this page before publishing'}
              </span>
            </div>
            <div className="preview-actions">
              <AuthoringButton
                aria-label="Preview this step"
                data-action="preview-current"
                icon={<Eye size={14} strokeWidth={2.2} />}
                onClick={() => controller.previewCurrentStep()}
                tone="primary"
              >
                Preview step
              </AuthoringButton>
              <AuthoringButton
                aria-label="Preview full tour"
                data-action="preview-full"
                icon={<Eye size={14} strokeWidth={2.2} />}
                onClick={() => controller.previewFullTour()}
              >
                Preview tour
              </AuthoringButton>
              <AuthoringButton
                aria-label="Save draft"
                data-action="save"
                icon={<Save size={14} strokeWidth={2.2} />}
                onClick={() => controller.saveCurrentDocument()}
              >
                Save draft
              </AuthoringButton>
            </div>
          </section>

          {issues.length === 0 ? null : (
            <section className="issue-panel" aria-label="Tour issues">
              <div className="preview-copy">
                <strong>Finish these first</strong>
                <span>{issues.length} item{issues.length === 1 ? '' : 's'} need attention</span>
              </div>
              <ul>
                {issues.slice(0, 5).map((issue) => (
                  <li key={issueKey(issue)}>{issue.message}</li>
                ))}
              </ul>
            </section>
          )}

          <details className="utilities-drawer">
            <summary>
              <span>Support package</span>
              <small>Advanced recovery</small>
            </summary>
            <AuthoringTabs
              defaultValue="preview-details"
              items={[
                {
                  label: 'Preview package',
                  value: 'preview-details',
                  content: (
                    <section
                      className="utility-panel preview-utility"
                      aria-label="Preview package"
                    >
                      <div className="preview-copy">
                        <strong>Preview package</strong>
                        <span>
                          {snapshot.compiledText
                            ? 'Latest preview package is ready'
                            : 'Preview the tour before updating the package'}
                        </span>
                      </div>
                      <AuthoringButton
                        data-action="compile"
                        icon={<Eye size={14} strokeWidth={2.2} />}
                        onClick={() => controller.compilePreview()}
                      >
                        Update package
                      </AuthoringButton>
                      {snapshot.compiledText ? (
                        <pre className="compiled-output" aria-label="Preview package">
                          {snapshot.compiledText}
                        </pre>
                      ) : null}
                    </section>
                  ),
                },
                {
                  label: 'Restore backup',
                  value: 'json',
                  content: (
                    <section className="utility-panel debug" aria-label="Restore backup">
                      <textarea
                        aria-label="Editable backup"
                        data-action="edit-draft-backup"
                        value={snapshot.jsonText}
                        onInput={(event) => controller.setJsonText(event.currentTarget.value)}
                      />
                      <div className="panel-actions">
                        <AuthoringButton
                          data-action="import"
                          icon={<FileJson size={14} strokeWidth={2.2} />}
                          onClick={() => controller.importJson()}
                        >
                          Restore backup
                        </AuthoringButton>
                        <AuthoringButton
                          data-action="export"
                          icon={<Save size={14} strokeWidth={2.2} />}
                          onClick={() => controller.exportJson()}
                        >
                          Copy backup
                        </AuthoringButton>
                      </div>
                    </section>
                  ),
                },
                {
                  label: 'Activity report',
                  value: 'metrics',
                  content: (
                    <section className="utility-panel metrics" aria-label="Activity report">
                      <AuthoringButton
                        data-action="export-metrics"
                        icon={<FileJson size={14} strokeWidth={2.2} />}
                        onClick={() => controller.exportMetrics()}
                      >
                        Create activity report
                      </AuthoringButton>
                      {snapshot.metricsText && snapshot.metricsText !== '{}' ? (
                        <pre className="metrics-output" aria-label="Activity report">
                          {snapshot.metricsText}
                        </pre>
                      ) : null}
                    </section>
                  ),
                },
              ]}
            />
          </details>
        </div>
      </details>
    </aside>
  );
}

function reviewTitleForIssueCount(issueCount: number): string {
  if (issueCount === 0) return 'Ready to publish';
  return `${issueCount} to finish`;
}

function reviewDetailForState(issueCount: number, previewReady: boolean): string {
  if (issueCount > 0) return 'Complete these items first';
  if (previewReady) return 'Preview is ready';
  return 'Preview before publishing';
}

function reviewStatusForIssueCount(issueCount: number): { className: string; label: string } {
  if (issueCount === 0) return { className: 'ready', label: 'Ready' };
  return { className: 'needs-work', label: 'Needs review' };
}

function issueKey(issue: PublishReadinessIssue): string {
  return [issue.code, issue.blockId, issue.targetId, issue.message].filter(Boolean).join(':');
}
