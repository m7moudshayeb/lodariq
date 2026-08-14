import { defineConfig } from 'tsup';

// Bundles internal relative imports into self-contained, Node-runnable ESM while
// keeping deps (@sinclair/typebox) external. Source stays extensionless.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    version: 'src/version.ts',
    'delivery-compatibility': 'src/delivery-compatibility.ts',
    'compiler-version': 'src/compiler-version.ts',
    'compiled-runtime': 'src/compiled-runtime.ts',
    csp: 'src/csp.ts',
    dom: 'src/dom.ts',
    target: 'src/target.ts',
    'target-runtime': 'src/target-runtime.ts',
    'brand-runtime': 'src/brand-runtime.ts',
    'brand-registration-runtime': 'src/brand-registration-runtime.ts',
    'hosted-creator': 'src/hosted-creator.ts',
    'authoring-entry-runtime': 'src/authoring-entry-runtime.ts',
    'events-runtime': 'src/events-runtime.ts',
    url: 'src/url.ts',
  },
  format: ['esm'],
  target: 'es2020',
  platform: 'neutral',
  dts: process.env.LODARIQ_BUILD_DECLARATIONS !== 'false',
  sourcemap: true,
  clean: true,
  treeshake: true,
});
