import { defineConfig } from 'tsup';

// Creator-only authoring package. React, Lexical, Floating UI and @talmeh/*
// stay external (declared deps); only internal modules are bundled. One output
// per public subpath export.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'talmeh-authoring': 'src/index.ts',
    'bridge/index': 'src/bridge/index.ts',
    'editor/index': 'src/editor/index.ts',
    'local-dev/index': 'src/local-dev/index.ts',
    'local-dev/install': 'src/local-dev/install.ts',
    'local-dev/frame': 'src/local-dev/frame.ts',
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
