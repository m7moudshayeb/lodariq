import {
  AuthoringCollaborationEvent,
  validate,
  type AuthoringCollaborationSnapshot,
} from '@lodariq/schema';

const RECONNECT_MIN_MS = 250;
const RECONNECT_MAX_MS = 10_000;
const RECONNECT_JITTER_RATIO = 0.25;

export interface CollaborationStreamRequest {
  (path: string, init: RequestInit): Promise<Response>;
}

/** Fetch-streamed SSE keeps authoring credentials in headers and out of URLs. */
export function subscribeToCollaborationEvents(
  request: CollaborationStreamRequest,
  onSnapshot: (snapshot: AuthoringCollaborationSnapshot) => void,
  onState: (state: 'connected' | 'reconnecting') => void = () => undefined,
): () => void {
  let stopped = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let activeRequest: AbortController | null = null;

  const scheduleReconnect = (): void => {
    if (stopped || reconnectTimer) return;
    onState('reconnecting');
    const base = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** reconnectAttempt);
    reconnectAttempt = Math.min(reconnectAttempt + 1, 8);
    const jitter = base * RECONNECT_JITTER_RATIO * (Math.random() * 2 - 1);
    reconnectTimer = setTimeout(
      () => {
        reconnectTimer = null;
        void connect();
      },
      Math.max(RECONNECT_MIN_MS, Math.round(base + jitter)),
    );
  };

  const connect = async (): Promise<void> => {
    if (stopped) return;
    activeRequest = new AbortController();
    try {
      const response = await request('/collaboration/events', {
        method: 'GET',
        headers: { accept: 'text/event-stream' },
        signal: activeRequest.signal,
      });
      if (!response.ok || !response.body) {
        if (response.status === 401 || response.status === 403) return;
        throw new Error('collaboration_stream_unavailable');
      }
      reconnectAttempt = 0;
      onState('connected');
      await readSseStream(response.body, onSnapshot, () => stopped);
      if (!stopped) scheduleReconnect();
    } catch {
      if (stopped || activeRequest.signal.aborted) return;
      scheduleReconnect();
    } finally {
      activeRequest = null;
    }
  };

  void connect();
  return () => {
    stopped = true;
    activeRequest?.abort('collaboration_closed');
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };
}

async function readSseStream(
  stream: ReadableStream<Uint8Array>,
  onSnapshot: (snapshot: AuthoringCollaborationSnapshot) => void,
  stopped: () => boolean,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (!stopped()) {
      const result = await reader.read();
      buffer += decoder.decode(result.value, { stream: !result.done });
      buffer = consumeSseFrames(buffer, onSnapshot);
      if (result.done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

function consumeSseFrames(
  source: string,
  onSnapshot: (snapshot: AuthoringCollaborationSnapshot) => void,
): string {
  const normalized = source.replace(/\r\n/gu, '\n');
  const frames = normalized.split('\n\n');
  const remainder = frames.pop() ?? '';
  for (const frame of frames) {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }
    const result = validate(AuthoringCollaborationEvent, parsed);
    if (result.valid) onSnapshot(result.value.snapshot);
  }
  return remainder;
}

export const collaborationTransportTest = { consumeSseFrames };
