import { useEffect, useState } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { targetVerificationPresentation } from '../../target-verification';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { ArrowRight, ChevronDown, Crosshair, Info, X } from '../design-system';
import { PropertyChoiceField } from '../properties/property-controls';
import { TargetSubsections } from './target-inspector-sections';
import { targetIdOf, targetLabelOf } from '../utils';

/**
 * How Lodariq picks when a page holds several elements that all fit (§4.4).
 *
 * WIRE_DB: the document stores one resolved target, not a disambiguation rule, so
 * these hold for the session. The phrasings are the point — they are the seven
 * answers a creator actually gives, in their words rather than in selector terms.
 */
const RESOLUTION_OPTIONS = [
  { value: 'unique', label: authoringText('Just the one I clicked') },
  { value: 'anyMatching', label: authoringText('Any that says the same') },
  { value: 'nth', label: authoringText('The 2nd one, in reading order') },
  { value: 'first', label: authoringText('Any of them — first one wins') },
  { value: 'newest', label: authoringText('The newest row in the list') },
  { value: 'firstInList', label: authoringText('The first item in this list') },
  { value: 'insideCard', label: authoringText('The one inside the card it belongs to') },
] as const;

/**
 * The inspector's Target section (§4.4).
 *
 * States the verification result in one of three words, says what it means, then
 * two rows — what it points at, and how it chooses when several match — and the
 * three things a creator can do about it.
 *
 * No selector, fingerprint or DOM path appears here; ADR-0016 forbids it, and the
 * evidence line says what was matched in words instead.
 */
export function StepTargetSection({
  controller,
  snapshot,
  step,
  themeAccent,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  /** Brand accent, so the ring's colour swatch shows what it falls back to. */
  themeAccent?: string;
}) {
  const [resolution, setResolution] = useState('unique');
  const targetId = targetIdOf(step);
  const observed = targetId ? snapshot.targetHealth.get(targetId)?.currentObservation : undefined;

  /*
   * The ledger only hears about explicit inspections, so a target nothing had
   * asked about read "Needs context" while its ring sat on screen. Looking at
   * the section is the moment to check, and the guard keeps it to once.
   */
  useEffect(() => {
    if (!targetId || observed) return;
    controller.requestTargetInspection(step.id, targetId, 'health');
  }, [controller, observed, step.id, targetId]);

  if (!targetId) {
    return (
      <section className="step-target-section" aria-label={authoringText('Target')}>
        <p className="step-target-unpointed">
          <Info size={14} strokeWidth={2.2} aria-hidden="true" />
          <span>
            {authoringText('This step is not pointed at anything — it shows in the middle of the screen.')}
          </span>
        </p>
        <div className="inspector-menu">
          <button
            data-target-action="choose"
            onClick={() => controller.startTargetPick(step.id)}
            type="button"
          >
            <Crosshair size={14} strokeWidth={2.2} aria-hidden="true" />
            {authoringText('Point it at something…')}
          </button>
        </div>
      </section>
    );
  }

  const health = snapshot.targetHealth.get(targetId);
  const shown = targetVerificationPresentation(health?.presentation ?? 'unverified');
  const label = targetLabelOf(snapshot.documentState, targetId);

  return (
    <section className="step-target-section" aria-label={authoringText('Target')}>
      {/* The one fact worth stating before any control: is it still findable? */}
      <p className="step-target-state" data-tone={shown.tone}>
        <span className="step-target-state-label">{shown.label}</span>
      </p>
      <p className="step-target-meaning">{shown.meaning}</p>
      <p className="step-target-action">{shown.action}</p>

      <div className="rich-step-choice-field" data-presentation="menu">
        <span className="rich-step-field-label">{authoringText('Points at')}</span>
        <button
          className="inspector-pill"
          data-target-action="change"
          onClick={() => controller.startTargetPick(step.id)}
          type="button"
        >
          <span className="inspector-pill-value">{label}</span>
          {/* The chevron is the promise that clicking it opens the picker. */}
          <ChevronDown size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
      <PropertyChoiceField
        label={authoringText('When several match')}
        onChange={setResolution}
        options={RESOLUTION_OPTIONS}
        presentation="menu"
        value={resolution}
      />

      <p className="step-target-evidence">
        {authoringText(
          'Matched by what the element is called and what it does, confirmed by independent durable signals.',
        )}
      </p>

      <LocalizedTargetRow controller={controller} snapshot={snapshot} targetId={targetId} />

      {/* §4.3's other target concerns, nested rather than five more sections. */}
      <TargetSubsections
        controller={controller}
        snapshot={snapshot}
        step={step}
        {...(themeAccent ? { themeAccent } : {})}
      />

      <div className="inspector-menu">
        <button
          data-target-action="repick"
          onClick={() => controller.startTargetPick(step.id)}
          type="button"
        >
          <Crosshair size={14} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Change target')}
        </button>
        {/* WIRE_IFRAME: scrolling the host page to the element needs a bridge op. */}
        <button data-target-action="jump" disabled type="button">
          <ArrowRight size={14} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Take me to it')}
        </button>
        <button
          data-target-action="detach"
          onClick={() => controller.removeTargetFromBlock(step.id, targetId)}
          type="button"
        >
          <X size={14} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Detach from this element')}
        </button>
      </div>
    </section>
  );
}

/**
 * Per-locale target override (§7.6). Hidden on the default locale, where the
 * shared target *is* the binding, and it names the shared target so choosing an
 * override is an informed decision rather than a blind swap.
 */
function LocalizedTargetRow({
  controller,
  snapshot,
  targetId,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  targetId: string;
}) {
  const defaultLocale = snapshot.documentState.localization?.defaultLocale ?? 'en';
  if (snapshot.contentLocale === defaultLocale) return null;

  const override = controller.localizedTargetFor(targetId);
  const others = snapshot.documentState.targets.filter((target) => target.id !== targetId);

  return (
    <label className="step-target-locale" data-target-locale={snapshot.contentLocale}>
      <span>
        {authoringText('In {locale}, point at', { locale: snapshot.contentLocale })}
      </span>
      <select
        data-target-action="localize"
        onChange={(event) => controller.setLocalizedTarget(targetId, event.target.value || null)}
        value={override ?? ''}
      >
        <option value="">
          {authoringText('The shared target ({label})', {
            label: targetLabelOf(snapshot.documentState, targetId),
          })}
        </option>
        {others.map((target) => (
          <option key={target.id} value={target.id}>
            {targetLabelOf(snapshot.documentState, target.id)}
          </option>
        ))}
      </select>
    </label>
  );
}
