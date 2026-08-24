/**
 * The non-tour experience types' own inspector rows (§5).
 *
 * These were the only rows in the inspector not built from the shared property
 * controls: a bare `<select>` in a `.storyboard-property-row` and a bare
 * checkbox in a `.storyboard-property-toggle`, neither of which any stylesheet
 * defines. So an announcement, hotspot, survey or checklist opened its inspector
 * on unstyled browser widgets next to a tour's own rows. Same controls as the
 * tour now: `menu` for a list of choices, `track` for a two-state one, which is
 * what §4.3 spends the extra height on.
 */
import {
  defaultExperienceBehavior,
  type AnnouncementBehavior,
  type ChecklistBehavior,
  type ExperienceSurfaceForm,
  type HotspotBehavior,
  type SurveyBehavior,
} from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { PropertyChoiceField } from '../properties/property-controls';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

export interface ExperienceBehaviorSectionProps {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  section:
    | 'audience'
    | 'completion'
    | 'content'
    | 'dismissal'
    | 'frequency'
    | 'items'
    | 'logic'
    | 'marker'
    | 'trigger';
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
        <BehaviorToggle
          label={authoringText('Dismissing')}
          off={authoringText('Locked')}
          on={authoringText('Allowed')}
          onChange={(dismissible) => controller.setExperienceBehavior({ ...behavior, dismissible })}
          value={behavior.dismissible}
        />
      );
    }
    if (section === 'frequency') {
      return (
        <>
          <PropertyChoiceField
            label={authoringText('Show announcement')}
            onChange={(frequency) =>
              controller.setExperienceBehavior({
                ...behavior,
                frequency: frequency as AnnouncementBehavior['frequency'],
              })
            }
            options={[
              { value: 'always', label: authoringText('Every eligible visit') },
              { value: 'session', label: authoringText('Once per session') },
              { value: 'visitor', label: authoringText('Once per visitor') },
            ]}
            presentation="menu"
            value={behavior.frequency}
          />
          <PropertyChoiceField
            label={authoringText('Presentation')}
            onChange={(surface) =>
              controller.setExperienceSurfaceForm(surface as ExperienceSurfaceForm)
            }
            options={[
              { value: 'modal', label: authoringText('Modal') },
              { value: 'banner', label: authoringText('Banner') },
              { value: 'slideIn', label: authoringText('Slide-in') },
            ]}
            presentation="menu"
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
        <PropertyChoiceField
          label={authoringText('Marker style')}
          onChange={(marker) =>
            controller.setExperienceBehavior({
              ...behavior,
              marker: marker as HotspotBehavior['marker'],
            })
          }
          options={[
            { value: 'pulse', label: authoringText('Pulse') },
            { value: 'dot', label: authoringText('Dot') },
            { value: 'ring', label: authoringText('Ring') },
            { value: 'number', label: authoringText('Number') },
          ]}
          presentation="menu"
          value={behavior.marker}
        />
      );
    }
    if (section === 'trigger') {
      return (
        <PropertyChoiceField
          label={authoringText('Open tooltip on')}
          onChange={(activation) =>
            controller.setExperienceBehavior({
              ...behavior,
              activation: activation as HotspotBehavior['activation'],
            })
          }
          options={[
            { value: 'click', label: authoringText('Click') },
            { value: 'hover', label: authoringText('Hover or focus') },
            { value: 'focus', label: authoringText('Focus') },
          ]}
          presentation="menu"
          value={behavior.activation}
        />
      );
    }
  }
  /*
   * Audience is not content, and it used to be routed to the `content` section,
   * which has no branch — so a panel headed "Audience" rendered "Edit this
   * content on the card." That is why it read as doing nothing.
   *
   * Environments are shown, not edited: they are set when the experience is
   * created and moved by promotion, and `OperationsAudience` treats them the
   * same way. Rules are removable here; adding one needs the rule builder.
   */
  if (section === 'audience') {
    const audience = snapshot.documentState.audience;
    const environments = audience?.environments ?? [];
    const rules = audience?.rules ?? [];
    return (
      <>
        <p className="storyboard-property-hint">
          {environments.length
            ? `${authoringText('Environments')}: ${environments.join(', ')}`
            : authoringText('No environment is selected yet.')}
        </p>
        {rules.length === 0 ? (
          <p className="storyboard-property-hint">
            {authoringText('Everyone who reaches the page sees this.')}
          </p>
        ) : (
          rules.map((rule, index) => (
            <div className="storyboard-property-row" key={`${rule.source}-${rule.key}-${index}`}>
              <span>
                {`${rule.source} · ${rule.key} ${rule.operator}`}
                {rule.value === undefined ? '' : ` ${String(rule.value)}`}
              </span>
              <button onClick={() => controller.removeAudienceRule(index)} type="button">
                {authoringText('Remove')}
              </button>
            </div>
          ))
        )}
      </>
    );
  }
  if (type === 'survey' && section === 'logic') {
    const behavior = surveyBehavior(snapshot);
    return (
      <>
        <PropertyChoiceField
          label={authoringText('Responses')}
          onChange={(submission) =>
            controller.setExperienceBehavior({
              ...behavior,
              submission: submission as SurveyBehavior['submission'],
            })
          }
          options={[
            { value: 'once', label: authoringText('One submission per visitor') },
            { value: 'repeatable', label: authoringText('Allow repeat submissions') },
          ]}
          presentation="menu"
          value={behavior.submission}
        />
        <BehaviorToggle
          label={authoringText('An answer is')}
          off={authoringText('Optional')}
          on={authoringText('Required')}
          onChange={(requireAnswer) =>
            controller.setExperienceBehavior({ ...behavior, requireAnswer })
          }
          value={behavior.requireAnswer}
        />
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
        <PropertyChoiceField
          label={authoringText('Presentation')}
          onChange={(surface) =>
            controller.setExperienceSurfaceForm(surface as ExperienceSurfaceForm)
          }
          options={[
            { value: 'floating', label: authoringText('Floating') },
            { value: 'drawer', label: authoringText('Drawer') },
          ]}
          presentation="track"
          value={snapshot.documentState.surfaceForm ?? 'floating'}
        />
      );
    }
    if (section === 'completion') {
      return (
        <>
          <BehaviorToggle
            label={authoringText('Progress')}
            off={authoringText('Hidden')}
            on={authoringText('Shown')}
            onChange={(showProgress) =>
              controller.setExperienceBehavior({ ...behavior, showProgress })
            }
            value={behavior.showProgress}
          />
          <p className="storyboard-property-hint">
            {authoringText('The checklist completes when every item is checked.')}
          </p>
        </>
      );
    }
  }
  return <p className="storyboard-property-hint">{contentHint(type, section)}</p>;
}

