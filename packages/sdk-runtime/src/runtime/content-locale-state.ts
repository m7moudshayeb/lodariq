let activeLocale: string | null = null;

export function setActiveContentLocale(locale: string): void {
  activeLocale = locale;
}

export function activeContentLocale(): string | null {
  return activeLocale;
}

export function clearActiveContentLocale(): void {
  activeLocale = null;
}
