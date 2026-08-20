import type { LodariqBlock, StepTransitionCondition } from '@lodariq/schema';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { Filter, Plus, User, X } from 'lucide-react';
import { authoringText } from '../../../i18n';
import { normalizeIdentifier } from '../properties/transition-property-model';
import { selectExperienceRootBlocks } from '../../experience-authoring-capabilities';
import { blockDisplayTitle } from '../utils';
import {
  ChromeMenu,
  ChromeMenuHeading,
  ChromeMenuItem,
  ChromeMenuNote,
  ChromeMenuSeparator,
} from './chrome-menu';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

/** Which menu is open over the section, and what opened it. */
type OpenMenu = { kind: 'rule' | 'test-user'; trigger: HTMLElement };

/** The two rules whose subject is a name only the product knows. */
type TypedRuleKind = 'event' | 'declared';

/**
 * Whether this step shows at all (§4.3). Branching to a *different* step is the
 * flow map's job; this is the simpler question of who sees this one.
 *
 * A rule reads as a finished sentence — `plan is growth` — and is picked from a
 * menu of them. It used to be a source/key/comparison form, which asks a creator
 * to compose a boolean expression out of three dropdowns before they can say the
 * one thing they meant.
 */
export function StepConditionsSection({
  controller,
  snapshot,
  step,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
}): ReactNode {
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [typing, setTyping] = useState<TypedRuleKind | null>(null);
  const [traits, setTraits] = useState<Record<string, string>>(DEFAULT_TEST_USER);
  const showWhen = step.props.showWhen;
  const steps = selectExperienceRootBlocks(snapshot.documentState);

  const open = (kind: OpenMenu['kind']) => (event: MouseEvent<HTMLButtonElement>) => {
    setTyping(null);
    setMenu({ kind, trigger: event.currentTarget });
  };
  const close = (): void => setMenu(null);
  const commit = (condition: StepTransitionCondition | undefined): void => {
    controller.setBlockShowWhen(step.id, condition);
    setTyping(null);
    close();
  };

  return (
    <div className="step-conditions">
      {/* §4.3 opens with what the section decides, and what it does not. */}
      <p className="overlay-step-inspector-note">
        {authoringText('Whether this step shows at all.')}{' '}
        {authoringText('Branching to a different step lives in the flow map.')}
      </p>
      {/* The prototype's numbered rule list; one rule is all `showWhen` holds. */}
      <div className="inspector-numbered-list" data-condition-rules="">
        {showWhen ? (
          <div className="inspector-numbered-row">
            <button className="inspector-numbered-open" onClick={open('rule')} type="button">
              <span className="inspector-numbered-index">
                <Filter size={10} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="step-condition-sentence">{conditionSentence(showWhen, steps)}</span>
            </button>
            <button
              aria-label={authoringText('Remove rule')}
              className="inspector-numbered-remove"
              data-action="step-condition-remove"
              onClick={() => commit(undefined)}
              type="button"
            >
              <X size={12} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="inspector-numbered-row" data-empty="">
            <span>{authoringText('Always shows')}</span>
          </div>
        )}
      </div>
      {typing ? (
        <TypedRuleField kind={typing} onCancel={() => setTyping(null)} onCommit={commit} />
      ) : null}
      <div className="inspector-menu">
        <button data-action="step-condition-add" onClick={open('rule')} type="button">
          <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
          {showWhen ? authoringText('Change the rule…') : authoringText('Add a rule…')}
        </button>
        <button data-action="step-condition-test-user" onClick={open('test-user')} type="button">
          <User size={14} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Change the test user')}
        </button>
      </div>
      {showWhen ? (
        <p className="overlay-step-inspector-note">
          {authoringText('One rule per step for now — combine them in the flow map.')}
        </p>
      ) : null}
      <p className="overlay-step-inspector-note" data-test-user="">
        {authoringText('Test user: {traits}', { traits: traitLine(traits) })}
      </p>
      {menu ? (
        <ChromeMenu
          label={authoringText('Conditions')}
          onClose={close}
          onFrameMenuChange={(open_) => controller.setFrameMenuOpen(open_)}
          trigger={menu.trigger}
        >
          {menu.kind === 'rule' ? (
            <RuleMenu
              condition={showWhen}
              locales={
                snapshot.documentState.localization?.variants.map((variant) => variant.locale) ?? []
              }
              onPick={commit}
              onTypedRule={(kind) => {
                setTyping(kind);
                close();
              }}
              steps={steps.filter((other) => other.id !== step.id)}
              traits={traits}
            />
          ) : null}
          {menu.kind === 'test-user' ? (
            <TestUserMenu
              onPick={(key, value) => {
                setTraits({ ...traits, [key]: value });
                close();
              }}
            />
          ) : null}
        </ChromeMenu>
      ) : null}
    </div>
  );
}

