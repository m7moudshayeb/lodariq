import {
  BACKDROP_DIM_PERCENT_LIMITS,
  TARGET_OUTLINE_LINES,
  TARGET_OUTLINE_OFFSET_PX_LIMITS,
  TARGET_OUTLINE_WEIGHT_PX_LIMITS,
  VIEWPORT_FOCUS_SCALE_PERCENT_LIMITS,
  type BACKDROP_CLICK_BEHAVIORS,
  type LodariqBlock,
  type Target,
} from '@lodariq/schema';
import type { ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot, StepEmphasisPatch } from '../types';
import {
  AuthoringRange,
  Check,
  ChevronRight,
  CircleAlert,
  Crosshair,
  Pencil,
  Play,
  RefreshCcw,
} from '../design-system';
import { PropertyChoiceField, PropertyColorField } from '../properties/property-controls';
import { INSPECTOR_SECTION_LABELS } from '../../overlay/inspector-copy';
import { targetIdOf } from '../utils';

/**
 * §4.3's target concerns, nested inside the step inspector's Target section.
 *
 * Rows rather than five more top-level sections: the inspector is capped at
 * seven and the cap is the thing keeping it from becoming a panel again (§13).
 * Nesting also keeps them next to what they are about — the ring only means
 * something once you know what it is pointed at.
 */
export function TargetSubsections({
  controller,
  snapshot,
  step,
  themeAccent,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  themeAccent?: string;
}): ReactNode {
  const targetId = targetIdOf(step);
  const target = targetId
    ? snapshot.documentState.targets.find((candidate) => candidate.id === targetId)
    : undefined;
  const rows: readonly (readonly [string, string, ReactNode])[] = [
    [
      'ringStyle',
      INSPECTOR_SECTION_LABELS.ringStyle,
      <RingStyleSection controller={controller} step={step} {...(themeAccent ? { themeAccent } : {})} />,
    ],
    ['spotlight', INSPECTOR_SECTION_LABELS.spotlight, <SpotlightSection controller={controller} step={step} />],
    ['evidence', INSPECTOR_SECTION_LABELS.evidence, <EvidenceSection snapshot={snapshot} target={target} />],
    ['approach', INSPECTOR_SECTION_LABELS.approach, <ApproachSection controller={controller} step={step} target={target} />],
    ['repair', INSPECTOR_SECTION_LABELS.repair, <RepairSection controller={controller} snapshot={snapshot} step={step} />],
  ];
  return (
    <div className="target-subsections">
      {rows.map(([id, label, body]) => (
        <details className="target-subsection" data-subsection={id} key={id}>
          <summary>
            {label}
            <ChevronRight className="inspector-section-chevron" size={11} strokeWidth={2} aria-hidden="true" />
          </summary>
          <div className="target-subsection-body">{body}</div>
        </details>
      ))}
    </div>
  );
}

function emphasisPatch(
  controller: LocalAuthoringFrameController,
  step: LodariqBlock,
  next: StepEmphasisPatch,
): void {
  controller.patchStepEmphasis(step.id, next);
}

