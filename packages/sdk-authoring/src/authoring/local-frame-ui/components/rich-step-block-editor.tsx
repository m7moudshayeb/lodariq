import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import type { BlockLayoutProps, ButtonStyleProps, LodariqBlock } from '@lodariq/schema';
import { resolveTourActionRecipe } from '@lodariq/sdk-runtime/renderers/tour';
import { authoringText } from '../../../i18n';
import { lucideIconName } from '../../../editor/rich-content-icons';
import type { LocalAuthoringFrameController } from '../controller';
import { Check, ChevronRight, ExternalLink, Image as ImageIcon } from '../design-system';
import { DynamicIcon } from 'lucide-react/dynamic';
import { stepContentCommandFromQuery } from '../utils';
import { defaultActionVariant } from '../properties/button-properties';
import { useActionResize } from '../../canvas/use-action-resize';
import {
  BLOCK_EDITOR_INPUT_LABELS,
  blockTypeEditorLabel,
  extractInlineTextRuns,
  renderInlineTextRuns,
  richTextBlockStyle,
  richTextSelection,
} from './rich-text-editing';

export function useMediaPreference(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);

  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const sync = (): void => setMatches(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, [query]);

  return matches;
}

export function handleRichTextEditorKeyDown({
  block,
  controller,
  element,
  event,
  stepBlockId,
  suppressBlurCommit,
  totalBlocks,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  element: HTMLElement;
  event: ReactKeyboardEvent<HTMLElement>;
  stepBlockId: string;
  suppressBlurCommit: () => void;
  totalBlocks: number;
}): void {
  if (event.nativeEvent.isComposing) return;
  const selection = richTextSelection(element, block.id);
  if (!selection) return;
  const content = extractInlineTextRuns(element)
    .map((run) => run.text)
    .join('');
  const collapsed = selection.start === selection.end;
  const hasNavigationModifier = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;

  if (event.key === 'ArrowUp' && collapsed && selection.start === 0 && !hasNavigationModifier) {
    if (controller.focusPreviousStepContentBlock(stepBlockId, block.id)) event.preventDefault();
    return;
  }
  if (
    event.key === 'ArrowDown' &&
    collapsed &&
    selection.end === content.length &&
    !hasNavigationModifier
  ) {
    if (controller.focusNextStepContentBlock(stepBlockId, block.id)) event.preventDefault();
    return;
  }
  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    const slashCommand = content.trimStart().startsWith('/')
      ? stepContentCommandFromQuery(content)
      : undefined;
    event.preventDefault();
    suppressBlurCommit();
    if (slashCommand) {
      controller.applyStepContentCommand(stepBlockId, block.id, slashCommand);
      return;
    }
    controller.continueStepContentBlock(
      stepBlockId,
      block.id,
      content.slice(0, selection.start),
      content.slice(selection.end),
    );
    return;
  }
  if (
    event.key !== 'Backspace' ||
    totalBlocks <= 1 ||
    !collapsed ||
    selection.start !== 0 ||
    hasNavigationModifier
  ) {
    return;
  }
  if (content.trim().length === 0) {
    event.preventDefault();
    suppressBlurCommit();
    controller.deleteEmptyStepContentBlock(stepBlockId, block.id);
    return;
  }
  if (controller.mergeStepContentBlockIntoPrevious(stepBlockId, block.id, content)) {
    event.preventDefault();
    suppressBlurCommit();
    return;
  }
  if (controller.focusPreviousStepContentBlock(stepBlockId, block.id)) event.preventDefault();
}

export function InlineMarkButton({
  active,
  disabled = false,
  icon,
  label,
  onApply,
}: {
  active: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onApply: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => onApply(!active)}
    >
      {icon}
    </button>
  );
}

