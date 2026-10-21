// Erzeugt die Voxel-Modelle für Lager und Logistik (data/modelle/<id>.json, typ "modell").
// Die Spielwerte (Preis, Ablage, Ebene …) stehen in data/bau/<id>.json, das Modell verweist mit "eigen/<id>" darauf.
// Vorne ist +X (wie bei allen Modellen), Ursprung unten in der Mitte. Im Voxel-Editor lassen sich die
// Modelle danach weiter bearbeiten.
//
// Aufruf: npm run modelle:lager   (Baukasten: scripts/lib/voxel-model.mjs)

import { model, shade, hash } from './lib/voxel-model.mjs';

// Farben
const BLAU = '#3f6b55', BLAU_D = '#335a47', ORANGE = '#e07b24', ORANGE_D = '#b8611a';
const VERZINKT = '#a9b2b8', VERZINKT_D = '#848e95', STAHL = '#b8bec4', STAHL_D = '#8f969d';
const SCHWARZ = '#1f1f22', GUMMI = '#2a2a2d', DUNKEL = '#2f3a45', WEISS = '#e8e6e0', GRAU = '#9aa1a6';
const HOLZ = '#c9a26b', HOLZ_D = '#a5824f', KARTON = '#c39b6a', KARTON_D = '#a57f52', KLEBEBAND = '#d9c08f';
const GELB = '#e6b929', GELB_D = '#c49a1c', ROT = '#c8382f', GRUEN = '#3f8f5a', GRUEN_UE = '#5fd08a';
const BETON = '#a3a39e', ASPHALT = '#4a4d52', GLAS = '#2e4a5e', GLAS_H = '#4d7590';

// ── Lager: Ablagen ───────────────────────────────────────────────

// Palettenregal (Hochregal): 1,1 m tief, 3 m hoch, 2,7 m breit, drei Ebenen (Böden bei 0,15 / 1,15 / 2,15 m)
model({
  id: 'palettenregal', name: 'Palettenregal', dims: [44, 120, 108],
  draw: ({ box, frame, nx, nz }) => {
    // Rahmen (blau) an beiden Seiten und in der Mitte, mit Diagonalstreben
    for (const z0 of [0, 52, nz - 4]) {
      for (const x0 of [0, nx - 3]) box(x0, x0 + 2, 0, 119, z0, z0 + 3, (x, y) => (y % 6 === 0 ? BLAU_D : BLAU));
      for (let y = 4; y < 116; y += 2) {
        const x = Math.floor(((y % 32) / 32) * (nx - 6)) + 3;
        box(x, x, y, y + 1, z0 + 1, z0 + 2, BLAU_D);
      }
      box(0, nx - 1, 0, 0, z0, z0 + 3, BLAU_D); // Fußplatte
    }
    // Traversen (orange) vorne und hinten je Ebene, darauf Gitterböden
    for (const y of [5, 45, 85]) {
      for (const x0 of [0, nx - 3]) box(x0, x0 + 2, y - 3, y, 0, nz - 1, (x, yy, z) => (yy === y - 3 ? ORANGE_D : ORANGE));
      box(3, nx - 4, y, y, 0, nz - 1, (x, yy, z) => ((x + z) % 3 === 0 ? VERZINKT_D : VERZINKT));
    }
    frame(0, nx - 1, 116, 119, 0, nz - 1, ORANGE, 1);
    // Lastschild an der Front
    box(nx - 1, nx - 1, 30, 37, 20, 29, '#f2f0e8');
    box(nx - 1, nx - 1, 32, 33, 21, 28, ROT);
  },
});

// Gitterbox: 1,2 × 0,8 m, ca. 1 m hoch, verzinktes Gitter mit Klappe vorne
model({
  id: 'gitterbox', name: 'Gitterbox', dims: [48, 40, 32],
  draw: ({ box, nx, ny, nz }) => {
    // Füße
    for (const [x, z] of [[1, 1], [1, nz - 5], [nx - 5, 1], [nx - 5, nz - 5], [22, 1], [22, nz - 5]]) box(x, x + 3, 0, 3, z, z + 3, VERZINKT_D);
    box(0, nx - 1, 4, 5, 0, nz - 1, VERZINKT); // Boden
    // Gitterwände: Stäbe alle 3 Würfel, Rahmen oben und unten
    const wall = (x0, x1, z0, z1) => box(x0, x1, 6, ny - 1, z0, z1, (x, y, z) => {
      const edge = y >= ny - 2 || y <= 7 || x === 0 || x === nx - 1 || z === 0 || z === nz - 1;
      const bar = (x0 === x1 ? z % 3 === 0 : x % 3 === 0) || y % 4 === 0;
      return edge && (x === 0 || x === nx - 1 || z === 0 || z === nz - 1) && (bar || y >= ny - 2) ? (y >= ny - 2 ? VERZINKT_D : VERZINKT) : 0;
    });
    wall(0, 0, 0, nz - 1); wall(nx - 1, nx - 1, 0, nz - 1); wall(0, nx - 1, 0, 0); wall(0, nx - 1, nz - 1, nz - 1);
    // Eckpfosten
    for (const [x, z] of [[0, 0], [0, nz - 1], [nx - 1, 0], [nx - 1, nz - 1]]) box(x, x, 4, ny - 1, z, z, VERZINKT_D);
    // Klappe vorne halb hoch (dichteres Gitter) mit Schildhalter
    box(nx - 1, nx - 1, 6, 20, 2, nz - 3, (x, y, z) => (z % 2 === 0 || y % 2 === 0 ? VERZINKT : 0));
    box(nx - 1, nx - 1, 14, 19, 12, 19, '#f2f0e8');
  },
});

