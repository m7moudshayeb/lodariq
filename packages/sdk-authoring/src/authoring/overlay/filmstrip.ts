import type { LodariqBlock, LodariqDocument } from '@lodariq/schema';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';
import { authoringText } from '../../i18n';
import { AUTHORING_PANEL_LABELS } from '../panel-config';
import { escapeHtml } from './html';

export function tourStepsOf(document: LodariqDocument | null): LodariqBlock[] {
  return document?.blocks.filter((block) => block.type === 'tourStep') ?? [];
}

export function tooltipOfStep(step: LodariqBlock): LodariqBlock | null {
  return step.children.find((child) => child.type === 'tooltip') ?? null;
}

export function firstHeadingText(block: LodariqBlock): string {
  if (block.type === 'heading' && block.content?.trim()) return block.content.trim();
  for (const child of block.children) {
    const text = firstHeadingText(child);
    if (text) return text;
  }
  return '';
}

/**
 * Step order only (§4.5). Operations and Close moved to the mode pill's menu,
 * because both are document-scoped and the filmstrip is Tier 1.
 */
export function createFilmstrip(doc: Document): HTMLElement {
  const filmstrip = doc.createElement('nav');
  filmstrip.className = 'overlay-filmstrip';
  filmstrip.dataset['protectedChrome'] = 'true';
  filmstrip.dataset['lodariqAuthoringControl'] = 'true';
  filmstrip.dataset['lodariqFilmstrip'] = 'true';
  filmstrip.setAttribute('role', 'navigation');
  filmstrip.setAttribute('aria-label', AUTHORING_PANEL_LABELS.filmstrip);
  filmstrip.innerHTML = `
    <span class="overlay-filmstrip-rail" aria-hidden="true">${escapeHtml(AUTHORING_PANEL_LABELS.steps)}</span>
    <div class="overlay-filmstrip-sequence">
      <ol class="overlay-filmstrip-steps" data-filmstrip-steps></ol>
      <button type="button" class="overlay-filmstrip-add" data-filmstrip-add-step aria-label="${escapeHtml(AUTHORING_PANEL_LABELS.addStep)}" title="${escapeHtml(AUTHORING_PANEL_LABELS.addStep)}">
        +
      </button>
    </div>
  `;
  return filmstrip;
}

/** Widths that read as a paragraph rather than a progress bar. */
const THUMBNAIL_LINE_WIDTHS = ['62%', '88%', '70%'] as const;
const THUMBNAIL_MAX_LINES = 3;

/**
 * What the step looks like, in miniature (§4.5).
 *
 * Derived from the step's real content rather than drawn as decoration: a
 * creator scanning seven steps is looking for the one with the image, or the one
 * with no call to action, and a generic placeholder would hide exactly that.
 */
interface StepThumbnail {
  readonly lines: number;
  readonly hasAction: boolean;
  readonly hasMedia: boolean;
}

export function stepThumbnail(step: LodariqBlock): StepThumbnail {
  let lines = 0;
  let hasAction = false;
  let hasMedia = false;
  const walk = (block: LodariqBlock): void => {
    if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'list') lines += 1;
    if (block.type === 'button' || block.type === 'link') hasAction = true;
    if (block.type === 'media') hasMedia = true;
    for (const child of block.children) walk(child);
  };
  for (const child of step.children) walk(child);
  return { lines: Math.min(lines, THUMBNAIL_MAX_LINES), hasAction, hasMedia };
}

/**
 * The filmstrip dot (§4.5). Four states, each carrying a word — status is never
 * colour alone.
 *
 * The host runs the resolver already, for the pulses, so the dot reports what it
 * genuinely observed on this screen rather than guessing:
 *
 *  - `draft`  nothing is pointed at yet
 *  - `ok`     resolved here, now
 *  - `ctx`    no candidate on this screen; it may still resolve when reached the
 *             recorded way, which is what the approach recipe is for
 *  - `bad`    candidates exist but the evidence gates failed — several match, or
 *             the identity no longer holds. This is the one that blocks publish.
 */
export type FilmstripStepState = 'ok' | 'ctx' | 'bad' | 'draft';

export const FILMSTRIP_STATE_WORDS: Readonly<Record<FilmstripStepState, string>> = {
  ok: authoringText('Verified'),
  ctx: authoringText('Needs context'),
  bad: authoringText('Cannot find'),
  draft: authoringText('Draft'),
};

