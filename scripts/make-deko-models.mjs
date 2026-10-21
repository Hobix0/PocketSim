// Erzeugt gemütliche Deko und Einrichtung (data/modelle/<id>.json, typ "modell"):
// Wagenbox für Einkaufswagen, Holzbank, Laterne, Lavendelkübel, Fahrradständer, Kreidetafel, Lichterkette, Holzdielen.
// Die Spielwerte stehen in data/bau/<id>.json. Vorne ist +X, Ursprung unten in der Mitte.
//
// Aufruf: npm run modelle:deko   (Baukasten: scripts/lib/voxel-model.mjs)

import { model, shade } from './lib/voxel-model.mjs';

const HOLZ = '#c9a26b', HOLZ_D = '#a5824f', HOLZ_W = '#d8b47e', SCHWARZ = '#1f1f22', DUNKEL = '#2f3a45';
const GRUEN = '#3f6b55', GRUEN_D = '#335a47', TERRAKOTTA = '#c0673f', TERRA_D = '#9c5232';
const WARM = '#ffd48a', CREME = '#f1ead9', GLAS = '#9fc2c9';

// Wagenbox: Unterstand für Einkaufswagen (die Wagen selbst stellt das Spiel hinein, je nach Bestand)
model({
  id: 'wagenbox', name: 'Wagenbox', dims: [48, 76, 104], menue: 'einrichtung',
  draw: ({ box, text, textWidth, nx, ny, nz }) => {
    for (const [x, z] of [[0, 0], [0, nz - 3], [nx - 3, 0], [nx - 3, nz - 3]]) box(x, x + 2, 0, ny - 8, z, z + 2, GRUEN);
    // schräges Dach (vorne höher)
    for (let x = 0; x < nx; x++) {
      const y = Math.round(ny - 9 + (x / nx) * 6);
      box(x, x, y, y + 1, 0, nz - 1, (xx, yy, z) => (z % 13 === 0 || x % 12 === 0 ? GRUEN_D : GLAS));
    }
    // Seitenwände aus Gitter, Rückbügel
    for (const z of [0, nz - 1]) box(3, nx - 4, 4, 48, z, z, (x, y) => (x % 5 === 0 || y % 8 === 0 ? GRUEN : undefined));
    box(0, 1, 30, 32, 2, nz - 3, GRUEN_D);
    box(0, nx - 1, 0, 0, 0, nz - 1, '#7c7f7a');
    // Schild vorne oben
    box(nx - 1, nx - 1, ny - 17, ny - 10, 20, nz - 21, CREME);
    const s = 1, w = textWidth('WAGEN', s);
    text(nx - 1, ny - 11, Math.floor(nz / 2 + w / 2), 'WAGEN', GRUEN_D, s);
  },
});

// Holzbank mit Lehne
model({
  id: 'holzbank', name: 'Holzbank', dims: [24, 36, 64], menue: 'deko',
  draw: ({ box, rough, nx, nz }) => {
    for (const z of [3, nz - 6]) { box(4, 6, 0, 16, z, z + 2, SCHWARZ); box(nx - 7, nx - 5, 0, 16, z, z + 2, SCHWARZ); box(2, 3, 16, 34, z, z + 2, SCHWARZ); }
    for (let x = 4; x < nx - 3; x += 4) rough(x, x + 2, 17, 18, 0, nz - 1, (x / 4) % 2 ? HOLZ : HOLZ_W, 0.06);
    for (const y of [22, 27, 32]) rough(2, 3, y, y + 2, 0, nz - 1, HOLZ, 0.06);
  },
});

