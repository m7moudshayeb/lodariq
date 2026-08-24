// @vitest-environment jsdom
import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  DEFAULT_EXPERIENCE_APPEARANCE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type CompiledNarration,
  type NewCompiledDocument,
} from '@lodariq/schema';
import { mountTourNarration } from '../../../../../packages/sdk-runtime/src/renderers/tour-narration';
import { TourPlayer } from '@lodariq/sdk-runtime/renderers/tour';

const AUDIO_BYTES = Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]);
const AUDIO_HASH = `sha256-${createHash('sha256').update(AUDIO_BYTES).digest('hex')}`;

describe('immutable tour narration player', () => {
  const play = vi.fn<() => Promise<void>>();
  const pause = vi.fn();
  const load = vi.fn();
  const createObjectURL = vi.fn(() => 'blob:narration');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    document.body.innerHTML = '<main id="tour-content"></main>';
    play.mockReset().mockResolvedValue(undefined);
    pause.mockReset();
    load.mockReset();
    createObjectURL.mockClear();
    revokeObjectURL.mockReset();
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => AUDIO_BYTES.buffer })),
    );
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(load);
    const NativeURL = URL;
    vi.stubGlobal(
      'URL',
      class NarrationTestURL extends NativeURL {
        static override createObjectURL(): string {
          return createObjectURL();
        }
        static override revokeObjectURL(value: string): void {
          revokeObjectURL(value);
        }
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('requires a gesture, exposes keyboard-native controls, cues, captions, and cleanup', async () => {
    const onPlayGesture = vi.fn();
    const onEnded = vi.fn();
    const container = document.getElementById('tour-content')!;
    const dispose = await mountTourNarration(container, narration(), {
      autoplay: false,
      resolveMediaAsset: async () => 'https://api.lodariq.io/audio/narration.wav',
      onPlayGesture,
      onEnded,
    });

    const group = container.querySelector<HTMLElement>('.tour-narration')!;
    const playButton = group.querySelector<HTMLButtonElement>('.tour-narration-play')!;
    const timeline = group.querySelector<HTMLInputElement>('.tour-narration-timeline')!;
    const captions = group.querySelector<HTMLButtonElement>('.tour-narration-captions-toggle')!;
    const caption = group.querySelector<HTMLElement>('.tour-narration-caption')!;
    const audio = container.ownerDocument.querySelector('audio')!;

    expect(group.getAttribute('role')).toBe('group');
    expect(playButton.disabled).toBe(false);
    expect(timeline).toMatchObject({ type: 'range', min: '0', max: '2000', disabled: false });
    expect(play).not.toHaveBeenCalled();
    playButton.click();
    await vi.waitFor(() => expect(play).toHaveBeenCalledOnce());
    expect(onPlayGesture).toHaveBeenCalledOnce();

    audio.currentTime = 1.25;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(timeline.value).toBe('1250');
    expect(caption.textContent).toBe('Then continue.');

    timeline.value = '250';
    timeline.dispatchEvent(new Event('input'));
    expect(audio.currentTime).toBe(0.25);
    expect(caption.textContent).toBe('Welcome.');

    captions.click();
    expect(captions.getAttribute('aria-pressed')).toBe('false');
    expect(caption.hidden).toBe(true);
    audio.dispatchEvent(new Event('ended'));
    expect(onEnded).toHaveBeenCalledOnce();

    dispose();
    expect(container.querySelector('.tour-narration')).toBeNull();
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:narration');
  });

  it('honours autoplay only after the tour has recorded a prior gesture', async () => {
    const dispose = await mountTourNarration(
      document.getElementById('tour-content')!,
      narration(),
      {
        autoplay: true,
        resolveMediaAsset: () => '/v1/sdk/media/narration',
        onPlayGesture: vi.fn(),
        onEnded: vi.fn(),
      },
    );

    await vi.waitFor(() => expect(play).toHaveBeenCalledOnce());
    dispose();
  });

  it('fails open when playback is rejected or the immutable hash does not match', async () => {
    play.mockRejectedValueOnce(new Error('autoplay blocked'));
    const first = document.getElementById('tour-content')!;
    const dispose = await mountTourNarration(first, narration(), {
      autoplay: true,
      resolveMediaAsset: () => '/v1/sdk/media/narration',
      onPlayGesture: vi.fn(),
      onEnded: vi.fn(),
    });
    await vi.waitFor(() =>
      expect(first.querySelector('.tour-narration-status')?.textContent).toContain('Press play'),
    );
    dispose();

    document.body.innerHTML = '<main id="tour-content"></main>';
    const second = document.getElementById('tour-content')!;
    const disposeInvalid = await mountTourNarration(
      second,
      {
        ...narration(),
        audio: { ...narration().audio, contentHash: `sha256-${'0'.repeat(64)}` },
      },
      {
        autoplay: false,
        resolveMediaAsset: () => '/v1/sdk/media/narration',
        onPlayGesture: vi.fn(),
        onEnded: vi.fn(),
      },
    );
    expect(second.querySelector<HTMLButtonElement>('.tour-narration-play')?.disabled).toBe(true);
    expect(second.querySelector('.tour-narration-status')?.textContent).toContain('unavailable');
    expect(createObjectURL).toHaveBeenCalledOnce();
    disposeInvalid();
  });

  it('cancels a delayed start when the step is left', async () => {
    vi.useFakeTimers();
    const dispose = await mountTourNarration(
      document.getElementById('tour-content')!,
      narration(),
      {
        autoplay: true,
        resolveMediaAsset: () => '/v1/sdk/media/narration',
        onPlayGesture: vi.fn(),
        onEnded: vi.fn(),
      },
    );
    dispose();
    await vi.advanceTimersByTimeAsync(500);
    expect(play).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('auto-advances and autoplays later narrated steps only after the first gesture', async () => {
    const onStepChange = vi.fn();
    const player = new TourPlayer(narratedTour(), {
      resolveMediaAsset: () => '/v1/sdk/media/narration',
      onStepChange,
    });
    player.start();
    await player.waitUntilReady();
    const root = document.querySelector('lodariq-tour')?.shadowRoot;
    await vi.waitFor(() =>
      expect(root?.querySelector<HTMLButtonElement>('.tour-narration-play')).not.toBeNull(),
    );

    root?.querySelector<HTMLButtonElement>('.tour-narration-play')?.click();
    await vi.waitFor(() => expect(play).toHaveBeenCalledOnce());
    root?.querySelector('audio')?.dispatchEvent(new Event('ended'));

    await vi.waitFor(() => expect(onStepChange).toHaveBeenLastCalledWith(1, expect.any(Object)));
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    player.stop();
  });

  it('releases every verified object URL during rapid narration churn', async () => {
    const container = document.getElementById('tour-content')!;
    for (let index = 0; index < 50; index += 1) {
      const dispose = await mountTourNarration(container, narration(), {
        autoplay: false,
        resolveMediaAsset: () => `/v1/sdk/media/narration-${index}`,
        onPlayGesture: vi.fn(),
        onEnded: vi.fn(),
      });
      dispose();
    }

    expect(createObjectURL).toHaveBeenCalledTimes(50);
    expect(revokeObjectURL).toHaveBeenCalledTimes(50);
    expect(container.querySelectorAll('.tour-narration')).toHaveLength(0);
  });
});

function narration(): CompiledNarration {
  return {
    script: 'Welcome. Then continue.',
    startOffsetMs: 250,
    advanceOnEnd: true,
    audio: {
      assetId: 'asset_narration',
      contentHash: AUDIO_HASH,
      sourceHash: `sha256-${'2'.repeat(64)}`,
      contentType: 'audio/wav',
      durationMs: 2_000,
      cues: [
        { text: 'Welcome.', startMs: 0, durationMs: 1_000 },
        { text: 'Then continue.', startMs: 1_000, durationMs: 1_000 },
      ],
    },
  };
}

function narratedTour(): NewCompiledDocument {
  const firstNarration = { ...narration(), startOffsetMs: 0 };
  return {
    artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    documentId: 'doc_narrated_tour',
    type: 'tour',
    contentHash: `sha256-${'a'.repeat(64)}`,
    schemaVersion: '1.0.0',
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    trigger: { type: 'manual' },
    audience: { environments: ['staging'] },
    theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
    appearance: DEFAULT_EXPERIENCE_APPEARANCE,
    targets: [],
    steps: [
      { id: 'step_1', body: [], narration: firstNarration },
      {
        id: 'step_2',
        body: [],
        narration: { ...firstNarration, advanceOnEnd: false },
      },
    ],
    localization: { defaultLocale: 'en', defaultTitle: 'Narrated tour', variants: [] },
  };
}