export function stepTargetState(
  step: LodariqBlock,
  documentState: LodariqDocument | null,
  root: ParentNode = document,
): FilmstripStepState {
  const targetId = tooltipOfStep(step)?.props.targetId ?? step.props.targetId;
  if (!targetId) return 'draft';
  const target = documentState?.targets.find((item) => item.id === targetId);
  if (!target) return 'bad';
  const resolved = resolveTarget(target, root);
  if (resolved.state === 'found') return 'ok';
  if (resolved.state === 'missing') return 'ctx';
  return 'bad';
}

/**
 * A step branches when one of its actions carries conditional rules — the flow
 * map owns the whole graph, and this only says "the sequence forks here" so a
 * creator scanning the strip is never surprised by it.
 */
function stepBranches(step: LodariqBlock): boolean {
  const walk = (block: LodariqBlock): boolean => {
    const transition = block.props.action?.transition;
    if (transition && transition.rules.length > 0) return true;
    return block.children.some(walk);
  };
  return step.children.some(walk);
}

export function renderFilmstripSteps(
  filmstrip: HTMLElement,
  documentState: LodariqDocument | null,
  activeStepId: string | null,
  selectedStepIds: ReadonlySet<string> = new Set(),
  /** Who is on which step (§15.2 layer 1). Absent means nobody else is here. */
  presence?: FilmstripPresence,
): void {
  const list = filmstrip.querySelector<HTMLOListElement>('[data-filmstrip-steps]');
  if (!list) return;
  const steps = tourStepsOf(documentState);
  list.replaceChildren();
  steps.forEach((step, index) => {
    // Insert *between*, not only at the end (§4.5): the step a creator realises
    // they need is almost never the last one.
    list.appendChild(renderInsertBetween(list.ownerDocument, index));
    const item = list.ownerDocument.createElement('li');
    const button = list.ownerDocument.createElement('button');
    const state = stepTargetState(step, documentState, list.ownerDocument);
    button.type = 'button';
    button.className = 'overlay-filmstrip-step';
    button.dataset['stepId'] = step.id;
    button.dataset['targetState'] = state;
    if (stepBranches(step)) button.dataset['branches'] = 'true';
    button.setAttribute('aria-current', step.id === activeStepId ? 'step' : 'false');
    // Multi-select is a real selection, so it is announced rather than only
    // ringed — via `aria-pressed`, because `aria-selected` is not allowed on a
    // plain button and screen readers drop it.
    button.setAttribute('aria-pressed', String(selectedStepIds.has(step.id)));
    if (selectedStepIds.has(step.id)) button.dataset['batchSelected'] = 'true';
    const number = typeof step.props.index === 'number' ? step.props.index + 1 : index + 1;
    const title = firstHeadingText(step) || authoringText('Step {number}', { number });
    /*
     * Number, state dot and the branch mark belong to the chip, not to the
     * picture inside it: the thumbnail clips its overflow so a miniature reads
     * as one object, and a badge drawn inside it lands on the first line.
     */
    button.replaceChildren(
      textSpan(list.ownerDocument, 'overlay-filmstrip-step-number', String(number)),
      renderStepThumbnail(list.ownerDocument, stepThumbnail(step)),
      textSpan(list.ownerDocument, 'overlay-filmstrip-step-title', title),
    );
    if (stepBranches(step)) {
      const branch = list.ownerDocument.createElement('span');
      branch.className = 'overlay-filmstrip-step-branch';
      branch.setAttribute('aria-hidden', 'true');
      button.appendChild(branch);
    }
    // The state word rides in the tooltip and the accessible name, so the dot is
    // never the only carrier (§3.1a).
    button.title = `${title} — ${FILMSTRIP_STATE_WORDS[state]}`;
    button.setAttribute(
      'aria-label',
      authoringText('Edit step {number}: {title} — {state}', {
        number,
        title,
        state: FILMSTRIP_STATE_WORDS[state],
      }),
    );
    item.appendChild(button);
    /**
     * Removal sits where insertion sits. Only from the second step on: an
     * experience with no steps cannot be published, so the last one has no remove
     * affordance rather than a disabled one that explains itself on hover.
     */
    if (steps.length > 1) {
      const remove = list.ownerDocument.createElement('button');
      remove.type = 'button';
      remove.className = 'overlay-filmstrip-step-remove';
      remove.dataset['removeStepId'] = step.id;
      const removeLabel = authoringText('Delete step {number}', { number });
      remove.setAttribute('aria-label', removeLabel);
      remove.title = removeLabel;
      remove.textContent = '×';
      item.appendChild(remove);
    }
    const peers = presence?.peersOnStep(step.id) ?? [];
    if (peers.length > 0) item.appendChild(renderPeerAvatars(list.ownerDocument, peers));
    list.appendChild(item);
  });
  list.appendChild(renderInsertBetween(list.ownerDocument, steps.length));
}

