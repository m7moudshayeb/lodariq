import {
  MEDIA_HEIGHT_PX_LIMITS,
  MEDIA_WIDTH_PERCENT_LIMITS,
  type BlockActionTypeValue,
  type ButtonStyleProps,
  type FormFieldControl,
  type FormFieldPresentation,
  type ICON_RECIPE_VALUES,
  type LodariqBlockProps,
  type MediaPresentation,
  type OpenPageNavigationBehavior,
} from '@lodariq/schema';
import { resolveTourActionRecipe } from '@lodariq/sdk-runtime/renderers/tour';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $applyNodeReplacement,
  $createNodeSelection,
  $getNodeByKey,
  $getRoot,
  $isDecoratorNode,
  $isParagraphNode,
  $setSelection,
  DecoratorNode,
  ParagraphNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type SerializedParagraphNode,
  type Spread,
} from 'lexical';
import { Settings2 } from 'lucide-react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { authoringText } from '../i18n';
import { RichContentHostContext } from './rich-content-host-context';
import { lucideIconName } from './rich-content-icons';
import { RichContentSelect } from './rich-content-select';

type IconRecipe = (typeof ICON_RECIPE_VALUES)[number];

const MEDIA_FIT_OPTIONS = [
  { label: authoringText('Fit entire media'), value: 'contain' },
  { label: authoringText('Fill the frame'), value: 'cover' },
  { label: authoringText('Stretch to frame'), value: 'fill' },
];

export type RichButtonActionType = Exclude<BlockActionTypeValue, 'runSequence'>;

export const RICH_BUTTON_SEQUENCE_ACTION_OPTION = {
  value: 'runSequence',
  label: authoringText('Run a sequence'),
} as const;

export const RICH_BUTTON_ACTION_OPTIONS: ReadonlyArray<{
  label: string;
  value: RichButtonActionType;
}> = [
  { value: 'next', label: authoringText('Go to next step') },
  { value: 'back', label: authoringText('Go back') },
  { value: 'complete', label: authoringText('Complete tour') },
  { value: 'clickTarget', label: authoringText('Click target') },
  { value: 'openPage', label: authoringText('Open page') },
  { value: 'dismiss', label: authoringText('Close experience') },
];

export const RICH_BUTTON_VARIANT_OPTIONS = [
  { value: 'primary', label: authoringText('Primary') },
  { value: 'secondary', label: authoringText('Secondary') },
  { value: 'subtle', label: authoringText('Subtle') },
  { value: 'outline', label: authoringText('Outline') },
  { value: 'link', label: authoringText('Link style') },
] as const;

export type SerializedRichCalloutNode = Spread<
  { type: 'lodariq-rich-callout'; version: 1 },
  SerializedParagraphNode
>;

export class RichCalloutNode extends ParagraphNode {
  static override getType(): string {
    return 'lodariq-rich-callout';
  }

  static override clone(node: RichCalloutNode): RichCalloutNode {
    return new RichCalloutNode(node.__key);
  }

  static override importJSON(): RichCalloutNode {
    return new RichCalloutNode();
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('aside');
    const className = config.theme.paragraph;
    if (typeof className === 'string') element.className = className;
    element.classList.add('rich-content-callout');
    element.setAttribute('role', 'note');
    return element;
  }

  override exportJSON(): SerializedRichCalloutNode {
    return { ...super.exportJSON(), type: 'lodariq-rich-callout', version: 1 };
  }
}

export function $createRichCalloutNode(): RichCalloutNode {
  return $applyNodeReplacement(new RichCalloutNode());
}

export function $isRichCalloutNode(node: LexicalNode | null | undefined): node is RichCalloutNode {
  return node instanceof RichCalloutNode;
}

export type SerializedRichStatNode = Spread<
  { type: 'lodariq-rich-stat'; version: 1 },
  SerializedParagraphNode
>;

export class RichStatNode extends ParagraphNode {
  static override getType(): string {
    return 'lodariq-rich-stat';
  }

  static override clone(node: RichStatNode): RichStatNode {
    return new RichStatNode(node.__key);
  }

  static override importJSON(): RichStatNode {
    return new RichStatNode();
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('p');
    const className = config.theme.paragraph;
    if (typeof className === 'string') element.className = className;
    element.classList.add('rich-content-stat');
    return element;
  }

  override exportJSON(): SerializedRichStatNode {
    return { ...super.exportJSON(), type: 'lodariq-rich-stat', version: 1 };
  }
}

export function $createRichStatNode(): RichStatNode {
  return $applyNodeReplacement(new RichStatNode());
}

export function $isRichStatNode(node: LexicalNode | null | undefined): node is RichStatNode {
  return node instanceof RichStatNode;
}

interface RichMediaNodeState {
  blockId: string;
  media: MediaPresentation;
  previewUrl?: string;
  uploadProgress?: number;
}