/**
 * The content sections point at the card rather than duplicating it. They used
 * to share one sentence, so four different sections read identically and the
 * inspector looked broken; each now names what it is pointing at.
 */
function contentHint(type: string, section: ExperienceBehaviorSectionProps['section']): string {
  if (type === 'announcement') {
    return authoringText('Who sees this is set by the experience audience, not by the card.');
  }
  if (type === 'hotspot') {
    return authoringText('Write the tooltip on the card; the marker sets where it opens.');
  }
  if (type === 'survey') {
    return section === 'content'
      ? authoringText('Edit the question and its answers on the card.')
      : authoringText('Edit this content on the card.');
  }
  if (type === 'checklist') {
    return authoringText('Add, reorder and word the items on the card.');
  }
  return authoringText('Edit this content on the card.');
}

/**
 * A two-state row on the same track the tour's small choices use, so a boolean
 * reads as a choice between two named states rather than an unlabelled tick.
 */
function BehaviorToggle({
  label,
  off,
  on,
  onChange,
  value,
}: {
  label: string;
  off: string;
  on: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <PropertyChoiceField
      label={label}
      onChange={(next) => onChange(next === 'on')}
      options={[
        { value: 'on', label: on },
        { value: 'off', label: off },
      ]}
      presentation="track"
      value={value ? 'on' : 'off'}
    />
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
