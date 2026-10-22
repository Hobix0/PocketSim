// Erzeugt Modelle für das Leben in der Welt (data/modelle/<id>.json, typ "modell"):
// Autos (drei Farben/Formen), Hund, Taube, Straßenbaum. Sie stehen nicht im Baumenü (menue "leben"),
// das Spiel setzt sie selbst ein (src/world/Ambience.ts, Werte in data/leben). Vorne ist +X.
//
// Aufruf: npm run modelle:leben   (Baukasten: scripts/lib/voxel-model.mjs)

import { model, shade } from './lib/voxel-model.mjs';

const SCHWARZ = '#1f1f22', REIFEN = '#2b2b2e', FELGE = '#9aa0a6', GLAS = '#9fc2c9', GLAS_D = '#7da2aa';
const LICHT = '#fff3c4', ROTLICHT = '#c8382f', CHROM = '#c9cdd1';

/** Ein Auto in 5-cm-Würfeln: Länge × Höhe × Breite, Farbe, Form */
function auto(id, name, farbe, form) {
  const L = form === 'lieferwagen' ? 96 : 80, H = form === 'lieferwagen' ? 44 : 32, B = 34;
  model({
    id, name, dims: [L, H, B], size: 0.05, menue: 'leben',
    draw: ({ box, cyl, nx, nz }) => {
      const D = shade(farbe, 0.82);
      // Karosserie unten
      box(2, nx - 3, 4, 13, 1, nz - 2, (x, y) => (y === 13 ? D : farbe));
      // Aufbau mit Fenstern
      const vorn = form === 'lieferwagen' ? nx - 22 : nx - 24, hinten = form === 'kombi' || form === 'lieferwagen' ? 4 : 14;
      const dach = form === 'lieferwagen' ? H - 2 : H - 3;
      for (let x = hinten; x <= vorn; x++) {
        // Schräge Front- und Heckscheibe
        const top = x > vorn - 6 ? dach - (x - (vorn - 6)) : x < hinten + 4 && form === 'klein' ? dach - (hinten + 4 - x) : dach;
        box(x, x, 14, top, 2, nz - 3, (xx, y, z) => {
          if (y === top) return D;
          const rand = z === 2 || z === nz - 3;
          if (form === 'lieferwagen' && x < vorn - 12) return rand ? farbe : farbe; // Laderaum ohne Fenster
          return y > 16 && y < top - 1 && !(x % 14 === 0) ? (rand ? GLAS : GLAS_D) : farbe;
        });
      }
      // Lieferwagen: Schriftband auf dem Laderaum
      if (form === 'lieferwagen') for (const z of [2, nz - 3]) box(10, vorn - 16, 22, 26, z, z, '#f1ead9');
      // Räder
      for (const x of [16, nx - 18]) for (const z of [1, nz - 4]) {
        cyl('z', x, 5, 5, z, z + 2, REIFEN);
        const aussen = z === 1 ? 0 : z + 3; // Felge auf der Außenseite
        cyl('z', x, 5, 2, aussen, aussen, FELGE);
      }
      // Scheinwerfer vorne, Rücklichter hinten, Stoßstangen
      box(nx - 2, nx - 1, 8, 10, 3, 7, LICHT); box(nx - 2, nx - 1, 8, 10, nz - 8, nz - 4, LICHT);
      box(0, 1, 9, 11, 3, 6, ROTLICHT); box(0, 1, 9, 11, nz - 7, nz - 4, ROTLICHT);
      box(nx - 2, nx - 1, 4, 5, 2, nz - 3, CHROM); box(0, 1, 4, 5, 2, nz - 3, CHROM);
      // Spiegel
      box(vorn - 8, vorn - 6, 17, 18, 0, 0, D); box(vorn - 8, vorn - 6, 17, 18, nz - 1, nz - 1, D);
    },
  });
}
auto('auto_klein', 'Kleinwagen', '#c8483c', 'klein');
auto('auto_kombi', 'Kombi', '#7fa07c', 'kombi');
auto('auto_lieferwagen', 'Lieferwagen', '#e9e2d2', 'lieferwagen');

