import { describe, expect, it } from 'vitest';
import * as schemaRoot from '@lodariq/schema';
import { CustomerBrandTokenRegistration, validate } from '@lodariq/schema';
import { isRegistrableCustomerBrandTokenRegistration } from '@lodariq/schema/brand-registration-runtime';

const REGISTRATION_METADATA_KEYS = new Set(['schemaVersion', 'sourceId', 'revision']);

const COMPREHENSIVE_REGISTRATION = {
  schemaVersion: '1',
  sourceId: 'source.valid-1',
  revision: 'revision.valid-1',
  modes: {
    light: {
      colors: {
        surface: '#112233',
        surfaceRaised: '#112233',
        surfaceInverse: '#112233',
        text: '#112233',
        textMuted: '#112233',
        textInverse: '#112233',
        border: '#112233',
        borderStrong: '#112233',
        accent: '#112233',
        accentHover: '#112233',
        onAccent: '#112233',
        focus: '#112233',
        success: '#112233',
        onSuccess: '#112233',
        warning: '#112233',
        onWarning: '#112233',
        danger: '#112233',
        onDanger: '#112233',
        overlay: '#11223344',
      },
      typography: {
        fontFamilies: ['Customer Sans', 'system-ui'],
        baseSizePx: 12,
        smallSizePx: 10,
        bodyLineHeight: 1.2,
        headingLineHeight: 1,
        bodyWeight: 400,
        headingWeight: 500,
        actionWeight: 500,
      },
    },
    dark: { colors: { accent: '#abcdef' } },
  },
  typography: {
    fontFamilies: ['Customer Sans'],
    baseSizePx: 20,
    smallSizePx: 18,
    bodyLineHeight: 2,
    headingLineHeight: 1.6,
    bodyWeight: 500,
    headingWeight: 700,
    actionWeight: 700,
  },
  spacing: { xs: 0, sm: 1, md: 32, lg: 63, xl: 64 },
  radii: { sm: 0, md: 1, lg: 32, pill: 999 },
  borders: { defaultWidthPx: 0, strongWidthPx: 6 },
  sizing: { tourNarrowPx: 220, tourStandardPx: 480, tourWidePx: 640 },
  motion: { fastMs: 0, normalMs: 500, slowMs: 1_000, easing: 'accelerate' },
  elevations: {
    resting: [],
    floating: [{ xPx: -32, yPx: 32, blurPx: 64, spreadPx: -16, color: '#abcdef88' }],
  },
};

const REPLACEMENT_VALUES: readonly unknown[] = [
  undefined,
  null,
  true,
  false,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  -33,
  -32,
  -17,
  -16,
  -1,
  0,
  1,
  1.1,
  1.2,
  1.6,
  2,
  4,
  5,
  6,
  7,
  10,
  12,
  18,
  20,
  32,
  33,
  64,
  65,
  80,
  120,
  121,
  219,
  220,
  360,
  361,
  480,
  481,
  640,
  641,
  999,
  1_000,
  1_001,
  '',
  '1',
  'x',
  'A'.repeat(121),
  '#abcdef',
  '#ABCDEF',
  '#abcdef00',
  'var(--x)',
  'url(x)',
  'https://x.test',
  'Customer Sans',
  {},
  [],
  ['x'],
  ['x', 'x'],
];

