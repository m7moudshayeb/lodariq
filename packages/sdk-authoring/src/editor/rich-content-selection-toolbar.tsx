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
import { $getSelectionStyleValueForProperty, $patchStyleText, $setBlocksType } from '@lexical/selection';
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
  CircleDot,
  Ellipsis,
  Hash,
  Heading,
  Highlighter,
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
  SquareCheck,
  TextCursorInput,
  Type,
  Underline,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AuthoringMediaUploadOptions } from '../authoring/local-frame-types';
import { authoringText } from '../i18n';
import { createBlockId } from './ids';
import { applyBlockSpacingAfter, createFormFieldProps, formFieldInsertLabel, insertNodeAtSelection, insertTextAtSelection } from './rich-content-commands';
import {
  blockIdForNode,
  inlineAnimationCssEasing,
  originalBlockForNode,
  safeAuthorUrl,
  selectedTopLevelNode,
  typeForNode,
  type RichContentMetadata,
} from './rich-content-doc';
import { readRangeViewportRect, RichContentFloatingAnchor, RichContentFloatingMenu } from './rich-content-floating';
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

type InsertMenu = 'add' | 'icon' | 'emoji' | 'field' | null;

/**
 * Docked format chip: text style, bold/italic, link, add, and more.
 * A selection bubble covers bold/italic/link while text is highlighted.
 */