// Rollcontainer: 0,8 × 0,7 m, 1,7 m hoch, drei Böden, Gitter hinten und an den Seiten
model({
  id: 'rollcontainer', name: 'Rollcontainer', dims: [32, 68, 28],
  draw: ({ box, cyl, nx, ny, nz }) => {
    for (const [x, z] of [[3, 3], [3, nz - 4], [nx - 4, 3], [nx - 4, nz - 4]]) {
      cyl('z', x, 2, 2, z - 1, z + 1, GUMMI);
      box(x - 1, x + 1, 4, 5, z - 1, z + 1, STAHL_D);
    }
    for (const y of [7, 29, 51]) box(0, nx - 1, y, y + 1, 0, nz - 1, (x, yy, z) => ((x + z) % 4 === 0 ? VERZINKT_D : VERZINKT));
    // Gitter hinten (x = 0) und an den Seiten
    box(0, 0, 8, ny - 1, 0, nz - 1, (x, y, z) => (z % 4 === 0 || y % 5 === 0 ? VERZINKT : 0));
    for (const z of [0, nz - 1]) box(0, nx - 1, 8, ny - 1, z, z, (x, y) => (x % 4 === 0 || y % 5 === 0 ? VERZINKT : 0));
    for (const [x, z] of [[0, 0], [0, nz - 1], [nx - 1, 0], [nx - 1, nz - 1]]) box(x, x, 6, ny - 1, z, z, VERZINKT_D);
    // Griff oben
    box(0, 1, ny - 3, ny - 1, 4, nz - 5, ORANGE);
  },
});

// Leere Euro-Paletten, gestapelt (Deko)
model({
  id: 'palettenstapel', name: 'Palettenstapel', dims: [48, 36, 32],
  draw: ({ box, rough, nx, nz }) => {
    for (let i = 0; i < 6; i++) {
      const y = i * 6;
      const off = i % 2;
      for (const z of [0, 14, nz - 4]) rough(off, nx - 1 - off, y, y + 3, z, z + 3, HOLZ_D, 0.08);
      for (let x = off; x <= nx - 1 - off; x += 8) rough(x, Math.min(x + 4, nx - 1 - off), y + 4, y + 5, 0, nz - 1, HOLZ, 0.1);
    }
  },
});

// Palette mit Stretchfolie (Deko): Euro-Palette, darauf Kartons, eingewickelt
model({
  id: 'folienpalette', name: 'Palette mit Folie', dims: [48, 60, 32],
  draw: ({ box, rough, nx, ny, nz }) => {
    for (const z of [0, 14, nz - 4]) rough(0, nx - 1, 0, 3, z, z + 3, HOLZ_D, 0.08);
    for (let x = 0; x < nx; x += 8) rough(x, Math.min(x + 4, nx - 1), 4, 5, 0, nz - 1, HOLZ, 0.1);
    // Kartons
    for (let x = 0; x < 3; x++) for (let z = 0; z < 2; z++) for (let y = 0; y < 4; y++) {
      const x0 = x * 16, z0 = z * 16, y0 = 6 + y * 13;
      box(x0, x0 + 15, y0, y0 + 12, z0, z0 + 15, (xx, yy, zz) => (yy === y0 + 12 && (zz === z0 + 7 || zz === z0 + 8) ? KLEBEBAND : shade(KARTON, 0.94 + hash(x, y, z) * 0.12)));
    }
    // Folie: helle, glänzende Hülle außen (mit Streifen)
    box(0, nx - 1, 8, ny - 3, 0, nz - 1, (x, y, z) => {
      const outer = x === 0 || x === nx - 1 || z === 0 || z === nz - 1;
      if (!outer) return undefined;
      return y % 7 < 2 ? '#e9eef0' : (hash(x, y, z) < 0.55 ? '#d5dde0' : undefined);
    });
  },
});

// Holzregal (Lager): 0,6 m tief, 2 m hoch, 2 m breit, drei Böden aus Holz (0,1 / 0,75 / 1,4 m)
model({
  id: 'holzregal', name: 'Holzregal', dims: [24, 80, 80],
  draw: ({ box, rough, nx, ny, nz }) => {
    for (const z0 of [0, 38, nz - 3]) for (const x0 of [0, nx - 3]) rough(x0, x0 + 2, 0, ny - 1, z0, z0 + 2, HOLZ_D, 0.06);
    for (const y of [3, 29, 55]) rough(0, nx - 1, y - 3, y, 0, nz - 1, HOLZ, 0.08);
    rough(0, nx - 1, ny - 3, ny - 1, 0, nz - 1, HOLZ, 0.08);
    // Rückwand aus Latten
    for (let y = 6; y < ny - 3; y += 6) box(0, 0, y, y + 2, 0, nz - 1, shade(HOLZ_D, 0.95));
  },
});

