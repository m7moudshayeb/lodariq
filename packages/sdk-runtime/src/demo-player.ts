import type { CompiledDocument, PublicDemoArtifact } from '@lodariq/schema';
import { publicDemoApiPath } from '@lodariq/schema/public-demo-runtime';

const DEMO_ROOT_ID = 'lodariq-demo-player';
const MAX_DEMO_ARTIFACT_BYTES = 2 * 1024 * 1024;

export async function mountPublicDemo(
  root: HTMLElement,
  demoPath = globalThis.location.pathname,
): Promise<() => void> {
  const envelope = await readDemoArtifact(publicDemoApiPath(demoPath, 'artifact'));
  const { TourPlayer } = await import('./renderers/tour');
  clearStatus(root);
  const sendEvent = createDemoEventSender(publicDemoApiPath(demoPath, 'events'));
  const player = new TourPlayer(envelope.artifact, {
    locale: globalThis.navigator.language,
    resolveMediaAsset: (assetId) => `/v1/sdk/media-assets/${encodeURIComponent(assetId)}`,
    onStart: () => sendEvent('viewed'),
    onStepChange: (_index, step) => sendEvent('step_started', step.id),
    onComplete: () => {
      sendEvent('completed');
      showStatus(root, 'Demo complete.');
    },
    onDismiss: () => {
      sendEvent('dismissed');
      showStatus(root, 'Demo closed.');
    },
  });
  player.start();
  return () => player.stop();
}

async function readDemoArtifact(url: string): Promise<PublicDemoArtifact> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error('This demo is unavailable.');
  const source = await readBoundedBody(response);
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error('This demo returned an invalid artifact.');
  }
  if (!(await isPublicDemoArtifact(value))) {
    throw new Error('This demo returned an invalid artifact.');
  }
  return value as PublicDemoArtifact;
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_DEMO_ARTIFACT_BYTES || !response.body) {
    throw new Error('This demo artifact is too large.');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value?.byteLength) continue;
      byteLength += chunk.value.byteLength;
      if (byteLength > MAX_DEMO_ARTIFACT_BYTES) {
        throw new Error('This demo artifact is too large.');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

async function isPublicDemoArtifact(value: unknown): Promise<boolean> {
  if (!isRecord(value) || value['schemaVersion'] !== '1') return false;
  const { isValidCompiledRuntimeArtifact } = await import('@lodariq/schema/compiled-runtime');
  if (
    typeof value['demoId'] !== 'string' ||
    !contentHash(value['contentHash']) ||
    !contentHash(value['presentationContentHash']) ||
    !isValidCompiledRuntimeArtifact(value['artifact'])
  ) {
    return false;
  }
  const artifact = value['artifact'] as CompiledDocument;
  return (
    artifact.contentHash === value['presentationContentHash'] &&
    artifact.targets.length === 0 &&
    demoStepsAreTargetless(artifact)
  );
}

function demoStepsAreTargetless(artifact: CompiledDocument): boolean {
  if (!stepsAreTargetless(artifact.steps)) return false;
  if (!('localization' in artifact)) return true;
  return artifact.localization.variants.every((variant) => stepsAreTargetless(variant.steps));
}

function stepsAreTargetless(steps: readonly unknown[]): boolean {
  return steps.every((value) => {
    const step = isRecord(value) ? value : null;
    return Boolean(
      step &&
      step['targetId'] === undefined &&
      step['lifecycle'] === undefined &&
      step['handoff'] === undefined,
    );
  });
}

function createDemoEventSender(url: string) {
  return (event: 'viewed' | 'step_started' | 'completed' | 'dismissed', stepId?: string): void => {
    void fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: '1',
        event,
        ...(stepId ? { stepId } : {}),
      }),
    }).catch(() => {});
  };
}

function contentHash(value: unknown): value is string {
  return typeof value === 'string' && /^sha256-[0-9a-f]{64}$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clearStatus(root: HTMLElement): void {
  root.querySelector('[data-lodariq-demo-status]')?.remove();
}

function showStatus(root: HTMLElement, message: string): void {
  clearStatus(root);
  const status = root.ownerDocument.createElement('p');
  status.dataset['lodariqDemoStatus'] = '';
  status.setAttribute('role', 'status');
  status.textContent = message;
  root.appendChild(status);
}

function startFromDocument(): void {
  const root = document.getElementById(DEMO_ROOT_ID);
  if (!root) return;
  void mountPublicDemo(root).catch((error: unknown) => {
    showStatus(root, error instanceof Error ? error.message : 'This demo is unavailable.');
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startFromDocument, { once: true });
  } else {
    startFromDocument();
  }
}
