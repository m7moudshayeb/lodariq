import type {
  AudienceRule,
  DataCatalogEntry,
  DeploymentSchedule,
  LodariqBlock,
  TriggerDefinition,
} from '@lodariq/schema';
import { productCapabilityIsImplemented } from '@lodariq/schema/product-capabilities-runtime';
import { planAdaptiveSteps } from '@lodariq/schema/adaptive-runtime';
import { useState, type ReactNode } from 'react';
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

const AUDIENCE_EDITING_AVAILABLE = productCapabilityIsImplemented('delivery.audience-rules');
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
  const catalogEntries = snapshot.dataCatalog?.entries ?? [];
  const adaptivePolicy = snapshot.adaptivePolicy ?? {
    enabled: false,
    minimumOccurrences: 2,
    lookbackDays: 30,
  };
  const adaptiveOn = adaptivePolicy.enabled;
  const rules = snapshot.documentState.audience?.rules ?? [];
  const environments = snapshot.documentState.audience?.environments ?? [];

  const adaptiveDecisions = planAdaptiveSteps(
    steps.map((step) => ({ id: step.id, teaches: step.props.teaches })),
    {
      policy: adaptivePolicy,
      evaluatedAt: new Date().toISOString(),
      evidence: snapshot.adaptiveEvidence ?? [],
    },
  );
  const decisionByStepId = new Map(
    adaptiveDecisions.map((decision) => [decision.stepId, decision]),
  );
  const visible = adaptiveDecisions.filter((decision) => decision.action === 'show');

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
                {rules.length === 0 ? authoringText('Everyone') : authoringText('All must be true')}
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
                  <span className="ops-row">
                    <span className="ops-tag">{sourceLabel(rule.source)}</span>
                    <button
                      aria-label={authoringText('Remove audience rule')}
                      className="ops-btn"
                      data-size="sm"
                      onClick={() => controller.removeAudienceRule(index)}
                      type="button"
                    >
                      {authoringText('Remove')}
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <AudienceRuleComposer
            available={AUDIENCE_EDITING_AVAILABLE}
            catalogEntries={catalogEntries}
            onAdd={(rule) => controller.addAudienceRule(rule)}
          />
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
          <TriggerEditor
            available={AUDIENCE_EDITING_AVAILABLE}
            events={events}
            onChange={(trigger) => controller.setDeliveryTrigger(trigger)}
            trigger={snapshot.documentState.trigger}
          />
        </div>
      </div>

      <ScheduleEditor
        historyCount={snapshot.deliveryTransitionHistory?.length ?? 0}
        onCancel={(schedule) => controller.cancelDeliverySchedule(schedule.id, schedule.revision)}
        onCreate={(startAt, endAt) => controller.createDeliverySchedule(startAt, endAt)}
        schedules={snapshot.deploymentSchedules ?? []}
      />

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
              onClick={() => controller.setAdaptiveEnabled(!adaptiveOn)}
              type="button"
            >
              {adaptiveOn ? authoringText('Turn off') : authoringText('Turn on')}
            </button>
            <button
              className="ops-btn"
              data-size="sm"
              onClick={() => controller.previewAdaptiveTour()}
              type="button"
            >
              {authoringText('Preview')}
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
              <th scope="col">{authoringText('Preview decision')}</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step, index) => {
              const teaches = step.props.teaches;
              const decision = decisionByStepId.get(step.id);
              const demonstrated = Boolean(
                teaches &&
                snapshot.adaptiveEvidence?.some(
                  (entry) =>
                    entry.eventName === teaches &&
                    entry.occurrences >= adaptivePolicy.minimumOccurrences,
                ),
              );
              const willSkip = decision?.action === 'skip';
              return (
                <tr key={step.id} data-skipped={willSkip ? 'true' : 'false'}>
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
                    <span className="ops-row">
                      <span className="ops-tag" data-tone={willSkip ? 'ok' : undefined}>
                        {adaptiveDecisionLabel(decision?.reason)}
                      </span>
                      {teaches ? (
                        <button
                          className="ops-btn"
                          data-size="sm"
                          onClick={() =>
                            controller.setAdaptiveBehaviourDemonstrated(teaches, !demonstrated)
                          }
                          type="button"
                        >
                          {demonstrated ? authoringText('Clear') : authoringText('Simulate done')}
                        </button>
                      ) : null}
                    </span>
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
        <p className="ops-callout" data-tone={adaptiveOn ? 'ok' : 'info'} role="status">
          {adaptiveOn
            ? authoringText(
                'This preview visitor would see {shown} of {total} steps after {minimum} occurrences in {days} days.',
                {
                  shown: visible.length,
                  total: steps.length,
                  minimum: adaptivePolicy.minimumOccurrences,
                  days: adaptivePolicy.lookbackDays,
                },
              )
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
              {catalogIdentifyEntries(catalogEntries, rules).map((entry) => (
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
              {catalogIdentifyEntries(catalogEntries, rules).length === 0 ? (
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

function TriggerEditor({
  available,
  events,
  onChange,
  trigger,
}: {
  available: boolean;
  events: readonly string[];
  onChange: (trigger: TriggerDefinition) => void;
  trigger: TriggerDefinition;
}): ReactNode {
  const triggerOptions = [
    { value: 'manual', label: authoringText('When product code starts it') },
    { value: 'pageLoad', label: authoringText('When the page loads') },
    { value: 'urlMatch', label: authoringText('When the address matches') },
    { value: 'event', label: authoringText('When an event happens') },
  ];
  return (
    <div className="operations-audience-editor">
      <AuthoringSelect
        ariaLabel={authoringText('Start condition')}
        disabled={!available}
        onValueChange={(value) => onChange(defaultTrigger(value, events))}
        options={triggerOptions}
        value={trigger.type}
      />
      {trigger.type === 'pageLoad' ? (
        <label className="operations-audience-field">
          <span>{authoringText('Wait in milliseconds')}</span>
          <input
            className="ui-input"
            disabled={!available}
            max={60_000}
            min={0}
            onChange={(event) =>
              onChange({
                type: 'pageLoad',
                config: { delayMs: Number(event.currentTarget.value) || 0 },
              })
            }
            type="number"
            value={trigger.config?.delayMs ?? 0}
          />
        </label>
      ) : null}
      {trigger.type === 'urlMatch' ? (
        <label className="operations-audience-field">
          <span>{authoringText('Address pattern')}</span>
          <input
            className="ui-input"
            disabled={!available}
            onBlur={(event) => {
              const pattern = event.currentTarget.value.trim();
              if (pattern) onChange({ ...trigger, config: { ...trigger.config, pattern } });
            }}
            defaultValue={trigger.config.pattern}
            key={trigger.config.pattern}
          />
        </label>
      ) : null}
      {trigger.type === 'event' ? (
        <AuthoringSelect
          ariaLabel={authoringText('Event name')}
          disabled={!available || events.length === 0}
          onValueChange={(eventName) => onChange({ type: 'event', config: { eventName } })}
          options={events.map((eventName) => ({ value: eventName, label: eventName }))}
          value={trigger.config.eventName}
        />
      ) : null}
    </div>
  );
}

function AudienceRuleComposer({
  available,
  catalogEntries,
  onAdd,
}: {
  available: boolean;
  catalogEntries: readonly DataCatalogEntry[];
  onAdd: (rule: AudienceRule) => void;
}): ReactNode {
  const [source, setSource] = useState<AudienceRule['source']>('identify');
  const matchingEntries = catalogEntries.filter((entry) =>
    source === 'identify' ? entry.source === 'identify_trait' : entry.source === 'track_event',
  );
  const [key, setKey] = useState('');
  const [operator, setOperator] = useState<AudienceRule['operator']>('exists');
  const [value, setValue] = useState('');
  const selectedKey = matchingEntries.some((entry) => entry.key === key)
    ? key
    : (matchingEntries[0]?.key ?? '');
  const needsValue = operator === 'equals' || operator === 'notEquals' || operator === 'contains';
  return (
    <div className="operations-audience-editor">
      <div className="ops-row operations-audience-rule-controls">
        <AuthoringSelect
          ariaLabel={authoringText('Rule source')}
          disabled={!available}
          onValueChange={(next) => {
            setSource(next as AudienceRule['source']);
            setKey('');
            setOperator('exists');
          }}
          options={[
            { value: 'identify', label: authoringText('Visitor detail') },
            { value: 'event', label: authoringText('Event') },
          ]}
          value={source}
        />
        <AuthoringSelect
          ariaLabel={authoringText('Rule field')}
          disabled={!available || matchingEntries.length === 0}
          onValueChange={setKey}
          options={matchingEntries.map((entry) => ({ value: entry.key, label: entry.key }))}
          value={selectedKey}
        />
        <AuthoringSelect
          ariaLabel={authoringText('Rule operator')}
          disabled={!available}
          onValueChange={(next) => setOperator(next as AudienceRule['operator'])}
          options={[
            { value: 'exists', label: authoringText('is set') },
            { value: 'notExists', label: authoringText('is not set') },
            { value: 'equals', label: authoringText('is') },
            { value: 'notEquals', label: authoringText('is not') },
            { value: 'contains', label: authoringText('contains') },
          ]}
          value={operator}
        />
      </div>
      {needsValue ? (
        <input
          aria-label={authoringText('Rule value')}
          className="ui-input"
          disabled={!available}
          onChange={(event) => setValue(event.currentTarget.value)}
          placeholder={authoringText('Value')}
          value={value}
        />
      ) : null}
      <button
        className="ops-btn"
        data-size="sm"
        disabled={!available || !selectedKey || (needsValue && !value)}
        onClick={() =>
          onAdd({
            source,
            key: selectedKey,
            operator,
            ...(needsValue ? { value } : {}),
          })
        }
        title={available ? undefined : AUDIENCE_EDITING_REASON}
        type="button"
      >
        {authoringText('Add rule')}
      </button>
    </div>
  );
}

function ScheduleEditor({
  historyCount,
  onCancel,
  onCreate,
  schedules,
}: {
  historyCount: number;
  onCancel: (schedule: DeploymentSchedule) => void;
  onCreate: (startAt: string, endAt?: string) => void;
  schedules: readonly DeploymentSchedule[];
}): ReactNode {
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const startIso = localDateTimeToIso(startAt);
  const endIso = localDateTimeToIso(endAt);
  const validWindow = Boolean(startIso && (!endAt || (endIso && endIso > startIso)));
  return (
    <div className="ops-box operations-audience-schedule">
      <h3>
        <Calendar size={15} strokeWidth={2} aria-hidden="true" />
        {authoringText('Schedule production')}
        <span className="ops-box-actions">
          <span className="ops-tag">
            {authoringText('{count} transitions recorded', { count: historyCount })}
          </span>
        </span>
      </h3>
      <p className="ops-box-body">
        {authoringText(
          'The verified staging artifact is pinned now. The schedule only moves the production pointer.',
        )}
      </p>
      <div className="ops-row operations-audience-schedule-grid">
        <label className="operations-audience-field">
          <span>{authoringText('Start')}</span>
          <input
            className="ui-input"
            onChange={(event) => setStartAt(event.currentTarget.value)}
            type="datetime-local"
            value={startAt}
          />
        </label>
        <label className="operations-audience-field">
          <span>{authoringText('End (optional)')}</span>
          <input
            className="ui-input"
            onChange={(event) => setEndAt(event.currentTarget.value)}
            type="datetime-local"
            value={endAt}
          />
        </label>
        <button
          className="ops-btn"
          data-variant="primary"
          disabled={!validWindow}
          onClick={() => {
            if (!startIso) return;
            onCreate(startIso, endIso);
          }}
          type="button"
        >
          {authoringText('Schedule')}
        </button>
      </div>
      <ol className="ops-list">
        {schedules.slice(0, 5).map((schedule) => (
          <li key={schedule.id}>
            <span>
              <strong>{formatScheduleTime(schedule.startAt)}</strong>
              <span className="ops-list-meta">
                {schedule.endAt
                  ? authoringText('Ends {time}', { time: formatScheduleTime(schedule.endAt) })
                  : authoringText('No automatic end')}
              </span>
            </span>
            <span className="ops-row">
              <span
                className="ops-tag"
                data-tone={schedule.status === 'failed' ? 'bad' : undefined}
              >
                {schedule.status}
              </span>
              {schedule.status === 'scheduled' ? (
                <button
                  className="ops-btn"
                  data-size="sm"
                  onClick={() => onCancel(schedule)}
                  type="button"
                >
                  {authoringText('Cancel')}
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function defaultTrigger(value: string, events: readonly string[]): TriggerDefinition {
  if (value === 'pageLoad') return { type: 'pageLoad', config: { delayMs: 0 } };
  if (value === 'urlMatch') return { type: 'urlMatch', config: { pattern: '/', mode: 'exact' } };
  if (value === 'event') {
    return { type: 'event', config: { eventName: events[0] ?? 'experience_started' } };
  }
  return { type: 'manual' };
}

function localDateTimeToIso(value: string): string | undefined {
  if (!value) return undefined;
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : undefined;
}

function formatScheduleTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
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

function adaptiveDecisionLabel(reason: string | undefined): string {
  if (reason === 'demonstrated') return authoringText('Skip · demonstrated');
  if (reason === 'flow-guard') return authoringText('Show · keeps flow valid');
  if (reason === 'insufficient-evidence') return authoringText('Show · needs more evidence');
  if (reason === 'no-evidence') return authoringText('Show · no evidence');
  if (reason === 'no-behaviour') return authoringText('Show · no event');
  if (reason === 'disabled') return authoringText('Show · adaptive off');
  return authoringText('Show');
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

function catalogIdentifyEntries(
  catalogEntries: readonly DataCatalogEntry[],
  rules: readonly AudienceRule[],
): ReadonlyArray<{ key: string; uses: number }> {
  const uses = new Map(identifyKeys(rules).map((entry) => [entry.key, entry.uses]));
  const keys = new Set(
    catalogEntries.filter((entry) => entry.source === 'identify_trait').map((entry) => entry.key),
  );
  for (const key of uses.keys()) keys.add(key);
  return [...keys]
    .sort((left, right) => left.localeCompare(right))
    .map((key) => ({ key, uses: uses.get(key) ?? 0 }));
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
