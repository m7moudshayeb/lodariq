import { useState } from 'react';
import type { LodariqBlock, TourMotionPresentation } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringRange, AuthoringTextField, RefreshCcw } from '../design-system';
import { PropertyChoiceField } from '../properties/property-controls';
import { SequencePropertyEditor } from '../properties/sequence-property-editor';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { StepPresentationPreview } from './step-presentation-preview';

type PresentationSection = 'motion' | 'spotlight' | 'responsive' | 'accessibility' | 'automatic';

const PRESENTATION_SECTIONS = [
  { value: 'motion', label: authoringText('Motion recipe') },
  { value: 'spotlight', label: authoringText('Spotlight emphasis') },
  { value: 'responsive', label: authoringText('Compact action layout') },
  { value: 'accessibility', label: authoringText('Step accessibility name') },
  { value: 'automatic', label: authoringText('Automatic step sequence') },
] as const satisfies ReadonlyArray<{ value: PresentationSection; label: string }>;

const MOTION_OPTIONS = [
  { value: 'none', label: authoringText('No step motion') },
  { value: 'fade', label: authoringText('Fade') },
  { value: 'lift', label: authoringText('Lift') },
  { value: 'scale', label: authoringText('Scale') },
  { value: 'pulse', label: authoringText('Pulse') },
] as const;

const SPOTLIGHT_OPTIONS = [
  { value: 'none', label: authoringText('No spotlight emphasis') },
  { value: 'subtle', label: authoringText('Subtle spotlight') },
  { value: 'standard', label: authoringText('Standard spotlight') },
  { value: 'strong', label: authoringText('Strong spotlight') },
] as const;

