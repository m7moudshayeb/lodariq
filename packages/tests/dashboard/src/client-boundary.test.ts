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
    const permittedSameOriginClients = new Map([
      ['apps/dashboard/src/components/authoring-activation-popup.tsx', 2],
      ['apps/dashboard/src/lib/client-auth-api.ts', 1],
    ]);

    expect(clientFiles.map((file) => relative(repoRoot, file))).toEqual(
      expect.arrayContaining([
        'apps/dashboard/src/components/authoring-launch-panel.tsx',
        'apps/dashboard/src/components/brand-system-panel.tsx',
        'apps/dashboard/src/components/authoring-activation-popup.tsx',
        'apps/dashboard/src/lib/client-auth-api.ts',
        'apps/dashboard/src/components/dashboard-workspace.tsx',
        'apps/dashboard/src/components/document-debug-panel.tsx',
        'apps/dashboard/src/components/documents-table.tsx',
        'apps/dashboard/src/components/launch-queue.tsx',
        'apps/dashboard/src/components/sdk-snippet-panel.tsx',
      ]),
    );

    for (const file of clientFiles) {
      const source = read(file);
      const sourcePath = relative(repoRoot, file);
      const permittedFetchCount = permittedSameOriginClients.get(sourcePath);
      if (permittedFetchCount !== undefined) {
        expect(source.match(/\bfetch\s*\(/g)).toHaveLength(permittedFetchCount);
        expect(source).not.toMatch(/fetch\s*\(\s*['"]https?:/);
        continue;
      }
      expect(source, sourcePath).not.toMatch(/\bfetch\s*\(/);
      expect(source, sourcePath).not.toMatch(/\bXMLHttpRequest\b/);
      expect(source, sourcePath).not.toMatch(/\baxios\b/);
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
    expect(sdkPanel).toMatch(/useActionState\(\s*createPublicSdkInstallationAction/u);
    expect(sdkPanel).toContain('canManageSdkInstallations');
    expect(sdkPanel).toContain('A workspace admin or owner');

    const brandPanel = read(resolve(dashboardSrc, 'components/brand-system-panel.tsx'));
    expect(brandPanel).toContain('saveBrandThemeDraftAction');
    expect(brandPanel).toContain('approveBrandThemeAction');
    expect(brandPanel).toContain('Review & approve');
    expect(brandPanel).toContain('isCurrentBrandApprovalReview');
    expect(brandPanel).toContain('<BrandTourComparison');
    expect(brandPanel).toContain('Use approved version');
    expect(brandPanel).not.toContain('<textarea');
    expect(brandPanel).not.toContain('name="css"');

    const brandComparison = read(resolve(dashboardSrc, 'components/brand-tour-comparison.tsx'));
    expect(brandComparison).toContain("from '@lodariq/sdk-runtime/renderers/tour'");
    expect(brandComparison).toContain('embeddedPreviewContainer');
    expect(brandComparison).not.toContain('dangerouslySetInnerHTML');

    const dashboardWorkspace = read(resolve(dashboardSrc, 'components/dashboard-workspace.tsx'));
    expect(dashboardWorkspace).toContain('updateEnvironmentReleasePolicyAction');
    expect(dashboardWorkspace).toContain('ProductionApprovalPolicy');
    expect(dashboardWorkspace).toContain(
      "approvalRequired ? 'Remove approval' : 'Require approval'",
    );
    expect(dashboardWorkspace).toContain('One explicit approval is required');
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
