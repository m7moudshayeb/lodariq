import type { LodariqBlock } from '@lodariq/schema';
import { useState, type ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import { Columns2, GripVertical, Pencil, Search } from '../design-system';
import { targetVerificationPresentation } from '../../target-verification';
import { blockDisplayTitle, targetIdOf } from '../utils';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

/**
 * Every step on one surface (wishlist 4.1). The filmstrip shows *order*; this
 * shows the whole story, which is how a repeated step gives itself away.
 * Editing is inline, and two or three steps can be opened side by side so the
 * voice stays consistent — copy drifts when it is written through a keyhole.
 */
export function OperationsStoryboard({
  controller,
  snapshot,
  steps,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  steps: readonly LodariqBlock[];
}): ReactNode {
  const [compare, setCompare] = useState<readonly string[]>([]);
  const repetition = repeatedPairs(steps);

  const toggleCompare = (id: string): void => {
    setCompare((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(-3),
    );
  };

  return (
    <section className="operations-storyboard" aria-label={authoringText('Storyboard')}>
      {/*
        Three views of the same set, not three places. Side-by-side is the one
        thing here you cannot do by looking, and the repetition count is the one
        thing you would never think to look for.
      */}
      <div className="ops-pill-tabs">
        <button
          aria-pressed={compare.length === 0}
          onClick={() => setCompare([])}
          type="button"
        >
          {authoringText('All {count}', { count: steps.length })}
        </button>
        <button aria-pressed={compare.length >= 2} disabled type="button"
          title={authoringText('Tick two or three steps below.')}>
          <Columns2 size={12} strokeWidth={2} aria-hidden="true" />
          {authoringText('Side by side ({count})', { count: compare.length })}
        </button>
        <button aria-pressed={false} disabled={repetition.length === 0} type="button"
          title={
            repetition.length
              ? authoringText('{count} pairs of steps cover the same ground.', {
                  count: repetition.length,
                })
              : authoringText('No two steps cover the same ground.')
          }>
          <Search size={12} strokeWidth={2} aria-hidden="true" />
          {authoringText('Repetition ({count})', { count: repetition.length })}
        </button>
      </div>

      {compare.length >= 2 ? (
        <div className="ops-box storyboard-compare" aria-label={authoringText('Side by side')}>
          <h3>{authoringText('Side by side')}</h3>
          <div className="storyboard-compare-grid">
            {compare.map((id) => {
              const step = steps.find((candidate) => candidate.id === id);
              if (!step) return null;
              return (
                <article key={id} className="storyboard-compare-column">
                  <h4>{blockDisplayTitle(step)}</h4>
                  <StoryboardFields context="compare" controller={controller} step={step} />
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {repetition.length ? (
        <p className="ops-callout" data-tone="warning" role="status">
          {authoringText('{count} pairs of steps cover the same ground.', {
            count: repetition.length,
          })}
        </p>
      ) : null}

      <div className="ops-cols" data-cols="4">
        {steps.map((step, index) => {
          const targetId = targetIdOf(step);
          const health = targetId ? snapshot.targetHealth.get(targetId) : undefined;
          const shown = targetVerificationPresentation(health?.presentation ?? 'unverified');
          const overlaps = repetition.some((pair) => pair.includes(step.id));
          const selected = compare.includes(step.id);
          const dropPosition =
            snapshot.dragTargetBlockId === step.id ? snapshot.dragTargetPosition : null;
          return (
            <article
              key={step.id}
              className={`ops-box storyboard-card ${dropPosition ? `drop-${dropPosition}` : ''}`.trim()}
              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
              aria-label={authoringText('Edit step {number}: {title}', {
                number: index + 1,
                title: blockDisplayTitle(step),
              })}
              data-block-id={step.id}
              data-drop-position={dropPosition ?? undefined}
              data-selected={selected ? 'true' : 'false'}
              data-overlaps={overlaps ? 'true' : 'false'}
              onDragOver={(event) =>
                controller.handleBlockDragOver(event, {
                  selector: '.storyboard-card[data-block-id]',
                })
              }
              onDrop={(event) =>
                controller.handleBlockDrop(event, step.id, {
                  selector: '.storyboard-card[data-block-id]',
                })
              }
              onFocus={(event) => {
                if (event.target === event.currentTarget) controller.selectBlock(step.id);
              }}
              onKeyDown={(event) => controller.handleBlockKeyDown(event, step.id)}
              tabIndex={0}
            >
              <h3>
                <button
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                  aria-label={authoringText('Drag step {number}', { number: index + 1 })}
                  className="storyboard-card-drag"
                  data-operations-focus-key={`storyboard-drag:${step.id}`}
                  draggable
                  onDragEnd={() => controller.endDraggingBlock()}
                  onDragStart={(event) => controller.startDraggingBlock(step.id, event)}
                  onKeyDown={(event) =>
                    controller.handleBlockReorderKeyDown(event, step.id, 'vertical')
                  }
                  title={authoringText('Drag to reorder step')}
                  type="button"
                >
                  <GripVertical size={13} strokeWidth={2} aria-hidden="true" />
                </button>
                <span className="storyboard-card-index">{index + 1}</span>
                {blockDisplayTitle(step)}
                <span className="ops-box-actions">
                  <span className="ops-tag" data-tone={storyboardTone(shown.tone)}>
                    {shown.label}
                  </span>
                </span>
              </h3>
              <StoryboardFields context="card" controller={controller} step={step} />
              <div className="ops-row storyboard-card-footer">
                <button
                  className="ops-btn"
                  data-size="sm"
                  data-operations-focus-key={`storyboard-open:${step.id}`}
                  onClick={() => {
                    controller.activateTourStep(step.id);
                    controller.closeOperationsMode();
                  }}
                  type="button"
                >
                  <Pencil size={11} strokeWidth={2} aria-hidden="true" />
                  {authoringText('Open')}
                </button>
                <button
                  className="ops-btn"
                  data-size="sm"
                  data-variant={selected ? 'primary' : undefined}
                  data-operations-focus-key={`storyboard-select:${step.id}`}
                  onClick={() => toggleCompare(step.id)}
                  type="button"
                >
                  {selected ? authoringText('Deselect') : authoringText('Select')}
                </button>
                <span className="ops-spacer" />
                <span className="storyboard-card-words">
                  {authoringText('{count} words', { count: stepWordCount(step) })}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StoryboardFields({
  context,
  controller,
  step,
}: {
  context: 'card' | 'compare';
  controller: LocalAuthoringFrameController;
  step: LodariqBlock;
}): ReactNode {
  return (
    <div className="storyboard-card-fields">
      {editableTextBlocks(step).map((block) => (
        <label className="storyboard-inline-field" data-kind={block.type} key={block.id}>
          <span>{storyboardFieldLabel(block)}</span>
          <textarea
            data-action="edit-content"
            data-block-id={block.id}
            data-operations-focus-key={`storyboard-${context}:${step.id}:${block.id}`}
            defaultValue={block.content ?? ''}
            key={`${block.id}:${block.content ?? ''}`}
            onBlur={(event) => commitText(controller, block.id, event.currentTarget.value)}
            rows={block.type === 'paragraph' ? 4 : 2}
          />
        </label>
      ))}
    </div>
  );
}

/** The verification vocabulary, in the tag tones the sheet already speaks. */
function storyboardTone(tone: string): string | undefined {
  if (tone === 'ok') return 'ok';
  if (tone === 'warn') return 'warning';
  if (tone === 'bad') return 'blocker';
  return undefined;
}

function commitText(
  controller: LocalAuthoringFrameController,
  blockId: string,
  value: string,
): void {
  controller.commitRichTextContent(blockId, value);
}

function descendants(block: LodariqBlock): LodariqBlock[] {
  return [block, ...block.children.flatMap(descendants)];
}

function firstOfType(step: LodariqBlock, type: string): LodariqBlock | undefined {
  return descendants(step).find((block) => block.type === type);
}

const bodyOf = (step: LodariqBlock): string => firstOfType(step, 'paragraph')?.content ?? '';

function editableTextBlocks(step: LodariqBlock): LodariqBlock[] {
  return descendants(step).filter((block) =>
    block.type === 'heading' ||
    block.type === 'paragraph' ||
    block.type === 'button' ||
    block.type === 'link',
  );
}

function storyboardFieldLabel(block: LodariqBlock): string {
  if (block.type === 'heading') return authoringText('Heading');
  if (block.type === 'paragraph') {
    return authoringText('Body · {count} words', { count: wordCount(block.content ?? '') });
  }
  return authoringText('Action');
}

function stepWordCount(step: LodariqBlock): number {
  return editableTextBlocks(step).reduce((count, block) => count + wordCount(block.content ?? ''), 0);
}

function wordCount(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

/**
 * Jaccard overlap on the words that carry meaning. Crude on purpose — this is a
 * prompt to look, not a verdict, and a cleverer measure would invite trust it
 * has not earned.
 */
function repeatedPairs(steps: readonly LodariqBlock[]): ReadonlyArray<readonly [string, string]> {
  const words = steps.map(
    (step) =>
      new Set(
        bodyOf(step)
          .toLowerCase()
          .split(/\W+/u)
          .filter((word) => word.length > 3),
      ),
  );
  const pairs: Array<readonly [string, string]> = [];
  for (const [i, left] of words.entries()) {
    for (const [j, right] of words.entries()) {
      if (j <= i || left.size === 0 || right.size === 0) continue;
      const shared = [...left].filter((word) => right.has(word)).length;
      const union = new Set([...left, ...right]).size;
      if (union > 0 && shared / union > 0.3) {
        const a = steps[i]?.id;
        const b = steps[j]?.id;
        if (a && b) pairs.push([a, b]);
      }
    }
  }
  return pairs;
}
