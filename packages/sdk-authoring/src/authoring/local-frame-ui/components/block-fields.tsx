import type { TalmehBlock } from '@talmeh/schema';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringSelect } from '../design-system';
import { blockText, blockTypeLabel, isEditableContentBlock } from '../utils';

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
      <div className="step-fields">
        {fields.map((field) => (
          <ContentField key={field.id} block={field} controller={controller} />
        ))}
      </div>
    );
  }

  if (isEditableContentBlock(block)) return <ContentField block={block} controller={controller} />;
  const content = blockText(block);
  return <div>{content || block.id}</div>;
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
    block.type === 'heading' ? 'Heading' : block.type === 'button' ? 'Button label' : 'Body text';

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
  return (
    <div className="button-action-control">
      <span className="property-label">On click</span>
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
          { value: '', label: 'Choose action' },
          { value: 'next', label: 'Go to next step' },
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
        if (value === 'paragraph' || value === 'heading' || value === 'button') {
          controller.transformEditableBlock(block.id, value);
        }
      }}
      options={(['paragraph', 'heading', 'button'] as const).map((type) => ({
        value: type,
        label: blockTypeLabel(type),
      }))}
      value={block.type}
    />
  );
}
