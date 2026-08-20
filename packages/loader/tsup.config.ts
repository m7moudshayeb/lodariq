import { defineConfig } from 'tsup';

// Deliberately dependency-free: this package exists to be small enough that a
// customer's bundle analyzer does not notice it.
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'es2020',
  platform: 'browser',
  dts: process.env.LODARIQ_BUILD_DECLARATIONS !== 'false',
  sourcemap: true,
  minify: true,
  clean: true,
  treeshake: true,
});
