// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type LodariqBlock,
  type LodariqDocument,
} from '@lodariq/schema';
import { LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE } from '@lodariq/schema/dom';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { runPublicationBrowserVerification } from '@lodariq/sdk-authoring/bridge';

const PREVIEW_OWNER_ID = 'verification_owner_all_targets';

describe('publication browser verifier', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    if (!globalThis.crypto?.subtle) {
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    }
  });

  it('fails target resolution when any target referenced by a later step is unavailable', async () => {
    const documentFixture = twoTargetDocument();
    const compiled = await compileDocument({
      document: documentFixture,
      theme: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1),
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });
    const availableTarget = document.createElement('button');
    availableTarget.setAttribute('data-lodariq-id', 'new-project');
    availableTarget.setAttribute('aria-label', 'New project');
    availableTarget.getBoundingClientRect = () =>
      ({
        x: 40,
        y: 40,
        left: 40,
        top: 40,
        right: 200,
        bottom: 80,
        width: 160,
        height: 40,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.append(availableTarget);

    const report = await runPublicationBrowserVerification({
      compiled,
      expectedContentHash: compiled.contentHash,
      previewOwnerId: PREVIEW_OWNER_ID,
      playExactArtifact: async () => mountRenderedTour(),
      stopExactArtifact: () =>
        document
          .querySelector(
            `lodariq-tour[${LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE}="${PREVIEW_OWNER_ID}"]`,
          )
          ?.remove(),
      now: () => new Date('2026-08-08T12:00:00.000Z'),
    });

    expect(report.checks).toHaveLength(15);
    expect(report.checks.find((check) => check.code === 'targets_resolved')?.status).toBe('failed');
    expect(report.status).toBe('failed');
  });

  it('checks keyboard traversal and focus restoration around exact-artifact playback', async () => {
    const documentFixture = structuredClone(tourFixture) as LodariqDocument;
    const compiled = await compileDocument({
      document: documentFixture,
      theme: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1),
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });
    const productTarget = document.createElement('button');
    productTarget.setAttribute('data-lodariq-id', 'new-project');
    productTarget.setAttribute('aria-label', 'New project');
    document.body.append(productTarget);
    productTarget.focus();

    const report = await runPublicationBrowserVerification({
      compiled,
      expectedContentHash: compiled.contentHash,
      previewOwnerId: PREVIEW_OWNER_ID,
      playExactArtifact: async () => mountRenderedTour(),
      stopExactArtifact: () => {
        document
          .querySelector(
            `lodariq-tour[${LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE}="${PREVIEW_OWNER_ID}"]`,
          )
          ?.remove();
        productTarget.focus();
      },
      now: () => new Date('2026-08-08T12:00:00.000Z'),
    });

    expect(report.checks.find((check) => check.code === 'keyboard_navigation')?.status).toBe(
      'passed',
    );
    expect(report.checks.find((check) => check.code === 'focus_restoration')?.status).toBe(
      'passed',
    );
  });
});

function twoTargetDocument(): LodariqDocument {
  const fixture = structuredClone(tourFixture) as LodariqDocument;
  fixture.targets.push({
    id: 'target_later_step',
    fingerprint: {
      tagName: 'button',
      role: 'button',
      accessibleName: 'Later action',
      stableAttributes: { 'data-lodariq-id': 'later-action' },
    },
  });
  const laterStep = structuredClone(fixture.blocks[0]) as LodariqBlock;
  laterStep.id = 'block_step_2';
  laterStep.props.index = 1;
  const tooltip = laterStep.children[0];
  if (!tooltip) throw new Error('Tour fixture tooltip is missing');
  tooltip.id = 'block_tooltip_2';
  tooltip.props.targetId = 'target_later_step';
  for (const child of tooltip.children) child.id = `${child.id}_later`;
  fixture.blocks.push(laterStep);
  return fixture;
}

function mountRenderedTour(): void {
  const host = document.createElement('lodariq-tour');
  host.setAttribute(LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE, PREVIEW_OWNER_ID);
  const shadow = host.attachShadow({ mode: 'open' });
  const card = document.createElement('div');
  card.setAttribute('role', 'dialog');
  const primaryAction = document.createElement('button');
  primaryAction.textContent = 'Continue';
  card.append(primaryAction);
  shadow.append(card);
  document.body.append(host);
}
