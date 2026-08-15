import {
  AUTHORING_RESOURCE_LIMITS,
  BLOCK_SPACING_PX_LIMITS,
  ICON_RECIPE_VALUES,
  TOUR_MOTION_EASING_VALUES,
  TOUR_MOTION_RECIPE_VALUES,
  type AuthoringMediaAssetResource,
  type InlineTextRun,
  type LodariqBlock,
  type LodariqBlockProps,
  type LodariqBlockType,
  type MediaPresentation,
  type TourMotionPresentation,
} from '@lodariq/schema';
import { $createLinkNode, $isLinkNode, $toggleLink, LinkNode } from '@lexical/link';
import {
  $createListItemNode,
  $createListNode,
  $isListNode,
  insertList,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
  $setBlocksType,
} from '@lexical/selection';
import { HeadingNode, $createHeadingNode, $isHeadingNode } from '@lexical/rich-text';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getNearestNodeFromDOMNode,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_ELEMENT_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type ElementFormatType,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type RangeSelection,
  type TextNode,
} from 'lexical';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Clapperboard,
  Heading,
  Highlighter,
  Image,
  Italic,
  Link,
  List as ListIcon,
  MessageSquareWarning,
  Minus,
  MousePointerClick,
  Palette,
  Shapes,
  Smile,
  Type,
  Underline,
  Upload,
} from 'lucide-react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { AuthoringMediaUploadOptions } from '../authoring/local-frame-types';
import { authoringText } from '../i18n';
import { createBlockId } from './ids';
import { RichContentFloatingMenu } from './rich-content-floating';
import { lucideIconName } from './rich-content-icons';
import {
  $createRichCalloutNode,
  $createRichButtonNode,
  $createRichDividerNode,
  $createRichIconNode,
  $createRichMediaNode,
  $isRichCalloutNode,
  $isRichButtonNode,
  $isRichDividerNode,
  $isRichIconNode,
  $isRichMediaNode,
  RichCalloutNode,
  RichButtonNode,
  RichDividerNode,
  RichIconNode,
  RichMediaNode,
} from './rich-content-nodes';
import { RichContentSelect } from './rich-content-select';

const RichContentEmojiPicker = lazy(() => import('./rich-content-emoji-picker'));

const RICH_CONTENT_UPDATE_THROTTLE_MS = 200;

const ALIGNMENT_LABELS: Readonly<Record<'left' | 'center' | 'right', string>> = {
  left: authoringText('Align left'),
  center: authoringText('Align center'),
  right: authoringText('Align right'),
};

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
const INLINE_MOTION_RECIPE_SET = new Set<string>(TOUR_MOTION_RECIPE_VALUES);
const INLINE_MOTION_EASING_SET = new Set<string>(TOUR_MOTION_EASING_VALUES);
const TEXT_BLOCK_TYPES = new Set<LodariqBlockType>([
  'paragraph',
  'heading',
  'list',
  'callout',
  'stat',
]);

interface RichContentMetadata {
  blockIdByNodeKey: Map<NodeKey, string>;
  originalByBlockId: Map<string, LodariqBlock>;
}

export interface RichContentMediaUploadResult {
  asset: AuthoringMediaAssetResource;
  previewUrl: string | null;
}

export interface RichContentEditorProps {
  /** Canonical value. Blocks are persistence data and are never exposed as editing chrome. */
  value: readonly LodariqBlock[];
  onChange: (value: LodariqBlock[]) => void;
  onResolveMediaPreview?: (assetId: string) => Promise<string | null>;
  onUploadMedia?: (
    kind: 'image' | 'video' | 'captions',
    file: File,
    options: AuthoringMediaUploadOptions,
  ) => Promise<RichContentMediaUploadResult | null>;
  readOnly?: boolean;
}

/**
 * Reusable freeform structured-content editor.
 *
 * Authors interact with one continuous document and a caret. The component
 * translates Lexical state to Lodariq's safe block JSON at its boundary; block
 * identities and renderer recipes are deliberately not part of the UI model.
 */
export function RichContentEditor({
  value,
  onChange,
  onResolveMediaPreview,
  onUploadMedia,
  readOnly = false,
}: RichContentEditorProps): ReactElement {
  const metadata = useRef<RichContentMetadata>({
    blockIdByNodeKey: new Map(),
    originalByBlockId: new Map(),
  });
  const initialValue = useRef(value.map((block) => structuredClone(block)));
  const initialConfig = useMemo(
    () => ({
      namespace: 'lodariq-rich-content',
      editable: !readOnly,
      nodes: [
        HeadingNode,
        LinkNode,
        ListNode,
        ListItemNode,
        RichCalloutNode,
        RichButtonNode,
        RichDividerNode,
        RichIconNode,
        RichMediaNode,
      ],
      theme: {
        paragraph: 'rich-content-paragraph',
        heading: { h2: 'rich-content-heading' },
        list: {
          listitem: 'rich-content-list-item',
          ul: 'rich-content-list',
          ol: 'rich-content-list',
        },
        link: 'rich-content-link',
        text: {
          bold: 'rich-content-bold',
          italic: 'rich-content-italic',
          underline: 'rich-content-underline',
        },
      },
      editorState: () => importRichContent(initialValue.current, metadata.current),
      onError: (error: Error) => {
        throw error;
      },
    }),
    [readOnly],
  );

  return (
    <section className="rich-content-editor" aria-label={authoringText('Rich content')}>
      <LexicalComposer initialConfig={initialConfig}>
        <RichContentToolbar
          metadata={metadata.current}
          onChange={onChange}
          onUploadMedia={onUploadMedia}
        />
        <div className="rich-content-canvas-shell">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label={authoringText('Rich content')}
                className="rich-content-canvas"
              />
            }
            placeholder={
              <div className="rich-content-placeholder">{authoringText('Start writing…')}</div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <LinkPlugin />
        <ListPlugin />
        <DecoratorDeletionPlugin />
        <MediaPreviewPlugin metadata={metadata.current} resolve={onResolveMediaPreview} />
        <ThrottledRichContentOnChangePlugin metadata={metadata.current} onChange={onChange} />
      </LexicalComposer>
    </section>
  );
}