export type SerializedRichMediaNode = Spread<
  RichMediaNodeState & { type: 'lodariq-rich-media'; version: 1 },
  SerializedLexicalNode
>;

export class RichMediaNode extends DecoratorNode<ReactNode> {
  __blockId: string;
  __media: MediaPresentation;
  __previewUrl: string | undefined;
  __uploadProgress: number | undefined;

  static override getType(): string {
    return 'lodariq-rich-media';
  }

  static override clone(node: RichMediaNode): RichMediaNode {
    return new RichMediaNode(
      node.__blockId,
      node.__media,
      node.__previewUrl,
      node.__uploadProgress,
      node.__key,
    );
  }

  static override importJSON(node: SerializedRichMediaNode): RichMediaNode {
    return new RichMediaNode(node.blockId, node.media, node.previewUrl, node.uploadProgress);
  }

  constructor(
    blockId: string,
    media: MediaPresentation,
    previewUrl?: string,
    uploadProgress?: number,
    key?: NodeKey,
  ) {
    super(key);
    this.__blockId = blockId;
    this.__media = structuredClone(media);
    this.__previewUrl = previewUrl;
    this.__uploadProgress = uploadProgress;
  }

  override createDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = 'rich-content-media-node';
    return element;
  }

  override isInline(): boolean {
    return true;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactNode {
    return (
      <ResizableMediaPreview
        media={this.__media}
        nodeKey={this.getKey()}
        previewUrl={this.__previewUrl}
        uploadProgress={this.__uploadProgress}
      />
    );
  }

  override exportJSON(): SerializedRichMediaNode {
    return {
      ...super.exportJSON(),
      type: 'lodariq-rich-media',
      version: 1,
      blockId: this.__blockId,
      media: structuredClone(this.__media),
      ...(this.__previewUrl ? { previewUrl: this.__previewUrl } : {}),
      ...(this.__uploadProgress === undefined ? {} : { uploadProgress: this.__uploadProgress }),
    };
  }

  getBlockId(): string {
    return this.__blockId;
  }

  getMedia(): MediaPresentation {
    return structuredClone(this.__media);
  }

  setPreviewUrl(previewUrl: string): void {
    this.getWritable().__previewUrl = previewUrl;
  }

  isPendingAsset(): boolean {
    return !this.__media.assetId;
  }

  setUploadProgress(progress: number | undefined): void {
    this.getWritable().__uploadProgress = progress;
  }

  completeUpload(media: MediaPresentation, previewUrl?: string): void {
    const writable = this.getWritable();
    writable.__media = structuredClone(media);
    writable.__previewUrl = previewUrl;
    writable.__uploadProgress = undefined;
  }

  setCaptionsAssetId(captionsAssetId: string): void {
    const writable = this.getWritable();
    if (writable.__media.kind !== 'video') return;
    writable.__media = { ...writable.__media, captionsAssetId };
    writable.__uploadProgress = undefined;
  }

  setSize({ heightPx, widthPercent }: { heightPx?: number; widthPercent?: number }): void {
    const writable = this.getWritable();
    writable.__media = {
      ...writable.__media,
      ...(heightPx === undefined ? {} : { heightPx: clampMediaHeight(heightPx) }),
      ...(widthPercent === undefined ? {} : { widthPercent: clampMediaWidth(widthPercent) }),
    };
  }

  setFit(fit: NonNullable<MediaPresentation['fit']>): void {
    const writable = this.getWritable();
    writable.__media = { ...writable.__media, fit };
  }
}

type MediaResizeEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

