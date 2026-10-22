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

// ── Gemütliche Möbel und Deko (Forschungsbaum „Café“) ──────────────────────────
const SAMT = '#b4553f', SAMT_D = '#8e3f2e', SENF = '#d39b3a', SENF_D = '#a87726', SALBEI = '#7c9a7e', SALBEI_D = '#5e7a61';
const MESSING = '#c9a24a', TERRA = '#c0673f', TERRA_D = '#9a4e2d', BLATT = '#3f7a4a', BLATT_D = '#2e5c37', BLATT_H = '#5c9a5e';
const RATTAN = '#c99a5b', RATTAN_D = '#a57a40';

/** Polster mit leichter Naht-Struktur */
const polster = (c, d) => (x, y, z) => ((x + z) % 6 === 0 ? d : c);

// Sofa (2 Plätze): Holzfüße, Samtpolster, Kissen
model({
  id: 'sofa_cafe', name: 'Samtsofa', dims: [32, 34, 64], menue: 'deko',
  draw: ({ box, nx, nz }) => {
    for (const [x, z] of [[1, 1], [1, nz - 3], [nx - 3, 1], [nx - 3, nz - 3]]) box(x, x + 1, 0, 2, z, z + 1, HOLZ_D);
    box(0, nx - 1, 3, 15, 0, nz - 1, polster(SAMT, SAMT_D)); // Sitzfläche
    box(0, 9, 16, 33, 0, nz - 1, polster(SAMT, SAMT_D)); // Lehne hinten
    for (const z of [0, nz - 6]) box(0, nx - 1, 16, 23, z, z + 5, SAMT_D); // Armlehnen
    box(10, 14, 16, 25, 12, 20, SENF); box(10, 14, 16, 25, nz - 21, nz - 13, SALBEI); // Kissen
  },
});

// Sessel (1 Platz), senfgelb
model({
  id: 'sessel_cafe', name: 'Ohrensessel', dims: [32, 40, 32], menue: 'deko',
  draw: ({ box, nx, nz }) => {
    for (const [x, z] of [[1, 1], [1, nz - 3], [nx - 3, 1], [nx - 3, nz - 3]]) box(x, x + 1, 0, 2, z, z + 1, HOLZ_D);
    box(0, nx - 1, 3, 15, 0, nz - 1, polster(SENF, SENF_D));
    box(0, 8, 16, 39, 2, nz - 3, polster(SENF, SENF_D));
    for (const z of [0, nz - 5]) { box(0, nx - 1, 16, 24, z, z + 4, SENF_D); box(0, 5, 25, 37, z, z + 2, SENF_D); }
  },
});

// Couchtisch: runde Holzplatte, Bücherstapel, Kerze
model({
  id: 'couchtisch', name: 'Couchtisch', dims: [28, 18, 28], menue: 'deko',
  draw: ({ box, cyl, nx, nz }) => {
    const c = Math.floor(nx / 2);
    for (const [x, z] of [[c - 7, c - 7], [c + 6, c - 7], [c - 7, c + 6], [c + 6, c + 6]]) box(x, x, 0, 15, z, z, HOLZ_D);
    cyl('y', c, c, 13, 16, 17, (i, j) => ((i * 2 + j) % 9 ? HOLZ : HOLZ_H));
    box(c - 6, c - 1, 18 - 0, 17 + 2, c - 5, c + 2, '#4a86b0'); // Buch
    box(c + 2, c + 3, 18, 17 + 4, c + 3, c + 4, CREME); // Kerze
  },
});

// Stehlampe: Messingfuß, Stoffschirm (leuchtet)
model({
  id: 'stehlampe', name: 'Stehlampe', dims: [16, 66, 16], menue: 'deko',
  draw: ({ box, cyl }) => {
    cyl('y', 8, 8, 5, 0, 0, MESSING);
    box(8, 8, 1, 52, 8, 8, MESSING);
    for (let y = 52; y <= 64; y++) cyl('y', 8, 8, 4 + Math.round((64 - y) / 4), y, y, (i, j) => (Math.abs(i) + Math.abs(j) > 3 + (64 - y) / 4 ? '#f3dca6' : 0));
    box(7, 9, 53, 55, 7, 9, '#fff3c4');
  },
});

