import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRODUCT_CAPABILITY_IDS, ProductCapabilityClaim, validate } from '@lodariq/schema';
import {
  PRODUCT_CAPABILITY_INVENTORY,
  productCapabilityClaim,
} from '@lodariq/schema/product-capability-inventory';
import { productCapabilityIsImplemented } from '@lodariq/schema/product-capabilities-runtime';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

describe('Product capability inventory', () => {
  it('has one valid claim for every declared capability', () => {
    expect(Object.keys(PRODUCT_CAPABILITY_INVENTORY).sort()).toEqual(
      [...PRODUCT_CAPABILITY_IDS].sort(),
    );

    for (const id of PRODUCT_CAPABILITY_IDS) {
      const claim = productCapabilityClaim(id);
      expect(validate(ProductCapabilityClaim, claim).valid).toBe(true);
      expect(claim.note.trim().length, id).toBeGreaterThan(0);
    }
  });

  it('requires evidence for implemented and partial claims', () => {
    for (const id of PRODUCT_CAPABILITY_IDS) {
      const claim = productCapabilityClaim(id);
      if (claim.state === 'implemented' || claim.state === 'partial') {
        expect(claim.evidence, id).not.toHaveLength(0);
        expect(claim.evidence[0], id).toMatch(/^(?:code|contract|migration|test):/u);
        for (const evidence of claim.evidence) {
          const [, path] = evidence.split(':', 2);
          expect(existsSync(`${REPOSITORY_ROOT}${path}`), `${id}: ${evidence}`).toBe(true);
        }
      }
    }
  });

  it('enables only fully implemented capabilities', () => {
    for (const id of PRODUCT_CAPABILITY_IDS) {
      expect(productCapabilityIsImplemented(id), id).toBe(
        PRODUCT_CAPABILITY_INVENTORY[id].state === 'implemented',
      );
    }

    expect(productCapabilityIsImplemented('delivery.immutable-publication')).toBe(true);
    expect(productCapabilityIsImplemented('delivery.ab-testing')).toBe(true);
    expect(productCapabilityIsImplemented('analytics.segmentation')).toBe(true);
    expect(productCapabilityIsImplemented('authoring.templates')).toBe(true);
    expect(productCapabilityIsImplemented('authoring.spotlight-motion')).toBe(true);
    expect(productCapabilityIsImplemented('runtime.target-focus')).toBe(true);
    expect(productCapabilityIsImplemented('runtime.block-conditions')).toBe(true);
    expect(productCapabilityIsImplemented('delivery.direct-production-publish')).toBe(false);
  });

  it('keeps commercial state separate from delivery support', () => {
    for (const id of PRODUCT_CAPABILITY_IDS.filter((candidate) =>
      candidate.startsWith('commercial.'),
    )) {
      expect(PRODUCT_CAPABILITY_INVENTORY[id].layer).toBe('commercial');
    }

    expect(PRODUCT_CAPABILITY_INVENTORY['delivery.direct-production-publish'].state).toBe(
      'disabled',
    );
    expect(PRODUCT_CAPABILITY_INVENTORY['authoring.voice-cloning']).toMatchObject({
      state: 'disabled',
      note: expect.stringContaining('product non-goal'),
    });
  });
});