export function RichStepBlockEditor({
  actionAlign,
  active,
  block,
  canvasZoom,
  controller,
  onActivate,
}: {
  actionAlign?: BlockLayoutProps['align'];
  active: boolean;
  block: LodariqBlock;
  canvasZoom: number;
  controller: LocalAuthoringFrameController;
  onActivate: () => void;
  onCommitRichText: (element: HTMLElement) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>, element: HTMLElement) => void;
  onSelectionChange: (element: HTMLElement) => void;
}) {
  if (block.type === 'heading' || block.type === 'paragraph') {
    return (
      <div
        key={`${block.id}:${block.content ?? ''}`}
        className={`rich-step-block ${block.type}`}
        data-rich-block-id={block.id}
        data-lodariq-node-type={block.type}
        style={richTextBlockStyle(block)}
        onPointerDown={onActivate}
      >
        {renderInlineTextRuns(block)}
      </div>
    );
  }
  if (block.type === 'divider') {
    return <div className="rich-step-divider-preview" role="separator" />;
  }
  if (block.type === 'callout') {
    const tone =
      block.props.composition?.kind === 'callout' ? block.props.composition.tone : 'info';
    return (
      <aside
        aria-label={block.props.accessibilityName}
        className="rich-step-structured-preview callout"
        data-lodariq-callout-tone={tone}
        data-lodariq-node-type="callout"
        role="note"
        style={richTextBlockStyle(block)}
        onPointerDown={onActivate}
      >
        {block.content}
      </aside>
    );
  }
  if (block.type === 'stat') {
    const emphasis =
      block.props.composition?.kind === 'stat' ? block.props.composition.emphasis : 'standard';
    return (
      <div
        aria-label={block.props.accessibilityName}
        className="rich-step-structured-preview stat"
        data-lodariq-node-type="stat"
        data-lodariq-stat-emphasis={emphasis}
        role="group"
        style={richTextBlockStyle(block)}
        onPointerDown={onActivate}
      >
        {block.content}
      </div>
    );
  }
  if (block.type === 'icon') {
    const iconName =
      block.props.composition?.kind === 'icon' ? block.props.composition.icon : 'info';
    return (
      <div
        aria-label={block.props.accessibilityName ?? block.content}
        className="rich-step-structured-preview icon"
        data-lodariq-node-type="icon"
        role="img"
        style={{
          ...richTextBlockStyle(block),
          justifyContent: structuredContentJustification(block),
        }}
        onPointerDown={onActivate}
      >
        <DynamicIcon aria-hidden="true" name={lucideIconName(iconName)} size={20} strokeWidth={2} />
      </div>
    );
  }
  if (block.type === 'media') {
    return <MediaBlockPreview block={block} controller={controller} />;
  }
  if (block.type === 'list') {
    return (
      <ul
        className="rich-step-list-preview"
        data-lodariq-node-type="list"
        onPointerDown={onActivate}
      >
        {(block.content ?? '')
          .split('\n')
          .filter(Boolean)
          .map((item, index) => (
            <li key={`${block.id}:${index}`}>{item}</li>
          ))}
      </ul>
    );
  }
  const label = BLOCK_EDITOR_INPUT_LABELS[block.type] ?? authoringText('Content label');
  if (block.type === 'button' || block.type === 'link') {
    return (
      <ResizableActionBlockEditor
        actionAlign={actionAlign}
        active={active}
        block={block}
        canvasZoom={canvasZoom}
        controller={controller}
        label={label}
        onActivate={onActivate}
      />
    );
  }
  return (
    <div className={`rich-step-special-block ${block.type}`}>
      <span>{blockTypeEditorLabel(block)}</span>
      <input
        key={`${block.id}:${block.content ?? ''}`}
        aria-label={label}
        defaultValue={block.content ?? ''}
        onFocus={onActivate}
        onBlur={(event) => controller.commitRichTextContent(block.id, event.currentTarget.value)}
      />
    </div>
  );
}

function structuredContentJustification(block: LodariqBlock): CSSProperties['justifyContent'] {
  if (block.props.textStyle?.align === 'center') return 'center';
  if (block.props.textStyle?.align === 'right') return 'flex-end';
  return 'flex-start';
}

function MediaBlockPreview({
  block,
  controller,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
}) {
  const media = block.props.media;
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [captionsUrl, setCaptionsUrl] = useState<string | null>(null);
  const snapshot = controller.getSnapshot();
  const asset = media
    ? snapshot.mediaAssets.find((candidate) => candidate.id === media.assetId)
    : undefined;

  useEffect(() => {
    let canceled = false;
    setSourceUrl(null);
    setCaptionsUrl(null);
    if (!media) return () => undefined;
    void controller.resolveMediaAssetPreview(media.assetId).then((url) => {
      if (!canceled) setSourceUrl(url);
    });
    if (media.kind === 'video' && media.captionsAssetId) {
      void controller.resolveMediaAssetPreview(media.captionsAssetId).then((url) => {
        if (!canceled) setCaptionsUrl(url);
      });
    }
    return () => {
      canceled = true;
    };
  }, [controller, media]);

  if (!media || !sourceUrl) {
    return (
      <div
        aria-label={media?.accessibilityName ?? block.content}
        className="rich-step-media-preview placeholder"
        data-lodariq-node-type="media"
        role="img"
      >
        <ImageIcon aria-hidden="true" size={24} strokeWidth={1.8} />
        <span>{asset?.filename ?? block.content}</span>
      </div>
    );
  }

  if (media.kind === 'image') {
    return (
      <figure
        className="rich-step-media-preview"
        data-fixed-height={media.heightPx ? 'true' : undefined}
        data-lodariq-aspect-ratio={media.aspectRatio}
        data-lodariq-node-type="media"
        style={{ justifySelf: 'start', maxWidth: '100%', width: `${media.widthPercent ?? 100}%` }}
      >
        <img
          alt={media.accessibilityName}
          src={sourceUrl}
          style={{
            ...(media.heightPx ? { height: `${media.heightPx}px` } : {}),
            ...(media.heightPx ? { maxHeight: 'none' } : {}),
            objectFit: media.fit ?? 'contain',
          }}
        />
      </figure>
    );
  }

  return (
    <figure
      className="rich-step-media-preview"
      data-fixed-height={media.heightPx ? 'true' : undefined}
      data-lodariq-aspect-ratio={media.aspectRatio}
      data-lodariq-node-type="media"
      style={{ justifySelf: 'start', maxWidth: '100%', width: `${media.widthPercent ?? 100}%` }}
    >
      <video
        aria-label={media.accessibilityName}
        controls
        preload="metadata"
        src={sourceUrl}
        style={{
          ...(media.heightPx ? { height: `${media.heightPx}px` } : {}),
          ...(media.heightPx ? { maxHeight: 'none' } : {}),
          objectFit: media.fit ?? 'contain',
        }}
      >
        {captionsUrl ? <track default kind="captions" src={captionsUrl} /> : null}
      </video>
    </figure>
  );
}