export function StepPresentationInspector({
  controller,
  snapshot,
  step,
  steps,
  tooltip,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  steps: readonly LodariqBlock[];
  tooltip: LodariqBlock;
}) {
  const [section, setSection] = useState<PresentationSection>('motion');
  const [previewReplayKey, setPreviewReplayKey] = useState(0);
  const motion = step.props.motion;
  const responsive = step.props.responsive ?? {};
  const compact = responsive.compact ?? {};
  return (
    <section className="storyboard-tab-panel step-presentation">
      <div className="step-presentation-preview">
        <span className="step-presentation-preview-heading">
          <small>{authoringText('Preview')}</small>
          {motion ? (
            <button
              aria-label={authoringText('Replay preview')}
              onClick={() => setPreviewReplayKey((key) => key + 1)}
              title={authoringText('Replay preview')}
              type="button"
            >
              <RefreshCcw size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
        </span>
        <div
          className="step-presentation-preview-stage"
          data-action-layout={compact.actionLayout ?? 'inherit'}
          data-spotlight={step.props.spotlight?.emphasis ?? 'none'}
        >
          <StepPresentationPreview
            motionReplayKey={previewReplayKey}
            snapshot={snapshot}
            step={step}
            tooltip={tooltip}
          />
        </div>
      </div>
      <div className="step-presentation-settings">
        <small>{authoringText('Step presentation')}</small>
        <p className="visually-hidden">
          {authoringText('Motion and responsive changes stay semantic and bounded.')}{' '}
          {authoringText('Motion duration')}
        </p>
        <nav className="progressive-setting-tabs" aria-label={authoringText('Step presentation')}>
          {PRESENTATION_SECTIONS.map((item) => (
            <button
              aria-current={section === item.value ? 'page' : undefined}
              key={item.value}
              onClick={() => setSection(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="progressive-setting-panel">
          {section === 'motion' ? (
            <>
              <PropertyChoiceField
                label={authoringText('Motion recipe')}
                options={MOTION_OPTIONS}
                value={motion?.recipe ?? 'none'}
                onChange={(recipe) => {
                  setPreviewReplayKey((key) => key + 1);
                  if (recipe === 'none') {
                    controller.setBlockPresentation(step.id, { motion: undefined });
                    return;
                  }
                  controller.setBlockPresentation(step.id, {
                    motion: {
                      recipe: recipe as TourMotionPresentation['recipe'],
                      durationMs: motion?.durationMs ?? 240,
                      easing: motion?.easing ?? 'standard',
                      reducedMotion: 'none',
                    },
                  });
                }}
              />
              {motion ? (
                <AuthoringRange
                  label={authoringText('Motion duration in milliseconds')}
                  max={1200}
                  min={100}
                  onValueChange={(durationMs) => {
                    setPreviewReplayKey((key) => key + 1);
                    controller.setBlockPresentation(step.id, {
                      motion: { ...motion, durationMs },
                    });
                  }}
                  step={20}
                  unit="ms"
                  value={motion.durationMs}
                />
              ) : null}
            </>
          ) : null}
          {section === 'spotlight' ? (
            <PropertyChoiceField
              label={authoringText('Spotlight emphasis')}
              options={SPOTLIGHT_OPTIONS}
              value={step.props.spotlight?.emphasis ?? 'none'}
              onChange={(emphasis) =>
                controller.setBlockPresentation(step.id, {
                  spotlight:
                    emphasis === 'none'
                      ? undefined
                      : {
                          emphasis: emphasis as NonNullable<
                            typeof step.props.spotlight
                          >['emphasis'],
                          pulse: step.props.spotlight?.pulse ?? false,
                        },
                })
              }
            />
          ) : null}
          {section === 'responsive' ? (
            <PropertyChoiceField
              label={authoringText('Compact action layout')}
              options={[
                { value: 'inherit', label: authoringText('Inherit step layout') },
                { value: 'inline', label: authoringText('Inline') },
                { value: 'stack', label: authoringText('Stacked') },
              ]}
              value={compact.actionLayout ?? 'inherit'}
              onChange={(actionLayout) =>
                controller.setBlockPresentation(step.id, {
                  responsive: responsiveWithCompactActionLayout(responsive, actionLayout),
                })
              }
            />
          ) : null}
          {section === 'accessibility' ? (
            <AuthoringTextField
              defaultValue={step.props.accessibilityName ?? ''}
              key={step.props.accessibilityName ?? ''}
              label={authoringText('Step accessibility name')}
              onBlur={(event) =>
                controller.setBlockPresentation(step.id, {
                  accessibilityName: event.currentTarget.value.trim() || undefined,
                })
              }
            />
          ) : null}
          {section === 'automatic' ? (
            <>
              <PropertyChoiceField
                label={authoringText('Automatic step sequence')}
                options={[
                  { value: 'none', label: authoringText('No automatic sequence') },
                  { value: 'enabled', label: authoringText('Run when this step appears') },
                ]}
                value={step.props.entrySequence ? 'enabled' : 'none'}
                onChange={(value) =>
                  controller.setBlockEntrySequence(
                    step.id,
                    value === 'enabled'
                      ? {
                          trigger: tooltip.props.targetId
                            ? { type: 'observeTargetClick', targetId: tooltip.props.targetId }
                            : { type: 'manual' },
                          waitFor: [],
                          transition: { type: 'next' },
                          timeoutMs: 3_000,
                          onTimeout: 'stay',
                        }
                      : undefined,
                  )
                }
              />
              {step.props.entrySequence ? (
                <SequencePropertyEditor
                  automatic
                  block={step}
                  controller={controller}
                  onSequenceChange={(sequence) =>
                    controller.setBlockEntrySequence(step.id, sequence)
                  }
                  onTest={() => controller.previewFullTourFromStep(step.id)}
                  sequence={step.props.entrySequence}
                  steps={steps}
                  tooltip={tooltip}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function responsiveWithCompactActionLayout(
  responsive: NonNullable<LodariqBlock['props']['responsive']>,
  actionLayout: string,
): LodariqBlock['props']['responsive'] | undefined {
  const { actionLayout: _current, ...otherCompactValues } = responsive.compact ?? {};
  const compact =
    actionLayout === 'inherit'
      ? otherCompactValues
      : { ...otherCompactValues, actionLayout: actionLayout as 'inline' | 'stack' };
  const { compact: _previous, ...otherViewports } = responsive;
  const next = Object.keys(compact).length ? { ...otherViewports, compact } : otherViewports;
  return Object.keys(next).length ? next : undefined;
}
