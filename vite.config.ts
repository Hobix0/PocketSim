import { defineConfig } from 'vite';

export default defineConfig({
  // Relative Pfade, damit der Build auch aus einem Unterordner läuft
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000, // three.js allein ist ~500 kB
    rolldownOptions: {
      output: {
        // Leerzeichen in Dateinamen (z. B. "2026 Palette.png") durch _ ersetzen – sicherer in URLs
        assetFileNames: (asset) => {
          const name = (asset.names?.[0] ?? 'asset').replace(/\.[^.]+$/, '').replace(/\s+/g, '_');
          return `assets/${name}-[hash][extname]`;
        },
      },
    },
  },
});