function ThrottledRichContentOnChangePlugin({
  metadata,
  onChange,
}: {
  metadata: RichContentMetadata;
  onChange: (value: LodariqBlock[]) => void;
}): ReactElement {
  const onChangeRef = useRef(onChange);
  const lastEmittedFingerprint = useRef('');
  const pendingValue = useRef<LodariqBlock[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  onChangeRef.current = onChange;

  const flush = (): void => {
    timer.current = null;
    const next = pendingValue.current;
    pendingValue.current = null;
    if (!next) return;
    const fingerprint = JSON.stringify(next);
    if (fingerprint === lastEmittedFingerprint.current) return;
    lastEmittedFingerprint.current = fingerprint;
    onChangeRef.current(next);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      flush();
    },
    [],
  );

  return (
    <OnChangePlugin
      ignoreSelectionChange
      onChange={(editorState) => {
        pendingValue.current = editorState.read(() => exportRichContent(metadata));
        if (timer.current) return;
        timer.current = setTimeout(flush, RICH_CONTENT_UPDATE_THROTTLE_MS);
      }}
    />
  );
}

function RichContentToolbar({
  metadata,
  onChange,
  onUploadMedia,
}: {
  metadata: RichContentMetadata;
  onChange: (value: LodariqBlock[]) => void;
  onUploadMedia: RichContentEditorProps['onUploadMedia'];
}) {
  const [editor] = useLexicalComposerContext();
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [animationOpen, setAnimationOpen] = useState(false);
  const [animationRecipe, setAnimationRecipe] = useState<TourMotionPresentation['recipe'] | 'none'>(
    DEFAULT_INLINE_ANIMATION.recipe,
  );
  const [animationDurationMs, setAnimationDurationMs] = useState(
    DEFAULT_INLINE_ANIMATION.durationMs,
  );
  const [animationEasing, setAnimationEasing] = useState<TourMotionPresentation['easing']>(
    DEFAULT_INLINE_ANIMATION.easing,
  );
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [iconColor, setIconColor] = useState('#12715b');
  const [iconQuery, setIconQuery] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDisplayAs, setLinkDisplayAs] = useState('');
  const [linkSelectionHasText, setLinkSelectionHasText] = useState(false);
  const [linkSelectedText, setLinkSelectedText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [mediaOpen, setMediaOpen] = useState(false);
  const [saveMediaToLibrary, setSaveMediaToLibrary] = useState(false);
  const [captionTargetVideo, setCaptionTargetVideo] = useState<{
    nodeKey: NodeKey;
    upload: RichContentMediaUploadResult;
  } | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeBlockType, setActiveBlockType] = useState<LodariqBlockType>('paragraph');
  const [activeFormats, setActiveFormats] = useState<ReadonlySet<string>>(new Set());
  const [fontSize, setFontSize] = useState('16');
  const [uploading, setUploading] = useState(false);
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);
  const savedSelection = useRef<RangeSelection | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const captureAuthorSelection = (): RangeSelection | null => {
    const rootElement = editor.getRootElement();
    const activeElement = rootElement?.ownerDocument.activeElement;
    if (!rootElement || !activeElement || !rootElement.contains(activeElement)) return null;
    let captured: RangeSelection | null = null;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      captured = selection.clone();
      savedSelection.current = captured;
    });
    return captured;
  };

  const openOnly = (target: 'animation' | 'block' | 'emoji' | 'icon' | 'link' | 'media'): void => {
    const selection = captureAuthorSelection() ?? savedSelection.current;
    if (target === 'link') {
      let selectedText = '';
      editor.getEditorState().read(() => {
        selectedText = selection?.getTextContent() ?? '';
      });
      const hasSelectedText = Boolean(selectedText);
      setLinkSelectionHasText(hasSelectedText);
      setLinkSelectedText(selectedText);
      setLinkDisplayAs(selectedText);
    }
    const nextAnimation = target === 'animation' && !animationOpen;
    const nextBlock = target === 'block' && !blockMenuOpen;
    const nextEmoji = target === 'emoji' && !emojiOpen;
    const nextIcon = target === 'icon' && !iconOpen;
    const nextLink = target === 'link' && !linkOpen;
    const nextMedia = target === 'media' && !mediaOpen;
    setAnimationOpen(nextAnimation);
    setBlockMenuOpen(nextBlock);
    setEmojiOpen(nextEmoji);
    setIconOpen(nextIcon);
    setLinkOpen(nextLink);
    setMediaOpen(nextMedia);
  };

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const selectedNode = selectedTopLevelNode();
          if (!selectedNode) return;
          const original = originalBlockForNode(selectedNode, metadata);
          const type = typeForNode(selectedNode, original?.type);
          setActiveBlockId(blockIdForNode(selectedNode, metadata));
          setActiveBlockType(type);
          const selection = $getSelection();
          const rootElement = editor.getRootElement();
          const activeElement = rootElement?.ownerDocument.activeElement;
          const editorHasFocus = Boolean(
            rootElement && activeElement && rootElement.contains(activeElement),
          );
          if ($isRangeSelection(selection) && editorHasFocus) {
            savedSelection.current = selection.clone();
          }
          setActiveFormats(
            $isRangeSelection(selection)
              ? new Set(
                  ['bold', 'italic', 'underline'].filter((format) =>
                    selection.hasFormat(format as 'bold'),
                  ),
                )
              : new Set(),
          );
          if ($isRangeSelection(selection)) {
            const selectedFontSize = $getSelectionStyleValueForProperty(
              selection,
              'font-size',
              '16px',
            );
            setFontSize(selectedFontSize.replace(/px$/u, '') || '16');
          }
        });
      }),
    [editor, metadata],
  );

  useEffect(() => {
    editor.getEditorState().read(() => {
      const firstNode = $getRoot().getFirstChild();
      if (!firstNode) return;
      const original = originalBlockForNode(firstNode, metadata);
      setActiveBlockId(blockIdForNode(firstNode, metadata));
      setActiveBlockType(typeForNode(firstNode, original?.type));
    });
  }, [editor, metadata]);

  const withAuthorSelection = (change: (selection: RangeSelection) => void): void => {
    editor.update(() => {
      if (savedSelection.current) {
        $setSelection(savedSelection.current.clone());
      }
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      change(selection);
      savedSelection.current = selection.clone();
    });
  };

  const applyLink = (url: string): void => {
    const selection = savedSelection.current?.clone();
    if (!selection) return;
    editor.update(() => {
      $setSelection(selection);
      $toggleLink(url);
      const nextSelection = $getSelection();
      if ($isRangeSelection(nextSelection)) savedSelection.current = nextSelection.clone();
    });
  };

  const insertStandaloneLink = (url: string, displayAs: string): void => {
    editor.update(() => {
      if (savedSelection.current) $setSelection(savedSelection.current.clone());
      if (!$isRangeSelection($getSelection())) $getRoot().selectEnd();
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const link = $createLinkNode(url);
      link.append($createTextNode(displayAs));
      selection.insertNodes([link]);
      link.selectEnd();
      const nextSelection = $getSelection();
      if ($isRangeSelection(nextSelection)) savedSelection.current = nextSelection.clone();
    });
  };

  const replaceSelectionWithLink = (url: string, displayAs: string): void => {
    const selection = savedSelection.current?.clone();
    if (!selection) return;
    editor.update(() => {
      $setSelection(selection);
      const currentSelection = $getSelection();
      if (!$isRangeSelection(currentSelection)) return;
      const link = $createLinkNode(url);
      link.append($createTextNode(displayAs));
      currentSelection.insertNodes([link]);
      link.selectEnd();
      const nextSelection = $getSelection();
      if ($isRangeSelection(nextSelection)) savedSelection.current = nextSelection.clone();
    });
  };

  const commitLink = (): void => {
    const url = safeAuthorUrl(linkUrl);
    if (url) {
      const displayAs = linkDisplayAs.trim();
      if (linkSelectionHasText && displayAs === linkSelectedText) applyLink(url);
      else if (linkSelectionHasText) replaceSelectionWithLink(url, displayAs || linkSelectedText);
      else insertStandaloneLink(url, displayAs || url);
    }
    setLinkOpen(false);
    setLinkDisplayAs('');
    setLinkSelectedText('');
    setLinkUrl('');
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

  useEffect(() => {
    const ownerDocument = editor.getRootElement()?.ownerDocument;
    if (!ownerDocument) return;
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target && toolbarRef.current?.contains(target)) return;
      const targetElement = target?.nodeType === Node.ELEMENT_NODE ? (target as Element) : null;
      if (
        targetElement?.closest(
          '[data-rich-content-floating-menu="true"], [data-rich-content-select-content="true"]',
        )
      ) {
        return;
      }
      if (linkOpen) commitLink();
      setAnimationOpen(false);
      setBlockMenuOpen(false);
      setEmojiOpen(false);
      setIconOpen(false);
      setMediaOpen(false);
    };
    ownerDocument.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => ownerDocument.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [editor, linkDisplayAs, linkOpen, linkSelectedText, linkSelectionHasText, linkUrl]);

  const applyBlockType = (type: 'paragraph' | 'heading' | 'list' | 'callout'): void => {
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
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const currentNode = selectedTopLevelNode();
      const currentBlockId = currentNode ? blockIdForNode(currentNode, metadata) : null;
      const factory =
        type === 'heading'
          ? () => $createHeadingNode('h2')
          : type === 'callout'
            ? () => $createRichCalloutNode()
            : () => $createParagraphNode();
      $setBlocksType(selection, factory);
      const nextNode = selectedTopLevelNode();
      if (currentBlockId && nextNode) {
        metadata.blockIdByNodeKey.set(nextNode.getKey(), currentBlockId);
      }
    });
  };

  const insertDecorator = (createNode: () => LexicalNode): NodeKey | null => {
    let insertedNodeKey: NodeKey | null = null;
    editor.update(() => {
      if (savedSelection.current) $setSelection(savedSelection.current.clone());
      const node = createNode();
      insertedNodeKey = node.getKey();
      const paragraph = $createParagraphNode();
      const selectedBlock = selectedTopLevelNode();
      if (selectedBlock) {
        selectedBlock.insertAfter(node);
        node.insertAfter(paragraph);
      } else {
        $getRoot().append(node, paragraph);
      }
      paragraph.selectStart();
      const selection = $getSelection();
      if ($isRangeSelection(selection)) savedSelection.current = selection.clone();
    });
    return insertedNodeKey;
  };

  const applyIconColor = (color: string): void => {
    setIconColor(color);
    if (!activeBlockId) return;
    editor.update(() => {
      const icon = $getRoot()
        .getChildren()
        .find((node) => $isRichIconNode(node) && node.getBlockId() === activeBlockId);
      if ($isRichIconNode(icon)) icon.setColor(color);
    });
  };

  const uploadAsset = async (
    kind: 'image' | 'video' | 'captions',
    file: File,
    nodeKey: NodeKey,
  ): Promise<RichContentMediaUploadResult | null> => {
    if (!onUploadMedia) return null;
    setUploading(true);
    setMediaUploadError(null);
    setMediaUploadProgress(editor, nodeKey, 0);
    try {
      const result = await onUploadMedia(kind, file, {
        savedToLibrary: saveMediaToLibrary,
        onProgress: (progress) => {
          setMediaUploadProgress(editor, nodeKey, clampUploadProgress(progress));
        },
      });
      if (!result) {
        setMediaUploadProgress(editor, nodeKey, undefined);
        return null;
      }
      setMediaUploadProgress(editor, nodeKey, 100);
      return result;
    } catch (error) {
      setMediaUploadProgress(editor, nodeKey, undefined);
      setMediaUploadError(mediaUploadErrorMessage(error));
      return null;
    } finally {
      setUploading(false);
    }
  };

  const uploadMediaIntoCanvas = async (kind: 'image' | 'video', file: File): Promise<void> => {
    const localPreviewUrl = createLocalMediaPreview(file);
    const nodeKey = insertDecorator(() =>
      $createRichMediaNode(
        createBlockId(),
        createMediaPresentation(kind, '', file.name),
        localPreviewUrl ?? undefined,
        0,
      ),
    );
    if (!nodeKey) {
      revokeLocalMediaPreview(localPreviewUrl);
      return;
    }
    const result = await uploadAsset(kind, file, nodeKey);
    if (!result) {
      removeMediaNode(editor, nodeKey);
      revokeLocalMediaPreview(localPreviewUrl);
      return;
    }
    const resolvedPreviewUrl = result.previewUrl ?? localPreviewUrl ?? undefined;
    let completedInCanvas = false;
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!$isRichMediaNode(node)) return;
      node.completeUpload(
        createMediaPresentation(kind, result.asset.id, file.name),
        resolvedPreviewUrl,
      );
      completedInCanvas = true;
    });
    if (!completedInCanvas || (result.previewUrl && result.previewUrl !== localPreviewUrl)) {
      revokeLocalMediaPreview(localPreviewUrl);
    }
    if (kind === 'video') setCaptionTargetVideo({ nodeKey, upload: result });
  };

  const uploadCaptions = async (file: File): Promise<void> => {
    if (!captionTargetVideo) return;
    const { nodeKey } = captionTargetVideo;
    const captions = await uploadAsset('captions', file, nodeKey);
    if (!captions) return;
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isRichMediaNode(node)) node.setCaptionsAssetId(captions.asset.id);
    });
  };

  const activeBlock = activeBlockId ? metadata.originalByBlockId.get(activeBlockId) : undefined;
  const spacingAfter = activeBlock?.props.blockLayout?.spacingAfterPx ?? 8;
  const visibleIcons = ICON_RECIPE_VALUES.filter((name) =>
    humanizeIconName(name).toLowerCase().includes(iconQuery.trim().toLowerCase()),
  );

  return (
    <>
      <div
        ref={toolbarRef}
        className="rich-content-toolbar"
        aria-label={authoringText('Text formatting')}
        onPointerDownCapture={captureAuthorSelection}
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
            </div>
          }
          open={blockMenuOpen}
        >
          <button
            aria-expanded={blockMenuOpen}
            className="rich-content-block-style-trigger"
            onClick={() => openOnly('block')}
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
        <ToolbarButton
          active={activeFormats.has('underline')}
          icon={<Underline size={16} />}
          label={authoringText('Underline')}
          onClick={() => withAuthorSelection((selection) => selection.formatText('underline'))}
        />
        <RichContentSelect
          ariaLabel={authoringText('Font size')}
          className="rich-content-font-size-trigger"
          onOpenChange={(open) => {
            if (!open) return;
            if (linkOpen) commitLink();
            setAnimationOpen(false);
            setBlockMenuOpen(false);
            setEmojiOpen(false);
            setIconOpen(false);
            setMediaOpen(false);
          }}
          onPointerDown={captureAuthorSelection}
          onValueChange={(nextFontSize) => {
            setFontSize(nextFontSize);
            withAuthorSelection((selection) =>
              $patchStyleText(selection, { 'font-size': `${nextFontSize}px` }),
            );
          }}
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
            onPointerDown={captureAuthorSelection}
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
            onPointerDown={captureAuthorSelection}
            type="color"
          />
        </label>
        <RichContentFloatingMenu
          content={
            <div className="rich-content-menu rich-content-animation-menu">
              <label>
                <span>{authoringText('Effect')}</span>
                <RichContentSelect
                  ariaLabel={authoringText('Animation effect')}
                  className="rich-content-animation-select"
                  onPointerDown={captureAuthorSelection}
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
                    onPointerDown={captureAuthorSelection}
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
                  onPointerDown={captureAuthorSelection}
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
          }
          open={animationOpen}
        >
          <ToolbarButton
            active={animationOpen}
            icon={<Clapperboard size={16} />}
            label={authoringText('Animation')}
            onClick={() => openOnly('animation')}
          />
        </RichContentFloatingMenu>

        <span className="rich-content-toolbar-divider" aria-hidden="true" />
        {(['left', 'center', 'right'] as const).map((align) => {
          const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
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

        <span className="rich-content-toolbar-divider" aria-hidden="true" />
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
          placement="bottom-end"
        >
          <ToolbarButton
            active={linkOpen}
            icon={<Link size={16} />}
            label={authoringText('Link')}
            onClick={() => openOnly('link')}
          />
        </RichContentFloatingMenu>
        <RichContentFloatingMenu
          className="rich-content-toolbar-popover-end"
          content={
            <Suspense
              fallback={
                <span className="rich-content-picker-loading">{authoringText('Loading…')}</span>
              }
            >
              <RichContentEmojiPicker
                onSelect={(emoji) => {
                  withAuthorSelection((selection) => selection.insertText(emoji));
                }}
              />
            </Suspense>
          }
          open={emojiOpen}
          placement="top-end"
        >
          <ToolbarButton
            active={emojiOpen}
            icon={<Smile size={16} />}
            label={authoringText('Emoji')}
            onClick={() => openOnly('emoji')}
          />
        </RichContentFloatingMenu>
        <RichContentFloatingMenu
          className="rich-content-toolbar-popover-end"
          content={
            <div className="rich-content-menu rich-content-icon-menu">
              <input
                aria-label={authoringText('Search icons')}
                autoFocus
                onChange={(event) => setIconQuery(event.currentTarget.value)}
                placeholder={authoringText('Search icons')}
                type="search"
                value={iconQuery}
              />
              <label className="rich-content-icon-color-control">
                <span>{authoringText('Icon color')}</span>
                <input
                  aria-label={authoringText('Icon color')}
                  onChange={(event) => applyIconColor(event.currentTarget.value)}
                  type="color"
                  value={iconColor}
                />
              </label>
              <div className="rich-content-icon-grid">
                {visibleIcons.map((name) => (
                  <button
                    aria-label={humanizeIconName(name)}
                    key={name}
                    onClick={() => {
                      const label = humanizeIconName(name);
                      insertDecorator(() =>
                        $createRichIconNode(createBlockId(), name, label, iconColor),
                      );
                    }}
                    onPointerDown={(event) => event.preventDefault()}
                    title={humanizeIconName(name)}
                    type="button"
                  >
                    <DynamicIcon name={lucideIconName(name)} size={19} />
                  </button>
                ))}
              </div>
            </div>
          }
          open={iconOpen}
          placement="bottom-end"
        >
          <ToolbarButton
            active={iconOpen}
            icon={<Shapes size={16} />}
            label={authoringText('Icon')}
            onClick={() => openOnly('icon')}
          />
        </RichContentFloatingMenu>
        <RichContentFloatingMenu
          className="rich-content-toolbar-popover-end"
          content={
            <div className="rich-content-menu rich-content-media-menu">
              <strong>{authoringText('Add media')}</strong>
              <label className="rich-content-library-option">
                <input
                  checked={saveMediaToLibrary}
                  onChange={(event) => setSaveMediaToLibrary(event.currentTarget.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>{authoringText('Save to media library')}</strong>
                  <small>{authoringText('Reuse this media in other experiences.')}</small>
                </span>
              </label>
              <label className="rich-content-upload-button">
                <Image size={17} />
                <span>{authoringText('Upload image or GIF')}</span>
                <input
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void uploadMediaIntoCanvas('image', file);
                  }}
                  type="file"
                />
              </label>
              <label className="rich-content-upload-button">
                <Upload size={17} />
                <span>
                  {captionTargetVideo
                    ? authoringText('Upload another video')
                    : authoringText('Upload video')}
                </span>
                <input
                  accept="video/mp4,video/webm"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void uploadMediaIntoCanvas('video', file);
                  }}
                  type="file"
                />
              </label>
              {captionTargetVideo ? (
                <label className="rich-content-upload-button">
                  <Upload size={17} />
                  <span>{authoringText('Upload captions')}</span>
                  <input
                    accept="text/vtt"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) void uploadCaptions(file);
                    }}
                    type="file"
                  />
                </label>
              ) : null}
              {uploading ? <small>{authoringText('Uploading media…')}</small> : null}
              <small>
                {authoringText('Maximum file size: {size} MB.', {
                  size: AUTHORING_RESOURCE_LIMITS.assetBytes / 1_048_576,
                })}
              </small>
              {mediaUploadError ? (
                <p className="rich-content-media-error" role="alert">
                  {mediaUploadError}
                </p>
              ) : null}
            </div>
          }
          open={mediaOpen}
          placement="bottom-end"
        >
          <ToolbarButton
            active={mediaOpen}
            disabled={!onUploadMedia}
            icon={<Image size={16} />}
            label={authoringText('Media')}
            onClick={() => openOnly('media')}
          />
        </RichContentFloatingMenu>
        <ToolbarButton
          icon={<Minus size={16} />}
          label={authoringText('Divider')}
          onClick={() => insertDecorator(() => $createRichDividerNode(createBlockId()))}
        />
        <ToolbarButton
          icon={<MousePointerClick size={16} />}
          label={authoringText('Button')}
          onClick={() =>
            insertDecorator(() =>
              $createRichButtonNode(createBlockId(), authoringText('Continue'), {
                action: { type: 'next' },
                variant: 'primary',
              }),
            )
          }
        />

        <span className="rich-content-toolbar-spacer" />
        <label className="rich-content-spacing-control">
          <span>{authoringText('Space after')}</span>
          <span>
            <input
              aria-label={authoringText('Space after')}
              max={BLOCK_SPACING_PX_LIMITS.max}
              min={BLOCK_SPACING_PX_LIMITS.min}
              onChange={(event) => {
                if (!activeBlockId) return;
                const value = clampSpacing(Number(event.currentTarget.value));
                const current = editor.getEditorState().read(() => exportRichContent(metadata));
                const next = current.map((block) =>
                  block.id === activeBlockId
                    ? {
                        ...block,
                        props: {
                          ...block.props,
                          blockLayout: { ...block.props.blockLayout, spacingAfterPx: value },
                        },
                      }
                    : block,
                );
                const updated = next.find((block) => block.id === activeBlockId);
                if (updated)
                  metadata.originalByBlockId.set(activeBlockId, structuredClone(updated));
                onChange(next);
              }}
              step={BLOCK_SPACING_PX_LIMITS.step}
              type="number"
              value={spacingAfter}
            />
            <span>{authoringText('px')}</span>
          </span>
        </label>
      </div>
    </>
  );
}