// Bücherregal: Holz, bunte Buchrücken, eine Pflanze oben
model({
  id: 'buecherregal_cafe', name: 'Bücherregal', dims: [14, 76, 40], menue: 'deko',
  draw: ({ box, rough, nx, ny, nz }) => {
    rough(0, 1, 0, ny - 6, 0, nz - 1, HOLZ_D, 0.05);
    for (const z of [0, nz - 1]) box(0, nx - 1, 0, ny - 6, z, z, HOLZ);
    const farben = ['#b4553f', '#4a86b0', '#d39b3a', '#7c9a7e', '#8a63b5', '#e8e4dc', '#3f6b55'];
    for (const y0 of [0, 17, 34, 51]) {
      box(0, nx - 1, y0, y0, 0, nz - 1, HOLZ);
      let z = 1, i = y0;
      while (z < nz - 2) {
        const w = 1 + ((i * 7) % 3), hgt = 9 + ((i * 5) % 6);
        box(2, nx - 2, y0 + 1, y0 + hgt, z, Math.min(nz - 2, z + w - 1), farben[i % farben.length]);
        z += w; i++;
        if (i % 9 === 0) z += 3; // Lücke
      }
    }
    box(0, nx - 1, ny - 6, ny - 6, 0, nz - 1, HOLZ);
    box(4, 9, ny - 5, ny - 3, 28, 33, TERRA);
    box(3, 10, ny - 2, ny - 1, 27, 34, BLATT);
  },
});

// Kuchenvitrine: Glas, drei Kuchen auf Ständern (Bedientheke)
model({
  id: 'kuchenvitrine', name: 'Kuchenvitrine', dims: [28, 52, 48], menue: 'einrichtung',
  draw: ({ box, rough, cyl, nx, ny, nz }) => {
    rough(0, nx - 1, 0, 17, 0, nz - 1, '#f1ead9', 0.04);
    for (let z = 2; z < nz - 2; z += 4) box(nx - 1, nx - 1, 2, 15, z, z + 1, '#e3d9c2');
    box(0, nx - 1, 18, 18, 0, nz - 1, HOLZ_D);
    for (const z of [0, nz - 1]) box(0, nx - 1, 19, ny - 2, z, z, HOLZ_D);
    box(nx - 1, nx - 1, 19, ny - 2, 1, nz - 2, GLAS); box(1, nx - 2, ny - 1, ny - 1, 0, nz - 1, HOLZ_D);
    box(2, nx - 3, 34, 34, 2, nz - 3, '#d9e6e6'); // Glasboden
    const kuchen = [['#f3e2b3', '#e6c77a'], ['#5a3b22', '#7a5233'], ['#f1ead9', '#d0465a']];
    kuchen.forEach(([teig, deko], k) => {
      const z = 8 + k * 16;
      cyl('y', 14, z, 5, 19, 19, STAHL);
      cyl('y', 14, z, 5, 20, 24, teig); cyl('y', 14, z, 5, 25, 25, deko);
      cyl('y', 14, z, 4, 35, 38, k === 1 ? '#f3e2b3' : '#7a5233'); cyl('y', 14, z, 4, 39, 39, '#d0465a');
    });
  },
});

// Monstera im Terrakottatopf
model({
  id: 'monstera', name: 'Monstera', dims: [40, 56, 40], menue: 'deko',
  draw: ({ box, cyl, set }) => {
    for (let y = 0; y <= 12; y++) cyl('y', 20, 20, 6 + Math.floor(y / 5), y, y, y > 10 ? TERRA_D : TERRA);
    cyl('y', 20, 20, 6, 12, 12, '#5a3b22');
    // Blätter: große, gelochte Fächer in alle Richtungen
    const blatt = (cx, cy, cz, dx, dz) => {
      // Breites Herzblatt, leicht nach außen geneigt, mit den typischen Schlitzen
      for (let t = 0; t < 13; t++) for (let s = -7; s <= 7; s++) {
        const breite = 7 * Math.sin((t / 12) * Math.PI) + 1;
        if (Math.abs(s) > breite || (t % 3 === 1 && Math.abs(s) >= 3 && Math.abs(s) <= 5)) continue;
        for (const w of [0, 0.5]) {
          const x = Math.round(cx + dx * t - dz * (s + w)), z = Math.round(cz + dz * t + dx * (s + w)), y = Math.round(cy + t * 0.45 - Math.abs(s) * 0.35);
          set(x, y, z, s === 0 ? BLATT_D : (t + s) % 4 ? BLATT : BLATT_H);
        }
      }
    };
    for (const [y, dx, dz] of [[22, 1, 0], [28, -1, 0], [25, 0, 1], [32, 0, -1], [38, 0.7, 0.7], [36, -0.7, -0.7], [42, -0.7, 0.7]]) {
      box(20, 20, 12, y, 20, 20, BLATT_D);
      blatt(20 + dx * 2, y, 20 + dz * 2, dx, dz);
    }
  },
});

