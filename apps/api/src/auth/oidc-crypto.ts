import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ENVELOPE_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface OidcProofMaterial {
  state: string;
  nonce: string;
  verifier: string;
  stateHash: string;
  nonceHash: string;
  codeChallenge: string;
}

export function createOidcProofMaterial(): OidcProofMaterial {
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(64).toString('base64url');
  return {
    state,
    nonce,
    verifier,
    stateHash: sha256Hex(state),
    nonceHash: sha256Hex(nonce),
    codeChallenge: createHash('sha256').update(verifier, 'ascii').digest('base64url'),
  };
}

export function sealOidcProof(
  proof: Pick<OidcProofMaterial, 'verifier' | 'nonce'>,
  secret: string,
  attemptId: string,
  providerId: string,
): string {
  assertSecret(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(aad(attemptId, providerId), 'utf8'));
  const plaintext = Buffer.from(JSON.stringify(proof), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([
    Buffer.from([ENVELOPE_VERSION]),
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]).toString('base64url');
}

export function openOidcProof(
  envelope: string,
  secret: string,
  attemptId: string,
  providerId: string,
): Pick<OidcProofMaterial, 'verifier' | 'nonce'> {
  assertSecret(secret);
  const packed = Buffer.from(envelope, 'base64url');
  if (packed[0] !== ENVELOPE_VERSION || packed.length <= 1 + IV_BYTES + TAG_BYTES) {
    throw new Error('OIDC proof envelope is invalid');
  }
  const iv = packed.subarray(1, 1 + IV_BYTES);
  const tag = packed.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ciphertext = packed.subarray(1 + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), iv);
  decipher.setAAD(Buffer.from(aad(attemptId, providerId), 'utf8'));
  decipher.setAuthTag(tag);
  const parsed = JSON.parse(
    Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'),
  ) as unknown;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('verifier' in parsed) ||
    !('nonce' in parsed) ||
    typeof parsed.verifier !== 'string' ||
    typeof parsed.nonce !== 'string' ||
    !/^[A-Za-z0-9_-]{43,128}$/u.test(parsed.verifier) ||
    !/^[A-Za-z0-9_-]{43,256}$/u.test(parsed.nonce)
  ) {
    throw new Error('OIDC proof envelope payload is invalid');
  }
  return { verifier: parsed.verifier, nonce: parsed.nonce };
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function matchesSha256(value: string, expectedHex: string): boolean {
  const actual = Buffer.from(sha256Hex(value), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function encryptionKey(secret: string): Buffer {
  return createHash('sha256').update('lodariq-oidc-state-v1\0', 'utf8').update(secret).digest();
}

function aad(attemptId: string, providerId: string): string {
  return `lodariq-oidc-attempt-v1\0${attemptId}\0${providerId}`;
}

function assertSecret(secret: string): void {
  if (Buffer.byteLength(secret.trim(), 'utf8') < 32) {
    throw new Error('LODARIQ_OIDC_STATE_SECRET must contain at least 32 bytes');
  }
}
