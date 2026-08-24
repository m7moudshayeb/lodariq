import {
  defaultExperienceBehavior,
  type AnnouncementBehavior,
  type ChecklistBehavior,
  type ExperienceSurfaceForm,
  type HotspotBehavior,
  type SurveyBehavior,
} from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

export interface ExperienceBehaviorSectionProps {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  section:
    'completion' | 'content' | 'dismissal' | 'frequency' | 'items' | 'logic' | 'marker' | 'trigger';
}

export function ExperienceBehaviorSection({
  controller,
  snapshot,
  section,
}: ExperienceBehaviorSectionProps) {
  const type = snapshot.documentState.type;
  if (type === 'announcement') {
    const behavior = announcementBehavior(snapshot);
    if (section === 'dismissal') {
      return (
        <label className="storyboard-property-toggle">
          <input
            checked={behavior.dismissible}
            onChange={(event) =>
              controller.setExperienceBehavior({ ...behavior, dismissible: event.target.checked })
            }
            type="checkbox"
          />
          <span>{authoringText('Allow visitors to dismiss')}</span>
        </label>
      );
    }
    if (section === 'frequency') {
      return (
        <>
          <BehaviorSelect
            label={authoringText('Show announcement')}
            onChange={(frequency) =>
              controller.setExperienceBehavior({
                ...behavior,
                frequency: frequency as AnnouncementBehavior['frequency'],
              })
            }
            options={[
              ['always', authoringText('Every eligible visit')],
              ['session', authoringText('Once per session')],
              ['visitor', authoringText('Once per visitor')],
            ]}
            value={behavior.frequency}
          />
          <BehaviorSelect
            label={authoringText('Presentation')}
            onChange={(surface) =>
              controller.setExperienceSurfaceForm(surface as ExperienceSurfaceForm)
            }
            options={[
              ['modal', authoringText('Modal')],
              ['banner', authoringText('Banner')],
              ['slideIn', authoringText('Slide-in')],
            ]}
            value={snapshot.documentState.surfaceForm ?? 'modal'}
          />
        </>
      );
    }
  }
  if (type === 'hotspot') {
    const behavior = hotspotBehavior(snapshot);
    if (section === 'marker') {
      return (
        <BehaviorSelect
          label={authoringText('Marker style')}
          onChange={(marker) =>
            controller.setExperienceBehavior({
              ...behavior,
              marker: marker as HotspotBehavior['marker'],
            })
          }
          options={[
            ['pulse', authoringText('Pulse')],
            ['dot', authoringText('Dot')],
            ['ring', authoringText('Ring')],
            ['number', authoringText('Number')],
          ]}
          value={behavior.marker}
        />
      );
    }
    if (section === 'trigger') {
      return (
        <BehaviorSelect
          label={authoringText('Open tooltip on')}
          onChange={(activation) =>
            controller.setExperienceBehavior({
              ...behavior,
              activation: activation as HotspotBehavior['activation'],
            })
          }
          options={[
            ['click', authoringText('Click')],
            ['hover', authoringText('Hover or focus')],
            ['focus', authoringText('Focus')],
          ]}
          value={behavior.activation}
        />
      );
    }
  }
  if (type === 'survey' && section === 'logic') {
    const behavior = surveyBehavior(snapshot);
    return (
      <>
        <BehaviorSelect
          label={authoringText('Responses')}
          onChange={(submission) =>
            controller.setExperienceBehavior({
              ...behavior,
              submission: submission as SurveyBehavior['submission'],
            })
          }
          options={[
            ['once', authoringText('One submission per visitor')],
            ['repeatable', authoringText('Allow repeat submissions')],
          ]}
          value={behavior.submission}
        />
        <label className="storyboard-property-toggle">
          <input
            checked={behavior.requireAnswer}
            onChange={(event) =>
              controller.setExperienceBehavior({ ...behavior, requireAnswer: event.target.checked })
            }
            type="checkbox"
          />
          <span>{authoringText('Require an answer before submitting')}</span>
        </label>
        <p className="storyboard-property-hint">
          {authoringText('Use action conditions to branch after a response.')}
        </p>
      </>
    );
  }
  if (type === 'checklist') {
    const behavior = checklistBehavior(snapshot);
    if (section === 'items') {
      return (
        <BehaviorSelect
          label={authoringText('Presentation')}
          onChange={(surface) =>
            controller.setExperienceSurfaceForm(surface as ExperienceSurfaceForm)
          }
          options={[
            ['floating', authoringText('Floating')],
            ['drawer', authoringText('Drawer')],
          ]}
          value={snapshot.documentState.surfaceForm ?? 'floating'}
        />
      );
    }
    if (section === 'completion') {
      return (
        <>
          <label className="storyboard-property-toggle">
            <input
              checked={behavior.showProgress}
              onChange={(event) =>
                controller.setExperienceBehavior({
                  ...behavior,
                  showProgress: event.target.checked,
                })
              }
              type="checkbox"
            />
            <span>{authoringText('Show checklist progress')}</span>
          </label>
          <p className="storyboard-property-hint">
            {authoringText('The checklist completes when every item is checked.')}
          </p>
        </>
      );
    }
  }
  return (
    <p className="storyboard-property-hint">{authoringText('Edit this content on the card.')}</p>
  );
}

function BehaviorSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  value: string;
}) {
  return (
    <label className="storyboard-property-row">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function announcementBehavior(snapshot: LocalAuthoringFrameSnapshot): AnnouncementBehavior {
  return snapshot.documentState.experience?.type === 'announcement'
    ? snapshot.documentState.experience
    : (defaultExperienceBehavior('announcement') as AnnouncementBehavior);
}

function hotspotBehavior(snapshot: LocalAuthoringFrameSnapshot): HotspotBehavior {
  return snapshot.documentState.experience?.type === 'hotspot'
    ? snapshot.documentState.experience
    : (defaultExperienceBehavior('hotspot') as HotspotBehavior);
}

function surveyBehavior(snapshot: LocalAuthoringFrameSnapshot): SurveyBehavior {
  return snapshot.documentState.experience?.type === 'survey'
    ? snapshot.documentState.experience
    : (defaultExperienceBehavior('survey') as SurveyBehavior);
}

function checklistBehavior(snapshot: LocalAuthoringFrameSnapshot): ChecklistBehavior {
  return snapshot.documentState.experience?.type === 'checklist'
    ? snapshot.documentState.experience
    : (defaultExperienceBehavior('checklist') as ChecklistBehavior);
}
