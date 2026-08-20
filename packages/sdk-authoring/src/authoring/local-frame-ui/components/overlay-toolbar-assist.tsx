import { useState, type ReactNode } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { AiAssistRequest, AiRewriteVerb } from '../../ai/assist-contract';
import type { LocalAuthoringFrameController } from '../controller';
import {
  Accessibility,
  Bot,
  Check,
  FileText,
  Mic,
  Minimize2,
  Sparkles,
  Star,
  Wand2,
} from '../design-system';
import {
  ChromeMenu,
  ChromeMenuHeading,
  ChromeMenuItem,
  ChromeMenuNote,
  ChromeMenuSeparator,
} from './chrome-menu';

/**
 * Scribe's proven verb set, worded for a creator rather than for the contract.
 * Each carries its own glyph: five identical icons make a list of five
 * indistinguishable rows, which is the one thing a verb menu must not be.
 */
const REWRITE_VERBS: ReadonlyArray<{
  verb: AiRewriteVerb;
  label: string;
  icon: ReactNode;
}> = [
  {
    verb: 'shorter',
    label: authoringText('Shorter'),
    icon: <Minimize2 size={14} strokeWidth={2} aria-hidden="true" />,
  },
  {
    verb: 'clearer',
    label: authoringText('Clearer'),
    icon: <Sparkles size={14} strokeWidth={2} aria-hidden="true" />,
  },
  {
    verb: 'more-formal',
    label: authoringText('More formal'),
    icon: <FileText size={14} strokeWidth={2} aria-hidden="true" />,
  },
  {
    verb: 'friendlier',
    label: authoringText('Friendlier'),
    icon: <Star size={14} strokeWidth={2} aria-hidden="true" />,
  },
  {
    verb: 'fix-grammar',
    label: authoringText('Fix grammar'),
    icon: <Check size={14} strokeWidth={2} aria-hidden="true" />,
  },
];

/**
 * WIRE_BE: the workspace's remaining assist allowance. The control plane owns
 * the real number; the menu shows it at the point of use because a creator
 * deciding whether to press a generate button is the moment it matters.
 */
const ASSIST_CREDITS_REMAINING = 1180;

/**
 * The toolbar's assist control (§7.4, §7.5).
 *
 * Everything here is anchored: a rewrite acts on the selected text, the drafts
 * act on this step, and the prompt row scopes itself to this step too. There is
 * no unanchored chat box on the bar, because that is where scope discipline goes
 * to die (§7.8).
 *
 * The note is not decoration. "AI may add content, never edit your theme tokens"
 * is a structural guarantee (`FORBIDDEN_ASSIST_PATHS`), and saying so at the
 * point of use is what makes a creator willing to press the button.
 *
 * Reference: authoring-spec.html → `aiMenu()`
 */
export function OverlayToolbarAssist({
  controller,
  onAsk,
  onStartAssist,
  step,
}: {
  readonly controller: LocalAuthoringFrameController;
  readonly onAsk: () => void;
  readonly onStartAssist: (request: AiAssistRequest) => void;
  readonly step: LodariqBlock;
}) {
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const close = (): void => setOpen(false);
  const run = (request: AiAssistRequest): void => {
    close();
    onStartAssist(request);
  };

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={authoringText('Assist')}
        className="overlay-toolbar-glyph"
        data-toolbar-control="assist"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        ref={setTrigger}
        title={authoringText('Assist')}
      >
        <Sparkles size={15} strokeWidth={2} aria-hidden="true" />
      </button>
      {open ? (
        <ChromeMenu
          align="right"
          label={authoringText('Assist')}
          onClose={close}
          onFrameMenuChange={(menuOpen) => controller.setFrameMenuOpen(menuOpen)}
          trigger={trigger}
        >
          <ChromeMenuHeading>{authoringText('Rewrite the selection')}</ChromeMenuHeading>
          {REWRITE_VERBS.map((option) => (
            <ChromeMenuItem
              icon={option.icon}
              key={option.verb}
              label={option.label}
              onSelect={() =>
                run({
                  kind: 'rewrite',
                  scope: 'selection',
                  verb: option.verb,
                  text: selectedTextIn(trigger?.ownerDocument) || stepBodyText(step),
                })
              }
              value={option.verb}
            />
          ))}
          <ChromeMenuSeparator />
          <ChromeMenuHeading>{authoringText('This step')}</ChromeMenuHeading>
          <ChromeMenuItem
            icon={<Wand2 size={14} strokeWidth={2} aria-hidden="true" />}
            label={authoringText('Draft this step from the target')}
            onSelect={() =>
              run({
                kind: 'draft-step',
                scope: 'step',
                stepId: step.id,
                /*
                 * Built from the accessible tree, never a screenshot — smaller,
                 * cheaper, and no page pixels leave the browser. A target with a
                 * poor accessible name drafts badly, which is the nudge (§7.4).
                 */
                target: {
                  accessibleName: step.props.accessibilityName ?? step.content ?? '',
                  role: 'button',
                },
              })
            }
            value="draft-step"
          />
          <ChromeMenuItem
            icon={<Mic size={14} strokeWidth={2} aria-hidden="true" />}
            label={authoringText('Write the spoken script')}
            onSelect={() =>
              run({
                kind: 'command',
                scope: 'step',
                prompt: authoringText('Write the spoken script'),
                stepIds: [step.id],
              })
            }
            value="narration"
          />
          <ChromeMenuItem
            icon={<Accessibility size={14} strokeWidth={2} aria-hidden="true" />}
            label={authoringText('Describe the image for me')}
            onSelect={() =>
              run({
                kind: 'command',
                scope: 'step',
                prompt: authoringText('Describe the image for me'),
                stepIds: [step.id],
              })
            }
            value="alt-text"
          />
          <ChromeMenuItem
            icon={<Bot size={14} strokeWidth={2} aria-hidden="true" />}
            label={authoringText('Ask Lodariq…')}
            onSelect={() => {
              close();
              onAsk();
            }}
            /* No shortcut hint: ⌘K is the host's command palette (§7.5), and this
               row opens the step-anchored prompt instead. Printing the chord here
               promised a key that now does something else. */
            value="ask"
          />
          <ChromeMenuSeparator />
          <ChromeMenuNote>
            {authoringText(
              'Assist may add content and styles. It never edits your theme tokens or named styles, and every change previews before it applies.',
            )}{' '}
            {authoringText('{count} credits left this month.', {
              count: ASSIST_CREDITS_REMAINING,
            })}
          </ChromeMenuNote>
        </ChromeMenu>
      ) : null}
    </>
  );
}

/** A rewrite acts on what is selected; the step's body copy is the fallback. */
function selectedTextIn(doc: Document | undefined): string {
  const selection = doc?.getSelection();
  return selection && !selection.isCollapsed ? selection.toString().trim() : '';
}

function stepBodyText(step: LodariqBlock): string {
  const tooltip = step.children.find((child) => child.type === 'tooltip') ?? step;
  const body = tooltip.children.find(
    (child) => child.type === 'paragraph' || child.type === 'heading',
  );
  return body?.content?.trim() ?? '';
}
