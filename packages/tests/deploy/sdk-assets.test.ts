import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

interface SdkAssetManifest {
  prefix: string;
  entries: {
    runtime: string[];
    authoring: string[];
  };
  files: Array<{
    path: string;
    bytes: number;
    sha256: string;
    cache: 'short' | 'immutable';
  }>;
}

describe('SDK CDN asset packaging', () => {
  it('prepares browser-resolvable runtime and creator assets for R2 upload', () => {
    execFileSync('node', ['scripts/prepare-sdk-assets.mjs'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });

    const manifest = readManifest();
    const files = new Map(manifest.files.map((file) => [file.path, file]));

    expect(manifest.prefix).toBe('/sdk/');
    expect(manifest.entries.runtime).toEqual(['lodariq-loader.js']);
    expect(manifest.entries.authoring).toEqual(['lodariq-creator.js']);
    expect(files.get('/sdk/lodariq-loader.js')).toMatchObject({ cache: 'short' });
    expect(files.get('/sdk/lodariq-creator.js')).toMatchObject({ cache: 'short' });
    expect(files.has('/sdk/runtime/index.js')).toBe(true);
    expect(files.has('/sdk/renderers/tour.js')).toBe(true);
    expect([...files.values()].some((file) => file.cache === 'immutable')).toBe(true);

    for (const file of manifest.files) {
      expect(file.bytes).toBeGreaterThan(0);
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
      const path = resolve(repoRoot, `dist/sdk-assets${file.path}`);
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, 'utf8')).not.toContain('sourceMappingURL=');
    }

    const runtimeSource = manifest.files
      .filter((file) => isRuntimeDeliveryAsset(file.path))
      .map((file) => readFileSync(resolve(repoRoot, `dist/sdk-assets${file.path}`), 'utf8'))
      .join('\n');
    expect(runtimeSource).not.toMatch(/@lexical|Lexical/);
    expect(runtimeSource).not.toMatch(/\bReact\b|from ["']react["']|react\/jsx-runtime/);
    expect(runtimeSource).not.toMatch(/@lodariq\/sdk-authoring|sdk-authoring/);
    expect(runtimeSource).not.toMatch(/@lodariq\/dashboard|apps\/dashboard/);
  });
});

function isRuntimeDeliveryAsset(path: string): boolean {
  return (
    path === '/sdk/lodariq-loader.js' ||
    path.startsWith('/sdk/runtime/') ||
    path.startsWith('/sdk/renderers/') ||
    path.startsWith('/sdk/resolver/')
  );
}

function readManifest(): SdkAssetManifest {
  return JSON.parse(
    readFileSync(resolve(repoRoot, 'dist/sdk-assets/manifest.json'), 'utf8'),
  ) as SdkAssetManifest;
}
