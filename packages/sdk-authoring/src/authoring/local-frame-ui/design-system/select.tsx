import * as RadixPopover from '@radix-ui/react-popover';
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEventHandler,
  type ReactNode,
} from 'react';
import { Check, ChevronDown, Search as SearchIcon } from './icons';
import { useExclusiveFloating } from './exclusive-floating';

export interface AuthoringSelectOption {
  /** Shown only in the open list; the trigger always stays the bare label. */
  description?: string;
  label: string;
  searchText?: string;
  value: string;
}

export interface AuthoringSelectSearchConfig {
  emptyLabel: string;
  label: string;
  placeholder: string;
  /**
   * Turns the list from a gate into a suggestion: whatever was typed can be
   * committed even when nothing matches. `accept` normalizes it and returns null
   * to refuse, `label` names the row that offers it.
   */
  custom?: {
    accept: (query: string) => string | null;
    label: (query: string) => string;
  };
}

export interface AuthoringSelectProps {
  ariaLabel: string;
  /** Extra class on the trigger, for callers that size or place it themselves. */
  className?: string;
  dataAction?: string;
  dataBlockId?: string;
  disabled?: boolean;
  leadingIcon?: ReactNode;
  /** Controlled open state. Left out, the control manages its own. */
  onOpenChange?: (open: boolean) => void;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onValueChange?: (value: string) => void;
  open?: boolean;
  options: readonly AuthoringSelectOption[];
  search?: AuthoringSelectSearchConfig;
  /**
   * `compact` is the prototype's `.pk` pill: a control sized for the 320px
   * anchored inspector rather than for a form in the workspace. A size, not a
   * different control — the menu, the keyboard model and the value are identical.
   */
  size?: 'default' | 'compact';
  /**
   * Fixed text for the trigger instead of the selected option. For a picker that
   * performs an action rather than reporting a state — "Add a language" has to
   * say so, not sit there reading "English".
   */
  triggerLabel?: string;
  title?: string;
  value: string;
}

export function AuthoringSelect({
  ariaLabel,
  className,
  dataAction,
  dataBlockId,
  disabled,
  leadingIcon,
  onOpenChange,
  onPointerDown,
  onValueChange,
  open,
  options,
  search,
  size = 'default',
  triggerLabel,
  title,
  value,
}: AuthoringSelectProps) {
  /*
   * One implementation for both shapes. The plain select used to be a Radix
   * Select, which is modal: while its list is open the page stops receiving
   * pointer events, so a click on the picker in the row below only dismissed
   * the first one and a second click was needed to open the second. Inside a
   * 320px inspector that is most of the interaction. The listbox below is a
   * popover, so neighbouring pickers hand over in one click.
   */
  return (
    <AuthoringListboxSelect
      ariaLabel={ariaLabel}
      className={className}
      dataAction={dataAction}
      dataBlockId={dataBlockId}
      disabled={disabled}
      leadingIcon={leadingIcon}
      onOpenChange={onOpenChange}
      onPointerDown={onPointerDown}
      onValueChange={onValueChange}
      open={open}
      options={options}
      size={size}
      {...(search ? { search } : {})}
      {...(triggerLabel ? { triggerLabel } : {})}
      {...(title ? { title } : {})}
      value={value}
    />
  );
}

