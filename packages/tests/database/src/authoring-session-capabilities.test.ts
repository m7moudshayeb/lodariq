import { describe, expect, it } from 'vitest';
import {
  AUTHORING_SESSION_CAPABILITIES_CHECK_SQL,
  AUTHORING_SESSION_CAPABILITY_MAX_ITEMS,
  AUTHORING_SESSION_CAPABILITY_VALUES,
  getAuthoringDocumentSessionCapabilities,
  isValidAuthoringSessionCapabilitySet,
} from '@lodariq/database';
import { AUTHORING_SESSION_CAPABILITIES } from '@lodariq/schema';
import { readInitialBaseline } from './migration-test-utils.js';

describe('authoring-session capability persistence contract', () => {
  it('accepts the generated development and staging sets against the closed canonical set', () => {
    const development = getAuthoringDocumentSessionCapabilities('development');
    const staging = getAuthoringDocumentSessionCapabilities('staging');

    expect(isValidAuthoringSessionCapabilitySet(development)).toBe(true);
    expect(isValidAuthoringSessionCapabilitySet(staging)).toBe(true);
    expect(development).toHaveLength(6);
    expect(new Set(development)).toEqual(
      new Set([
        AUTHORING_SESSION_CAPABILITIES.PREVIEW_DOCUMENT,
        AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT,
        AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
        AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
        AUTHORING_SESSION_CAPABILITIES.SELECT_TARGET,
        AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
      ]),
    );
    expect(development).not.toContain(AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE);
    expect(development).not.toContain(AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE);
    expect(staging).toHaveLength(AUTHORING_SESSION_CAPABILITY_MAX_ITEMS);
    expect(new Set(staging)).toEqual(new Set(AUTHORING_SESSION_CAPABILITY_VALUES));
  });

  it('rejects empty, duplicate, unknown, and over-bound sets', () => {
    const read = AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT;
    const all = [...AUTHORING_SESSION_CAPABILITY_VALUES];

    expect(isValidAuthoringSessionCapabilitySet([])).toBe(false);
    expect(isValidAuthoringSessionCapabilitySet([read, read])).toBe(false);
    expect(isValidAuthoringSessionCapabilitySet([read, 'document:unknown'])).toBe(false);
    expect(isValidAuthoringSessionCapabilitySet([...all, read])).toBe(false);
  });

  it('keeps the clean baseline synchronized with the Drizzle check, including uniqueness', () => {
    const baseline = compactSql(readInitialBaseline());
    const drizzleCheck = normalizeSql(AUTHORING_SESSION_CAPABILITIES_CHECK_SQL);

    expect(baseline).toContain(compactSql(AUTHORING_SESSION_CAPABILITIES_CHECK_SQL));
    expect(drizzleCheck).toContain(
      `jsonb_array_length(capabilities) between 1 and ${AUTHORING_SESSION_CAPABILITY_MAX_ITEMS}`,
    );
    expect(drizzleCheck).toContain('jsonb_array_length(capabilities) = (');
    for (const capability of AUTHORING_SESSION_CAPABILITY_VALUES) {
      expect(drizzleCheck).toContain(`capabilities @> '["${capability}"]'::jsonb`);
    }
  });
});

function normalizeSql(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function compactSql(value: string): string {
  return value.replace(/\s+/gu, '');
}