function ToolbarButton({
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
}) {
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
}) {
  return (
    <button onClick={onClick} onPointerDown={(event) => event.preventDefault()} type="button">
      {icon}
      <span>{label}</span>
    </button>
  );
}

function BlockTypeIcon({ type }: { type: LodariqBlockType }) {
  if (type === 'heading') return <Heading size={16} />;
  if (type === 'list') return <ListIcon size={16} />;
  if (type === 'callout') return <MessageSquareWarning size={16} />;
  return <Type size={16} />;
}

function blockTypeName(type: LodariqBlockType): string {
  if (type === 'heading') return authoringText('Heading');
  if (type === 'list') return authoringText('Bulleted list');
  if (type === 'callout') return authoringText('Callout');
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

function inlineAnimationCssEasing(easing: TourMotionPresentation['easing']): string {
  if (easing === 'linear') return 'linear';
  if (easing === 'emphasized') return 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  return 'cubic-bezier(0.2, 0, 0, 1)';
}

function clampInlineAnimationDuration(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_INLINE_ANIMATION.durationMs;
  return Math.min(1200, Math.max(100, Math.round(value / 50) * 50));
}

function clampUploadProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function mediaUploadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return authoringText('Media could not be saved. Check the file size and available storage.');
}

function importRichContent(blocks: readonly LodariqBlock[], metadata: RichContentMetadata): void {
  const root = $getRoot();
  root.clear();
  metadata.blockIdByNodeKey.clear();
  metadata.originalByBlockId.clear();
  for (const block of blocks) {
    const node = nodeFromBlock(block);
    if (!node) continue;
    root.append(node);
    metadata.blockIdByNodeKey.set(node.getKey(), block.id);
    metadata.originalByBlockId.set(block.id, structuredClone(block));
  }
  if (root.getChildrenSize() === 0) root.append($createParagraphNode());
}

