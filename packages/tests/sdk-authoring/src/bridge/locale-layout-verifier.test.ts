// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  LocaleLayoutQaReport,
  RENDERER_CONTRACT_VERSION,
  validate,
  type LodariqDocument,
} from '@lodariq/schema';
import { LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE } from '@lodariq/schema/dom';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { runLocaleLayoutVerification } from '../../../../../packages/sdk-authoring/src/bridge/locale-layout-verifier';

const UPDATED_AT = '2026-08-22T12:00:00.000Z';

describe('live locale layout verifier', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    if (!globalThis.crypto?.subtle) {
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    }
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
  });

  it('renders every locale through the host player and returns only bounded layout evidence', async () => {
    const documentFixture = structuredClone(tourFixture) as LodariqDocument;
    documentFixture.localization = {
      defaultLocale: 'en',
      variants: [{ locale: 'fr-FR', fallbackLocale: 'en', blocks: [] }],
    };
    const compiled = await compileDocument({
      document: documentFixture,
      theme: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1),
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });
    const stopped: string[] = [];

    const report = await runLocaleLayoutVerification({
      compiled,
      documentRevision: 3,
      ownerIdPrefix: 'locale_layout_owner',
      playPreview: async ({ ownerId, locale }) => mountCard(ownerId, locale === 'fr-FR'),
      stopPreview: (ownerId) => {
        stopped.push(ownerId);
        ownedHost(ownerId)?.remove();
      },
      now: () => new Date(UPDATED_AT),
    });

    expect(validate(LocaleLayoutQaReport, report).valid).toBe(true);
    expect(report).toMatchObject({
      schemaVersion: '1',
      checkedLocaleCount: 2,
      checkedStepCount: 5,
      checkedPresentationCount: 10,
      passedCount: 5,
      failedCount: 5,
      unavailableCount: 0,
      viewport: { width: 390, height: 844 },
    });
    expect(report.findings).toHaveLength(5);
    expect(report.findings[0]).toEqual({
      locale: 'fr-FR',
      stepId: compiled.steps[0]?.id,
      status: 'failed',
      issues: ['horizontal_overflow'],
    });
    expect(stopped).toHaveLength(10);
    expect(JSON.stringify(report)).not.toMatch(/selector|textContent|coordinates|url/iu);
  });
});

function mountCard(ownerId: string, overflows: boolean): void {
  const host = document.createElement('lodariq-tour');
  host.setAttribute(LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE, ownerId);
  const card = document.createElement('div');
  card.setAttribute('role', 'dialog');
  const content = document.createElement('div');
  content.className = 'tour-content';
  const arrow = document.createElement('div');
  arrow.className = 'tour-arrow';
  Object.defineProperties(card, {
    clientWidth: { value: 320 },
    clientHeight: { value: 200 },
    // The positioned arrow intentionally protrudes from anchored cards. It must
    // not make every healthy card look horizontally broken.
    scrollWidth: { value: 328 },
    scrollHeight: { value: 200 },
  });
  Object.defineProperties(content, {
    clientWidth: { value: 296 },
    clientHeight: { value: 176 },
    scrollWidth: { value: overflows ? 336 : 296 },
    scrollHeight: { value: 176 },
  });
  card.getBoundingClientRect = () => rect(24, 24, 320, 200);
  card.append(content, arrow);
  host.attachShadow({ mode: 'open' }).append(card);
  document.body.append(host);
}

function ownedHost(ownerId: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>('lodariq-tour')].find(
      (candidate) => candidate.getAttribute(LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE) === ownerId,
    ) ?? null
  );
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}