function ResizableActionBlockEditor({
  actionAlign = 'start',
  active,
  block,
  canvasZoom,
  controller,
  label,
  onActivate,
}: {
  actionAlign?: BlockLayoutProps['align'];
  active: boolean;
  block: LodariqBlock;
  canvasZoom: number;
  controller: LocalAuthoringFrameController;
  label: string;
  onActivate: () => void;
}) {
  const actionStyle = block.props.buttonStyle ?? {};
  const actionRecipe = resolveTourActionRecipe(block.props, defaultActionVariant(block));
  const icon = actionStyle.icon ?? 'none';
  const iconPlacement = actionStyle.iconPlacement ?? 'end';
  const previewRef = useRef<HTMLSpanElement | null>(null);
  const {
    liveWidth,
    reset: resetWidth,
    resizeWithKeyboard,
    resizing,
  } = useActionResize({
    actionAlign,
    actionKey: block.id,
    initialWidth: actionStyle.widthPx ?? null,
    onCommit: (widthPx) =>
      controller.setButtonStyle(block.id, {
        width: 'hug',
        widthPx: widthPx ?? undefined,
      }),
    previewRef,
    zoomPercent: canvasZoom,
  });

  const previewStyle = {
    '--lq-action-fill': actionStyle.fillColor,
    '--lq-action-text': actionStyle.textColor,
    '--lq-action-border': actionStyle.borderColor,
    width: liveWidth ? `${liveWidth}px` : undefined,
  } as CSSProperties;
  const showStartHandle = actionAlign !== 'start';
  const showEndHandle = actionAlign !== 'end';

  return (
    <div className={`rich-step-special-block action ${block.type}`}>
      <span className="rich-step-block-kind">{blockTypeEditorLabel(block)}</span>
      <div className="rich-step-action-stage" data-lodariq-action-align={actionAlign}>
        <span
          className="rich-step-action-preview"
          data-lodariq-action-radius={actionRecipe.radius}
          data-lodariq-action-size={actionRecipe.size}
          data-lodariq-action-variant={actionRecipe.variant}
          data-lodariq-action-width={liveWidth ? 'custom' : actionRecipe.width}
          data-lodariq-block-align={actionAlign}
          data-lodariq-node-type={block.type}
          ref={previewRef}
          style={previewStyle}
        >
          {icon !== 'none' && iconPlacement === 'start' ? <ActionPreviewIcon icon={icon} /> : null}
          <input
            key={`${block.id}:${block.content ?? ''}`}
            aria-label={label}
            defaultValue={block.content ?? ''}
            onFocus={onActivate}
            onBlur={(event) =>
              controller.commitRichTextContent(block.id, event.currentTarget.value)
            }
          />
          {icon !== 'none' && iconPlacement === 'end' ? <ActionPreviewIcon icon={icon} /> : null}
          {active && showStartHandle ? (
            <button
              type="button"
              className="storyboard-action-resize-handle start"
              aria-label={authoringText('Resize {type} from start', {
                type: blockTypeEditorLabel(block),
              })}
              title={authoringText('Drag to resize. Arrow keys resize by 8px; Home resets.')}
              onDoubleClick={resetWidth}
              onKeyDown={(event) => resizeWithKeyboard(event, 'start')}
            />
          ) : null}
          {active && showEndHandle ? (
            <button
              type="button"
              className="storyboard-action-resize-handle end"
              aria-label={authoringText('Resize {type} from end', {
                type: blockTypeEditorLabel(block),
              })}
              title={authoringText('Drag to resize. Arrow keys resize by 8px; Home resets.')}
              onDoubleClick={resetWidth}
              onKeyDown={(event) => resizeWithKeyboard(event, 'end')}
            />
          ) : null}
          {active && resizing && liveWidth ? (
            <output className="storyboard-action-resize-value">
              {liveWidth}
              {authoringText('px')}
            </output>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function ActionPreviewIcon({ icon }: { icon: NonNullable<ButtonStyleProps['icon']> }) {
  if (icon === 'external-link') {
    return <ExternalLink aria-hidden="true" size={14} strokeWidth={2} />;
  }
  if (icon === 'check') return <Check aria-hidden="true" size={14} strokeWidth={2} />;
  return <ChevronRight aria-hidden="true" size={14} strokeWidth={2} />;
}
