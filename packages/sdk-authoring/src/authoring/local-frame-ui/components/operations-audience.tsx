import type { AudienceRule, LodariqBlock } from '@lodariq/schema';
import type { ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import {
  AuthoringSelect,
  Bot,
  Calendar,
  Globe,
  SlidersHorizontal,
  User,
  Zap,
} from '../design-system';
import { blockDisplayTitle } from '../utils';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

/**
 * WIRE_RUNTIME: the control plane can store the adaptive policy and the compiler
 * can stamp `teaches`, but the published runtime does not yet use behavioural
 * evidence to omit a step. Keep the prototype surface visible, but do not let it
 * claim that enabling the policy changes delivery until that path exists.
 */
const ADAPTIVE_DELIVERY_AVAILABLE = false;
const ADAPTIVE_DELIVERY_UNAVAILABLE_COPY = authoringText(
  'Adaptive delivery is not available yet. Step outcomes can still be declared for future delivery rules.',
);

/**
 * WIRE_BE: who sees this and when it starts are document properties this frame
 * can read but not write — there is no bridge message for either, and both are
 * publish-time state the control plane owns. They are shown with their real
 * values and their edit controls disabled, rather than left off the page: a
 * creator who cannot see the segment cannot tell whether one exists.
 */
const AUDIENCE_EDITING_AVAILABLE = false;
const AUDIENCE_EDITING_REASON = authoringText('Editing who sees this is not available here yet.');

/**
 * Who sees this, when it starts, and how often — plus the two policies that
 * shorten it for the people who need less of it (adaptive) and carry it into a
 * second application (hand-off). Everything here is publish-time; editing it
 * never touches a live artifact.
 */
export function OperationsAudience({
  controller,
  snapshot,
  steps,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  steps: readonly LodariqBlock[];
}): ReactNode {
  const applications = snapshot.applications ?? [];
  const events = snapshot.knownEventNames ?? [];
  const demonstrated = snapshot.demonstratedBehaviours ?? [];
  const adaptiveOn = snapshot.adaptivePolicy?.enabled ?? false;
  const rules = snapshot.documentState.audience?.rules ?? [];
  const environments = snapshot.documentState.audience?.environments ?? [];

  const visible = steps.filter(
    (step) => !(adaptiveOn && step.props.teaches && demonstrated.includes(step.props.teaches)),
  );

  return (
    <section className="operations-audience" aria-label={authoringText('Audience and triggers')}>
      {/* The section's opening line is the sheet header's, not a second copy. */}
      <div className="ops-cols" data-cols="2">
        <div className="ops-box">
          <h3>
            <SlidersHorizontal size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Who sees this')}
            <span className="ops-box-actions">
              <span className="ops-tag">
                {rules.length === 0
                  ? authoringText('Everyone')
                  : authoringText('All must be true')}
              </span>
            </span>
          </h3>
          {rules.length === 0 ? (
            <p className="ops-box-body">
              {authoringText('No rules, so everyone who reaches the trigger sees this.')}
            </p>
          ) : (
            <ol className="ops-list operations-audience-rules">
              {rules.map((rule, index) => (
                <li key={`${rule.key}-${index}`}>
                  <span>
                    <span className="operations-audience-rule-index">{index + 1}</span>
                    {audienceRuleLabel(rule)}
                  </span>
                  <span className="ops-tag">{sourceLabel(rule.source)}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="ops-row operations-audience-footer">
            <button
              className="ops-btn"
              data-size="sm"
              disabled={!AUDIENCE_EDITING_AVAILABLE}
              title={AUDIENCE_EDITING_REASON}
              type="button"
            >
              {authoringText('Add a rule')}
            </button>
          </div>
        </div>

        <div className="ops-box">
          <h3>
            <Calendar size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('When it starts')}
          </h3>
          <dl className="ops-kv">
            <dt>{authoringText('Starts')}</dt>
            <dd>{triggerLabel(snapshot)}</dd>
            <dt>{authoringText('Waits')}</dt>
            <dd>{triggerDelayLabel(snapshot)}</dd>
            <dt>{authoringText('Where it runs')}</dt>
            <dd>
              {environments.length
                ? environments.join(', ')
                : authoringText('Not published anywhere yet')}
            </dd>
          </dl>
          <div className="ops-row operations-audience-footer">
            <button
              className="ops-btn"
              data-size="sm"
              disabled={!AUDIENCE_EDITING_AVAILABLE}
              title={AUDIENCE_EDITING_REASON}
              type="button"
            >
              {authoringText('Edit when it starts')}
            </button>
          </div>
        </div>
      </div>

      <div className="ops-box">
        <h3>
          <Bot size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('Shorter tours for people who need less')}
          <span className="ops-box-actions">
            <span className="ops-tag" data-tone={adaptiveOn ? 'ok' : undefined}>
              {adaptiveOn ? authoringText('On') : authoringText('Off')}
            </span>
            <button
              className="ops-btn"
              data-size="sm"
              disabled={!ADAPTIVE_DELIVERY_AVAILABLE}
              onClick={() => controller.setAdaptiveEnabled(!adaptiveOn)}
              title={ADAPTIVE_DELIVERY_AVAILABLE ? undefined : ADAPTIVE_DELIVERY_UNAVAILABLE_COPY}
              type="button"
            >
              {adaptiveOn ? authoringText('Turn off') : authoringText('Turn on')}
            </button>
          </span>
        </h3>
        <p className="ops-box-body">
          {authoringText(
            'Long tours fail because they explain what people already know. A step that declares what it teaches is skipped once telemetry proves the behaviour.',
          )}
        </p>
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">{authoringText('Step')}</th>
              <th scope="col">{authoringText('Teaches')}</th>
              <th scope="col">{authoringText('Already done it?')}</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step, index) => {
              const teaches = step.props.teaches;
              const known = Boolean(teaches && demonstrated.includes(teaches));
              return (
                <tr key={step.id} data-skipped={adaptiveOn && known ? 'true' : 'false'}>
                  <td className="ops-table-key">
                    {index + 1}. {blockDisplayTitle(step)}
                  </td>
                  <td>
                    <AuthoringSelect
                      ariaLabel={authoringText('What this step teaches')}
                      onValueChange={(value) =>
                        controller.setStepTeaches(step.id, value || undefined)
                      }
                      options={[
                        { value: '', label: authoringText('Nothing measurable') },
                        ...events.map((name) => ({ value: name, label: name })),
                      ]}
                      value={teaches ?? ''}
                    />
                  </td>
                  <td>
                    {known ? (
                      <span className="ops-tag" data-tone="ok">
                        {authoringText('Yes')}
                      </span>
                    ) : (
                      <span className="operations-audience-none">{authoringText('No')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {steps.length === 0 ? (
              <tr>
                <td colSpan={3}>{authoringText('Add a step from the filmstrip')}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <p
          className="ops-callout"
          data-tone={ADAPTIVE_DELIVERY_AVAILABLE && adaptiveOn ? 'ok' : 'info'}
          role="status"
        >
          {!ADAPTIVE_DELIVERY_AVAILABLE
            ? ADAPTIVE_DELIVERY_UNAVAILABLE_COPY
            : adaptiveOn
              ? authoringText('This visitor would see {shown} of {total} steps.', {
                  shown: visible.length,
                  total: steps.length,
                })
              : authoringText('Everyone sees every step.')}
        </p>
      </div>

      <div className="ops-box">
        <h3>
          <Globe size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('One tour across two products')}
          <span className="ops-box-actions">
            <span className="ops-tag">
              {authoringText(
                applications.length === 1 ? '{count} application' : '{count} applications',
                { count: applications.length },
              )}
            </span>
          </span>
        </h3>
        <p className="ops-box-body">
          {authoringText(
            'One experience across two applications. An application is one brand theme plus one content library — not a hostname.',
          )}
        </p>
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">{authoringText('Application')}</th>
              <th scope="col">{authoringText('Addresses')}</th>
              <th scope="col">{authoringText('Continues after')}</th>
            </tr>
          </thead>
          <tbody>
            {applications.length ? (
              applications.map((application) => {
                const handoffs = steps.filter(
                  (step) => step.props.handoff?.applicationId === application.id,
                );
                return (
                  <tr key={application.id}>
                    <td className="ops-table-key">{application.name}</td>
                    <td className="operations-audience-origins">
                      {application.originPatterns.join(', ')}
                    </td>
                    <td>
                      {handoffs.length ? (
                        handoffs.map((step) => (
                          <span className="ops-tag" data-tone="ok" key={step.id}>
                            {blockDisplayTitle(step)}
                          </span>
                        ))
                      ) : (
                        <span className="operations-audience-none">{authoringText('—')}</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={3}>{authoringText('This workspace has one application.')}</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="ops-box-body operations-audience-hint">
          {authoringText(
            'Progress travels with the identified visitor, so the second application resumes where the first stopped.',
          )}
        </p>
      </div>

      <div className="ops-cols" data-cols="2">
        {/* Both read from what the document and the workspace already know, so
            they answer "what can I even write a rule about?" without a round
            trip to whoever installed the SDK. */}
        <div className="ops-box">
          <h3>
            <User size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('What you know about your visitors')}
          </h3>
          <table className="ops-table">
            <thead>
              <tr>
                <th scope="col">{authoringText('Detail')}</th>
                <th scope="col">{authoringText('Used by')}</th>
              </tr>
            </thead>
            <tbody>
              {identifyKeys(rules).map((entry) => (
                <tr key={entry.key}>
                  <td className="ops-table-key">{entry.key}</td>
                  <td>
                    <span className="ops-tag" data-tone="accent">
                      {authoringText(entry.uses === 1 ? '{count} rule' : '{count} rules', {
                        count: entry.uses,
                      })}
                    </span>
                  </td>
                </tr>
              ))}
              {identifyKeys(rules).length === 0 ? (
                <tr>
                  <td colSpan={2}>
                    {authoringText('Nothing yet. Your product sends these when someone signs in.')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="ops-box-body operations-audience-hint">
            {authoringText('Sent by your product. Lodariq never guesses them.')}
          </p>
        </div>

        <div className="ops-box">
          <h3>
            <Zap size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Things your product can tell us happened')}
          </h3>
          <table className="ops-table">
            <thead>
              <tr>
                <th scope="col">{authoringText('Event')}</th>
                <th scope="col">{authoringText('Used by')}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((name) => {
                const uses = eventUses(name, rules, steps);
                return (
                  <tr key={name}>
                    <td className="ops-table-key">{name}</td>
                    <td>
                      {uses ? (
                        <span className="ops-tag" data-tone="accent">
                          {authoringText(uses === 1 ? '{count} rule' : '{count} rules', {
                            count: uses,
                          })}
                        </span>
                      ) : (
                        <span className="operations-audience-none">
                          {authoringText('Not used yet')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {events.length === 0 ? (
                <tr>
                  <td colSpan={2}>{authoringText('No events registered for this workspace.')}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="ops-box-body operations-audience-hint">
            {authoringText(
              'An event can start an experience, move it on a step, or decide a branch.',
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

/** Plain language for a rule, because "notEquals" is not a thing anyone says. */
function audienceRuleLabel(rule: AudienceRule): string {
  const value = String(rule.value ?? '');
  if (rule.operator === 'exists') return authoringText('{key} is set', { key: rule.key });
  if (rule.operator === 'notExists') return authoringText('{key} is not set', { key: rule.key });
  if (rule.operator === 'contains') {
    return authoringText('{key} contains {value}', { key: rule.key, value });
  }
  if (rule.operator === 'notEquals') {
    return authoringText('{key} is not {value}', { key: rule.key, value });
  }
  return authoringText('{key} is {value}', { key: rule.key, value });
}

function sourceLabel(source: AudienceRule['source']): string {
  return source === 'event' ? authoringText('Event') : authoringText('Visitor detail');
}

function triggerLabel(snapshot: LocalAuthoringFrameSnapshot): string {
  const trigger = snapshot.documentState.trigger;
  if (!trigger) return authoringText('When you start it');
  if (trigger.type === 'manual') return authoringText('When you start it');
  if (trigger.type === 'pageLoad') return authoringText('As soon as the page loads');
  if (trigger.type === 'urlMatch') {
    return authoringText('On pages matching {pattern}', { pattern: trigger.config.pattern });
  }
  return authoringText('When {event} happens', { event: trigger.config.eventName });
}

function triggerDelayLabel(snapshot: LocalAuthoringFrameSnapshot): string {
  const trigger = snapshot.documentState.trigger;
  const delay = trigger?.type === 'pageLoad' ? trigger.config?.delayMs : undefined;
  if (!delay) return authoringText('No wait');
  return authoringText('{count} ms', { count: delay });
}

/** Visitor details a rule already names, with how often each is relied on. */
function identifyKeys(
  rules: readonly AudienceRule[],
): ReadonlyArray<{ key: string; uses: number }> {
  const counts = new Map<string, number>();
  for (const rule of rules) {
    if (rule.source !== 'identify') continue;
    counts.set(rule.key, (counts.get(rule.key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, uses]) => ({ key, uses }));
}

function eventUses(
  name: string,
  rules: readonly AudienceRule[],
  steps: readonly LodariqBlock[],
): number {
  const inRules = rules.filter((rule) => rule.source === 'event' && rule.key === name).length;
  const inSteps = steps.filter((step) => step.props.teaches === name).length;
  return inRules + inSteps;
}