export function SelectionToolbarPlugin({
  metadata,
  onChange,
  onUploadMedia,
  toolbarHost,
}: {
  metadata: RichContentMetadata;
  onChange: (value: LodariqBlock[]) => void;
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
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [iconColor, setIconColor] = useState('#12715b');
  const [iconQuery, setIconQuery] = useState('');
  const savedSelection = useRef<RangeSelection | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const linkStateRef = useRef({ linkDisplayAs, linkOpen, linkSelectedText, linkUrl });
  linkStateRef.current = { linkDisplayAs, linkOpen, linkSelectedText, linkUrl };
  const media = useRichContentMediaUpload(editor, onUploadMedia);

  const closeSubmenus = (): void => {
    setBlockMenuOpen(false);
    setFontSizeOpen(false);
    setLinkOpen(false);
    setInsertMenu(null);
    setMoreOpen(false);
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
      if (
        target instanceof Element &&
        target.closest(
          '[data-rich-content-floating-menu="true"], [data-rich-content-select-content="true"], .rich-content-toolbar-popover, .rich-content-toolbar .ui-select-trigger',
        )
      ) {
        return;
      }
      closeSubmenusRef.current();
    };
    ownerDocument.addEventListener('pointerdown', onPointerDown, true);
    return () => ownerDocument.removeEventListener('pointerdown', onPointerDown, true);
  }, [editor]);

  useEffect(() => {
    const syncToolbar = (): void => {
      const rootElement = editor.getRootElement();
      if (!rootElement) return;
      const ownerDocument = rootElement.ownerDocument;
      const activeElement = ownerDocument.activeElement;
      const toolbarActive = Boolean(
        toolbarRef.current?.contains(activeElement) ||
          activeElement?.closest?.(
            '[data-rich-content-floating-menu="true"], [data-rich-content-select-content="true"]',
          ),
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
          setActiveFormats((current) => (sameStringSet(current, nextFormats) ? current : nextFormats));
          const nextFontSize =
            $getSelectionStyleValueForProperty(selection, 'font-size', '16px').replace(
              /px$/u,
              '',
            ) || '16';
          setFontSize((current) => (current === nextFontSize ? current : nextFontSize));
          const native = ownerDocument.getSelection();
          const range =
            !selection.isCollapsed() && native && native.rangeCount > 0
              ? native.getRangeAt(0)
              : null;
          const nextRect =
            range && rootElement ? readRangeViewportRect(range, rootElement) : null;
          setSelectionRect((current) => {
            if (!nextRect) return current === null ? current : null;
            if (
              current &&
              Math.abs(current.top - nextRect.top) < 1 &&
              Math.abs(current.left - nextRect.left) < 1 &&
              Math.abs(current.width - nextRect.width) < 1
            ) {
              return current;
            }
            return nextRect;
          });
        } else {
          setSelectionRect(null);
        }
        const selectedNode = selectedTopLevelNode();
        if (selectedNode) {
          const original = originalBlockForNode(selectedNode, metadata);
          const nextBlockType = typeForNode(selectedNode, original?.type);
          const nextSpacing = original?.props.blockLayout?.spacingAfterPx ?? 8;
          setActiveBlockType((current) => (current === nextBlockType ? current : nextBlockType));
          setSpacingAfter((current) => (current === nextSpacing ? current : nextSpacing));
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

  const applyBlockType = (
    type: 'paragraph' | 'heading' | 'list' | 'callout' | 'stat',
  ): void => {
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
    const { linkDisplayAs: displayRaw, linkSelectedText: selected, linkUrl: urlRaw } =
      linkStateRef.current;
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

  const dockedMenuPlacement = document.querySelector('.overlay-step-main.toolbar-below')
    ? 'top-start'
    : 'bottom-start';
  const dockedMenuEndPlacement = document.querySelector('.overlay-step-main.toolbar-below')
    ? 'top-end'
    : 'bottom-end';

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

      <span className="rich-content-toolbar-divider" aria-hidden="true" />
      <ToolbarButton
        active={activeFormats.has('bold')}
        icon={<Bold size={16} />}
        label={authoringText('Bold')}
        onClick={() => withAuthorSelection((selection) => selection.formatText('bold'))}
      />
      <ToolbarButton
        active={activeFormats.has('italic')}
        icon={<Italic size={16} />}
        label={authoringText('Italic')}
        onClick={() => withAuthorSelection((selection) => selection.formatText('italic'))}
      />
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

      <span className="rich-content-toolbar-divider" aria-hidden="true" />
      <RichContentFloatingMenu
        content={
          <div className="rich-content-menu rich-content-insert-menu">
            {insertMenu === 'add' ? (
              <>
                <div className="rich-content-insert-options" role="menu">
                  <RichContentInsertOption
                    icon={<Type size={16} />}
                    label={authoringText('Normal text')}
                    onSelect={() => {
                      insertNodeAtSelection(editor, () => $createParagraphNode());
                      setInsertMenu(null);
                    }}
                  />
                  <RichContentInsertOption
                    icon={<Heading size={16} />}
                    label={authoringText('Heading')}
                    onSelect={() => {
                      insertNodeAtSelection(editor, () => $createHeadingNode('h2'));
                      setInsertMenu(null);
                    }}
                  />
                  <RichContentInsertOption
                    icon={<ListIcon size={16} />}
                    label={authoringText('Bulleted list')}
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
                    icon={<MessageSquareWarning size={16} />}
                    label={authoringText('Callout')}
                    onSelect={() => {
                      insertNodeAtSelection(editor, () => $createRichCalloutNode());
                      setInsertMenu(null);
                    }}
                  />
                  <RichContentInsertOption
                    icon={<Hash size={16} />}
                    label={authoringText('Stat')}
                    onSelect={() => {
                      insertNodeAtSelection(editor, () => $createRichStatNode());
                      setInsertMenu(null);
                    }}
                  />
                  <RichContentInsertOption
                    icon={<Minus size={16} />}
                    label={authoringText('Divider')}
                    onSelect={() => {
                      insertNodeAtSelection(editor, () => $createRichDividerNode(createBlockId()), {
                        trailingParagraph: true,
                      });
                      setInsertMenu(null);
                    }}
                  />
                  <RichContentInsertOption
                    icon={<MousePointerClick size={16} />}
                    label={authoringText('Button')}
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
                    icon={<SquareCheck size={16} />}
                    label={authoringText('Field')}
                    onSelect={() => toggleInsertMenu('field')}
                  />
                  <RichContentInsertOption
                    icon={<Shapes size={16} />}
                    label={authoringText('Icon')}
                    onSelect={() => toggleInsertMenu('icon')}
                  />
                  <RichContentInsertOption
                    icon={<Smile size={16} />}
                    label={authoringText('Emoji')}
                    onSelect={() => toggleInsertMenu('emoji')}
                  />
                </div>
                {onUploadMedia ? (
                  <RichContentMediaInsertPanel
                    captionTargetVideo={Boolean(media.captionTargetVideo)}
                    mediaUploadError={media.mediaUploadError}
                    onUploadCaptions={(file) => {
                      void media.uploadCaptions(file);
                    }}
                    onUploadMediaFile={(kind, file) => {
                      void media.uploadMediaIntoCanvas(kind, file);
                    }}
                    saveMediaToLibrary={media.saveMediaToLibrary}
                    setSaveMediaToLibrary={media.setSaveMediaToLibrary}
                    uploading={media.uploading}
                  />
                ) : null}
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
        <ToolbarButton
          active={Boolean(insertMenu)}
          icon={<Plus size={16} />}
          label={authoringText('Add content')}
          onClick={() => toggleInsertMenu('add')}
        />
      </RichContentFloatingMenu>
      <RichContentFloatingMenu
        className="rich-content-toolbar-popover-end"
        content={
          <div className="rich-content-menu rich-content-more-menu">
            <div className="rich-content-more-row">
            <ToolbarButton
              active={activeFormats.has('underline')}
              icon={<Underline size={16} />}
              label={authoringText('Underline')}
              onClick={() => withAuthorSelection((selection) => selection.formatText('underline'))}
            />
            <RichContentSelect
              ariaLabel={authoringText('Font size')}
              className="rich-content-font-size-trigger"
              onOpenChange={(nextOpen) => {
                setFontSizeOpen(nextOpen);
              }}
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
            <label className="rich-content-color-control" title={authoringText('Selection background')}>
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

  const selectionBubble =
    selectionRect && editor.getRootElement() ? (
      <RichContentFloatingAnchor
        anchorRect={() => selectionRect}
        className="rich-content-selection-bubble"
        contextElement={editor.getRootElement()}
        open
        placement="top"
      >
        <div className="rich-content-toolbar rich-content-selection-toolbar" role="toolbar">
          <ToolbarButton
            active={activeFormats.has('bold')}
            icon={<Bold size={16} />}
            label={authoringText('Bold')}
            onClick={() => withAuthorSelection((selection) => selection.formatText('bold'))}
          />
          <ToolbarButton
            active={activeFormats.has('italic')}
            icon={<Italic size={16} />}
            label={authoringText('Italic')}
            onClick={() => withAuthorSelection((selection) => selection.formatText('italic'))}
          />
          <ToolbarButton
            active={linkOpen}
            icon={<Link size={16} />}
            label={authoringText('Link')}
            onClick={() => (linkOpen ? commitLink() : openLinkMenu())}
          />
        </div>
      </RichContentFloatingAnchor>
    ) : null;

  if (!editor.isEditable()) return null;
  const chrome = (
    <>
      {toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar}
      {selectionBubble}
    </>
  );
  return chrome;
}

export function ToolbarButton({
  active = false,
  disabled = false,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
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
