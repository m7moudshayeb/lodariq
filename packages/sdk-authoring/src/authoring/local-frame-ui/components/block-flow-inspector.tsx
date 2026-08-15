import type { LodariqBlock } from '@lodariq/schema';
import { RichContentEditor } from '../../../editor';
import type { LocalAuthoringFrameController } from '../controller';

const RICH_CONTENT_BLOCK_TYPES = new Set<LodariqBlock['type']>([
  'paragraph',
  'heading',
  'list',
  'divider',
  'media',
  'callout',
  'stat',
  'icon',
]);

export function BlockFlowInspector({
  controller,
  stepBlockId,
  tooltip,
}: {
  activeBlock: LodariqBlock;
  controller: LocalAuthoringFrameController;
  stepBlockId: string;
  tooltip: LodariqBlock;
}) {
  const value = tooltip.children.filter((block) => RICH_CONTENT_BLOCK_TYPES.has(block.type));
  return (
    <RichContentEditor
      onChange={(next) => controller.replaceStepRichContent(stepBlockId, next)}
      onResolveMediaPreview={(assetId) => controller.resolveMediaAssetPreview(assetId)}
      onUploadMedia={
        controller.canUploadMediaAssets()
          ? async (kind, file, options) => {
              const asset = await controller.uploadMediaAsset(kind, file, options);
              if (!asset) return null;
              return {
                asset,
                previewUrl: await controller.resolveMediaAssetPreview(asset.id),
              };
            }
          : undefined
      }
      value={value}
    />
  );
}
