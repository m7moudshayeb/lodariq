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
        find: /^@talmeh\/schema\/dom$/,
        replacement: fromRoot('packages/schema/src/dom.ts'),
      },
      {
        find: /^@talmeh\/schema$/,
        replacement: fromRoot('packages/schema/src/index.ts'),
      },
      {
        find: /^@talmeh\/compiler$/,
        replacement: fromRoot('packages/compiler/src/index.ts'),
      },
      {
        find: /^@talmeh\/sdk-runtime\/talmeh-loader$/,
        replacement: fromRoot('packages/sdk-runtime/src/loader/index.ts'),
      },
      {
        find: /^@talmeh\/sdk-runtime\/talmeh-runtime$/,
        replacement: fromRoot('packages/sdk-runtime/src/runtime/index.ts'),
      },
      {
        find: /^@talmeh\/sdk-runtime\/talmeh-local-dev$/,
        replacement: fromRoot('packages/sdk-runtime/src/local-dev/index.ts'),
      },
      {
        find: /^@talmeh\/sdk-runtime\/loader$/,
        replacement: fromRoot('packages/sdk-runtime/src/loader/index.ts'),
      },
      {
        find: /^@talmeh\/sdk-runtime\/runtime$/,
        replacement: fromRoot('packages/sdk-runtime/src/runtime/index.ts'),
      },
      {
        find: /^@talmeh\/sdk-runtime\/resolver$/,
        replacement: fromRoot('packages/sdk-runtime/src/resolver/index.ts'),
      },
      {
        find: /^@talmeh\/sdk-runtime\/renderers\/tour$/,
        replacement: fromRoot('packages/sdk-runtime/src/renderers/tour.ts'),
      },
      {
        find: /^@talmeh\/sdk-runtime\/local-dev$/,
        replacement: fromRoot('packages/sdk-runtime/src/local-dev/index.ts'),
      },
      {
        find: /^@talmeh\/sdk-runtime$/,
        replacement: fromRoot('packages/sdk-runtime/src/index.ts'),
      },
      {
        find: /^@talmeh\/sdk-authoring\/talmeh-authoring$/,
        replacement: fromRoot('packages/sdk-authoring/src/index.ts'),
      },
      {
        find: /^@talmeh\/sdk-authoring\/bridge$/,
        replacement: fromRoot('packages/sdk-authoring/src/bridge/index.ts'),
      },
      {
        find: /^@talmeh\/sdk-authoring\/editor$/,
        replacement: fromRoot('packages/sdk-authoring/src/editor/index.ts'),
      },
      {
        find: /^@talmeh\/sdk-authoring\/local-dev$/,
        replacement: fromRoot('packages/sdk-authoring/src/local-dev/index.ts'),
      },
      {
        find: /^@talmeh\/sdk-authoring\/local-dev\/install$/,
        replacement: fromRoot('packages/sdk-authoring/src/local-dev/install.ts'),
      },
      {
        find: /^@talmeh\/sdk-authoring\/local-dev\/frame$/,
        replacement: fromRoot('packages/sdk-authoring/src/local-dev/frame.ts'),
      },
      {
        find: /^@talmeh\/sdk-authoring$/,
        replacement: fromRoot('packages/sdk-authoring/src/index.ts'),
      },
    ],
  },
  test: {
    include: ['**/*.test.ts'],
    setupFiles: [fromRoot('packages/tests/vitest.setup.ts')],
  },
});
