import { defineConfig } from 'tsup';

// One output per public subpath export. Internal modules shared across entries
// become hashed chunks (proper extensions, Node-safe). Browser runtime deps used
// by CDN-installed snippets are bundled so customer pages do not rely on
// bare-specifier resolution; React/Lexical are never present here by design.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'lodariq-loader': 'src/loader/index.ts',
    'lodariq-runtime': 'src/runtime/index.ts',
    'lodariq-local-dev': 'src/local-dev/index.ts',
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
  minify: true,
  clean: true,
  splitting: true,
  treeshake: true,
  noExternal: [/^@floating-ui\//, /^@lodariq\/schema\/(?:dom|url)$/],
});
