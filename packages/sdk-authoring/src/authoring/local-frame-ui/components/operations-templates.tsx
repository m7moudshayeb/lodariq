import type { ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import { Bell, Check, Layers, Mic, Rocket, Star } from '../design-system';
import type { LocalAuthoringFrameController } from '../controller';

interface StarterTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** How much work this is about to create — the first thing anyone asks. */
  readonly steps: number;
  readonly targets: readonly string[];
  readonly icon: ReactNode;
}

/**
 * WIRE_IFRAME: applying a starter must ask the host resolver for semantic target
 * matches, then return unmatched targets to the picker. The frame currently has
 * neither bridge operation, so the catalogue is reference-only for now.
 */
const TEMPLATE_APPLICATION_AVAILABLE = false;

/**
 * Proven starting points (wishlist 4.2). The strong version is templates that
 * target semantically on arrival: each one names the controls it expects, and
 * the host page is asked whether they exist before anything is created — so a
 * creator sees what will bind and what will not, rather than fixing placeholders.
 */
const TEMPLATES: readonly StarterTemplate[] = [
  {
    id: 'activation-checklist',
    name: authoringText('Activation checklist'),
    description: authoringText('Four things to do in week one, as a dismissible drawer.'),
    steps: 4,
    targets: ['Create project', 'Import', 'Invite people', 'Choose a plan'],
    icon: <Check size={15} strokeWidth={2} aria-hidden="true" />,
  },
  {
    id: 'feature-announcement',
    name: authoringText('Feature announcement'),
    description: authoringText('One modal, one call to action, shown once.'),
    steps: 1,
    targets: ['New report'],
    icon: <Bell size={15} strokeWidth={2} aria-hidden="true" />,
  },
  {
    id: 'empty-state-nudge',
    name: authoringText('Empty-state nudge'),
    description: authoringText('Fires only when a list is empty, pointing at the primary action.'),
    steps: 2,
    targets: ['No archived projects', 'Learn about archiving'],
    icon: <Layers size={15} strokeWidth={2} aria-hidden="true" />,
  },
  {
    id: 'nps-milestone',
    name: authoringText('Survey at a milestone'),
    description: authoringText('One question after the third project is completed.'),
    steps: 1,
    targets: [],
    icon: <Star size={15} strokeWidth={2} aria-hidden="true" />,
  },
  {
    id: 'power-user-tour',
    name: authoringText('Power-user tour'),
    description: authoringText('Six steps for people who already came back twice.'),
    steps: 6,
    targets: ['Filter', 'Segment by', 'Compare', 'Export CSV', 'Schedule report', 'Save report'],
    icon: <Rocket size={15} strokeWidth={2} aria-hidden="true" />,
  },
  {
    id: 'narrated-demo',
    name: authoringText('Narrated product demo'),
    description: authoringText('The same content, playing itself with narration and zoom.'),
    steps: 5,
    targets: [],
    icon: <Mic size={15} strokeWidth={2} aria-hidden="true" />,
  },
];

export function OperationsTemplates({
  controller,
}: {
  controller: LocalAuthoringFrameController;
}): ReactNode {
  return (
    <section className="operations-templates" aria-label={authoringText('Templates')}>
      {/* The section's opening line is the sheet header's, not a second copy. */}
      <div className="ops-cols" data-cols="3">
        {TEMPLATES.map((template) => {
          const found = template.targets.filter((name) => hostHasControlNamed(name));
          const complete = template.targets.length > 0 && found.length === template.targets.length;
          return (
            <article key={template.id} className="ops-box">
              <h3>
                <span aria-hidden="true">{template.icon}</span>
                {template.name}
              </h3>
              <p className="ops-box-body">{template.description}</p>
              <div className="ops-row">
                <span className="ops-tag">
                  {authoringText(template.steps === 1 ? '{count} step' : '{count} steps', {
                    count: template.steps,
                  })}
                </span>
                {/*
                  How much of this template your page can actually take, before
                  you commit to it. A count rather than a colour: "0/4" is the
                  message, and the tone only underlines it.
                */}
                {template.targets.length ? (
                  <span className="ops-tag" data-tone={complete ? 'ok' : 'warning'}>
                    {authoringText('{found}/{total} targets found here', {
                      found: found.length,
                      total: template.targets.length,
                    })}
                  </span>
                ) : (
                  <span className="ops-tag">{authoringText('No targets')}</span>
                )}
                <span className="ops-spacer" />
                <button
                  className="ops-btn"
                  data-size="sm"
                  disabled={!TEMPLATE_APPLICATION_AVAILABLE}
                  onClick={() => controller.applyStarterTemplate(template.id, template.targets)}
                  title={
                    TEMPLATE_APPLICATION_AVAILABLE
                      ? undefined
                      : authoringText('Template application is waiting for host-page target discovery.')
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
      {/*
        What "proposes the targets" actually means, under the cards rather than
        above them: it answers the question the counts have just raised.
      */}
      <p className="ops-callout" data-tone="info">
        {authoringText(
          'Auto-targeting reads accessible names and roles on the current page. Anything it cannot find is created as a draft step with the picker already armed.',
        )}
      </p>
    </section>
  );
}

/**
 * WIRE_IFRAME: asks the host page whether a control with this accessible name exists. The
 * authoring frame cannot reach the host DOM directly (ADR-0015), so the answer
 * comes from the snapshot the bridge already publishes.
 */
function hostHasControlNamed(name: string): boolean {
  const names = (globalThis as { __lodariqHostControlNames?: readonly string[] })
    .__lodariqHostControlNames;
  return Array.isArray(names) ? names.includes(name) : false;
}