// Obstkisten aus Holz, gestapelt (Deko)
model({
  id: 'holzkisten', name: 'Holzkisten', dims: [24, 40, 40],
  draw: ({ box, rough, nx, nz }) => {
    const kiste = (y0, z0, inhalt) => {
      rough(0, nx - 1, y0, y0 + 1, z0, z0 + 19, HOLZ_D, 0.06);
      for (const y of [y0 + 2, y0 + 6, y0 + 10]) {
        rough(0, nx - 1, y, y + 2, z0, z0, HOLZ, 0.1); rough(0, nx - 1, y, y + 2, z0 + 19, z0 + 19, HOLZ, 0.1);
        rough(0, 0, y, y + 2, z0, z0 + 19, HOLZ, 0.1); rough(nx - 1, nx - 1, y, y + 2, z0, z0 + 19, HOLZ, 0.1);
      }
      if (inhalt) for (let x = 2; x < nx - 2; x += 3) for (let z = z0 + 2; z < z0 + 18; z += 3) box(x, x + 1, y0 + 9, y0 + 11, z, z + 1, inhalt(x, z));
    };
    kiste(0, 0, (x, z) => ((x + z) % 2 ? '#c8382f' : '#d9482f'));
    kiste(0, 20, (x, z) => ((x + z) % 3 ? '#e8862a' : '#f09a3a'));
    kiste(13, 0, (x, z) => ((x + z) % 2 ? '#7fae3c' : '#6c9a32'));
    kiste(26, 10, null);
    void nz;
  },
});

// Holzfass (Deko)
model({
  id: 'fass', name: 'Holzfass', dims: [24, 36, 24],
  draw: ({ cyl }) => {
    for (let y = 0; y < 36; y++) {
      const r = Math.round(9 + 2 * Math.sin((y / 35) * Math.PI));
      const ring = y === 3 || y === 4 || y === 31 || y === 32 || y === 17;
      cyl('y', 12, 12, r, y, y, (i, j) => (ring ? '#4a4d52' : (Math.atan2(j, i) * 6 / Math.PI + 12) % 2 < 1 ? HOLZ_D : HOLZ));
    }
  },
});

// Kartonstapel (Deko): verschieden große Kartons
model({
  id: 'kartonstapel', name: 'Kartonstapel', dims: [40, 48, 40],
  draw: ({ box }) => {
    const k = (x0, y0, z0, w, h, d, f) => box(x0, x0 + w - 1, y0, y0 + h - 1, z0, z0 + d - 1, (x, y, z) =>
      y === y0 + h - 1 && Math.abs(z - (z0 + d / 2)) < 1 ? KLEBEBAND : (x === x0 + w - 1 && y > y0 + h - 5 && z > z0 + 2 && z < z0 + 7 ? '#f2f0e8' : shade(KARTON, f)));
    k(0, 0, 0, 20, 16, 20, 1); k(20, 0, 2, 18, 14, 16, 0.93); k(2, 0, 21, 16, 12, 18, 1.05);
    k(21, 0, 20, 18, 18, 18, 0.97); k(2, 16, 2, 16, 14, 16, 1.06); k(21, 18, 22, 16, 12, 14, 0.9);
    k(4, 30, 4, 12, 10, 12, 1.0); k(22, 14, 4, 14, 10, 12, 1.08);
  },
});

// ── Lager: Fahrzeuge und Geräte ─────────────────────────────────

// Gabelstapler (Deko): Gabeln vorne (+X), Hubmast, Fahrerschutzdach, Gegengewicht hinten
model({
  id: 'gabelstapler', name: 'Gabelstapler', dims: [96, 88, 48],
  draw: ({ box, cyl, frame, text, nz }) => {
    const mid = nz / 2;
    // Räder
    for (const [x, r] of [[62, 9], [16, 7]]) for (const z of [3, nz - 4]) {
      cyl('z', x, r, r, z - 3, z + 3, GUMMI);
      cyl('z', x, r, 3, z - 3, z + 3, GRAU);
    }
    // Rahmen und Karosserie (gelb)
    box(6, 70, 6, 22, 6, nz - 7, GELB);
    box(4, 26, 6, 34, 4, nz - 5, (x, y) => (y > 30 ? GELB_D : SCHWARZ)); // Gegengewicht hinten
    box(28, 64, 22, 26, 6, nz - 7, GELB_D); // Trittfläche
    // Sitz und Lenkrad
    box(30, 40, 26, 30, mid - 7, mid + 6, SCHWARZ); box(30, 32, 30, 42, mid - 7, mid + 6, SCHWARZ);
    box(52, 54, 26, 36, mid - 1, mid, DUNKEL); cyl('y', 52, mid, 4, 37, 37, SCHWARZ);
    // Fahrerschutzdach
    for (const [x, z] of [[28, 6], [28, nz - 7], [64, 6], [64, nz - 7]]) box(x, x + 1, 22, 74, z, z + 1, SCHWARZ);
    frame(28, 65, 74, 76, 6, nz - 6, SCHWARZ, 2);
    for (let x = 30; x < 64; x += 5) box(x, x, 75, 75, 7, nz - 8, SCHWARZ);
    // Hubmast vorne mit Gabelträger und Gabeln
    for (const z of [10, nz - 13]) box(72, 75, 4, 86, z, z + 2, STAHL_D);
    box(72, 75, 84, 86, 10, nz - 11, STAHL_D);
    box(76, 77, 4, 18, 8, nz - 9, DUNKEL);
    for (const z of [12, nz - 16]) { box(76, 95, 3, 4, z, z + 3, STAHL); box(76, 78, 4, 16, z, z + 3, STAHL); }
    // Lichter und Warnstreifen
    box(70, 70, 16, 19, 8, 11, '#fff3c4'); box(70, 70, 16, 19, nz - 12, nz - 9, '#fff3c4');
    box(4, 4, 30, 33, mid - 2, mid + 1, ROT);
    text(70, 15, mid + 5, 'UE', SCHWARZ);
  },
});

