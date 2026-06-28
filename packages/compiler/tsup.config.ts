import { defineConfig } from 'tsup';

// Pure isomorphic compiler. Internal modules are bundled; @talmeh/schema stays
// external (and is type-only here). Output is self-contained Node-runnable ESM.
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'es2020',
  platform: 'neutral',
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
