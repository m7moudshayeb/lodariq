import {
  BLOCK_SPACING_PX_LIMITS,
  TOUR_MOTION_EASING_VALUES,
  TOUR_MOTION_RECIPE_VALUES,
  type LodariqBlock,
  type LodariqBlockType,
  type TourMotionPresentation,
} from '@lodariq/schema';
import { $createLinkNode, $toggleLink } from '@lexical/link';
import { $createListItemNode, $createListNode, insertList } from '@lexical/list';
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
  $setBlocksType,
} from '@lexical/selection';
import { $createHeadingNode } from '@lexical/rich-text';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  FORMAT_ELEMENT_COMMAND,
  type ElementFormatType,
  type RangeSelection,
} from 'lexical';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronLeft,
  CircleDot,
  Ellipsis,
  Hash,
  Heading,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link,
  List as ListIcon,
  MessageSquareWarning,
  Minus,
  MousePointerClick,
  Palette,
  Plus,
  Shapes,
  Smile,
  Sparkles,
  SquareCheck,
  TextCursorInput,
  Type,
  Underline,
  Video as VideoIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AuthoringMediaUploadOptions } from '../authoring/local-frame-types';
import { authoringText } from '../i18n';
import { createBlockId } from './ids';
import {
  applyBlockSpacingAfter,
  createFormFieldProps,
  formFieldInsertLabel,
  insertNodeAtSelection,
  insertTextAtSelection,
} from './rich-content-commands';
import {
  blockIdForNode,
  inlineAnimationCssEasing,
  originalBlockForNode,
  safeAuthorUrl,
  selectedTopLevelNode,
  typeForNode,
  type RichContentMetadata,
} from './rich-content-doc';
import { RichContentFloatingMenu } from './rich-content-floating';
import { AssistVerbMenu } from './rich-content-assist-menu';
import type { AiRewriteVerb } from '../authoring/ai/assist-contract';
import {
  toolbarContextForBlockType,
  type ToolbarContextKind,
} from '../authoring/overlay/toolbar-context';
import {
  RichContentEmojiPickerPanel,
  RichContentIconPickerPanel,
  RichContentInsertOption,
  RichContentMediaInsertPanel,
} from './rich-content-insert-panels';
import type { RichContentMediaUploadResult } from './rich-content-media-upload';
import { useRichContentMediaUpload } from './rich-content-media-upload';
import {
  $createRichButtonNode,
  $createRichCalloutNode,
  $createRichDividerNode,
  $createRichFormFieldNode,
  $createRichIconNode,
  $createRichStatNode,
} from './rich-content-nodes';
import { RichContentSelect } from './rich-content-select';

const FONT_SIZE_VALUES = [12, 14, 16, 18, 20, 24, 28, 32] as const;
const FONT_SIZE_OPTIONS = FONT_SIZE_VALUES.map((size) => ({
  label: `${size}px`,
  value: String(size),
}));
const DEFAULT_INLINE_ANIMATION: TourMotionPresentation = {
  recipe: 'fade',
  durationMs: 400,
  easing: 'standard',
  reducedMotion: 'none',
};
const ANIMATION_RECIPE_OPTIONS = [
  { label: authoringText('No animation'), value: 'none' },
  ...TOUR_MOTION_RECIPE_VALUES.map((recipe) => ({
    label: inlineAnimationRecipeLabel(recipe),
    value: recipe,
  })),
];
const ANIMATION_EASING_OPTIONS = TOUR_MOTION_EASING_VALUES.map((easing) => ({
  label: inlineAnimationEasingLabel(easing),
  value: easing,
}));
const ALIGNMENT_LABELS: Readonly<Record<'left' | 'center' | 'right', string>> = {
  left: authoringText('Align left'),
  center: authoringText('Align center'),
  right: authoringText('Align right'),
};

type InsertMenu = 'add' | 'icon' | 'emoji' | 'field' | 'media' | null;

/**
 * Surfaces that count as "still inside the toolbar". Menus are portalled to
 * `document.body`, so `toolbarRef.contains` cannot see them. Shared by both
 * guards below: when they drifted, opening a select in the More menu let the
 * selection sync clobber the author's range and every control silently no-opped.
 */
const TOOLBAR_SURFACE_SELECTOR = [
  '[data-rich-content-floating-menu="true"]',
  '.ui-select-content',
  '.rich-content-toolbar-popover',
  '.rich-content-toolbar .ui-select-trigger',
].join(', ');

