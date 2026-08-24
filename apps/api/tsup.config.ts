import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/server.ts',
    'src/analytics-export-generation-worker.ts',
  ],
  format: ['esm'],
  dts: process.env.LODARIQ_BUILD_DECLARATIONS !== 'false',
  sourcemap: true,
  clean: true,
  splitting: false,
});
