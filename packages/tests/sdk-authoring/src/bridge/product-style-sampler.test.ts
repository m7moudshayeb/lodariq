// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductStyleProposal, validate } from '@lodariq/schema';
import { sampleProductStyles } from '@lodariq/sdk-authoring/bridge';

describe('bounded product style sampler', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.body.removeAttribute('style');
    if (!globalThis.crypto?.subtle) {
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    }
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits for document readiness by default before reading product styles', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const selected = buildProductFixture();
    let settled = false;

    const proposalPromise = sampleProductStyles({
      document,
      selectedElement: selected,
      waitForAnimationFrame: async () => undefined,
    }).finally(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    document.dispatchEvent(new Event('DOMContentLoaded'));

    await expect(proposalPromise).resolves.toMatchObject({ schemaVersion: '1' });
  });

  it('waits for readiness and two frames, then stays within the sample envelope', async () => {
    const selected = buildProductFixture();
    let routeWaits = 0;
    let frameWaits = 0;

    const proposal = await sampleProductStyles({
      document,
      selectedElement: selected,
      proposalId: 'proposal.test',
      now: () => new Date('2026-08-08T12:00:00.000Z'),
      waitForRouteReady: async () => {
        routeWaits += 1;
      },
      waitForAnimationFrame: async () => {
        frameWaits += 1;
      },
    });

    expect(routeWaits).toBe(1);
    expect(frameWaits).toBe(2);
    expect(proposal.samples.filter((sample) => sample.kind === 'ancestor_context')).toHaveLength(6);
    expect(proposal.samples.filter((sample) => sample.kind === 'nearby_control')).toHaveLength(20);
    expect(proposal.samples.length).toBeLessThanOrEqual(28);
    expect(proposal.requiresConfirmation).toBe(false);
    expect(validate(ProductStyleProposal, proposal).valid).toBe(true);
  });

  it('keeps a text-only sample behind confirmation instead of auto-applying fallback colors', async () => {
    const selected = document.createElement('span');
    selected.textContent = 'Localized product copy';
    selected.style.cssText = [
      'color: rgb(17, 24, 39)',
      'background-color: transparent',
      'font: 400 16px/24px system-ui',
    ].join(';');
    document.body.append(selected);

    const proposal = await sampleProductStyles({
      document,
      selectedElement: selected,
      proposalId: 'proposal.text-only',
      now: () => new Date('2026-08-08T12:00:00.000Z'),
      waitForAnimationFrame: async () => undefined,
    });

    expect(proposal.confidence).toBeLessThan(85);
    expect(proposal.requiresConfirmation).toBe(true);
  });

  it('gives registered semantic tokens priority and emits no captured page identity', async () => {
    const selected = buildProductFixture();
    const proposal = await sampleProductStyles({
      document,
      selectedElement: selected,
      registeredTokens: [
        {
          schemaVersion: '1',
          sourceId: 'customer-design-system',
          revision: 'build-42',
          modes: {
            light: {
              colors: { accent: '#7c3aed', onAccent: '#ffffff' },
              typography: { fontFamilies: ['Customer Sans', 'system-ui'] },
            },
          },
        },
      ],
      proposalId: 'proposal.registered',
      now: () => new Date('2026-08-08T12:00:00.000Z'),
      waitForAnimationFrame: async () => undefined,
    });

    expect(proposal.sources[0]?.kind).toBe('registered_tokens');
    expect(proposal.tokens.modes?.light?.colors?.accent).toBe('#7c3aed');
    const serialized = JSON.stringify(proposal);
    for (const forbidden of [
      'private-customer-copy',
      'customer-secret-class',
      'https://customer.example/private',
      'selector',
      'coordinates',
      'outerHTML',
      'getBoundingClientRect',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function buildProductFixture(): HTMLButtonElement {
  document.body.style.cssText = [
    'color: rgb(17, 24, 39)',
    'background-color: rgb(255, 255, 255)',
    'font-family: "Customer Sans", system-ui',
    'font-size: 16px',
    'font-weight: 400',
    'line-height: 24px',
  ].join(';');

  let parent: HTMLElement = document.body;
  for (let index = 0; index < 7; index += 1) {
    const ancestor = document.createElement('div');
    ancestor.style.cssText = `background-color: rgb(${240 - index}, 240, 240); padding: 8px`;
    parent.append(ancestor);
    parent = ancestor;
  }

  const selected = document.createElement('button');
  selected.id = 'private-customer-copy';
  selected.className = 'customer-secret-class';
  selected.textContent = 'private-customer-copy';
  selected.setAttribute('data-private-url', 'https://customer.example/private');
  selected.style.cssText = [
    'color: rgb(255, 255, 255)',
    'background-color: rgb(36, 87, 255)',
    'border: 1px solid rgb(20, 60, 200)',
    'border-radius: 12px',
    'padding: 8px 16px',
    'font: 600 16px/24px system-ui',
    'width: 180px',
    'max-width: 240px',
  ].join(';');
  parent.append(selected);

  for (let index = 0; index < 25; index += 1) {
    const control = document.createElement('button');
    control.textContent = `Control ${index}`;
    control.style.cssText = [
      'color: rgb(17, 24, 39)',
      'background-color: rgb(245, 245, 245)',
      'border: 1px solid rgb(209, 213, 219)',
      'border-radius: 8px',
      'padding: 6px 12px',
      'font: 500 14px/20px system-ui',
    ].join(';');
    document.body.append(control);
  }
  return selected;
}
