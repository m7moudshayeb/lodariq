import { defineConfig } from 'tsup';

// Creator-only authoring package. React, Lexical, Floating UI and @lodariq/*
// stay external (declared deps); only internal modules are bundled. One output
// per public subpath export.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'lodariq-authoring': 'src/index.ts',
    'lodariq-creator': 'src/creator-install/index.ts',
    'bridge/index': 'src/bridge/index.ts',
    'creator-install/index': 'src/creator-install/index.ts',
    'creator-toolbar/index': 'src/creator-toolbar/index.ts',
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
  minify: true,
  clean: true,
  splitting: true,
  treeshake: true,
  noExternal: [/^@floating-ui\//, /^@lodariq\/schema(?:\/.*)?$/, /^@lodariq\/sdk-runtime(?:\/.*)?$/],
});
