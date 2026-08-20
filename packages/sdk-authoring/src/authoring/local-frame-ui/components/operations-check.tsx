import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { Rocket } from '../design-system';
import {
  buildCheckReport,
  type CheckReport,
  type CheckRow,
  type CheckRowKind,
} from '../../publish-check';
import type { QaStepInput } from '../../predictive-qa';
import type { AuthoringTargetHealthPresentation } from '../../target-health-ledger';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { stepTooltip } from '../tour-step-model';

/**
 * Operations → Check (§4.6). One pre-publish report, every row with a
 * jump-to-element — the Webflow Audit affordance that gets findings fixed rather
 * than skimmed.
 *
 * Opening this never publishes and never mutates release state (§4.6
 * non-negotiables): it reads the draft and simulates.
 */
/** The locales this document claims, which is what a check is measured against. */
export function documentLocales(snapshot: LocalAuthoringFrameSnapshot): readonly string[] {
  return snapshot.documentState.localization?.variants.map((variant) => variant.locale) ?? [];
}

/**
 * One report for the section and for the nav badge that counts it. Built by the
 * hub and handed down, so the row and the section can never disagree.
 */
export function buildOperationsCheckReport(
  snapshot: LocalAuthoringFrameSnapshot,
  steps: readonly LodariqBlock[],
): CheckReport {
  return buildCheckReport({
    document: snapshot.documentState,
    steps: steps.map(simulationInputFor),
    targetHealth: targetHealthMap(snapshot),
    locales: documentLocales(snapshot),
  });
}

export function OperationsCheck({
  controller,
  locales,
  report,
  stepCount,
}: {
  controller: LocalAuthoringFrameController;
  locales: number;
  report: CheckReport;
  stepCount: number;
}) {
  const warnings = report.rows.length - report.blockers.length;
  const blocked = report.blockers.length > 0;

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
        <CheckTally label={authoringText('Steps')} tone="neutral" value={stepCount} />
        <CheckTally label={authoringText('Languages')} tone="neutral" value={locales} />
      </div>

      <div className="operations-check-actions">
        {/* Printed and disabled with the reason rather than hidden (§3 WIRE_). */}
        {UNBUILT_SWEEPS.map((sweep) => (
          <button
            className="ops-btn"
            data-check-action={sweep.id}
            disabled
            key={sweep.id}
            title={sweep.reason}
            type="button"
          >
            {sweep.label}
          </button>
        ))}
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
        {authoringText('Simulation and the accessibility sweep are not built yet.')}
      </p>

      {report.rows.length === 0 ? (
        <p className="ops-callout" data-tone="ok" role="status">
          {authoringText('Nothing to fix. Contrast, layout, targets and descriptions all check out.')}
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
                {row.jump ? (
                  <button
                    className="ops-btn"
                    data-size="sm"
                    type="button"
                    data-check-jump={row.jump.section}
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

/**
 * Two of the prototype's Check actions that this build cannot run yet.
 *
 * WIRE_IFRAME: the simulated user needs to drive the real page — click through
 * each step against the test user's attributes and report where it stalls. The
 * `simulate-user` chrome action exists but only opens this section; nothing
 * drives the page from here.
 *
 * WIRE_BE: the accessibility sweep is a workspace-level report over every
 * experience, not a re-run of the rules already in the list below. Nothing
 * carries one to this frame.
 */
const UNBUILT_SWEEPS: ReadonlyArray<{ id: string; label: string; reason: string }> = [
  {
    id: 'simulate',
    label: authoringText('Simulate a confused user'),
    reason: authoringText('Simulation cannot drive your page yet.'),
  },
  {
    id: 'a11y',
    label: authoringText('Accessibility sweep'),
    reason: authoringText('The sweep is a workspace report and is not available yet.'),
  },
];

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
  if (!row.jump) return;
  controller.closeOperationsMode();
  controller.activateTourStep(row.jump.stepId);
}

function simulationInputFor(step: LodariqBlock): QaStepInput {
  const tooltip = stepTooltip(step);
  const layout = tooltip?.props.tooltipLayout;
  const placement = tooltip?.props.placement ?? 'bottom';
  return {
    stepId: step.id,
    card: {
      width: layout?.widthPx ?? 320,
      height: layout?.heightPx ?? 200,
    },
    /**
     * Captured target geometry does not cross the bridge (ADR-0016 keeps
     * coordinates diagnostic-only), so the simulation runs against a neutral box
     * of the size a control usually is. That still catches the card-shape
     * failures — overflow, occlusion, flips — which are what §7.3 is for.
     */
    target: { left: 0, top: 0, width: 120, height: 40 },
    placement: placement === 'top' || placement === 'left' || placement === 'right' ? placement : 'bottom',
    scrollsIntoView: true,
    tapTargets: (tooltip?.children ?? [])
      .filter((child) => child.type === 'button')
      .map((child) => ({
        label: child.content ?? authoringText('Button'),
        // Authored buttons render at the recipes' sizes; the recipe floor is 44px.
        width: 120,
        height: 44,
      })),
  };
}

function targetHealthMap(
  snapshot: LocalAuthoringFrameSnapshot,
): ReadonlyMap<string, AuthoringTargetHealthPresentation> {
  const entries = new Map<string, AuthoringTargetHealthPresentation>();
  for (const [targetId, health] of snapshot.targetHealth) {
    entries.set(targetId, health.presentation);
  }
  return entries;
}