function nodeFromBlock(block: LodariqBlock): LexicalNode | null {
  if (block.type === 'button') {
    return $createRichButtonNode(block.id, block.content ?? authoringText('Continue'), block.props);
  }
  if (block.type === 'media' && block.props.media) {
    return $createRichMediaNode(block.id, block.props.media);
  }
  if (block.type === 'icon') {
    const icon = block.props.composition?.kind === 'icon' ? block.props.composition.icon : 'info';
    return $createRichIconNode(
      block.id,
      icon,
      block.props.accessibilityName ?? block.content ?? humanizeIconName(icon),
      block.props.textStyle?.color,
    );
  }
  if (block.type === 'divider') return $createRichDividerNode(block.id);
  if (!TEXT_BLOCK_TYPES.has(block.type)) return null;
  if (block.type === 'list') {
    const list = $createListNode('bullet');
    for (const item of (block.content ?? '').split('\n').filter(Boolean)) {
      const listItem = $createListItemNode();
      appendRuns(listItem, [{ text: item }]);
      list.append(listItem);
    }
    if (list.getChildrenSize() === 0) list.append($createListItemNode());
    return list;
  }
  const element =
    block.type === 'heading'
      ? $createHeadingNode('h2')
      : block.type === 'callout'
        ? $createRichCalloutNode()
        : $createParagraphNode();
  appendRuns(
    element,
    block.contentRuns?.length ? block.contentRuns : [{ text: block.content ?? '' }],
  );
  const align = block.props.textStyle?.align;
  if (align) element.setFormat(align);
  return element;
}

