// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import {
  contentLocaleDirection,
  contentLocaleFlag,
  contentLocaleLabel,
  contentLocaleOptions,
  contentLocaleSearchText,
} from '../../../../../packages/sdk-authoring/src/authoring/content-locales';

/**
 * A customer's copy is opaque text we never parse, so the language it is written
 * in is theirs to declare. The tag is a routing key — what the runtime matches an
 * end user against and puts in `lang` — not a claim we are entitled to check
 * against the list of languages Lodariq's own chrome happens to speak.
 */
describe('content locales are the customer’s, not the product’s', () => {
  it('accepts a language Lodariq has no UI catalog for', () => {
    const controller = createController();
    for (const tag of ['ja', 'sv', 'zh-Hans', 'he', 'sw']) {
      controller.setContentLocale(tag);
      expect(controller.getSnapshot().contentLocale).toBe(tag);
    }
  });

  it('canonicalizes rather than rejecting a differently-cased or underscored tag', () => {
    const controller = createController();
    controller.setContentLocale('PT_br');
    expect(controller.getSnapshot().contentLocale).toBe('pt-BR');
  });

  it('refuses a non-tag out loud instead of returning silently', () => {
    const controller = createController();
    controller.setContentLocale('ja');
    controller.setContentLocale('not a language!!');
    const snapshot = controller.getSnapshot();
    expect(snapshot.contentLocale).toBe('ja');
    expect(snapshot.status).toMatch(/language tag/iu);
  });

  it('adds a language as an empty variant, so it shows up before a word is written', () => {
    const controller = createController();
    const before = controller.getSnapshot().documentState.localization?.variants ?? [];
    expect(before.map((variant) => variant.locale)).not.toContain('ja');

    controller.addContentLocale('ja');

    const after = controller.getSnapshot().documentState.localization?.variants ?? [];
    const added = after.find((variant) => variant.locale === 'ja');
    expect(added).toBeDefined();
    expect(added?.blocks).toEqual([]);
    expect(added?.fallbackLocale).toBe('en');
    expect(controller.getSnapshot().contentLocale).toBe('ja');
  });

  it('does not add a variant for the source language, which is not one', () => {
    const controller = createController();
    controller.addContentLocale('en');
    const variants = controller.getSnapshot().documentState.localization?.variants ?? [];
    expect(variants.map((variant) => variant.locale)).not.toContain('en');
  });

  it('gives every language a flag, from the tag when it names a region', () => {
    expect(contentLocaleFlag('pt-BR')).toBe('🇧🇷');
    expect(contentLocaleFlag('en-GB')).toBe('🇬🇧');
    // No region in the tag, so CLDR's most likely one stands in.
    expect(contentLocaleFlag('ja')).toBe('🇯🇵');
    expect(contentLocaleFlag('de')).toBe('🇩🇪');
    // Nothing CLDR can place still leads with a glyph rather than a ragged row.
    expect(contentLocaleFlag('qqq')).toBe('🌐');
  });

  it('suggests one entry per language, not a region variant beside it', () => {
    const values = contentLocaleOptions().map((option) => option.value);
    for (const regional of ['en-GB', 'en-US', 'pt-BR', 'fr-CA', 'nl-BE']) {
      expect(values).not.toContain(regional);
    }
    // Scripts are not regions: these are different writing systems.
    expect(values).toContain('zh-Hans');
    expect(values).toContain('zh-Hant');
  });

  it('shows a region variant the document does have, flag and all', () => {
    const [first] = contentLocaleOptions(['en-GB']);
    expect(first?.value).toBe('en-GB');
    expect(first?.label).toBe('🇬🇧 EN-GB');
    expect(first?.description).toBe('British English');
    expect(contentLocaleOptions(['ja'])[0]?.label).toBe('🇯🇵 JA');
  });

  it('knows which way a language runs, including with a region or script on it', () => {
    for (const tag of ['ar', 'he', 'fa', 'ur', 'ar-EG', 'ckb']) {
      expect(contentLocaleDirection(tag)).toBe('rtl');
    }
    for (const tag of ['en', 'ja', 'pt-BR', 'zh-Hans', 'qqq']) {
      expect(contentLocaleDirection(tag)).toBe('ltr');
    }
  });

  it('names a language in its own words, and falls back to the bare tag', () => {
    expect(contentLocaleLabel('ja')).toBe('日本語');
    // Standalone form, so a list of names does not read as a list of typos.
    expect(contentLocaleLabel('sv')).toBe('Svenska');
    expect(contentLocaleLabel('fr')).toBe('Français');
    // Well-formed but not a language Intl can name: the tag is the honest answer.
    expect(contentLocaleLabel('qqq')).toBe('qqq');
  });

  it('is searchable by endonym, English name and tag alike', () => {
    const searchText = contentLocaleSearchText('ja').toLowerCase();
    expect(searchText).toContain('ja');
    expect(searchText).toContain('japanese');
    expect(contentLocaleSearchText('ja')).toContain('日本語');
  });

  it('offers the document’s own languages before the suggestions', () => {
    const options = contentLocaleOptions(['ja', 'en']);
    expect(options[0]?.value).toBe('ja');
    expect(options[1]?.value).toBe('en');
    // Suggestions are a convenience, so they are additive and never a filter.
    expect(options.length).toBeGreaterThan(50);
    expect(options.filter((option) => option.value === 'en')).toHaveLength(1);
  });
});

function createController(): LocalAuthoringFrameController {
  document.body.innerHTML = '<div id="authoring"></div>';
  const controller = new LocalAuthoringFrameController({
    root: document.getElementById('authoring')!,
    baseDocument: structuredClone(tourFixture) as LodariqDocument,
    services: {
      loadDocument: () => null,
      saveDocument: vi.fn(),
      exportDocument: (value) => JSON.stringify(value),
      importDocument: (value) => JSON.parse(value) as LodariqDocument,
      resetDocuments: vi.fn(),
      compilePreview: vi.fn().mockResolvedValue({}),
      recordMetric: vi.fn(),
      getMetricsSummary: () => ({}),
      exportMetricsReport: () => '{}',
    },
    sessionId: 'session_content_locales',
    peerWindow: window,
  });
  controller.start();
  return controller;
}
