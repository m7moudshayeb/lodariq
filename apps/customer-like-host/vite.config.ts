import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 4188 },
  preview: { port: 4188 },
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