// Straßenlaterne (leuchtet; siehe "licht" in data/bau/strassenlaterne.json)
model({
  id: 'strassenlaterne', name: 'Straßenlaterne', dims: [16, 128, 16], menue: 'deko',
  draw: ({ box, cyl }) => {
    cyl('y', 8, 8, 4, 0, 3, DUNKEL);
    cyl('y', 8, 8, 1, 4, 110, DUNKEL);
    box(5, 10, 104, 105, 5, 10, DUNKEL);
    // Laternenkopf mit warmem Glas
    box(4, 11, 106, 106, 4, 11, DUNKEL);
    box(4, 11, 107, 117, 4, 11, (x, y, z) => ((x === 4 || x === 11) && (z === 4 || z === 11) ? DUNKEL : WARM));
    box(3, 12, 118, 119, 3, 12, DUNKEL); box(5, 10, 120, 122, 5, 10, DUNKEL); box(7, 8, 123, 127, 7, 8, DUNKEL);
  },
});

// Lavendel im Terrakotta-Kübel
model({
  id: 'lavendelkuebel', name: 'Lavendelkübel', dims: [24, 36, 24], menue: 'deko',
  draw: ({ cyl, set, hash }) => {
    for (let y = 0; y < 14; y++) cyl('y', 12, 12, Math.round(8 + y * 0.25), y, y, y === 13 ? TERRA_D : TERRAKOTTA);
    cyl('y', 12, 12, 10, 13, 13, '#5a4632');
    for (let i = 0; i < 70; i++) {
      const x = 4 + Math.floor(hash(i, 1, 2) * 16), z = 4 + Math.floor(hash(i, 3, 4) * 16);
      const h = 14 + Math.floor(hash(i, 5, 6) * 14);
      for (let y = 14; y < h; y++) set(x, y, z, '#6f8f55');
      for (let y = h; y < h + 4; y++) set(x, y, z, hash(i, y, 7) < 0.5 ? '#8f6fbf' : '#a586d1');
    }
  },
});

// Fahrradständer mit einem Rad
model({
  id: 'fahrradstaender', name: 'Fahrradständer', dims: [32, 40, 80], menue: 'deko',
  draw: ({ box, cyl, nx }) => {
    // Bügel
    for (const z of [8, 32, 56]) { box(14, 15, 0, 30, z, z, '#8d969c'); box(14, 15, 0, 30, z + 12, z + 12, '#8d969c'); box(14, 15, 30, 31, z, z + 12, '#8d969c'); }
    // Fahrrad (rot) zwischen erstem und zweitem Bügel, Front nach +X
    const z = 26;
    for (const x of [4, 27]) { cyl('z', x, 9, 8, z, z, SCHWARZ); cyl('z', x, 9, 6, z, z, (i, j) => (Math.abs(i) < 1 || Math.abs(j) < 1 ? '#8d969c' : 0)); }
    for (let i = 0; i <= 23; i++) box(4 + i, 4 + i, 9 + Math.round(i * 0.5), 9 + Math.round(i * 0.5), z, z, '#c8382f');
    for (let i = 0; i <= 10; i++) box(12 + Math.round(i * 0.3), 12 + Math.round(i * 0.3), 9 + i, 9 + i, z, z, '#c8382f');
    box(10, 14, 21, 22, z - 1, z + 1, SCHWARZ); box(26, 27, 21, 26, z, z, '#8d969c'); box(25, 28, 26, 26, z - 3, z + 3, SCHWARZ);
    void nx;
  },
});

// Kreidetafel-Aufsteller: "FRISCH" und eine kleine Tasse
model({
  id: 'kreidetafel', name: 'Kreidetafel', dims: [20, 44, 28], menue: 'deko',
  draw: ({ box, text, textWidth, nz }) => {
    for (let y = 0; y < 44; y++) {
      const x = Math.round(4 + (y / 43) * 7);
      box(x, x + 1, y, y, 1, nz - 2, (xx, yy, z) => (z <= 2 || z >= nz - 3 || y < 3 || y > 40 ? HOLZ_D : '#2c3330'));
      const xb = Math.round(17 - (y / 43) * 7);
      box(xb - 1, xb, y, y, 1, 2, HOLZ_D); box(xb - 1, xb, y, y, nz - 3, nz - 2, HOLZ_D);
    }
    const w = textWidth('FRISCH', 1);
    text(12, 36, Math.floor(nz / 2 + w / 2), 'FRISCH', CREME);
    box(10, 10, 22, 26, 11, 15, '#e7a1a8'); box(10, 10, 23, 24, 16, 16, '#e7a1a8');
    box(9, 9, 10, 12, 4, nz - 5, '#f2d98a');
  },
});

