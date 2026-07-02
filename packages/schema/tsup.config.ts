import { defineConfig } from 'tsup';

// Bundles internal relative imports into self-contained, Node-runnable ESM while
// keeping deps (@sinclair/typebox) external. Source stays extensionless.
export default defineConfig({
  entry: { index: 'src/index.ts', dom: 'src/dom.ts', url: 'src/url.ts' },
  format: ['esm'],
  target: 'es2020',
  platform: 'neutral',
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
