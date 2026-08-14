import { authoringText } from '../../../i18n';
import type { LodariqBlock } from '@lodariq/schema';
import {
  AlignCenter,
  AuthoringRange,
  AuthoringTextField,
  ChevronRight,
  Circle,
  MousePointerClick,
  MoveHorizontal,
  Palette,
  Shapes,
  SlidersHorizontal,
} from '../design-system';
import type { LocalAuthoringFrameController } from '../controller';
import {
  BUTTON_PROPERTY_DEFINITIONS,
  buttonColorIsCustomized,
  buttonColorContrast,
  buttonWidthDescription,
  type ButtonPropertyContext,
  type ButtonPropertyGroup,
} from './button-properties';
import { PropertyChoiceField, PropertyColorField } from './property-controls';
import { visibleProperties, type PropertyDefinition } from './registry';
import type { EditableActionType } from '../types';

export type ActionPropertyTab = ButtonPropertyGroup;

const BUTTON_PROPERTY_TABS = [
  { value: 'appearance', label: authoringText('Appearance'), icon: Palette },
  { value: 'behavior', label: authoringText('Behavior'), icon: MousePointerClick },
  { value: 'size', label: authoringText('Size'), icon: MoveHorizontal },
  { value: 'alignment', label: authoringText('Alignment'), icon: AlignCenter },
  { value: 'shape', label: authoringText('Shape & icon'), icon: Shapes },
  { value: 'colors', label: authoringText('Colors'), icon: Circle },
  { value: 'spacing', label: authoringText('Spacing'), icon: SlidersHorizontal },
] as const satisfies ReadonlyArray<{
  value: ActionPropertyTab;
  label: string;
  icon: typeof Palette;
}>;

export function ButtonPropertyTabs({
  activeTab,
  onActiveTabChange,
}: {
  activeTab: ActionPropertyTab;
  onActiveTabChange: (tab: ActionPropertyTab) => void;
}) {
  return (
    <nav className="storyboard-property-tabs" aria-label={authoringText('Button settings')}>
      {BUTTON_PROPERTY_TABS.map((option) => {
        const Icon = option.icon;
        const selected = activeTab === option.value;
        return (
          <button
            key={option.value}
            aria-current={selected ? 'page' : undefined}
            className={selected ? 'active' : undefined}
            onClick={() => onActiveTabChange(option.value)}
            type="button"
          >
            <Icon size={15} strokeWidth={2} aria-hidden="true" />
            <span>{option.label}</span>
          </button>
        );
      })}
      <ChevronRight className="storyboard-property-tabs-more" size={17} strokeWidth={2} />
    </nav>
  );
}

export function ButtonPropertyPanel({
  activeTab,
  ariaLabel,
  block,
  controller,
  onActionTypeChange,
  tooltip,
}: {
  activeTab: ActionPropertyTab;
  ariaLabel?: string;
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  onActionTypeChange?: (actionType: EditableActionType) => void;
  tooltip: LodariqBlock;
}) {
  const context = { block, controller, tooltip } satisfies ButtonPropertyContext;
  const properties = visibleProperties(BUTTON_PROPERTY_DEFINITIONS, context, activeTab);
  const classes = [
    'storyboard-tab-panel',
    activeTab === 'behavior' ? 'behavior' : '',
    activeTab === 'colors' ? 'colors' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      className={classes}
      aria-label={ariaLabel ?? authoringText('{tab} settings', { tab: tabLabel(activeTab) })}
    >
      {properties.map((property) => (
        <ButtonPropertyControl
          key={property.id}
          context={context}
          onActionTypeChange={onActionTypeChange}
          property={property}
        />
      ))}
    </section>
  );
}

function ButtonPropertyControl({
  context,
  onActionTypeChange,
  property,
}: {
  context: ButtonPropertyContext;
  onActionTypeChange?: (actionType: EditableActionType) => void;
  property: PropertyDefinition<ButtonPropertyContext>;
}) {
  const value = property.read(context);

  if (property.control === 'segmented' && property.options) {
    return (
      <div className="storyboard-property-control" data-property-id={property.id}>
        <PropertyChoiceField
          label={property.label}
          onChange={(nextValue) => {
            property.apply(context, nextValue);
            if (property.id === 'button.action') {
              onActionTypeChange?.(nextValue as EditableActionType);
            }
          }}
          options={property.options}
          showIcons={property.id === 'button.action'}
          value={String(value)}
        />
        {property.description ? (
          <output className="storyboard-property-note">{property.description}</output>
        ) : null}
        {property.id === 'button.width' && buttonWidthDescription(context.block) ? (
          <output className="storyboard-property-note">
            {buttonWidthDescription(context.block)}
          </output>
        ) : null}
      </div>
    );
  }

  if (property.control === 'text') {
    return (
      <div className="storyboard-property-control" data-property-id={property.id}>
        <AuthoringTextField
          key={String(value)}
          defaultValue={String(value)}
          description={property.description}
          label={property.label}
          onBlur={(event) => property.apply(context, event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          placeholder={authoringText('https://example.com or /path')}
        />
      </div>
    );
  }

  if (property.control === 'color') {
    return (
      <div className="storyboard-property-control" data-property-id={property.id}>
        <PropertyColorField
          contrast={buttonColorContrast(context.block, property.id)}
          customized={buttonColorIsCustomized(context.block, property.id)}
          label={property.label}
          onChange={(nextValue) => property.apply(context, nextValue)}
          onReset={() => property.reset?.(context)}
          value={String(value)}
        />
      </div>
    );
  }

  return (
    <div className="storyboard-property-control" data-property-id={property.id}>
      <AuthoringRange
        label={property.label}
        max={property.max ?? 100}
        min={property.min ?? 0}
        onValueChange={(nextValue) => property.apply(context, nextValue)}
        step={property.step ?? 1}
        unit={property.unit}
        value={Number(value)}
      />
    </div>
  );
}

function tabLabel(tab: ActionPropertyTab): string {
  return BUTTON_PROPERTY_TABS.find((item) => item.value === tab)?.label ?? authoringText('Button');
}
