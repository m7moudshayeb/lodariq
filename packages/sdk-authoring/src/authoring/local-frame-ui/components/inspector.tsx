import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringButton, AuthoringTabs, Braces, Eye, FileJson, Save } from '../design-system';
import type { LocalAuthoringFrameSnapshot } from '../types';

export function Inspector({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  return (
    <aside className="inspector document-utilities" aria-label="Authoring utilities">
      <section className="preview-workbench" aria-label="Preview workflow">
        <div className="preview-copy">
          <span className="eyebrow">Preview</span>
          <strong>Run the current tour</strong>
          <span>
            {snapshot.compiledText
              ? 'Preview is prepared from the latest document.'
              : 'Prepare a test preview when you want to try the tour.'}
          </span>
        </div>
        <AuthoringButton
          data-action="compile"
          icon={<Eye size={14} strokeWidth={2.2} />}
          onClick={() => controller.compilePreview()}
          tone="primary"
        >
          Prepare preview
        </AuthoringButton>
        <div className="preview-state" aria-label="Preview status">
          {snapshot.compiledText ? 'Ready to test' : 'Not prepared yet'}
        </div>
      </section>

      <details className="utilities-drawer">
        <summary>
          <span>Developer tools</span>
          <small>Payload, JSON, metrics</small>
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
