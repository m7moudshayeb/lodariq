import {
  useLayoutEffect,
  useRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringSelect, Image, MousePointer2 } from '../design-system';
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

function renderMediaField(context: ContentFieldContext): ReactNode {
  const { fieldConfig, label, value, block, controller } = context;
  const media = block.props.media;
  const kind = media?.kind ?? 'image';
  const assetId = media?.assetId ?? '';
  const accessibilityName = media?.accessibilityName ?? value;
  const commit = (next: {
    kind?: 'image' | 'video';
    assetId?: string;
    accessibilityName?: string;
    captionsAssetId?: string;
  }): void => {
    const nextKind = next.kind ?? kind;
    const nextAssetId = normalizeAssetReference(next.assetId ?? assetId);
    const nextName = (next.accessibilityName ?? accessibilityName).trim().slice(0, 300);
    if (!nextAssetId || !nextName) {
      controller.setMediaPresentation(block.id, undefined);
      return;
    }
    if (nextKind === 'video') {
      const captionsAssetId = normalizeAssetReference(
        next.captionsAssetId ?? (media?.kind === 'video' ? media.captionsAssetId : ''),
      );
      if (!captionsAssetId) return;
      controller.setMediaPresentation(block.id, {
        kind: nextKind,
        assetId: nextAssetId,
        accessibilityName: nextName,
        captionsAssetId,
      });
      return;
    }
    controller.setMediaPresentation(block.id, {
      kind: nextKind,
      assetId: nextAssetId,
      accessibilityName: nextName,
    });
  };
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
      <label>
        <span>{authoringText('Media type')}</span>
        <select
          aria-label={authoringText('Media type')}
          onChange={(event) =>
            commit({
              kind: event.currentTarget.value as 'image' | 'video',
              captionsAssetId:
                event.currentTarget
                  .closest('.media-field')
                  ?.querySelector<HTMLInputElement>('[data-media-captions]')?.value ?? '',
            })
          }
          value={kind}
        >
          <option value="image">{authoringText('Image')}</option>
          <option value="video">{authoringText('Video with captions')}</option>
        </select>
      </label>
      <label>
        <span>{authoringText('Asset reference')}</span>
        <input
          aria-label={authoringText('Asset reference')}
          defaultValue={assetId}
          onBlur={(event) => commit({ assetId: event.currentTarget.value })}
          placeholder={authoringText('Choose an uploaded asset')}
          type="text"
        />
      </label>
      <label>
        <span>{authoringText('Accessibility description')}</span>
        <input
          aria-label={authoringText('Accessibility description')}
          defaultValue={accessibilityName}
          onBlur={(event) => commit({ accessibilityName: event.currentTarget.value })}
          type="text"
        />
      </label>
      <label>
        <span>{authoringText('Captions asset for video')}</span>
        <input
          aria-label={authoringText('Captions asset for video')}
          data-media-captions
          defaultValue={media?.kind === 'video' ? media.captionsAssetId : ''}
          onBlur={(event) => {
            if (kind === 'video') commit({ captionsAssetId: event.currentTarget.value });
          }}
          placeholder={authoringText('Choose a captions file')}
          type="text"
        />
      </label>
      {!media ? (
        <span className="media-placeholder-state">{authoringText('Add media later')}</span>
      ) : null}
    </div>
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