/** Everything the published ring draws: colour, weight, offset, line, glow, pulse, corners. */
function RingStyleSection({
  controller,
  step,
  themeAccent,
}: {
  controller: LocalAuthoringFrameController;
  step: LodariqBlock;
  /** The Brand accent the ring falls back to, so the swatch shows the real colour. */
  themeAccent?: string;
}): ReactNode {
  const outline = step.props.emphasis?.targetOutline;
  const patch = (next: Parameters<typeof emphasisPatch>[2]): void =>
    emphasisPatch(controller, step, next);
  return (
    <div className="step-emphasis" data-target-section="ringStyle">
      {/*
        A colour, not a role name: "onAccent" is implementation language and the
        creator cannot see what it looks like. The role is still the default and
        Reset goes back to it, the way the popup surface already works.
      */}
      <PropertyColorField
        customized={Boolean(outline?.color)}
        label={authoringText('Ring colour')}
        onChange={(color) => patch({ targetOutline: { color } })}
        onReset={() => patch({ targetOutline: { color: undefined } })}
        presentation="menu"
        resetLabel={authoringText('Use Brand accent')}
        value={outline?.color ?? themeAccent ?? '#7c8cff'}
      />
      <AuthoringRange
        label={authoringText('Weight')}
        max={TARGET_OUTLINE_WEIGHT_PX_LIMITS.max}
        min={TARGET_OUTLINE_WEIGHT_PX_LIMITS.min}
        onValueChange={(value) => patch({ targetOutline: { weightPx: value } })}
        step={1}
        unit="px"
        value={outline?.weightPx ?? 2}
      />
      <AuthoringRange
        label={authoringText('Offset')}
        max={TARGET_OUTLINE_OFFSET_PX_LIMITS.max}
        min={TARGET_OUTLINE_OFFSET_PX_LIMITS.min}
        onValueChange={(value) => patch({ targetOutline: { offsetPx: value } })}
        step={1}
        unit="px"
        value={outline?.offsetPx ?? 4}
      />
      <PropertyChoiceField
        label={authoringText('Line')}
        presentation="track"
        onChange={(value) =>
          patch({
            targetOutline: { line: value as (typeof TARGET_OUTLINE_LINES)[number] },
          })
        }
        options={TARGET_OUTLINE_LINES.map((line) => ({ value: line, label: line }))}
        value={outline?.line ?? 'solid'}
      />
      <PropertyChoiceField
        label={authoringText('Glow')}
        presentation="track"
        onChange={(value) => patch({ targetOutline: { glow: value === 'on' } })}
        options={[
          { value: 'off', label: authoringText('Off') },
          { value: 'on', label: authoringText('On') },
        ]}
        value={outline?.glow ? 'on' : 'off'}
      />
      <PropertyChoiceField
        label={authoringText('Pulse')}
        presentation="track"
        onChange={(value) => patch({ targetOutline: { pulse: value === 'on' } })}
        options={[
          { value: 'off', label: authoringText('Off') },
          { value: 'on', label: authoringText('On') },
        ]}
        value={outline?.pulse ? 'on' : 'off'}
      />
      <PropertyChoiceField
        label={authoringText('Corners')}
        presentation="track"
        onChange={(value) =>
          patch({ targetOutline: { followTargetRadius: value === 'follow' } })
        }
        options={[
          { value: 'follow', label: authoringText('Follow its corners') },
          { value: 'fixed', label: authoringText('Fixed corners') },
        ]}
        value={outline?.followTargetRadius === false ? 'fixed' : 'follow'}
      />
      <p className="storyboard-property-hint">
        {authoringText(
          'A ring that inherits the element’s own radius reads as part of the product, not a box drawn on top of it.',
        )}
      </p>
    </div>
  );
}