// Hubwagen (Deko): Gabeln vorne, Deichsel hinten
model({
  id: 'hubwagen', name: 'Hubwagen', dims: [64, 48, 24],
  draw: ({ box, cyl, nz }) => {
    for (const z of [2, nz - 6]) {
      box(14, 63, 1, 3, z, z + 3, ORANGE);
      cyl('z', 60, 1, 1, z, z + 3, GUMMI);
    }
    box(6, 16, 1, 10, 2, nz - 3, ORANGE_D); // Hydraulik
    cyl('z', 8, 3, 3, 8, nz - 9, GUMMI);
    // Deichsel schräg nach hinten oben
    for (let i = 0; i < 34; i++) box(Math.round(10 - i * 0.25), Math.round(10 - i * 0.25) + 1, 10 + i, 10 + i, nz / 2 - 1, nz / 2, SCHWARZ);
    box(0, 3, 44, 46, nz / 2 - 5, nz / 2 + 4, SCHWARZ);
    box(2, 4, 40, 43, nz / 2 - 1, nz / 2, ROT);
  },
});

// Sackkarre (Deko)
model({
  id: 'sackkarre', name: 'Sackkarre', dims: [20, 48, 22],
  draw: ({ box, cyl, nz }) => {
    for (const z of [1, nz - 2]) box(4, 5, 2, 46, z, z, ROT);
    for (let y = 8; y < 44; y += 7) box(4, 5, y, y, 1, nz - 2, ROT);
    box(4, 16, 1, 2, 2, nz - 3, STAHL); // Schaufel
    for (const z of [0, nz - 3]) { cyl('z', 3, 3, 3, z, z + 2, GUMMI); }
    box(2, 5, 46, 47, 1, nz - 2, SCHWARZ); // Griff
  },
});

// Stehleiter (Deko), Aluminium
model({
  id: 'stehleiter', name: 'Stehleiter', dims: [24, 72, 20],
  draw: ({ box, nz }) => {
    for (let y = 0; y < 70; y++) {
      const a = Math.round(2 + (y / 70) * 8), b = Math.round(21 - (y / 70) * 8);
      for (const z of [0, nz - 1]) { box(a, a + 1, y, y, z, z, VERZINKT); box(b - 1, b, y, y, z, z, VERZINKT_D); }
      if (y % 10 === 6) box(a, a + 2, y, y, 0, nz - 1, VERZINKT);
    }
    box(9, 14, 69, 71, 0, nz - 1, ORANGE);
  },
});

// Feuerlöscher (Deko) auf kleinem Ständer mit Schild
model({
  id: 'feuerloescher', name: 'Feuerlöscher', dims: [12, 52, 12],
  draw: ({ box, cyl }) => {
    box(1, 10, 0, 1, 1, 10, DUNKEL);
    cyl('y', 6, 6, 4, 2, 24, ROT);
    box(5, 7, 25, 28, 5, 7, SCHWARZ); box(6, 9, 28, 28, 5, 7, SCHWARZ);
    box(9, 10, 8, 22, 9, 10, SCHWARZ); // Schlauch
    box(5, 6, 2, 50, 1, 2, STAHL_D); // Ständer
    box(7, 7, 38, 50, 1, 10, ROT); box(7, 7, 41, 47, 3, 8, WEISS);
  },
});

// Spind (Deko): zwei Türen, Lüftungsschlitze
model({
  id: 'spind', name: 'Spind', dims: [20, 72, 36],
  draw: ({ box, nx, ny, nz }) => {
    box(0, nx - 1, 0, ny - 1, 0, nz - 1, '#7f93a3');
    box(nx - 1, nx - 1, 2, ny - 3, 1, nz / 2 - 1, '#8ea2b2'); box(nx - 1, nx - 1, 2, ny - 3, nz / 2, nz - 2, '#8ea2b2');
    for (const z0 of [3, nz / 2 + 2]) for (let y = ny - 12; y < ny - 4; y += 2) box(nx - 1, nx - 1, y, y, z0, z0 + 9, '#5d6f7d');
    box(nx - 1, nx - 1, 34, 38, nz / 2 - 3, nz / 2 - 2, SCHWARZ); box(nx - 1, nx - 1, 34, 38, nz / 2 + 1, nz / 2 + 2, SCHWARZ);
    box(nx - 1, nx - 1, 0, 1, 0, nz - 1, '#5d6f7d');
  },
});

// Packtisch (Lager): Arbeitsplatte mit Paketwaage, Klebebandrolle, Kartons im Fach darunter
model({
  id: 'packtisch', name: 'Packtisch', dims: [32, 64, 72],
  draw: ({ box, cyl, rough, nx, nz }) => {
    for (const [x, z] of [[1, 1], [1, nz - 3], [nx - 3, 1], [nx - 3, nz - 3]]) box(x, x + 1, 0, 36, z, z + 1, STAHL_D);
    rough(0, nx - 1, 36, 37, 0, nz - 1, HOLZ, 0.07);
    box(1, nx - 2, 8, 8, 1, nz - 2, STAHL); // Fach unten
    box(3, 18, 9, 18, 4, 22, KARTON); box(3, 16, 9, 22, 26, 40, KARTON_D); box(19, 22, 9, 20, 45, 66, KARTON);
    // Waage
    box(8, 24, 38, 40, 50, 66, DUNKEL); box(9, 23, 41, 41, 51, 65, STAHL); box(nx - 7, nx - 7, 38, 40, 55, 61, '#7fe0a0');
    // Klebebandrolle und Abroller
    cyl('z', 14, 42, 3, 12, 15, KLEBEBAND); box(10, 18, 38, 39, 10, 17, ROT);
    // Rollenhalter mit Packpapier hinten
    for (const z of [2, nz - 3]) box(0, 1, 37, 60, z, z, STAHL_D);
    cyl('z', 2, 56, 3, 3, nz - 4, '#d8c39a');
  },
});

