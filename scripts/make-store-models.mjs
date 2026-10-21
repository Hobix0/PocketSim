// Erzeugt Ladeneinrichtung im Cosy-Stil (data/modelle/<id>.json, typ "modell"):
// Regale (Landhausregal, Mittelregal, Brotregal, Obststand, Tiefkühltruhe, Getränkeregal, Kassenregal,
// schmales Wandregal) und Schilder (Hängeschilder je Abteilung, Aufsteller, Leuchtschild, Nasenschild).
// Die Spielwerte (Fächer, Kapazität, Preise) stehen in data/bau/<id>.json.
// Vorne ist +X, Ursprung unten in der Mitte. 1 Würfel = 2,5 cm.
// Regale: Die Oberkante eines Bodens liegt genau auf der Höhe aus "regal.ebenen" (Würfel = Höhe / 0,025).
//
// Aufruf: npm run modelle:store   (Baukasten: scripts/lib/voxel-model.mjs)

import { model, shade } from './lib/voxel-model.mjs';

const HOLZ = '#c9a26b', HOLZ_D = '#a5824f', HOLZ_W = '#dcb985', EICHE = '#b98a55';
const SALBEI = '#8fae8b', SALBEI_D = '#6f8f6c', CREME = '#f1ead9', CREME_D = '#e1d8c3';
const TERRA = '#c0673f', TERRA_D = '#9c5232', ROT = '#c8483c', GRUEN = '#3f6b55', GRUEN_D = '#2f5443';
const WEISS = '#eef0ee', WEISS_D = '#d5d9d6', GRAU = '#8d969c', DUNKEL = '#2f3a45', SCHWARZ = '#1f1f22';
const KORB = '#b78a52', KORB_D = '#946b3b', GLAS = '#b9dbe2', EIS = '#7fb3d5', MESSING = '#c9a243';

/** Höhe in Metern → Würfel (Oberkante eines Bodens) */
const h = (m) => Math.round(m / 0.025);

/** Regalboden: Oberkante auf `m` Metern, mit Preisleiste vorne */
function boden(box, m, x0, x1, z0, z1, farbe, leiste = CREME) {
  const y = h(m) - 1;
  box(x0, x1, y, y, z0, z1, farbe);
  box(x1 + 1, x1 + 1, y - 2, y, z0, z1, (x, yy, z) => (yy === y - 2 ? shade(leiste, 0.9) : z % 10 === 3 ? '#e9b949' : leiste));
}

// ── Regale ──────────────────────────────────────────────────────────

// Landhausregal: hohes Wandregal aus Holz, Rückwand in Salbei, Kranz oben
model({
  id: 'regal_landhaus', name: 'Landhausregal', dims: [20, 80, 80], menue: 'einrichtung',
  draw: ({ box, rough, nx, ny, nz }) => {
    rough(0, 1, 0, ny - 5, 1, nz - 2, SALBEI, 0.05);
    for (let z = 1; z < nz - 1; z += 8) box(1, 1, 0, ny - 5, z, z, SALBEI_D);
    for (const [z0, z1] of [[0, 1], [nz - 2, nz - 1]]) rough(0, nx - 2, 0, ny - 4, z0, z1, HOLZ, 0.06);
    box(0, nx - 2, 0, 2, 2, nz - 3, HOLZ_D); // Sockel
    for (const m of [0.1, 0.55, 1.0, 1.45]) boden(box, m, 2, nx - 3, 2, nz - 3, HOLZ_W);
    // Kranz oben mit kleinem Überstand
    rough(0, nx - 1, ny - 4, ny - 2, 0, nz - 1, HOLZ, 0.06);
    box(0, nx - 1, ny - 1, ny - 1, 0, nz - 1, HOLZ_D);
  },
});

// Mittelregal: niedriges Regal für die Raummitte, oben eine Ablage für Deko
model({
  id: 'mittelregal_holz', name: 'Mittelregal Holz', dims: [24, 56, 80], menue: 'einrichtung',
  draw: ({ box, rough, nx, ny, nz }) => {
    rough(0, 1, 0, ny - 2, 1, nz - 2, CREME_D, 0.04);
    for (const [z0, z1] of [[0, 1], [nz - 2, nz - 1]]) rough(0, nx - 2, 0, ny - 1, z0, z1, EICHE, 0.06);
    box(0, nx - 2, 0, 2, 2, nz - 3, HOLZ_D);
    for (const m of [0.1, 0.55, 1.0]) boden(box, m, 2, nx - 3, 2, nz - 3, HOLZ_W, SALBEI);
    rough(0, nx - 1, ny - 2, ny - 1, 0, nz - 1, EICHE, 0.06);
    // Kleine Topfpflanze oben am Ende
    box(nx - 9, nx - 5, ny, ny, nz - 8, nz - 4, TERRA);
  },
});

