import type { LodariqBlock, StepTransitionCondition } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { AuthoringButton, AuthoringSelect, AuthoringTextField, Trash2 } from '../design-system';
import { blockDisplayTitle } from '../utils';
import { defaultCondition, normalizeIdentifier } from './transition-property-model';

const CONDITION_SOURCE_OPTIONS = [
  { value: 'identifyTrait', label: authoringText('Identified visitor trait') },
  { value: 'documentState', label: authoringText('Declared document state') },
  { value: 'namedEvent', label: authoringText('Named product event') },
  { value: 'locale', label: authoringText('Visitor locale') },
  { value: 'completedStep', label: authoringText('Completed step') },
] as const;

const CONDITION_OPERATOR_OPTIONS = [
  { value: 'equals', label: authoringText('Equals') },
  { value: 'notEquals', label: authoringText('Does not equal') },
  { value: 'exists', label: authoringText('Exists') },
] as const;

export function ConditionEditor({
  condition,
  onChange,
  onRemove,
  steps,
}: {
  condition: StepTransitionCondition;
  onChange: (condition: StepTransitionCondition) => void;
  onRemove: () => void;
  steps: readonly LodariqBlock[];
}) {
  return (
    <div className="transition-condition">
      <div className="transition-condition-fields">
        <div className="transition-native-field">
          <span>{authoringText('Condition source')}</span>
          <AuthoringSelect
            ariaLabel={authoringText('Condition source')}
            dataAction="transition-condition-source"
            dataBlockId="transition-condition"
            onValueChange={(value) =>
              onChange(defaultCondition(value as StepTransitionCondition['source']))
            }
            options={CONDITION_SOURCE_OPTIONS}
            value={condition.source}
          />
        </div>
        <ConditionFields condition={condition} onChange={onChange} steps={steps} />
      </div>
      <AuthoringButton
        aria-label={authoringText('Remove condition')}
        className="transition-condition-remove"
        icon={<Trash2 size={14} strokeWidth={2} aria-hidden="true" />}
        onClick={onRemove}
        type="button"
        tone="danger"
      />
    </div>
  );
}

function ConditionFields({
  condition,
  onChange,
  steps,
}: {
  condition: StepTransitionCondition;
  onChange: (condition: StepTransitionCondition) => void;
  steps: readonly LodariqBlock[];
}) {
  if (condition.source === 'namedEvent') {
    return (
      <AuthoringTextField
        defaultValue={condition.eventName}
        key={condition.eventName}
        label={authoringText('Product event name')}
        onBlur={(event) =>
          onChange({ ...condition, eventName: normalizeIdentifier(event.currentTarget.value) })
        }
      />
    );
  }
  if (condition.source === 'locale') {
    return (
      <AuthoringTextField
        defaultValue={condition.locale}
        key={condition.locale}
        label={authoringText('Locale code')}
        onBlur={(event) => onChange({ ...condition, locale: event.currentTarget.value.trim() })}
      />
    );
  }
  if (condition.source === 'completedStep') {
    return (
      <div className="transition-native-field">
        <span>{authoringText('Completed step')}</span>
        <AuthoringSelect
          ariaLabel={authoringText('Completed step')}
          dataAction="transition-completed-step"
          dataBlockId={condition.stepId}
          onValueChange={(stepId) => onChange({ ...condition, stepId })}
          options={steps.map((step) => ({ value: step.id, label: blockDisplayTitle(step) }))}
          value={condition.stepId}
        />
      </div>
    );
  }

  return (
    <>
      <AuthoringTextField
        defaultValue={condition.key}
        key={condition.key}
        label={
          condition.source === 'identifyTrait'
            ? authoringText('Declared trait key')
            : authoringText('Document state key')
        }
        onBlur={(event) =>
          onChange({ ...condition, key: normalizeIdentifier(event.currentTarget.value) })
        }
      />
      <div className="transition-native-field">
        <span>{authoringText('Comparison')}</span>
        <AuthoringSelect
          ariaLabel={authoringText('Comparison')}
          dataAction="transition-comparison"
          dataBlockId="transition-condition"
          onValueChange={(value) =>
            onChange({
              ...condition,
              operator: value as typeof condition.operator,
              ...(value === 'exists' ? { value: undefined } : {}),
            })
          }
          options={CONDITION_OPERATOR_OPTIONS}
          value={condition.operator}
        />
      </div>
      {condition.operator !== 'exists' ? (
        <AuthoringTextField
          defaultValue={String(condition.value ?? '')}
          key={String(condition.value ?? '')}
          label={authoringText('Comparison value')}
          onBlur={(event) => onChange({ ...condition, value: event.currentTarget.value })}
        />
      ) : null}
    </>
  );
}
