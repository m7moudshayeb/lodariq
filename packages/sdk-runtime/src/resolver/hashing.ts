const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HASH_HEX_LENGTH = 16;

export function fnv1a32(value: string, seed = FNV_OFFSET_BASIS): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

function tokenHash64(value: string): bigint {
  const high = BigInt(fnv1a32(value));
  const low = BigInt(fnv1a32(value, FNV_PRIME ^ value.length));
  return (high << 32n) | low;
}

/** Stable 64-bit SimHash serialized as a bounded lowercase hex value. */
export function simHash(tokens: readonly string[]): string {
  const vector = new Int16Array(64);
  for (const token of new Set(tokens)) {
    const hash = tokenHash64(token);
    for (let bit = 0; bit < 64; bit += 1) {
      vector[bit] = (vector[bit] ?? 0) + (((hash >> BigInt(bit)) & 1n) === 1n ? 1 : -1);
    }
  }

  let result = 0n;
  for (let bit = 0; bit < vector.length; bit += 1) {
    if (vector[bit]! > 0) result |= 1n << BigInt(bit);
  }
  return result.toString(16).padStart(HASH_HEX_LENGTH, '0');
}

export function hashSimilarity(first: string, second: string): number {
  if (!isHexHash(first) || !isHexHash(second)) return 0;
  let difference = BigInt(`0x${first}`) ^ BigInt(`0x${second}`);
  let changedBits = 0;
  while (difference > 0n) {
    changedBits += Number(difference & 1n);
    difference >>= 1n;
  }
  return 1 - changedBits / 64;
}

export function bitGridSimilarity(first: string, second: string): number {
  if (first.length !== second.length || first.length === 0) return 0;
  let matches = 0;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] === second[index]) matches += 1;
  }
  return matches / first.length;
}

function isHexHash(value: string): boolean {
  return value.length === HASH_HEX_LENGTH && /^[0-9a-f]+$/.test(value);
}