// Brotregal: Weidenkörbe auf schrägen Holzböden, Schild „BROT“ oben
model({
  id: 'brotregal', name: 'Brotregal', dims: [20, 76, 64], menue: 'einrichtung',
  draw: ({ box, rough, text, textWidth, nx, ny, nz }) => {
    rough(0, 1, 0, ny - 10, 1, nz - 2, HOLZ_D, 0.05);
    for (const [z0, z1] of [[0, 1], [nz - 2, nz - 1]]) rough(0, nx - 2, 0, ny - 10, z0, z1, HOLZ, 0.06);
    for (const m of [0.35, 0.8, 1.25]) {
      boden(box, m, 2, nx - 3, 2, nz - 3, HOLZ_W);
      // Körbe: niedrige Flechtränder um die Ware
      const y = h(m);
      for (const [z0, z1] of [[3, 30], [33, nz - 4]]) {
        box(3, nx - 3, y, y + 2, z0, z1, (x, yy, z) => ((x + yy + z) % 2 ? KORB : KORB_D));
        box(4, nx - 4, y, y + 2, z0 + 1, z1 - 1, 0);
        box(4, nx - 4, y, y, z0 + 1, z1 - 1, KORB_D);
      }
    }
    // Schild oben
    box(nx - 4, nx - 3, ny - 10, ny - 1, 6, nz - 7, CREME);
    box(nx - 4, nx - 3, ny - 10, ny - 10, 6, nz - 7, HOLZ_D);
    const s = 1, w = textWidth('BROT', s);
    text(nx - 2, ny - 3, Math.floor(nz / 2 + w / 2), 'BROT', TERRA_D, s);
  },
});

// Obststand: Holztisch mit Obststeigen oben und unten, kleines Dach aus Stoff
model({
  id: 'obststand_kisten', name: 'Obststand mit Kisten', dims: [32, 64, 64], menue: 'einrichtung',
  draw: ({ box, rough, nx, ny, nz }) => {
    for (const [x, z] of [[1, 1], [1, nz - 3], [nx - 3, 1], [nx - 3, nz - 3]]) rough(x, x + 1, 0, ny - 6, z, z + 1, HOLZ_D, 0.05);
    for (const m of [0.3, 0.8]) {
      const y = h(m) - 1;
      box(1, nx - 2, y, y, 1, nz - 2, HOLZ);
      // Obststeigen: niedrige Lattenkisten
      for (const [z0, z1] of [[2, 20], [22, 41], [43, nz - 3]]) {
        box(2, nx - 3, y + 1, y + 3, z0, z1, (x, yy, z) => (yy === y + 2 ? HOLZ_D : HOLZ_W));
        box(3, nx - 4, y + 1, y + 3, z0 + 1, z1 - 1, 0);
      }
      box(nx - 1, nx - 1, y - 2, y, 1, nz - 2, CREME);
    }
    // Stoffdach rot-weiß gestreift
    for (let x = 0; x < nx; x++) {
      const y = ny - 4 + Math.round((x / nx) * -2);
      box(x, x, y, y + 1, 0, nz - 1, (xx, yy, z) => (Math.floor(z / 6) % 2 ? ROT : CREME));
    }
  },
});

// Tiefkühltruhe: weiße Truhe mit Glasschiebedeckel, blaue Zierleiste
model({
  id: 'kuehltruhe', name: 'Tiefkühltruhe', dims: [36, 36, 80], menue: 'einrichtung',
  draw: ({ box, rough, nx, ny, nz }) => {
    rough(0, nx - 1, 0, ny - 4, 0, nz - 1, WEISS, 0.03);
    box(0, nx - 1, 0, 1, 0, nz - 1, GRAU); // Sockel
    box(nx - 1, nx - 1, 8, 10, 0, nz - 1, EIS); // Zierleiste vorne
    // Innenraum: Ware steht auf 0,6 m (gut sichtbar unter dem Glas), eisblauer Boden
    hole(box, 2, nx - 3, h(0.6), ny - 4, 2, nz - 3);
    box(2, nx - 3, h(0.6) - 1, h(0.6) - 1, 2, nz - 3, '#dfeef6');
    // Glasdeckel als dünner Rahmen mit Mittelsteg (die Ware bleibt sichtbar)
    box(0, nx - 1, ny - 3, ny - 3, 0, nz - 1, (x, y, z) => (x <= 1 || x >= nx - 2 || z <= 1 || z >= nz - 2 || z === nz / 2 ? GRAU : undefined));
    box(nx - 2, nx - 1, ny - 2, ny - 2, 0, nz - 1, GRAU);
  },
});

/** Hohlraum (box mit 0) */
function hole(box, x0, x1, y0, y1, z0, z1) {
  box(x0, x1, y0, y1, z0, z1, 0);
}

