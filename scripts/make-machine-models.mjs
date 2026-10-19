// Erzeugt die Voxel-Modelle der Maschinen (data/modelle/<id>.json, typ "modell").
// Würfel zu 2,5 cm; Vorderseite ist +X (wie bei allen Modellen), Ursprung unten in der Mitte.
// Im Voxel-Editor lassen sich die Modelle danach weiter bearbeiten (öffnen, ändern, speichern).
//
// Aufruf: node scripts/make-machine-models.mjs

import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('data/modelle');
const S = 0.025;

function model(id, name, dims, draw) {
  const [nx, ny, nz] = dims;
  const data = new Array(nx * ny * nz).fill(0);
  const idx = (x, y, z) => (x * ny + y) * nz + z;
  const set = (x, y, z, c) => { if (x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz) data[idx(x, y, z)] = c; };
  const box = (x0, x1, y0, y1, z0, z1, c) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, c); };
  const disc = (cx, cy, cz, r, x0, x1, c) => { for (let x = x0; x <= x1; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) if ((y - cy) ** 2 + (z - cz) ** 2 <= r * r) set(x, y, z, c); };
  draw({ box, set, disc, nx, ny, nz });
  // Lauflängen-Code wie im Editor (VoxelModel.encodeGrid)
  const palette = [];
  const index = new Map();
  const runs = [];
  let last = -1, count = 0;
  for (const v of data) {
    let c = 0;
    if (v) {
      if (!index.has(v)) { palette.push(v); index.set(v, palette.length); }
      c = index.get(v);
    }
    if (c === last) count++;
    else { if (count) runs.push(`${count}*${last}`); last = c; count = 1; }
  }
  if (count) runs.push(`${count}*${last}`);
  const file = { id, name, typ: 'modell', preis: 0, ebene: 'objekt', kantenlaenge: S, groesse: dims, palette, voxel: runs.join(',') };
  fs.mkdirSync(OUT, { recursive: true });
  // Ein schon vorhandenes Vorschaubild (aus dem Editor) bleibt erhalten
  const target = path.join(OUT, `${id}.json`);
  if (fs.existsSync(target)) {
    const old = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (old.vorschau) file.vorschau = old.vorschau;
  }
  fs.writeFileSync(target, JSON.stringify(file, null, 2) + '\n');
  console.log(`${id}: ${dims.join('×')} Würfel, ${palette.length} Farben`);
}

const STAHL = '#b8bec4', STAHL_D = '#8f969d', STAHL_H = '#d6dbdf', SCHWARZ = '#1f1f22', DUNKEL = '#2f3a45';
const GLAS = '#3b2a20', GLUT = '#c8782d', TEIG = '#d6a05a', TEIG_D = '#b47a3c', GRUEN = '#5fd08a', ROT = '#c8382f', WEISS = '#e8e4dc';

// Backstation: Unterschrank, Ofen mit Sichtfenster (Brötchen dahinter), Bedienleiste
model('backstation', 'Backstation', [32, 64, 56], ({ box, set }) => {
  box(2, 29, 0, 1, 2, 4, SCHWARZ); box(2, 29, 0, 1, 51, 53, SCHWARZ);          // Füße
  box(0, 30, 2, 23, 0, 55, STAHL_D);                                          // Unterschrank
  box(31, 31, 4, 21, 2, 26, STAHL); box(31, 31, 4, 21, 29, 53, STAHL);         // Schranktüren
  box(31, 31, 12, 13, 22, 25, SCHWARZ); box(31, 31, 12, 13, 30, 33, SCHWARZ);  // Griffe
  box(0, 30, 24, 55, 0, 55, STAHL);                                           // Ofen
  box(31, 31, 26, 53, 4, 51, STAHL_H);                                        // Türrahmen
  box(31, 31, 29, 49, 8, 47, GLAS);                                           // Sichtfenster
  for (const y of [33, 41]) {                                                  // Bleche mit Brötchen
    box(31, 31, y, y, 9, 46, STAHL_D);
    for (let z = 10; z <= 44; z += 5) { box(31, 31, y + 1, y + 2, z, z + 3, TEIG); set(31, y + 3, z + 1, TEIG_D); set(31, y + 3, z + 2, TEIG_D); }
  }
  box(31, 31, 47, 48, 8, 47, GLUT);                                           // warmes Licht oben
  box(32 - 1, 31, 51, 52, 10, 45, SCHWARZ);                                   // Türgriff
  box(22, 31, 56, 63, 0, 55, DUNKEL);                                         // Bedienleiste
  box(31, 31, 58, 61, 6, 17, '#0e3a2a'); box(31, 31, 59, 60, 7, 15, GRUEN);   // Anzeige
  for (const [z, c] of [[24, ROT], [30, GRUEN], [36, '#e0b23c']]) box(31, 31, 58, 61, z, z + 3, c);
  box(0, 21, 56, 59, 0, 55, STAHL_D);                                         // Abzug hinten
});