// Wandregal mit Tassen und Kaffeedosen (steht an der Wand)
model({
  id: 'wandregal_tassen', name: 'Wandregal mit Tassen', dims: [10, 72, 48], menue: 'deko',
  draw: ({ box, nx, nz }) => {
    for (const y of [36, 52, 68]) {
      box(0, nx - 1, y, y + 1, 0, nz - 1, HOLZ);
      for (const z of [3, nz - 4]) box(0, 2, y - 4, y - 1, z, z, SCHWARZ); // Halter
    }
    const tassen = [CREME, SALBEI, TERRA, CREME, '#4a86b0', SENF];
    tassen.forEach((c, i) => { const z = 4 + i * 7; box(3, 6, 38, 41, z, z + 3, c); box(4, 5, 39, 40, z + 4, z + 4, c); });
    for (let i = 0; i < 4; i++) { const z = 6 + i * 10; box(2, 7, 54, 61, z, z + 5, i % 2 ? KUPFER : SCHWARZ); box(2, 7, 62, 62, z, z + 5, STAHL_D); }
    for (let z = 6; z < nz - 6; z += 3) box(3, 7, 70, 74, z, z + 1, z % 2 ? BLATT : BLATT_H);
  },
});

// Rattan-Pendelleuchte (hängt an der Decke, leuchtet warm)
model({
  id: 'rattanleuchte', name: 'Rattan-Pendelleuchte', dims: [20, 48, 20], ebene: 'decke', menue: 'licht', ursprung: [-10, -48, -10],
  draw: ({ box, cyl }) => {
    box(10, 10, 20, 47, 10, 10, SCHWARZ);
    for (let y = 4; y <= 19; y++) {
      const r = Math.round(Math.sin(((y - 4) / 15) * Math.PI) * 8) + 1;
      cyl('y', 10, 10, r, y, y, (i, j) => (i * i + j * j >= (r - 1) * (r - 1) ? ((i + j + y) % 2 ? RATTAN : RATTAN_D) : 0));
    }
    box(9, 11, 6, 8, 9, 11, '#fff3c4');
  },
});

// Bartresen mit drei Barhockern (vorne, +X): Holzfront, Messingstange
model({
  id: 'bartresen', name: 'Bartresen mit Hockern', dims: [36, 46, 80], menue: 'einrichtung',
  draw: ({ box, rough, cyl, nz }) => {
    rough(0, 13, 0, 41, 0, nz - 1, HOLZ, 0.05);
    for (let z = 2; z < nz - 2; z += 5) box(13, 13, 3, 38, z, z + 2, HOLZ_H);
    box(0, 17, 42, 43, 0, nz - 1, (x, y, z) => ((x * 3 + z) % 7 ? MARMOR : MARMOR_D));
    box(15, 15, 5, 5, 0, nz - 1, MESSING); // Fußstange
    for (const z of [13, 40, 67]) {
      cyl('y', 29, z, 3, 0, 0, SCHWARZ);
      box(29, 29, 1, 28, z, z, SCHWARZ);
      cyl('y', 29, z, 5, 29, 31, SALBEI_D);
      cyl('y', 29, z, 5, 12, 12, MESSING);
    }
  },
});

