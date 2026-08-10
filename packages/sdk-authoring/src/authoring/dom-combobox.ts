import { Check, ChevronDown, createElement } from 'lucide';

export type AuthoringDomComboboxIcon = Parameters<typeof createElement>[0];

export interface AuthoringDomComboboxItem<T extends string> {
  icon?: AuthoringDomComboboxIcon;
  label: string;
  /** Keep this value available to setValue while excluding it from the listbox. */
  omitFromList?: boolean;
  value: T;
}

export interface AuthoringDomComboboxClassNames {
  check: string;
  chevron: string;
  listbox: string;
  option: string;
  optionIcon: string;
  root: string;
  trigger: string;
  triggerIcon: string;
  value: string;
}

export interface AuthoringDomComboboxIconSizes {
  check: number;
  chevron: number;
  option: number;
  trigger: number;
}

export interface AuthoringDomComboboxOptions<T extends string> {
  classNames?: Partial<AuthoringDomComboboxClassNames>;
  controlIdPrefix?: string;
  document: Document;
  iconSizes?: Partial<AuthoringDomComboboxIconSizes>;
  initialValue: T;
  items: ReadonlyArray<AuthoringDomComboboxItem<T>>;
  label: string;
  omitSelectedOption?: boolean;
  onChange: (value: T) => void;
  showSelectionIndicator?: boolean;
  /** A fixed trigger icon. When omitted, the selected item's icon is used. */
  triggerIcon?: AuthoringDomComboboxIcon;
}

export interface AuthoringDomCombobox<T extends string> {
  cleanup: () => void;
  close: () => void;
  element: HTMLDivElement;
  /** Updates the control without firing onChange. */
  setValue: (value: T) => void;
  readonly value: T;
}

export const AUTHORING_DOM_COMBOBOX_CLASS_NAMES: Readonly<AuthoringDomComboboxClassNames> = {
  check: 'lodariq-inline-toolbar-check',
  chevron: 'lodariq-inline-toolbar-chevron',
  listbox: 'lodariq-inline-toolbar-listbox',
  option: 'lodariq-inline-toolbar-option',
  optionIcon: 'lodariq-inline-toolbar-option-icon',
  root: 'lodariq-inline-toolbar-combobox',
  trigger: 'lodariq-inline-toolbar-trigger',
  triggerIcon: 'lodariq-inline-toolbar-trigger-icon',
  value: 'lodariq-inline-toolbar-value',
};

const AUTHORING_DOM_COMBOBOX_ICON_SIZES: Readonly<AuthoringDomComboboxIconSizes> = {
  check: 14,
  chevron: 14,
  option: 15,
  trigger: 15,
};

let authoringDomComboboxSequence = 0;

/**
 * Creates an accessible DOM-native combobox for authoring chrome.
 *
 * The defaults intentionally retain the inline preview toolbar's existing DOM
 * classes. Other authoring surfaces can replace individual classes while
 * sharing the same keyboard, focus, and outside-click behavior.
 */
