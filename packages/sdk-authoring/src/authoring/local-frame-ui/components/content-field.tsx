import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import {
  CALLOUT_TONE_VALUES,
  ICON_RECIPE_VALUES,
  MEDIA_ASPECT_RATIO_VALUES,
  STAT_EMPHASIS_VALUES,
  type LodariqBlock,
  type StructuredCompositionPresentation,
} from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringSelect, Image, MousePointer2, Shapes } from '../design-system';
import {
  EDITABLE_ACTION_OPTIONS,
  EDITABLE_BUTTON_VARIANT_OPTIONS,
  EDITABLE_BLOCK_FIELD_CONFIG,
} from '../types';
import { editableActionValue, editableBlockTypeValue, stepContentCommandFromQuery } from '../utils';

type ContentFieldProps = {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  stepBlockId?: string;
  totalStepContent?: number;
};

type FieldConfig = {
  fieldLabel: string;
  placeholder: string;
};

type ContentFieldContext = ContentFieldProps & {
  fieldConfig: FieldConfig;
  label: string;
  value: string;
};

type ContentFieldRenderer = (context: ContentFieldContext) => ReactNode;

const NATIVE_ENTER_BLOCK_TYPES = new Set<string>(['list']);

const CONTENT_FIELD_RENDERERS: Readonly<Record<string, ContentFieldRenderer>> = {
  divider: renderDividerField,
  media: renderMediaField,
  button: renderButtonField,
  link: renderLinkField,
  callout: renderStructuredCompositionField,
  stat: renderStructuredCompositionField,
  icon: renderStructuredCompositionField,
};

export function ContentField(props: ContentFieldProps) {
  const { block } = props;
  const value = block.content ?? '';
  const fieldConfig = fieldConfigForBlockType(block.type);
  const label = fieldConfig.fieldLabel;
  const renderer = CONTENT_FIELD_RENDERERS[block.type] ?? renderTextField;
  return <>{renderer({ ...props, fieldConfig, label, value })}</>;
}

function renderDividerField({ label }: ContentFieldContext): ReactNode {
  return (
    <div className="content-field divider-field" aria-label={label}>
      <span className="field-label">{label}</span>
      <div className="divider-preview" aria-hidden="true" />
    </div>
  );
}

function renderStructuredCompositionField(context: ContentFieldContext): ReactNode {
  const { block, controller } = context;
  return (
    <div className={`structured-composition-field structured-composition-${block.type}`}>
      {renderTextField(context)}
      <StructuredCompositionControls block={block} controller={controller} />
    </div>
  );
}

export function StructuredCompositionControls({
  block,
  controller,
}: Pick<ContentFieldProps, 'block' | 'controller'>) {
  const accessibilityName = block.props.accessibilityName ?? '';
  return (
    <div className="structured-composition-controls">
      {renderStructuredCompositionRecipeControl(block, controller)}
      <label>
        <span>{authoringText('Accessibility name')}</span>
        <input
          aria-label={authoringText('Accessibility name')}
          defaultValue={accessibilityName}
          key={`${block.id}:${accessibilityName}`}
          maxLength={300}
          onBlur={(event) =>
            controller.setStructuredCompositionAccessibilityName(
              block.id,
              event.currentTarget.value,
            )
          }
          type="text"
        />
      </label>
    </div>
  );
}

const STRUCTURED_COMPOSITION_RECIPE_LABELS = {
  info: authoringText('Information'),
  success: authoringText('Success'),
  warning: authoringText('Warning'),
  standard: authoringText('Standard'),
  strong: authoringText('Strong'),
  check: authoringText('Check'),
  star: authoringText('Star'),
  rocket: authoringText('Rocket'),
  search: authoringText('Search'),
  link: authoringText('Link'),
  lock: authoringText('Lock'),
  target: authoringText('Target'),
  settings: authoringText('Settings'),
  heart: authoringText('Heart'),
  sparkles: authoringText('Sparkles'),
  play: authoringText('Play'),
  flag: authoringText('Flag'),
  bell: authoringText('Bell'),
  calendar: authoringText('Calendar'),
} as const;