// Terrassentisch mit Sonnenschirm und zwei Stühlen (draußen)
model({
  id: 'terrassentisch', name: 'Terrassentisch mit Schirm', dims: [32, 100, 64], menue: 'deko',
  draw: ({ box, cyl, nx, nz }) => {
    const cx = Math.floor(nx / 2), cz = Math.floor(nz / 2);
    cyl('y', cx, cz, 4, 0, 0, SCHWARZ);
    box(cx, cx, 1, 92, cz, cz, '#e8e4dc');
    cyl('y', cx, cz, 11, h(0.72), h(0.72), (i, j) => ((i + j) % 4 ? '#e8e4dc' : '#cfc9bd'));
    // Schirm: Streifen in Creme und Salbei
    for (let y = 84; y <= 94; y++) {
      const r = Math.round((94 - y) * 1.5) + 1;
      cyl('y', cx, cz, r, y, y, (i, j) => (y < 93 && (i * i + j * j) < (r - 1.5) * (r - 1.5) ? 0 : Math.floor((Math.atan2(j, i) + Math.PI) / (Math.PI / 4)) % 2 ? CREME : SALBEI));
    }
    for (const [z0, dir] of [[2, -1], [nz - 12, 1]]) {
      const z1 = z0 + 9;
      for (const [x, z] of [[cx - 4, z0 + 1], [cx + 4, z0 + 1], [cx - 4, z1 - 1], [cx + 4, z1 - 1]]) box(x, x, 0, h(0.45) - 1, z, z, '#e8e4dc');
      box(cx - 5, cx + 5, h(0.45), h(0.45), z0, z1, '#e8e4dc');
      const lz = dir < 0 ? z0 : z1;
      box(cx - 5, cx + 5, h(0.45) + 1, h(0.85), lz, lz, (x, y) => (y % 2 ? '#e8e4dc' : '#cfc9bd'));
    }
  },
});

// Blumenkasten aus Holz mit Lavendel und Geranien
model({
  id: 'blumenkasten', name: 'Blumenkasten', dims: [20, 30, 56], menue: 'deko',
  draw: ({ box, rough, set, nx, nz }) => {
    rough(0, nx - 1, 0, 15, 0, nz - 1, HOLZ, 0.06);
    for (let y = 2; y < 15; y += 4) box(nx - 1, nx - 1, y, y, 0, nz - 1, HOLZ_D);
    box(1, nx - 2, 15, 15, 1, nz - 2, '#5a3b22');
    for (let z = 2; z < nz - 2; z += 2) for (let x = 2; x < nx - 2; x += 3) {
      const hgt = 3 + ((x * 7 + z * 3) % 7);
      for (let y = 16; y < 16 + hgt; y++) set(x, y, z, BLATT);
      const blume = (x + z) % 3 === 0 ? '#d0465a' : (x + z) % 3 === 1 ? '#8a63b5' : '#f1ead9';
      set(x, 16 + hgt, z, blume); set(x + 1, 16 + hgt, z, blume);
    }
  },
});

// Kuchenstücke (Würfel zu 1 cm)
function stueck(id, name, teig, deko) {
  model({
    id, name, dims: [10, 7, 7], size: 0.01, menue: 'leben',
    draw: ({ box }) => {
      box(0, 9, 0, 0, 0, 6, '#e8e4dc'); // Teller
      for (let x = 1; x <= 8; x++) box(x, x, 1, 4, 3 - Math.floor(x / 3), 3 + Math.floor(x / 3), teig);
      for (let x = 1; x <= 8; x++) box(x, x, 5, 5, 3 - Math.floor(x / 3), 3 + Math.floor(x / 3), deko);
    },
  });
}
stueck('stueck_kaesekuchen', 'Käsekuchen', '#f3e2b3', '#e6c77a');
stueck('stueck_schokokuchen', 'Schokokuchen', '#5a3b22', '#3b2417');
stueck('stueck_erdbeertorte', 'Erdbeertorte', '#f1ead9', '#d0465a');

