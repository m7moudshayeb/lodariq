/**
 * What §7.5's palette can run, and what a typed sentence is understood to mean.
 *
 * Every row here is a route to something the build already does — the palette is
 * a faster way to reach a control, never a second implementation of it. A row
 * with nowhere to go does not belong in this list; it belongs in the section
 * that has not been built yet.
 */
import { authoringText } from '../../i18n';
import { MODE_PILL_COPY } from './mode-pill-copy';

/** Every action a command may take. The shell supplies these; nothing else does. */
export interface PaletteActions {
  readonly addStep: () => void;
  readonly retarget: () => void;
  readonly toggleRecording: () => void;
  readonly openOperations: (tab: string) => void;
  readonly preview: () => void;
  readonly simulateUser: () => void;
  readonly hidePanels: () => void;
  /** Sends the creator's words to the frame, which anchors them to a step (§7.8). */
  readonly ask: (prompt: string) => void;
}

export interface PaletteCommand {
  readonly id: string;
  readonly label: string;
  /** Right-aligned on the row: the prototype's `.sub`, and what search matches too. */
  readonly group: string;
  /** Driven by the session's assist provider, so it is disabled without one. */
  readonly assist?: boolean;
  readonly run: (actions: PaletteActions) => void;
}

export const PALETTE_COPY = {
  region: authoringText('Command palette'),
  open: authoringText('Ask Lodariq'),
  placeholder: authoringText('Ask Lodariq to change this step, or search commands…'),
  /** The row that carries whatever was typed, when no command matched it. */
  freeform: (query: string) => authoringText('Ask Lodariq for “{query}”', { query }),
  proposedEdit: authoringText('Proposed edit'),
  /** Same sentence the frame uses when an ask arrives without a provider (§7.4). */
  assistUnavailable: authoringText(
    'Assist is available from an authenticated authoring session.',
  ),
} as const;

const GROUP = {
  ai: authoringText('AI'),
  steps: authoringText('Steps'),
  targeting: authoringText('Targeting'),
  operations: MODE_PILL_COPY.groupOperations,
  appearance: authoringText('Appearance'),
  language: authoringText('Language'),
  release: authoringText('Release'),
  play: MODE_PILL_COPY.groupPlay,
  quality: authoringText('Quality'),
  panels: authoringText('Panels'),
} as const;

/**
 * The catalogue, in the prototype's order.
 *
 * Two of its rows are not here. `Predict the layout at every viewport` is the
 * same pass as `Simulate a confused first-time user` in this build — both run
 * the predictive check and land on its findings — and two rows for one action
 * is how a palette stops being trusted. `Open the flow map` and
 * `Open the storyboard` keep the mode pill's wording rather than the
 * prototype's, so the same destination is not named two ways.
 */
