import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  /*
   * The emoji picker is a lazy chunk inside the SDK's built output, so Vite only
   * discovers `frimousse` when a creator first opens that panel — and rebuilding
   * the SDK invalidates the optimiser mid-session. The chunk then 504s with
   * "Outdated Optimize Dep" and the picker never arrives. Naming it up front
   * makes it a known dependency instead of one discovered too late.
   */
  optimizeDeps: { include: ['frimousse'] },
  server: { port: 5175 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: 'index.html',
        authoring: 'authoring.html',
      },
    },
  },
});
