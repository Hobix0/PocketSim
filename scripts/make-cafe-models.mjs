// Erzeugt die Modelle der Café-Ecke (data/modelle/<id>.json, typ "modell"):
// Siebträger-Kaffeemaschine auf Tresen, Café-Theke mit Glasaufsatz, Bistrotisch mit zwei Stühlen,
// Hängeschild „CAFÉ“ und die Becher (Kaffee to go, Cappuccino). Vorne ist +X, Würfel zu 2,5 cm.
//
// Aufruf: npm run modelle:cafe   (Baukasten: scripts/lib/voxel-model.mjs)

import { model, shade } from './lib/voxel-model.mjs';

const HOLZ = '#9a6a43', HOLZ_D = '#6e4a2e', HOLZ_H = '#b9845a', CREME = '#f1ead9', STAHL = '#c3c8cc', STAHL_D = '#8f969d';
const SCHWARZ = '#1f1f22', KUPFER = '#c07a45', GRUEN = '#3f6b55', GLAS = '#cfe6ec', MARMOR = '#e9e6df', MARMOR_D = '#d3cfc6';
const h = (m) => Math.round(m / 0.025);

// Kaffeemaschine: Holztresen, darauf eine glänzende Siebträgermaschine mit Kupferhaube, Tassen oben
model({
  id: 'kaffeemaschine', name: 'Kaffeemaschine', dims: [26, 58, 40], menue: 'maschinen',
  draw: ({ box, rough, cyl, nx, nz }) => {
    // Tresen mit Holzfront und Marmorplatte
    rough(0, nx - 1, 0, h(0.88) - 1, 0, nz - 1, HOLZ, 0.05);
    for (let z = 2; z < nz - 2; z += 4) box(nx - 1, nx - 1, 2, h(0.88) - 3, z, z + 1, HOLZ_D);
    box(0, nx - 1, h(0.88), h(0.88) + 1, 0, nz - 1, (x, y, z) => ((x * 3 + z) % 7 ? MARMOR : MARMOR_D));
    const y0 = h(0.88) + 2;
    // Maschine: Gehäuse, Haube, Gruppen, Tropfgitter
    box(3, 16, y0, y0 + 13, 5, nz - 6, STAHL);
    box(3, 16, y0 + 14, y0 + 15, 5, nz - 6, KUPFER);
    box(4, 15, y0 + 16, y0 + 16, 6, nz - 7, STAHL_D);
    box(17, 17, y0 + 1, y0 + 2, 6, nz - 7, SCHWARZ); // Tropfgitter
    for (const z of [12, nz - 13]) {
      box(17, 19, y0 + 8, y0 + 9, z - 1, z + 1, STAHL_D); // Brühgruppe
      box(18, 21, y0 + 6, y0 + 6, z, z, SCHWARZ); // Griff des Siebträgers
      box(18, 19, y0 + 3, y0 + 4, z - 1, z, CREME); // Tasse
    }
    box(17, 17, y0 + 11, y0 + 12, nz / 2 - 2, nz / 2 + 1, '#5fd08a'); // Anzeige
    box(17, 18, y0 + 10, y0 + 12, 7, 7, STAHL_D); // Dampflanze
    // Tassen auf der Haube
    for (let z = 8; z < nz - 8; z += 4) box(7, 9, y0 + 17, y0 + 18, z, z + 1, CREME);
    // Mühle daneben
    cyl('y', 9, nz - 3, 2, y0, y0 + 10, SCHWARZ);
    cyl('y', 9, nz - 3, 2, y0 + 11, y0 + 14, '#6b4a33');
  },
});

// Café-Theke: Holzunterbau, zwei Böden hinter Glas für Becher und Gebäck, Marmorplatte
model({
  id: 'cafe_theke', name: 'Café-Theke', dims: [28, 48, 56], menue: 'einrichtung',
  draw: ({ box, rough, nx, ny, nz }) => {
    rough(0, nx - 1, 0, h(0.4), 0, nz - 1, HOLZ, 0.05);
    for (let z = 3; z < nz - 3; z += 5) box(nx - 1, nx - 1, 2, h(0.4) - 2, z, z + 2, HOLZ_H);
    box(0, nx - 1, h(0.4) + 1, h(0.4) + 1, 0, nz - 1, MARMOR);
    box(2, nx - 3, h(0.75), h(0.75), 2, nz - 3, MARMOR_D); // zweiter Boden
    // Glasaufsatz: Rahmen aus Holz, Glas vorne und oben
    for (const z of [0, nz - 1]) box(0, nx - 1, h(0.4) + 2, ny - 2, z, z, HOLZ_D);
    box(nx - 1, nx - 1, h(0.4) + 2, ny - 2, 1, nz - 2, GLAS);
    box(0, nx - 1, ny - 1, ny - 1, 0, nz - 1, HOLZ_D);
    box(1, nx - 2, ny - 2, ny - 2, 1, nz - 2, GLAS);
    // Kreideschild vorne
    box(nx - 1, nx - 1, 4, 10, nz / 2 - 8, nz / 2 + 7, SCHWARZ);
    box(nx - 1, nx - 1, 7, 7, nz / 2 - 6, nz / 2 + 5, CREME);
  },
});

