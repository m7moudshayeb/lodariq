import { authoringText } from '../../../i18n';
import { useEffect, useState } from 'react';
import type { LodariqBlock, StepTransition } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import {
  ArrowRight,
  AuthoringButton,
  AuthoringSelect,
  Eye,
  Network,
  Plus,
  Trash2,
} from '../design-system';
import { ConditionEditor } from './transition-condition-editor';
import {
  blockIsInside,
  defaultCondition,
  destinationFromValue,
  destinationOptions,
  destinationValue,
} from './transition-property-model';

export function TransitionPropertyEditor({
  block,
  controller,
  steps,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  steps: readonly LodariqBlock[];
}) {
  const [activeRuleIndex, setActiveRuleIndex] = useState(0);
  const [activeConditionIndex, setActiveConditionIndex] = useState(0);
  const transition = block.props.action?.transition;
  const update = (next: StepTransition | undefined) =>
    controller.setButtonTransition(block.id, next);
  const owningStep = steps.find((step) => blockIsInside(step, block.id));

  useEffect(() => {
    const maximumIndex = Math.max(0, (transition?.rules.length ?? 1) - 1);
    setActiveRuleIndex((current) => Math.min(current, maximumIndex));
  }, [transition?.rules.length]);

  useEffect(() => {
    const conditionCount = transition?.rules[activeRuleIndex]?.all.length ?? 1;
    setActiveConditionIndex((current) => Math.min(current, Math.max(0, conditionCount - 1)));
  }, [activeRuleIndex, transition?.rules]);

  if (!transition) {
    return (
      <section className="storyboard-property-control transition-editor" data-branch-state="empty">
        <header className="transition-editor-header">
          <span className="transition-editor-heading">
            <Network size={16} strokeWidth={2} aria-hidden="true" />
            <span>
              <strong>{authoringText('Action branch')}</strong>
              <small>{authoringText('Choose a typed path after this action.')}</small>
            </span>
          </span>
          <AuthoringButton
            icon={<Plus size={14} strokeWidth={2} aria-hidden="true" />}
            onClick={() => update({ rules: [], fallback: { type: 'next' } })}
            type="button"
            tone="default"
          >
            {authoringText('Add branch')}
          </AuthoringButton>
        </header>
      </section>
    );
  }

  return (
    <section
      className="storyboard-property-control transition-editor"
      data-branch-state="configured"
    >
      <header className="transition-editor-header">
        <span className="transition-editor-heading">
          <Network size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            <strong>{authoringText('Action branch')}</strong>
            <small>{authoringText('Choose a typed path after this action.')}</small>
          </span>
        </span>
        <span className="transition-header-actions">
          {owningStep ? (
            <AuthoringButton
              icon={<Eye size={14} strokeWidth={2} aria-hidden="true" />}
              onClick={() => controller.previewFullTourFromStep(owningStep.id)}
              type="button"
              tone="ghost"
            >
              {authoringText('Preview from here')}
            </AuthoringButton>
          ) : null}
          <AuthoringButton
            icon={<Trash2 size={14} strokeWidth={2} aria-hidden="true" />}
            onClick={() => update(undefined)}
            type="button"
            tone="danger"
          >
            {authoringText('Remove branch')}
          </AuthoringButton>
        </span>
      </header>

      <p className="transition-guidance">
        {authoringText('Rules run in order. The fallback is always required.')}
      </p>

      {transition.rules.length ? (
        <nav className="transition-rule-tabs" aria-label={authoringText('Action branch')}>
          {transition.rules.map((_rule, ruleIndex) => (
            <button
              aria-current={activeRuleIndex === ruleIndex ? 'page' : undefined}
              key={`rule-tab-${ruleIndex}`}
              onClick={() => setActiveRuleIndex(ruleIndex)}
              type="button"
            >
              <span>{ruleIndex + 1}</span>
              {authoringText('Rule {number}', { number: ruleIndex + 1 })}
            </button>
          ))}
        </nav>
      ) : null}

      <div className="transition-path-list">
        {transition.rules
          .filter((_rule, ruleIndex) => ruleIndex === activeRuleIndex)
          .map((rule) => {
            const ruleIndex = activeRuleIndex;
            return (
              <fieldset className="transition-rule" key={`rule-${ruleIndex}`}>
                <legend>
                  <span className="transition-rule-number">{ruleIndex + 1}</span>
                  <span>
                    <strong>{authoringText('Rule {number}', { number: ruleIndex + 1 })}</strong>
                    <small>{authoringText('{count} conditions', { count: rule.all.length })}</small>
                  </span>
                </legend>
                <p className="transition-rule-prompt">
                  {authoringText('When all conditions match')}
                </p>
                <div className="transition-condition-list">
                  {rule.all.length > 1 ? (
                    <nav
                      aria-label={authoringText('{count} conditions', {
                        count: rule.all.length,
                      })}
                      className="transition-condition-tabs"
                    >
                      {rule.all.map((_condition, conditionIndex) => (
                        <button
                          aria-current={
                            activeConditionIndex === conditionIndex ? 'page' : undefined
                          }
                          aria-label={`${authoringText('Condition source')} ${conditionIndex + 1}`}
                          key={`condition-tab-${conditionIndex}`}
                          onClick={() => setActiveConditionIndex(conditionIndex)}
                          type="button"
                        >
                          {conditionIndex + 1}
                        </button>
                      ))}
                    </nav>
                  ) : null}
                  {rule.all
                    .filter((_condition, conditionIndex) => conditionIndex === activeConditionIndex)
                    .map((condition) => {
                      const sourceConditionIndex = activeConditionIndex;
                      return (
                        <ConditionEditor
                          condition={condition}
                          key={`${condition.source}-${sourceConditionIndex}`}
                          onChange={(nextCondition) => {
                            const rules = structuredClone(transition.rules);
                            rules[ruleIndex]!.all[sourceConditionIndex] = nextCondition;
                            update({ ...transition, rules });
                          }}
                          onRemove={() => {
                            const rules = structuredClone(transition.rules);
                            rules[ruleIndex]!.all.splice(sourceConditionIndex, 1);
                            if (!rules[ruleIndex]!.all.length) rules.splice(ruleIndex, 1);
                            update({ ...transition, rules });
                          }}
                          steps={steps}
                        />
                      );
                    })}
                </div>
                <footer className="transition-rule-footer">
                  {rule.all.length < 4 ? (
                    <AuthoringButton
                      icon={<Plus size={13} strokeWidth={2} aria-hidden="true" />}
                      onClick={() => {
                        const rules = structuredClone(transition.rules);
                        rules[ruleIndex]!.all.push(defaultCondition());
                        update({ ...transition, rules });
                        setActiveConditionIndex(rules[ruleIndex]!.all.length - 1);
                      }}
                      type="button"
                      tone="ghost"
                    >
                      {authoringText('Add condition')}
                    </AuthoringButton>
                  ) : null}
                  <ArrowRight
                    className="transition-destination-arrow"
                    size={15}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  <div className="transition-destination">
                    <span>{authoringText('Then go to')}</span>
                    <AuthoringSelect
                      ariaLabel={authoringText('Rule {number} destination', {
                        number: ruleIndex + 1,
                      })}
                      dataAction="transition-rule-destination"
                      dataBlockId={block.id}
                      onValueChange={(value) => {
                        const rules = structuredClone(transition.rules);
                        rules[ruleIndex]!.to = destinationFromValue(value);
                        update({ ...transition, rules });
                      }}
                      options={destinationOptions(steps)}
                      value={destinationValue(rule.to)}
                    />
                  </div>
                </footer>
              </fieldset>
            );
          })}

        <div className="transition-fallback-card">
          <span className="transition-fallback-mark" aria-hidden="true">
            <ArrowRight size={14} strokeWidth={2} />
          </span>
          <div>
            <span>{authoringText('If no rule matches')}</span>
            <AuthoringSelect
              ariaLabel={authoringText('Fallback path')}
              dataAction="transition-fallback-destination"
              dataBlockId={block.id}
              onValueChange={(value) =>
                update({
                  ...transition,
                  fallback: destinationFromValue(value),
                })
              }
              options={destinationOptions(steps)}
              value={destinationValue(transition.fallback)}
            />
          </div>
        </div>
      </div>

      <div className="transition-editor-actions">
        {transition.rules.length < 8 ? (
          <AuthoringButton
            icon={<Plus size={14} strokeWidth={2} aria-hidden="true" />}
            onClick={() => {
              const nextRuleIndex = transition.rules.length;
              update({
                ...transition,
                rules: [...transition.rules, { all: [defaultCondition()], to: { type: 'next' } }],
              });
              setActiveRuleIndex(nextRuleIndex);
            }}
            type="button"
            tone="default"
          >
            {authoringText('Add rule')}
          </AuthoringButton>
        ) : null}
      </div>
    </section>
  );
}
