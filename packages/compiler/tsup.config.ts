import { defineConfig } from 'tsup';

// Pure isomorphic compiler. Internal modules are bundled; @lodariq/schema stays
// external (and is type-only here). Output is self-contained Node-runnable ESM.
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'es2020',
  platform: 'neutral',
  dts: process.env.LODARIQ_BUILD_DECLARATIONS !== 'false',
  sourcemap: true,
  clean: true,
  treeshake: true,
});