const MEDIA_RESIZE_EDGES: readonly MediaResizeEdge[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

const MEDIA_RESIZE_HORIZONTAL_DIRECTION: Readonly<Record<MediaResizeEdge, -1 | 0 | 1>> = {
  n: 0,
  ne: 1,
  e: 1,
  se: 1,
  s: 0,
  sw: -1,
  w: -1,
  nw: -1,
};

const MEDIA_RESIZE_VERTICAL_DIRECTION: Readonly<Record<MediaResizeEdge, -1 | 0 | 1>> = {
  n: -1,
  ne: -1,
  e: 0,
  se: 1,
  s: 1,
  sw: 1,
  w: 0,
  nw: -1,
};

interface MediaResizeState {
  canvasWidth: number;
  edge: MediaResizeEdge;
  pointerId: number;
  startHeightPx: number;
  startWidthPercent: number;
  startX: number;
  startY: number;
}

interface MediaDraftSize {
  heightPx?: number;
  widthPercent: number;
}

function ResizableMediaPreview({
  media,
  nodeKey,
  previewUrl,
  uploadProgress,
}: {
  media: MediaPresentation;
  nodeKey: NodeKey;
  previewUrl?: string;
  uploadProgress?: number;
}): ReactNode {
  const [editor] = useLexicalComposerContext();
  const figureRef = useRef<HTMLElement | null>(null);
  const resizeState = useRef<MediaResizeState | null>(null);
  const pendingDraftSize = useRef<MediaDraftSize | null>(null);
  const resizeFrame = useRef<number | null>(null);
  const [draftSize, setDraftSize] = useState<MediaDraftSize | null>(null);
  const [resizingEdge, setResizingEdge] = useState<MediaResizeEdge | null>(null);
  const widthPercent = media.widthPercent ?? MEDIA_WIDTH_PERCENT_LIMITS.max;
  const renderedWidthPercent = draftSize?.widthPercent ?? widthPercent;
  const renderedHeightPx = draftSize?.heightPx ?? media.heightPx;
  const pendingAsset = !media.assetId;
  const style = {
    '--rich-media-fit': media.fit ?? 'contain',
    '--rich-media-height': renderedHeightPx ? `${renderedHeightPx}px` : 'auto',
    '--rich-media-width': `${renderedWidthPercent}%`,
  } as CSSProperties;
  const setSize = (next: { heightPx?: number; widthPercent?: number }): void => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isRichMediaNode(node)) node.setSize(next);
    });
  };
  const cancelResizeFrame = (): void => {
    if (resizeFrame.current === null) return;
    const ownerWindow = figureRef.current?.ownerDocument.defaultView ?? window;
    if (typeof ownerWindow.cancelAnimationFrame === 'function') {
      ownerWindow.cancelAnimationFrame(resizeFrame.current);
    } else {
      ownerWindow.clearTimeout(resizeFrame.current);
    }
    resizeFrame.current = null;
  };
  const flushDraftSize = (): void => {
    resizeFrame.current = null;
    if (pendingDraftSize.current) setDraftSize(pendingDraftSize.current);
  };
  const scheduleDraftSize = (next: MediaDraftSize): void => {
    pendingDraftSize.current = next;
    if (resizeFrame.current !== null) return;
    const ownerWindow = figureRef.current?.ownerDocument.defaultView ?? window;
    resizeFrame.current =
      typeof ownerWindow.requestAnimationFrame === 'function'
        ? ownerWindow.requestAnimationFrame(flushDraftSize)
        : ownerWindow.setTimeout(flushDraftSize, 0);
  };
  useEffect(
    () => () => {
      cancelResizeFrame();
    },
    [],
  );
  useEffect(() => {
    if (resizingEdge || !draftSize) return;
    const widthMatches = widthPercent === draftSize.widthPercent;
    const heightMatches = draftSize.heightPx === undefined || media.heightPx === draftSize.heightPx;
    if (widthMatches && heightMatches) {
      pendingDraftSize.current = null;
      setDraftSize(null);
    }
  }, [draftSize, media.heightPx, resizingEdge, widthPercent]);
  const setFit = (value: string): void => {
    const fit = value as NonNullable<MediaPresentation['fit']>;
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isRichMediaNode(node)) node.setFit(fit);
    });
  };
  const onPointerDown = (edge: MediaResizeEdge, event: ReactPointerEvent<HTMLDivElement>): void => {
    const canvas = figureRef.current?.closest<HTMLElement>('.rich-content-canvas');
    const frame = figureRef.current?.querySelector<HTMLElement>('.rich-content-media-frame');
    const canvasWidth = canvas?.getBoundingClientRect().width ?? 0;
    const figureWidth = figureRef.current?.getBoundingClientRect().width ?? 0;
    const startHeightPx = frame?.getBoundingClientRect().height ?? 0;
    if (canvasWidth <= 0 || figureWidth <= 0 || startHeightPx <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeState.current = {
      canvasWidth,
      edge,
      pointerId: event.pointerId,
      startHeightPx,
      startWidthPercent: clampMediaWidth((figureWidth / canvasWidth) * 100),
      startX: event.clientX,
      startY: event.clientY,
    };
    setDraftSize({
      ...(media.heightPx ? { heightPx: media.heightPx } : {}),
      widthPercent: clampMediaWidth((figureWidth / canvasWidth) * 100),
    });
    setResizingEdge(edge);
  };
  const sizeFromPointer = (
    clientX: number,
    clientY: number,
    state: MediaResizeState,
  ): MediaDraftSize => {
    const horizontalDirection = MEDIA_RESIZE_HORIZONTAL_DIRECTION[state.edge];
    const verticalDirection = MEDIA_RESIZE_VERTICAL_DIRECTION[state.edge];
    const deltaPercent = ((clientX - state.startX) / state.canvasWidth) * 100 * horizontalDirection;
    const deltaHeight = (clientY - state.startY) * verticalDirection;
    const next: MediaDraftSize = {
      widthPercent: horizontalDirection
        ? clampMediaWidth(state.startWidthPercent + deltaPercent)
        : state.startWidthPercent,
    };
    if (verticalDirection) {
      next.heightPx = clampMediaHeight(state.startHeightPx + deltaHeight);
    } else if (media.heightPx) {
      next.heightPx = media.heightPx;
    }
    return next;
  };
  const updateResize = (pointerId: number | undefined, clientX: number, clientY: number): void => {
    const state = resizeState.current;
    if (!state || (pointerId !== undefined && state.pointerId !== pointerId)) return;
    scheduleDraftSize(sizeFromPointer(clientX, clientY, state));
  };
  const finishResize = (pointerId: number | undefined, clientX: number, clientY: number): void => {
    const state = resizeState.current;
    if (!state || (pointerId !== undefined && state.pointerId !== pointerId)) return;
    const next = sizeFromPointer(clientX, clientY, state);
    cancelResizeFrame();
    pendingDraftSize.current = next;
    setDraftSize(next);
    resizeState.current = null;
    setResizingEdge(null);
    setSize({
      ...(MEDIA_RESIZE_VERTICAL_DIRECTION[state.edge] ? { heightPx: next.heightPx } : {}),
      ...(MEDIA_RESIZE_HORIZONTAL_DIRECTION[state.edge] ? { widthPercent: next.widthPercent } : {}),
    });
  };
  const cancelResize = (pointerId?: number): void => {
    if (
      !resizeState.current ||
      (pointerId !== undefined && resizeState.current.pointerId !== pointerId)
    ) {
      return;
    }
    cancelResizeFrame();
    pendingDraftSize.current = null;
    resizeState.current = null;
    setDraftSize(null);
    setResizingEdge(null);
  };
  useEffect(() => {
    if (!resizingEdge) return;
    const ownerWindow = figureRef.current?.ownerDocument.defaultView ?? window;
    const onPointerMove = (event: PointerEvent): void => {
      event.preventDefault();
      updateResize(event.pointerId, event.clientX, event.clientY);
    };
    const onMouseMove = (event: MouseEvent): void => {
      event.preventDefault();
      updateResize(undefined, event.clientX, event.clientY);
    };
    const onPointerUp = (event: PointerEvent): void => {
      finishResize(event.pointerId, event.clientX, event.clientY);
    };
    const onMouseUp = (event: MouseEvent): void => {
      finishResize(undefined, event.clientX, event.clientY);
    };
    const onPointerCancel = (event: PointerEvent): void => {
      cancelResize(event.pointerId);
    };
    const onWindowBlur = (): void => cancelResize();
    ownerWindow.addEventListener('pointermove', onPointerMove, true);
    ownerWindow.addEventListener('pointerup', onPointerUp, true);
    ownerWindow.addEventListener('pointercancel', onPointerCancel, true);
    ownerWindow.addEventListener('mousemove', onMouseMove, true);
    ownerWindow.addEventListener('mouseup', onMouseUp, true);
    ownerWindow.addEventListener('blur', onWindowBlur);
    return () => {
      ownerWindow.removeEventListener('pointermove', onPointerMove, true);
      ownerWindow.removeEventListener('pointerup', onPointerUp, true);
      ownerWindow.removeEventListener('pointercancel', onPointerCancel, true);
      ownerWindow.removeEventListener('mousemove', onMouseMove, true);
      ownerWindow.removeEventListener('mouseup', onMouseUp, true);
      ownerWindow.removeEventListener('blur', onWindowBlur);
    };
  }, [resizingEdge]);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      event.stopPropagation();
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (!$isRichMediaNode(node)) return;
        node.remove();
      });
      return;
    }
    const step = event.shiftKey ? 10 : 5;
    if (event.key === 'Home') {
      event.preventDefault();
      event.stopPropagation();
      setSize({ widthPercent: MEDIA_WIDTH_PERCENT_LIMITS.min });
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      setSize({ widthPercent: MEDIA_WIDTH_PERCENT_LIMITS.max });
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      setSize({ widthPercent: widthPercent + (event.key === 'ArrowLeft' ? -step : step) });
      return;
    }
    const currentHeight =
      media.heightPx ??
      figureRef.current?.querySelector<HTMLElement>('.rich-content-media-frame')?.offsetHeight ??
      MEDIA_HEIGHT_PX_LIMITS.min;
    setSize({ heightPx: currentHeight + (event.key === 'ArrowUp' ? -step : step) });
  };

  return (
    <figure
      className="rich-content-media-preview"
      data-fixed-height={renderedHeightPx ? 'true' : undefined}
      data-media-kind={media.kind}
      data-resizing={resizingEdge ?? undefined}
      data-uploading={uploadProgress === undefined ? undefined : 'true'}
      onKeyDownCapture={onKeyDown}
      ref={figureRef}
      style={style}
      tabIndex={0}
      aria-label={`Resize ${media.kind}. Use arrow keys or drag any edge.`}
    >
      <div className="rich-content-media-frame">
        {previewUrl ? (
          media.kind === 'image' ? (
            <img alt={media.accessibilityName} src={previewUrl} />
          ) : (
            <video
              aria-label={media.accessibilityName}
              controls={!pendingAsset}
              data-video-thumbnail={pendingAsset ? 'true' : undefined}
              muted={pendingAsset}
              playsInline
              preload="auto"
              src={previewUrl}
            />
          )
        ) : (
          <div
            className="rich-content-media-unavailable"
            role="img"
            aria-label={media.accessibilityName}
          >
            <span>{media.kind === 'image' ? 'Image' : 'Video'}</span>
            <small>{media.accessibilityName}</small>
          </div>
        )}
        {uploadProgress === undefined ? null : (
          <div
            aria-label={authoringText('Media upload progress')}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={uploadProgress}
            className="rich-content-media-upload-progress"
            role="progressbar"
          >
            <span style={{ width: `${uploadProgress}%` }} />
          </div>
        )}
        {pendingAsset
          ? null
          : MEDIA_RESIZE_EDGES.map((edge) => (
              <div
                aria-hidden="true"
                className="rich-content-media-resize-edge"
                data-edge={edge}
                key={edge}
                onPointerDown={(event) => onPointerDown(edge, event)}
              />
            ))}
        {pendingAsset ? null : (
          <label className="rich-content-media-fit-control">
            <span>{authoringText('Media framing')}</span>
            <RichContentSelect
              ariaLabel={authoringText('How media fills the frame')}
              className="rich-content-media-fit-select"
              onValueChange={setFit}
              onPointerDown={(event) => event.stopPropagation()}
              options={MEDIA_FIT_OPTIONS}
              value={media.fit ?? 'contain'}
            />
          </label>
        )}
      </div>
    </figure>
  );
}