// Lichterkette für die Fassade (Anbau an ein Wandmodul, hängt außen)
model({
  id: 'lichterkette', name: 'Lichterkette', dims: [16, 136, 80], menue: 'fassade',
  draw: ({ set, box }) => {
    // hängt auf gut 3 m Höhe außen an der Wand (Anbauteile stehen wie das Wandmodul auf dem Boden)
    const farben = ['#ffd48a', '#ffb36b', '#ffe6b0', '#ff9f7a'];
    for (let z = 0; z < 80; z++) {
      const sag = Math.round(6 * Math.sin((z / 79) * Math.PI));
      set(13, 133 - sag, z, '#3a3a3a');
      if (z % 6 === 3) { box(13, 14, 131 - sag, 132 - sag, z, z, farben[(z / 6) % 4 | 0]); }
    }
  },
});

// Holzdielen-Boden (2 × 2 m, innen)
model({
  id: 'holzdielen', name: 'Boden Holzdielen', dims: [80, 2, 80], menue: 'boden',
  draw: ({ box, hash, nx, nz }) => {
    box(0, nx - 1, 0, 1, 0, nz - 1, (x, y, z) => {
      const brett = Math.floor(x / 8), versatz = (brett * 23) % 40;
      const fuge = x % 8 === 0 || (z + versatz) % 40 === 0;
      if (y === 0) return HOLZ_D;
      return fuge ? shade(HOLZ_D, 0.92) : shade(brett % 2 ? HOLZ : HOLZ_W, 0.96 + Math.round(hash(brett, Math.floor((z + versatz) / 40), 1) * 3) * 0.03);
    });
  },
});

// Markise rot-weiß (Anbau an ein Wandmodul): Stoff mit Streifen, gewellter Volant, Faltarme – ohne Stangen nach unten.
// Hängt wie das Original 0,1–1,4 m vor der Wand auf 2,6–3,35 m Höhe (ursprung in Würfeln zu 2,5 cm).
model({
  id: 'markise_rot_weiss', name: 'Markise Rot-Weiß', dims: [52, 30, 80], menue: 'fassade', ursprung: [4, 104, -40],
  draw: ({ box, set, nz }) => {
    const ROT = '#c8382f', ROT_D = '#a72d26', WEISS = '#f3efe6', WEISS_D = '#ddd7cb', GRAU = '#8d969c';
    const streifen = (z, dunkel) => (Math.floor(z / 8) % 2 ? (dunkel ? WEISS_D : WEISS) : (dunkel ? ROT_D : ROT));
    // Wandschiene oben
    box(0, 2, 26, 29, 0, nz - 1, GRAU);
    // Stoff: von der Wand (oben) schräg nach vorne unten
    for (let x = 2; x < 50; x++) {
      const y = Math.round(28 - (x - 2) * 0.36);
      box(x, x, y - 1, y, 0, nz - 1, (xx, yy, z) => streifen(z, yy < y));
    }
    // Volant vorne mit gewellter Unterkante
    for (let z = 0; z < nz; z++) {
      const welle = 4 + Math.round(2 * Math.abs(Math.sin((z % 8) / 8 * Math.PI)));
      for (let y = 10 - welle; y <= 11; y++) { set(50, y, z, streifen(z, false)); set(51, y, z, streifen(z, true)); }
    }
    box(49, 51, 11, 12, 0, nz - 1, GRAU); // Fallstange vorne
    // Faltarme unter dem Stoff (von der Wand zur Fallstange)
    for (const z0 of [6, nz - 8]) {
      for (let x = 2; x < 49; x++) {
        const y = Math.round(18 - (x - 2) * 0.15);
        box(x, x, y, y, z0, z0 + 1, GRAU);
      }
      box(0, 2, 16, 20, z0 - 1, z0 + 2, GRAU);
    }
  },
});