// ── Tresen-Baukasten: Module in vier Oberflächen ───────────────────────────────
// Alle Module sind 70 cm tief und 1,05 m hoch, vorne (+X) ist die Gästeseite, hinten (−X) arbeitet der Barista.
// Gerade (1 m), Ecke (70 × 70 cm, zwei Schauseiten +X und +Z), Ende (35 cm, Schauseite +Z), Bestelltresen (mit Kasse).
const FINISH = {
  holz: { name: 'Holz', top: (x, z) => ((x * 3 + z) % 9 ? '#5a3b22' : '#6e4a2e'), sockel: HOLZ_D,
    front: (u, y) => (u % 4 < 2 ? HOLZ : shade(HOLZ, 0.88)) },
  metro: { name: 'Metro-Fliese', top: (x, z) => ((x * 3 + z) % 7 ? MARMOR : MARMOR_D), sockel: '#2f3a45',
    front: (u, y) => { const row = Math.floor(y / 3), off = row % 2 ? 3 : 0; return y % 3 === 0 || (u + off) % 6 === 0 ? '#cfc9bd' : '#f4f1ea'; } },
  beton: { name: 'Beton', top: () => '#2b2b2e', sockel: '#5b6064',
    front: (u, y) => shade('#9aa0a3', 1 + (((u * 7 + y * 13) % 5) - 2) * 0.03) },
  salbei: { name: 'Salbei', top: (x, z) => ((x + z) % 8 ? HOLZ_H : HOLZ), sockel: SALBEI_D,
    front: (u, y) => (u % 10 === 0 || y === 6 || y === 38 ? SALBEI_D : SALBEI) },
};
const TH = 42, TOP = 40; // Höhe in Würfeln (1,05 m), Platte bei 1,00 m

/** Tresen-Körper: Sockel, Schauseiten in der Oberfläche, Rückseite mit Fächern, Platte mit Überstand */
function tresenKoerper({ box, set }, nx, nz, F, seiten, platte = true) {
  box(0, nx - 3, 0, 2, 0, nz - 1, F.sockel);
  box(0, nx - 3, 3, TOP - 1, 0, nz - 1, '#3b2a20');
  for (let y = 3; y < TOP; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx - 2; x++) {
    const vorne = seiten.includes('+x') && x === nx - 3, seite = seiten.includes('+z') && z === nz - 1, links = seiten.includes('-z') && z === 0;
    if (vorne) set(x, y, z, F.front(z, y));
    else if (seite || links) set(x, y, z, F.front(x, y));
  }
  // Rückseite (Barista): zwei Fachböden mit Tassen und Gläsern
  for (const y of [14, 27]) {
    box(0, 0, y, y, 1, nz - 2, HOLZ);
    for (let z = 2; z < nz - 2; z += 4) box(0, 1, y + 1, y + 3, z, z + 1, (z / 4) % 3 ? CREME : GLAS);
  }
  if (platte) box(0, nx - 1, TOP, TOP + 1, 0, nz - 1, (x, y, z) => F.top(x, z));
}

for (const [fid, F] of Object.entries(FINISH)) {
  model({ id: `tresen_${fid}_gerade`, name: `Tresen ${F.name} (gerade)`, dims: [28, TH, 40], menue: 'einrichtung',
    draw: (api) => tresenKoerper(api, 28, 40, F, ['+x']) });
  model({ id: `tresen_${fid}_ecke`, name: `Tresen ${F.name} (Ecke)`, dims: [28, TH, 28], menue: 'einrichtung',
    draw: (api) => tresenKoerper(api, 28, 28, F, ['+x', '+z']) });
  model({ id: `tresen_${fid}_ende`, name: `Tresen ${F.name} (Endstück)`, dims: [28, TH, 14], menue: 'einrichtung',
    draw: (api) => {
      tresenKoerper(api, 28, 14, F, ['+x', '+z']);
      api.box(0, 27, TOP, TOP + 1, 13, 13, 0); api.box(27, 27, TOP, TOP + 1, 12, 13, 0); // abgerundete Kante
    } });
  // Bestelltresen: Kassen-Tablet, Becherstapel, Trinkgeldglas, Kreideschild vorne
  model({ id: `bestelltresen_${fid}`, name: `Bestelltresen ${F.name}`, dims: [28, 56, 40], menue: 'einrichtung',
    draw: (api) => {
      const { box, cyl } = api;
      tresenKoerper(api, 28, 40, F, ['+x']);
      box(4, 5, TOP + 2, TOP + 10, 26, 26, SCHWARZ); box(4, 9, TOP + 6, TOP + 12, 22, 30, SCHWARZ); box(5, 8, TOP + 7, TOP + 11, 23, 29, '#4a86b0');
      for (let i = 0; i < 3; i++) cyl('y', 6, 8 + i * 4, 1, TOP + 2, TOP + 9 - i, CREME);
      cyl('y', 20, 33, 2, TOP + 2, TOP + 6, GLAS); box(20, 20, TOP + 3, TOP + 4, 33, 33, MESSING);
      box(25, 25, TOP + 2, TOP + 8, 10, 16, SCHWARZ); box(25, 25, TOP + 5, TOP + 5, 11, 15, CREME);
    } });
}

