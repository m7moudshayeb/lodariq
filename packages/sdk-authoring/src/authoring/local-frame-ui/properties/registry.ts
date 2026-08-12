export type PropertyScope = 'block' | 'step' | 'surface' | 'experience';
export type PropertyControlKind = 'color' | 'range' | 'segmented' | 'text';
export type PropertyValue = number | string;

export interface PropertyOption {
  label: string;
  value: string;
}

export interface PropertyDefinition<Context> {
  control: PropertyControlKind;
  group: string;
  id: string;
  label: string;
  scope: PropertyScope;
  apply(context: Context, value: PropertyValue): void;
  read(context: Context): PropertyValue;
  description?: string;
  isVisible?(context: Context): boolean;
  max?: number;
  min?: number;
  options?: ReadonlyArray<PropertyOption>;
  quick?: boolean;
  reset?(context: Context): void;
  step?: number;
  unit?: string;
}

export function visibleProperties<Context>(
  definitions: ReadonlyArray<PropertyDefinition<Context>>,
  context: Context,
  group: string,
): ReadonlyArray<PropertyDefinition<Context>> {
  return definitions.filter(
    (definition) =>
      definition.group === group && (!definition.isVisible || definition.isVisible(context)),
  );
}
