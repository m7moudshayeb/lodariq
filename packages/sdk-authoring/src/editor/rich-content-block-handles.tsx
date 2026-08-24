import { BLOCK_SPACING_PX_LIMITS, type LodariqBlock } from '@lodariq/schema';
import { $createLinkNode } from '@lexical/link';
import { $createListItemNode, $createListNode } from '@lexical/list';
import { $createHeadingNode } from '@lexical/rich-text';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalNode,
  type NodeKey,
} from 'lexical';
import {
  ArrowDown,
  ArrowUp,
  ChartColumn,
  ChevronLeft,
  FormInput,
  GripVertical,
  Heading,
  Image as ImageIcon,
  Link as LinkIcon,
  List as ListIcon,
  MessageSquare,
  Minus,
  MoreHorizontal,
  Plus,
  Shield,
  Smile,
  Star,
  Target,
  Trash2,
  Type,
  Video,
  Zap,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
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
import { OVERLAY_CARD_GUTTER_OFFSET_PX } from '../authoring/overlay/constants';
import { blockIdForNode, type RichContentMetadata } from './rich-content-doc';
import { readViewportRect, RichContentFloatingMenu } from './rich-content-floating';
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
  $createRichTargetChipNode,
  $createRichValidationBadgeNode,
} from './rich-content-nodes';

/**
 * WIRE_DASHBOARD: a Link block starts pointed at the workspace's own docs base.
 * The real default belongs to the workspace's link settings; until that exists,
 * an obviously-placeholder URL beats an empty href that publishes as a dead link.
 */
const AUTHORED_LINK_PLACEHOLDER_URL = 'https://docs.example.com';

/**
 * How far the handle column sits outside the card, and how wide it is (§4.2a
 * rule 6). Entirely outside the card box on purpose: anything drawn inside it
 * changes the geometry the step publishes with, so a creator would be editing
 * against a card that is not the card their user sees.
 */
const HANDLE_GUTTER_PX = 44;

interface HoveredBlock {
  key: NodeKey;
  left: number;
  top: number;
  /** The block's bottom edge, which the "Add block" pill sits just under. */
  bottom: number;
  /** The card's left edge, which the gutter hangs off rather than the block's. */
  cardLeft: number;
  /** The card's width, so the pill can centre on the card rather than the block. */
  cardWidth: number;
}

/** A candidate during hover resolution: full geometry, before it narrows to a hover. */
interface LocatedBlock extends HoveredBlock {
  height: number;
}

interface DropTarget {
  key: NodeKey;
  position: 'before' | 'after';
}

type InsertMenuView = 'list' | 'icons' | 'emoji' | 'media';

/**
 * Hover gutter beside each top-level block: `+` opens a searchable insert
 * menu, the grip drags to reorder and clicks open per-block settings.
 */
