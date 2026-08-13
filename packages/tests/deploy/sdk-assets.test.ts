import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  creatorModule: {
    url: string;
    version: string;
    integrity: string;
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
    expect(manifest.entries.runtime).toEqual(['lodariq-public-bootstrap.js', 'lodariq-loader.js']);
    expect(files.get('/sdk/lodariq-public-bootstrap.js')).toMatchObject({ cache: 'short' });
    expect(manifest.entries.authoring).toEqual(['lodariq-creator.js']);
    expect(files.get('/sdk/lodariq-loader.js')).toMatchObject({ cache: 'short' });
    expect(files.get('/sdk/lodariq-creator.js')).toMatchObject({ cache: 'short' });
    expect(files.has('/sdk/runtime/index.js')).toBe(true);
    expect(files.has('/sdk/renderers/tour.js')).toBe(true);
    expect([...files.values()].some((file) => file.cache === 'immutable')).toBe(true);

    const creatorModuleUrl = new URL(manifest.creatorModule.url);
    const creatorModuleFile = files.get(creatorModuleUrl.pathname);
    expect(creatorModuleUrl.origin).toBe('https://cdn.lodariq.io');
    expect(creatorModuleUrl.pathname).toMatch(/^\/sdk\/sha256-[a-f0-9]{64}\/creator\.js$/u);
    const creatorModulePathSegments = creatorModuleUrl.pathname.split('/');
    expect(manifest.creatorModule.version).toBe(
      creatorModulePathSegments[creatorModulePathSegments.length - 2],
    );
    expect(creatorModuleFile).toMatchObject({ cache: 'immutable' });
    expect(files.has('/sdk/hosted-entry.js')).toBe(false);

    const creatorModulePath = resolve(repoRoot, `dist/sdk-assets${creatorModuleUrl.pathname}`);
    const creatorModuleBytes = readFileSync(creatorModulePath);
    expect(manifest.creatorModule.integrity).toBe(
      `sha256-${createHash('sha256').update(creatorModuleBytes).digest('base64')}`,
    );

    const creatorModuleDirectory = creatorModuleUrl.pathname.slice(
      0,
      creatorModuleUrl.pathname.lastIndexOf('/') + 1,
    );
    for (const specifier of moduleSpecifiers(creatorModuleBytes.toString('utf8'))) {
      const referencedPath = new URL(specifier, creatorModuleUrl).pathname;
      expect(referencedPath.startsWith(creatorModuleDirectory)).toBe(true);
      expect(files.get(referencedPath)).toMatchObject({ cache: 'immutable' });
    }

    for (const file of manifest.files) {
      expect(file.bytes).toBeGreaterThan(0);
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
      const path = resolve(repoRoot, `dist/sdk-assets${file.path}`);
      expect(existsSync(path)).toBe(true);
      const source = readFileSync(path, 'utf8');
      expect(source).not.toContain('sourceMappingURL=');
      expect(browserUnresolvableSpecifiers(source)).toEqual([]);
    }

    const runtimeSource = manifest.files
      .filter((file) => isRuntimeDeliveryAsset(file.path))
      .map((file) => readFileSync(resolve(repoRoot, `dist/sdk-assets${file.path}`), 'utf8'))
      .join('\n');
    expect(runtimeSource).not.toMatch(/@lexical|Lexical/);
    expect(runtimeSource).not.toMatch(/\bReact\b|from ["']react["']|react\/jsx-runtime/);
    expect(runtimeSource).not.toMatch(/@lodariq\/sdk-authoring|sdk-authoring/);
    expect(runtimeSource).not.toMatch(/@lodariq\/dashboard|apps\/dashboard/);
    expect(runtimeSource).not.toContain('authoring.inline-content.commit');
    expect(runtimeSource).not.toContain('authoring.inline-control.commit');
    expect(runtimeSource).not.toContain('data-lodariq-authoring-context-toolbar');
    expect(runtimeSource.toLowerCase()).not.toContain('contenteditable');
  });

  it('creates a verified existing-bucket upload plan for the selected exact CDN origin', () => {
    execFileSync('node', ['scripts/prepare-sdk-assets.mjs'], {
      cwd: repoRoot,
      env: { ...process.env, LODARIQ_CDN_ORIGIN: 'https://staging-cdn.lodariq.io' },
      stdio: 'pipe',
    });
    const plan = JSON.parse(
      execFileSync('node', ['scripts/publish-sdk-assets.mjs', '--plan'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }),
    ) as {
      creatorModule: { url: string; version: string; integrity: string };
      files: Array<{
        key: string;
        path: string;
        bytes: number;
        sha256: string;
        cache: 'short' | 'immutable';
        cacheControl: string;
      }>;
    };

    expect(new URL(plan.creatorModule.url).origin).toBe('https://staging-cdn.lodariq.io');
    expect(plan.creatorModule.version).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(plan.creatorModule.integrity).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/u);
    expect(plan.files.length).toBeGreaterThan(3);
    expect(plan.files.every((file) => file.path === `/${file.key}`)).toBe(true);
    expect(plan.files.every((file) => file.bytes > 0 && /^[a-f0-9]{64}$/u.test(file.sha256))).toBe(
      true,
    );
    expect(plan.files.find((file) => file.path === '/sdk/lodariq-loader.js')).toMatchObject({
      cache: 'short',
      cacheControl: 'public,max-age=300,must-revalidate',
    });
    expect(
      plan.files.find((file) => file.path === new URL(plan.creatorModule.url).pathname),
    ).toMatchObject({
      cache: 'immutable',
      cacheControl: 'public,max-age=31536000,immutable',
    });

    const publisher = readFileSync(resolve(repoRoot, 'scripts/publish-sdk-assets.mjs'), 'utf8');
    expect(publisher).toContain("'head-bucket'");
    expect(publisher).toContain("'put-object'");
    expect(publisher).toContain("'head-object'");
    expect(publisher).toContain("new Set(['default', 'eu', 'fedramp'])");
    expect(publisher).toContain('jurisdictionSubdomain');
    expect(publisher).toContain('cacheControlMatches');
    expect(publisher).toContain("url.searchParams.set('lodariqVerification', randomUUID())");
    expect(publisher).toContain("process.argv.includes('--verify-public')");
    expect(publisher).toContain('public SDK assets without uploading');
    expect(publisher).not.toMatch(/delete-object|delete-bucket|create-bucket/iu);
  });

  it('rejects a non-origin CDN value before preparing uploadable assets', () => {
    expect(() =>
      execFileSync('node', ['scripts/prepare-sdk-assets.mjs'], {
        cwd: repoRoot,
        env: {
          ...process.env,
          LODARIQ_CDN_ORIGIN: 'https://cdn.lodariq.io/customer/path',
        },
        stdio: 'pipe',
      }),
    ).toThrow();
  });
});

function isRuntimeDeliveryAsset(path: string): boolean {
  return (
    path === '/sdk/lodariq-loader.js' ||
    path === '/sdk/lodariq-public-bootstrap.js' ||
    path.startsWith('/sdk/runtime/') ||
    path.startsWith('/sdk/renderers/') ||
    path.startsWith('/sdk/resolver/')
  );
}

function browserUnresolvableSpecifiers(source: string): string[] {
  return moduleSpecifiers(source).filter((specifier) => !specifier.startsWith('.'));
}

function moduleSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(/import\s*(?:[^'"]+?\s*from\s*)?['"]([^'"]+)['"]/g),
    ...source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/export\s*[^'"]+?\s*from\s*['"]([^'"]+)['"]/g),
  ]
    .map((match) => match[1])
    .filter((specifier): specifier is string => typeof specifier === 'string');
}

function readManifest(): SdkAssetManifest {
  return JSON.parse(
    readFileSync(resolve(repoRoot, 'dist/sdk-assets/manifest.json'), 'utf8'),
  ) as SdkAssetManifest;
}