function appendRuns(element: ElementNode, runs: readonly InlineTextRun[]): void {
  for (const run of runs) {
    const text = $createTextNode(run.text);
    for (const mark of run.marks ?? []) text.toggleFormat(mark);
    const styles = [
      run.fontSizePx ? `font-size: ${run.fontSizePx}px` : '',
      run.color ? `color: ${run.color}` : '',
      run.highlightColor ? `background-color: ${run.highlightColor}` : '',
      run.animation ? `--lq-inline-motion: ${run.animation.recipe}` : '',
      run.animation ? `--lq-inline-motion-duration: ${run.animation.durationMs}ms` : '',
      run.animation ? `--lq-inline-motion-easing: ${run.animation.easing}` : '',
      run.animation
        ? `--lq-inline-motion-timing: ${inlineAnimationCssEasing(run.animation.easing)}`
        : '',
    ]
      .filter(Boolean)
      .join('; ');
    if (styles) text.setStyle(styles);
    const url = run.link ? safeAuthorUrl(run.link) : null;
    if (url) {
      const link = $createLinkNode(url);
      link.append(text);
      element.append(link);
    } else {
      element.append(text);
    }
  }
}

function exportRichContent(metadata: RichContentMetadata): LodariqBlock[] {
  return $getRoot()
    .getChildren()
    .flatMap((node) => {
      const block = blockFromNode(node, metadata);
      return block ? [block] : [];
    });
}