describe('browser-sized Brand registration guard', () => {
  it('keeps the guard isolated from the pre-existing schema root surface', () => {
    expect(schemaRoot.PRODUCT_STYLE_MAX_REGISTERED_SOURCES).toBe(16);
    expect('isRegistrableCustomerBrandTokenRegistration' in schemaRoot).toBe(false);
  });

  it('matches canonical TypeBox admission across every field and boundary fixture', () => {
    const paths = collectPaths(COMPREHENSIVE_REGISTRATION);
    const mismatches: string[] = [];
    let fixtureCount = 0;
    let acceptedCount = 0;
    let rejectedCount = 0;

    const check = (label: string, fixture: unknown): void => {
      fixtureCount += 1;
      const canonical = canonicalRegistrationAdmission(fixture);
      if (canonical) acceptedCount += 1;
      else rejectedCount += 1;
      if (isRegistrableCustomerBrandTokenRegistration(fixture) !== canonical) {
        mismatches.push(label);
      }
    };

    check('complete valid registration', COMPREHENSIVE_REGISTRATION);
    for (const path of paths) {
      for (const replacement of REPLACEMENT_VALUES) {
        const fixture = cloneRegistration();
        writePath(fixture, path, replacement);
        check(`replace ${path.join('.')}`, fixture);
      }

      const fixture = cloneRegistration();
      deletePath(fixture, path);
      check(`delete ${path.join('.')}`, fixture);
    }

    for (const path of paths) {
      const original = readPath(COMPREHENSIVE_REGISTRATION, path);
      if (isObject(original) && !Array.isArray(original)) {
        const fixture = cloneRegistration();
        const target = readPath(fixture, path);
        if (!isObject(target)) throw new TypeError('Parity fixture path is not an object');
        target['unknown'] = 'rejected';
        check(`unknown key at ${path.join('.')}`, fixture);
      }

      if (Array.isArray(original)) {
        const fixture = cloneRegistration();
        const target = readPath(fixture, path);
        if (!Array.isArray(target)) throw new TypeError('Parity fixture path is not an array');
        target.length = Math.max(1, target.length);
        delete target[0];
        check(`sparse array at ${path.join('.')}`, fixture);
      }
    }

    expect(fixtureCount).toBeGreaterThan(4_800);
    expect(acceptedCount).toBeGreaterThan(100);
    expect(rejectedCount).toBeGreaterThan(4_000);
    expect(mismatches).toEqual([]);
  });

  it('matches TypeBox property-ownership behavior', () => {
    const fixtures: unknown[] = [];

    const explicitUndefined = cloneRegistration();
    mutableAt(explicitUndefined, ['spacing'])['md'] = undefined;
    fixtures.push(explicitUndefined);

    const nonEnumerableUnknown = cloneRegistration();
    Object.defineProperty(mutableAt(nonEnumerableUnknown, ['spacing']), 'unknown', {
      value: 1,
      enumerable: false,
    });
    fixtures.push(nonEnumerableUnknown);

    const inheritedInvalid = cloneRegistration();
    const inheritedSpacing = Object.create({ md: 65 }) as Record<string, unknown>;
    inheritedSpacing['xs'] = 1;
    inheritedInvalid['spacing'] = inheritedSpacing;
    fixtures.push(inheritedInvalid);

    const symbolUnknown = cloneRegistration();
    mutableAt(symbolUnknown, ['spacing'])[Symbol('unknown')] = 1;
    fixtures.push(symbolUnknown);

    for (const fixture of fixtures) {
      expect(isRegistrableCustomerBrandTokenRegistration(fixture)).toBe(
        canonicalRegistrationAdmission(fixture),
      );
    }
  });
});

function canonicalRegistrationAdmission(value: unknown): boolean {
  const result = validate(CustomerBrandTokenRegistration, value);
  if (!result.valid) return false;
  return Object.entries(result.value)
    .filter(([key]) => !REGISTRATION_METADATA_KEYS.has(key))
    .some(([, candidate]) => containsLeafValue(candidate));
}

function containsLeafValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value !== 'object' || value === null) return value !== undefined;
  return Object.values(value).some(containsLeafValue);
}

function cloneRegistration(): Record<string, unknown> {
  return structuredClone(COMPREHENSIVE_REGISTRATION) as Record<string, unknown>;
}

function collectPaths(value: unknown, prefix: readonly string[] = []): string[][] {
  if (!isObject(value)) return [];
  return Object.keys(value).flatMap((key) => {
    const path = [...prefix, key];
    return [path, ...collectPaths(value[key], path)];
  });
}

function readPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

function writePath(root: Record<string, unknown>, path: readonly string[], value: unknown): void {
  mutableAt(root, path.slice(0, -1))[path[path.length - 1]!] = value;
}

function deletePath(root: Record<string, unknown>, path: readonly string[]): void {
  delete mutableAt(root, path.slice(0, -1))[path[path.length - 1]!];
}

function mutableAt(
  root: Record<string, unknown>,
  path: readonly string[],
): Record<PropertyKey, unknown> {
  const value = readPath(root, path);
  if (!isObject(value)) throw new TypeError('Parity fixture path is not mutable');
  return value;
}

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === 'object';
}