/** Prepared sentences, built from what this document actually knows. */
function RuleMenu({
  condition,
  locales,
  onPick,
  onTypedRule,
  steps,
  traits,
}: {
  condition: StepTransitionCondition | undefined;
  locales: readonly string[];
  onPick: (condition: StepTransitionCondition | undefined) => void;
  onTypedRule: (kind: 'event' | 'declared') => void;
  steps: readonly LodariqBlock[];
  traits: Record<string, string>;
}): ReactNode {
  return (
    <>
      <ChromeMenuHeading>{authoringText('Show this step when…')}</ChromeMenuHeading>
      {Object.entries(traits).map(([key, value]) => (
        <ChromeMenuItem
          key={`trait:${key}`}
          label={authoringText('{key} is {value}', { key, value })}
          onSelect={() => onPick({ source: 'identifyTrait', key, operator: 'equals', value })}
          selected={
            condition?.source === 'identifyTrait' &&
            condition.key === key &&
            condition.value === value
          }
        />
      ))}
      {steps.map((other) => (
        <ChromeMenuItem
          key={other.id}
          label={authoringText('they completed “{step}”', { step: blockDisplayTitle(other) })}
          onSelect={() => onPick({ source: 'completedStep', stepId: other.id })}
          selected={condition?.source === 'completedStep' && condition.stepId === other.id}
        />
      ))}
      {locales.map((locale) => (
        <ChromeMenuItem
          key={locale}
          label={authoringText('their locale is {locale}', { locale })}
          onSelect={() => onPick({ source: 'locale', locale })}
          selected={condition?.source === 'locale' && condition.locale === locale}
        />
      ))}
      <ChromeMenuSeparator />
      <ChromeMenuItem
        label={authoringText('After a product event…')}
        onSelect={() => onTypedRule('event')}
      />
      <ChromeMenuItem
        label={authoringText('They have declared data…')}
        onSelect={() => onTypedRule('declared')}
      />
      {condition ? (
        <>
          <ChromeMenuSeparator />
          <ChromeMenuItem
            label={authoringText('Always show this step')}
            onSelect={() => onPick(undefined)}
          />
        </>
      ) : null}
    </>
  );
}

/**
 * Naming a product event or a declared key, in the section rather than over it.
 *
 * A menu is right for choosing between prepared sentences and wrong for typing
 * one word: the popover covered the rule the creator was about to replace.
 */
function TypedRuleField({
  kind,
  onCancel,
  onCommit,
}: {
  kind: TypedRuleKind;
  onCancel: () => void;
  onCommit: (condition: StepTransitionCondition) => void;
}): ReactNode {
  const [draft, setDraft] = useState('');
  const commit = (): void => {
    const name = draft.trim();
    if (!name) return onCancel();
    onCommit(
      kind === 'event'
        ? { source: 'namedEvent', eventName: normalizeIdentifier(name) }
        : { source: 'documentState', key: normalizeIdentifier(name), operator: 'exists' },
    );
  };
  return (
    <>
      <label className="rich-step-choice-field" data-presentation="text">
        <span className="rich-step-field-label">
          {kind === 'event'
            ? authoringText('After a product event')
            : authoringText('They have declared data')}
        </span>
        <input
          autoFocus
          className="rich-step-text-value"
          data-condition-draft={kind}
          onBlur={commit}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') {
              event.stopPropagation();
              onCancel();
            }
          }}
          placeholder={kind === 'event' ? 'project_created' : 'importedRows'}
          type="text"
          value={draft}
        />
      </label>
      <p className="overlay-step-inspector-note">
        {kind === 'event'
          ? authoringText('The event name your product already sends.')
          : authoringText('A key your product has already declared.')}
      </p>
    </>
  );
}

/**
 * Who the rule above is read against while authoring (§4.3).
 *
 * WIRE_BE: the real traits come from the workspace's identify payload. These are
 * the shape the simulation context already accepts, held for the session so a
 * creator can see which user a rule is being read against.
 */
function TestUserMenu({ onPick }: { onPick: (key: string, value: string) => void }): ReactNode {
  return (
    <>
      <ChromeMenuHeading>
        {authoringText('Test user — drives conditions and branches live')}
      </ChromeMenuHeading>
      {/* No selected marks: three traits held at once would read as one block
          of accent, and the line under the menu already prints the whole user. */}
      {TEST_USER_PRESETS.map((preset) => (
        <ChromeMenuItem
          key={`${preset.key}:${preset.value}`}
          label={authoringText('{key} = {value}', preset)}
          onSelect={() => onPick(preset.key, preset.value)}
        />
      ))}
      <ChromeMenuNote>
        {authoringText('Held for this session while the workspace traits are wired up.')}
      </ChromeMenuNote>
    </>
  );
}

const TEST_USER_PRESETS: readonly { key: string; value: string }[] = [
  { key: 'plan', value: 'growth' },
  { key: 'plan', value: 'free' },
  { key: 'role', value: 'admin' },
  { key: 'role', value: 'member' },
  { key: 'seats', value: '12' },
  { key: 'seats', value: '1' },
];

const DEFAULT_TEST_USER: Record<string, string> = {
  plan: 'growth',
  role: 'admin',
  seats: '12',
};

function traitLine(traits: Record<string, string>): string {
  return Object.entries(traits)
    .map(([key, value]) => `${key}=${value}`)
    .join(' · ');
}

/** A rule, as the sentence it stands for rather than as its three fields. */
function conditionSentence(
  condition: StepTransitionCondition,
  steps: readonly LodariqBlock[],
): string {
  switch (condition.source) {
    case 'identifyTrait':
    case 'documentState': {
      if (condition.operator === 'exists') {
        return authoringText('{key} is set', { key: condition.key });
      }
      const value = String(condition.value ?? '');
      return condition.operator === 'equals'
        ? authoringText('{key} is {value}', { key: condition.key, value })
        : authoringText('{key} is not {value}', { key: condition.key, value });
    }
    case 'namedEvent':
      return authoringText('after the “{event}” event', { event: condition.eventName });
    case 'locale':
      return authoringText('their locale is {locale}', { locale: condition.locale });
    case 'completedStep': {
      const named = steps.find((other) => other.id === condition.stepId);
      return authoringText('they completed “{step}”', {
        step: named ? blockDisplayTitle(named) : condition.stepId,
      });
    }
  }
}
