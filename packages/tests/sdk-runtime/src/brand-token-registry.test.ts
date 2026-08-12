import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRegisteredBrandTokensForTests,
  readRegisteredBrandTokensForAuthoring,
  registerBrandTokens,
} from '@lodariq/sdk-runtime';
import type { CustomerBrandTokenRegistration } from '@lodariq/schema';

describe('memory-only customer Brand token registry', () => {
  beforeEach(() => clearRegisteredBrandTokensForTests());

  it('replaces a source revision and protects page-owned values with clones', () => {
    registerBrandTokens(registration('design-system', 'build-1', '#2457ff'));
    registerBrandTokens(registration('design-system', 'build-2', '#7c3aed'));

    const firstRead = readRegisteredBrandTokensForAuthoring();
    expect(firstRead).toHaveLength(1);
    expect(firstRead[0]?.revision).toBe('build-2');
    expect(firstRead[0]?.modes?.light?.colors?.accent).toBe('#7c3aed');

    firstRead[0]!.revision = 'mutated-by-authoring';
    expect(readRegisteredBrandTokensForAuthoring()[0]?.revision).toBe('build-2');
  });

  it('rejects empty, unknown, and CSS-shaped registrations', () => {
    expect(() =>
      registerBrandTokens({
        schemaVersion: '1',
        sourceId: 'empty',
        revision: 'build-1',
      }),
    ).toThrow(TypeError);
    expect(() =>
      registerBrandTokens({
        ...registration('unsafe', 'build-1', '#2457ff'),
        css: ':root { --accent: red }',
      } as CustomerBrandTokenRegistration),
    ).toThrow(TypeError);
  });

  it('keeps the in-memory source set bounded', () => {
    for (let index = 0; index < 18; index += 1) {
      registerBrandTokens(registration(`source-${index}`, `build-${index}`, '#2457ff'));
    }
    const registered = readRegisteredBrandTokensForAuthoring();
    expect(registered).toHaveLength(16);
    expect(registered[0]?.sourceId).toBe('source-2');
    expect(registered[registered.length - 1]?.sourceId).toBe('source-17');
  });

  it('does not touch browser persistence', () => {
    const localDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const sessionDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    const forbiddenStorage = {
      configurable: true,
      get: () => {
        throw new Error('persistent storage must not be read');
      },
    };
    Object.defineProperty(globalThis, 'localStorage', forbiddenStorage);
    Object.defineProperty(globalThis, 'sessionStorage', forbiddenStorage);
    try {
      expect(() => {
        registerBrandTokens(registration('memory-only', 'build-1', '#2457ff'));
        readRegisteredBrandTokensForAuthoring();
      }).not.toThrow();
    } finally {
      restoreProperty('localStorage', localDescriptor);
      restoreProperty('sessionStorage', sessionDescriptor);
    }
  });
});

function registration(
  sourceId: string,
  revision: string,
  accent: string,
): CustomerBrandTokenRegistration {
  return {
    schemaVersion: '1',
    sourceId,
    revision,
    modes: {
      light: {
        colors: { accent },
        typography: { fontFamilies: ['Customer Sans', 'system-ui'] },
      },
    },
  };
}

function restoreProperty(
  key: 'localStorage' | 'sessionStorage',
  descriptor?: PropertyDescriptor,
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, key);
}