function clampMediaWidth(widthPercent: number): number {
  return Math.round(
    Math.min(
      MEDIA_WIDTH_PERCENT_LIMITS.max,
      Math.max(MEDIA_WIDTH_PERCENT_LIMITS.min, widthPercent),
    ),
  );
}

function clampMediaHeight(heightPx: number): number {
  return Math.round(
    Math.min(MEDIA_HEIGHT_PX_LIMITS.max, Math.max(MEDIA_HEIGHT_PX_LIMITS.min, heightPx)),
  );
}

export function $createRichMediaNode(
  blockId: string,
  media: MediaPresentation,
  previewUrl?: string,
  uploadProgress?: number,
): RichMediaNode {
  return $applyNodeReplacement(new RichMediaNode(blockId, media, previewUrl, uploadProgress));
}

export function $isRichMediaNode(node: LexicalNode | null | undefined): node is RichMediaNode {
  return node instanceof RichMediaNode;
}

interface RichButtonNodeState {
  blockId: string;
  content: string;
  props: LodariqBlockProps;
}

export type SerializedRichButtonNode = Spread<
  RichButtonNodeState & { type: 'lodariq-rich-button'; version: 1 },
  SerializedLexicalNode
>;

export class RichButtonNode extends DecoratorNode<ReactNode> {
  __blockId: string;
  __content: string;
  __props: LodariqBlockProps;

