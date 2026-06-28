import { defineConfig } from 'vitest/config';

/**
 * Centralized test runner. Default environment is `node`; DOM-dependent suites
 * (sdk-runtime resolver, sdk-authoring bridge) opt in per file via the
 * `// @vitest-environment jsdom` docblock so node-only suites keep full
 * access to Web Crypto for content hashing.
 */
export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
  },
});
