import type { LodariqBlock } from '@lodariq/schema';
import { LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';
import { HeadingNode } from '@lexical/rich-text';
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
  $getNearestNodeFromDOMNode,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $nodesOfType,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type EditorState,
  type LexicalNode,
  type NodeKey,
  type RangeSelection,
} from 'lexical';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, type ReactElement } from 'react';
import type { AuthoringMediaUploadOptions } from '../authoring/local-frame-types';
import type { AiRewriteVerb } from '../authoring/ai/assist-contract';
import type { ToolbarContextKind } from '../authoring/overlay/toolbar-context';
import { authoringText } from '../i18n';
import { CardCommandPlugin, type RichContentCardCommand } from './rich-content-card-commands';
import { FLUSH_RICH_CONTENT_COMMAND } from './rich-content-commands';
import { BlockHandlesPlugin } from './rich-content-block-handles';
import { BlockInspectorPlugin } from './rich-content-block-inspector';
import {
  exportRichContent,
  importRichContent,
  type RichContentMetadata,
} from './rich-content-doc';
import {
  RichContentHostContext,
  type RichContentHostCapabilities,
} from './rich-content-host-context';
import {
  RichCalloutNode,
  RichButtonNode,
  RichDividerNode,
  RichFormFieldNode,
  RichIconNode,
  RichMediaNode,
  RichStatNode,
  RichTargetChipNode,
  RichValidationBadgeNode,
} from './rich-content-nodes';
import { type RichContentMediaUploadResult } from './rich-content-media-upload';
import { SelectionToolbarPlugin } from './rich-content-selection-toolbar';
import { contentLocaleDirection } from '../authoring/content-locales';

/** Persist after typing pauses. Leading throttle mid-keystroke re-rendered the authoring tree and stole the caret. */
export const RICH_CONTENT_PERSIST_DEBOUNCE_MS = 300;

function inspectorOwnsFocus(
  host: HTMLElement | null | undefined,
  node: EventTarget | Node | null,
): boolean {
  if (!(node instanceof Node)) return false;
  if (host?.contains(node)) return true;
  return node instanceof Element && Boolean(node.closest('.storyboard-property-tray'));
}

/** Controls a creator types into, as opposed to ones they pick from. */
const TYPED_INPUT_TYPES = new Set(['text', 'url', 'email', 'search', 'number', 'tel', 'password']);

/**
 * Whether the inspector is mid-sentence.
 *
 * Persisting re-renders the authoring tree, which is why the flush waits — but it
 * waited on *focus*, and a segmented control, a swatch or a slider keeps focus
 * inside the inspector for as long as the panel is open. Every choice made with
 * one was held forever and never written to the document. Only a caret in a text
 * box has anything to lose from a re-render, so only that defers.
 */
function inspectorIsTyping(
  host: HTMLElement | null | undefined,
  node: EventTarget | Node | null,
): boolean {
  if (!inspectorOwnsFocus(host, node)) return false;
  if (node instanceof HTMLTextAreaElement) return true;
  return node instanceof HTMLInputElement && TYPED_INPUT_TYPES.has(node.type);
}

export type { RichContentMediaUploadResult } from './rich-content-media-upload';

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
  /** Opens the host Flow Map when a button block's sequence action is chosen. */
  onOpenSequence?: (blockId: string) => void;
  /** Rewrites the current selection with one assist verb (§7.4). */
  onRewriteSelection?: (verb: AiRewriteVerb, text: string) => void;
  /** Opens the free-form assist prompt for this step (§7.5). */
  onAskAssist?: () => void;
  /** Reports what the toolbar's contextual middle is editing (§4.2a). */
  onContextChange?: (kind: ToolbarContextKind) => void;
  /**
   * The language this copy is being written in, so the canvas can carry `lang`
   * and `dir` the way the runtime already does. Without it Arabic and Hebrew are
   * authored into a left-to-right card and only come out right once published.
   */
  contentLocale?: string;
  /** Host element for the persistent format/insert toolbar. When omitted, the toolbar renders above the canvas. */
  toolbarHost?: HTMLElement | null;
  /** Host element for the pinned Insert control, when the frame owns its position. */
  insertHost?: HTMLElement | null;
  /** Host element for the selected-block property tray. */
  inspectorHost?: HTMLElement | null;
  /** Drop the selected-block inspector so a canvas tray can own the surface. */
  suppressInspector?: boolean;
  /** Closes placement/popup trays when a content block inspector opens. */
  onInspectOpen?: () => void;
  /**
   * A structural change asked for from outside the editor — the inspector's
   * button list (§4.3). See CardCommandPlugin for why it cannot be a document
   * write.
   */
  cardCommand?: RichContentCardCommand | null;
  readOnly?: boolean;
}