// Bistrotisch mit zwei Stühlen (links und rechts), runde Marmorplatte auf schwarzem Fuß
model({
  id: 'bistrotisch', name: 'Bistrotisch mit Stühlen', dims: [26, 36, 60], menue: 'deko',
  draw: ({ box, cyl, nx, nz }) => {
    const cx = Math.floor(nx / 2), cz = Math.floor(nz / 2);
    cyl('y', cx, cz, 4, 0, 0, SCHWARZ);
    box(cx, cx, 1, h(0.72) - 1, cz, cz, SCHWARZ);
    cyl('y', cx, cz, 10, h(0.72), h(0.72), (i, j) => ((i + j) % 5 ? MARMOR : MARMOR_D));
    // Tassen auf dem Tisch
    box(cx - 3, cx - 2, h(0.72) + 1, h(0.72) + 2, cz - 4, cz - 3, CREME);
    box(cx + 2, cx + 3, h(0.72) + 1, h(0.72) + 2, cz + 3, cz + 4, CREME);
    // Stühle: Sitz in 46 cm, Lehne außen
    for (const [z0, dir] of [[0, -1], [nz - 10, 1]]) {
      const z1 = z0 + 9;
      for (const [x, z] of [[cx - 4, z0 + 1], [cx + 4, z0 + 1], [cx - 4, z1 - 1], [cx + 4, z1 - 1]]) box(x, x, 0, h(0.45) - 1, z, z, SCHWARZ);
      box(cx - 5, cx + 5, h(0.45), h(0.45), z0, z1, GRUEN);
      const lz = dir < 0 ? z0 : z1;
      box(cx - 5, cx + 5, h(0.45) + 1, h(0.85), lz, lz, (x, y) => (y % 3 ? shade(GRUEN, 0.85) : SCHWARZ));
    }
  },
});

// Hängeschild „CAFÉ“ (gleiche Bauart wie die Abteilungsschilder)
model({
  id: 'schild_cafe', name: 'Hängeschild Café', dims: [4, 56, 60], ebene: 'decke', menue: 'schilder', ursprung: [-2, -56, -30],
  draw: ({ box, text, textWidth, nx, nz }) => {
    for (const z of [6, nz - 7]) box(1, 2, 14, 55, z, z, '#8f969d');
    box(0, nx - 1, 0, 13, 0, nz - 1, HOLZ_D);
    box(0, nx - 1, 1, 12, 1, nz - 2, CREME);
    const w = textWidth('KAFFEE', 2), top = 11;
    text(nx - 1, top, Math.floor(nz / 2 + w / 2), 'KAFFEE', HOLZ_D, 2, '+x');
    text(0, top, Math.floor(nz / 2 - w / 2), 'KAFFEE', HOLZ_D, 2, '-x');
  },
});

// Becher (Würfel zu 1 cm): Pappbecher mit Banderole und Deckel
function becher(id, name, banderole, deckel) {
  model({
    id, name, dims: [7, 11, 7], size: 0.01, menue: 'leben',
    draw: ({ box }) => {
      box(1, 5, 0, 8, 1, 5, CREME);
      box(0, 6, 3, 6, 0, 6, banderole);
      box(1, 5, 9, 10, 1, 5, deckel);
      box(0, 6, 9, 9, 0, 6, deckel);
    },
  });
}
becher('becher_kaffee', 'Kaffee to go', '#6e4a2e', SCHWARZ);
becher('becher_cappuccino', 'Cappuccino', '#3f6b55', '#f7f3ea');

// Kaffeebohnen-Sack (Rohstoff)
model({
  id: 'sack_kaffeebohnen', name: 'Kaffeebohnen', dims: [10, 14, 8], size: 0.01, menue: 'leben',
  draw: ({ box }) => {
    box(0, 9, 0, 11, 0, 7, (x, y, z) => ((x + y + z) % 3 ? '#b8946a' : '#a7845c'));
    box(0, 9, 12, 13, 2, 5, '#a7845c');
    box(9, 9, 4, 8, 2, 5, '#5a3b22');
  },
});