// Getränkeregal: dunkelgrünes Metallgestell mit Holzböden für Flaschen und Kästen
model({
  id: 'getraenkeregal', name: 'Getränkeregal', dims: [24, 64, 80], menue: 'einrichtung',
  draw: ({ box, frame, rough, nx, ny, nz }) => {
    frame(0, nx - 2, 0, ny - 1, 0, nz - 1, GRUEN, 2);
    box(0, 0, 0, ny - 1, 2, nz - 3, (x, y, z) => (y % 6 === 0 || z % 6 === 0 ? GRUEN_D : undefined)); // Gitter-Rückwand
    for (const m of [0.1, 0.55, 1.0]) {
      const y = h(m) - 1;
      rough(1, nx - 3, y, y, 2, nz - 3, EICHE, 0.06);
      box(nx - 2, nx - 2, y - 2, y, 2, nz - 3, CREME);
    }
    box(0, nx - 2, ny - 1, ny - 1, 0, nz - 1, GRUEN_D);
  },
});

// Kassenregal („Quengelware“): kleines Regal mit vielen niedrigen Böden, Messingkante
model({
  id: 'kassenregal', name: 'Kassenregal', dims: [16, 48, 32], menue: 'einrichtung',
  draw: ({ box, rough, nx, ny, nz }) => {
    rough(0, 1, 0, ny - 1, 1, nz - 2, TERRA, 0.05);
    for (const [z0, z1] of [[0, 1], [nz - 2, nz - 1]]) rough(0, nx - 2, 0, ny - 1, z0, z1, HOLZ, 0.06);
    for (const m of [0.25, 0.5, 0.75, 1.0]) boden(box, m, 2, nx - 3, 2, nz - 3, HOLZ_W, MESSING);
    box(0, nx - 2, 0, 1, 2, nz - 3, HOLZ_D);
    box(0, nx - 1, ny - 1, ny - 1, 0, nz - 1, HOLZ_D);
  },
});

// Schmales Wandregal (1 m): weißes Metall, cremefarbene Böden
model({
  id: 'wandregal_schmal', name: 'Wandregal schmal', dims: [20, 80, 40], menue: 'einrichtung',
  draw: ({ box, frame, nx, ny, nz }) => {
    box(0, 0, 0, ny - 1, 1, nz - 2, WEISS_D);
    for (const z of [0, nz - 1]) frame(0, nx - 3, 0, ny - 1, z, z, WEISS, 1);
    box(0, nx - 3, 0, 2, 1, nz - 2, GRAU);
    for (const m of [0.1, 0.55, 1.0, 1.45]) boden(box, m, 1, nx - 4, 1, nz - 2, WEISS, SALBEI);
  },
});

// ── Schilder ────────────────────────────────────────────────────────

// Hängeschilder für die Abteilungen: hängen an zwei Stangen von der Decke (Ursprung oben in der Mitte),
// Schrift auf beiden Seiten. 1,4 m breit, Unterkante auf 2,6 m bei 4 m Deckenhöhe.
const ABTEILUNGEN = [
  ['schild_obst', 'Hängeschild Obst & Gemüse', 'OBST & GEMÜSE', GRUEN],
  ['schild_getraenke', 'Hängeschild Getränke', 'GETRÄNKE', '#3e6f9a'],
  ['schild_backwaren', 'Hängeschild Backwaren', 'BACKWAREN', TERRA_D],
  ['schild_kuehlung', 'Hängeschild Kühlung', 'KÜHLUNG', '#4a86b0'],
  ['schild_drogerie', 'Hängeschild Drogerie', 'DROGERIE', '#8a63b5'],
  ['schild_angebote', 'Hängeschild Angebote', 'ANGEBOTE %', ROT],
  ['schild_kasse', 'Hängeschild Kasse', 'KASSE', DUNKEL],
];
for (const [id, name, schrift, farbe] of ABTEILUNGEN) {
  model({
    id, name, dims: [4, 56, 60], ebene: 'decke', menue: 'schilder', ursprung: [-2, -56, -30],
    draw: ({ box, text, textWidth, nx, nz }) => {
      // Stangen von der Decke
      for (const z of [6, nz - 7]) box(1, 2, 14, 55, z, z, GRAU);
      // Tafel: farbiger Rand, cremefarbene Fläche
      box(0, nx - 1, 0, 13, 0, nz - 1, farbe);
      box(0, nx - 1, 1, 12, 1, nz - 2, CREME);
      const s = textWidth(schrift, 2) <= nz - 8 ? 2 : 1;
      const w = textWidth(schrift, s);
      const top = 6 + Math.round((5 * s) / 2);
      text(nx - 1, top, Math.floor(nz / 2 + w / 2), schrift, farbe, s, '+x');
      text(0, top, Math.floor(nz / 2 - w / 2), schrift, farbe, s, '-x');
    },
  });
}