  static override getType(): string {
    return 'lodariq-rich-button';
  }

  static override clone(node: RichButtonNode): RichButtonNode {
    return new RichButtonNode(node.__blockId, node.__content, node.__props, node.__key);
  }

  static override importJSON(node: SerializedRichButtonNode): RichButtonNode {
    return new RichButtonNode(node.blockId, node.content, node.props);
  }

  constructor(blockId: string, content: string, props: LodariqBlockProps, key?: NodeKey) {
    super(key);
    this.__blockId = blockId;
    this.__content = content;
    this.__props = structuredClone(props);
  }

  override createDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = 'rich-content-button-node';
    return element;
  }

  override isInline(): boolean {
    return true;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactNode {
    return (
      <RichButtonPreview
        blockId={this.__blockId}
        content={this.__content}
        nodeKey={this.getKey()}
        props={this.__props}
      />
    );
  }

  override exportJSON(): SerializedRichButtonNode {
    return {
      ...super.exportJSON(),
      blockId: this.__blockId,
      content: this.__content,
      props: structuredClone(this.__props),
      type: 'lodariq-rich-button',
      version: 1,
    };
  }

  getBlockId(): string {
    return this.__blockId;
  }

  getContent(): string {
    return this.__content;
  }

  getProps(): LodariqBlockProps {
    return structuredClone(this.__props);
  }

  setContent(content: string): void {
    this.getWritable().__content = content.slice(0, 300);
  }

  setActionType(type: RichButtonActionType): void {
    const writable = this.getWritable();
    const current = writable.__props.action;
    const transition = current?.transition;
    if (type === 'openPage') {
      writable.__props = {
        ...writable.__props,
        action: {
          type,
          ...(current?.type === 'openPage' && current.url ? { url: current.url } : {}),
          ...(transition ? { transition } : {}),
        },
      };
      return;
    }
    writable.__props = {
      ...writable.__props,
      action: { type, ...(transition ? { transition } : {}) },
    };
  }

  setActionUrl(url: string): void {
    const writable = this.getWritable();
    const current = writable.__props.action;
    if (current?.type !== 'openPage') return;
    const normalized = url.trim();
    const { url: _currentUrl, ...actionWithoutUrl } = current;
    writable.__props = {
      ...writable.__props,
      action: normalized
        ? { ...actionWithoutUrl, url: normalized.slice(0, 2048) }
        : actionWithoutUrl,
    };
  }

  setVariant(variant: NonNullable<LodariqBlockProps['variant']>): void {
    const writable = this.getWritable();
    writable.__props = { ...writable.__props, variant };
  }

  setNavigationBehavior(navigationBehavior: OpenPageNavigationBehavior): void {
    const writable = this.getWritable();
    const current = writable.__props.action;
    if (current?.type !== 'openPage') return;
    writable.__props = { ...writable.__props, action: { ...current, navigationBehavior } };
  }

  setButtonStyle(style: ButtonStyleProps): void {
    const writable = this.getWritable();
    writable.__props = {
      ...writable.__props,
      buttonStyle: { ...writable.__props.buttonStyle, ...style },
    };
  }

  setBlockAlign(align: NonNullable<LodariqBlockProps['blockLayout']>['align']): void {
    const writable = this.getWritable();
    writable.__props = {
      ...writable.__props,
      blockLayout: { ...writable.__props.blockLayout, align },
    };
  }
}