// ── Außen und Hof ───────────────────────────────────────────────

// Ladetor (Wandmodul 2 m × 4 m, 5-cm-Würfel): ebenerdig in die Lagerwand eingebaut. Außen (+X) setzt der LKW
// rückwärts an: Torabdichtung aus Gummi, Puffer, Warnstreifen am Boden, Ampel und eine warme Torleuchte.
// 8 Würfel tief: Wand in der Mitte (0,2 m), außen 0,1 m für Abdichtung und Puffer.
model({
  id: 'ladetor', name: 'Ladetor', dims: [8, 80, 40], size: 0.05, menue: 'lager',
  draw: ({ box, ny, nz }) => {
    const SALBEI = '#8fa58a', SALBEI_D = '#76907a';
    // Wand um die Toröffnung (Öffnung z 6–33, y 0–57)
    box(2, 5, 0, ny - 1, 0, 5, (x, y, z) => (z % 4 === 0 ? SALBEI_D : SALBEI));
    box(2, 5, 0, ny - 1, nz - 6, nz - 1, (x, y, z) => (z % 4 === 0 ? SALBEI_D : SALBEI));
    box(2, 5, 58, ny - 1, 6, nz - 7, (x, y, z) => (z % 4 === 0 ? SALBEI_D : SALBEI));
    box(2, 5, ny - 2, ny - 1, 0, nz - 1, '#6d7f6c');
    // eingefahrenes Tor oben, Holzoptik
    box(2, 4, 50, 57, 6, nz - 7, (x, y) => (y % 3 === 0 ? '#a77e52' : '#c4996a'));
    // Torabdichtung außen (schwarzer Gummirahmen) und Puffer unten
    box(6, 7, 0, 59, 4, 6, GUMMI); box(6, 7, 0, 59, nz - 7, nz - 5, GUMMI); box(6, 7, 57, 59, 4, nz - 5, GUMMI);
    for (const z of [8, nz - 11]) box(6, 7, 2, 7, z, z + 2, '#2a2a2d');
    // Warnstreifen am Boden vor dem Tor (bündig, nichts steht über)
    box(6, 7, 0, 0, 7, nz - 8, (x, y, z) => (z % 4 < 2 ? GELB : SCHWARZ));
    // Ampel rechts, Torleuchte oben
    box(6, 7, 30, 37, 1, 2, DUNKEL); box(7, 7, 35, 36, 1, 2, '#e0453a'); box(7, 7, 31, 32, 1, 2, '#3fbf6a');
    box(6, 7, 62, 64, 17, 22, DUNKEL); box(6, 7, 61, 61, 18, 21, '#ffe1a6');
  },
});

// Rampenabfahrt (5-cm-Würfel): abgesenkte Laderampe vor einem Ladetor. Das Gelände wird darunter abgesenkt,
// der LKW fährt rückwärts hinunter und steht so tief, dass seine Ladefläche bündig mit dem Hallenboden ist.
// Lokal −X ist die Torseite (Index 0), dann 8 m flach in 1,1 m Tiefe, dann 6 m Schräge hinauf. Innen 2,6 m breit.
model({
  id: 'rampenabfahrt', name: 'Rampenabfahrt', dims: [280, 37, 72], size: 0.05, menue: 'lager', ursprung: [-140, -22, -36],
  draw: ({ box, rough, nx, nz }) => {
    const BETON_D = '#8f8a80', BETON_H = '#b7b1a5';
    const boden = (x) => (x < 160 ? 1 : Math.round(1 + ((x - 160) / 119) * 21));
    // Sohle und Schräge (gefüllt bis zur Oberfläche), Rillen auf der Schräge, Ablaufrinne vorne
    for (let x = 0; x < nx; x++) {
      const top = boden(x);
      box(x, x, 0, top, 10, nz - 11, (xx, y) => (y === top ? (x >= 160 && x % 6 === 0 ? BETON_D : BETON_H) : BETON_D));
    }
    box(150, 157, 1, 1, 12, nz - 13, (x, y, z) => (z % 2 ? '#3a3d40' : '#55595d'));
    // Spurlinien gelb auf der Sohle
    box(6, 159, 1, 1, 15, 15, GELB); box(6, 159, 1, 1, nz - 16, nz - 16, GELB);
    // Seitenwände bis Geländehöhe, Kante gelb-schwarz
    for (const [z0, z1] of [[0, 9], [nz - 10, nz - 1]]) {
      rough(0, nx - 1, 0, 22, z0, z1, BETON, 0.04);
      box(0, nx - 1, 23, 23, z0, z1, (x) => (Math.floor(x / 6) % 2 ? GELB : SCHWARZ));
    }
    // Torseite: Betonwand mit Gummipuffern
    rough(0, 4, 0, 22, 10, nz - 11, BETON, 0.04);
    for (const z of [16, nz - 22]) box(5, 6, 9, 15, z, z + 5, GUMMI);
    // Geländer oben auf den Wänden (nur am tiefen Teil)
    for (const z of [2, nz - 3]) {
      for (let x = 10; x < 200; x += 30) box(x, x, 24, 35, z, z, GELB_D);
      box(10, 190, 35, 36, z, z, GELB); box(10, 190, 29, 29, z, z, GELB_D);
    }
  },
});

// Poller (Deko, außen)
model({
  id: 'poller', name: 'Poller', dims: [8, 38, 8],
  draw: ({ cyl }) => {
    cyl('y', 4, 4, 3, 0, 37, (i, j, t) => (Math.floor(t / 6) % 2 ? SCHWARZ : GELB));
  },
});