/** Docked format chip: text style, bold/italic, link, add, and more. */
export function SelectionToolbarPlugin({
  insertHost,
  metadata,
  onAskAssist,
  onChange,
  onContextChange,
  onRewriteSelection,
  onUploadMedia,
  toolbarHost,
}: {
  /**
   * Where the pinned Insert control lands. When set, Insert leaves the swapping
   * middle so it stays put across selections (§4.2a rule 4).
   */
  insertHost?: HTMLElement | null;
  metadata: RichContentMetadata;
  /** Opens the free-form prompt for the current step (§7.5). */
  onAskAssist?: () => void;
  onChange: (value: LodariqBlock[]) => void;
  /** Reports what the contextual middle is editing, so the frame can name it (§4.2a). */
  onContextChange?: (kind: ToolbarContextKind) => void;
  /** Rewrites the current selection with one verb (§7.4). */
  onRewriteSelection?: (verb: AiRewriteVerb, text: string) => void;
  onUploadMedia?: (
    kind: 'image' | 'video' | 'captions',
    file: File,
    options: AuthoringMediaUploadOptions,
  ) => Promise<RichContentMediaUploadResult | null>;
  toolbarHost?: HTMLElement | null;
}): ReactElement | null {
  const [editor] = useLexicalComposerContext();
  const [activeBlockType, setActiveBlockType] = useState<LodariqBlockType>('paragraph');
  const [activeFormats, setActiveFormats] = useState<ReadonlySet<string>>(new Set());
  const [fontSize, setFontSize] = useState('16');
  const [spacingAfter, setSpacingAfter] = useState(8);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [animationRecipe, setAnimationRecipe] = useState<TourMotionPresentation['recipe'] | 'none'>(
    DEFAULT_INLINE_ANIMATION.recipe,
  );
  const [animationDurationMs, setAnimationDurationMs] = useState(
    DEFAULT_INLINE_ANIMATION.durationMs,
  );
  const [animationEasing, setAnimationEasing] = useState<TourMotionPresentation['easing']>(
    DEFAULT_INLINE_ANIMATION.easing,
  );
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDisplayAs, setLinkDisplayAs] = useState('');
  const [linkSelectedText, setLinkSelectedText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [insertMenu, setInsertMenu] = useState<InsertMenu>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  /** Labels of controls the bar could not fit, so the More menu can offer them. */
  const [overflowedLabels, setOverflowedLabels] = useState<readonly string[]>([]);
  const [iconColor, setIconColor] = useState('#12715b');
  const [iconQuery, setIconQuery] = useState('');
  const savedSelection = useRef<RangeSelection | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const contextKindRef = useRef<ToolbarContextKind | null>(null);
  const onContextChangeRef = useRef(onContextChange);
  onContextChangeRef.current = onContextChange;
  const linkStateRef = useRef({ linkDisplayAs, linkOpen, linkSelectedText, linkUrl });
  linkStateRef.current = { linkDisplayAs, linkOpen, linkSelectedText, linkUrl };
  const media = useRichContentMediaUpload(editor, onUploadMedia);

  const closeSubmenus = (): void => {
    setBlockMenuOpen(false);
    setFontSizeOpen(false);
    setLinkOpen(false);
    setInsertMenu(null);
    setMoreOpen(false);
    setAssistOpen(false);
  };
  const menusOpenRef = useRef(false);
  const closeSubmenusRef = useRef(closeSubmenus);
  menusOpenRef.current = Boolean(
    blockMenuOpen || fontSizeOpen || linkOpen || insertMenu || moreOpen,
  );
  closeSubmenusRef.current = closeSubmenus;

  const toggleBlockMenu = (): void => {
    const next = !blockMenuOpen;
    closeSubmenus();
    if (next) setBlockMenuOpen(true);
  };
  const toggleInsertMenu = (kind: Exclude<InsertMenu, null>): void => {
    const next = insertMenu !== kind;
    closeSubmenus();
    if (next) setInsertMenu(kind);
  };
  const toggleMoreMenu = (): void => {
    const next = !moreOpen;
    closeSubmenus();
    if (next) setMoreOpen(true);
  };

  useEffect(() => {
    const ownerDocument = editor.getRootElement()?.ownerDocument ?? document;
    const onPointerDown = (event: PointerEvent): void => {
      if (!menusOpenRef.current) return;
      const target = event.target;
      if (target instanceof Element && target.closest(TOOLBAR_SURFACE_SELECTOR)) return;
      closeSubmenusRef.current();
    };
    ownerDocument.addEventListener('pointerdown', onPointerDown, true);
    return () => ownerDocument.removeEventListener('pointerdown', onPointerDown, true);
  }, [editor]);

  /**
   * Overflow into the trailing menu instead of scrolling sideways (§4.2a rule 4).
   *
   * A toolbar with a horizontal scrollbar hides controls behind a gesture nobody
   * performs, which is the same failure as a control that vanishes. Controls that
   * do not fit are hidden — so they leave the tab order too, rather than being
   * clipped-but-focusable — and every one of them also exists in the More menu, so
   * hiding never removes the only route to an action.
   */
  useEffect(() => {
    const bar = toolbarRef.current;
    const track = bar?.parentElement;
    if (!bar || !track) return;
    const naturalWidths = new WeakMap<HTMLElement, number>();
    const fixedWidth = (): number =>
      [...bar.children]
        .filter((child): child is HTMLElement => child instanceof HTMLElement)
        .filter((child) => !child.hasAttribute('data-collapsible'))
        .reduce((total, child) => total + child.offsetWidth, 0);
    const measure = (): void => {
      const items = [...bar.querySelectorAll<HTMLElement>('[data-collapsible]')];
      for (const item of items) {
        item.hidden = false;
      }
      /*
       * Widths in a second pass, after every item is back: reading inside the
       * loop above measures each one while the rest are still hidden. Keep the
       * largest ever seen, so a reading taken mid-layout cannot pin an item at a
       * width smaller than it really wants and quietly disable its own overflow.
       */
      for (const item of items) {
        naturalWidths.set(item, Math.max(naturalWidths.get(item) ?? 0, item.offsetWidth));
      }
      const available = track.clientWidth;
      /*
       * The block-type picker is the widest thing on this bar, and it is not
       * collapsible — it names what the caret is in. When even the fixed items
       * do not fit, its label comes off before any formatting control is hidden:
       * a glyph and a chevron say the same thing in a third of the width. Over a
       * narrow card this was the difference between a bar with bold, italic,
       * link and More on it and a bar with none of them.
       */
      bar.dataset['blockTypeLabel'] = 'shown';
      if (fixedWidth() > available) bar.dataset['blockTypeLabel'] = 'hidden';
      const fixed = fixedWidth();
      const gaps = Number.parseFloat(getComputedStyle(bar).columnGap || '0') || 0;
      let used = fixed + gaps * Math.max(0, bar.children.length - 1);
      /*
       * Order is priority, so the first control that does not fit ends the bar:
       * everything after it goes too. Testing each one independently let a 1px
       * divider slip in behind a dropped Bold, which is how a narrow bar ended up
       * showing two separators with nothing between them to separate.
       */
      let dropping = false;
      for (const item of items) {
        const width = naturalWidths.get(item) ?? item.offsetWidth;
        if (!dropping && used + width <= available) {
          used += width;
          continue;
        }
        dropping = true;
        item.hidden = true;
      }
      // A separator that survives its group separates nothing. Drop the trailing ones.
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];
        if (!item || item.hidden) continue;
        if (!item.dataset['collapsible']?.startsWith('divider')) break;
        item.hidden = true;
      }
      setOverflowedLabels(
        items.filter((item) => item.hidden).map((item) => item.dataset['collapsible'] ?? ''),
      );
    };
    measure();
    // Observe the track, not the bar: the bar's own size is what we are changing.
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
    /*
     * `toolbarHost` belongs here: the bar is portaled into the overlay's slot the
     * moment the host arrives, which changes `bar.parentElement`. Without it the
     * effect measured against the pre-portal parent — or bailed on a null ref and
     * never retried — so nothing ever collapsed. The bar is `overflow: hidden`, so
     * that did not scroll, it silently clipped Bold through More off the right
     * edge with no route to any of them.
     */
  }, [activeBlockType, onRewriteSelection, toolbarHost]);

  useEffect(() => {
    /** Deduped: the label may not re-render on every keystroke inside one block. */
    const reportContext = (kind: ToolbarContextKind): void => {
      if (contextKindRef.current === kind) return;
      contextKindRef.current = kind;
      onContextChangeRef.current?.(kind);
    };
    const syncToolbar = (): void => {
      const rootElement = editor.getRootElement();
      if (!rootElement) return;
      const ownerDocument = rootElement.ownerDocument;
      const activeElement = ownerDocument.activeElement;
      const toolbarActive = Boolean(
        toolbarRef.current?.contains(activeElement) ||
        activeElement?.closest?.(TOOLBAR_SURFACE_SELECTOR),
      );
      if (toolbarActive) return;
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          savedSelection.current = selection.clone();
          const nextFormats = new Set(
            ['bold', 'italic', 'underline'].filter((format) =>
              selection.hasFormat(format as 'bold'),
            ),
          );
          setActiveFormats((current) =>
            sameStringSet(current, nextFormats) ? current : nextFormats,
          );
          const nextFontSize =
            $getSelectionStyleValueForProperty(selection, 'font-size', '16px').replace(
              /px$/u,
              '',
            ) || '16';
          setFontSize((current) => (current === nextFontSize ? current : nextFontSize));
        }
        const selectedNode = selectedTopLevelNode();
        if (selectedNode) {
          const original = originalBlockForNode(selectedNode, metadata);
          const nextBlockType = typeForNode(selectedNode, original?.type);
          const nextSpacing = original?.props.blockLayout?.spacingAfterPx ?? 8;
          setActiveBlockType((current) => (current === nextBlockType ? current : nextBlockType));
          setSpacingAfter((current) => (current === nextSpacing ? current : nextSpacing));
          reportContext(toolbarContextForBlockType(nextBlockType));
        } else {
          // Nothing inside the card is selected, so the step itself is the subject.
          reportContext('step');
        }
      });
    };
    const unregister = editor.registerUpdateListener(syncToolbar);
    const ownerDocument = editor.getRootElement()?.ownerDocument ?? document;
    ownerDocument.addEventListener('selectionchange', syncToolbar);
    syncToolbar();
    return () => {
      unregister();
      ownerDocument.removeEventListener('selectionchange', syncToolbar);
    };
  }, [editor, metadata]);

  const withAuthorSelection = (change: (selection: RangeSelection) => void): void => {
    editor.update(() => {
      if (savedSelection.current) $setSelection(savedSelection.current.clone());
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      change(selection);
      savedSelection.current = selection.clone();
    });
  };

  const applyBlockType = (type: 'paragraph' | 'heading' | 'list' | 'callout' | 'stat'): void => {
    setBlockMenuOpen(false);
    if (type === 'list') {
      const currentBlockId = editor.getEditorState().read(() => {
        const node = selectedTopLevelNode();
        return node ? blockIdForNode(node, metadata) : null;
      });
      insertList(editor, 'bullet');
      if (currentBlockId) {
        editor.update(() => {
          const nextNode = selectedTopLevelNode();
          if (nextNode) metadata.blockIdByNodeKey.set(nextNode.getKey(), currentBlockId);
        });
      }
      return;
    }
    editor.update(() => {
      if (savedSelection.current) $setSelection(savedSelection.current.clone());
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const currentNode = selectedTopLevelNode();
      const currentBlockId = currentNode ? blockIdForNode(currentNode, metadata) : null;
      const factory =
        type === 'heading'
          ? () => $createHeadingNode('h2')
          : type === 'callout'
            ? () => $createRichCalloutNode()
            : type === 'stat'
              ? () => $createRichStatNode()
              : () => $createParagraphNode();
      $setBlocksType(selection, factory);
      const nextNode = selectedTopLevelNode();
      if (currentBlockId && nextNode) {
        metadata.blockIdByNodeKey.set(nextNode.getKey(), currentBlockId);
      }
    });
  };

  const applyInlineAnimation = (
    recipe: TourMotionPresentation['recipe'] | 'none',
    durationMs = animationDurationMs,
    easing = animationEasing,
  ): void => {
    withAuthorSelection((selection) => {
      if (recipe === 'none') {
        $patchStyleText(selection, {
          '--lq-inline-motion': null,
          '--lq-inline-motion-duration': null,
          '--lq-inline-motion-easing': null,
          '--lq-inline-motion-timing': null,
        });
        return;
      }
      $patchStyleText(selection, {
        '--lq-inline-motion': recipe,
        '--lq-inline-motion-duration': `${durationMs}ms`,
        '--lq-inline-motion-easing': easing,
        '--lq-inline-motion-timing': inlineAnimationCssEasing(easing),
      });
    });
  };

  const openLinkMenu = (): void => {
    const selectedText = editor
      .getEditorState()
      .read(() => savedSelection.current?.getTextContent() ?? '');
    setLinkSelectedText(selectedText);
    setLinkDisplayAs(selectedText);
    setLinkUrl('');
    closeSubmenus();
    setLinkOpen(true);
  };

  const commitLink = (): void => {
    const {
      linkDisplayAs: displayRaw,
      linkSelectedText: selected,
      linkUrl: urlRaw,
    } = linkStateRef.current;
    const url = safeAuthorUrl(urlRaw);
    if (url) {
      const displayAs = displayRaw.trim();
      if (selected && (displayAs === selected || !displayAs)) {
        withAuthorSelection(() => $toggleLink(url));
      } else {
        withAuthorSelection((selection) => {
          const link = $createLinkNode(url);
          link.append($createTextNode(displayAs || url));
          selection.insertNodes([link]);
          link.selectEnd();
        });
      }
    }
    setLinkOpen(false);
    setLinkDisplayAs('');
    setLinkSelectedText('');
    setLinkUrl('');
  };

  const applyFocusedSpacing = (rawValue: number): void => {
    const target = editor.getEditorState().read(() => {
      const node = selectedTopLevelNode() ?? $getRoot().getFirstChild();
      if (!node) return null;
      return { blockId: blockIdForNode(node, metadata), key: node.getKey() };
    });
    if (!target) return;
    setSpacingAfter(rawValue);
    applyBlockSpacingAfter(editor, metadata, onChange, target.key, target.blockId, rawValue);
  };

  /**
   * Open away from the card, not onto it (§3.4 rule 1).
   *
   * This read the other way round: with the toolbar below the card it opened
   * upward, straight over the card — and with the toolbar above, downward, also
   * over the card. Both branches aimed the menu at the one surface it must not
   * cover. The card is on the far side of the toolbar from the free space, so the
   * menu wants the same side the toolbar is on.
   */
  const toolbarBelowCard = Boolean(document.querySelector('.overlay-step-main.toolbar-below'));
  const dockedMenuPlacement = toolbarBelowCard ? 'bottom-start' : 'top-start';
  const dockedMenuEndPlacement = toolbarBelowCard ? 'bottom-end' : 'top-end';

  /**
   * Insert is pinned to the left of the frame (§4.2a), so it never moves when the
   * contextual middle swaps. The frame decides where it lands; this only decides
   * what it does.
   */
  const insertControl = (
    <RichContentFloatingMenu
      content={
        <div className="rich-content-menu rich-content-insert-menu">
          {insertMenu === 'add' ? (
            <>
              {/*
                Four-up, in the prototype's order (§4.2a): block types are
                recognised by shape long before the label is read, and a single
                column of fourteen rows is a list nobody scans.
              */}
              <p className="rich-content-insert-heading">
                {authoringText('Insert into this step')}
              </p>
              <div className="rich-content-insert-grid" role="menu">
                <RichContentInsertOption
                  icon={<Heading size={17} />}
                  label={authoringText('Heading')}
                  onSelect={() => {
                    insertNodeAtSelection(editor, () => $createHeadingNode('h2'));
                    setInsertMenu(null);
                  }}
                />
                <RichContentInsertOption
                  icon={<Type size={17} />}
                  label={authoringText('Text')}
                  onSelect={() => {
                    insertNodeAtSelection(editor, () => $createParagraphNode());
                    setInsertMenu(null);
                  }}
                />
                <RichContentInsertOption
                  icon={<ListIcon size={17} />}
                  label={authoringText('List')}
                  onSelect={() => {
                    insertNodeAtSelection(editor, () => {
                      const list = $createListNode('bullet');
                      list.append($createListItemNode());
                      return list;
                    });
                    setInsertMenu(null);
                  }}
                />
                <RichContentInsertOption
                  icon={<Minus size={17} />}
                  label={authoringText('Divider')}
                  onSelect={() => {
                    insertNodeAtSelection(editor, () => $createRichDividerNode(createBlockId()), {
                      trailingParagraph: true,
                    });
                    setInsertMenu(null);
                  }}
                />
                {/*
                  Media carries an asset id, so these open the upload panel
                  rather than dropping an empty frame the creator then has to
                  discover how to fill.
                */}
                <RichContentInsertOption
                  icon={<ImageIcon size={17} />}
                  label={authoringText('Image')}
                  onSelect={() => toggleInsertMenu('media')}
                />
                <RichContentInsertOption
                  icon={<VideoIcon size={17} />}
                  label={authoringText('Video')}
                  onSelect={() => toggleInsertMenu('media')}
                />
                <RichContentInsertOption
                  icon={<MessageSquareWarning size={17} />}
                  label={authoringText('Callout')}
                  onSelect={() => {
                    insertNodeAtSelection(editor, () => $createRichCalloutNode());
                    setInsertMenu(null);
                  }}
                />
                <RichContentInsertOption
                  icon={<Hash size={17} />}
                  label={authoringText('Stat')}
                  onSelect={() => {
                    insertNodeAtSelection(editor, () => $createRichStatNode());
                    setInsertMenu(null);
                  }}
                />
                <RichContentInsertOption
                  icon={<Shapes size={17} />}
                  label={authoringText('Icon + text')}
                  onSelect={() => toggleInsertMenu('icon')}
                />
                <RichContentInsertOption
                  icon={<SquareCheck size={17} />}
                  label={authoringText('Form field')}
                  onSelect={() => toggleInsertMenu('field')}
                />
                <RichContentInsertOption
                  icon={<MousePointerClick size={17} />}
                  label={authoringText('Buttons')}
                  onSelect={() => {
                    insertNodeAtSelection(editor, () =>
                      $createRichButtonNode(createBlockId(), authoringText('Continue'), {
                        action: { type: 'next' },
                        variant: 'primary',
                      }),
                    );
                    setInsertMenu(null);
                  }}
                />
                <RichContentInsertOption
                  icon={<Link size={17} />}
                  label={authoringText('Link')}
                  onSelect={() => {
                    insertNodeAtSelection(editor, () => {
                      const paragraph = $createParagraphNode();
                      const link = $createLinkNode('https://');
                      link.append($createTextNode(authoringText('Read the guide')));
                      paragraph.append(link);
                      return paragraph;
                    });
                    setInsertMenu(null);
                  }}
                />
                <RichContentInsertOption
                  icon={<Smile size={17} />}
                  label={authoringText('Emoji')}
                  onSelect={() => toggleInsertMenu('emoji')}
                />
              </div>
              <div className="rich-content-insert-separator" aria-hidden="true" />
              <p className="rich-content-insert-note">
                {authoringText('Blocks flow like a document. Drag the gutter handle to reorder.')}
              </p>
            </>
          ) : null}
          {insertMenu === 'media' && onUploadMedia ? (
            <>
              <button
                className="rich-content-insert-back"
                onClick={() => setInsertMenu('add')}
                onPointerDown={(event) => event.preventDefault()}
                type="button"
              >
                <ChevronLeft size={14} />
                <span>{authoringText('Back')}</span>
              </button>
              <RichContentMediaInsertPanel
                captionTargetVideo={Boolean(media.captionTargetVideo)}
                mediaUploadError={media.mediaUploadError}
                onUploadCaptions={(file) => {
                  void media.uploadCaptions(file);
                }}
                onUploadMediaFile={(kind, file) => {
                  void media.uploadMediaIntoCanvas(kind, file);
                  // Every other insert option closes the menu; media did not,
                  // leaving the panel sitting over the card after a drop.
                  setInsertMenu(null);
                }}
                saveMediaToLibrary={media.saveMediaToLibrary}
                setSaveMediaToLibrary={media.setSaveMediaToLibrary}
                uploading={media.uploading}
              />
            </>
          ) : null}
          {insertMenu === 'icon' ? (
            <RichContentIconPickerPanel
              color={iconColor}
              onBack={() => setInsertMenu('add')}
              onColorChange={setIconColor}
              onQueryChange={setIconQuery}
              onSelect={(icon, label, color) => {
                insertNodeAtSelection(editor, () =>
                  $createRichIconNode(createBlockId(), icon, label, color),
                );
              }}
              query={iconQuery}
            />
          ) : null}
          {insertMenu === 'emoji' ? (
            <RichContentEmojiPickerPanel
              onBack={() => setInsertMenu('add')}
              onSelect={(emoji) => insertTextAtSelection(editor, emoji)}
            />
          ) : null}
          {insertMenu === 'field' ? (
            <div className="rich-content-insert-options" role="menu">
              {(
                [
                  {
                    control: 'checkbox',
                    icon: <SquareCheck size={16} />,
                    label: authoringText('Checkbox'),
                  },
                  {
                    control: 'text',
                    icon: <TextCursorInput size={16} />,
                    label: authoringText('Text field'),
                  },
                  {
                    control: 'radio',
                    icon: <CircleDot size={16} />,
                    label: authoringText('Radio'),
                  },
                ] as const
              ).map((option) => (
                <RichContentInsertOption
                  icon={option.icon}
                  key={option.control}
                  label={option.label}
                  onSelect={() => {
                    const id = createBlockId();
                    insertNodeAtSelection(editor, () =>
                      $createRichFormFieldNode(
                        id,
                        formFieldInsertLabel(option.control),
                        createFormFieldProps(option.control, id),
                      ),
                    );
                    setInsertMenu(null);
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      }
      open={Boolean(insertMenu)}
      placement={dockedMenuPlacement}
    >
      {/* The bar's one always-present verb, so it is worded rather than a glyph. */}
      <ToolbarButton
        active={Boolean(insertMenu)}
        icon={<Plus size={16} />}
        label={authoringText('Insert')}
        onClick={() => toggleInsertMenu('add')}
        showLabel
      />
    </RichContentFloatingMenu>
  );

  const toolbar = (
    <div
      ref={toolbarRef}
      aria-label={authoringText('Text formatting')}
      className="rich-content-toolbar"
      role="toolbar"
    >
      <RichContentFloatingMenu
        content={
          <div className="rich-content-menu rich-content-block-menu">
            <BlockStyleOption
              icon={<Type size={16} />}
              label={authoringText('Normal text')}
              onClick={() => applyBlockType('paragraph')}
            />
            <BlockStyleOption
              icon={<Heading size={16} />}
              label={authoringText('Heading')}
              onClick={() => applyBlockType('heading')}
            />
            <BlockStyleOption
              icon={<ListIcon size={16} />}
              label={authoringText('Bulleted list')}
              onClick={() => applyBlockType('list')}
            />
            <BlockStyleOption
              icon={<MessageSquareWarning size={16} />}
              label={authoringText('Callout')}
              onClick={() => applyBlockType('callout')}
            />
            <BlockStyleOption
              icon={<Hash size={16} />}
              label={authoringText('Stat')}
              onClick={() => applyBlockType('stat')}
            />
          </div>
        }
        open={blockMenuOpen}
        placement={dockedMenuPlacement}
      >
        <button
          aria-expanded={blockMenuOpen}
          className="rich-content-block-style-trigger"
          onClick={toggleBlockMenu}
          onPointerDown={(event) => event.preventDefault()}
          type="button"
        >
          <BlockTypeIcon type={activeBlockType} />
          <span>{blockTypeName(activeBlockType)}</span>
          <ChevronDown size={14} />
        </button>
      </RichContentFloatingMenu>

      <span
        className="rich-content-toolbar-divider"
        data-collapsible="divider"
        aria-hidden="true"
      />
      <span data-collapsible={authoringText('Bold')}>
        <ToolbarButton
          active={activeFormats.has('bold')}
          icon={<Bold size={16} />}
          label={authoringText('Bold')}
          onClick={() => withAuthorSelection((selection) => selection.formatText('bold'))}
        />
      </span>
      <span data-collapsible={authoringText('Italic')}>
        <ToolbarButton
          active={activeFormats.has('italic')}
          icon={<Italic size={16} />}
          label={authoringText('Italic')}
          onClick={() => withAuthorSelection((selection) => selection.formatText('italic'))}
        />
      </span>
      {/*
        Bold, italic and underline belong together: they are one decision made
        three ways, and splitting the third into an overflow menu made creators
        hunt for it. Size and colour follow for the same reason — they are the
        controls a creator reaches for while the caret is still in the word.
        Each stays collapsible, and each is re-offered in More when it collapses,
        so a narrow bar never removes the only route (§4.2a rule 4).
      */}
      <span data-collapsible={authoringText('Underline')}>
        <ToolbarButton
          active={activeFormats.has('underline')}
          icon={<Underline size={16} />}
          label={authoringText('Underline')}
          onClick={() => withAuthorSelection((selection) => selection.formatText('underline'))}
        />
      </span>
      <span
        className="rich-content-toolbar-divider"
        data-collapsible="divider-type"
        aria-hidden="true"
      />
      <span data-collapsible={authoringText('Font size')}>
        <RichContentSelect
          ariaLabel={authoringText('Font size')}
          className="rich-content-font-size-trigger"
          onOpenChange={setFontSizeOpen}
          onValueChange={(nextFontSize) => {
            setFontSize(nextFontSize);
            withAuthorSelection((selection) =>
              $patchStyleText(selection, { 'font-size': `${nextFontSize}px` }),
            );
          }}
          open={fontSizeOpen}
          options={FONT_SIZE_OPTIONS}
          value={fontSize}
        />
      </span>
      <span data-collapsible={authoringText('Text color')}>
        <label className="rich-content-color-control" title={authoringText('Text color')}>
          <Palette aria-hidden="true" size={16} />
          <input
            aria-label={authoringText('Text color')}
            defaultValue="#172033"
            onChange={(event) => {
              const color = event.currentTarget.value;
              withAuthorSelection((selection) => $patchStyleText(selection, { color }));
            }}
            type="color"
          />
        </label>
      </span>
      {onRewriteSelection ? (
        <RichContentFloatingMenu
          content={
            <AssistVerbMenu
              onPick={(verb) => {
                const text = editor
                  .getEditorState()
                  .read(() => savedSelection.current?.getTextContent() ?? '');
                closeSubmenus();
                if (text.trim()) onRewriteSelection(verb, text);
              }}
              {...(onAskAssist
                ? {
                    onAsk: () => {
                      closeSubmenus();
                      onAskAssist();
                    },
                  }
                : {})}
            />
          }
          open={assistOpen}
        >
          <button
            aria-expanded={assistOpen}
            aria-label={authoringText('Assist')}
            className="rich-content-assist-trigger"
            data-assist-trigger=""
            onClick={() => {
              const next = !assistOpen;
              closeSubmenus();
              setAssistOpen(next);
            }}
            onPointerDown={(event) => event.preventDefault()}
            title={authoringText('Assist')}
            type="button"
          >
            <Sparkles size={16} />
          </button>
        </RichContentFloatingMenu>
      ) : null}

      <RichContentFloatingMenu
        className="rich-content-toolbar-popover-end"
        content={
          <div
            className="rich-content-menu rich-content-link-menu"
            onBlur={(event) => {
              const nextTarget = event.relatedTarget as Node | null;
              if (nextTarget && event.currentTarget.contains(nextTarget)) return;
              commitLink();
            }}
          >
            <label>
              <span>{authoringText('Link URL')}</span>
              <input
                autoFocus
                onChange={(event) => setLinkUrl(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                placeholder="https://"
                type="url"
                value={linkUrl}
              />
            </label>
            <label>
              <span>{authoringText('Display as')}</span>
              <input
                onChange={(event) => setLinkDisplayAs(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                placeholder={linkUrl || 'https://'}
                type="text"
                value={linkDisplayAs}
              />
            </label>
          </div>
        }
        open={linkOpen}
        placement={dockedMenuEndPlacement}
      >
        <ToolbarButton
          active={linkOpen}
          icon={<Link size={16} />}
          label={authoringText('Link')}
          onClick={() => (linkOpen ? commitLink() : openLinkMenu())}
        />
      </RichContentFloatingMenu>

      {insertHost ? null : insertControl}
      <RichContentFloatingMenu
        className="rich-content-toolbar-popover-end"
        content={
          <div className="rich-content-menu rich-content-more-menu">
            {/*
              Whatever the bar could not fit appears here first, so a narrow
              toolbar never removes the only route to Bold or Italic.
            */}
            {overflowedLabels.length > 0 ? (
              <div className="rich-content-more-row" data-overflowed="">
                {overflowedLabels.includes(authoringText('Bold')) ? (
                  <ToolbarButton
                    active={activeFormats.has('bold')}
                    icon={<Bold size={16} />}
                    label={authoringText('Bold')}
                    onClick={() => withAuthorSelection((selection) => selection.formatText('bold'))}
                  />
                ) : null}
                {overflowedLabels.includes(authoringText('Italic')) ? (
                  <ToolbarButton
                    active={activeFormats.has('italic')}
                    icon={<Italic size={16} />}
                    label={authoringText('Italic')}
                    onClick={() =>
                      withAuthorSelection((selection) => selection.formatText('italic'))
                    }
                  />
                ) : null}
                {overflowedLabels.includes(authoringText('Underline')) ? (
                  <ToolbarButton
                    active={activeFormats.has('underline')}
                    icon={<Underline size={16} />}
                    label={authoringText('Underline')}
                    onClick={() =>
                      withAuthorSelection((selection) => selection.formatText('underline'))
                    }
                  />
                ) : null}
                {overflowedLabels.includes(authoringText('Font size')) ? (
                  <RichContentSelect
                    ariaLabel={authoringText('Font size')}
                    className="rich-content-font-size-trigger"
                    onValueChange={(nextFontSize) => {
                      setFontSize(nextFontSize);
                      withAuthorSelection((selection) =>
                        $patchStyleText(selection, { 'font-size': `${nextFontSize}px` }),
                      );
                    }}
                    options={FONT_SIZE_OPTIONS}
                    value={fontSize}
                  />
                ) : null}
                {overflowedLabels.includes(authoringText('Text color')) ? (
                  <label className="rich-content-color-control" title={authoringText('Text color')}>
                    <Palette aria-hidden="true" size={16} />
                    <input
                      aria-label={authoringText('Text color')}
                      defaultValue="#172033"
                      onChange={(event) => {
                        const color = event.currentTarget.value;
                        withAuthorSelection((selection) => $patchStyleText(selection, { color }));
                      }}
                      type="color"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
            <div className="rich-content-more-row">
              <label
                className="rich-content-color-control"
                title={authoringText('Selection background')}
              >
                <Highlighter aria-hidden="true" size={16} />
                <input
                  aria-label={authoringText('Selection background')}
                  defaultValue="#fff1a8"
                  onChange={(event) => {
                    const color = event.currentTarget.value;
                    withAuthorSelection((selection) =>
                      $patchStyleText(selection, { 'background-color': color }),
                    );
                  }}
                  type="color"
                />
              </label>
            </div>
            <div className="rich-content-more-row">
              {(['left', 'center', 'right'] as const).map((align) => {
                const Icon =
                  align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                return (
                  <ToolbarButton
                    icon={<Icon size={16} />}
                    key={align}
                    label={ALIGNMENT_LABELS[align]}
                    onClick={() =>
                      editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, align as ElementFormatType)
                    }
                  />
                );
              })}
            </div>
            <div className="rich-content-animation-menu">
              <label>
                <span>{authoringText('Effect')}</span>
                <RichContentSelect
                  ariaLabel={authoringText('Animation effect')}
                  className="rich-content-animation-select"
                  onValueChange={(value) => {
                    const recipe = value as TourMotionPresentation['recipe'] | 'none';
                    setAnimationRecipe(recipe);
                    applyInlineAnimation(recipe);
                  }}
                  options={ANIMATION_RECIPE_OPTIONS}
                  value={animationRecipe}
                />
              </label>
              <label>
                <span>{authoringText('Duration')}</span>
                <span className="rich-content-animation-number">
                  <input
                    aria-label={authoringText('Animation duration')}
                    max={1200}
                    min={100}
                    onChange={(event) => {
                      const durationMs = clampInlineAnimationDuration(
                        event.currentTarget.valueAsNumber,
                      );
                      setAnimationDurationMs(durationMs);
                      if (animationRecipe !== 'none') {
                        applyInlineAnimation(animationRecipe, durationMs);
                      }
                    }}
                    step={50}
                    type="number"
                    value={animationDurationMs}
                  />
                  <span>ms</span>
                </span>
              </label>
              <label>
                <span>{authoringText('Timing')}</span>
                <RichContentSelect
                  ariaLabel={authoringText('Animation timing')}
                  className="rich-content-animation-select"
                  onValueChange={(value) => {
                    const easing = value as TourMotionPresentation['easing'];
                    setAnimationEasing(easing);
                    if (animationRecipe !== 'none') {
                      applyInlineAnimation(animationRecipe, animationDurationMs, easing);
                    }
                  }}
                  options={ANIMATION_EASING_OPTIONS}
                  value={animationEasing}
                />
              </label>
            </div>
            <label className="rich-content-spacing-control">
              <span>{authoringText('Space after')}</span>
              <span>
                <input
                  aria-label={authoringText('Space after')}
                  max={BLOCK_SPACING_PX_LIMITS.max}
                  min={BLOCK_SPACING_PX_LIMITS.min}
                  onChange={(event) => applyFocusedSpacing(Number(event.currentTarget.value))}
                  step={BLOCK_SPACING_PX_LIMITS.step}
                  type="number"
                  value={spacingAfter}
                />
                <span>{authoringText('px')}</span>
              </span>
            </label>
          </div>
        }
        open={moreOpen}
        placement={dockedMenuEndPlacement}
      >
        <ToolbarButton
          active={moreOpen}
          icon={<Ellipsis size={16} />}
          label={authoringText('More formatting')}
          onClick={toggleMoreMenu}
        />
      </RichContentFloatingMenu>
    </div>
  );

  if (!editor.isEditable()) return null;
  // One toolbar, never two (§4.2a rule 4): the old selection bubble duplicated
  // Bold/Italic/Link over the card, on the same pixels the bar already owns.
  const middle = toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar;
  if (!insertHost) return middle;
  return (
    <>
      {createPortal(insertControl, insertHost)}
      {middle}
    </>
  );
}

export function ToolbarButton({
  active = false,
  disabled = false,
  icon,
  label,
  onClick,
  showLabel = false,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  /** Printed beside the icon. Reserved for the bar's anchor control (§4.2a). */
  showLabel?: boolean;
}): ReactElement {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={(event) => event.preventDefault()}
      title={label}
      type="button"
    >
      {icon}
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}

function BlockStyleOption({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button onClick={onClick} onPointerDown={(event) => event.preventDefault()} type="button">
      {icon}
      <span>{label}</span>
    </button>
  );
}

function BlockTypeIcon({ type }: { type: LodariqBlockType }): ReactElement {
  if (type === 'heading') return <Heading size={16} />;
  if (type === 'list') return <ListIcon size={16} />;
  if (type === 'callout') return <MessageSquareWarning size={16} />;
  if (type === 'stat') return <Hash size={16} />;
  return <Type size={16} />;
}

function blockTypeName(type: LodariqBlockType): string {
  if (type === 'heading') return authoringText('Heading');
  if (type === 'list') return authoringText('Bulleted list');
  if (type === 'callout') return authoringText('Callout');
  if (type === 'stat') return authoringText('Stat');
  return authoringText('Normal text');
}

function inlineAnimationRecipeLabel(recipe: TourMotionPresentation['recipe']): string {
  if (recipe === 'fade') return authoringText('Fade in');
  if (recipe === 'lift') return authoringText('Rise in');
  if (recipe === 'scale') return authoringText('Grow in');
  return authoringText('Pulse');
}

function inlineAnimationEasingLabel(easing: TourMotionPresentation['easing']): string {
  if (easing === 'emphasized') return authoringText('Expressive');
  if (easing === 'linear') return authoringText('Linear');
  return authoringText('Natural');
}

function clampInlineAnimationDuration(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_INLINE_ANIMATION.durationMs;
  return Math.min(1200, Math.max(100, Math.round(value / 50) * 50));
}

function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of right) {
    if (!left.has(value)) return false;
  }
  return true;
}
