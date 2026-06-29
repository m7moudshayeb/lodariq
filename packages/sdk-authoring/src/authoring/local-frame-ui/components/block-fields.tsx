import type { TalmehBlock } from '@talmeh/schema';
import type { LocalAuthoringFrameController } from '../controller';
import { ArrowDown, ArrowUp, AuthoringButton, AuthoringSelect, Image } from '../design-system';
import { blockText, blockTypeLabel, isEditableContentBlock } from '../utils';
import { InlineStepInsert } from './insert-menu';

export function BlockBody({
  block,
  controller,
}: {
  block: TalmehBlock;
  controller: LocalAuthoringFrameController;
}) {
  if (block.type === 'tourStep') {
    const tooltip = block.children.find((child) => child.type === 'tooltip');
    const fields = (tooltip?.children ?? []).filter(isEditableContentBlock);
    return (
      <div className="step-document" aria-label="Step content">
        <InlineStepInsert
          controller={controller}
          index={0}
          label="Insert content at start of step"
          stepBlockId={block.id}
        />
        {fields.map((field, index) => (
          <StepChildBlock
            key={field.id}
            block={field}
            controller={controller}
            index={index}
            stepBlockId={block.id}
            total={fields.length}
          />
        ))}
      </div>
    );
  }

  if (isEditableContentBlock(block)) return <ContentField block={block} controller={controller} />;
  const content = blockText(block);
  return <div>{content || block.id}</div>;
}

function StepChildBlock({
  block,
  controller,
  index,
  stepBlockId,
  total,
}: {
  block: TalmehBlock;
  controller: LocalAuthoringFrameController;
  index: number;
  stepBlockId: string;
  total: number;
}) {
  return (
    <div
      className={`step-child step-child-${block.type}`.trim()}
      data-block-id={block.id}
      data-block-type={block.type}
    >
      <div className="step-child-toolbar">
        <span>{blockTypeLabel(block.type)}</span>
        <div className="step-child-actions">
          <AuthoringButton
            aria-label="Move step content up"
            className="step-child-action"
            icon={<ArrowUp size={13} strokeWidth={2.25} />}
            onClick={() => controller.moveStepContentBlock(stepBlockId, block.id, 'up')}
          />
          <AuthoringButton
            aria-label="Move step content down"
            className="step-child-action"
            icon={<ArrowDown size={13} strokeWidth={2.25} />}
            onClick={() => controller.moveStepContentBlock(stepBlockId, block.id, 'down')}
          />
          <TransformControl block={block} controller={controller} />
        </div>
      </div>
      <ContentField block={block} controller={controller} />
      <InlineStepInsert
        controller={controller}
        index={index + 1}
        label={index + 1 >= total ? 'Insert content at end of step' : 'Insert content after block'}
        stepBlockId={stepBlockId}
      />
    </div>
  );
}

function ContentField({
  block,
  controller,
}: {
  block: TalmehBlock;
  controller: LocalAuthoringFrameController;
}) {
  const value = block.content ?? '';
  const label =
    block.type === 'heading'
      ? 'Heading'
      : block.type === 'button'
        ? 'Button label'
        : block.type === 'media'
          ? 'Media placeholder'
          : 'Body text';

  if (block.type === 'media') {
    return (
      <label className="content-field media-field">
        <span className="field-label">{label}</span>
        <span className="media-placeholder-icon" aria-hidden="true">
          <Image size={18} strokeWidth={2.1} />
        </span>
        <input
          key={`${block.id}:${value}`}
          className="block-input"
          data-action="edit-content"
          data-block-id={block.id}
          aria-label={label}
          placeholder="Media placeholder"
          defaultValue={value}
        />
        <span className="media-placeholder-state">Placeholder only</span>
      </label>
    );
  }

  return (
    <>
      <label className="content-field">
        <span className="field-label">{label}</span>
        {block.type === 'paragraph' ? (
          <textarea
            key={`${block.id}:${value}`}
            className="block-input"
            data-action="edit-content"
            data-block-id={block.id}
            aria-label={label}
            placeholder="Write supporting copy"
            defaultValue={value}
          />
        ) : (
          <input
            key={`${block.id}:${value}`}
            className="block-input"
            data-action="edit-content"
            data-block-id={block.id}
            aria-label={label}
            placeholder={block.type === 'button' ? 'Button label' : 'Untitled heading'}
            defaultValue={value}
          />
        )}
      </label>
      {block.type === 'button' ? (
        <ButtonActionControl block={block} controller={controller} />
      ) : null}
    </>
  );
}

function ButtonActionControl({
  block,
  controller,
}: {
  block: TalmehBlock;
  controller: LocalAuthoringFrameController;
}) {
  const action = block.props.action?.type ?? '';
  const purpose =
    action === 'next'
      ? 'Continue to next step'
      : action === 'clickTarget'
        ? 'Wait for target click'
        : action === 'dismiss'
          ? 'Close tour'
          : 'No purpose selected';
  const ready = action !== '';
  return (
    <div className={`cta-panel ${ready ? 'ready' : 'incomplete'}`.trim()}>
      <div className="cta-panel-copy">
        <span className="property-label">CTA</span>
        <strong>{purpose}</strong>
        <small>{ready ? 'Ready' : 'Needs purpose'}</small>
      </div>
      <AuthoringSelect
        ariaLabel="Button action"
        dataAction="set-action"
        dataBlockId={block.id}
        onValueChange={(value) => {
          if (value === '' || value === 'next' || value === 'clickTarget' || value === 'dismiss') {
            controller.setButtonAction(block.id, value);
          }
        }}
        options={[
          { value: '', label: 'Choose purpose' },
          { value: 'next', label: 'Continue to next step' },
          { value: 'clickTarget', label: 'Wait for target click' },
          { value: 'dismiss', label: 'Close tour' },
        ]}
        value={action}
      />
    </div>
  );
}

export function TransformControl({
  block,
  controller,
}: {
  block: TalmehBlock;
  controller: LocalAuthoringFrameController;
}) {
  if (!isEditableContentBlock(block)) return null;
  return (
    <AuthoringSelect
      ariaLabel="Transform block"
      dataAction="transform-block"
      dataBlockId={block.id}
      onValueChange={(value) => {
        if (
          value === 'paragraph' ||
          value === 'heading' ||
          value === 'button' ||
          value === 'media'
        ) {
          controller.transformEditableBlock(block.id, value);
        }
      }}
      options={(['paragraph', 'heading', 'button', 'media'] as const).map((type) => ({
        value: type,
        label: blockTypeLabel(type),
      }))}
      value={block.type}
    />
  );
}
