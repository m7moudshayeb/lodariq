import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const fromRoot = (path: string): string => resolve(repoRoot, path);

/**
 * Centralized test runner. Default environment is `node`; DOM-dependent suites
 * (sdk-runtime resolver, sdk-authoring bridge) opt in per file via the
 * `// @vitest-environment jsdom` docblock so node-only suites keep full
 * access to Web Crypto for content hashing.
 */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@lodariq\/schema\/dom$/,
        replacement: fromRoot('packages/schema/src/dom.ts'),
      },
      {
        find: /^@lodariq\/schema$/,
        replacement: fromRoot('packages/schema/src/index.ts'),
      },
      {
        find: /^@lodariq\/compiler$/,
        replacement: fromRoot('packages/compiler/src/index.ts'),
      },
      {
        find: /^@lodariq\/sdk-runtime\/lodariq-loader$/,
        replacement: fromRoot('packages/sdk-runtime/src/loader/index.ts'),
      },
      {
        find: /^@lodariq\/sdk-runtime\/lodariq-runtime$/,
        replacement: fromRoot('packages/sdk-runtime/src/runtime/index.ts'),
      },
      {
        find: /^@lodariq\/sdk-runtime\/lodariq-local-dev$/,
        replacement: fromRoot('packages/sdk-runtime/src/local-dev/index.ts'),
      },
      {
        find: /^@lodariq\/sdk-runtime\/loader$/,
        replacement: fromRoot('packages/sdk-runtime/src/loader/index.ts'),
      },
      {
        find: /^@lodariq\/sdk-runtime\/runtime$/,
        replacement: fromRoot('packages/sdk-runtime/src/runtime/index.ts'),
      },
      {
        find: /^@lodariq\/sdk-runtime\/resolver$/,
        replacement: fromRoot('packages/sdk-runtime/src/resolver/index.ts'),
      },
      {
        find: /^@lodariq\/sdk-runtime\/renderers\/tour$/,
        replacement: fromRoot('packages/sdk-runtime/src/renderers/tour.ts'),
      },
      {
        find: /^@lodariq\/sdk-runtime\/local-dev$/,
        replacement: fromRoot('packages/sdk-runtime/src/local-dev/index.ts'),
      },
      {
        find: /^@lodariq\/sdk-runtime$/,
        replacement: fromRoot('packages/sdk-runtime/src/index.ts'),
      },
      {
        find: /^@lodariq\/sdk-authoring\/lodariq-authoring$/,
        replacement: fromRoot('packages/sdk-authoring/src/index.ts'),
      },
      {
        find: /^@lodariq\/sdk-authoring\/bridge$/,
        replacement: fromRoot('packages/sdk-authoring/src/bridge/index.ts'),
      },
      {
        find: /^@lodariq\/sdk-authoring\/editor$/,
        replacement: fromRoot('packages/sdk-authoring/src/editor/index.ts'),
      },
      {
        find: /^@lodariq\/sdk-authoring\/local-dev$/,
        replacement: fromRoot('packages/sdk-authoring/src/local-dev/index.ts'),
      },
      {
        find: /^@lodariq\/sdk-authoring\/local-dev\/install$/,
        replacement: fromRoot('packages/sdk-authoring/src/local-dev/install.ts'),
      },
      {
        find: /^@lodariq\/sdk-authoring\/local-dev\/frame$/,
        replacement: fromRoot('packages/sdk-authoring/src/local-dev/frame.ts'),
      },
      {
        find: /^@lodariq\/sdk-authoring$/,
        replacement: fromRoot('packages/sdk-authoring/src/index.ts'),
      },
    ],
  },
  test: {
    include: ['**/*.test.ts'],
    setupFiles: [fromRoot('packages/tests/vitest.setup.ts')],
  },
});