// Hund (Beagle-artig), läuft neben Passanten
model({
  id: 'hund', name: 'Hund', dims: [28, 20, 10], menue: 'leben',
  draw: ({ box }) => {
    const FELL = '#c08a4a', WEISS = '#f1ead9', DUNKEL = '#5a3b22';
    box(4, 21, 7, 13, 2, 7, (x, y) => (y < 9 ? WEISS : x > 8 && x < 16 && y > 11 ? DUNKEL : FELL)); // Körper
    for (const x of [5, 18]) for (const z of [2, 6]) box(x, x + 1, 0, 6, z, z + 1, x === 5 ? FELL : WEISS); // Beine
    box(20, 26, 11, 17, 2, 7, FELL); box(25, 27, 11, 13, 3, 6, WEISS); box(27, 27, 13, 13, 4, 5, SCHWARZ); // Kopf, Schnauze, Nase
    box(24, 24, 15, 15, 2, 2, SCHWARZ); box(24, 24, 15, 15, 7, 7, SCHWARZ); // Augen
    box(20, 22, 10, 16, 1, 1, DUNKEL); box(20, 22, 10, 16, 8, 8, DUNKEL); // Ohren
    box(1, 4, 12, 14, 4, 5, FELL); box(0, 1, 14, 17, 4, 5, WEISS); // Schwanz
  },
});

// Taube
model({
  id: 'taube', name: 'Taube', dims: [12, 10, 6], menue: 'leben',
  draw: ({ box, set }) => {
    const GRAU = '#8e939c', HELL = '#b6bbc4', HALS = '#6f8f7c';
    box(2, 9, 2, 5, 1, 4, GRAU); box(3, 8, 5, 6, 1, 4, HELL); // Körper, Flügel
    box(8, 10, 5, 8, 2, 3, HALS); box(10, 11, 7, 8, 2, 3, GRAU); set(11, 7, 2, '#d9a35a'); set(11, 7, 3, '#d9a35a'); // Hals, Kopf, Schnabel
    set(10, 8, 1, SCHWARZ); set(10, 8, 4, SCHWARZ);
    box(0, 2, 3, 4, 2, 3, '#5d626b'); // Schwanz
    box(5, 5, 0, 1, 2, 2, '#c97a6a'); box(5, 5, 0, 1, 3, 3, '#c97a6a'); // Füße
  },
});

// Straßenbaum: Stamm mit Baumscheibe, lockere Krone (nur die Hülle, mit Lücken)
model({
  id: 'baum_strasse', name: 'Straßenbaum', dims: [48, 96, 48], size: 0.05, menue: 'deko',
  draw: ({ box, cyl, set, hash }) => {
    const STAMM = '#7a5a3c', BLATT = ['#5f8f4e', '#6fa05a', '#4f7f45', '#82b065', '#a8c47a'];
    box(16, 31, 0, 1, 16, 31, '#6b5a48'); // Baumscheibe
    cyl('y', 24, 24, 2, 0, 58, STAMM);
    for (const [dx, dz, y] of [[6, 0, 44], [-5, 4, 50], [0, -6, 54]]) for (let t = 0; t < 10; t++) set(24 + Math.round(dx * t / 10), y + t, 24 + Math.round(dz * t / 10), STAMM);
    // Krone aus drei Kugeln, nur die äußere Schale mit kleinen Lücken
    const kugeln = [[24, 66, 24, 18], [16, 58, 28, 12], [32, 60, 20, 12], [26, 78, 22, 11]];
    for (let x = 0; x < 48; x++) for (let y = 40; y < 96; y++) for (let z = 0; z < 48; z++) {
      let innen = false, schale = false;
      for (const [cx, cy, cz, r] of kugeln) {
        const d = Math.hypot(x - cx, y - cy, z - cz);
        if (d <= r - 2.2) innen = true; else if (d <= r) schale = true;
      }
      if (!schale || innen) continue;
      const h = hash(x, y, z);
      if (h < 0.18) continue;
      set(x, y, z, BLATT[Math.floor(h * 997) % BLATT.length]);
    }
  },
});