// Saftpresse: Tisch, weiße Presse mit Orangen im Trichter, Auslauf mit Glas
model('saftpresse', 'Saftpresse', [32, 56, 48], ({ box, set }) => {
  for (const [x, z] of [[2, 2], [2, 44], [28, 2], [28, 44]]) box(x, x + 1, 0, 33, z, z + 1, STAHL_D); // Tischbeine
  box(0, 31, 30, 31, 0, 47, STAHL_D);                                         // Ablage unten? (Zarge)
  box(0, 31, 34, 36, 0, 47, STAHL);                                           // Tischplatte
  box(4, 9, 0, 9, 28, 43, '#3d4f6b');                                         // Kiste Leerflaschen unten
  for (let z = 29; z <= 42; z += 3) box(5, 8, 10, 14, z, z + 1, '#9fd1c8');
  box(4, 25, 37, 54, 8, 39, WEISS);                                           // Gehäuse
  box(26, 26, 39, 52, 10, 37, '#d8d3c8');                                     // Front
  box(8, 22, 55, 55, 10, 37, '#cfc9bd');                                      // Rand oben
  for (let x = 9; x <= 21; x += 3) for (let z = 11; z <= 35; z += 3) { box(x, x + 1, 55, 55, z, z + 1, '#e8862a'); } // Orangen im Trichter
  box(27, 29, 44, 46, 21, 26, '#cfc9bd');                                     // Auslauf
  box(27, 29, 37, 42, 21, 26, '#f1e6c8'); box(28, 28, 38, 41, 22, 25, '#e0a020'); // Glas mit Saft
  box(26, 26, 48, 50, 30, 33, GRUEN); box(26, 26, 48, 50, 13, 16, ROT);        // Knöpfe
});

// Aufschnittmaschine: Theke, Maschine mit rundem Messer, Salami auf dem Schlitten
model('aufschnittmaschine', 'Aufschnittmaschine', [28, 50, 40], ({ box, disc, set }) => {
  box(0, 27, 0, 33, 0, 39, WEISS);                                            // Theke
  box(27, 27, 2, 31, 2, 37, '#d8d3c8');                                       // Front
  box(27, 27, 28, 29, 2, 37, STAHL_D);                                        // Leiste
  box(0, 27, 34, 35, 0, 39, STAHL);                                           // Arbeitsplatte
  box(4, 20, 36, 39, 6, 33, '#c9ced3');                                       // Sockel der Maschine
  disc(12, 45, 14, 8, 10, 11, '#dfe3e6');                                     // Messer
  disc(12, 45, 14, 3, 12, 12, STAHL_D);                                       // Nabe
  box(13, 18, 40, 44, 22, 32, '#c9ced3');                                     // Schlitten
  for (let z = 23; z <= 31; z++) for (let y = 45; y <= 48; y++) set(15, y, z, '#a3412c'); // Salami
  box(14, 17, 45, 48, 23, 31, '#a3412c');
  for (const [y, z] of [[46, 24], [47, 27], [46, 30]]) set(17, y, z, '#f1d6c8');
  box(20, 24, 36, 37, 30, 37, '#f5f2ea');                                     // Teller mit Scheiben
  for (const z of [31, 34]) box(21, 23, 38, 38, z, z + 2, '#b8504a');
});