function blockFromNode(node: LexicalNode, metadata: RichContentMetadata): LodariqBlock | null {
  if ($isRichButtonNode(node)) {
    const original = metadata.originalByBlockId.get(node.getBlockId());
    return canonicalBlock(
      node.getBlockId(),
      'button',
      node.getContent(),
      node.getProps(),
      undefined,
      original,
    );
  }
  if ($isRichMediaNode(node)) {
    if (node.isPendingAsset()) return null;
    const original = metadata.originalByBlockId.get(node.getBlockId());
    return canonicalBlock(
      node.getBlockId(),
      'media',
      node.getMedia().accessibilityName,
      { ...original?.props, media: node.getMedia() },
      undefined,
      original,
    );
  }
  if ($isRichIconNode(node)) {
    const original = metadata.originalByBlockId.get(node.getBlockId());
    return canonicalBlock(
      node.getBlockId(),
      'icon',
      node.getAccessibilityName(),
      {
        ...original?.props,
        composition: { kind: 'icon', icon: node.getIcon() },
        accessibilityName: node.getAccessibilityName(),
        textStyle: {
          ...original?.props.textStyle,
          ...(node.getColor() ? { color: node.getColor() } : {}),
        },
      },
      undefined,
      original,
    );
  }
  if ($isRichDividerNode(node)) {
    const original = metadata.originalByBlockId.get(node.getBlockId());
    return canonicalBlock(
      node.getBlockId(),
      'divider',
      undefined,
      original?.props ?? {},
      undefined,
      original,
    );
  }
  if (!$isElementNode(node)) return null;
  const original = originalBlockForNode(node, metadata);
  const id = blockIdForNode(node, metadata);
  const type = typeForNode(node, original?.type);
  const runs = inlineRunsFromNode(node);
  const content = $isListNode(node)
    ? node
        .getChildren()
        .map((child) => child.getTextContent())
        .join('\n')
    : runs.map((run) => run.text).join('');
  const textStyle = {
    ...original?.props.textStyle,
    ...elementAlignment(node),
  };
  return canonicalBlock(
    id,
    type,
    content,
    {
      ...original?.props,
      ...(Object.keys(textStyle).length ? { textStyle } : {}),
      ...(type === 'callout' ? { composition: { kind: 'callout', tone: 'info' as const } } : {}),
    },
    type === 'list' ? undefined : runs,
    original,
  );
}

