export function valid(value: unknown): boolean {
  if (!record(value) || value['state'] !== 'available') return true;
  const manifests =
    value['mode'] === 'document-scoped-v2' ? value['manifests'] : [value['manifest']];
  return (
    Array.isArray(manifests) &&
    manifests.every(
      (manifest) =>
        record(manifest) &&
        (manifest['adaptive'] === undefined || validContext(manifest['adaptive'])),
    )
  );
}

function validContext(value: unknown): boolean {
  if (!exactRecord(value, ['policy', 'evaluatedAt', 'evidence'])) return false;
  const policy = value['policy'];
  const evidence = value['evidence'];
  if (
    !exactRecord(policy, ['enabled', 'minimumOccurrences', 'lookbackDays']) ||
    typeof policy['enabled'] !== 'boolean' ||
    !integerBetween(policy['minimumOccurrences'], 1, 20) ||
    !integerBetween(policy['lookbackDays'], 1, 365) ||
    !validTimestamp(value['evaluatedAt']) ||
    !Array.isArray(evidence) ||
    evidence.length > 200
  ) {
    return false;
  }
  return evidence.every(
    (entry) =>
      exactRecord(entry, ['eventName', 'occurrences', 'lastObservedAt']) &&
      typeof entry['eventName'] === 'string' &&
      /^[a-z][a-z0-9_]{0,63}$/u.test(entry['eventName']) &&
      integerBetween(entry['occurrences'], 0, 20) &&
      validTimestamp(entry['lastObservedAt']),
  );
}

function integerBetween(value: unknown, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    record(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
