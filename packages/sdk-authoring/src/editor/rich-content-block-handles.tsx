import { BLOCK_SPACING_PX_LIMITS, type LodariqBlock } from '@lodariq/schema';
import { $createListItemNode, $createListNode } from '@lexical/list';
import { $createHeadingNode } from '@lexical/rich-text';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
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
  CircleDot,
  GripVertical,
  Hash,
  Heading,
  List as ListIcon,
  MessageSquareWarning,
  Minus,
  MousePointerClick,
  Plus,
  Shapes,
  Smile,
  SquareCheck,
  TextCursorInput,
  Trash2,
  Type,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AuthoringMediaUploadOptions } from '../authoring/local-frame-types';
import { authoringText } from '../i18n';
import { createBlockId } from './ids';
import { applyBlockSpacingAfter, createFormFieldProps, formFieldInsertLabel, insertNodeAtSelection, insertTextAtSelection } from './rich-content-commands';
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
} from './rich-content-nodes';

const HANDLE_GUTTER_PX = 44;

interface HoveredBlock {
  key: NodeKey;
  left: number;
  top: number;
}

interface DropTarget {
  key: NodeKey;
  position: 'before' | 'after';
}

type InsertMenuView = 'list' | 'icons' | 'emoji';

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

    const locateBlock = (clientY: number): HoveredBlock | null => {
      const keys = editor.getEditorState().read(() => $getRoot().getChildrenKeys());
      const located: HoveredBlock[] = [];
      for (const key of keys) {
        const element = editor.getElementByKey(key);
        if (!element) continue;
        const rect = readViewportRect(element);
        located.push({ key, left: rect.left, top: rect.top, height: rect.height, bottom: rect.bottom });
      }
      const visible = located.filter((block) => block.height > 0);
      const pool = visible.length > 0 ? visible : located;
      for (const block of pool) {
        const bottom = block.height > 0 ? block.bottom : block.top;
        if (clientY >= block.top && clientY <= bottom) {
          return { key: block.key, left: block.left, top: block.top };
        }
      }
      return pool[0] ? { key: pool[0].key, left: pool[0].left, top: pool[0].top } : null;
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
          '[data-rich-block-handles="true"], [data-rich-content-floating-menu="true"], [data-rich-content-select-content="true"]',
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
          setHovered({ key, left: rect.left, top: rect.top });
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

  const ownerDocument = editor.getRootElement()?.ownerDocument;
  if (!ownerDocument || !editor.isEditable()) return null;

  const handleStyle: CSSProperties | null = hovered
    ? {
        left: Math.max(4, hovered.left - HANDLE_GUTTER_PX),
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
      id: 'paragraph',
      icon: <Type size={16} />,
      label: authoringText('Normal text'),
      onSelect: () => insertAfterHovered(() => $createParagraphNode()),
    },
    {
      id: 'heading',
      icon: <Heading size={16} />,
      label: authoringText('Heading'),
      onSelect: () => insertAfterHovered(() => $createHeadingNode('h2')),
    },
    {
      id: 'list',
      icon: <ListIcon size={16} />,
      label: authoringText('Bulleted list'),
      onSelect: () =>
        insertAfterHovered(() => {
          const list = $createListNode('bullet');
          list.append($createListItemNode());
          return list;
        }),
    },
    {
      id: 'callout',
      icon: <MessageSquareWarning size={16} />,
      label: authoringText('Callout'),
      onSelect: () => insertAfterHovered(() => $createRichCalloutNode()),
    },
    {
      id: 'stat',
      icon: <Hash size={16} />,
      label: authoringText('Stat'),
      onSelect: () => insertAfterHovered(() => $createRichStatNode()),
    },
    {
      id: 'divider',
      icon: <Minus size={16} />,
      label: authoringText('Divider'),
      onSelect: () =>
        insertAfterHovered(() => $createRichDividerNode(createBlockId()), {
          trailingParagraph: true,
        }),
    },
    {
      id: 'button',
      icon: <MousePointerClick size={16} />,
      label: authoringText('Button'),
      onSelect: () =>
        insertAfterHovered(() =>
          $createRichButtonNode(createBlockId(), authoringText('Continue'), {
            action: { type: 'next' },
            variant: 'primary',
          }),
        ),
    },
    {
      id: 'checkbox',
      icon: <SquareCheck size={16} />,
      label: authoringText('Checkbox'),
      onSelect: () =>
        insertAfterHovered(() => {
          const id = createBlockId();
          return $createRichFormFieldNode(id, formFieldInsertLabel('checkbox'), createFormFieldProps('checkbox', id));
        }),
    },
    {
      id: 'text-field',
      icon: <TextCursorInput size={16} />,
      label: authoringText('Text field'),
      onSelect: () =>
        insertAfterHovered(() => {
          const id = createBlockId();
          return $createRichFormFieldNode(id, formFieldInsertLabel('text'), createFormFieldProps('text', id));
        }),
    },
    {
      id: 'radio',
      icon: <CircleDot size={16} />,
      label: authoringText('Radio'),
      onSelect: () =>
        insertAfterHovered(() => {
          const id = createBlockId();
          return $createRichFormFieldNode(id, formFieldInsertLabel('radio'), createFormFieldProps('radio', id));
        }),
    },
    {
      id: 'icon',
      icon: <Shapes size={16} />,
      label: authoringText('Icon'),
      onSelect: () => setMenuView('icons'),
    },
    {
      id: 'emoji',
      icon: <Smile size={16} />,
      label: authoringText('Emoji'),
      onSelect: () => setMenuView('emoji'),
    },
  ];

  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = insertOptions.filter((option) =>
    option.label.toLowerCase().includes(normalizedQuery),
  );

  const insertMenu = (
    <div className="rich-content-menu rich-content-insert-menu">
      {menuView === 'list' ? (
        <>
          {slashQueryRef.current === null ? (
            <input
              aria-label={authoringText('Search content types')}
              autoFocus
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={authoringText('Search…')}
              type="search"
              value={query}
            />
          ) : (
            <p className="rich-content-slash-hint">{authoringText('Insert')}</p>
          )}
          <div className="rich-content-insert-options" role="menu">
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
          {onUploadMedia ? (
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
          ) : null}
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
        <RichContentEmojiPickerPanel
          onBack={() => setMenuView('list')}
          onSelect={insertEmoji}
        />
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
          <RichContentFloatingMenu content={insertMenu} open={insertOpen} placement="bottom-start">
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
              <Plus size={15} />
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
              draggable
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
              title={authoringText('Drag to reorder, click for options')}
              type="button"
            >
              <GripVertical size={15} />
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
