import type { BlockLayoutProps, LodariqBlock } from '@lodariq/schema';
import { TEXT_FONT_SIZE_PX_LIMITS } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringNumberCombobox, AuthoringSegmentedControl } from '../design-system';
import { BLOCK_SPACING_OPTIONS } from '../properties/options';
import { TEXT_SIZE_OPTIONS } from './tour-sequence-options';

export function BlockFlowInspector({
  block,
  controller,
  textFontSize,
  onTextFontSizeChange,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  textFontSize?: number | 'default' | 'mixed';
  onTextFontSizeChange?: (value: number | 'default') => void;
}) {
  const layout = block.props.blockLayout ?? {};
  return (
    <section
      className="rich-step-inspector compact"
      aria-label={authoringText('Block spacing')}
      data-has-font-size={onTextFontSizeChange ? 'true' : 'false'}
    >
      <header>
        <strong>{authoringText('Block spacing')}</strong>
        <span>{authoringText('Flow placement')}</span>
      </header>
      {onTextFontSizeChange ? (
        <label className="rich-step-font-size-field">
          <span>{authoringText('Font size')}</span>
          <AuthoringNumberCombobox
            ariaLabel={authoringText('Font size')}
            max={TEXT_FONT_SIZE_PX_LIMITS.max}
            min={TEXT_FONT_SIZE_PX_LIMITS.min}
            onValueChange={(value) => {
              if (value === 'default' || typeof value === 'number') {
                onTextFontSizeChange(value);
              }
            }}
            options={[
              { value: 'default', label: authoringText('Block default') },
              ...TEXT_SIZE_OPTIONS.map((size) => ({
                value: size,
                label: `${size}${authoringText('px')}`,
              })),
            ]}
            placeholder={textFontSize === 'mixed' ? authoringText('Mixed sizes') : undefined}
            step={TEXT_FONT_SIZE_PX_LIMITS.step}
            suffix={authoringText('px')}
            value={textFontSize ?? 'default'}
          />
        </label>
      ) : null}
      <div className="block-spacing-rows">
        <BlockSpacingRow
          label={authoringText('Before')}
          value={layout.spacingBefore ?? 'normal'}
          onChange={(spacingBefore) =>
            controller.setContentBlockLayout(block.id, {
              spacingBefore: spacingBefore as NonNullable<BlockLayoutProps['spacingBefore']>,
            })
          }
        />
        <BlockSpacingRow
          label={authoringText('After')}
          value={layout.spacingAfter ?? 'normal'}
          onChange={(spacingAfter) =>
            controller.setContentBlockLayout(block.id, {
              spacingAfter: spacingAfter as NonNullable<BlockLayoutProps['spacingAfter']>,
              spacingAfterPx: undefined,
            })
          }
        />
      </div>
    </section>
  );
}

function BlockSpacingRow({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="block-spacing-row">
      <span>{label}</span>
      <AuthoringSegmentedControl
        ariaLabel={label}
        onValueChange={onChange}
        options={BLOCK_SPACING_OPTIONS}
        value={value}
      />
    </div>
  );
}
