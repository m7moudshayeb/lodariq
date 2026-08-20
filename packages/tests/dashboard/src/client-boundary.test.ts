import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const dashboardSrc = resolve(repoRoot, 'apps/dashboard/src');

describe('@lodariq/dashboard client boundaries', () => {
  it('keeps network calls out of UI components and inside client API modules', () => {
    const clientFiles = readSourceFiles(dashboardSrc).filter((file) =>
      read(file).startsWith("'use client';"),
    );
    const permittedSameOriginClients = new Map([
      ['apps/dashboard/src/lib/client-auth-api.ts', 1],
      ['apps/dashboard/src/lib/client-authoring-activation-api.ts', 1],
      ['apps/dashboard/src/lib/client-dashboard-api.ts', 1],
      ['apps/dashboard/src/lib/client-locale-api.ts', 1],
      ['apps/dashboard/src/lib/client-tenant-api.ts', 1],
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
    expect(packageJson).toContain('"@tanstack/react-query"');
    expect(packageJson).toContain('"react-hook-form"');
    expect(packageJson).toContain('"lucide-react"');
    expect(packageJson).toContain('"sonner"');

    const documentsTable = read(resolve(dashboardSrc, 'components/documents-table.tsx'));
    expect(documentsTable).toContain("from '@tanstack/react-table'");
    expect(documentsTable).toContain("from './ui/table'");
    expect(documentsTable).toContain("from './ui/button'");

    const sdkPanel = read(resolve(dashboardSrc, 'components/sdk-snippet-panel.tsx'));
    expect(sdkPanel).toContain("from './ui/select'");
    expect(sdkPanel).toContain("from './ui/input'");
    expect(sdkPanel).toContain('useSdkInstallationActions');
    expect(sdkPanel).toContain('canManageSdkInstallations');
    expect(sdkPanel).toContain('A workspace admin or owner');
    // The kill switch is an admin control and must stay behind the same gate.
    expect(sdkPanel).toContain('suspensionAction');

    const brandPanel = read(resolve(dashboardSrc, 'components/brand-system-panel.tsx'));
    const brandController = read(
      resolve(dashboardSrc, 'components/brand-system/use-brand-system-controller.ts'),
    );
    const brandApprovalReview = read(
      resolve(dashboardSrc, 'components/brand-system/brand-approval-review.tsx'),
    );
    const brandImpactPanel = read(
      resolve(dashboardSrc, 'components/brand-system/brand-impact-panel.tsx'),
    );
    const brandThemeEditor = read(
      resolve(dashboardSrc, 'components/brand-system/brand-theme-editor.tsx'),
    );
    expect(brandController).toContain('useBrandSystemMutations');
    expect(brandPanel).toContain('Review & approve');
    expect(brandController).toContain('isCurrentBrandApprovalReview');
    expect(brandApprovalReview).toContain('<BrandTourComparison');
    expect(brandImpactPanel).toContain('Use approved version');
    expect(brandThemeEditor).not.toContain('<textarea');
    expect(brandThemeEditor).not.toContain('name="css"');

    const brandComparison = read(resolve(dashboardSrc, 'components/brand-tour-comparison.tsx'));
    expect(brandComparison).toContain("from '@lodariq/sdk-runtime/renderers/tour'");
    expect(brandComparison).toContain('embeddedPreviewContainer');
    expect(brandComparison).not.toContain('dangerouslySetInnerHTML');

    const dashboardSettings = read(
      resolve(dashboardSrc, 'components/dashboard-settings-views.tsx'),
    );
    expect(dashboardSettings).toContain('useEnvironmentApprovalMutation');
    expect(dashboardSettings).toContain('ProductionEnvironmentPolicy');
    expect(dashboardSettings).toContain(
      'return translate(approvalRequired ? COPY.removeApproval : COPY.requireApproval)',
    );
    expect(dashboardSettings).toContain('One explicit approval is required');
  });

  it('keeps dashboard orchestration separate from feature UI and document readiness typed', () => {
    const dashboardWorkspace = read(resolve(dashboardSrc, 'components/dashboard-workspace.tsx'));
    const accountPage = read(resolve(repoRoot, 'apps/dashboard/src/app/(dashboard)/account/page.tsx'));
    const brandPanel = read(resolve(dashboardSrc, 'components/brand-system-panel.tsx'));
    const viewModel = read(resolve(dashboardSrc, 'lib/view-model.ts'));
    const documentsTable = read(resolve(dashboardSrc, 'components/documents-table.tsx'));

    expect(dashboardWorkspace.split('\n').length).toBeLessThanOrEqual(250);
    expect(accountPage).toContain('AccountWorkspaceShell');
    expect(brandPanel.split('\n').length).toBeLessThanOrEqual(300);
    expect(viewModel).toContain('DashboardDocumentReadiness');
    expect(`${viewModel}\n${documentsTable}`).not.toMatch(
      /(?:document\.status|status)\s*===\s*['"](?:ready|invalid)['"]/,
    );
  });

  it('keeps the full-width loading skeleton off auth pages', () => {
    const loading = read(resolve(dashboardSrc, 'app/(dashboard)/loading.tsx'));
    expect(existsSync(resolve(dashboardSrc, 'app/loading.tsx'))).toBe(false);
    expect(loading).toContain('md:grid-cols-[72px_minmax(0,1fr)]');
    expect(loading).not.toContain('max-w-6xl');
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