function canonicalBlock(
  id: string,
  type: LodariqBlockType,
  content: string | undefined,
  props: LodariqBlockProps,
  contentRuns: InlineTextRun[] | undefined,
  original?: LodariqBlock,
): LodariqBlock {
  return {
    id,
    type,
    ...(content ? { content } : {}),
    ...(contentRuns?.length ? { contentRuns } : {}),
    props,
    status: original?.status ?? 'ready',
    children: [],
  };
}

function inlineRunsFromNode(node: ElementNode): InlineTextRun[] {
  const runs: InlineTextRun[] = [];
  for (const descendant of node.getAllTextNodes()) {
    const run = runFromTextNode(descendant);
    const previous = runs[runs.length - 1];
    if (
      previous &&
      JSON.stringify({ ...previous, text: '' }) === JSON.stringify({ ...run, text: '' })
    )
      previous.text += run.text;
    else runs.push(run);
  }
  return runs;
}

function runFromTextNode(node: TextNode): InlineTextRun {
  const marks = ['bold', 'italic', 'underline'].filter((mark) =>
    node.hasFormat(mark as 'bold'),
  ) as InlineTextRun['marks'];
  const style = styleMap(node.getStyle());
  let parent: LexicalNode | null = node.getParent();
  let link: string | undefined;
  while (parent) {
    if ($isLinkNode(parent)) {
      link = parent.getURL();
      break;
    }
    parent = parent.getParent();
  }
  const fontSize = /^([0-9]{1,2})px$/.exec(style.get('font-size') ?? '')?.[1];
  const animation = inlineAnimationFromStyle(style);
  return {
    text: node.getTextContent(),
    ...(marks?.length ? { marks } : {}),
    ...(fontSize ? { fontSizePx: Number(fontSize) } : {}),
    ...(style.get('color') ? { color: style.get('color') } : {}),
    ...(style.get('background-color') ? { highlightColor: style.get('background-color') } : {}),
    ...(animation ? { animation } : {}),
    ...(link ? { link } : {}),
  };
}

function inlineAnimationFromStyle(
  style: ReadonlyMap<string, string>,
): TourMotionPresentation | undefined {
  const recipe = style.get('--lq-inline-motion');
  const easing = style.get('--lq-inline-motion-easing');
  const duration = /^([0-9]{3,4})ms$/.exec(style.get('--lq-inline-motion-duration') ?? '')?.[1];
  if (!recipe || !INLINE_MOTION_RECIPE_SET.has(recipe)) return undefined;
  if (!easing || !INLINE_MOTION_EASING_SET.has(easing)) return undefined;
  if (!duration) return undefined;
  const durationMs = Number(duration);
  if (durationMs < 100 || durationMs > 1200) return undefined;
  return {
    recipe: recipe as TourMotionPresentation['recipe'],
    durationMs,
    easing: easing as TourMotionPresentation['easing'],
    reducedMotion: 'none',
  };
}

function styleMap(value: string): Map<string, string> {
  return new Map(
    value
      .split(';')
      .map((entry) => entry.split(':').map((part) => part.trim()) as [string, string])
      .filter(([key, item]) => Boolean(key && item)),
  );
}

function selectedTopLevelNode(): LexicalNode | null {
  const selection = $getSelection();
  if (!selection) return null;
  const node = $isRangeSelection(selection)
    ? selection.anchor.getNode()
    : (selection.getNodes()[0] ?? null);
  if (node === $getRoot()) return null;
  return node?.getTopLevelElementOrThrow() ?? null;
}

function blockIdForNode(node: LexicalNode, metadata: RichContentMetadata): string {
  if (
    $isRichButtonNode(node) ||
    $isRichMediaNode(node) ||
    $isRichIconNode(node) ||
    $isRichDividerNode(node)
  )
    return node.getBlockId();
  const existing = metadata.blockIdByNodeKey.get(node.getKey());
  if (existing) return existing;
  const id = createBlockId();
  metadata.blockIdByNodeKey.set(node.getKey(), id);
  return id;
}

function originalBlockForNode(
  node: LexicalNode,
  metadata: RichContentMetadata,
): LodariqBlock | undefined {
  return metadata.originalByBlockId.get(blockIdForNode(node, metadata));
}

function typeForNode(node: LexicalNode, originalType?: LodariqBlockType): LodariqBlockType {
  if ($isHeadingNode(node)) return 'heading';
  if ($isListNode(node)) return 'list';
  if ($isRichCalloutNode(node)) return 'callout';
  if ($isRichButtonNode(node)) return 'button';
  if ($isRichMediaNode(node)) return 'media';
  if ($isRichIconNode(node)) return 'icon';
  if ($isRichDividerNode(node)) return 'divider';
  return originalType && TEXT_BLOCK_TYPES.has(originalType) ? originalType : 'paragraph';
}

function elementAlignment(node: ElementNode): LodariqBlockProps['textStyle'] {
  const format = node.getFormatType();
  return format === 'center' || format === 'right' || format === 'left' ? { align: format } : {};
}

