import { AUTHORING_SESSION_CAPABILITIES, type AuthoringSessionCapability } from '@lodariq/schema';

/**
 * Closed authoring-session capability set shared by repository validation and
 * the Drizzle constraint. The maximum deliberately has no spare headroom: a
 * future capability requires an explicit contract and clean-baseline update.
 */
export const AUTHORING_SESSION_CAPABILITY_VALUES = Object.freeze(
  Object.values(AUTHORING_SESSION_CAPABILITIES),
) as readonly AuthoringSessionCapability[];

export const AUTHORING_SESSION_CAPABILITY_MAX_ITEMS = AUTHORING_SESSION_CAPABILITY_VALUES.length;

export function isValidAuthoringSessionCapabilitySet(
  capabilities: readonly unknown[],
): capabilities is readonly AuthoringSessionCapability[] {
  const allowed = new Set<unknown>(AUTHORING_SESSION_CAPABILITY_VALUES);
  return (
    capabilities.length >= 1 &&
    capabilities.length <= AUTHORING_SESSION_CAPABILITY_MAX_ITEMS &&
    new Set(capabilities).size === capabilities.length &&
    capabilities.every((capability) => allowed.has(capability))
  );
}

/** Exact SQL used by the Drizzle schema; the baseline is checked against it. */
export const AUTHORING_SESSION_CAPABILITIES_CHECK_SQL = [
  'capabilities is null',
  'or (',
  "jsonb_typeof(capabilities) = 'array'",
  `and jsonb_array_length(capabilities) between 1 and ${AUTHORING_SESSION_CAPABILITY_MAX_ITEMS}`,
  `and capabilities <@ ${jsonbLiteral(AUTHORING_SESSION_CAPABILITY_VALUES)}`,
  `and jsonb_array_length(capabilities) = (${AUTHORING_SESSION_CAPABILITY_VALUES.map(
    (capability) => `(case when capabilities @> ${jsonbLiteral([capability])} then 1 else 0 end)`,
  ).join(' + ')})`,
  ')',
].join('\n');

function jsonbLiteral(value: unknown): string {
  return `'${JSON.stringify(value).replace(/'/gu, "''")}'::jsonb`;
}
