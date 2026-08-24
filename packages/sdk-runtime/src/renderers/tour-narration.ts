import type { CompiledNarration } from '@lodariq/schema';
import { tourRuntimeText } from '../tour-i18n';
import { safeMediaAssetUrl } from './tour-content';

export interface TourNarrationOptions {
  autoplay: boolean;
  resolveMediaAsset?: (assetId: string, kind: 'audio') => string | null | Promise<string | null>;
  onPlayGesture: () => void;
  onEnded: () => void;
}

export async function mountTourNarration(
  container: HTMLElement,
  narration: CompiledNarration,
  options: TourNarrationOptions,
): Promise<() => void> {
  const controls = container.ownerDocument.createElement('div');
  controls.className = 'tour-narration';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', tourRuntimeText('Narration'));

  const play = container.ownerDocument.createElement('button');
  play.type = 'button';
  play.className = 'tour-narration-play';
  play.textContent = tourRuntimeText('Play narration');
  play.disabled = true;

  const timeline = container.ownerDocument.createElement('input');
  timeline.type = 'range';
  timeline.className = 'tour-narration-timeline';
  timeline.min = '0';
  timeline.max = String(narration.audio.durationMs);
  timeline.step = '100';
  timeline.value = '0';
  timeline.disabled = true;
  timeline.setAttribute('aria-label', tourRuntimeText('Narration timeline'));

  const captions = container.ownerDocument.createElement('button');
  captions.type = 'button';
  captions.className = 'tour-narration-captions-toggle';
  captions.textContent = tourRuntimeText('Captions');
  captions.setAttribute('aria-pressed', 'true');

  const caption = container.ownerDocument.createElement('p');
  caption.className = 'tour-narration-caption';
  caption.textContent = narration.audio.cues[0]?.text ?? narration.script;
  caption.setAttribute('aria-live', 'off');

  const status = container.ownerDocument.createElement('span');
  status.className = 'tour-narration-status';
  status.setAttribute('role', 'status');
  status.textContent = tourRuntimeText('Loading narration…');

  controls.append(play, timeline, captions, status, caption);
  container.appendChild(controls);

  const audio = container.ownerDocument.createElement('audio');
  audio.preload = 'auto';
  audio.hidden = true;
  controls.appendChild(audio);
  let offsetTimer = 0;
  let waitingForOffset = false;
  let stopped = false;
  let objectUrl: string | null = null;

  const setPlaying = (playing: boolean): void => {
    play.textContent = tourRuntimeText(playing ? 'Pause narration' : 'Play narration');
    play.setAttribute('aria-pressed', String(playing));
  };
  const start = async (gesture: boolean): Promise<void> => {
    if (gesture) options.onPlayGesture();
    globalThis.clearTimeout(offsetTimer);
    const begin = async (): Promise<void> => {
      if (stopped) return;
      waitingForOffset = false;
      try {
        await audio.play();
        setPlaying(true);
        status.textContent = '';
      } catch {
        setPlaying(false);
        status.textContent = tourRuntimeText('Press play to continue narration.');
      }
    };
    if (audio.currentTime === 0 && narration.startOffsetMs > 0) {
      waitingForOffset = true;
      setPlaying(true);
      status.textContent = tourRuntimeText('Narration starts shortly.');
      offsetTimer = globalThis.setTimeout(
        () => void begin(),
        narration.startOffsetMs,
      ) as unknown as number;
      return;
    }
    await begin();
  };

  play.addEventListener('click', () => {
    if (waitingForOffset) {
      globalThis.clearTimeout(offsetTimer);
      waitingForOffset = false;
      setPlaying(false);
      status.textContent = '';
    } else if (audio.paused) void start(true);
    else {
      globalThis.clearTimeout(offsetTimer);
      audio.pause();
      setPlaying(false);
    }
  });
  timeline.addEventListener('input', () => {
    audio.currentTime = Number(timeline.value) / 1_000;
    updateCue(caption, narration, Number(timeline.value));
  });
  captions.addEventListener('click', () => {
    const visible = captions.getAttribute('aria-pressed') !== 'true';
    captions.setAttribute('aria-pressed', String(visible));
    caption.hidden = !visible;
  });
  audio.addEventListener('timeupdate', () => {
    const positionMs = Math.min(narration.audio.durationMs, Math.round(audio.currentTime * 1_000));
    timeline.value = String(positionMs);
    updateCue(caption, narration, positionMs);
  });
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => {
    waitingForOffset = false;
    setPlaying(false);
    timeline.value = String(narration.audio.durationMs);
    if (narration.advanceOnEnd) options.onEnded();
  });
  audio.addEventListener('error', () => {
    waitingForOffset = false;
    setPlaying(false);
    status.textContent = tourRuntimeText('Narration is unavailable. Continue manually.');
  });

  try {
    const candidate = await options.resolveMediaAsset?.(narration.audio.assetId, 'audio');
    const url = safeMediaAssetUrl(candidate ?? null);
    if (!url) throw new Error('missing narration asset');
    objectUrl = await verifiedAudioUrl(
      url,
      narration.audio.contentHash,
      narration.audio.contentType,
    );
    if (stopped) {
      URL.revokeObjectURL(objectUrl);
      return () => {};
    }
    audio.src = objectUrl;
    play.disabled = false;
    timeline.disabled = false;
    status.textContent = '';
    if (options.autoplay) void start(false);
  } catch {
    status.textContent = tourRuntimeText('Narration is unavailable. Continue manually.');
  }

  return () => {
    stopped = true;
    waitingForOffset = false;
    globalThis.clearTimeout(offsetTimer);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    controls.remove();
  };
}

function updateCue(element: HTMLElement, narration: CompiledNarration, positionMs: number): void {
  const cue = narration.audio.cues.find(
    (candidate) =>
      positionMs >= candidate.startMs && positionMs < candidate.startMs + candidate.durationMs,
  );
  element.textContent = cue?.text ?? '';
}

async function verifiedAudioUrl(
  url: string,
  expectedHash: string,
  expectedType: string,
): Promise<string> {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error('narration fetch failed');
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = `sha256-${[...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
  if (hash !== expectedHash) throw new Error('narration integrity failed');
  return URL.createObjectURL(new Blob([bytes], { type: expectedType }));
}