// Mülltonne 240 l (Deko)
model({
  id: 'muelltonne', name: 'Mülltonne', dims: [28, 44, 24],
  draw: ({ box, cyl, nx, nz }) => {
    box(2, nx - 3, 3, 40, 1, nz - 2, '#3b6e4f');
    box(1, nx - 2, 40, 42, 0, nz - 1, '#2f5a40'); // Deckel
    box(0, 1, 38, 42, 3, nz - 4, '#2f5a40'); // Griff hinten
    for (const z of [1, nz - 4]) cyl('z', 3, 3, 3, z, z + 2, GUMMI);
    box(nx - 3, nx - 3, 22, 30, 6, nz - 7, '#2f5a40');
  },
});

// Papiercontainer 1.100 l (Deko)
model({
  id: 'papiercontainer', name: 'Papiercontainer', dims: [44, 52, 52],
  draw: ({ box, cyl, text, nx, nz }) => {
    box(2, nx - 3, 5, 46, 1, nz - 2, '#2f5d9e');
    box(0, nx - 1, 46, 50, 0, nz - 1, '#244a80');
    for (const [x, z] of [[4, 4], [4, nz - 6], [nx - 6, 4], [nx - 6, nz - 6]]) cyl('z', x, 3, 2, z, z + 1, GUMMI);
    text(nx - 2, 34, nz - 10, 'PAPIER', WEISS);
  },
});

// Hallenstrahler (Decke, Licht): hängt vom Ursprung nach unten
model({
  id: 'hallenstrahler', name: 'Hallenstrahler', dims: [20, 28, 20], ebene: 'decke', menue: 'licht',
  draw: ({ box, cyl }) => {
    box(9, 10, 18, 27, 9, 10, SCHWARZ); // Pendel
    cyl('y', 10, 10, 4, 14, 17, DUNKEL);
    for (let y = 2; y < 14; y++) cyl('y', 10, 10, Math.round(4 + (14 - y) * 0.45), y, y, (i, j) => (i * i + j * j > (Math.round(4 + (14 - y) * 0.45) - 1) ** 2 ? STAHL_D : undefined));
    cyl('y', 10, 10, 7, 1, 1, '#fff4cf');
  },
});

// Lagerschild auf zwei Pfosten: "LAGER"
model({
  id: 'lagerschild', name: 'Lagerschild', dims: [4, 88, 64],
  draw: ({ box, text, textWidth, nz }) => {
    for (const z of [6, nz - 8]) box(1, 2, 0, 87, z, z + 1, STAHL_D);
    box(0, 3, 62, 87, 2, nz - 3, BLAU);
    box(3, 3, 63, 86, 3, nz - 4, '#4f8068');
    const s = 4, w = textWidth('LAGER', s);
    text(3, 82, Math.floor(nz / 2 + w / 2), 'LAGER', WEISS, s);
  },
});

// ── Gebäude: Wände und Böden für die Lagerhalle ─────────────────

// Trapezblech-Wand (Wandmodul 2 m × 4 m, 5-cm-Würfel)
model({
  id: 'trapezblech_wand', name: 'Wand Trapezblech', dims: [4, 80, 40], size: 0.05, menue: 'waende',
  draw: ({ box, ny, nz }) => {
    box(1, 2, 0, ny - 1, 0, nz - 1, (x, y, z) => (z % 4 === 0 ? '#76907a' : '#8fa58a'));
    box(0, 0, 0, ny - 1, 0, nz - 1, (x, y, z) => (z % 4 < 2 ? '#8fa58a' : undefined));
    box(3, 3, 0, ny - 1, 0, nz - 1, (x, y, z) => (z % 4 < 2 ? '#9db39a' : undefined));
    box(0, 3, 0, 1, 0, nz - 1, '#5f6f5d'); // Sockel
    box(0, 3, ny - 2, ny - 1, 0, nz - 1, '#6d7f6c'); // Abschluss
  },
});

// Trapezblech mit Lichtband
model({
  id: 'trapezblech_lichtband', name: 'Wand Lichtband', dims: [4, 80, 40], size: 0.05, menue: 'waende',
  draw: ({ box, ny, nz }) => {
    box(1, 2, 0, ny - 1, 0, nz - 1, (x, y, z) => (z % 4 === 0 ? '#76907a' : '#8fa58a'));
    box(0, 0, 0, ny - 1, 0, nz - 1, (x, y, z) => (z % 4 < 2 ? '#8fa58a' : undefined));
    box(3, 3, 0, ny - 1, 0, nz - 1, (x, y, z) => (z % 4 < 2 ? '#9db39a' : undefined));
    box(0, 3, 50, 64, 0, nz - 1, (x, y, z) => (z % 10 === 0 || y === 50 || y === 64 ? '#f1ead9' : (x === 0 || x === 3 ? GLAS_H : GLAS)));
    box(0, 3, 0, 1, 0, nz - 1, '#5f6f5d');
    box(0, 3, ny - 2, ny - 1, 0, nz - 1, '#6d7f6c');
  },
});

