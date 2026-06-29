import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 4188 },
  preview: { port: 4188 },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: 'index.html',
        authoring: 'authoring.html',
      },
    },
  },
});
