const MAX_TEXT_TOKENS = 64;

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function tokenize(value: string, locale?: string): string[] {
  return normalizeWhitespace(value)
    .toLocaleLowerCase(locale)
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, MAX_TEXT_TOKENS);
}

export function jaccardSimilarity(first: readonly string[], second: readonly string[]): number {
  if (first.length === 0 || second.length === 0) return 0;
  const firstSet = new Set(first);
  const secondSet = new Set(second);
  let intersection = 0;
  for (const token of firstSet) {
    if (secondSet.has(token)) intersection += 1;
  }
  const union = new Set([...firstSet, ...secondSet]).size;
  return union > 0 ? intersection / union : 0;
}

/** Same-locale fuzzy evidence only; callers must never count it as durable identity. */
export function localizedTextSimilarity(
  first: string | null | undefined,
  second: string | null | undefined,
  locale?: string,
): number {
  if (!first || !second) return 0;
  const normalizedFirst = normalizeWhitespace(first).toLocaleLowerCase(locale);
  const normalizedSecond = normalizeWhitespace(second).toLocaleLowerCase(locale);
  if (normalizedFirst === normalizedSecond) return 1;
  return jaccardSimilarity(tokenize(normalizedFirst, locale), tokenize(normalizedSecond, locale));
}
