import type { TalmehBlock } from '@talmeh/schema';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringButton, AuthoringTabs, Braces, Eye, FileJson, Save } from '../design-system';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { blockDisplayTitle, blockKicker, targetIdOf } from '../utils';

export function Inspector({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const issues = documentIssues(snapshot.documentState.blocks);
  return (
    <aside className="inspector document-utilities" aria-label="Authoring utilities">
      <section className="preview-workbench" aria-label="Preview workflow">
        <div className="preview-copy">
          <span className="eyebrow">Preview</span>
          <strong>Try the tour</strong>
          <span>{snapshot.compiledText ? 'Preview ready' : 'Preview has not run yet'}</span>
        </div>
        <AuthoringButton
          data-action="preview-current"
          icon={<Eye size={14} strokeWidth={2.2} />}
          onClick={() => controller.previewCurrentStep()}
          tone="primary"
        >
          Preview current step
        </AuthoringButton>
        <AuthoringButton
          data-action="preview-full"
          icon={<Eye size={14} strokeWidth={2.2} />}
          onClick={() => controller.previewFullTour()}
        >
          Preview full tour
        </AuthoringButton>
        <AuthoringButton
          data-action="save"
          icon={<Save size={14} strokeWidth={2.2} />}
          onClick={() => controller.saveCurrentDocument()}
        >
          Save state
        </AuthoringButton>
        <div className="preview-state" aria-label="Preview status">
          {snapshot.compiledText ? 'Ready' : 'Needs preview'}
        </div>
      </section>

      <section className="issue-panel" aria-label="Tour issues">
        <div className="preview-copy">
          <span className="eyebrow">Issues</span>
          <strong>{issues.length === 0 ? 'No issues found' : `${issues.length} to finish`}</strong>
        </div>
        {issues.length === 0 ? (
          <p>Ready when you are.</p>
        ) : (
          <ul>
            {issues.slice(0, 5).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
      </section>

      <details className="utilities-drawer">
        <summary>
          <span>Developer tools</span>
          <small>JSON, payload, metrics</small>
        </summary>
        <AuthoringTabs
          defaultValue="preview"
          items={[
            {
              label: 'Preview',
              value: 'preview',
              content: (
                <section className="utility-panel preview-utility" aria-label="Preview actions">
                  <div className="preview-copy">
                    <strong>Compiled payload</strong>
                    <span>
                      {snapshot.compiledText
                        ? 'Developer payload generated from the current document'
                        : 'Prepare the preview to inspect the generated payload'}
                    </span>
                  </div>
                  <AuthoringButton
                    data-action="compile"
                    icon={<Braces size={14} strokeWidth={2.2} />}
                    onClick={() => controller.compilePreview()}
                  >
                    Refresh payload
                  </AuthoringButton>
                  <pre className="compiled-output" aria-label="Compiled preview">
                    {snapshot.compiledText}
                  </pre>
                </section>
              ),
            },
            {
              label: 'JSON',
              value: 'json',
              content: (
                <section className="utility-panel debug" aria-label="Local document JSON">
                  <textarea
                    aria-label="Document JSON"
                    value={snapshot.jsonText}
                    onInput={(event) => controller.setJsonText(event.currentTarget.value)}
                  />
                  <div className="panel-actions">
                    <AuthoringButton
                      data-action="import"
                      icon={<FileJson size={14} strokeWidth={2.2} />}
                      onClick={() => controller.importJson()}
                    >
                      Import
                    </AuthoringButton>
                    <AuthoringButton
                      data-action="export"
                      icon={<Save size={14} strokeWidth={2.2} />}
                      onClick={() => controller.exportJson()}
                    >
                      Export
                    </AuthoringButton>
                  </div>
                </section>
              ),
            },
            {
              label: 'Metrics',
              value: 'metrics',
              content: (
                <section className="utility-panel metrics" aria-label="Local usability metrics">
                  <AuthoringButton
                    data-action="export-metrics"
                    icon={<FileJson size={14} strokeWidth={2.2} />}
                    onClick={() => controller.exportMetrics()}
                  >
                    Export metrics
                  </AuthoringButton>
                  <pre className="metrics-output" aria-label="Local metrics">
                    {snapshot.metricsText}
                  </pre>
                </section>
              ),
            },
          ]}
        />
      </details>
    </aside>
  );
}

function documentIssues(blocks: TalmehBlock[]): string[] {
  return blocks.flatMap((block) => blockIssues(block));
}

function blockIssues(block: TalmehBlock): string[] {
  const issues: string[] = [];
  if (block.type === 'tourStep' && !targetIdOf(block)) {
    issues.push(`${blockKicker(block)} needs a target.`);
  }
  if (block.type === 'button' && !block.props.action) {
    const label = block.content?.trim() || 'CTA';
    issues.push(`Button "${label}" needs a purpose.`);
  }
  if (block.type === 'media') {
    issues.push(`${blockDisplayTitle(block)} is a placeholder.`);
  }
  return [...issues, ...block.children.flatMap((child) => blockIssues(child))];
}