function AuthoringListboxSelect({
  ariaLabel,
  className,
  dataAction,
  dataBlockId,
  disabled = false,
  leadingIcon,
  onOpenChange,
  onPointerDown,
  onValueChange,
  open: openProp,
  options,
  search,
  size = 'default',
  triggerLabel,
  title,
  value,
}: AuthoringSelectProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const { open, setOpen, toggle } = useExclusiveFloating({
    ...(onOpenChange ? { onOpenChange } : {}),
    ...(openProp === undefined ? {} : { open: openProp }),
  });
  const [query, setQuery] = useState('');
  const listboxId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = normalizeSearchText(query);
  const filteredOptions = normalizedQuery
    ? options.filter((option) => optionMatchesSearch(option, normalizedQuery))
    : options;
  const activeOption = filteredOptions[activeIndex] ?? filteredOptions[0];
  /* A free-form value is legitimately not in `options`, so the trigger falls back
     to the value itself rather than to the first row, which would misreport it. */
  const selectedOption =
    options.find((option) => option.value === value) ??
    (search?.custom && value ? { label: value, value } : options[0]);

  /* Offered only when nothing matched, so the list stays the fast path. */
  const customValue =
    search?.custom && filteredOptions.length === 0 ? search.custom.accept(query) : null;

  const chooseOption = (option: AuthoringSelectOption): void => {
    onValueChange?.(option.value);
    setOpen(false);
    setQuery('');
  };
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
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
    if (event.key !== 'Enter') return;
    if (activeOption) {
      event.preventDefault();
      chooseOption(activeOption);
      return;
    }
    // Enter commits what was typed, so free-form entry never needs the mouse.
    if (customValue) {
      event.preventDefault();
      chooseOption({ label: customValue, value: customValue });
    }
  };

  return (
    <>
      <RadixPopover.Root
        open={disabled ? false : open}
        onOpenChange={(nextOpen) => {
          if (disabled) return;
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
        {/*
          Anchor rather than Trigger, so this button owns the toggle.
          Radix's own trigger toggles on click, and when another picker's
          dismiss layer has already consumed the pointerdown that click never
          arrives — which is why moving between two pickers took two clicks.
          Toggling on pointerdown puts it in the same phase as the dismissal,
          and the group resolves the two writes in order.
        */}
        <RadixPopover.Anchor asChild>
          <button
            type="button"
            aria-controls={listboxId}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={ariaLabel}
            className={`ui-select-trigger ${className ?? ''}`.trim()}
            data-action={dataAction}
            data-block-id={dataBlockId}
            data-size={size}
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'ArrowDown') return;
              event.preventDefault();
              setOpen(true);
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              onPointerDown?.(event);
              toggle();
            }}
            role="combobox"
            title={title}
          >
            <SelectLeadingIcon icon={leadingIcon} />
            <span className="ui-select-value">{triggerLabel ?? selectedOption?.label}</span>
            <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </RadixPopover.Anchor>
        <RadixPopover.Portal>
          <RadixPopover.Content
            align="start"
            className={`ui-select-content${search ? ' ui-searchable-select-content' : ''}`}
            onKeyDown={search ? undefined : handleSearchKeyDown}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              /* Without a search box the list itself takes the caret, so the
                 arrow keys land somewhere that can act on them. */
              (searchInputRef.current ?? optionsRef.current)?.focus();
            }}
            sideOffset={5}
          >
            {search ? (
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
            ) : null}
            <div
              ref={optionsRef}
              aria-activedescendant={
                search || !activeOption ? undefined : searchableOptionId(listboxId, activeIndex)
              }
              aria-label={search ? undefined : ariaLabel}
              className="ui-searchable-select-options"
              id={listboxId}
              role="listbox"
              tabIndex={search ? undefined : -1}
            >
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
                  <span className="ui-select-item-text">
                    {option.label}
                    {option.description ? (
                      <small className="ui-select-item-description">{option.description}</small>
                    ) : null}
                  </span>
                  {option.value === value ? (
                    <span className="ui-select-indicator" aria-hidden="true">
                      <Check size={14} strokeWidth={2.3} />
                    </span>
                  ) : null}
                </button>
              ))}
              {customValue ? (
                <button
                  type="button"
                  className="ui-select-item ui-searchable-select-option active"
                  data-select-custom={customValue}
                  onClick={() => chooseOption({ label: customValue, value: customValue })}
                  role="option"
                  aria-selected={false}
                >
                  <span className="ui-select-item-text">{search?.custom?.label(query)}</span>
                </button>
              ) : null}
              {search && filteredOptions.length === 0 && !customValue ? (
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
        dataAction={dataAction ?? ''}
        dataBlockId={dataBlockId ?? ''}
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
      {/* A free-form value has no row of its own; without one React reports the
          mirror as unset and the test hook reads the wrong language. */}
      {options.some((option) => option.value === value) ? null : (
        <option value={value}>{value}</option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function SelectField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="content-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
