import { defineConfig } from 'vite';
import { criticalModulePreload } from './vite-plugins/critical-modulepreload';

export default defineConfig({
  plugins: [
    criticalModulePreload({
      modules: [
        // The application module: bridge, services, and the mount call.
        'apps/editor/src/authoring-frame-app.ts',
        // The React workspace — the largest asset a creator waits on.
        'sdk-authoring/src/authoring/local-frame-app',
        /**
         * The Rich Content editor.
         *
         * It is loaded through a `lazy()` boundary so that Lexical stays out of
         * the workspace chunk's parse, but it is not optional: every step has
         * text, so the card renders an empty placeholder until it arrives.
         * Without this declaration it was discovered only after the workspace
         * had finished, and the card sat blank for ~190 ms.
         *
         * Lazy for chunking, preloaded for timing — the two are not in tension.
         */
        'sdk-authoring/src/editor/rich-content-editor',
      ],
    }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
    /**
     * Build workspace packages from source rather than from their published
     * `dist`.
     *
     * `@lodariq/sdk-authoring` inlines `@lodariq/schema` into its own bundle,
     * because the CDN entries it also produces must contain no bare imports.
     * The editor does not have that constraint, and consuming the pre-bundled
     * output meant shipping schema and TypeBox twice — once inlined, once
     * resolved directly — roughly 250 KB of duplicate in the largest chunk on
     * the first-paint path.
     *
     * Reading source also gives Rollup real modules to work with instead of
     * tsup's already-merged chunks, which is what let a single 1.7 MB chunk
     * form in the first place. Every subpath already declares a `source`
     * condition; this turns it on.
     */
    conditions: ['source', 'module', 'browser', 'import', 'default'],
  },
  server: { port: 4199 },
  preview: { port: 4199 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    // Hidden rather than off: the size gate attributes bytes to source modules
    // through these maps, and without them a budget can report a number but
    // never say which module moved it. No `sourceMappingURL` is emitted, so
    // nothing is exposed to a creator's devtools that was not before.
    sourcemap: 'hidden',
    // The size gate reads the chunk graph from here rather than re-deriving it
    // from minified output, so it can tell a first-paint chunk from one behind
    // a dynamic import.
    manifest: true,
    rollupOptions: {
      input: {
        authoring: 'authoring.html',
      },
    },
  },
});
