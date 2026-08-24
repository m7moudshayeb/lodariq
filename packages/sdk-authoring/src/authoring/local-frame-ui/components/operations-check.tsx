import type { LodariqBlock } from '@lodariq/schema';
import { productCapabilityIsImplemented } from '@lodariq/schema/product-capabilities-runtime';
import { authoringText } from '../../../i18n';
import { Rocket } from '../design-system';
import type { CheckRow, CheckRowKind } from '../../publish-check';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { useTargetInspections } from '../use-target-inspections';
import { buildOperationsCheckReport, documentLocales } from './operations-check-report';

/**
 * Operations → Check (§4.6). One pre-publish report, every row with a
 * jump-to-element — the Webflow Audit affordance that gets findings fixed rather
 * than skimmed.
 *
 * Opening this never publishes and never mutates release state (§4.6
 * non-negotiables): it reads the draft and simulates.
 */
export function OperationsCheck({
  controller,
  snapshot,
  steps,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  steps: readonly LodariqBlock[];
}) {
  const report = buildOperationsCheckReport(snapshot, steps);
  const locales = documentLocales(snapshot).length;
  const localeLayoutQa = snapshot.localeLayoutQa;
  const localeLayoutQaAvailable = snapshot.localeLayoutQaAvailable ?? false;
  const accessibilitySweep = snapshot.accessibilitySweep;
  const accessibilitySweepAvailable = snapshot.accessibilitySweepAvailable ?? false;
  const warnings = report.rows.length - report.blockers.length;
  const blocked = report.blockers.length > 0;

  // A report on evidence nobody gathered is worse than no report.
  useTargetInspections(controller, steps);

  return (
    <section className="operations-check" aria-label={authoringText('Check')}>
      {/* The shape of the answer before the answer itself: how bad, and against
          how much. Four numbers read faster than a list of eleven rows. */}
      <div className="ops-cols operations-check-tally" data-cols="4">
        <CheckTally
          label={authoringText('Blocking')}
          tone={report.blockers.length > 0 ? 'blocker' : 'clear'}
          value={report.blockers.length}
        />
        <CheckTally
          label={authoringText('Warnings')}
          tone={warnings > 0 ? 'warning' : 'clear'}
          value={warnings}
        />
        <CheckTally label={authoringText('Steps')} tone="neutral" value={steps.length} />
        <CheckTally label={authoringText('Languages')} tone="neutral" value={locales} />
      </div>

      <div className="operations-check-actions">
        <button
          className="ops-btn"
          data-check-action="locale-layout"
          disabled={
            !productCapabilityIsImplemented('authoring.locale-layout-qa') ||
            !localeLayoutQaAvailable ||
            localeLayoutQa?.state === 'running'
          }
          onClick={() => controller.runLocaleLayoutQa()}
          title={
            localeLayoutQaAvailable
              ? undefined
              : authoringText('Live language layout checking is unavailable in this session.')
          }
          type="button"
        >
          {localeLayoutQa?.state === 'running'
            ? authoringText('Checking live layouts…')
            : authoringText('Check live language layouts')}
        </button>
        <button
          className="ops-btn"
          data-check-action="a11y"
          disabled={!accessibilitySweepAvailable || accessibilitySweep?.state === 'running'}
          onClick={() => controller.runAccessibilitySweep()}
          title={
            accessibilitySweepAvailable
              ? undefined
              : authoringText('Workspace accessibility checking is unavailable in this session.')
          }
          type="button"
        >
          {accessibilitySweep?.state === 'running'
            ? authoringText('Checking workspace accessibility…')
            : authoringText('Accessibility sweep')}
        </button>
        <span className="ops-spacer" />
        {/*
          Alone on the right, because it is the one action here that changes what
          the world sees. Everything to its left only looks.
        */}
        <button
          className="ops-btn"
          data-check-action="publish"
          data-variant={blocked ? undefined : 'primary'}
          disabled={blocked}
          onClick={() => controller.openReleaseVerificationMode()}
          title={
            blocked ? authoringText('Fix what is blocking first. Saving still works.') : undefined
          }
          type="button"
        >
          <Rocket size={13} strokeWidth={2} aria-hidden="true" />
          {blocked
            ? authoringText('Publishing is blocked — {count} to fix', {
                count: report.blockers.length,
              })
            : authoringText('Publish to staging')}
        </button>
      </div>
      <p className="operations-note" role="status">
        {authoringText(
          'Predictive checks run automatically. Live language layouts render on this page; workspace accessibility findings are pinned to immutable document versions.',
        )}
      </p>

      {accessibilitySweep?.state === 'error' ? (
        <p className="ops-callout" data-tone="warning" role="alert">
          {authoringText('Workspace accessibility checking failed.')}
        </p>
      ) : null}
      {accessibilitySweep?.state === 'complete' && accessibilitySweep.result ? (
        <div className="ops-box" data-kind="readiness" data-accessibility-sweep-summary="">
          <h3>{authoringText('Workspace accessibility result')}</h3>
          <p>
            {authoringText('Checked {documents} experiences across {locales} language versions.', {
              documents: accessibilitySweep.result.sweep.documentCount,
              locales: accessibilitySweep.result.sweep.localeCount,
            })}
          </p>
          <p>
            {authoringText('{blockers} blockers · {warnings} warnings', {
              blockers: accessibilitySweep.result.sweep.blockerCount,
              warnings: accessibilitySweep.result.sweep.warningCount,
            })}
          </p>
        </div>
      ) : null}

      {localeLayoutQa?.state === 'error' ? (
        <p className="ops-callout" data-tone="warning" role="alert">
          {authoringText('Live language layouts could not be checked on this page.')}
        </p>
      ) : null}
      {localeLayoutQa?.state === 'complete' && localeLayoutQa.report ? (
        <div className="ops-box" data-kind="layout" data-locale-layout-summary="">
          <h3>{authoringText('Live language layout result')}</h3>
          <p>
            {authoringText(
              'Checked {presentations} presentations across {locales} languages and {steps} steps at {width}×{height}.',
              {
                presentations: localeLayoutQa.report.checkedPresentationCount,
                locales: localeLayoutQa.report.checkedLocaleCount,
                steps: localeLayoutQa.report.checkedStepCount,
                width: localeLayoutQa.report.viewport.width,
                height: localeLayoutQa.report.viewport.height,
              },
            )}
          </p>
          <p>
            {authoringText('{passed} passed · {failed} failed · {unavailable} unavailable', {
              passed: localeLayoutQa.report.passedCount,
              failed: localeLayoutQa.report.failedCount,
              unavailable: localeLayoutQa.report.unavailableCount,
            })}
          </p>
        </div>
      ) : null}

      {report.rows.length === 0 ? (
        <p className="ops-callout" data-tone="ok" role="status">
          {authoringText(
            'Nothing to fix. Contrast, layout, targets and descriptions all check out.',
          )}
        </p>
      ) : null}

      {/* Grouped by what is wrong, not by step: one missing translation across
          nine steps is one problem, and nine rows for it is how a check gets
          ignored (§13). */}
      {groupByKind(report.rows).map(([kind, rows]) => (
        <div className="ops-box" data-kind={kind} key={kind}>
          <h3>
            <span
              className="ops-tag"
              data-tone={rows.some((row) => row.severity === 'blocker') ? 'blocker' : 'warning'}
            >
              {rows.length}
            </span>
            {CHECK_KIND_LABELS[kind]}
          </h3>
          <ul className="ops-list">
            {rows.map((row, index) => (
              <li key={`${kind}-${index}`} data-severity={row.severity} data-kind={row.kind}>
                <span>
                  {row.message}
                  {row.detail ? <small className="ops-list-meta">{row.detail}</small> : null}
                </span>
                {row.jump || row.repairIssue ? (
                  <button
                    className="ops-btn"
                    data-size="sm"
                    type="button"
                    data-check-jump={row.jump?.section}
                    data-publish-issue-code={row.repairIssue?.code}
                    onClick={() => jumpTo(controller, row)}
                  >
                    {authoringText('Take me there')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

const CHECK_KIND_LABELS: Record<CheckRowKind, string> = {
  readiness: authoringText('Things that stop this publishing'),
  contrast: authoringText('Text that is hard to read'),
  layout: authoringText('Cards that will not sit where you put them'),
  target: authoringText('Things Lodariq cannot find on your page'),
  'alt-text': authoringText('Images with nothing to read aloud'),
  translation: authoringText('Copy that has not been translated'),
};

function CheckTally({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'blocker' | 'warning' | 'neutral' | 'clear';
  value: number;
}) {
  return (
    <div className="ops-box operations-check-tally-cell" data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** Insertion order, so the report's own severity ordering survives grouping. */
function groupByKind(rows: readonly CheckRow[]): Array<[CheckRowKind, CheckRow[]]> {
  const groups = new Map<CheckRowKind, CheckRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.kind);
    if (existing) existing.push(row);
    else groups.set(row.kind, [row]);
  }
  return [...groups.entries()];
}

/** Selects the step and closes Operations, so the fix is one click away. */
function jumpTo(controller: LocalAuthoringFrameController, row: CheckRow): void {
  if (row.repairIssue) {
    controller.repairPublishIssue(row.repairIssue);
    return;
  }
  if (!row.jump) return;
  controller.closeOperationsMode();
  controller.activateTourStep(row.jump.stepId);
}
