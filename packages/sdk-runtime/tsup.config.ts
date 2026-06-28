import { defineConfig } from 'tsup';

// One output per public subpath export. Internal modules shared across entries
// become hashed chunks (proper extensions, Node-safe). Deps (@floating-ui/dom,
// @talmeh/*) stay external; React/Lexical are never present here by design.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'loader/index': 'src/loader/index.ts',
    'runtime/index': 'src/runtime/index.ts',
    'resolver/index': 'src/resolver/index.ts',
    'renderers/tour': 'src/renderers/tour.ts',
    'local-dev/index': 'src/local-dev/index.ts',
  },
  format: ['esm'],
  target: 'es2020',
  platform: 'browser',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
});
