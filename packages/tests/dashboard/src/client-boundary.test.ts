import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const dashboardSrc = resolve(repoRoot, 'apps/dashboard/src');

describe('@lodariq/dashboard client boundaries', () => {
  it('keeps browser components on server actions instead of direct fetch calls', () => {
    const clientFiles = readSourceFiles(dashboardSrc).filter((file) =>
      read(file).startsWith("'use client';"),
    );

    expect(clientFiles.map((file) => relative(repoRoot, file))).toEqual(
      expect.arrayContaining([
        'apps/dashboard/src/components/authoring-launch-panel.tsx',
        'apps/dashboard/src/components/document-debug-panel.tsx',
        'apps/dashboard/src/components/documents-table.tsx',
        'apps/dashboard/src/components/sdk-snippet-panel.tsx',
      ]),
    );

    for (const file of clientFiles) {
      const source = read(file);
      expect(source, relative(repoRoot, file)).not.toMatch(/\bfetch\s*\(/);
      expect(source, relative(repoRoot, file)).not.toMatch(/\bXMLHttpRequest\b/);
      expect(source, relative(repoRoot, file)).not.toMatch(/\baxios\b/);
    }

    expect(read(resolve(dashboardSrc, 'lib/api.ts'))).toContain("import 'server-only';");
  });

  it('uses library-backed dashboard controls instead of ad hoc tables and selects', () => {
    const packageJson = read(resolve(repoRoot, 'apps/dashboard/package.json'));
    expect(packageJson).toContain('"@radix-ui/react-select"');
    expect(packageJson).toContain('"@tanstack/react-table"');
    expect(packageJson).toContain('"lucide-react"');

    const documentsTable = read(resolve(dashboardSrc, 'components/documents-table.tsx'));
    expect(documentsTable).toContain("from '@tanstack/react-table'");
    expect(documentsTable).toContain("from './ui/table'");
    expect(documentsTable).toContain("from './ui/button'");

    const sdkPanel = read(resolve(dashboardSrc, 'components/sdk-snippet-panel.tsx'));
    expect(sdkPanel).toContain("from './ui/select'");
    expect(sdkPanel).toContain("from './ui/input'");
    expect(sdkPanel).toContain('useActionState(createEnvironmentTokenAction');
  });
});

function readSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readSourceFiles(path);
    if (entry.isFile() && ['.ts', '.tsx'].includes(extname(entry.name))) return [path];
    return [];
  });
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}