function RichButtonPreview({
  blockId,
  content,
  nodeKey,
  props,
}: Pick<RichButtonNodeState, 'blockId' | 'content' | 'props'> & { nodeKey: NodeKey }): ReactNode {
  const [editor] = useLexicalComposerContext();
  const host = useContext(RichContentHostContext);
  const inspect = (): void => {
    editor.update(() => {
      const selection = $createNodeSelection();
      selection.add(nodeKey);
      $setSelection(selection);
    });
    host.onInspectOpen?.();
  };
  const deleteOnKey = useDeleteDecoratorOnKey(nodeKey);
  const recipe = resolveTourActionRecipe(props);
  const style = props.buttonStyle;
  const actionStyle = {
    ...(style?.fillColor ? { '--lq-action-fill': style.fillColor } : {}),
    ...(style?.textColor ? { '--lq-action-text': style.textColor } : {}),
    ...(style?.borderColor ? { '--lq-action-border': style.borderColor } : {}),
    ...(recipe.widthPx ? { '--lq-action-width': `${recipe.widthPx}px` } : {}),
  } as CSSProperties;
  return (
    <div
      className="rich-content-button-preview-shell"
      data-block-id={blockId}
      data-lodariq-action-width={recipe.widthPx ? 'custom' : recipe.width}
      onKeyDownCapture={deleteOnKey}
      style={actionStyle}
      tabIndex={0}
    >
      <div className="rich-content-button-preview-row">
        <button
          className="rich-content-button-preview rich-step-action-preview"
          data-lodariq-action-radius={recipe.radius}
          data-lodariq-action-size={recipe.size}
          data-lodariq-action-variant={recipe.variant}
          data-lodariq-action-width={recipe.widthPx ? 'custom' : recipe.width}
          data-variant={recipe.variant}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            inspect();
          }}
          onPointerDown={(event) => event.preventDefault()}
          style={actionStyle}
          type="button"
        >
          {content || authoringText('Continue')}
        </button>
        <button
          aria-label={authoringText('Configure button')}
          className="rich-content-button-config-trigger"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            inspect();
          }}
          onPointerDown={(event) => event.preventDefault()}
          title={authoringText('Configure button')}
          type="button"
        >
          <Settings2 aria-hidden="true" size={15} />
        </button>
      </div>
    </div>
  );
}

export function $createRichButtonNode(
  blockId: string,
  content: string,
  props: LodariqBlockProps,
): RichButtonNode {
  return $applyNodeReplacement(new RichButtonNode(blockId, content, props));
}

export function $isRichButtonNode(node: LexicalNode | null | undefined): node is RichButtonNode {
  return node instanceof RichButtonNode;
}

interface RichFormFieldNodeState {
  blockId: string;
  content: string;
  props: LodariqBlockProps;
}

export type SerializedRichFormFieldNode = Spread<
  RichFormFieldNodeState & { type: 'lodariq-rich-form-field'; version: 1 },
  SerializedLexicalNode
>;

export class RichFormFieldNode extends DecoratorNode<ReactNode> {
  __blockId: string;
  __content: string;
  __props: LodariqBlockProps;

  static override getType(): string {
    return 'lodariq-rich-form-field';
  }

  static override clone(node: RichFormFieldNode): RichFormFieldNode {
    return new RichFormFieldNode(node.__blockId, node.__content, node.__props, node.__key);
  }

  static override importJSON(node: SerializedRichFormFieldNode): RichFormFieldNode {
    return new RichFormFieldNode(node.blockId, node.content, node.props);
  }

  constructor(blockId: string, content: string, props: LodariqBlockProps, key?: NodeKey) {
    super(key);
    this.__blockId = blockId;
    this.__content = content;
    this.__props = structuredClone(props);
  }

