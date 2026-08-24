import type { CSSProperties, ReactNode } from 'react';
import type { ButtonStyleProps, LodariqBlock } from '@lodariq/schema';
import {
  resolveTourActionRecipe,
  resolveTourCompositionRecipe,
  resolveTourPopupStyleRecipe,
  resolveTourThemeStyle,
  tourCompositionPaddingVariables,
  tourPopupStyleVariables,
} from '@lodariq/sdk-runtime/renderers/tour';
import { ArrowRight, Check, ExternalLink } from '../design-system';
import { defaultActionVariant } from '../properties/button-properties';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { blockDisplayTitle } from '../utils';

export function StepPresentationPreview({
  motionReplayKey,
  snapshot,
  step,
  tooltip,
}: {
  motionReplayKey: number;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  tooltip: LodariqBlock;
}) {
  const motion = step.props.motion;
  const composition = resolveTourCompositionRecipe(tooltip.props.tooltipLayout);
  const appearance = resolveTourPopupStyleRecipe(tooltip.props.tooltipStyle);
  const resolvedTheme = resolveTourThemeStyle(
    {
      ...(snapshot.documentState.appearance
        ? { appearance: snapshot.documentState.appearance }
        : {}),
      ...(snapshot.previewTheme ? { theme: snapshot.previewTheme } : {}),
    },
    snapshot.previewPreferences?.prefersDark ?? false,
    snapshot.previewPreferences?.prefersReducedMotion ?? false,
  );
  const previewStyle = {
    ...resolvedTheme.variables,
    ...tourPopupStyleVariables(appearance),
    ...tourCompositionPaddingVariables(composition),
    '--lq-preview-motion-duration': `${motion?.durationMs ?? 240}ms`,
    ...(composition.widthPx ? { '--lq-preview-popup-width': `${composition.widthPx}px` } : {}),
    ...(composition.heightPx ? { '--lq-preview-popup-height': `${composition.heightPx}px` } : {}),
  } as CSSProperties;

  return (
    <article
      aria-label={step.props.accessibilityName}
      className="step-presentation-preview-card"
      data-lodariq-action-align={composition.actionAlign}
      data-lodariq-action-layout={composition.actionLayout}
      data-lodariq-composition-gap={composition.gap}
      data-lodariq-composition-padding={composition.padding}
      data-lodariq-content-align={composition.contentAlign}
      data-lodariq-popup-border-weight={appearance.borderWeight}
      data-lodariq-popup-elevation={appearance.elevation}
      data-lodariq-popup-height={composition.heightPx ? 'custom' : 'theme'}
      data-lodariq-popup-radius={composition.radius}
      data-lodariq-popup-width={composition.widthPx ? 'custom' : 'theme'}
      data-motion={motion?.recipe ?? 'none'}
      key={`${motion?.recipe ?? 'none'}-${motion?.durationMs ?? 0}-${motionReplayKey}`}
      style={previewStyle}
    >
      {tooltip.children.map((block) => (
        <PreviewBlock block={block} key={block.id} />
      ))}
    </article>
  );
}

function PreviewBlock({ block }: { block: LodariqBlock }) {
  const content = block.content?.trim() || blockDisplayTitle(block);
  if (block.type === 'heading' || block.type === 'paragraph') {
    return (
      <div
        className={`step-presentation-preview-copy ${block.type}`}
        data-lodariq-node-type={block.type}
        style={previewTextStyle(block)}
      >
        {content}
      </div>
    );
  }
  if (block.type === 'list') {
    return (
      <ul className="step-presentation-preview-list">
        {listItems(block.content).map((item, index) => (
          <li key={`${block.id}-${index}`}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === 'divider') {
    return <div className="step-presentation-preview-divider" role="separator" />;
  }
  if (block.type === 'button' || block.type === 'link') {
    return <PreviewAction block={block}>{content}</PreviewAction>;
  }
  return <div className="step-presentation-preview-copy supporting">{content}</div>;
}

function PreviewAction({ block, children }: { block: LodariqBlock; children: ReactNode }) {
  const recipe = resolveTourActionRecipe(block.props, defaultActionVariant(block));
  const style = block.props.buttonStyle;
  const actionStyle = {
    '--lq-action-fill': style?.fillColor,
    '--lq-action-text': style?.textColor,
    '--lq-action-border': style?.borderColor,
    ...(recipe.widthPx
      ? {
          '--lq-action-width': `${recipe.widthPx}px`,
          width: `min(100%, ${recipe.widthPx}px)`,
        }
      : {}),
  } as CSSProperties;
  const icon = style?.icon ?? 'none';
  const iconPlacement = style?.iconPlacement ?? 'end';

  return (
    <div
      className="step-presentation-preview-action-stage"
      data-lodariq-action-align={recipe.align}
    >
      <span
        className="rich-step-action-preview step-presentation-preview-action"
        data-lodariq-action-radius={recipe.radius}
        data-lodariq-action-size={recipe.size}
        data-lodariq-action-variant={recipe.variant}
        data-lodariq-action-width={recipe.widthPx ? 'custom' : recipe.width}
        style={actionStyle}
      >
        {iconPlacement === 'start' ? <PreviewActionIcon icon={icon} /> : null}
        <span className="step-presentation-preview-action-label">{children}</span>
        {iconPlacement === 'end' ? <PreviewActionIcon icon={icon} /> : null}
      </span>
    </div>
  );
}

function PreviewActionIcon({ icon }: { icon: NonNullable<ButtonStyleProps['icon']> }) {
  const iconProps = { 'aria-hidden': true, size: 12, strokeWidth: 2 } as const;
  if (icon === 'arrow-right') return <ArrowRight {...iconProps} />;
  if (icon === 'check') return <Check {...iconProps} />;
  if (icon === 'external-link') return <ExternalLink {...iconProps} />;
  return null;
}

function previewTextStyle(block: LodariqBlock): CSSProperties {
  const textStyle = block.props.textStyle;
  return {
    color: textStyle?.color,
    fontSize: textStyle?.fontSizePx ? `${textStyle.fontSizePx}px` : undefined,
    fontStyle: textStyle?.fontStyle,
    fontWeight: textStyle?.fontWeight,
    textAlign: textStyle?.align,
  };
}

function listItems(content: string | undefined): string[] {
  return (content ?? '')
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
}