// Sondermodule (Metro-Fliese mit Edelstahl): Spüle, Kühlung mit Glastür, Kuchenhauben
const M = FINISH.metro;
model({ id: 'tresen_spuele', name: 'Tresen mit Spüle', dims: [28, 52, 40], menue: 'einrichtung',
  draw: (api) => {
    const { box, cyl } = api;
    tresenKoerper(api, 28, 40, M, ['+x'], false);
    box(0, 27, TOP, TOP + 1, 0, 39, STAHL); box(3, 14, TOP + 1, TOP + 1, 8, 31, 0); box(3, 14, TOP - 3, TOP, 8, 31, STAHL_D); box(3, 14, TOP - 3, TOP - 3, 8, 31, '#8fb6c4');
    box(1, 1, TOP + 2, TOP + 10, 20, 20, STAHL); box(1, 6, TOP + 10, TOP + 10, 20, 20, STAHL); box(6, 6, TOP + 8, TOP + 9, 20, 20, STAHL);
    cyl('y', 8, 35, 2, TOP + 2, TOP + 6, '#7ab07c'); // Spülmittel
  } });
model({ id: 'tresen_kuehlung', name: 'Tresen mit Milchkühlschrank', dims: [28, TH, 40], menue: 'einrichtung',
  draw: (api) => {
    const { box } = api;
    tresenKoerper(api, 28, 40, M, ['+x']);
    box(0, 0, 4, TOP - 2, 2, 37, STAHL); box(0, 0, 6, TOP - 4, 4, 35, '#bcd8df'); // Glastür zur Barista-Seite
    for (const y of [12, 22, 31]) for (let z = 6; z < 34; z += 5) box(1, 2, y, y + 5, z, z + 2, (z / 5) % 2 ? '#f4f1ea' : '#e6d3a0');
    box(0, 0, TOP - 3, TOP - 3, 2, 37, '#5fd08a');
  } });
model({ id: 'tresen_kuchenhauben', name: 'Tresen mit Kuchenhauben', dims: [28, 58, 40], menue: 'einrichtung',
  draw: (api) => {
    const { box, cyl } = api;
    tresenKoerper(api, 28, 40, FINISH.holz, ['+x']);
    [[10, '#f3e2b3', '#e6c77a'], [29, '#5a3b22', '#d0465a']].forEach(([z, teig, deko]) => {
      cyl('y', 14, z, 7, TOP + 2, TOP + 2, STAHL);
      cyl('y', 14, z, 5, TOP + 3, TOP + 7, teig); cyl('y', 14, z, 5, TOP + 8, TOP + 8, deko);
      for (let y = TOP + 3; y <= TOP + 15; y++) { const r = y > TOP + 11 ? 7 - (y - TOP - 11) * 2 : 7; cyl('y', 14, z, Math.max(1, r), y, y, (i, j) => (i * i + j * j >= (r - 1) * (r - 1) || y === TOP + 15 ? GLAS : 0)); }
      box(14, 14, TOP + 16, TOP + 16, z, z, MESSING);
    });
  } });