  override createDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = 'rich-content-form-field-node';
    return element;
  }

  override isInline(): boolean {
    return true;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactNode {
    return (
      <RichFormFieldPreview
        blockId={this.__blockId}
        content={this.__content}
        nodeKey={this.getKey()}
        props={this.__props}
      />
    );
  }

  override exportJSON(): SerializedRichFormFieldNode {
    return {
      ...super.exportJSON(),
      blockId: this.__blockId,
      content: this.__content,
      props: structuredClone(this.__props),
      type: 'lodariq-rich-form-field',
      version: 1,
    };
  }

  getBlockId(): string {
    return this.__blockId;
  }

  getContent(): string {
    return this.__content;
  }

  getProps(): LodariqBlockProps {
    return structuredClone(this.__props);
  }

  setContent(content: string): void {
    this.getWritable().__content = content.slice(0, 300);
  }

  setFormField(formField: FormFieldPresentation): void {
    this.getWritable().__props = { ...this.__props, formField: structuredClone(formField) };
  }

  setBlockAlign(align: NonNullable<LodariqBlockProps['blockLayout']>['align']): void {
    const writable = this.getWritable();
    writable.__props = {
      ...writable.__props,
      blockLayout: { ...writable.__props.blockLayout, align },
    };
  }
}

function RichFormFieldPreview({
  blockId,
  content,
  nodeKey,
  props,
}: Pick<RichFormFieldNodeState, 'blockId' | 'content' | 'props'> & { nodeKey: NodeKey }): ReactNode {
  const [editor] = useLexicalComposerContext();
  const host = useContext(RichContentHostContext);
  const field = props.formField;
  const control: FormFieldControl = field?.control ?? 'text';
  const inspect = (): void => {
    editor.update(() => {
      const selection = $createNodeSelection();
      selection.add(nodeKey);
      $setSelection(selection);
    });
    host.onInspectOpen?.();
  };
  const deleteOnKey = useDeleteDecoratorOnKey(nodeKey);
  const label = content || authoringText('Label');
  const previewStyle = {
    ...(field?.fillColor ? { '--lq-field-fill': field.fillColor } : {}),
    ...(field?.textColor ? { '--lq-field-text': field.textColor } : {}),
    ...(field?.labelColor ? { '--lq-field-label': field.labelColor } : {}),
    ...(field?.borderColor ? { '--lq-field-border': field.borderColor } : {}),
  } as CSSProperties;
  return (
    <div
      className="rich-content-form-field-preview"
      data-block-id={blockId}
      data-control={control}
      data-lodariq-block-align={props.blockLayout?.align}
      data-lodariq-field-radius={field?.radius}
      data-lodariq-field-size={field?.size}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        inspect();
      }}
      onKeyDownCapture={deleteOnKey}
      onPointerDown={(event) => event.preventDefault()}
      style={previewStyle}
      tabIndex={0}
    >
      {control === 'radio' ? (
        <fieldset>
          <legend>{label}</legend>
          {(field?.options ?? []).map((option) => (
            <label key={option.id}>
              <input disabled tabIndex={-1} type="radio" />
              {option.label}
            </label>
          ))}
        </fieldset>
      ) : control === 'checkbox' ? (
        <label>
          <input disabled tabIndex={-1} type="checkbox" />
          {label}
        </label>
      ) : (
        <label>
          <span>{label}</span>
          <input
            disabled
            placeholder={field?.placeholder}
            tabIndex={-1}
            type="text"
          />
        </label>
      )}
      <button
        aria-label={authoringText('Configure field')}
        className="rich-content-button-config-trigger"
        onClick={inspect}
        title={authoringText('Configure field')}
        type="button"
      >
        <Settings2 aria-hidden="true" size={15} />
      </button>
    </div>
  );
}

export function $createRichFormFieldNode(
  blockId: string,
  content: string,
  props: LodariqBlockProps,
): RichFormFieldNode {
  return $applyNodeReplacement(new RichFormFieldNode(blockId, content, props));
}

export function $isRichFormFieldNode(
  node: LexicalNode | null | undefined,
): node is RichFormFieldNode {
  return node instanceof RichFormFieldNode;
}

interface RichIconNodeState {
  accessibilityName: string;
  blockId: string;
  color?: string;
  icon: IconRecipe;
}

export type SerializedRichIconNode = Spread<
  RichIconNodeState & { type: 'lodariq-rich-icon'; version: 1 },
  SerializedLexicalNode
>;

export class RichIconNode extends DecoratorNode<ReactNode> {
  __accessibilityName: string;
  __blockId: string;
  __color: string | undefined;
  __icon: IconRecipe;

  static override getType(): string {
    return 'lodariq-rich-icon';
  }

  static override clone(node: RichIconNode): RichIconNode {
    return new RichIconNode(
      node.__blockId,
      node.__icon,
      node.__accessibilityName,
      node.__color,
      node.__key,
    );
  }

