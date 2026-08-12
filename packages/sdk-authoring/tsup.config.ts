import { defineConfig } from 'tsup';

// Creator-only authoring package. React, Lexical, Floating UI and @lodariq/*
// stay external (declared deps); only internal modules are bundled. One output
// per public subpath export.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'authoring-frame': 'src/authoring-frame.ts',
    'hosted-entry': 'src/hosted-entry.ts',
    'lodariq-authoring': 'src/index.ts',
    'lodariq-creator': 'src/creator-install/index.ts',
    'bridge/index': 'src/bridge/index.ts',
    'creator-install/index': 'src/creator-install/index.ts',
    'creator-experiences': 'src/creator-experiences.ts',
    'creator-toolbar/index': 'src/creator-toolbar/index.ts',
    'editor/index': 'src/editor/index.ts',
    i18n: 'src/i18n.ts',
    'local-dev/index': 'src/local-dev/index.ts',
    'local-dev/install': 'src/local-dev/install.ts',
    'local-dev/frame': 'src/local-dev/frame.ts',
  },
  format: ['esm'],
  // Authenticated authoring requires modern module support so locale catalogs
  // can load before dependent creator modules evaluate. Production runtime and
  // viewer bundles retain their separate ES2020 target.
  target: 'es2022',
  platform: 'browser',
  dts: true,
  sourcemap: true,
  minify: true,
  clean: true,
  splitting: true,
  treeshake: true,
  noExternal: [
    /^@floating-ui\//,
    /^@lodariq\/i18n(?:\/.*)?$/,
    /^@lodariq\/schema(?:\/.*)?$/,
    /^@lodariq\/sdk-runtime(?:\/.*)?$/,
    /^lucide$/,
  ],
});
