import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringSelect } from '../design-system';
import { EDITABLE_BLOCK_TYPES } from '../types';
import { blockTypeLabel, editableBlockTypeValue, isEditableContentBlock } from '../utils';

export function TransformControl({
  block,
  controller,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
}) {
  if (!isEditableContentBlock(block)) return null;
  return (
    <AuthoringSelect
      ariaLabel={authoringText('Change content format')}
      dataAction="transform-block"
      dataBlockId={block.id}
      onValueChange={(value) => handleTransformChange(value, block, controller)}
      options={EDITABLE_BLOCK_TYPES.map((type) => ({
        value: type,
        label: blockTypeLabel(type),
      }))}
      value={block.type}
    />
  );
}

function handleTransformChange(
  value: string,
  block: LodariqBlock,
  controller: LocalAuthoringFrameController,
): void {
  const blockType = editableBlockTypeValue(value);
  if (!blockType) return;
  controller.transformEditableBlock(block.id, blockType);
}
