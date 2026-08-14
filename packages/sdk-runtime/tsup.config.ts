import { defineConfig } from 'tsup';

// One output per public subpath export. Internal modules shared across entries
// become hashed chunks (proper extensions, Node-safe). Browser runtime deps used
// by CDN-installed snippets are bundled so customer pages do not rely on
// bare-specifier resolution; React/Lexical are never present here by design.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    i18n: 'src/i18n.ts',
    'brand-token-registry': 'src/brand-token-registry.ts',
    'lodariq-loader': 'src/loader/index.ts',
    'lodariq-public-bootstrap': 'src/activation/public-bootstrap.ts',
    'lodariq-activation': 'src/activation/authoring-activation.ts',
    'lodariq-public-delivery': 'src/activation/public-delivery.ts',
    'lodariq-runtime': 'src/runtime/index.ts',
    'lodariq-local-dev': 'src/local-dev/index.ts',
    'activation/public-bootstrap': 'src/activation/public-bootstrap.ts',
    'activation/authoring-activation': 'src/activation/authoring-activation.ts',
    'activation/public-delivery': 'src/activation/public-delivery.ts',
    'runtime/index': 'src/runtime/index.ts',
    'resolver/index': 'src/resolver/index.ts',
    'renderers/tour': 'src/renderers/tour.ts',
    'renderers/tour-choreography': 'src/renderers/tour-choreography.ts',
    'renderers/tour-flow': 'src/renderers/tour-flow.ts',
    'renderers/protected-surface': 'src/renderers/protected-surface.ts',
    'local-dev/index': 'src/local-dev/index.ts',
  },
  format: ['esm'],
  target: 'es2020',
  platform: 'browser',
  dts: process.env.LODARIQ_BUILD_DECLARATIONS !== 'false',
  sourcemap: true,
  minify: true,
  clean: true,
  splitting: true,
  treeshake: true,
  noExternal: [
    /^@floating-ui\//,
    /^@lodariq\/i18n(?:\/.*)?$/,
    /^@lodariq\/schema(?:\/.*)?$/,
    /^lucide$/,
  ],
});
