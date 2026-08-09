import {
  CompiledDocument,
  RENDERER_CONTRACT_VERSION,
  validate,
  type NewCompiledDocument,
} from '@lodariq/schema';

export interface ExactPublicationLoadOptions {
  url: string;
  documentId: string;
  expectedContentHash: string;
  headers?: HeadersInit;
  expectedThemeVersionId?: string;
}

/** Loads one server-published artifact without invoking a compiler or accepting draft bytes. */
export async function loadExactPublishedArtifact(
  options: ExactPublicationLoadOptions,
): Promise<NewCompiledDocument> {
  let response: Response;
  try {
    response = await fetch(options.url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      ...(options.headers ? { headers: options.headers } : {}),
    });
  } catch {
    throw new Error('Exact staging artifact request failed');
  }
  if (!response.ok) throw new Error('Exact staging artifact request failed');

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Exact staging artifact response was invalid');
  }
  const result = validate(CompiledDocument, payload);
  if (!result.valid || result.value.artifactSchemaVersion !== '2') {
    throw new Error('Exact staging artifact response was invalid');
  }
  const compiled = result.value;
  if (
    compiled.documentId !== options.documentId ||
    compiled.contentHash !== options.expectedContentHash ||
    compiled.rendererContractVersion !== RENDERER_CONTRACT_VERSION ||
    (options.expectedThemeVersionId &&
      compiled.theme.themeVersionId !== options.expectedThemeVersionId)
  ) {
    throw new Error('Exact staging artifact changed before verification');
  }
  const [artifactHash, themeHash] = await Promise.all([
    computeCanonicalHashWithoutContentHash(compiled),
    computeCanonicalHashWithoutContentHash(compiled.theme),
  ]);
  if (artifactHash !== compiled.contentHash || themeHash !== compiled.theme.contentHash) {
    throw new Error('Exact staging artifact failed its content-addressed integrity check');
  }
  return compiled;
}

async function computeCanonicalHashWithoutContentHash(
  value: NewCompiledDocument | NewCompiledDocument['theme'],
): Promise<`sha256-${string}`> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Exact staging artifact verification requires Web Crypto');
  }
  const content = structuredClone(value) as { contentHash?: string };
  delete content.contentHash;
  const bytes = new TextEncoder().encode(canonicalJson(content));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `sha256-${hex}`;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value));
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectKeys(value[key])]),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
