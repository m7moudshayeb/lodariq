import { authoringText } from '../../../i18n';
import { validateTourPublishReadiness } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringButton, AuthoringTabs, ChevronDown, Eye, FileJson, Save } from '../design-system';
import { publishIssueKey } from '../publish-issue-repair';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { PublishIssueAction } from './publish-issue-action';

export function Inspector({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const issues = validateTourPublishReadiness(snapshot.documentState, {
    targetDiagnostics: snapshot.targetDiagnostics,
    requireVerifiedTargets: true,
  });
  const previewReady = snapshot.compiledText !== '';
  const reviewTitle = reviewTitleForIssueCount(issues.length);
  const reviewDetail = reviewDetailForState(issues.length, previewReady);
  const reviewStatus = reviewStatusForIssueCount(issues.length);
  return (
    <aside className="inspector document-review" aria-label={authoringText('Review and preview')}>
      <details className="review-drawer">
        <summary aria-label={authoringText('Review and preview details')}>
          <div className="review-summary-copy">
            <strong>{reviewTitle}</strong>
            <span>{reviewDetail}</span>
          </div>
          <span className="review-summary-end">
            <span className={`review-status ${reviewStatus.className}`}>{reviewStatus.label}</span>
            <ChevronDown
              className="review-summary-chevron"
              size={18}
              strokeWidth={2.1}
              aria-hidden="true"
            />
          </span>
        </summary>

        <div className="review-panel">
          <section className="preview-workbench" aria-label={authoringText('Preview workflow')}>
            <div className="preview-copy">
              <strong>{authoringText('Preview in the product')}</strong>
              <span>
                {previewReady
                  ? authoringText('Latest preview is ready')
                  : authoringText('Test the real placement and behavior before release')}
              </span>
            </div>
            <div className="preview-actions">
              <AuthoringButton
                aria-label={authoringText('Preview this step')}
                data-action="preview-current"
                icon={<Eye size={14} strokeWidth={2.2} />}
                onClick={() => controller.previewCurrentStep()}
                tone="primary"
              >
                {authoringText('Preview step')}
              </AuthoringButton>
              <AuthoringButton
                aria-label={authoringText('Preview full tour')}
                data-action="preview-full"
                icon={<Eye size={14} strokeWidth={2.2} />}
                onClick={() => controller.previewFullTour()}
              >
                {authoringText('Preview tour')}
              </AuthoringButton>
              <AuthoringButton
                aria-label={authoringText('Save draft')}
                data-action="save"
                icon={<Save size={14} strokeWidth={2.2} />}
                onClick={() => controller.saveCurrentDocument()}
              >
                {authoringText('Save draft')}
              </AuthoringButton>
            </div>
          </section>

          {issues.length === 0 ? null : (
            <section className="issue-panel" aria-label={authoringText('Tour issues')}>
              <div className="preview-copy">
                <strong>{authoringText('Fix before release')}</strong>
                <span>
                  {issues.length} {authoringText('item')}
                  {issues.length === 1 ? '' : 's'} {authoringText('need attention')}
                </span>
              </div>
              <ul>
                {issues.slice(0, 5).map((issue) => (
                  <li className="publish-issue-row" key={publishIssueKey(issue)}>
                    <PublishIssueAction controller={controller} issue={issue} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <details className="utilities-drawer">
            <summary>
              <span>{authoringText('Support package')}</span>
              <small>{authoringText('Advanced recovery')}</small>
            </summary>
            <AuthoringTabs
              defaultValue="preview-details"
              items={[
                {
                  label: authoringText('Preview package'),
                  value: 'preview-details',
                  content: (
                    <section
                      className="utility-panel preview-utility"
                      aria-label={authoringText('Preview package')}
                    >
                      <div className="preview-copy">
                        <strong>{authoringText('Preview package')}</strong>
                        <span>
                          {snapshot.compiledText
                            ? authoringText('Latest preview package is ready')
                            : authoringText('Preview the tour before updating the package')}
                        </span>
                      </div>
                      <AuthoringButton
                        data-action="compile"
                        icon={<Eye size={14} strokeWidth={2.2} />}
                        onClick={() => controller.compilePreview()}
                      >
                        {authoringText('Update package')}
                      </AuthoringButton>
                      {snapshot.compiledText ? (
                        <pre
                          className="compiled-output"
                          aria-label={authoringText('Preview package')}
                        >
                          {snapshot.compiledText}
                        </pre>
                      ) : null}
                    </section>
                  ),
                },
                {
                  label: authoringText('Restore backup'),
                  value: 'json',
                  content: (
                    <section
                      className="utility-panel debug"
                      aria-label={authoringText('Restore backup')}
                    >
                      <textarea
                        aria-label={authoringText('Editable backup')}
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
                          {authoringText('Restore backup')}
                        </AuthoringButton>
                        <AuthoringButton
                          data-action="export"
                          icon={<Save size={14} strokeWidth={2.2} />}
                          onClick={() => controller.exportJson()}
                        >
                          {authoringText('Copy backup')}
                        </AuthoringButton>
                      </div>
                    </section>
                  ),
                },
                {
                  label: authoringText('Activity report'),
                  value: 'metrics',
                  content: (
                    <section
                      className="utility-panel metrics"
                      aria-label={authoringText('Activity report')}
                    >
                      <AuthoringButton
                        data-action="export-metrics"
                        icon={<FileJson size={14} strokeWidth={2.2} />}
                        onClick={() => controller.exportMetrics()}
                      >
                        {authoringText('Create activity report')}
                      </AuthoringButton>
                      {snapshot.metricsText && snapshot.metricsText !== '{}' ? (
                        <pre
                          className="metrics-output"
                          aria-label={authoringText('Activity report')}
                        >
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
  if (issueCount === 0) return authoringText('Ready to preview');
  return authoringText('{count} to fix before release', { count: issueCount });
}

function reviewDetailForState(issueCount: number, previewReady: boolean): string {
  if (issueCount > 0) return authoringText('Draft stays saved while you fix them');
  if (previewReady) return authoringText('Preview is ready');
  return authoringText('Test this tour in the product');
}

function reviewStatusForIssueCount(issueCount: number): { className: string; label: string } {
  if (issueCount === 0) return { className: 'ready', label: authoringText('Ready') };
  return { className: 'needs-work', label: authoringText('Needs review') };
}
