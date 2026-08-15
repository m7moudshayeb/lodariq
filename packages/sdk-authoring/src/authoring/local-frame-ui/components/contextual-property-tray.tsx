import { authoringText } from '../../../i18n';
import { useState, type ReactNode } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import { selectExperienceRootBlocks } from '../../experience-authoring-capabilities';
import { X } from '../design-system';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { blockDisplayTitle, targetIdOf, targetLabelOf } from '../utils';
import type { StepHealthTone } from '../tour-step-model';
import {
  type ContextualToolMode,
  type PopupCompositionSection,
  type PopupInspectorSection,
  type PopupThemeColors,
} from './contextual-property-types';
import { PopupCompositionInspector } from './popup-composition-inspector';
import { StepPresentationInspector } from './step-presentation-inspector';

export type { PopupThemeColors } from './contextual-property-types';

const TOOLTIP_PLACEMENT_LABELS = {
  top: authoringText('Above'),
  bottom: authoringText('Below'),
  left: authoringText('Left'),
  right: authoringText('Right'),
} as const;

const POPUP_INSPECTOR_SECTIONS = [
  { value: 'layout', label: authoringText('Layout') },
  { value: 'appearance', label: authoringText('Appearance') },
  { value: 'presentation', label: authoringText('Step presentation') },
] as const satisfies ReadonlyArray<{ value: PopupInspectorSection; label: string }>;

export function ContextualPropertyTray({
  controller,
  health,
  placementEditor,
  popupThemeColors,
  snapshot,
  step,
  tooltip,
  toolMode,
  onClose,
  open,
}: {
  controller: LocalAuthoringFrameController;
  health: { label: string; repair: boolean; tone: StepHealthTone };
  placementEditor: ReactNode;
  popupThemeColors: PopupThemeColors;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  tooltip: LodariqBlock;
  toolMode: ContextualToolMode;
  onClose: () => void;
  open: boolean;
}) {
  const [popupSection, setPopupSection] = useState<PopupInspectorSection>('layout');
  const popupSections = snapshot.deliveryCapabilities.has('presentation.v1')
    ? POPUP_INSPECTOR_SECTIONS
    : POPUP_INSPECTOR_SECTIONS.filter((section) => section.value !== 'presentation');
  const popupCompositionSection: PopupCompositionSection =
    popupSection === 'presentation' ? 'layout' : popupSection;
  const targetId = targetIdOf(step);
  const targetLabel = targetId
    ? targetLabelOf(snapshot.documentState, targetId)
    : authoringText('Choose target');
  const placement = tooltip.props.placement ?? 'bottom';
  let title = authoringText('{name} settings', { name: blockDisplayTitle(step) });
  if (toolMode === 'popup') {
    title =
      popupSections.find((section) => section.value === popupSection)?.label ??
      popupSections[0]!.label;
  }
  const trayLabel =
    toolMode === 'popup' ? authoringText('Popup layout settings') : authoringText('Placement');

  if (!open) return null;

  return (
    <section
      className="storyboard-property-tray"
      aria-label={trayLabel}
      data-popup-section={toolMode === 'popup' ? popupSection : undefined}
      data-tool-mode={toolMode}
    >
      <span className="storyboard-tray-handle" aria-hidden="true" />
      <header className="storyboard-tray-header">
        <span className="storyboard-tray-title">
          <span className="storyboard-tray-identity">
            <strong>{title}</strong>
            <small>{authoringText('· This step')}</small>
          </span>
          <span className="storyboard-tray-context">
            <span className="storyboard-placement-summary">
              {authoringText('Appears')}&nbsp;
              {TOOLTIP_PLACEMENT_LABELS[placement].toLowerCase()} {targetLabel}
            </span>
            <span className={`storyboard-verification ${health.tone}`}>{health.label}</span>
          </span>
        </span>
      </header>
      <button
        type="button"
        className="storyboard-tray-close"
        aria-label={authoringText('Close settings')}
        onClick={onClose}
      >
        <X size={17} strokeWidth={2} aria-hidden="true" />
      </button>

      {toolMode === 'placement' ? placementEditor : null}

      {toolMode === 'popup' ? (
        <>
          <nav className="popup-inspector-tabs" aria-label={authoringText('Popup layout settings')}>
            {popupSections.map((section) => (
              <button
                aria-current={popupSection === section.value ? 'page' : undefined}
                key={section.value}
                onClick={() => setPopupSection(section.value)}
                type="button"
              >
                {section.label}
              </button>
            ))}
          </nav>
          {popupSection === 'presentation' &&
          snapshot.deliveryCapabilities.has('presentation.v1') ? (
            <StepPresentationInspector
              controller={controller}
              snapshot={snapshot}
              step={step}
              steps={selectExperienceRootBlocks(snapshot.documentState)}
              tooltip={tooltip}
            />
          ) : (
            <PopupCompositionInspector
              controller={controller}
              section={popupCompositionSection}
              themeColors={popupThemeColors}
              tooltip={tooltip}
            />
          )}
        </>
      ) : null}
    </section>
  );
}
