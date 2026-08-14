import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { blockText, isEditableContentBlock } from '../utils';
import { ContentField } from './content-field';
import { InlineStepInsert } from './insert-menu';
import { StepChildBlock } from './step-child-block';
import { StepComposer } from './step-composer';

export { TransformControl } from './transform-control';

export function BlockBody({
  block,
  controller,
  dragTargetBlockId,
  dragTargetPosition,
  selectedBlockId,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  dragTargetBlockId?: string | null;
  dragTargetPosition?: 'before' | 'after' | null;
  selectedBlockId?: string | null;
}) {
  if (block.type === 'tourStep') {
    const tooltip = block.children.find((child) => child.type === 'tooltip');
    const fields = (tooltip?.children ?? []).filter(isEditableContentBlock);
    return (
      <div className="step-document" aria-label={authoringText('Step content')}>
        <InlineStepInsert
          controller={controller}
          index={0}
          label={authoringText('Insert content at start of step')}
          stepBlockId={block.id}
        />
        {fields.map((field, index) => (
          <StepChildBlock
            key={field.id}
            block={field}
            controller={controller}
            dropPosition={dragTargetBlockId === field.id ? dragTargetPosition : null}
            index={index}
            selected={selectedBlockId === field.id}
            stepBlockId={block.id}
            total={fields.length}
          />
        ))}
        <StepComposer controller={controller} index={fields.length} stepBlockId={block.id} />
      </div>
    );
  }

  if (isEditableContentBlock(block)) return <ContentField block={block} controller={controller} />;
  const content = blockText(block);
  return <div>{content || block.id}</div>;
}