/** The dim, what a click on it does, and where the viewport goes. */
function SpotlightSection({
  controller,
  step,
}: {
  controller: LocalAuthoringFrameController;
  step: LodariqBlock;
}): ReactNode {
  const emphasis = step.props.emphasis;
  const backdrop = emphasis?.backdrop;
  const focus = emphasis?.viewportFocus;
  const patch = (next: Parameters<typeof emphasisPatch>[2]): void =>
    emphasisPatch(controller, step, next);
  return (
    <div className="step-emphasis" data-target-section="spotlight">
      <PropertyChoiceField
        label={authoringText('Dim everything else')}
        presentation="track"
        onChange={(value) =>
          patch(
            value === 'off'
              ? { backdrop: undefined }
              : { backdrop: { dimPercent: backdrop?.dimPercent ?? 50, clickBehavior: 'none' } },
          )
        }
        options={[
          { value: 'off', label: authoringText('Off') },
          { value: 'on', label: authoringText('On') },
        ]}
        value={backdrop ? 'on' : 'off'}
      />
      {backdrop ? (
        <>
          <AuthoringRange
            label={authoringText('Dim level')}
            max={BACKDROP_DIM_PERCENT_LIMITS.max}
            min={BACKDROP_DIM_PERCENT_LIMITS.min}
            onValueChange={(value) => patch({ backdrop: { dimPercent: value } })}
            step={5}
            unit="%"
            value={backdrop.dimPercent}
          />
          <PropertyChoiceField
            label={authoringText('Clicking the dimmed area')}
            presentation="menu"
            onChange={(value) =>
              patch({
                backdrop: { clickBehavior: value as (typeof BACKDROP_CLICK_BEHAVIORS)[number] },
              })
            }
            options={[
              { value: 'none', label: authoringText('Does nothing') },
              { value: 'advance', label: authoringText('Moves to the next step') },
              { value: 'dismiss', label: authoringText('Dismisses the tour') },
            ]}
            value={backdrop.clickBehavior}
          />
        </>
      ) : null}
      <p className="storyboard-property-hint">
        {authoringText(
          'One soft mask that eases between steps, not four rectangles. The dim colour comes from your theme.',
        )}
      </p>
      <PropertyChoiceField
        label={authoringText('When the step opens')}
        presentation="track"
        onChange={(value) =>
          patch({
            viewportFocus: {
              behavior: value === 'zoom' ? 'zoom' : 'scroll-into-view',
              ...(value === 'zoom' ? { scalePercent: focus?.scalePercent ?? 120 } : {}),
            },
          })
        }
        options={[
          { value: 'scroll-into-view', label: authoringText('Scroll it into view') },
          { value: 'zoom', label: authoringText('Zoom to it') },
        ]}
        value={focus?.behavior ?? 'scroll-into-view'}
      />
      {focus?.behavior === 'zoom' ? (
        <>
          <AuthoringRange
            label={authoringText('Zoom level')}
            max={VIEWPORT_FOCUS_SCALE_PERCENT_LIMITS.max}
            min={VIEWPORT_FOCUS_SCALE_PERCENT_LIMITS.min}
            onValueChange={(value) =>
              patch({ viewportFocus: { behavior: 'zoom', scalePercent: value } })
            }
            step={5}
            unit="%"
            value={focus.scalePercent ?? 120}
          />
          <p className="storyboard-property-hint">
            {authoringText(
              'Zoom transforms the whole page, so it can fight sticky headers. It runs in Preview, not while you edit.',
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}

/** What was matched, in words. ADR-0016: no selector, fingerprint or DOM path. */
function EvidenceSection({
  snapshot,
  target,
}: {
  snapshot: LocalAuthoringFrameSnapshot;
  target: Target | undefined;
}): ReactNode {
  if (!target) {
    return <p className="storyboard-property-hint">{authoringText('Nothing to verify yet.')}</p>;
  }
  const identity = target.identity;
  const evidence = identity?.localizedEvidence.find(
    (entry) => entry.locale === snapshot.contentLocale,
  ) ?? identity?.localizedEvidence[0];
  const capture = identity?.captureEvidence;
  const rows: readonly (readonly [string, string])[] = [
    [authoringText('Accessible name'), evidence?.accessibleName ?? target.fingerprint.accessibleName ?? '—'],
    [authoringText('Role'), identity?.semantics.role ?? target.fingerprint.role ?? '—'],
    [
      authoringText('Nearby landmark'),
      identity?.context.ancestorRoles?.[0] ?? authoringText('Not recorded'),
    ],
    [
      authoringText('Stable across reloads'),
      capture
        ? authoringText('{stable} of {total} signals held', {
            stable: capture.stableSignalFamilies.length,
            total: capture.sampleCount,
          })
        : '—',
    ],
    [
      // Not the resolver's candidateCount: that is how many elements were
      // scored, not how many look like this one.
      authoringText('Matches on this page'),
      capture ? String(capture.uniqueCandidateCount) : authoringText('Not recorded'),
    ],
  ];
  return (
    <div data-target-section="evidence">
      <p className="storyboard-property-hint">
        {authoringText(
          'Resolved by what the element is called and what it does, confirmed by independent durable signals. No selector is stored, shown or exportable.',
        )}
      </p>
      <dl className="target-evidence-rows">
        {rows.map(([label, value]) => (
          <div className="target-evidence-row" key={label}>
            <Check size={13} strokeWidth={2.2} aria-hidden="true" />
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {/* WIRE_BE: health history is a server-side ledger; the session keeps only the last look. */}
      <div className="inspector-menu">
        <button data-target-action="history" disabled type="button">
          {authoringText('Health history — needs the hosted evidence ledger')}
        </button>
      </div>
    </div>
  );
}

/** How Lodariq reaches a target that is not on this screen. Semantic waits, never timers. */
function ApproachSection({
  controller,
  step,
  target,
}: {
  controller: LocalAuthoringFrameController;
  step: LodariqBlock;
  target: Target | undefined;
}): ReactNode {
  const legs = target?.approach?.legs ?? [];
  return (
    <div data-target-section="approach">
      <p className="storyboard-property-hint">
        {authoringText(
          'How Lodariq will get here. Each line waits on a semantic condition — an element appears, a route changes, text appears. Never a timer.',
        )}
      </p>
      {legs.length ? (
        <ol className="target-approach-legs">
          {legs.map((leg, index) => (
            <li key={`${leg.label}-${index}`}>
              <span className="target-approach-index">{index + 1}</span>
              <span>{leg.label}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="target-approach-empty">
          {authoringText('Nothing recorded — this target is on the screen you started from.')}
        </p>
      )}
      <div className="inspector-menu">
        {/* WIRE_IFRAME: replaying a route means driving the host page from the frame. */}
        <button data-target-action="approach-replay" disabled type="button">
          <Play size={13} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Replay — needs the host-page bridge')}
        </button>
        {/* WIRE_DB: legs are stored but nothing writes an edited label back yet. */}
        <button data-target-action="approach-edit" disabled type="button">
          <Pencil size={13} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Edit the recipe — not writable yet')}
        </button>
        <button
          data-target-action="approach-record"
          onClick={() => controller.startTargetPick(step.id)}
          type="button"
        >
          <Crosshair size={13} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Record again')}
        </button>
      </div>
    </div>
  );
}

/**
 * Drift, and what to do about it. A proposal, never an automatic mutation —
 * ADR-0014 forbids changing a live release.
 */
function RepairSection({
  controller,
  snapshot,
  step,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
}): ReactNode {
  const targetId = targetIdOf(step);
  const health = targetId ? snapshot.targetHealth.get(targetId) : undefined;
  const observed = health?.currentObservation;
  const drifted = Boolean(observed && observed.state !== 'found' && health?.lastVerified);
  if (!drifted) {
    return (
      <div data-target-section="repair">
        <p className="target-repair-clear">
          <Check size={14} strokeWidth={2.2} aria-hidden="true" />
          <span>{authoringText('No drift detected on this target.')}</span>
        </p>
        {/* WIRE_BE: simulating a changed page needs the hosted resolver sandbox. */}
        <div className="inspector-menu">
          <button data-target-action="repair-simulate" disabled type="button">
            {authoringText('Test against a changed page — needs the hosted checker')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div data-target-section="repair">
      <p className="target-repair-drift">
        <CircleAlert size={13} strokeWidth={2.2} aria-hidden="true" />
        <span>
          {authoringText('This target no longer resolves cleanly: {reason}.', {
            reason: observed?.reasonCode ?? observed?.state ?? 'unknown',
          })}
        </span>
      </p>
      <div className="inspector-menu">
        <button
          data-target-action="repair-repoint"
          onClick={() => controller.startTargetPick(step.id)}
          type="button"
        >
          <RefreshCcw size={13} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Re-point this step')}
        </button>
      </div>
      <p className="storyboard-property-hint">
        {authoringText('A proposal, never an automatic mutation — a live release is never changed.')}
      </p>
    </div>
  );
}
