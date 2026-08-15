import { createHash, randomBytes } from 'node:crypto';

const RECOVERY_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function hashWebAuthnChallenge(challenge: string): string {
  return createHash('sha256').update(challenge, 'utf8').digest('hex');
}

export function createRecoveryCodes(count = 10): string[] {
  if (count !== 10) throw new Error('Lodariq recovery sets contain exactly ten codes');
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(20);
    let value = '';
    for (let index = 0; index < 20; index += 1) {
      value += RECOVERY_CODE_ALPHABET[bytes[index]! % RECOVERY_CODE_ALPHABET.length];
    }
    return `LQRC-${value.slice(0, 5)}-${value.slice(5, 10)}-${value.slice(10, 15)}-${value.slice(15)}`;
  });
}

export function normalizeRecoveryCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^LQRC-(?:[23456789A-HJ-NP-Z]{5}-){3}[23456789A-HJ-NP-Z]{5}$/u.test(normalized)
    ? normalized
    : null;
}

export function hashRecoveryCode(value: string): string | null {
  const normalized = normalizeRecoveryCode(value);
  return normalized ? createHash('sha256').update(normalized, 'utf8').digest('hex') : null;
}
