import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 4199 },
  preview: { port: 4199 },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        authoring: 'authoring.html',
      },
    },
  },
});