export const PALETTE_COMMANDS: readonly PaletteCommand[] = [
  {
    id: 'ai-shorter',
    label: authoringText('Make this step shorter'),
    group: GROUP.ai,
    assist: true,
    run: (a) => a.ask(authoringText('Make this step shorter')),
  },
  {
    id: 'ai-draft',
    label: authoringText('Draft this step from the target'),
    group: GROUP.ai,
    assist: true,
    run: (a) => a.ask(authoringText('Draft this step from the target')),
  },
  {
    id: 'ai-narration',
    label: authoringText('Write the spoken script'),
    group: GROUP.ai,
    assist: true,
    run: (a) => a.ask(authoringText('Write the spoken script')),
  },
  /**
   * WIRE_IFRAME: four rows below land on the section that performs the operation
   * rather than performing it. The prototype opens the section *and* fires the
   * action (`openOps('appearance'); runBrandSampler()`); nothing crosses the
   * bridge to start one, because `open-operations` carries a tab and no verb.
   *
   * Closing it means a chrome action per operation — sample the brand, translate
   * every locale, publish to staging — each of which is a document write the
   * frame already knows how to do. Until then the row is a route, not a lie: it
   * puts the creator on the control with their finger already on it.
   */
  {
    id: 'brand-theme',
    label: authoringText('Generate a brand theme from my product'),
    group: GROUP.appearance,
    run: (a) => a.openOperations('appearance'),
  },
  { id: 'add-step', label: authoringText('Add a step'), group: GROUP.steps, run: (a) => a.addStep() },
  {
    id: 'retarget',
    label: authoringText('Change this step’s target'),
    group: GROUP.targeting,
    run: (a) => a.retarget(),
  },
  {
    id: 'record',
    label: MODE_PILL_COPY.recordSteps,
    group: GROUP.targeting,
    run: (a) => a.toggleRecording(),
  },
  {
    id: 'flow',
    label: MODE_PILL_COPY.flowMap,
    group: GROUP.operations,
    run: (a) => a.openOperations('flow'),
  },
  {
    id: 'storyboard',
    label: MODE_PILL_COPY.storyboard,
    group: GROUP.operations,
    run: (a) => a.openOperations('storyboard'),
  },
  {
    id: 'check',
    label: MODE_PILL_COPY.checkReport,
    group: GROUP.operations,
    run: (a) => a.openOperations('check'),
  },
  {
    id: 'translate',
    label: authoringText('Translate into every locale'),
    group: GROUP.language,
    run: (a) => a.openOperations('translation'),
  },
  {
    id: 'compare',
    label: authoringText('Compare two versions'),
    group: GROUP.release,
    run: (a) => a.openOperations('recovery'),
  },
  {
    id: 'publish',
    label: authoringText('Publish to staging'),
    group: GROUP.release,
    run: (a) => a.openOperations('release'),
  },
  {
    id: 'preview',
    label: MODE_PILL_COPY.previewAsUser,
    group: GROUP.play,
    run: (a) => a.preview(),
  },
  /**
   * WIRE_BE: a narrated demo needs narration audio, which is not in the immutable
   * artifact yet (§10a). This opens the section where the script is written, which
   * is as far as the build goes — the same gap the preview bar's play carries.
   */
  {
    id: 'narrated',
    label: MODE_PILL_COPY.narratedDemo,
    group: GROUP.play,
    run: (a) => a.openOperations('narration'),
  },
  {
    id: 'simulate',
    label: MODE_PILL_COPY.simulateConfusedUser,
    group: GROUP.quality,
    assist: false,
    run: (a) => a.simulateUser(),
  },
  {
    id: 'hide-panels',
    label: MODE_PILL_COPY.hideAllPanels,
    group: GROUP.panels,
    run: (a) => a.hidePanels(),
  },
];

/**
 * A sentence read as one of the five proven rewrite verbs (§7.4).
 *
 * The prototype also reads `add a button`, `add media` and `turn the spotlight
 * on` as proposed edits. Those are not offered here: the assist contract's only
 * writable path is a block's content, so a proposal that inserted a block or set
 * a spotlight would be rejected by the machine that applies it. Offering an
 * answer the build would refuse is worse than not offering one.
 */
const PHRASINGS: readonly { readonly test: RegExp; readonly label: string }[] = [
  { test: /short|brief|tight|trim/i, label: authoringText('Shorten this step') },
  { test: /friend|warm|casual/i, label: authoringText('Make it friendlier') },
  { test: /formal|professional/i, label: authoringText('Make it more formal') },
  { test: /clear|simpl|plain/i, label: authoringText('Make it clearer') },
  { test: /grammar|typo|spell/i, label: authoringText('Fix the grammar') },
];

/** Long enough to be a sentence rather than a search — the prototype's threshold. */
const PHRASING_MIN_LENGTH = 6;

export function matchedPhrasings(query: string): readonly PaletteCommand[] {
  if (query.trim().length <= PHRASING_MIN_LENGTH) return [];
  return PHRASINGS.filter((phrasing) => phrasing.test.test(query)).map((phrasing) => ({
    id: `phrasing-${phrasing.label}`,
    label: phrasing.label,
    group: PALETTE_COPY.proposedEdit,
    assist: true,
    run: (actions: PaletteActions) => actions.ask(phrasing.label),
  }));
}

export function matchedCommands(query: string): readonly PaletteCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return PALETTE_COMMANDS;
  return PALETTE_COMMANDS.filter(
    (command) =>
      command.label.toLowerCase().includes(needle) ||
      command.group.toLowerCase().includes(needle),
  );
}