/**
 * Reusable freeform structured-content editor.
 *
 * Authors interact with one continuous document and a caret. Formatting and
 * insert actions stay on a persistent toolbar; hover handles remain for
 * reorder and per-block settings. The component translates Lexical state to
 * Lodariq's safe block JSON at its boundary; block identities and renderer
 * recipes are deliberately not part of the UI model.
 */
export function RichContentEditor({
  value,
  onChange,
  onResolveMediaPreview,
  onUploadMedia,
  onOpenSequence,
  onRewriteSelection,
  onAskAssist,
  onContextChange,
  toolbarHost = null,
  insertHost = null,
  inspectorHost = null,
  suppressInspector = false,
  onInspectOpen,
  cardCommand = null,
  readOnly = false,
  contentLocale,
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
        RichStatNode,
        RichButtonNode,
        RichDividerNode,
        RichFormFieldNode,
        RichIconNode,
        RichMediaNode,
        RichTargetChipNode,
        RichValidationBadgeNode,
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
  const onInspectOpenRef = useRef(onInspectOpen);
  const onOpenSequenceRef = useRef(onOpenSequence);
  onInspectOpenRef.current = onInspectOpen;
  onOpenSequenceRef.current = onOpenSequence;
  const hostCapabilities = useMemo<RichContentHostCapabilities>(
    () => ({
      inspectorHost,
      onInspectOpen: () => onInspectOpenRef.current?.(),
      onOpenSequence: (blockId) => onOpenSequenceRef.current?.(blockId),
      suppressInspector,
    }),
    [inspectorHost, suppressInspector],
  );

  return (
    <section className="rich-content-editor" aria-label={authoringText('Rich content')}>
      <RichContentHostContext.Provider value={hostCapabilities}>
        <LexicalComposer initialConfig={initialConfig}>
          {!readOnly ? (
            <SelectionToolbarPlugin
              insertHost={insertHost}
              metadata={metadata.current}
              onAskAssist={onAskAssist}
              onChange={onChange}
              onContextChange={onContextChange}
              onRewriteSelection={onRewriteSelection}
              onUploadMedia={onUploadMedia}
              toolbarHost={toolbarHost}
            />
          ) : null}
          {/*
            Direction sits on the shell rather than on the editable: Lexical owns
            `dir` on its own root and strips the prop, but it inherits through.
            Without this Arabic is authored into a left-to-right card and only
            comes out right once published.
          */}
          <div
            className="rich-content-canvas-shell"
            {...(contentLocale
              ? { lang: contentLocale, dir: contentLocaleDirection(contentLocale) }
              : {})}
          >
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  aria-label={authoringText('Rich content')}
                  className="rich-content-canvas"
                />
              }
              placeholder={
                <div className="rich-content-placeholder">
                  {authoringText('Write, or press / to add')}
                </div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
          </div>
          {!readOnly ? <CardCommandPlugin request={cardCommand} /> : null}
          <HistoryPlugin />
          <LinkPlugin />
          <ListPlugin />
          <DecoratorDeletionPlugin />
          <MediaPreviewPlugin metadata={metadata.current} resolve={onResolveMediaPreview} />
          <DebouncedRichContentOnChangePlugin metadata={metadata.current} onChange={onChange} />
          {!readOnly ? <BlockInspectorPlugin /> : null}
          {!readOnly ? (
            <BlockHandlesPlugin
              metadata={metadata.current}
              onChange={onChange}
              onUploadMedia={onUploadMedia}
            />
          ) : null}
        </LexicalComposer>
      </RichContentHostContext.Provider>
    </section>
  );
}

function DebouncedRichContentOnChangePlugin({
  metadata,
  onChange,
}: {
  metadata: RichContentMetadata;
  onChange: (value: LodariqBlock[]) => void;
}): ReactElement {
  const [editor] = useLexicalComposerContext();
  const host = useContext(RichContentHostContext);
  const onChangeRef = useRef(onChange);
  const metadataRef = useRef(metadata);
  const inspectorHostRef = useRef(host.inspectorHost);
  const lastEmittedFingerprint = useRef('');
  const pendingEditorState = useRef<EditorState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<(options?: { force?: boolean }) => void>(() => undefined);
  onChangeRef.current = onChange;
  metadataRef.current = metadata;
  inspectorHostRef.current = host.inspectorHost;

  const flush = (options?: { force?: boolean }): void => {
    if (!options?.force && inspectorIsTyping(inspectorHostRef.current, document.activeElement)) {
      return;
    }
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const editorState = pendingEditorState.current;
    pendingEditorState.current = null;
    if (!editorState) return;
    const next = editorState.read(() => exportRichContent(metadataRef.current));
    const fingerprint = JSON.stringify(next);
    if (fingerprint === lastEmittedFingerprint.current) return;
    lastEmittedFingerprint.current = fingerprint;
    onChangeRef.current(next);
  };
  flushRef.current = flush;

  useLayoutEffect(() => {
    lastEmittedFingerprint.current = editor.getEditorState().read(() =>
      JSON.stringify(exportRichContent(metadataRef.current)),
    );
  }, [editor]);

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;
    const onFocusOut = (event: FocusEvent): void => {
      const next = event.relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      if (inspectorOwnsFocus(inspectorHostRef.current, next)) return;
      queueMicrotask(() => flushRef.current());
    };
    root.addEventListener('focusout', onFocusOut);
    return () => root.removeEventListener('focusout', onFocusOut);
  }, [editor]);

  useEffect(() => {
    const inspectorHost = host.inspectorHost;
    if (!inspectorHost) return;
    const onFocusOut = (event: FocusEvent): void => {
      if (inspectorOwnsFocus(inspectorHost, event.relatedTarget)) return;
      /*
       * Forced: the relatedTarget check above has already established that focus
       * left the inspector, and the unforced path re-asks the same question of
       * `document.activeElement` — which during focusout is still the control
       * being left, so a field typed into and then left would defer again.
       */
      flushRef.current({ force: true });
    };
    inspectorHost.addEventListener('focusout', onFocusOut);
    return () => inspectorHost.removeEventListener('focusout', onFocusOut);
  }, [host.inspectorHost]);

  useEffect(
    () => () => {
      flushRef.current({ force: true });
    },
    [],
  );

  /* An inspector that changed the card's structure asks for the handover here. */
  useEffect(
    () =>
      editor.registerCommand(
        FLUSH_RICH_CONTENT_COMMAND,
        () => {
          flushRef.current({ force: true });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );

  return (
    <OnChangePlugin
      ignoreSelectionChange
      onChange={(editorState) => {
        pendingEditorState.current = editorState;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => flushRef.current(), RICH_CONTENT_PERSIST_DEBOUNCE_MS);
      }}
    />
  );
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
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  useEffect(() => {
    const resolveMissing = (): void => {
      const loadPreview = resolveRef.current;
      editor.getEditorState().read(() => {
        for (const node of $nodesOfType(RichMediaNode)) {
          if (requested.current.has(node.getBlockId())) continue;
          const blockId = node.getBlockId();
          const assetId = node.getMedia().assetId;
          requested.current.add(blockId);
          if (!loadPreview) continue;
          void loadPreview(assetId).then((url) => {
            if (!url) return;
            editor.update(() => {
              const current = $nodesOfType(RichMediaNode).find(
                (candidate) => candidate.getBlockId() === blockId,
              );
              if (current) current.setPreviewUrl(url);
            });
          });
        }
      });
    };
    resolveMissing();
    return editor.registerUpdateListener(resolveMissing);
  }, [editor]);
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
        decorators.forEach((node) => removeDecoratorAndPrune(node));
        return true;
      }
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
      const decorator = adjacentDecorator(selection, direction);
      if (!decorator) return false;
      event?.preventDefault();
      removeDecoratorAndPrune(decorator);
      return true;
    };
    const unregisterUpdate = editor.registerUpdateListener(syncSelectionChrome);
    const unregisterClick = editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const target = event.target as HTMLElement | null;
        if (
          !target ||
          target.closest('.storyboard-property-tray, .rich-content-toolbar, .rich-content-menu')
        ) {
          return false;
        }
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
      COMMAND_PRIORITY_HIGH,
    );
    const unregisterDelete = editor.registerCommand(
      KEY_DELETE_COMMAND,
      (event) => removeDecorator(event, 'forward'),
      COMMAND_PRIORITY_HIGH,
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
  if ($isDecoratorNode(candidate)) return candidate;
  if ($isElementNode(candidate)) {
    const edge = direction === 'backward' ? candidate.getLastChild() : candidate.getFirstChild();
    if ($isDecoratorNode(edge)) return edge;
  }
  return null;
}

function removeDecoratorAndPrune(node: LexicalNode): void {
  const parent = node.getParent();
  node.remove();
  if (
    $isParagraphNode(parent) &&
    parent.getChildrenSize() === 0 &&
    $getRoot().getChildrenSize() > 1
  ) {
    parent.remove();
  }
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