// Siebträger-Maschinen in anderen Farben (gleiche Rezepte wie die Kaffeemaschine), auf Metro-Tresen
function siebtraeger(id, name, gehaeuse, haube, F) {
  model({ id, name, dims: [28, 64, 40], menue: 'maschinen',
    draw: (api) => {
      const { box, cyl, nz } = api;
      tresenKoerper(api, 28, 40, F, ['+x']);
      const y0 = TOP + 2;
      box(3, 16, y0, y0 + 13, 4, nz - 5, gehaeuse);
      box(3, 16, y0 + 14, y0 + 15, 4, nz - 5, haube);
      box(4, 15, y0 + 16, y0 + 16, 5, nz - 6, STAHL_D);
      box(17, 17, y0 + 1, y0 + 2, 5, nz - 6, SCHWARZ);
      for (const z of [11, 20, 29]) { box(17, 19, y0 + 8, y0 + 9, z - 1, z + 1, STAHL); box(18, 22, y0 + 6, y0 + 6, z, z, HOLZ_D); box(18, 19, y0 + 3, y0 + 4, z - 1, z, CREME); }
      for (const z of [8, 32]) { box(17, 17, y0 + 11, y0 + 12, z - 1, z + 1, STAHL); box(18, 18, y0 + 12, y0 + 12, z, z, SCHWARZ); } // Manometer
      for (let z = 7; z < nz - 7; z += 4) box(7, 9, y0 + 17, y0 + 18, z, z + 1, CREME);
    } });
}
siebtraeger('siebtraeger_rot', 'Siebträger Rot (3 Gruppen)', '#c8382f', STAHL, M);
siebtraeger('siebtraeger_creme', 'Siebträger Creme', '#efe6d2', KUPFER, FINISH.salbei);
siebtraeger('siebtraeger_schwarz', 'Siebträger Schwarz', SCHWARZ, MESSING, FINISH.beton);

// Mühlen-Station: zwei Mühlen, Klopfkasten, Bohnenglas auf Holztresen
model({ id: 'muehlenstation', name: 'Mühlen-Station', dims: [28, 66, 40], menue: 'einrichtung',
  draw: (api) => {
    const { box, cyl } = api;
    tresenKoerper(api, 28, 40, FINISH.holz, ['+x']);
    for (const [z, c] of [[11, SCHWARZ], [27, '#efe6d2']]) {
      box(8, 18, TOP + 2, TOP + 12, z - 4, z + 4, c);
      cyl('y', 13, z, 3, TOP + 13, TOP + 18, '#6b4a33'); cyl('y', 13, z, 4, TOP + 19, TOP + 24, GLAS); cyl('y', 13, z, 3, TOP + 19, TOP + 22, '#5a3b22');
      box(18, 20, TOP + 6, TOP + 7, z, z, STAHL_D);
    }
    box(19, 24, TOP + 2, TOP + 6, 17, 21, SCHWARZ);
  } });

// Filterkaffee-Bar: drei Handfilter auf Ständer, Waage, Schwanenhals-Kessel
model({ id: 'filterbar', name: 'Filterkaffee-Bar', dims: [28, 60, 40], menue: 'einrichtung',
  draw: (api) => {
    const { box, cyl } = api;
    tresenKoerper(api, 28, 40, FINISH.salbei, ['+x']);
    box(10, 20, TOP + 2, TOP + 2, 4, 35, HOLZ_D); box(10, 20, TOP + 12, TOP + 12, 4, 35, HOLZ_D);
    for (const z of [4, 35]) box(10, 20, TOP + 3, TOP + 11, z, z, HOLZ_D);
    for (const z of [10, 20, 30]) {
      for (let y = TOP + 13; y <= TOP + 17; y++) cyl('y', 15, z, 1 + (y - TOP - 13) / 2, y, y, (i, j) => (i * i + j * j >= (y - TOP - 13) / 2 * ((y - TOP - 13) / 2) - 0.5 ? CREME : 0));
      cyl('y', 15, z, 2, TOP + 3, TOP + 7, GLAS); cyl('y', 15, z, 2, TOP + 3, TOP + 5, '#5a3b22');
    }
    box(22, 25, TOP + 2, TOP + 2, 26, 34, SCHWARZ);
    cyl('y', 23, 8, 3, TOP + 2, TOP + 8, STAHL); box(24, 27, TOP + 7, TOP + 7, 8, 8, STAHL);
  } });

