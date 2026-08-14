import type { StepChoreographyWait } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { AuthoringButton, AuthoringSelect, AuthoringTextField, Trash2 } from '../design-system';
import { waitLabelFor } from './sequence-property-model';

export function SequenceWaitEditor({
  index,
  onChange,
  onRemove,
  wait,
}: {
  index: number;
  onChange: (wait: StepChoreographyWait) => void;
  onRemove: () => void;
  wait: StepChoreographyWait;
}) {
  return (
    <div className="sequence-wait-row">
      <span>{waitLabelFor(wait)}</span>
      {wait.type === 'route' ? (
        <>
          <AuthoringSelect
            ariaLabel={authoringText('Route match type')}
            dataAction="sequence-route-match"
            dataBlockId={`wait-${index}`}
            onValueChange={(match) => onChange({ ...wait, match: match as typeof wait.match })}
            options={[
              { value: 'exact', label: authoringText('Exactly') },
              { value: 'prefix', label: authoringText('Starts with') },
              { value: 'contains', label: authoringText('Contains') },
            ]}
            value={wait.match}
          />
          <AuthoringTextField
            defaultValue={wait.value}
            label={authoringText('Route value')}
            onBlur={(event) =>
              onChange({ ...wait, value: event.currentTarget.value.trim() || '/' })
            }
            placeholder={authoringText('/settings')}
          />
        </>
      ) : null}
      {wait.type === 'textVisible' ? (
        <>
          <AuthoringTextField
            defaultValue={wait.value}
            label={authoringText('Visible text')}
            onBlur={(event) =>
              onChange({
                ...wait,
                value: event.currentTarget.value.trim() || authoringText('Ready'),
              })
            }
          />
          <AuthoringTextField
            defaultValue={wait.locale}
            label={authoringText('Text locale')}
            onBlur={(event) =>
              onChange({ ...wait, locale: event.currentTarget.value.trim() || 'en' })
            }
          />
        </>
      ) : null}
      {wait.type === 'event' ? (
        <AuthoringTextField
          defaultValue={wait.eventName}
          label={authoringText('Product event name')}
          onBlur={(event) =>
            onChange({ ...wait, eventName: event.currentTarget.value.trim() || 'product.ready' })
          }
        />
      ) : null}
      <AuthoringButton
        aria-label={authoringText('Remove wait condition {number}', { number: index + 1 })}
        icon={<Trash2 aria-hidden="true" size={14} strokeWidth={2} />}
        onClick={onRemove}
        tone="danger"
      />
    </div>
  );
}
