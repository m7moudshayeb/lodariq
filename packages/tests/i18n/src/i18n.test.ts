import {
  DEFAULT_LOCALE,
  PRODUCT_LOCALES,
  EXPANDED_PSEUDO_LOCALE,
  RTL_PSEUDO_LOCALE,
  formatDateTime,
  formatNumber,
  isProductLocale,
  localeDirection,
  localeFromAcceptLanguage,
  matchSupportedLocale,
  pseudoLocalize,
  resolveClientLocale,
  resolveSupportedLocale,
} from '@lodariq/i18n';
import {
  authoringText,
  configureAuthoringLocale,
  resetAuthoringLocaleForTests,
} from '@lodariq/sdk-authoring/i18n';
import {
  configureRuntimeLocale,
  resetRuntimeLocaleForTests,
  runtimeText,
} from '@lodariq/sdk-runtime/i18n';
import { describe, expect, it } from 'vitest';

describe('@lodariq/i18n locale policy', () => {
  it('normalizes exact and language-only supported locales', () => {
    expect(matchSupportedLocale('en_US')).toBe(DEFAULT_LOCALE);
    expect(matchSupportedLocale('en-XA')).toBe(EXPANDED_PSEUDO_LOCALE);
    expect(matchSupportedLocale('ar-XB')).toBe(RTL_PSEUDO_LOCALE);
    expect(matchSupportedLocale('de-DE')).toBe('de');
    expect(matchSupportedLocale('nl-NL')).toBe('nl-BE');
    expect(matchSupportedLocale('ja-JP')).toBeNull();
  });

  it('negotiates Accept-Language by quality and falls back safely', () => {
    expect(localeFromAcceptLanguage('de-DE;q=0.9, en-US;q=0.8')).toBe('de');
    expect(localeFromAcceptLanguage('en;q=0.4, ar-XB;q=0.8')).toBe(RTL_PSEUDO_LOCALE);
    expect(localeFromAcceptLanguage('*, invalid;q=nope')).toBeNull();
  });

  it('gives a valid cookie precedence over the request header', () => {
    expect(resolveSupportedLocale({ cookieLocale: 'ar-XB', acceptLanguage: 'en-US' })).toBe(
      RTL_PSEUDO_LOCALE,
    );
    expect(resolveSupportedLocale({ cookieLocale: 'de', acceptLanguage: 'fr' })).toBe('de');
    expect(resolveSupportedLocale({ cookieLocale: 'ja', acceptLanguage: 'fr-FR' })).toBe('fr');
  });

  it('exposes direction independently of translated copy', () => {
    expect(PRODUCT_LOCALES.filter((locale) => localeDirection(locale) === 'rtl')).toEqual(['ar']);
    expect(localeDirection(EXPANDED_PSEUDO_LOCALE)).toBe('ltr');
    expect(localeDirection(RTL_PSEUDO_LOCALE)).toBe('rtl');
  });

  it('keeps test-only pseudo locales outside the production locale set', () => {
    expect(PRODUCT_LOCALES.every(isProductLocale)).toBe(true);
    expect(isProductLocale(EXPANDED_PSEUDO_LOCALE)).toBe(false);
    expect(isProductLocale(RTL_PSEUDO_LOCALE)).toBe(false);
  });

  it('formats values with an explicit locale', () => {
    expect(formatNumber(1234, DEFAULT_LOCALE)).toBe('1,234');
    expect(formatDateTime('not-a-date', DEFAULT_LOCALE)).toBe('not-a-date');
    expect(formatDateTime('2026-08-12T10:00:00.000Z', DEFAULT_LOCALE, { year: 'numeric' })).toBe(
      '2026',
    );
  });

  it('resolves ordered browser locale candidates', () => {
    expect(resolveClientLocale(['ja-JP', 'fr-BE', 'en'])).toBe('fr');
    expect(resolveClientLocale([null, undefined, 'ar'])).toBe('ar');
  });

  it('pseudo-localizes copy without changing interpolation placeholders', () => {
    const expanded = pseudoLocalize('Save {count} changes', EXPANDED_PSEUDO_LOCALE);
    expect(expanded).toContain('{count}');
    expect(expanded).not.toBe('Save {count} changes');
    expect(pseudoLocalize('Save', RTL_PSEUDO_LOCALE)).toMatch(/^\u202e/u);
  });

  it('loads translated authoring and runtime catalogs with interpolation', async () => {
    await configureAuthoringLocale(['de']);
    expect(authoringText('Save draft')).not.toBe('Save draft');
    expect(authoringText('{count} setup actions', { count: 3 })).toContain('3');

    configureRuntimeLocale(['ar']);
    expect(runtimeText('Skip tour')).not.toBe('Skip tour');

    resetAuthoringLocaleForTests();
    resetRuntimeLocaleForTests();
  });
});