// Rückbuffet: hohes Regal hinter dem Tresen mit Bohnengläsern, Säcken und Pflanzen
model({ id: 'rueckbuffet', name: 'Rückbuffet mit Bohnen', dims: [16, 84, 56], menue: 'einrichtung',
  draw: ({ box, cyl, rough, nx, ny, nz }) => {
    rough(0, 1, 0, ny - 1, 0, nz - 1, HOLZ_D, 0.05);
    for (const z of [0, nz - 1]) box(0, nx - 1, 0, ny - 1, z, z, HOLZ);
    box(0, nx - 1, 0, 30, 1, nz - 2, HOLZ); for (let z = 1; z < nz - 1; z += 13) box(nx - 1, nx - 1, 4, 26, z + 1, z + 11, HOLZ_H);
    for (const y of [31, 48, 65, ny - 1]) box(0, nx - 1, y, y, 0, nz - 1, HOLZ);
    for (let i = 0; i < 6; i++) { const z = 4 + i * 8; cyl('y', 8, z + 2, 3, 49, 58, GLAS); cyl('y', 8, z + 2, 2, 49, 55, i % 2 ? '#5a3b22' : '#7a5233'); cyl('y', 8, z + 2, 3, 59, 59, i % 3 ? KUPFER : SCHWARZ); }
    for (let i = 0; i < 4; i++) { const z = 3 + i * 13; box(3, 12, 32, 43, z, z + 9, (x, y) => ((x + y) % 3 ? '#b8946a' : '#a7845c')); box(12, 12, 36, 40, z + 3, z + 6, '#5a3b22'); }
    for (let z = 4; z < nz - 4; z += 5) box(4, 10, 66, 69, z, z + 2, z % 2 ? BLATT : BLATT_H);
    box(4, 10, 70, 75, 22, 32, TERRA); box(3, 11, 76, 82, 20, 34, BLATT);
  } });

// Menütafel: große Kreidetafel mit Preisen (steht an der Wand)
model({ id: 'menuetafel', name: 'Menütafel', dims: [4, 80, 60], menue: 'deko',
  draw: ({ box, text, textWidth, nz }) => {
    box(0, 3, 40, 79, 0, nz - 1, HOLZ_D); box(3, 3, 42, 77, 2, nz - 3, '#2b2f2c');
    for (const z of [6, nz - 7]) box(1, 2, 0, 39, z, z, HOLZ_D);
    const zeilen = [['KAFFEE', '2.40'], ['LATTE', '3.20'], ['KUCHEN', '3.40']];
    text(3, 75, Math.floor(nz / 2 + textWidth('MENÜ', 1) / 2), 'MENÜ', '#f3dca6', 1, '+x');
    zeilen.forEach(([a, b], i) => { const y = 66 - i * 8; text(3, y, nz - 5, a, CREME, 1, '+x'); text(3, y, 5 + textWidth(b, 1), b, '#f3dca6', 1, '+x'); });
  } });

// Leuchtschrift „COFFEE“ in Neon (an der Wand, leuchtet)
model({ id: 'neon_coffee', name: 'Neon „COFFEE“', dims: [3, 48, 64], menue: 'licht',
  draw: ({ box, text, textWidth, nz }) => {
    box(0, 0, 30, 46, 2, nz - 3, '#2b2f2c');
    const w = textWidth('COFFEE', 2);
    text(1, 44, Math.floor(nz / 2 + w / 2), 'COFFEE', '#ff9f6b', 2, '+x');
    for (const z of [6, nz - 7]) box(0, 0, 0, 29, z, z, STAHL_D);
  } });

// Glühbirnen-Pendel: drei nackte Birnen an Textilkabeln (Decke, leuchtet warm)
model({ id: 'gluehbirnen', name: 'Glühbirnen-Pendel (3er)', dims: [12, 48, 48], ebene: 'decke', menue: 'licht', ursprung: [-6, -48, -24],
  draw: ({ box, cyl }) => {
    box(4, 7, 46, 47, 4, 43, SCHWARZ);
    for (const [z, l] of [[8, 22], [24, 30], [40, 18]]) {
      box(6, 6, 46 - l, 45, z, z, '#3b2a20');
      box(5, 7, 43 - l, 45 - l, z - 1, z + 1, MESSING);
      cyl('y', 6, z, 2, 37 - l, 42 - l, '#ffe7a8'); box(6, 6, 36 - l, 36 - l, z, z, '#ffe7a8');
    }
  } });
