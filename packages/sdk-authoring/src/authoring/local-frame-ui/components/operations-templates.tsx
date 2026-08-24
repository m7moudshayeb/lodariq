import type { ReactNode } from 'react';
import { CANONICAL_DOCUMENT_TEMPLATES, type CanonicalDocumentTemplate } from '@lodariq/schema';
import { productCapabilityIsImplemented } from '@lodariq/schema/product-capabilities-runtime';
import { authoringText } from '../../../i18n';
import { Bell, Check, Rocket, Star } from '../design-system';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
const TEMPLATE_APPLICATION_AVAILABLE = productCapabilityIsImplemented('authoring.templates');

const TEMPLATE_ICONS: Record<CanonicalDocumentTemplate['id'], ReactNode> = {
  'activation-checklist': <Check size={15} strokeWidth={2} aria-hidden="true" />,
  'feature-announcement': <Bell size={15} strokeWidth={2} aria-hidden="true" />,
  'guided-tour': <Rocket size={15} strokeWidth={2} aria-hidden="true" />,
  'milestone-survey': <Star size={15} strokeWidth={2} aria-hidden="true" />,
};

export function OperationsTemplates({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}): ReactNode {
  return (
    <section className="operations-templates" aria-label={authoringText('Templates')}>
      {/* The section's opening line is the sheet header's, not a second copy. */}
      <div className="ops-cols" data-cols="3">
        {CANONICAL_DOCUMENT_TEMPLATES.map((template) => {
          return (
            <article key={template.id} className="ops-box">
              <h3>
                <span aria-hidden="true">{TEMPLATE_ICONS[template.id]}</span>
                {template.title}
              </h3>
              <p className="ops-box-body">{template.description}</p>
              <div className="ops-row">
                <span className="ops-tag">
                  {authoringText(
                    template.stepTitles.length === 1 ? '{count} step' : '{count} steps',
                    {
                      count: template.stepTitles.length,
                    },
                  )}
                </span>
                {template.targetProposals.length ? (
                  <span className="ops-tag">
                    {authoringText(
                      template.targetProposals.length === 1
                        ? '{count} target proposal'
                        : '{count} target proposals',
                      {
                        count: template.targetProposals.length,
                      },
                    )}
                  </span>
                ) : (
                  <span className="ops-tag">{authoringText('No target proposals')}</span>
                )}
                <span className="ops-spacer" />
                <button
                  className="ops-btn"
                  data-size="sm"
                  disabled={!TEMPLATE_APPLICATION_AVAILABLE}
                  onClick={() => controller.applyStarterTemplate(template.id)}
                  title={
                    TEMPLATE_APPLICATION_AVAILABLE
                      ? undefined
                      : authoringText('Template draft creation is not enabled in this build.')
                  }
                  type="button"
                >
                  {authoringText('Use')}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {snapshot.templateInstantiation ? (
        <div className="ops-callout" data-tone="success" role="status">
          <strong>{snapshot.templateInstantiation.title}</strong>
          <p>
            {authoringText('Created as document {documentId}. The open document was not changed.', {
              documentId: snapshot.templateInstantiation.documentId,
            })}
          </p>
          {snapshot.templateInstantiation.targetProposals.length ? (
            <p>
              {authoringText('Review target proposals: {targets}', {
                targets: snapshot.templateInstantiation.targetProposals
                  .map((target) => `${target.role}: ${target.accessibleName}`)
                  .join(', '),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="ops-callout" data-tone="info">
        {authoringText(
          'Templates create separate drafts with fresh document and block identities. Suggested targets stay unbound until a creator reviews them against real semantic evidence.',
        )}
      </p>
    </section>
  );
}