function MediaPreviewPlugin({
  metadata,
  resolve,
}: {
  metadata: RichContentMetadata;
  resolve?: (assetId: string) => Promise<string | null>;
}) {
  const [editor] = useLexicalComposerContext();
  const requested = useRef(new Set<string>());
  useEffect(() => {
    editor.getEditorState().read(() => {
      for (const node of $getRoot().getChildren()) {
        if (!$isRichMediaNode(node) || requested.current.has(node.getBlockId())) continue;
        const blockId = node.getBlockId();
        const assetId = node.getMedia().assetId;
        requested.current.add(blockId);
        if (!resolve) continue;
        void resolve(assetId).then((url) => {
          if (!url) return;
          editor.update(() => {
            const current = $getRoot()
              .getChildren()
              .find(
                (candidate) => $isRichMediaNode(candidate) && candidate.getBlockId() === blockId,
              );
            if ($isRichMediaNode(current)) current.setPreviewUrl(url);
          });
        });
      }
    });
  }, [editor, resolve]);
  void metadata;
  return null;
}

function DecoratorDeletionPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let selectedDecoratorKeys = new Set<NodeKey>();
    const syncSelectionChrome = (): void => {
      const nextKeys = editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isNodeSelection(selection)) return new Set<NodeKey>();
        return new Set(
          selection
            .getNodes()
            .filter($isDecoratorNode)
            .map((node) => node.getKey()),
        );
      });
      for (const key of selectedDecoratorKeys) {
        if (!nextKeys.has(key)) editor.getElementByKey(key)?.removeAttribute('data-rich-selected');
      }
      for (const key of nextKeys) {
        editor.getElementByKey(key)?.setAttribute('data-rich-selected', 'true');
      }
      selectedDecoratorKeys = nextKeys;
    };
    const removeDecorator = (event: KeyboardEvent | null, direction: 'backward' | 'forward') => {
      const selection = $getSelection();
      if ($isNodeSelection(selection)) {
        const decorators = selection.getNodes().filter($isDecoratorNode);
        if (decorators.length === 0) return false;
        event?.preventDefault();
        decorators.forEach((node) => node.remove());
        return true;
      }
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
      const decorator = adjacentDecorator(selection, direction);
      if (!decorator) return false;
      event?.preventDefault();
      decorator.remove();
      return true;
    };
    const unregisterUpdate = editor.registerUpdateListener(syncSelectionChrome);
    const unregisterClick = editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const target = event.target as HTMLElement | null;
        if (!target || target.closest('input, select, button')) return false;
        const node = $getNearestNodeFromDOMNode(target);
        if (!$isDecoratorNode(node)) return false;
        event.preventDefault();
        const current = $getSelection();
        const selection =
          event.shiftKey && $isNodeSelection(current) ? current : $createNodeSelection();
        selection.add(node.getKey());
        $setSelection(selection);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
    const unregisterBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => removeDecorator(event, 'backward'),
      COMMAND_PRIORITY_LOW,
    );
    const unregisterDelete = editor.registerCommand(
      KEY_DELETE_COMMAND,
      (event) => removeDecorator(event, 'forward'),
      COMMAND_PRIORITY_LOW,
    );
    syncSelectionChrome();
    return () => {
      unregisterUpdate();
      unregisterClick();
      unregisterBackspace();
      unregisterDelete();
      for (const key of selectedDecoratorKeys) {
        editor.getElementByKey(key)?.removeAttribute('data-rich-selected');
      }
    };
  }, [editor]);

  return null;
}

function adjacentDecorator(
  selection: RangeSelection,
  direction: 'backward' | 'forward',
): LexicalNode | null {
  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();
  let candidate: LexicalNode | null = null;
  if (anchor.type === 'element' && $isElementNode(anchorNode)) {
    const childIndex = direction === 'backward' ? anchor.offset - 1 : anchor.offset;
    candidate = anchorNode.getChildAtIndex(childIndex);
    if (!candidate) candidate = siblingBeyondBoundary(anchorNode, direction);
  } else if ($isTextNode(anchorNode)) {
    const atBoundary =
      direction === 'backward'
        ? anchor.offset === 0
        : anchor.offset === anchorNode.getTextContentSize();
    if (atBoundary) candidate = siblingBeyondBoundary(anchorNode, direction);
  }
  return $isDecoratorNode(candidate) ? candidate : null;
}

function siblingBeyondBoundary(
  start: LexicalNode,
  direction: 'backward' | 'forward',
): LexicalNode | null {
  let current: LexicalNode | null = start;
  while (current) {
    const sibling =
      direction === 'backward' ? current.getPreviousSibling() : current.getNextSibling();
    if (sibling) return sibling;
    current = current.getParent();
  }
  return null;
}

function setMediaUploadProgress(
  editor: LexicalEditor,
  nodeKey: NodeKey,
  progress: number | undefined,
): void {
  editor.update(() => {
    const node = $getNodeByKey(nodeKey);
    if ($isRichMediaNode(node)) node.setUploadProgress(progress);
  });
}

function removeMediaNode(editor: LexicalEditor, nodeKey: NodeKey): void {
  editor.update(() => {
    const node = $getNodeByKey(nodeKey);
    if ($isRichMediaNode(node)) node.remove();
  });
}

function createLocalMediaPreview(file: File): string | null {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
}

function revokeLocalMediaPreview(previewUrl: string | null): void {
  if (previewUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(previewUrl);
}

function createMediaPresentation(
  kind: 'image' | 'video',
  assetId: string,
  accessibilityName: string,
): MediaPresentation {
  return kind === 'image'
    ? { kind, assetId, accessibilityName }
    : { kind, assetId, accessibilityName };
}

function safeAuthorUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function humanizeIconName(value: string): string {
  return value
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function clampSpacing(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(
    BLOCK_SPACING_PX_LIMITS.max,
    Math.max(BLOCK_SPACING_PX_LIMITS.min, Math.round(value)),
  );
}