function renderStructuredCompositionRecipeControl(
  block: LodariqBlock,
  controller: LocalAuthoringFrameController,
): ReactNode {
  const config = structuredCompositionRecipeConfig(block);
  if (!config) return null;
  return (
    <div className="cta-panel structured-composition-recipe-control">
      <span className="cta-panel-label">{authoringText('Style')}</span>
      <AuthoringSelect
        ariaLabel={`${config.label} ${authoringText('Style')}`}
        dataAction="set-structured-composition-style"
        dataBlockId={block.id}
        leadingIcon={block.type === 'icon' ? <Shapes size={15} strokeWidth={2.1} /> : undefined}
        onValueChange={(value) => {
          const composition = config.create(value);
          if (composition) controller.setStructuredCompositionPresentation(block.id, composition);
        }}
        options={config.options}
        search={
          block.type === 'icon'
            ? {
                emptyLabel: authoringText('No matching content'),
                label: authoringText('Search content'),
                placeholder: authoringText('Search'),
              }
            : undefined
        }
        value={config.value}
      />
    </div>
  );
}

interface StructuredCompositionRecipeConfig {
  create: (value: string) => StructuredCompositionPresentation | null;
  label: string;
  options: ReadonlyArray<{ label: string; value: string }>;
  value: string;
}

function structuredCompositionRecipeConfig(
  block: LodariqBlock,
): StructuredCompositionRecipeConfig | null {
  if (block.type === 'callout') {
    return {
      create: (value) =>
        CALLOUT_TONE_VALUES.includes(value as (typeof CALLOUT_TONE_VALUES)[number])
          ? { kind: 'callout', tone: value as (typeof CALLOUT_TONE_VALUES)[number] }
          : null,
      label: authoringText('Callout'),
      options: compositionRecipeOptions(CALLOUT_TONE_VALUES),
      value: block.props.composition?.kind === 'callout' ? block.props.composition.tone : 'info',
    };
  }
  if (block.type === 'stat') {
    return {
      create: (value) =>
        STAT_EMPHASIS_VALUES.includes(value as (typeof STAT_EMPHASIS_VALUES)[number])
          ? { kind: 'stat', emphasis: value as (typeof STAT_EMPHASIS_VALUES)[number] }
          : null,
      label: authoringText('Stat'),
      options: compositionRecipeOptions(STAT_EMPHASIS_VALUES),
      value:
        block.props.composition?.kind === 'stat' ? block.props.composition.emphasis : 'standard',
    };
  }
  if (block.type !== 'icon') return null;
  return {
    create: (value) =>
      ICON_RECIPE_VALUES.includes(value as (typeof ICON_RECIPE_VALUES)[number])
        ? { kind: 'icon', icon: value as (typeof ICON_RECIPE_VALUES)[number] }
        : null,
    label: authoringText('Icon'),
    options: compositionRecipeOptions(ICON_RECIPE_VALUES),
    value: block.props.composition?.kind === 'icon' ? block.props.composition.icon : 'info',
  };
}

function compositionRecipeOptions(
  values: readonly string[],
): ReadonlyArray<{ label: string; value: string }> {
  return values.map((value) => ({
    value,
    label:
      STRUCTURED_COMPOSITION_RECIPE_LABELS[
        value as keyof typeof STRUCTURED_COMPOSITION_RECIPE_LABELS
      ] ?? humanizeRecipeName(value),
  }));
}