export function createAuthoringDomCombobox<T extends string>(
  options: AuthoringDomComboboxOptions<T>,
): AuthoringDomCombobox<T> {
  const doc = options.document;
  const classNames = { ...AUTHORING_DOM_COMBOBOX_CLASS_NAMES, ...options.classNames };
  const iconSizes = { ...AUTHORING_DOM_COMBOBOX_ICON_SIZES, ...options.iconSizes };
  const root = doc.createElement('div');
  root.className = classNames.root;

  const controlIdPrefix = options.controlIdPrefix ?? 'lodariq-inline-control';
  const controlId = `${controlIdPrefix}-${++authoringDomComboboxSequence}`;
  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.className = classNames.trigger;
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-label', options.label);
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-controls', controlId);
  trigger.setAttribute('aria-expanded', 'false');

  const valueLabel = doc.createElement('span');
  valueLabel.className = classNames.value;
  const chevron = createComboboxIcon(ChevronDown, iconSizes.chevron);
  chevron.classList.add(classNames.chevron);
  trigger.append(valueLabel, chevron);

  const list = doc.createElement('div');
  list.id = controlId;
  list.className = classNames.listbox;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', options.label);
  list.hidden = true;

  let currentValue = options.initialValue;
  let open = false;
  let triggerIconElement: SVGElement | null = null;
  const optionButtons: HTMLButtonElement[] = [];
  const optionCleanups: Array<() => void> = [];

  const itemForValue = (value: T): AuthoringDomComboboxItem<T> | undefined =>
    options.items.find((item) => item.value === value);
  const visibleOptionButtons = (): HTMLButtonElement[] =>
    optionButtons.filter((option) => !option.hidden);

  const updateTriggerIcon = (selectedItem: AuthoringDomComboboxItem<T> | undefined): void => {
    const icon = options.triggerIcon ?? selectedItem?.icon;
    if (!icon) {
      triggerIconElement?.remove();
      triggerIconElement = null;
      return;
    }
    const nextIcon = createComboboxIcon(icon, iconSizes.trigger);
    if (!options.triggerIcon && classNames.triggerIcon) {
      nextIcon.classList.add(classNames.triggerIcon);
    }
    if (triggerIconElement) {
      triggerIconElement.replaceWith(nextIcon);
    } else {
      trigger.insertBefore(nextIcon, valueLabel);
    }
    triggerIconElement = nextIcon;
  };

  const updateSelection = (): void => {
    const selectedItem = itemForValue(currentValue);
    valueLabel.textContent = selectedItem?.label ?? '';
    updateTriggerIcon(selectedItem);
    for (const option of optionButtons) {
      const selected = option.dataset['value'] === currentValue;
      option.setAttribute('aria-selected', String(selected));
      option.hidden = Boolean(options.omitSelectedOption && selected);
      option.querySelector(`.${classNames.check}`)?.toggleAttribute('hidden', !selected);
    }
  };

  const setOpen = (nextOpen: boolean, focusSelected = false): void => {
    open = nextOpen;
    trigger.setAttribute('aria-expanded', String(open));
    list.hidden = !open;
    root.toggleAttribute('data-open', open);
    if (!open || !focusSelected) return;
    const selected = optionButtons.find(
      (option) => !option.hidden && option.dataset['value'] === currentValue,
    );
    queueMicrotask(() => (selected ?? visibleOptionButtons()[0])?.focus());
  };

  for (const item of options.items) {
    if (item.omitFromList) continue;
    const option = doc.createElement('button');
    option.type = 'button';
    option.className = classNames.option;
    option.dataset['value'] = item.value;
    option.setAttribute('role', 'option');
    if (options.showSelectionIndicator !== false) {
      const check = createComboboxIcon(Check, iconSizes.check);
      check.classList.add(classNames.check);
      option.appendChild(check);
    }
    if (item.icon) {
      const optionIcon = createComboboxIcon(item.icon, iconSizes.option);
      optionIcon.classList.add(classNames.optionIcon);
      option.appendChild(optionIcon);
    }
    option.append(item.label);
    const onOptionClick = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      currentValue = item.value;
      updateSelection();
      setOpen(false);
      trigger.focus();
      options.onChange(item.value);
    };
    option.addEventListener('click', onOptionClick);
    optionCleanups.push(() => option.removeEventListener('click', onOptionClick));
    optionButtons.push(option);
    list.appendChild(option);
  }

  const onTriggerClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(!open, !open);
  };
  const onTriggerKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true, true);
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };
  const onListKeyDown = (event: KeyboardEvent): void => {
    const visibleOptions = visibleOptionButtons();
    const currentIndex = visibleOptions.indexOf(doc.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      trigger.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + direction + visibleOptions.length) % visibleOptions.length;
    visibleOptions[nextIndex]?.focus();
  };
  const onDocumentPointerDown = (event: PointerEvent): void => {
    if (!open || event.composedPath().includes(root)) return;
    setOpen(false);
  };

  trigger.addEventListener('click', onTriggerClick);
  trigger.addEventListener('keydown', onTriggerKeyDown);
  list.addEventListener('keydown', onListKeyDown);
  doc.addEventListener('pointerdown', onDocumentPointerDown, true);
  root.append(trigger, list);
  updateSelection();

  return {
    element: root,
    get value() {
      return currentValue;
    },
    setValue: (value) => {
      if (!itemForValue(value)) return;
      currentValue = value;
      updateSelection();
      if (open && !(doc.activeElement instanceof HTMLButtonElement && !doc.activeElement.hidden)) {
        queueMicrotask(() => visibleOptionButtons()[0]?.focus());
      }
    },
    close: () => setOpen(false),
    cleanup: () => {
      setOpen(false);
      trigger.removeEventListener('click', onTriggerClick);
      trigger.removeEventListener('keydown', onTriggerKeyDown);
      list.removeEventListener('keydown', onListKeyDown);
      doc.removeEventListener('pointerdown', onDocumentPointerDown, true);
      optionCleanups.forEach((cleanup) => cleanup());
    },
  };
}

function createComboboxIcon(icon: AuthoringDomComboboxIcon, size: number): SVGElement {
  const element = createElement(icon);
  element.setAttribute('width', String(size));
  element.setAttribute('height', String(size));
  element.setAttribute('stroke-width', '2');
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('focusable', 'false');
  return element;
}
