'use client';

import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  LOCALE_OPTIONS,
  localeDirection,
  type SupportedLocale,
} from '@lodariq/i18n';
import { useLingui } from '@lingui/react';
import { Languages, LoaderCircle } from 'lucide-react';
import * as React from 'react';
import { DASHBOARD_LOCALE_MESSAGES } from '../i18n/messages';
import { updateDashboardLocale } from '../lib/client-locale-api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const PSEUDO_LOCALES_VISIBLE = process.env.NODE_ENV !== 'production';

export function LanguageSwitcher({
  compact = false,
}: {
  compact?: boolean;
}): React.ReactElement | null {
  const { _, i18n } = useLingui();
  const selectId = React.useId();
  const activeLocale = isSupportedLocale(i18n.locale) ? i18n.locale : DEFAULT_LOCALE;
  const [selectedLocale, setSelectedLocale] = React.useState<SupportedLocale>(activeLocale);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const rtl = localeDirection(activeLocale) === 'rtl';
  const visibleOptions = React.useMemo(
    () => LOCALE_OPTIONS.filter((option) => PSEUDO_LOCALES_VISIBLE || !option.pseudo),
    [],
  );

  if (visibleOptions.length <= 1) return null;

  async function changeLocale(requestedLocale: string): Promise<void> {
    if (!isSupportedLocale(requestedLocale) || requestedLocale === activeLocale) return;
    setSelectedLocale(requestedLocale);
    setPending(true);
    setError('');
    try {
      await updateDashboardLocale(requestedLocale);
      window.location.reload();
    } catch {
      setSelectedLocale(activeLocale);
      setError(_(DASHBOARD_LOCALE_MESSAGES.error));
      setPending(false);
    }
  }

  const label = _(DASHBOARD_LOCALE_MESSAGES.label);
  const changeLabel = _(DASHBOARD_LOCALE_MESSAGES.change);
  const feedback = error || (pending ? _(DASHBOARD_LOCALE_MESSAGES.changing) : '');
  const options = visibleOptions.map((option) => (
    <SelectItem key={option.locale} value={option.locale}>
      {option.label}
    </SelectItem>
  ));

  if (compact) {
    const tooltipClassName = open
      ? 'hidden'
      : error
        ? 'opacity-100 text-destructive'
        : 'opacity-0 group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100';
    return (
      <div className="group relative mx-auto size-11">
        <Select
          dir={rtl ? 'rtl' : 'ltr'}
          disabled={pending}
          onOpenChange={setOpen}
          onValueChange={(locale) => void changeLocale(locale)}
          open={open}
          value={selectedLocale}
        >
          <SelectTrigger
            aria-label={changeLabel}
            className="size-11 w-11 justify-center border-transparent bg-transparent p-0 text-muted-foreground shadow-none hover:bg-[var(--nav-hover)] hover:text-foreground [&>svg:last-child]:hidden"
            id={selectId}
            title={changeLabel}
          >
            {pending ? (
              <LoaderCircle aria-hidden="true" className="size-[18px] animate-spin" />
            ) : (
              <Languages aria-hidden="true" className="size-[18px]" />
            )}
          </SelectTrigger>
          <SelectContent align="end" side={rtl ? 'left' : 'right'} sideOffset={8}>
            {options}
          </SelectContent>
        </Select>
        <span
          className={`pointer-events-none absolute start-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-semibold shadow-lg transition duration-100 ltr:translate-x-1 rtl:-translate-x-1 motion-reduce:transition-none ${tooltipClassName}`}
          role="tooltip"
        >
          {error || changeLabel}
        </span>
        <span aria-live="polite" className="sr-only">
          {feedback}
        </span>
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={selectId}>
        {label}
      </label>
      <Select
        dir={rtl ? 'rtl' : 'ltr'}
        disabled={pending}
        onOpenChange={setOpen}
        onValueChange={(locale) => void changeLocale(locale)}
        open={open}
        value={selectedLocale}
      >
        <SelectTrigger aria-label={changeLabel} className="ps-3" disabled={pending} id={selectId}>
          {pending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Languages aria-hidden="true" className="size-4 text-muted-foreground" />
          )}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{options}</SelectContent>
      </Select>
      <span aria-live="polite" className={error ? 'text-xs text-destructive' : 'sr-only'}>
        {feedback}
      </span>
    </div>
  );
}