function humanizeRecipeName(value: string): string {
  return value
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function renderMediaField(context: ContentFieldContext): ReactNode {
  const { fieldConfig, label, value, block, controller } = context;
  return (
    <div className="content-field media-field">
      <span className="field-label">{label}</span>
      <span className="media-placeholder-icon" aria-hidden="true">
        <Image size={18} strokeWidth={2.1} />
      </span>
      <SyncedInput
        className="block-input block-input-media"
        data-action="edit-content"
        data-block-id={block.id}
        aria-label={label}
        committedValue={value}
        placeholder={fieldConfig.placeholder}
        onKeyDown={contentFieldKeyDownHandler(context)}
      />
      <MediaPresentationControls block={block} controller={controller} />
    </div>
  );
}

export function MediaPresentationControls({
  block,
  controller,
}: Pick<ContentFieldProps, 'block' | 'controller'>) {
  const media = block.props.media;
  const persistedCaptionsAssetId = media?.kind === 'video' ? (media.captionsAssetId ?? '') : '';
  const [kind, setKind] = useState<'image' | 'video'>(media?.kind ?? 'image');
  const [assetId, setAssetId] = useState(media?.assetId ?? '');
  const [accessibilityName, setAccessibilityName] = useState(
    media?.accessibilityName ?? block.content ?? '',
  );
  const [captionsAssetId, setCaptionsAssetId] = useState(persistedCaptionsAssetId);
  const [aspectRatio, setAspectRatio] = useState<'' | (typeof MEDIA_ASPECT_RATIO_VALUES)[number]>(
    media?.aspectRatio ?? '',
  );
  const mediaAssets = controller.getSnapshot().mediaAssets;
  const availableAssets = mediaAssets.filter((asset) => asset.kind === kind);
  const captionsAssets = mediaAssets.filter((asset) => asset.kind === 'captions');
  const canUpload = controller.canUploadMediaAssets();

  useEffect(() => {
    setKind(media?.kind ?? 'image');
    setAssetId(media?.assetId ?? '');
    setAccessibilityName(media?.accessibilityName ?? block.content ?? '');
    setCaptionsAssetId(persistedCaptionsAssetId);
    setAspectRatio(media?.aspectRatio ?? '');
  }, [
    block.content,
    media?.accessibilityName,
    media?.assetId,
    media?.aspectRatio,
    media?.kind,
    persistedCaptionsAssetId,
  ]);

  const commit = (next: {
    kind?: 'image' | 'video';
    assetId?: string;
    accessibilityName?: string;
    captionsAssetId?: string;
    aspectRatio?: '' | (typeof MEDIA_ASPECT_RATIO_VALUES)[number];
  }): void => {
    const nextKind = next.kind ?? kind;
    const nextAssetId = normalizeAssetReference(next.assetId ?? assetId);
    const nextName = (next.accessibilityName ?? accessibilityName).trim().slice(0, 300);
    const nextCaptionsAssetId = normalizeAssetReference(next.captionsAssetId ?? captionsAssetId);
    const nextAspectRatio = next.aspectRatio ?? aspectRatio;
    setKind(nextKind);
    setAssetId(nextAssetId);
    setAccessibilityName(nextName);
    setCaptionsAssetId(nextKind === 'video' ? nextCaptionsAssetId : '');
    setAspectRatio(nextAspectRatio);
    if (!nextAssetId || !nextName) return;
    if (nextKind === 'video') {
      controller.setMediaPresentation(block.id, {
        kind: nextKind,
        assetId: nextAssetId,
        accessibilityName: nextName,
        ...(nextCaptionsAssetId ? { captionsAssetId: nextCaptionsAssetId } : {}),
        ...(nextAspectRatio ? { aspectRatio: nextAspectRatio } : {}),
      });
      return;
    }
    controller.setMediaPresentation(block.id, {
      kind: nextKind,
      assetId: nextAssetId,
      accessibilityName: nextName,
      ...(nextAspectRatio ? { aspectRatio: nextAspectRatio } : {}),
    });
  };
  return (
    <div className="media-presentation-controls">
      <label>
        <span>{authoringText('Media type')}</span>
        <AuthoringSelect
          ariaLabel={authoringText('Media type')}
          dataAction="set-media-type"
          dataBlockId={block.id}
          leadingIcon={<Image size={15} strokeWidth={2.1} />}
          onValueChange={(value) => commit({ kind: value as 'image' | 'video', assetId: '' })}
          options={[
            { value: 'image', label: authoringText('Image') },
            { value: 'video', label: authoringText('Video with captions') },
          ]}
          value={kind}
        />
      </label>
      <label>
        <span>{authoringText('Asset reference')}</span>
        <AuthoringSelect
          ariaLabel={authoringText('Asset reference')}
          dataAction="set-media-asset"
          dataBlockId={block.id}
          onValueChange={(value) => commit({ assetId: value })}
          options={[
            { value: '', label: authoringText('Choose an uploaded asset') },
            ...availableAssets.map((asset) => ({ value: asset.id, label: asset.filename })),
          ]}
          value={assetId}
        />
        {canUpload ? (
          <MediaUploadControl
            accept={
              kind === 'image'
                ? 'image/png,image/jpeg,image/gif,image/webp'
                : 'video/mp4,video/webm'
            }
            ariaLabel={authoringText('Choose an uploaded asset')}
            onFile={(file) => {
              void controller.uploadMediaAsset(kind, file).then((asset) => {
                if (asset)
                  commit({
                    assetId: asset.id,
                    accessibilityName: accessibilityName || file.name,
                  });
              });
            }}
          />
        ) : null}
      </label>
      <label>
        <span>{authoringText('Accessibility description')}</span>
        <input
          aria-label={authoringText('Accessibility description')}
          className="ui-input"
          onBlur={(event) => commit({ accessibilityName: event.currentTarget.value })}
          onChange={(event) => setAccessibilityName(event.currentTarget.value)}
          type="text"
          value={accessibilityName}
        />
      </label>
      <label>
        <span>{authoringText('Aspect ratio')}</span>
        <AuthoringSelect
          ariaLabel={authoringText('Aspect ratio')}
          dataAction="set-media-aspect-ratio"
          dataBlockId={block.id}
          onValueChange={(value) =>
            commit({
              aspectRatio: value as '' | (typeof MEDIA_ASPECT_RATIO_VALUES)[number],
            })
          }
          options={[
            { value: '', label: authoringText('Original') },
            ...MEDIA_ASPECT_RATIO_VALUES.map((value) => ({ value, label: value })),
          ]}
          value={aspectRatio}
        />
      </label>
      {kind === 'video' ? (
        <label>
          <span>{authoringText('Captions asset for video')}</span>
          <AuthoringSelect
            ariaLabel={authoringText('Captions asset for video')}
            data-media-captions
            dataAction="set-media-captions"
            dataBlockId={block.id}
            onValueChange={(value) => commit({ captionsAssetId: value })}
            options={[
              { value: '', label: authoringText('Choose a captions file') },
              ...captionsAssets.map((asset) => ({ value: asset.id, label: asset.filename })),
            ]}
            value={captionsAssetId}
          />
          {canUpload ? (
            <MediaUploadControl
              accept="text/vtt,.vtt"
              ariaLabel={authoringText('Choose a captions file')}
              onFile={(file) => {
                void controller.uploadMediaAsset('captions', file).then((asset) => {
                  if (asset) commit({ captionsAssetId: asset.id });
                });
              }}
            />
          ) : null}
        </label>
      ) : null}
      {!media ? (
        <span className="media-placeholder-state">{authoringText('Add media later')}</span>
      ) : null}
      {!canUpload ? (
        <span className="media-placeholder-state">
          {authoringText('Media upload is unavailable in this preview')}
        </span>
      ) : null}
    </div>
  );
}

function MediaUploadControl({
  accept,
  ariaLabel,
  onFile,
}: {
  accept: string;
  ariaLabel: string;
  onFile: (file: File) => void;
}) {
  return (
    <label className="media-upload-control">
      <Image size={14} strokeWidth={2.1} aria-hidden="true" />
      <span>{authoringText('Upload media asset')}</span>
      <input
        accept={accept}
        aria-label={ariaLabel}
        className="visually-hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = '';
        }}
        type="file"
      />
    </label>
  );
}

