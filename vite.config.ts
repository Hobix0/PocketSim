import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Nur im Entwicklungsserver: Der Voxel-Editor speichert eigene Modelle direkt als Datei
// in data/modelle/<id>.json (POST /__editor/save, Löschen mit POST /__editor/delete).
// Im fertigen Build (z. B. Artifact) gibt es das nicht – dort speichert der Editor im Browser.
function editorSave(): Plugin {
  const dir = path.resolve(process.cwd(), 'data/modelle');
  const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9_]{1,64}$/.test(id);
  return {
    name: 'urbanevolution-editor-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'POST' || !req.url?.startsWith('/__editor/')) return next();
        let body = '';
        req.on('data', (chunk) => { body += chunk; if (body.length > 20_000_000) req.destroy(); });
        req.on('end', () => {
          try {
            const data = JSON.parse(body) as { id?: unknown };
            if (!validId(data.id)) throw new Error('ungültige id');
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `${data.id}.json`);
            if (req.url === '/__editor/save') fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
            else if (req.url === '/__editor/delete') fs.rmSync(file, { force: true });
            else throw new Error('unbekannte Aktion');
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, datei: `data/modelle/${data.id}.json` }));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, fehler: String(err) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  // Relative Pfade, damit der Build auch aus einem Unterordner läuft
  base: './',
  // FBX-Modelle aus Blender als Dateien behandeln
  assetsInclude: ['**/*.fbx'],
  plugins: [editorSave()],
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