// Sektionaltor (offen – man kann hindurchgehen); die Torsegmente sind oben eingefahren
model({
  id: 'sektionaltor', name: 'Sektionaltor', dims: [4, 80, 40], size: 0.05, menue: 'waende',
  draw: ({ box, ny, nz }) => {
    box(0, 3, 0, ny - 1, 0, 2, '#6d7f6c'); box(0, 3, 0, ny - 1, nz - 3, nz - 1, '#6d7f6c');
    box(0, 3, 64, ny - 1, 0, nz - 1, '#8fa58a');
    // eingefahrenes Tor oben (Holzsegmente mit Fensterreihe)
    box(1, 2, 56, 63, 3, nz - 4, (x, y, z) => (y % 4 === 0 ? '#a77e52' : '#c4996a'));
    box(0, 0, 58, 61, 6, nz - 7, (x, y, z) => (z % 6 < 3 ? GLAS_H : '#c4996a'));
    // Führungsschienen, gelbe Kante unten
    box(1, 2, 0, 56, 3, 3, STAHL_D); box(1, 2, 0, 56, nz - 4, nz - 4, STAHL_D);
    box(0, 3, 0, 0, 0, 2, GELB); box(0, 3, 0, 0, nz - 3, nz - 1, GELB);
    for (let y = 0; y < 56; y += 6) { box(0, 3, y, y + 2, 0, 2, GELB); box(0, 3, y, y + 2, nz - 3, nz - 1, GELB); }
  },
});

// Betonboden (2 × 2 m)
model({
  id: 'betonboden', name: 'Boden Beton', dims: [80, 2, 80], menue: 'boden',
  draw: ({ rough, box, nx, nz }) => {
    rough(0, nx - 1, 0, 1, 0, nz - 1, '#bab3a6', 0.035);
    box(0, nx - 1, 1, 1, 0, 0, '#8f8e88'); box(0, 0, 1, 1, 0, nz - 1, '#8f8e88');
  },
});

// Betonboden mit gelber Fahrweg-Markierung
model({
  id: 'betonboden_markierung', name: 'Boden Beton Markierung', dims: [80, 2, 80], menue: 'boden',
  draw: ({ rough, box, nx, nz }) => {
    rough(0, nx - 1, 0, 1, 0, nz - 1, '#bab3a6', 0.035);
    box(0, nx - 1, 1, 1, 0, 0, '#8f8e88'); box(0, 0, 1, 1, 0, nz - 1, '#8f8e88');
    box(0, nx - 1, 1, 1, 6, 9, (x) => (x % 10 < 7 ? GELB : '#bab3a6'));
  },
});

// Asphalt für den Hof (Außenfläche)
model({
  id: 'asphalt_hof', name: 'Asphalt Hof', dims: [80, 2, 80], menue: 'boden',
  draw: ({ rough, box, nx, nz }) => {
    rough(0, nx - 1, 0, 1, 0, nz - 1, ASPHALT, 0.09);
    box(0, nx - 1, 1, 1, nz - 3, nz - 2, '#e4e2dc');
  },
});