function normalizeAssetReference(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/gu, '-')
    .slice(0, 160);
}

function renderButtonField(context: ContentFieldContext): ReactNode {
  const { block, controller } = context;
  return (
    <div className={`button-field-shell ${fieldStateClass(Boolean(block.props.action?.type))}`}>
      {renderSingleLineField(context, 'button-label-field', 'block-input-button')}
      <div className="button-config-row">
        <ButtonStyleControl block={block} controller={controller} />
        <ButtonActionControl block={block} controller={controller} />
      </div>
    </div>
  );
}

function ButtonStyleControl({
  block,
  controller,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
}) {
  const variant = block.props.variant ?? 'primary';
  return (
    <div className="cta-panel button-style-control">
      <span className="cta-panel-label">{authoringText('Style')}</span>
      <AuthoringSelect
        ariaLabel={authoringText('Button style')}
        dataAction="set-button-style"
        dataBlockId={block.id}
        onValueChange={(value) => {
          const next = EDITABLE_BUTTON_VARIANT_OPTIONS.find((option) => option.value === value);
          if (next) controller.setButtonVariant(block.id, next.value);
        }}
        options={EDITABLE_BUTTON_VARIANT_OPTIONS}
        value={variant}
      />
    </div>
  );
}

function renderLinkField(context: ContentFieldContext): ReactNode {
  const { block, controller } = context;
  return (
    <div
      className={`button-field-shell link-field-shell ${fieldStateClass(
        Boolean(block.props.action?.type === 'openPage' && block.props.action.url),
      )}`}
    >
      {renderSingleLineField(context, 'button-label-field', 'block-input-link')}
      <ActionUrlField block={block} controller={controller} />
    </div>
  );
}