/**
 * The hairline between two steps, which becomes a ⊕ on hover. Always in the DOM
 * so it is reachable by keyboard, and named by the position it inserts at.
 */
function renderInsertBetween(doc: Document, index: number): HTMLElement {
  const item = doc.createElement('li');
  item.className = 'overlay-filmstrip-insert-slot';
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'overlay-filmstrip-insert';
  button.dataset['insertStepAt'] = String(index);
  const label = authoringText('Insert a step at position {number}', { number: index + 1 });
  button.setAttribute('aria-label', label);
  button.title = label;
  const disc = doc.createElement('span');
  disc.className = 'overlay-filmstrip-insert-disc';
  disc.setAttribute('aria-hidden', 'true');
  disc.textContent = '+';
  button.appendChild(disc);
  item.appendChild(button);
  return item;
}

/**
 * The picture: the step's own lines, media band and call-to-action bar, in
 * miniature. Entirely decorative — the button's accessible name already says
 * which step this is, what it is called and what state it is in.
 */
function renderStepThumbnail(doc: Document, shape: StepThumbnail): HTMLElement {
  const frame = doc.createElement('span');
  frame.className = 'overlay-filmstrip-step-frame';
  frame.setAttribute('aria-hidden', 'true');

  if (shape.hasMedia) {
    const media = doc.createElement('span');
    media.className = 'overlay-filmstrip-step-media';
    frame.appendChild(media);
  }

  const lines = doc.createElement('span');
  lines.className = 'overlay-filmstrip-step-lines';
  // A step with no words still gets one line, so an empty card is not a blank tile.
  for (let index = 0; index < Math.max(1, shape.lines); index += 1) {
    const line = doc.createElement('span');
    line.className = 'overlay-filmstrip-step-line';
    line.style.width = THUMBNAIL_LINE_WIDTHS[index % THUMBNAIL_LINE_WIDTHS.length]!;
    lines.appendChild(line);
  }
  frame.appendChild(lines);

  if (shape.hasAction) {
    const action = doc.createElement('span');
    action.className = 'overlay-filmstrip-step-action';
    frame.appendChild(action);
  }
  return frame;
}

function textSpan(doc: Document, className: string, text: string): HTMLElement {
  const span = doc.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

export interface FilmstripPeer {
  readonly name: string;
  readonly initials: string;
}

export interface FilmstripPresence {
  readonly peersOnStep: (stepId: string) => readonly FilmstripPeer[];
}

/**
 * Avatars, not a count: knowing *who* is on a step is what prevents the conflict
 * socially (§15.2). Names ride in `title` and in the accessible label, so the
 * information is never colour-only.
 */
function renderPeerAvatars(doc: Document, peers: readonly FilmstripPeer[]): HTMLElement {
  const group = doc.createElement('span');
  group.className = 'overlay-filmstrip-peers';
  group.setAttribute('role', 'img');
  group.setAttribute(
    'aria-label',
    authoringText('{names} here', { names: peers.map((peer) => peer.name).join(', ') }),
  );
  for (const peer of peers.slice(0, FILMSTRIP_PEER_AVATAR_LIMIT)) {
    const avatar = doc.createElement('span');
    avatar.className = 'overlay-filmstrip-peer';
    avatar.dataset['peer'] = peer.initials;
    avatar.title = peer.name;
    avatar.textContent = peer.initials;
    group.appendChild(avatar);
  }
  if (peers.length > FILMSTRIP_PEER_AVATAR_LIMIT) {
    const overflow = doc.createElement('span');
    overflow.className = 'overlay-filmstrip-peer';
    overflow.dataset['peerOverflow'] = 'true';
    overflow.textContent = `+${peers.length - FILMSTRIP_PEER_AVATAR_LIMIT}`;
    group.appendChild(overflow);
  }
  return group;
}

/** Three faces fit beside a step number; the rest become `+n`. */
export const FILMSTRIP_PEER_AVATAR_LIMIT = 3;
