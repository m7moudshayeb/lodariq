import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_INTENT_TTL_MS,
  ACTIVATION_STAGES,
  activationDiagnosis,
  classifyActivationFailure,
  rememberActivationIntent,
  takeActivationIntent,
  type ActivationIntentStorage,
} from '../../../../../packages/sdk-authoring/src/authoring/activation-diagnosis';

const NOW = 1_700_000_000_000;

function memoryStorage(overrides: Partial<ActivationIntentStorage> = {}): ActivationIntentStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
    ...overrides,
  };
}

describe('why authoring did not open (§8.4)', () => {
  it('names every stage in creator language, never an error code', () => {
    for (const stage of ACTIVATION_STAGES) {
      const diagnosis = activationDiagnosis(stage);
      expect(diagnosis.stage).toBe(stage);
      expect(diagnosis.message.length).toBeGreaterThan(10);
      expect(diagnosis.message).not.toMatch(/\b[45]\d\d\b|error:|undefined/iu);
    }
  });

  it('falls back to the same tab when the popup was blocked, rather than erroring', () => {
    const stage = classifyActivationFailure({ popupAttempted: true, popup: null });
    expect(stage).toBe('popup-blocked');
    expect(activationDiagnosis(stage).recovery).toBe('same-tab-redirect');
  });

  it('treats a blocked popup as the first explanation, not an exception', () => {
    // `window.open` returning null throws nothing, so error inspection must not win.
    expect(
      classifyActivationFailure({ popupAttempted: true, popup: null, error: new Error('network') }),
    ).toBe('popup-blocked');
  });

  it('reads the rest of the failure tail', () => {
    expect(classifyActivationFailure({ storageBlocked: true })).toBe('storage-restricted');
    expect(classifyActivationFailure({ navigatedAway: true })).toBe('redirected-away');
    expect(classifyActivationFailure({ popup: { closed: true } as Window })).toBe('popup-closed');
    expect(classifyActivationFailure({ error: new Error('Session expired') })).toBe(
      'session-expired',
    );
    expect(classifyActivationFailure({ error: new Error('Grant rejected') })).toBe(
      'grant-rejected',
    );
    expect(classifyActivationFailure({ error: new Error('fetch failed') })).toBe('network');
    expect(classifyActivationFailure({})).toBe('unknown');
  });

  it('routes a mid-activation navigation to resuming, not restarting', () => {
    expect(activationDiagnosis('redirected-away').recovery).toBe('resume');
  });
});

describe('the pending activation intent (§8.4)', () => {
  it('survives the host app navigating away', () => {
    const storage = memoryStorage();
    rememberActivationIntent(storage, { origin: 'https://app.example', startedAt: NOW });

    const resumed = takeActivationIntent(storage, 'https://app.example', NOW + 1_000);
    expect(resumed?.origin).toBe('https://app.example');
  });

  it('is taken, not peeked, so authoring cannot relaunch twice', () => {
    const storage = memoryStorage();
    rememberActivationIntent(storage, { origin: 'https://app.example', startedAt: NOW });

    expect(takeActivationIntent(storage, 'https://app.example', NOW)).not.toBeNull();
    expect(takeActivationIntent(storage, 'https://app.example', NOW)).toBeNull();
  });

  it('refuses an intent from another origin', () => {
    const storage = memoryStorage();
    rememberActivationIntent(storage, { origin: 'https://app.example', startedAt: NOW });
    expect(takeActivationIntent(storage, 'https://other.example', NOW)).toBeNull();
  });

  it('expires rather than resurrecting an old flow', () => {
    const storage = memoryStorage();
    rememberActivationIntent(storage, { origin: 'https://app.example', startedAt: NOW });
    expect(
      takeActivationIntent(storage, 'https://app.example', NOW + ACTIVATION_INTENT_TTL_MS + 1),
    ).toBeNull();
  });

  it('survives a browser that refuses storage, because the fallback needs none', () => {
    const throwing = memoryStorage({
      setItem: () => {
        throw new Error('storage blocked');
      },
      getItem: () => {
        throw new Error('storage blocked');
      },
    });
    expect(() =>
      rememberActivationIntent(throwing, { origin: 'https://app.example', startedAt: NOW }),
    ).not.toThrow();
    expect(takeActivationIntent(throwing, 'https://app.example', NOW)).toBeNull();
  });

  it('ignores corrupt storage instead of throwing into the launcher', () => {
    const storage = memoryStorage();
    storage.setItem('lodariq.authoring.activation-intent', '{not json');
    expect(takeActivationIntent(storage, 'https://app.example', NOW)).toBeNull();
  });
});