// ── Liefer-LKW (5-cm-Würfel): Fahrerhaus vorne (+X), offene Pritsche mit Rungen und Planengestell ─
// Ladefläche oben auf 1,15 m (y 0–22), von −3,5 bis +1,4 m um die Mitte – passend zu data/logistik/standard.json.
// Die Leuchten (Scheinwerfer, Rück-, Begrenzungsleuchten, Blinker) leuchten im Spiel; siehe lkw.licht.
model({
  id: 'lkw', name: 'Liefer-LKW', dims: [144, 66, 50], size: 0.05, menue: 'lager',
  draw: ({ box, cyl, frame, text, textWidth, nx, nz }) => {
    const mid = nz / 2;
    const CAB = '#f3f0e8', CAB_D = '#d9d4c8', CHROM = '#c9ced2', GRUEN_D = '#3f8f5a';
    // Rahmen mit Querträgern
    for (const z of [12, 13, nz - 14, nz - 13]) box(4, 140, 8, 11, z, z, DUNKEL);
    for (let x = 8; x < 140; x += 14) box(x, x + 1, 8, 10, 12, nz - 13, DUNKEL);
    // Räder: Vorderachse einzeln, Hinterachsen mit Zwillingsreifen; Felgen mit Nabe und Radmuttern
    const rad = (x, z0, z1) => {
      cyl('z', x, 9, 9, z0, z1, (i, j) => (i * i + j * j > 49 ? GUMMI : i * i + j * j > 16 ? GRAU : CHROM));
      cyl('z', x, 9, 1, z0, z1, STAHL_D);
    };
    for (const x of [22, 41]) { rad(x, 1, 4); rad(x, 5, 8); rad(x, nz - 9, nz - 6); rad(x, nz - 5, nz - 2); }
    rad(118, 2, 6); rad(118, nz - 7, nz - 3);
    // Kotflügel über den Rädern
    for (const [x0, x1] of [[10, 53], [106, 130]]) for (const z of [[0, 9], [nz - 10, nz - 1]]) box(x0, x1, 19, 20, z[0], z[1], SCHWARZ);
    // Seitlicher Unterfahrschutz zwischen den Achsen, Kraftstofftank, Batteriekasten
    for (const z of [1, nz - 2]) { box(54, 104, 9, 10, z, z, STAHL); box(54, 104, 14, 15, z, z, STAHL); for (let x = 56; x < 104; x += 16) box(x, x, 9, 15, z, z, STAHL_D); }
    cyl('x', 10, 5, 4, 84, 102, (i, j) => (j > 2 ? '#e6e8ea' : CHROM)); box(84, 84, 6, 14, 2, 8, STAHL_D);
    box(86, 100, 4, 13, nz - 8, nz - 3, DUNKEL);
    // Pritsche: Holzboden mit Fugen, Alu-Bordwände mit Rungen, Stirnwand, Planengestell, eingerollte Plane
    box(2, 100, 13, 19, 1, nz - 2, '#3a3f44');
    box(2, 100, 20, 22, 1, nz - 2, (x, y, z) => (y < 22 ? HOLZ_D : z % 5 === 0 ? HOLZ_D : HOLZ));
    for (const z of [1, nz - 2]) box(2, 100, 23, 28, z, z, (x, y) => (x % 16 === 0 ? STAHL_D : y === 28 ? CHROM : STAHL));
    box(2, 2, 23, 28, 1, nz - 2, (x, y, z) => (z % 8 === 0 ? STAHL_D : STAHL));
    box(98, 101, 23, 52, 1, nz - 2, (x, y, z) => (y % 5 === 0 ? STAHL_D : (z === 1 || z === nz - 2) ? STAHL_D : STAHL));
    for (const x of [16, 40, 64, 88]) {
      for (const z of [1, nz - 2]) box(x, x + 1, 23, 52, z, z, STAHL_D);
      box(x, x + 1, 52, 53, 1, nz - 2, STAHL_D);
    }
    box(3, 97, 53, 53, 1, 2, STAHL_D); box(3, 97, 53, 53, nz - 3, nz - 2, STAHL_D);
    for (const z of [[1, 3], [nz - 4, nz - 2]]) box(3, 97, 48, 51, z[0], z[1], GRUEN_UE); // eingerollte Plane
    box(84, 97, 49, 53, 3, nz - 4, GRUEN_UE); // Plane vorne zusammengeschoben
    // Heck: Rückleuchten, Kennzeichen, Unterfahrschutz, Schmutzfänger
    box(1, 1, 14, 18, 2, 8, '#7a1d18'); box(1, 1, 14, 18, nz - 9, nz - 3, '#7a1d18');
    box(1, 1, 12, 13, 18, 31, '#f2f0e8'); text(0, 13, 30, 'UE', SCHWARZ);
    box(1, 3, 5, 6, 6, nz - 7, STAHL_D);
    for (const z of [[1, 8], [nz - 9, nz - 2]]) box(9, 9, 4, 12, z[0], z[1], SCHWARZ);
    // Auspuff hinter dem Fahrerhaus
    box(101, 102, 20, 63, nz - 4, nz - 3, CHROM); box(100, 103, 62, 64, nz - 5, nz - 2, STAHL_D);
    // Fahrerhaus: unten dunkler, Türen mit Fuge und Griff, Trittstufen
    box(104, nx - 2, 10, 60, 2, nz - 3, CAB);
    box(104, nx - 2, 10, 17, 2, nz - 3, CAB_D);
    for (const z of [2, nz - 3]) {
      box(116, 116, 18, 56, z, z, CAB_D); box(136, 136, 18, 56, z, z, CAB_D);
      box(129, 132, 34, 35, z, z, SCHWARZ);
      box(118, 128, 4, 5, z, z, SCHWARZ); box(118, 128, 8, 9, z, z, SCHWARZ);
      box(118, 134, 38, 55, z, z, GLAS); box(118, 134, 54, 55, z, z, CAB_D);
      box(104, nx - 2, 28, 31, z, z, GRUEN_UE); // Firmenstreifen
    }
    // Innenraum (durch die Scheiben zu sehen): Sitze, Lenkrad
    box(120, 128, 30, 40, 6, 14, '#3b3b40'); box(120, 128, 30, 40, nz - 15, nz - 7, '#3b3b40');
    cyl('x', 44, nz - 11, 3, 136, 136, SCHWARZ);
    // Frontscheibe mit Rahmen, Scheibenwischer, Sonnenblende
    box(nx - 2, nx - 1, 36, 56, 4, nz - 5, GLAS_H); box(nx - 1, nx - 1, 37, 55, 5, nz - 6, GLAS);
    frame(nx - 1, nx - 1, 35, 57, 3, nz - 4, SCHWARZ, 1);
    box(nx - 1, nx - 1, 37, 38, 8, 20, SCHWARZ); box(nx - 1, nx - 1, 37, 38, 28, 40, SCHWARZ);
    box(nx - 3, nx - 1, 57, 59, 3, nz - 4, CAB_D);
    // Kühlergrill mit Chromleisten und Logo, Scheinwerfer, Stoßstange, Nebelleuchten
    box(nx - 1, nx - 1, 18, 30, 10, nz - 11, (x, y) => (y % 3 === 0 ? CHROM : '#2b3036'));
    box(nx - 1, nx - 1, 22, 26, mid - 3, mid + 2, GRUEN_D);
    box(nx - 1, nx - 1, 15, 20, 2, 9, '#2b3036'); box(nx - 1, nx - 1, 15, 20, nz - 10, nz - 3, '#2b3036');
    box(nx - 2, nx - 1, 8, 13, 1, nz - 2, '#5d6268'); box(nx - 1, nx - 1, 9, 10, 4, 7, '#fff3c4'); box(nx - 1, nx - 1, 9, 10, nz - 8, nz - 5, '#fff3c4');
    box(nx - 1, nx - 1, 5, 7, 18, 31, '#f2f0e8'); text(nx - 1, 7, 30, 'UE', SCHWARZ);
    // Spiegel an Auslegern
    for (const z of [0, nz - 1]) { box(136, 140, 46, 47, z, z, SCHWARZ); box(138, 141, 38, 46, z, z, SCHWARZ); box(139, 140, 40, 44, z, z, GLAS_H); }
    // Dachspoiler mit Begrenzungsleuchten, Firmenschriftzug vorne oben
    for (let x = 106; x < nx - 3; x++) {
      const y = Math.round(61 + Math.max(0, (x - 106) / 34) * 4);
      box(x, x, 61, y, 4, nz - 5, CAB);
    }
    const w = textWidth('UE', 2);
    text(nx - 2, 66 - 2, Math.floor(mid + w / 2), 'UE', GRUEN_D, 1);
  },
});