  static override importJSON(node: SerializedRichIconNode): RichIconNode {
    return new RichIconNode(node.blockId, node.icon, node.accessibilityName, node.color);
  }

  constructor(
    blockId: string,
    icon: IconRecipe,
    accessibilityName: string,
    color?: string,
    key?: NodeKey,
  ) {
    super(key);
    this.__blockId = blockId;
    this.__icon = icon;
    this.__accessibilityName = accessibilityName;
    this.__color = color;
  }

  override createDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = 'rich-content-icon-node';
    return element;
  }

  override isInline(): boolean {
    return true;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactNode {
    return (
      <RichIconPreview
        accessibilityName={this.__accessibilityName}
        color={this.__color}
        icon={this.__icon}
        nodeKey={this.getKey()}
      />
    );
  }

  override exportJSON(): SerializedRichIconNode {
    return {
      ...super.exportJSON(),
      type: 'lodariq-rich-icon',
      version: 1,
      blockId: this.__blockId,
      ...(this.__color ? { color: this.__color } : {}),
      icon: this.__icon,
      accessibilityName: this.__accessibilityName,
    };
  }

  getAccessibilityName(): string {
    return this.__accessibilityName;
  }

  getBlockId(): string {
    return this.__blockId;
  }

  getIcon(): IconRecipe {
    return this.__icon;
  }

  getColor(): string | undefined {
    return this.__color;
  }

  setColor(color: string): void {
    this.getWritable().__color = color;
  }
}

function RichIconPreview({
  accessibilityName,
  color,
  icon,
  nodeKey,
}: Pick<RichIconNodeState, 'accessibilityName' | 'color' | 'icon'> & {
  nodeKey: NodeKey;
}): ReactNode {
  const deleteOnKey = useDeleteDecoratorOnKey(nodeKey);
  return (
    <span
      aria-label={accessibilityName}
      className="rich-content-icon-preview"
      onKeyDownCapture={deleteOnKey}
      role="img"
      style={color ? { color } : undefined}
      tabIndex={0}
    >
      <DynamicIcon name={lucideIconName(icon)} size={24} strokeWidth={1.9} />
    </span>
  );
}

export function $createRichIconNode(
  blockId: string,
  icon: IconRecipe,
  accessibilityName: string,
  color?: string,
): RichIconNode {
  return $applyNodeReplacement(new RichIconNode(blockId, icon, accessibilityName, color));
}

export function $isRichIconNode(node: LexicalNode | null | undefined): node is RichIconNode {
  return node instanceof RichIconNode;
}

export type SerializedRichDividerNode = Spread<
  { blockId: string; type: 'lodariq-rich-divider'; version: 1 },
  SerializedLexicalNode
>;

export class RichDividerNode extends DecoratorNode<ReactNode> {
  __blockId: string;

  static override getType(): string {
    return 'lodariq-rich-divider';
  }

  static override clone(node: RichDividerNode): RichDividerNode {
    return new RichDividerNode(node.__blockId, node.__key);
  }

  static override importJSON(node: SerializedRichDividerNode): RichDividerNode {
    return new RichDividerNode(node.blockId);
  }

  constructor(blockId: string, key?: NodeKey) {
    super(key);
    this.__blockId = blockId;
  }

  override createDOM(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'rich-content-divider-node';
    return element;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactNode {
    return <RichDividerPreview nodeKey={this.getKey()} />;
  }

  override exportJSON(): SerializedRichDividerNode {
    return {
      ...super.exportJSON(),
      blockId: this.__blockId,
      type: 'lodariq-rich-divider',
      version: 1,
    };
  }

  getBlockId(): string {
    return this.__blockId;
  }
}

function RichDividerPreview({ nodeKey }: { nodeKey: NodeKey }): ReactNode {
  const deleteOnKey = useDeleteDecoratorOnKey(nodeKey);
  return (
    <hr
      aria-label={authoringText('Divider')}
      className="rich-content-divider"
      onKeyDownCapture={deleteOnKey}
      tabIndex={0}
    />
  );
}

function useDeleteDecoratorOnKey(
  nodeKey: NodeKey,
): (event: ReactKeyboardEvent<HTMLElement>) => void {
  const [editor] = useLexicalComposerContext();
  return (event) => {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
    event.preventDefault();
    event.stopPropagation();
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!$isDecoratorNode(node)) return;
      const parent = node.getParent();
      node.remove();
      if (
        $isParagraphNode(parent) &&
        parent.getChildrenSize() === 0 &&
        $getRoot().getChildrenSize() > 1
      ) {
        parent.remove();
      }
    });
  };
}

export function $createRichDividerNode(blockId: string): RichDividerNode {
  return $applyNodeReplacement(new RichDividerNode(blockId));
}

export function $isRichDividerNode(node: LexicalNode | null | undefined): node is RichDividerNode {
  return node instanceof RichDividerNode;
}
