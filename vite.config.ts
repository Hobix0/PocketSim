import { defineConfig } from 'vite';

export default defineConfig({
  // Relative Pfade, damit der Build auch aus einem Unterordner läuft
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 },   // three.js allein ist ~500 kB
});
