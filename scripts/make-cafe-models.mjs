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
