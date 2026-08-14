import type { CompiledDocument } from '@lodariq/schema';
import { isValidCompiledRuntimeArtifact } from '@lodariq/schema/compiled-runtime';

const MAX_PUBLIC_ARTIFACT_BYTES = 2 * 1024 * 1024;
const INITIAL_PUBLIC_ARTIFACT_BUFFER_BYTES = 16 * 1024;
const INVALID_PUBLIC_ARTIFACT_MESSAGE = 'Lodariq public document response is invalid';

/** Byte-bounds, parses, and fully validates one untrusted public artifact response. */
export async function readValidatedPublicArtifact(response: Response): Promise<CompiledDocument> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && exceedsArtifactByteLimit(declaredLength)) {
    throw new Error(INVALID_PUBLIC_ARTIFACT_MESSAGE);
  }

  const source = await readBoundedUtf8Body(response);

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(INVALID_PUBLIC_ARTIFACT_MESSAGE);
  }
  if (!isValidCompiledRuntimeArtifact(value)) {
    throw new Error(INVALID_PUBLIC_ARTIFACT_MESSAGE);
  }
  return value;
}

async function readBoundedUtf8Body(response: Response): Promise<string> {
  if (!response.body) throw new Error(INVALID_PUBLIC_ARTIFACT_MESSAGE);

  const reader = response.body.getReader();
  let buffer = new Uint8Array(INITIAL_PUBLIC_ARTIFACT_BUFFER_BYTES);
  let byteLength = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value?.byteLength) continue;
      if (chunk.value.byteLength > MAX_PUBLIC_ARTIFACT_BYTES - byteLength) {
        throw new Error(INVALID_PUBLIC_ARTIFACT_MESSAGE);
      }

      const requiredLength = byteLength + chunk.value.byteLength;
      if (requiredLength > buffer.byteLength) {
        const expandedLength = Math.min(
          MAX_PUBLIC_ARTIFACT_BYTES,
          Math.max(requiredLength, buffer.byteLength * 2),
        );
        const expanded = new Uint8Array(expandedLength);
        expanded.set(buffer.subarray(0, byteLength));
        buffer = expanded;
      }
      buffer.set(chunk.value, byteLength);
      byteLength = requiredLength;
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // Preserve one bounded public error even if the transport cannot cancel.
    }
    throw new Error(INVALID_PUBLIC_ARTIFACT_MESSAGE);
  } finally {
    reader.releaseLock();
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, byteLength));
  } catch {
    throw new Error(INVALID_PUBLIC_ARTIFACT_MESSAGE);
  }
}

function exceedsArtifactByteLimit(value: string): boolean {
  if (!/^[0-9]+$/u.test(value)) return true;
  const length = Number(value);
  return !Number.isSafeInteger(length) || length > MAX_PUBLIC_ARTIFACT_BYTES;
}
