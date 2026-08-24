import type { LodariqBlock } from '@lodariq/schema';
import { useState, type ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import {
  AuthoringSelect,
  ChartColumn,
  Download,
  Gauge,
  History,
  Star,
  TextCursorInput,
} from '../design-system';
import { blockDisplayTitle } from '../utils';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

/**
 * Evidence it worked. Completions and drop-off are never gated at any tier —
 * gate that and customers churn instead of upgrading. Adoption impact is the
 * number that justifies the product: did the behaviour actually happen after.
 */
export function OperationsAnalytics({
  controller,
  snapshot,
  steps,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  steps: readonly LodariqBlock[];
}): ReactNode {
  const analytics = snapshot.experienceAnalytics;
  const sessions = snapshot.experienceSessions ?? [];
  const [sessionsExpanded, setSessionsExpanded] = useState(false);
  const [releaseKey, setReleaseKey] = useState('all');
  const releases = analytics?.breakdown?.releases ?? [];
  const selectedRelease = releases.find(
    (release) => `${release.publicationId}:${release.pointerGeneration}` === releaseKey,
  );
  const exportRelease = selectedRelease
    ? {
        publicationId: selectedRelease.publicationId,
        contentHash: selectedRelease.contentHash,
        pointerGeneration: selectedRelease.pointerGeneration,
      }
    : undefined;
  const usage = snapshot.commercialUsage;
  const exportQuotaAvailable =
    !usage ||
    usage.analyticsExports.limit === null ||
    usage.analyticsExports.used < usage.analyticsExports.limit;
  const csvIncluded = !usage || usage.features.includes('analytics-csv');
  const rawIncluded = usage?.features.includes('raw-event-export') ?? false;
  const audienceResultsIncluded = !usage || usage.features.includes('audience-segment-results');
  const csvEnabled = csvIncluded && exportQuotaAvailable;
  const rawEnabled = rawIncluded && exportQuotaAvailable;
  const exportLimitTitle = exportQuotaAvailable
    ? undefined
    : authoringText('The workspace has reached its monthly analytics export limit.');
  if (!analytics) {
    return (
      <section className="operations-analytics" aria-label={authoringText('Analytics')}>
        {/* Not a gap — an honest empty state. Nothing is live, so there is
            genuinely nothing to count. */}
        <p className="ops-callout" data-tone="info" role="status">
          {authoringText('Nothing has been published yet, so there is nothing to measure.')}
        </p>
      </section>
    );
  }
  const report = selectedRelease ?? analytics;
  let audienceSegmentReports = analytics.breakdown?.audienceSegments ?? [];
  if (selectedRelease) {
    audienceSegmentReports = selectedRelease.audienceSegment
      ? [
          {
            ...selectedRelease.audienceSegment,
            shown: selectedRelease.shown,
            completed: selectedRelease.completed,
            dismissed: selectedRelease.dismissed,
            funnel: selectedRelease.funnel,
            adoption: selectedRelease.adoption,
            formResponses: selectedRelease.formResponses,
          },
        ]
      : [];
  }
  const funnel = report.funnel;
  const biggestDrop = funnel.reduce<{ index: number; ratio: number } | null>(
    (worst, entry, index) => {
      const previous = funnel[index - 1];
      if (!previous || previous.reached === 0) return worst;
      const ratio = entry.reached / previous.reached;
      return !worst || ratio < worst.ratio ? { index, ratio } : worst;
    },
    null,
  );

  return (
    <section className="operations-analytics" aria-label={authoringText('Analytics')}>
      {analytics.breakdown ? (
        <div className="ops-box">
          <h3>
            <History size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Release scope')}
          </h3>
          <AuthoringSelect
            ariaLabel={authoringText('Release scope')}
            onValueChange={setReleaseKey}
            options={[
              { value: 'all', label: authoringText('All retained releases') },
              ...releases.map((release) => ({
                value: `${release.publicationId}:${release.pointerGeneration}`,
                label: authoringText('Generation {generation} · {publication}', {
                  generation: release.pointerGeneration,
                  publication: release.publicationId,
                }),
              })),
            ]}
            value={releaseKey}
          />
          <p className="ops-box-body">
            {authoringText('{days} days retained · report definition v{version}', {
              days: analytics.breakdown.retentionDays,
              version: analytics.breakdown.definitionVersion,
            })}
          </p>
        </div>
      ) : null}
      {/* The three numbers everyone opens this for, before any breakdown of
          them. Never gated at any plan: gate these and customers churn rather
          than upgrade. */}
      <div className="ops-cols analytics-summary" data-cols="3">
        <AnalyticsKpi label={authoringText('Shown')} value={report.shown.toLocaleString()} />
        <AnalyticsKpi
          label={authoringText('Completed')}
          value={percent(report.completed, report.shown)}
        />
        <AnalyticsKpi
          label={authoringText('Dismissed')}
          value={percent(report.dismissed, report.shown)}
        />
      </div>

      {audienceResultsIncluded && audienceSegmentReports.length ? (
        <div className="ops-box">
          <h3>
            <ChartColumn size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Audience')}
          </h3>
          <table className="ops-table">
            <thead>
              <tr>
                <th scope="col">{authoringText('Audience')}</th>
                <th scope="col">{authoringText('Shown')}</th>
                <th scope="col">{authoringText('Completed')}</th>
                <th scope="col">{authoringText('Dismissed')}</th>
              </tr>
            </thead>
            <tbody>
              {audienceSegmentReports.map((segment) => (
                <tr key={segment.id}>
                  <td className="ops-table-key">
                    {authoringText(segment.ruleCount === 1 ? '{count} rule' : '{count} rules', {
                      count: segment.ruleCount,
                    })}{' '}
                    <span className="ops-tag">{segment.id.slice(-8)}</span>
                  </td>
                  <td>{segment.shown.toLocaleString()}</td>
                  <td>{percent(segment.completed, segment.shown)}</td>
                  <td>{percent(segment.dismissed, segment.shown)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="ops-box">
        <h3>
          <ChartColumn size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('Where people stop')}
          <span className="ops-box-actions">
            <button
              className="ops-btn"
              data-size="sm"
              disabled={!csvEnabled}
              onClick={() => controller.exportAnalytics('summary-csv', exportRelease)}
              title={
                csvIncluded
                  ? exportLimitTitle
                  : authoringText('This tool is not included in the current workspace plan.')
              }
              type="button"
            >
              <Download size={12} strokeWidth={2} aria-hidden="true" />
              {authoringText('Export CSV')}
            </button>
            {rawIncluded ? (
              <button
                className="ops-btn"
                data-size="sm"
                disabled={!rawEnabled}
                onClick={() => controller.exportAnalytics('raw-events-jsonl', exportRelease)}
                title={exportLimitTitle}
                type="button"
              >
                <Download size={12} strokeWidth={2} aria-hidden="true" />
                {authoringText('Export raw')}
              </button>
            ) : null}
          </span>
        </h3>
        {funnel.map((entry, index) => {
          const step = steps.find((candidate) => candidate.id === entry.stepId);
          const share = report.shown ? entry.reached / report.shown : 0;
          const previous = funnel[index - 1];
          /* A step that keeps under 85% of the one before it is the shape of a
             problem, so it is coloured — and the percentage is printed beside
             it either way. */
          const steep = Boolean(
            previous && previous.reached && entry.reached / previous.reached < 0.85,
          );
          return (
            <div className="ops-barrow" key={entry.stepId}>
              <span>
                {index + 1}. {step ? blockDisplayTitle(step) : entry.stepId}
              </span>
              <span className="ops-meter analytics-meter">
                <i
                  data-tone={steep ? 'warning' : undefined}
                  style={{ width: `${(share * 100).toFixed(1)}%` }}
                />
              </span>
              <span className="analytics-bar-value">
                {entry.reached.toLocaleString()} · {(share * 100).toFixed(0)}%
              </span>
            </div>
          );
        })}
        {funnel.length === 0 ? (
          <p className="ops-box-body">{authoringText('No steps have been reached yet.')}</p>
        ) : null}
        {biggestDrop ? (
          <p className="ops-callout" data-tone="warning" role="status">
            {authoringText(
              'The biggest drop is at step {step}. That is usually a competing call to action, or a target that resolves late.',
              { step: biggestDrop.index + 1 },
            )}
          </p>
        ) : null}
      </div>

      <div className="ops-cols" data-cols="2">
        <div className="ops-box">
          <h3>
            <Star size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Did it actually change anything?')}
            <span className="ops-box-actions">
              {/* WIRE_BE: the Operations contract does not expose the workspace event catalogue yet. */}
              <AuthoringSelect
                ariaLabel={authoringText('Declare a success event')}
                onValueChange={(value) => controller.declareSuccessEvent(value)}
                options={[
                  { value: '', label: authoringText('Declare a success event…') },
                  ...(snapshot.knownEventNames ?? []).map((name) => ({ value: name, label: name })),
                ]}
                value=""
              />
            </span>
          </h3>
          <p className="ops-box-body">
            {authoringText(
              'Did the behaviour this experience teaches actually happen afterwards? Measured against people who were never shown it.',
            )}
          </p>
          <table className="ops-table">
            <thead>
              <tr>
                <th scope="col">{authoringText('Event')}</th>
                <th scope="col">{authoringText('Within')}</th>
                <th scope="col">{authoringText('Not shown')}</th>
                <th scope="col">{authoringText('Shown')}</th>
                <th scope="col">{authoringText('Difference')}</th>
              </tr>
            </thead>
            <tbody>
              {(report.adoption ?? []).map((impact) => {
                const lift = (impact.treatedRate - impact.baselineRate) * 100;
                return (
                  <tr key={impact.eventName}>
                    <td className="ops-table-key">{impact.eventName}</td>
                    <td>{authoringText('{days} days', { days: impact.windowDays })}</td>
                    <td>{(impact.baselineRate * 100).toFixed(0)}%</td>
                    <td>{(impact.treatedRate * 100).toFixed(0)}%</td>
                    <td>
                      <span className="ops-tag" data-tone={lift >= 0 ? 'ok' : 'blocker'}>
                        {authoringText('{points}pt', {
                          points: `${lift >= 0 ? '+' : ''}${lift.toFixed(0)}`,
                        })}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(report.adoption ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    {authoringText('No success event declared, so impact cannot be measured.')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {snapshot.knownEventNames?.length ? null : (
            <p className="ops-box-body operations-analytics-hint" role="status">
              {authoringText(
                'Success-event choices are waiting for the workspace event catalogue.',
              )}
            </p>
          )}
        </div>

        <div className="ops-box">
          <h3>
            <TextCursorInput size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('What people answered')}
          </h3>
          <p className="ops-box-body">
            {authoringText('Fields render and capture. A form you cannot read is not a feature.')}
          </p>
          {(report.formResponses ?? []).length ? (
            <table className="ops-table">
              <thead>
                <tr>
                  <th scope="col">{authoringText('Question')}</th>
                  <th scope="col">{authoringText('Answers')}</th>
                  <th scope="col">{authoringText('Most common')}</th>
                </tr>
              </thead>
              <tbody>
                {report.formResponses?.map((response) => (
                  <tr key={response.blockId}>
                    <td className="ops-table-key">{response.label}</td>
                    <td>{response.answerCount}</td>
                    <td>{response.topAnswer ?? authoringText('—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="ops-box-body">
              {authoringText('No form fields have been answered yet.')}
            </p>
          )}
        </div>
      </div>

      <div className="ops-cols" data-cols="2">
        {/*
          WIRE_BE: both are workspace reports over cohorts this frame never sees.
          They are printed rather than omitted because each states a boundary the
          product is sold on — replay is scoped to the experience, and retention
          is the comparison that justifies running one at all.
        */}
        <div className="ops-box">
          <h3>
            <History size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Watching one person go through it')}
            <span className="ops-box-actions">
              <span className="ops-tag">{authoringText('Your experience only')}</span>
            </span>
          </h3>
          <p className="ops-box-body">
            {authoringText(
              'How somebody moved through your experience — where they paused, went back, gave up. Never the rest of their session: the moment it captures anything outside the experience it becomes the thing that breaks the business model.',
            )}
          </p>
          <button
            aria-controls="experience-session-list"
            aria-expanded={sessionsExpanded}
            className="ops-btn"
            data-size="sm"
            disabled={sessions.length === 0}
            onClick={() => setSessionsExpanded((expanded) => !expanded)}
            title={
              sessions.length === 0
                ? authoringText('No experience sessions have been recorded yet.')
                : undefined
            }
            type="button"
          >
            {sessionsExpanded
              ? authoringText('Hide recent sessions')
              : authoringText('See recent sessions')}
          </button>
          {sessionsExpanded ? (
            <ul className="ops-list" id="experience-session-list">
              {sessions.map((session) => (
                <li key={session.correlationId}>
                  <details>
                    <summary>
                      {sessionOutcome(session.outcome)} · {durationLabel(session.durationMs)} ·{' '}
                      {authoringText(
                        session.stepsReached === 1 ? '{count} step' : '{count} steps',
                        {
                          count: session.stepsReached,
                        },
                      )}
                    </summary>
                    <ol className="ops-list">
                      {session.beats.map((beat, index) => {
                        const step = steps.find((candidate) => candidate.id === beat.stepId);
                        return (
                          <li key={`${beat.offsetMs}:${beat.name}:${index}`}>
                            <span>
                              {durationLabel(beat.offsetMs)} · {sessionBeatLabel(beat.name)}
                              {step ? ` · ${blockDisplayTitle(step)}` : ''}
                            </span>
                            {beat.resolved === false ? (
                              <span className="ops-tag" data-tone="warning">
                                {authoringText('Unresolved')}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  </details>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="ops-box">
          <h3>
            <Gauge size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Do they come back?')}
          </h3>
          <p className="ops-box-body">
            {authoringText(
              'Week-by-week return rate for people who saw this experience against people who did not.',
            )}
          </p>
          {analytics.breakdown?.retention.length ? (
            <table className="ops-table">
              <thead>
                <tr>
                  <th scope="col">{authoringText('Week')}</th>
                  <th scope="col">{authoringText('Shown')}</th>
                  <th scope="col">{authoringText('Not shown')}</th>
                </tr>
              </thead>
              <tbody>
                {analytics.breakdown.retention.map((entry) => (
                  <tr key={entry.week}>
                    <td className="ops-table-key">{entry.week}</td>
                    <td>{percent(entry.exposedReturned, entry.exposedCohort)}</td>
                    <td>{percent(entry.baselineReturned, entry.baselineCohort)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="ops-box-body">
              {authoringText(
                'Return rates appear after a complete week of stable visitor evidence.',
              )}
            </p>
          )}
        </div>
      </div>

      <p className="ops-callout" data-tone="info">
        {authoringText(
          'Replay covers your experience only — never the rest of the session. Full-app session replay stays excluded.',
        )}
      </p>
    </section>
  );
}

function AnalyticsKpi({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="ops-box analytics-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function percent(part: number, whole: number): string {
  if (!whole) return '—';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

const SESSION_OUTCOME_LABELS = {
  abandoned: 'Abandoned',
  completed: 'Completed',
  dismissed: 'Dismissed',
  skipped: 'Skipped',
} as const;

const SESSION_BEAT_LABELS: Readonly<Record<string, string>> = {
  experience_completed: 'Experience completed',
  experience_dismissed: 'Experience dismissed',
  experience_shown: 'Experience shown',
  step_shown: 'Step shown',
  target_resolved: 'Target found',
  target_unresolved: 'Target not found',
};

function sessionOutcome(outcome: keyof typeof SESSION_OUTCOME_LABELS): string {
  return authoringText(SESSION_OUTCOME_LABELS[outcome]);
}

function sessionBeatLabel(name: string): string {
  return authoringText(SESSION_BEAT_LABELS[name] ?? 'Experience event');
}

function durationLabel(durationMs: number): string {
  if (durationMs < 1_000) return authoringText('{count}ms', { count: durationMs });
  const seconds = Math.round(durationMs / 1_000);
  if (seconds < 60) return authoringText('{count}s', { count: seconds });
  const minutes = Math.floor(seconds / 60);
  return authoringText('{minutes}m {seconds}s', { minutes, seconds: seconds % 60 });
}