// Aufsteller „Angebot“: Holz-Kundenstopper mit rotem Schild
model({
  id: 'aufsteller_angebot', name: 'Aufsteller Angebot', dims: [24, 44, 28], menue: 'schilder',
  draw: ({ box, text, textWidth, nx, nz }) => {
    // Zwei schräge Tafeln (A-Form)
    for (let y = 0; y < 42; y++) {
      const off = Math.round((42 - y) / 5);
      for (const x of [nx / 2 + off, nx / 2 - 1 - off]) box(x, x, y, y, 1, nz - 2, HOLZ_D);
    }
    for (let y = 8; y < 38; y++) {
      const off = Math.round((42 - y) / 5);
      box(nx / 2 + off + 1, nx / 2 + off + 1, y, y, 3, nz - 4, y > 26 ? ROT : CREME);
      box(nx / 2 - 2 - off, nx / 2 - 2 - off, y, y, 3, nz - 4, y > 26 ? ROT : CREME);
    }
    box(nx / 2 - 1, nx / 2, 42, 43, 1, nz - 2, HOLZ_D);
    // Schrift vorne (leicht schräg: auf die vorderste Lage)
    const w = textWidth('ANGEBOT', 1);
    text(nx / 2 + 3, 36, Math.floor(nz / 2 + w / 2), 'ANGEBOT', CREME, 1);
    text(nx / 2 + 6, 22, Math.floor(nz / 2 + textWidth('-20%', 1) / 2), '-20%', ROT, 1);
  },
});

// Infotafel mit Öffnungszeiten auf Holzfuß
model({
  id: 'infotafel_oeffnungszeiten', name: 'Infotafel Öffnungszeiten', dims: [12, 64, 32], menue: 'schilder',
  draw: ({ box, rough, text, textWidth, nx, nz }) => {
    rough(3, 8, 0, 1, 4, nz - 5, HOLZ_D, 0.05);
    box(5, 6, 2, 30, nz / 2 - 1, nz / 2, HOLZ_D);
    box(4, 7, 30, 63, 1, nz - 2, HOLZ);
    box(7, 7, 32, 61, 3, nz - 4, '#2c3330');
    const zeilen = [['GEÖFFNET', 59], ['MO-SA', 51], ['8-20', 44], ['WILLKOMMEN', 37]];
    for (const [t, y] of zeilen) text(8, y, Math.floor(nz / 2 + textWidth(t, 1) / 2), t, t === 'GEÖFFNET' ? '#e9b949' : CREME, 1);
  },
});

// Leuchtschild „OFFEN“ für die Fassade (Anbauteil; hängt außen auf gut 2,5 m an der Wand, leuchtet)
model({
  id: 'leuchtschild_offen', name: 'Leuchtschild Offen', dims: [3, 16, 44], menue: 'fassade', ursprung: [4, 100, -22],
  draw: ({ box, text, textWidth, nx, ny, nz }) => {
    box(0, 0, 0, ny - 1, 0, nz - 1, DUNKEL);
    box(1, 1, 1, ny - 2, 1, nz - 2, '#3a2a2a');
    const w = textWidth('OFFEN', 2);
    text(nx - 1, 12, Math.floor(nz / 2 + w / 2), 'OFFEN', '#ffb35a', 2);
  },
});

// Nasenschild: Holzschild an einem schwarzen Ausleger, quer zur Wand (Schrift auf beiden Seiten)
model({
  id: 'nasenschild_laden', name: 'Nasenschild Laden', dims: [28, 28, 4], menue: 'fassade', ursprung: [4, 104, -2],
  draw: ({ box, text, textWidth, nx, ny, nz }) => {
    box(0, nx - 1, ny - 2, ny - 1, 1, 2, SCHWARZ); // Ausleger
    box(0, 1, ny - 8, ny - 1, 1, 2, SCHWARZ);
    for (const x of [6, nx - 5]) box(x, x, ny - 6, ny - 3, 1, 2, SCHWARZ);
    box(3, nx - 2, 0, ny - 7, 0, nz - 1, HOLZ);
    box(4, nx - 3, 1, ny - 8, 0, nz - 1, CREME);
    const w = textWidth('LADEN', 1);
    // Von +Z gesehen läuft der Text nach +X, von −Z nach −X
    text(nz - 1, 13, Math.floor(nx / 2 + 1 - w / 2), 'LADEN', GRUEN, 1, '+z');
    text(0, 13, Math.floor(nx / 2 + 1 + w / 2), 'LADEN', GRUEN, 1, '-z');
    // kleines Brot-Symbol darunter
    box(10, nx - 11, 4, 6, 0, nz - 1, TERRA);
  },
});
