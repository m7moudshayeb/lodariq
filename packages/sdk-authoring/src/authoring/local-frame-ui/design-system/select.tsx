import * as RadixPopover from '@radix-ui/react-popover';
import * as RadixSelect from '@radix-ui/react-select';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown, Search as SearchIcon } from './icons';

const EMPTY_SELECT_VALUE = '__lodariq_empty__';

export interface AuthoringSelectOption {
  label: string;
  searchText?: string;
  value: string;
}

export interface AuthoringSelectSearchConfig {
  emptyLabel: string;
  label: string;
  placeholder: string;
}

export interface AuthoringSelectProps {
  ariaLabel: string;
  dataAction: string;
  dataBlockId: string;
  leadingIcon?: ReactNode;
  onValueChange?: (value: string) => void;
  options: readonly AuthoringSelectOption[];
  search?: AuthoringSelectSearchConfig;
  value: string;
}

export function AuthoringSelect({
  ariaLabel,
  dataAction,
  dataBlockId,
  leadingIcon,
  onValueChange,
  options,
  search,
  value,
}: AuthoringSelectProps) {
  if (search) {
    return (
      <AuthoringSearchableSelect
        ariaLabel={ariaLabel}
        dataAction={dataAction}
        dataBlockId={dataBlockId}
        leadingIcon={leadingIcon}
        onValueChange={onValueChange}
        options={options}
        search={search}
        value={value}
      />
    );
  }

  const radixValue = toRadixSelectValue(value);
  return (
    <RadixSelect.Root
      value={radixValue}
      onValueChange={(nextValue) => onValueChange?.(fromRadixSelectValue(nextValue))}
    >
      <RadixSelect.Trigger
        aria-label={ariaLabel}
        className="ui-select-trigger"
        data-action={dataAction}
        data-block-id={dataBlockId}
      >
        <SelectLeadingIcon icon={leadingIcon} />
        <span className="ui-select-value">
          <RadixSelect.Value />
        </span>
        <RadixSelect.Icon asChild>
          <ChevronDown size={14} strokeWidth={2.2} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="ui-select-content" position="popper" sideOffset={5}>
          <RadixSelect.Viewport className="ui-select-viewport">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                className="ui-select-item"
                value={toRadixSelectValue(option.value)}
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="ui-select-indicator">
                  <Check size={14} strokeWidth={2.3} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
      <NativeSelectMirror
        ariaLabel={ariaLabel}
        dataAction={dataAction}
        dataBlockId={dataBlockId}
        onValueChange={onValueChange}
        options={options}
        value={value}
      />
    </RadixSelect.Root>
  );
}

function AuthoringSearchableSelect({
  ariaLabel,
  dataAction,
  dataBlockId,
  leadingIcon,
  onValueChange,
  options,
  search,
  value,
}: AuthoringSelectProps & { search: AuthoringSelectSearchConfig }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const listboxId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = normalizeSearchText(query);
  const filteredOptions = normalizedQuery
    ? options.filter((option) => optionMatchesSearch(option, normalizedQuery))
    : options;
  const activeOption = filteredOptions[activeIndex] ?? filteredOptions[0];
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  const chooseOption = (option: AuthoringSelectOption): void => {
    onValueChange?.(option.value);
    setOpen(false);
    setQuery('');
  };
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (filteredOptions.length === 0) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(
        (index) => (index + direction + filteredOptions.length) % filteredOptions.length,
      );
      return;
    }
    if (event.key === 'Enter' && activeOption) {
      event.preventDefault();
      chooseOption(activeOption);
    }
  };

  return (
    <>
      <RadixPopover.Root
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          setQuery('');
          setActiveIndex(
            Math.max(
              0,
              options.findIndex((option) => option.value === value),
            ),
          );
        }}
      >
        <RadixPopover.Trigger asChild>
          <button
            type="button"
            aria-controls={listboxId}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={ariaLabel}
            className="ui-select-trigger"
            data-action={dataAction}
            data-block-id={dataBlockId}
            role="combobox"
          >
            <SelectLeadingIcon icon={leadingIcon} />
            <span className="ui-select-value">{selectedOption?.label}</span>
            <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </RadixPopover.Trigger>
        <RadixPopover.Portal>
          <RadixPopover.Content
            align="start"
            className="ui-select-content ui-searchable-select-content"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              searchInputRef.current?.focus();
            }}
            sideOffset={5}
          >
            <div className="ui-select-search-field">
              <SearchIcon size={14} strokeWidth={2} aria-hidden="true" />
              <input
                ref={searchInputRef}
                aria-activedescendant={
                  activeOption ? searchableOptionId(listboxId, activeIndex) : undefined
                }
                aria-controls={listboxId}
                aria-expanded="true"
                aria-label={search.label}
                autoComplete="off"
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder={search.placeholder}
                role="combobox"
                spellCheck={false}
                type="search"
                value={query}
              />
            </div>
            <div className="ui-searchable-select-options" id={listboxId} role="listbox">
              {filteredOptions.map((option, index) => (
                <button
                  type="button"
                  aria-selected={option.value === value}
                  className={`ui-select-item ui-searchable-select-option ${index === activeIndex ? 'active' : ''}`.trim()}
                  id={searchableOptionId(listboxId, index)}
                  key={option.value}
                  onClick={() => chooseOption(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                >
                  <span>{option.label}</span>
                  {option.value === value ? (
                    <span className="ui-select-indicator" aria-hidden="true">
                      <Check size={14} strokeWidth={2.3} />
                    </span>
                  ) : null}
                </button>
              ))}
              {filteredOptions.length === 0 ? (
                <div className="ui-select-empty" role="status">
                  {search.emptyLabel}
                </div>
              ) : null}
            </div>
          </RadixPopover.Content>
        </RadixPopover.Portal>
      </RadixPopover.Root>
      <NativeSelectMirror
        ariaLabel={ariaLabel}
        dataAction={dataAction}
        dataBlockId={dataBlockId}
        onValueChange={onValueChange}
        options={options}
        value={value}
      />
    </>
  );
}

function SelectLeadingIcon({ icon }: { icon?: ReactNode }) {
  return icon ? (
    <span className="ui-select-leading-icon" aria-hidden="true">
      {icon}
    </span>
  ) : null;
}

function optionMatchesSearch(option: AuthoringSelectOption, query: string): boolean {
  return normalizeSearchText(`${option.label} ${option.value} ${option.searchText ?? ''}`).includes(
    query,
  );
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
}

function searchableOptionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`;
}

function NativeSelectMirror({
  ariaLabel,
  dataAction,
  dataBlockId,
  onValueChange,
  options,
  value,
}: {
  ariaLabel: string;
  dataAction: string;
  dataBlockId: string;
  onValueChange?: (value: string) => void;
  options: readonly AuthoringSelectOption[];
  value: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className="ui-native-select-mirror"
      data-action={dataAction}
      data-block-id={dataBlockId}
      onChange={(event) => onValueChange?.(event.currentTarget.value)}
      tabIndex={-1}
      value={value}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function toRadixSelectValue(value: string): string {
  return value === '' ? EMPTY_SELECT_VALUE : value;
}

function fromRadixSelectValue(value: string): string {
  return value === EMPTY_SELECT_VALUE ? '' : value;
}

export function SelectField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="content-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