export function BlockHandlesPlugin({
  metadata,
  onChange,
  onUploadMedia,
}: {
  metadata: RichContentMetadata;
  onChange: (value: LodariqBlock[]) => void;
  onUploadMedia?: (
    kind: 'image' | 'video' | 'captions',
    file: File,
    options: AuthoringMediaUploadOptions,
  ) => Promise<RichContentMediaUploadResult | null>;
}): ReactElement | null {
  const [editor] = useLexicalComposerContext();
  const [hovered, setHovered] = useState<HoveredBlock | null>(null);
  const [insertOpen, setInsertOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuView, setMenuView] = useState<InsertMenuView>('list');
  const [query, setQuery] = useState('');
  const [iconColor, setIconColor] = useState('#12715b');
  const [iconQuery, setIconQuery] = useState('');
  const [spacingAfter, setSpacingAfter] = useState(8);
  const [dropIndicator, setDropIndicator] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const menuOpenRef = useRef(false);
  const draggingKeyRef = useRef<NodeKey | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const didDragRef = useRef(false);
  const slashQueryRef = useRef<string | null>(null);
  const media = useRichContentMediaUpload(editor, onUploadMedia);
  menuOpenRef.current = insertOpen || settingsOpen;

  const closeMenus = (): void => {
    setInsertOpen(false);
    setSettingsOpen(false);
    setMenuView('list');
    setQuery('');
    setIconQuery('');
  };

  useEffect(() => {
    const rootElement = editor.getRootElement();
    if (!rootElement || !editor.isEditable()) return;
    const ownerDocument = rootElement.ownerDocument;

    /**
     * The published card, when this editor is the on-page overlay. The block's
     * own left edge sits inside the card's padding, so hanging the gutter off it
     * put the handles on top of the copy.
     */
    const cardBox = (): { left: number; width: number } => {
      const card = rootElement.closest('.overlay-step-card') ?? rootElement;
      const rect = readViewportRect(card);
      return { left: rect.left, width: rect.width };
    };

    const locateBlock = (clientY: number): HoveredBlock | null => {
      const card = cardBox();
      const keys = editor.getEditorState().read(() => $getRoot().getChildrenKeys());
      const located: LocatedBlock[] = [];
      for (const key of keys) {
        const element = editor.getElementByKey(key);
        if (!element) continue;
        const rect = readViewportRect(element);
        located.push({
          key,
          left: rect.left,
          top: rect.top,
          height: rect.height,
          bottom: rect.bottom,
          cardLeft: card.left,
          cardWidth: card.width,
        });
      }
      const visible = located.filter((block) => block.height > 0);
      const pool = visible.length > 0 ? visible : located;
      const hovered = (block: LocatedBlock): HoveredBlock => ({
        key: block.key,
        left: block.left,
        top: block.top,
        bottom: block.height > 0 ? block.bottom : block.top,
        cardLeft: block.cardLeft,
        cardWidth: block.cardWidth,
      });
      for (const block of pool) {
        if (clientY >= block.top && clientY <= hovered(block).bottom) return hovered(block);
      }
      /*
       * Between two blocks, take the nearest one. Falling back to the first
       * block meant the gutter jumped to the top of the card whenever the
       * pointer crossed the gap between paragraphs — including the gap it has to
       * cross on the way to the gutter itself, so the handles moved out from
       * under the cursor as it arrived.
       */
      let nearest: LocatedBlock | null = null;
      let shortest = Number.POSITIVE_INFINITY;
      for (const block of pool) {
        const bottom = hovered(block).bottom;
        const distance =
          clientY < block.top ? block.top - clientY : clientY > bottom ? clientY - bottom : 0;
        if (distance < shortest) {
          shortest = distance;
          nearest = block;
        }
      }
      return nearest ? hovered(nearest) : null;
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (menuOpenRef.current || draggingKeyRef.current) return;
      const target = event.target;
      if (target instanceof Element && target.closest('[data-rich-block-handles="true"]')) return;
      const rootRect = readViewportRect(rootElement);
      const inBounds =
        event.clientX >= rootRect.left - HANDLE_GUTTER_PX &&
        event.clientX <= rootRect.right &&
        event.clientY >= rootRect.top &&
        event.clientY <= rootRect.bottom;
      if (!inBounds) {
        if (!menuOpenRef.current) setHovered(null);
        return;
      }
      const next = locateBlock(event.clientY);
      setHovered((current) =>
        current &&
        next &&
        current.key === next.key &&
        Math.abs(current.top - next.top) < 1 &&
        Math.abs(current.left - next.left) < 1
          ? current
          : next,
      );
    };

    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (!menuOpenRef.current) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          '[data-rich-block-handles="true"], [data-rich-content-floating-menu="true"], .ui-select-content',
        )
      )
        return;
      closeMenus();
    };

    ownerDocument.addEventListener('pointermove', onPointerMove);
    ownerDocument.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => {
      ownerDocument.removeEventListener('pointermove', onPointerMove);
      ownerDocument.removeEventListener('pointerdown', closeOnOutsidePointer, true);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor.isEditable()) return;
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          if (slashQueryRef.current !== null) {
            slashQueryRef.current = null;
            setInsertOpen(false);
            setQuery('');
          }
          return;
        }
        const anchor = selection.anchor.getNode();
        const prefix = $isTextNode(anchor)
          ? anchor.getTextContent().slice(0, selection.anchor.offset)
          : '';
        const match = prefix.match(/^\/([^\s]*)$/u);
        if (!match) {
          if (slashQueryRef.current !== null) {
            slashQueryRef.current = null;
            setInsertOpen(false);
            setQuery('');
          }
          return;
        }
        const top = anchor.getTopLevelElement();
        const key = top?.getKey();
        const element = key ? editor.getElementByKey(key) : null;
        slashQueryRef.current = match[1] ?? '';
        setQuery(match[1] ?? '');
        setMenuView('list');
        setInsertOpen(true);
        if (key && element) {
          const rect = readViewportRect(element);
          const root = editor.getRootElement();
          const card = root?.closest('.overlay-step-card') ?? root;
          const cardRect = card ? readViewportRect(card) : rect;
          setHovered({
            key,
            left: rect.left,
            top: rect.top,
            bottom: rect.bottom,
            cardLeft: cardRect.left,
            cardWidth: cardRect.width,
          });
        }
      });
    });
  }, [editor]);

  // The grip is portaled to document.body and the popup uses CSS zoom, so
  // HTML5 drop often misses the contenteditable. Track the drag on document.
  useEffect(() => {
    const rootElement = editor.getRootElement();
    if (!rootElement || !editor.isEditable()) return;
    const ownerDocument = rootElement.ownerDocument;

    const locateDrop = (
      clientY: number,
    ): { target: DropTarget; indicator: { left: number; top: number; width: number } } | null => {
      const keys = editor.getEditorState().read(() => $getRoot().getChildrenKeys());
      for (const key of keys) {
        const element = editor.getElementByKey(key);
        if (!element) continue;
        const rect = readViewportRect(element);
        if (rect.height <= 0) continue;
        if (clientY > rect.bottom) continue;
        const before = clientY < rect.top + rect.height / 2;
        return {
          target: { key, position: before ? 'before' : 'after' },
          indicator: {
            left: rect.left,
            top: before ? rect.top : rect.bottom,
            width: rect.width,
          },
        };
      }
      const lastKey = keys[keys.length - 1];
      if (!lastKey) return null;
      const lastElement = editor.getElementByKey(lastKey);
      if (!lastElement) return null;
      const rect = readViewportRect(lastElement);
      return {
        target: { key: lastKey, position: 'after' },
        indicator: { left: rect.left, top: rect.bottom, width: rect.width },
      };
    };

    const onDragOver = (event: DragEvent): void => {
      if (!draggingKeyRef.current) return;
      const located = locateDrop(event.clientY);
      if (!located) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      dropTargetRef.current = located.target;
      setDropIndicator(located.indicator);
    };

    const onDrop = (event: DragEvent): void => {
      const draggedKey = draggingKeyRef.current;
      const target = dropTargetRef.current;
      if (!draggedKey) return;
      event.preventDefault();
      if (target && target.key !== draggedKey) {
        editor.update(() => {
          const dragged = $getNodeByKey(draggedKey);
          const anchor = $getNodeByKey(target.key);
          if (!dragged || !anchor) return;
          if (target.position === 'before') anchor.insertBefore(dragged);
          else anchor.insertAfter(dragged);
        });
      }
      draggingKeyRef.current = null;
      dropTargetRef.current = null;
      setDropIndicator(null);
      setHovered(null);
    };

    ownerDocument.addEventListener('dragover', onDragOver, true);
    ownerDocument.addEventListener('drop', onDrop, true);
    return () => {
      ownerDocument.removeEventListener('dragover', onDragOver, true);
      ownerDocument.removeEventListener('drop', onDrop, true);
    };
  }, [editor]);

  const readBlockId = (key: NodeKey): string | null =>
    editor.getEditorState().read(() => {
      const node = $getNodeByKey(key);
      return node ? blockIdForNode(node, metadata) : null;
    });

  const openSettings = (): void => {
    if (!hovered) return;
    const blockId = readBlockId(hovered.key);
    const block = blockId ? metadata.originalByBlockId.get(blockId) : undefined;
    setSpacingAfter(block?.props.blockLayout?.spacingAfterPx ?? 8);
    setInsertOpen(false);
    setSettingsOpen((current) => !current);
  };

  const applySpacingAfter = (rawValue: number): void => {
    if (!hovered) return;
    const blockId = readBlockId(hovered.key);
    if (!blockId) return;
    setSpacingAfter(rawValue);
    applyBlockSpacingAfter(editor, metadata, onChange, hovered.key, blockId, rawValue);
  };

  const moveHoveredBlock = (direction: 'up' | 'down'): void => {
    if (!hovered) return;
    const { key } = hovered;
    editor.update(() => {
      const node = $getNodeByKey(key);
      if (!node) return;
      const sibling = direction === 'up' ? node.getPreviousSibling() : node.getNextSibling();
      if (!sibling) return;
      if (direction === 'up') sibling.insertBefore(node);
      else sibling.insertAfter(node);
    });
    setHovered(null);
    closeMenus();
  };

  const deleteHoveredBlock = (): void => {
    if (!hovered) return;
    const { key } = hovered;
    editor.update(() => {
      const node = $getNodeByKey(key);
      if (!node) return;
      node.remove();
      if ($getRoot().getChildrenSize() === 0) $getRoot().append($createParagraphNode());
    });
    setHovered(null);
    closeMenus();
  };

  const consumeSlashQuery = (): void => {
    if (slashQueryRef.current === null) return;
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const node = selection.anchor.getNode();
      if (!$isTextNode(node)) return;
      const text = node.getTextContent();
      const match = text.match(/^\/[^\s]*/u);
      if (match) node.setTextContent(text.slice(match[0].length));
    });
    slashQueryRef.current = null;
    setQuery('');
  };

  const insertAfterHovered = (
    createNode: () => LexicalNode,
    options: { keepMenuOpen?: boolean; trailingParagraph?: boolean } = {},
  ): NodeKey | null => {
    consumeSlashQuery();
    const inserted = insertNodeAtSelection(editor, createNode, {
      afterKey: hovered?.key ?? null,
      trailingParagraph: options.trailingParagraph,
    });
    if (!options.keepMenuOpen) {
      closeMenus();
      setHovered(null);
    }
    return inserted;
  };

  const insertEmoji = (emoji: string): void => {
    consumeSlashQuery();
    insertTextAtSelection(editor, emoji, { afterKey: hovered?.key ?? null });
  };

  /*
   * The gutter is measured on hover and drawn `position: fixed`, so anything that
   * moves the card afterwards leaves it behind — opening the inspector shifts the
   * card 270px right and the grip stayed put, on top of the inspector. Re-measured
   * after every commit, guarded so an unchanged position is not a new render.
   */
  useLayoutEffect(() => {
    if (!hovered) return;
    const element = editor.getElementByKey(hovered.key);
    const root = editor.getRootElement();
    const card = root?.closest('.overlay-step-card') ?? root;
    if (!element || !card) return;
    const block = readViewportRect(element);
    const cardRect = readViewportRect(card);
    setHovered((current) => {
      if (!current || current.key !== hovered.key) return current;
      if (
        current.top === block.top &&
        current.bottom === block.bottom &&
        current.cardLeft === cardRect.left &&
        current.cardWidth === cardRect.width
      ) {
        return current;
      }
      return {
        ...current,
        top: block.top,
        bottom: block.bottom,
        cardLeft: cardRect.left,
        cardWidth: cardRect.width,
      };
    });
  });

  const ownerDocument = editor.getRootElement()?.ownerDocument;
  if (!ownerDocument || !editor.isEditable()) return null;

  const handleStyle: CSSProperties | null = hovered
    ? {
        left: Math.max(4, hovered.cardLeft + OVERLAY_CARD_GUTTER_OFFSET_PX),
        position: 'fixed',
        top: hovered.top,
      }
    : null;

  const insertOptions: {
    id: string;
    icon: ReactNode;
    label: string;
    onSelect: () => void;
  }[] = [
    {
      id: 'heading',
      icon: <Heading size={17} />,
      label: authoringText('Heading'),
      onSelect: () => insertAfterHovered(() => $createHeadingNode('h2')),
    },
    {
      id: 'paragraph',
      icon: <Type size={17} />,
      label: authoringText('Text'),
      onSelect: () => insertAfterHovered(() => $createParagraphNode()),
    },
    {
      id: 'list',
      icon: <ListIcon size={17} />,
      label: authoringText('List'),
      onSelect: () =>
        insertAfterHovered(() => {
          const list = $createListNode('bullet');
          list.append($createListItemNode());
          return list;
        }),
    },
    {
      id: 'divider',
      icon: <Minus size={17} />,
      label: authoringText('Divider'),
      onSelect: () =>
        insertAfterHovered(() => $createRichDividerNode(createBlockId()), {
          trailingParagraph: true,
        }),
    },
    {
      id: 'image',
      icon: <ImageIcon size={17} />,
      label: authoringText('Image'),
      onSelect: () => setMenuView('media'),
    },
    {
      id: 'video',
      icon: <Video size={17} />,
      label: authoringText('Video'),
      onSelect: () => setMenuView('media'),
    },
    {
      id: 'callout',
      icon: <MessageSquare size={17} />,
      label: authoringText('Callout'),
      onSelect: () => insertAfterHovered(() => $createRichCalloutNode()),
    },
    {
      id: 'stat',
      icon: <ChartColumn size={17} />,
      label: authoringText('Stat'),
      onSelect: () => insertAfterHovered(() => $createRichStatNode()),
    },
    {
      id: 'icon',
      icon: <Star size={17} />,
      label: authoringText('Icon + text'),
      onSelect: () => setMenuView('icons'),
    },
    {
      id: 'form-field',
      icon: <FormInput size={17} />,
      label: authoringText('Form field'),
      onSelect: () =>
        insertAfterHovered(() => {
          const id = createBlockId();
          return $createRichFormFieldNode(
            id,
            formFieldInsertLabel('text'),
            createFormFieldProps('text', id),
          );
        }),
    },
    {
      id: 'button',
      icon: <Zap size={17} />,
      label: authoringText('Buttons'),
      onSelect: () =>
        insertAfterHovered(() =>
          $createRichButtonNode(createBlockId(), authoringText('Continue'), {
            action: { type: 'next' },
            variant: 'primary',
          }),
        ),
    },
    {
      id: 'link',
      icon: <LinkIcon size={17} />,
      label: authoringText('Link'),
      onSelect: () =>
        insertAfterHovered(() => {
          const paragraph = $createParagraphNode();
          const link = $createLinkNode(AUTHORED_LINK_PLACEHOLDER_URL);
          link.append($createTextNode(authoringText('Read the guide')));
          paragraph.append(link);
          return paragraph;
        }),
    },
    {
      id: 'target-chip',
      icon: <Target size={17} />,
      label: authoringText('Target chip'),
      onSelect: () =>
        insertAfterHovered(() => {
          const chip = $createRichTargetChipNode();
          chip.append($createTextNode(authoringText('Create project')));
          return chip;
        }),
    },
    {
      id: 'validation-badge',
      icon: <Shield size={17} />,
      label: authoringText('Status badge'),
      onSelect: () =>
        insertAfterHovered(
          () =>
            $createRichValidationBadgeNode(
              createBlockId(),
              'ready',
              authoringText('Verified on this screen'),
            ),
          { trailingParagraph: true },
        ),
    },
    {
      id: 'emoji',
      icon: <Smile size={17} />,
      label: authoringText('Emoji'),
      onSelect: () => setMenuView('emoji'),
    },
  ];

  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = insertOptions.filter((option) =>
    option.label.toLowerCase().includes(normalizedQuery),
  );
  /*
   * Typing `/` is already a filter, so that path keeps the narrowing list. A
   * creator who pressed a button instead is choosing from the whole set, and
   * shape reads faster than label there — so that path gets the four-up grid.
   */
  const slashDriven = slashQueryRef.current !== null;

  const renderInsertMenu = (heading: string): ReactElement => (
    <div className="rich-content-menu rich-content-insert-menu">
      {menuView === 'list' ? (
        <>
          {slashDriven ? (
            <p className="rich-content-slash-hint">{authoringText('Insert')}</p>
          ) : (
            <p className="rich-content-insert-heading">{heading}</p>
          )}
          <div
            className={slashDriven ? 'rich-content-insert-options' : 'rich-content-insert-grid'}
            role="menu"
          >
            {visibleOptions.map((option) => (
              <RichContentInsertOption
                icon={option.icon}
                key={option.id}
                label={option.label}
                onSelect={option.onSelect}
              />
            ))}
            {visibleOptions.length === 0 ? (
              <span className="rich-content-insert-empty">
                {authoringText('No matching content')}
              </span>
            ) : null}
          </div>
          {slashDriven ? null : (
            <>
              <div className="rich-content-insert-separator" />
              <p className="rich-content-insert-note">
                {authoringText('Blocks flow like a document. Drag the gutter handle to reorder.')}
              </p>
            </>
          )}
        </>
      ) : null}
      {menuView === 'media' && onUploadMedia ? (
        <>
          <button
            className="rich-content-insert-back"
            onClick={() => setMenuView('list')}
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
              consumeSlashQuery();
              void media.uploadMediaIntoCanvas(kind, file, hovered?.key ?? null);
              closeMenus();
              setHovered(null);
            }}
            saveMediaToLibrary={media.saveMediaToLibrary}
            setSaveMediaToLibrary={media.setSaveMediaToLibrary}
            uploading={media.uploading}
          />
        </>
      ) : null}
      {menuView === 'icons' ? (
        <RichContentIconPickerPanel
          color={iconColor}
          onBack={() => setMenuView('list')}
          onColorChange={setIconColor}
          onQueryChange={setIconQuery}
          onSelect={(icon, label, color) => {
            insertAfterHovered(() => $createRichIconNode(createBlockId(), icon, label, color), {
              keepMenuOpen: true,
            });
          }}
          query={iconQuery}
        />
      ) : null}
      {menuView === 'emoji' ? (
        <RichContentEmojiPickerPanel onBack={() => setMenuView('list')} onSelect={insertEmoji} />
      ) : null}
    </div>
  );

  const settingsMenu = (
    <div className="rich-content-menu rich-content-block-settings-menu">
      <label className="rich-content-spacing-control">
        <span>{authoringText('Space after')}</span>
        <span>
          <input
            aria-label={authoringText('Space after')}
            max={BLOCK_SPACING_PX_LIMITS.max}
            min={BLOCK_SPACING_PX_LIMITS.min}
            onChange={(event) => applySpacingAfter(Number(event.currentTarget.value))}
            step={BLOCK_SPACING_PX_LIMITS.step}
            type="number"
            value={spacingAfter}
          />
          <span>{authoringText('px')}</span>
        </span>
      </label>
      <button
        onClick={() => moveHoveredBlock('up')}
        onPointerDown={(event) => event.preventDefault()}
        type="button"
      >
        <ArrowUp size={15} />
        <span>{authoringText('Move up')}</span>
      </button>
      <button
        onClick={() => moveHoveredBlock('down')}
        onPointerDown={(event) => event.preventDefault()}
        type="button"
      >
        <ArrowDown size={15} />
        <span>{authoringText('Move down')}</span>
      </button>
      <button
        className="rich-content-block-delete"
        onClick={deleteHoveredBlock}
        onPointerDown={(event) => event.preventDefault()}
        type="button"
      >
        <Trash2 size={15} />
        <span>{authoringText('Delete block')}</span>
      </button>
    </div>
  );

  return createPortal(
    <>
      {hovered && handleStyle ? (
        <div
          className="rich-content-block-handles"
          data-rich-block-handles="true"
          style={handleStyle}
        >
          {/*
            Grip, insert, options — three, in the prototype's order. The grip
            drags and does nothing else: overloading it with a click menu meant a
            creator who missed the drag threshold got a menu they did not ask for.
          */}
          <button
            aria-label={authoringText('Drag to reorder')}
            className="rich-content-block-grip"
            draggable
            onClick={(event) => event.preventDefault()}
            onDragEnd={() => {
              draggingKeyRef.current = null;
              dropTargetRef.current = null;
              setDropIndicator(null);
              ownerDocument.defaultView?.setTimeout(() => {
                didDragRef.current = false;
              }, 0);
            }}
            onDragStart={(event) => {
              if (!hovered) return;
              closeMenus();
              didDragRef.current = true;
              draggingKeyRef.current = hovered.key;
              if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', hovered.key);
                const blockElement = editor.getElementByKey(hovered.key);
                if (blockElement) event.dataTransfer.setDragImage(blockElement, 0, 0);
              }
            }}
            title={authoringText('Drag to reorder')}
            type="button"
          >
            <GripVertical size={13} />
          </button>
          <RichContentFloatingMenu
            content={renderInsertMenu(authoringText('Insert after'))}
            open={insertOpen}
            placement="bottom-start"
          >
            <button
              aria-expanded={insertOpen}
              aria-label={authoringText('Add content')}
              onClick={() => {
                setSettingsOpen(false);
                setMenuView('list');
                setQuery('');
                setInsertOpen((current) => !current);
              }}
              onPointerDown={(event) => event.preventDefault()}
              title={authoringText('Add content')}
              type="button"
            >
              <Plus size={13} />
            </button>
          </RichContentFloatingMenu>
          <RichContentFloatingMenu
            content={settingsMenu}
            open={settingsOpen}
            placement="bottom-start"
          >
            <button
              aria-expanded={settingsOpen}
              aria-label={authoringText('Block options')}
              onClick={(event) => {
                if (didDragRef.current) {
                  event.preventDefault();
                  return;
                }
                openSettings();
              }}
              onDragEnd={() => {
                draggingKeyRef.current = null;
                dropTargetRef.current = null;
                setDropIndicator(null);
                ownerDocument.defaultView?.setTimeout(() => {
                  didDragRef.current = false;
                }, 0);
              }}
              onDragStart={(event) => {
                if (!hovered) return;
                closeMenus();
                didDragRef.current = true;
                draggingKeyRef.current = hovered.key;
                if (event.dataTransfer) {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', hovered.key);
                  const blockElement = editor.getElementByKey(hovered.key);
                  if (blockElement) event.dataTransfer.setDragImage(blockElement, 0, 0);
                }
              }}
              title={authoringText('Block options')}
              type="button"
            >
              <MoreHorizontal size={13} />
            </button>
          </RichContentFloatingMenu>
        </div>
      ) : null}
      {dropIndicator ? (
        <div
          aria-hidden="true"
          className="rich-content-drop-indicator"
          style={{
            left: dropIndicator.left,
            position: 'fixed',
            top: dropIndicator.top,
            width: dropIndicator.width,
          }}
        />
      ) : null}
    </>,
    ownerDocument.body,
  );
}