function renderTextField(context: ContentFieldContext): ReactNode {
  const { block, fieldConfig, label, value } = context;
  return (
    <label className={`content-field content-field-${block.type}`}>
      <span className="field-label">{label}</span>
      <SyncedTextarea
        className={`block-input block-input-${block.type}`}
        data-action="edit-content"
        data-block-id={block.id}
        aria-label={label}
        committedValue={value}
        placeholder={fieldConfig.placeholder}
        onKeyDown={contentFieldKeyDownHandler(context)}
        rows={1}
      />
    </label>
  );
}

function renderSingleLineField(
  context: ContentFieldContext,
  fieldClassName: string,
  inputClassName: string,
): ReactNode {
  const { block, fieldConfig, label, value } = context;
  return (
    <label className={`content-field ${fieldClassName}`}>
      <span className="field-label">{label}</span>
      <SyncedInput
        className={`block-input ${inputClassName}`}
        data-action="edit-content"
        data-block-id={block.id}
        aria-label={label}
        committedValue={value}
        placeholder={fieldConfig.placeholder}
        onKeyDown={contentFieldKeyDownHandler(context)}
      />
    </label>
  );
}

function contentFieldKeyDownHandler({
  block,
  controller,
  stepBlockId,
  totalStepContent,
}: ContentFieldContext): (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void {
  return (event) =>
    handleStepContentFieldKeyDown(event, {
      blockId: block.id,
      blockType: block.type,
      controller,
      stepBlockId,
      totalStepContent,
    });
}

function fieldStateClass(ready: boolean): 'ready' | 'incomplete' {
  return ready ? 'ready' : 'incomplete';
}

function handleStepContentFieldKeyDown(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  {
    blockId,
    blockType,
    controller,
    stepBlockId,
    totalStepContent,
  }: {
    blockId: string;
    blockType: LodariqBlock['type'];
    controller: LocalAuthoringFrameController;
    stepBlockId?: string;
    totalStepContent?: number;
  },
): void {
  if (!stepBlockId) return;
  const rawValue = event.currentTarget.value;
  const selectionStart = event.currentTarget.selectionStart ?? rawValue.length;
  const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart;
  const collapsedSelection = selectionStart === selectionEnd;
  const hasNavigationModifier = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
  if (
    event.key === 'ArrowUp' &&
    collapsedSelection &&
    selectionStart === 0 &&
    !hasNavigationModifier
  ) {
    if (controller.focusPreviousStepContentBlock(stepBlockId, blockId)) {
      event.preventDefault();
    }
    return;
  }
  if (
    event.key === 'ArrowDown' &&
    collapsedSelection &&
    selectionEnd === rawValue.length &&
    !hasNavigationModifier
  ) {
    if (controller.focusNextStepContentBlock(stepBlockId, blockId)) {
      event.preventDefault();
    }
    return;
  }
  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    const currentValue = event.currentTarget.value.trim();
    const inlineCommand = currentValue.startsWith('/')
      ? stepContentCommandFromQuery(currentValue)
      : null;
    if (inlineCommand) {
      event.preventDefault();
      controller.applyStepContentCommand(stepBlockId, blockId, inlineCommand);
      return;
    }
    if (usesNativeEnterForNewLine(blockType)) return;
    event.preventDefault();
    const isTextLine = event.currentTarget instanceof HTMLTextAreaElement;
    const currentLineValue = isTextLine ? rawValue.slice(0, selectionStart) : rawValue;
    const nextLineValue = isTextLine ? rawValue.slice(selectionEnd) : '';
    controller.continueStepContentBlock(stepBlockId, blockId, currentLineValue, nextLineValue);
    return;
  }
  if (event.key !== 'Backspace' || (totalStepContent ?? 0) <= 1) return;
  if (selectionStart !== 0 || selectionEnd !== 0) {
    return;
  }
  if (event.currentTarget.value.trim().length > 0) {
    if (controller.mergeStepContentBlockIntoPrevious(stepBlockId, blockId)) {
      event.preventDefault();
      return;
    }
    if (controller.focusPreviousStepContentBlock(stepBlockId, blockId)) {
      event.preventDefault();
    }
    return;
  }
  event.preventDefault();
  controller.deleteEmptyStepContentBlock(stepBlockId, blockId);
}

function usesNativeEnterForNewLine(blockType: LodariqBlock['type']): boolean {
  return NATIVE_ENTER_BLOCK_TYPES.has(blockType);
}

function ButtonActionControl({
  block,
  controller,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
}) {
  const action = block.props.action?.type ?? '';
  const ready = action !== '';
  return (
    <div className={`cta-panel ${fieldStateClass(ready)}`.trim()}>
      <span className="cta-panel-icon" aria-hidden="true">
        <MousePointer2 size={14} strokeWidth={2.2} />
      </span>
      <span className="cta-panel-label">{authoringText('Then')}</span>
      <AuthoringSelect
        ariaLabel={authoringText('After click')}
        dataAction="set-action"
        dataBlockId={block.id}
        onValueChange={(value) => handleButtonActionChange(value, block, controller)}
        options={EDITABLE_ACTION_OPTIONS}
        value={action}
      />
      {showsActionUrlField(action) ? (
        <ActionUrlField block={block} controller={controller} />
      ) : null}
    </div>
  );
}

function handleButtonActionChange(
  value: string,
  block: LodariqBlock,
  controller: LocalAuthoringFrameController,
): void {
  const actionType = editableActionValue(value);
  if (actionType === null) return;
  controller.setButtonAction(block.id, actionType);
}

function fieldConfigForBlockType(type: LodariqBlock['type']): FieldConfig {
  const editableType = editableBlockTypeValue(type);
  return editableType ? EDITABLE_BLOCK_FIELD_CONFIG[editableType] : FALLBACK_FIELD_CONFIG;
}

const FALLBACK_FIELD_CONFIG = {
  fieldLabel: authoringText('Body text'),
  placeholder: authoringText('Write supporting copy'),
} as const satisfies { fieldLabel: string; placeholder: string };

function ActionUrlField({
  block,
  controller,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
}) {
  const value = actionUrlValue(block);
  return (
    <label className="content-field action-url-field">
      <span className="field-label">{authoringText('Page URL')}</span>
      <SyncedInput
        className="block-input block-input-url"
        data-action="edit-action-url"
        data-block-id={block.id}
        aria-label={authoringText('Page URL')}
        committedValue={value}
        placeholder={authoringText('/settings')}
        onKeyDown={(event) => handleActionUrlKeyDown(event, block, controller)}
      />
    </label>
  );
}

function actionUrlValue(block: LodariqBlock): string {
  if (block.props.action?.type !== 'openPage') return '';
  return block.props.action.url ?? '';
}

function showsActionUrlField(action: string): boolean {
  return action === 'openPage';
}

function handleActionUrlKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  block: LodariqBlock,
  controller: LocalAuthoringFrameController,
): void {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  controller.setActionUrl(block.id, event.currentTarget.value);
}

type SyncedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'defaultValue' | 'value'> & {
  committedValue: string;
};

type SyncedTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'defaultValue' | 'value'
> & {
  committedValue: string;
};

function SyncedInput({ committedValue, ...props }: SyncedInputProps) {
  const ref = useCommittedValueRef<HTMLInputElement>(committedValue);
  return <input {...props} ref={ref} defaultValue={committedValue} />;
}

function SyncedTextarea({ committedValue, ...props }: SyncedTextareaProps) {
  const ref = useCommittedValueRef<HTMLTextAreaElement>(committedValue);
  return <textarea {...props} ref={ref} defaultValue={committedValue} />;
}

function useCommittedValueRef<T extends HTMLInputElement | HTMLTextAreaElement>(
  committedValue: string,
) {
  const ref = useRef<T | null>(null);
  const previousCommittedValueRef = useRef(committedValue);

  useLayoutEffect(() => {
    const node = ref.current;
    const previousCommittedValue = previousCommittedValueRef.current;
    previousCommittedValueRef.current = committedValue;
    if (!node || node.value === committedValue) return;

    const isFocused = node.ownerDocument.activeElement === node;
    if (!isFocused || node.value === previousCommittedValue) {
      node.value = committedValue;
    }
  }, [committedValue]);

  return ref;
}
