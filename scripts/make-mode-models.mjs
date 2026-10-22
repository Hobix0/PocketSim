// Erzeugt die Modelle des Modeladens (data/modelle/<id>.json, typ "modell"):
// Kleiderständer, Kleiderwand, Wühltisch, Schuhregal, Accessoire-Regal, Umkleidekabine (+ Vorhang),
// Standspiegel, Schaufensterpuppen, Boutique-Kassentresen, Samtsessel, Hängeschild „MODE“
// und die Ware: hängende Kleidung (alle 80 cm hoch, der Bügelhaken oben in der Mitte), gefaltete Ware und Schuhe.
// Vorne ist +X, Möbel mit Würfeln zu 2,5 cm, Ware zu 1 cm.
//
// Aufruf: npm run modelle:mode   (Baukasten: scripts/lib/voxel-model.mjs)

import { model, shade } from './lib/voxel-model.mjs';

const CHROM = '#c9ced3', CHROM_D = '#8f969d', SCHWARZ = '#232326', HOLZ = '#b9845a', HOLZ_D = '#7a5234', HOLZ_H = '#d2a77a';
const CREME = '#f3ece0', ROSA = '#e7b8b5', ROSA_D = '#c98f8c', SALBEI = '#8fae94', SALBEI_D = '#6d8c73', MESSING = '#c9a24a';
const SPIEGEL = '#e4edf1', SPIEGEL_D = '#c5d3da', HAUT = '#efe6da';
const h = (m) => Math.round(m / 0.025);

// ── Möbel ────────────────────────────────────────────────────────────────────

// Kleiderständer auf Rollen: zwei Füße, zwei Stangen, Kleiderstange oben auf 1,475 m
model({
  id: 'kleiderstaender', name: 'Kleiderständer', dims: [20, 62, 48], menue: 'einrichtung',
  draw: ({ box, cyl, nz }) => {
    for (const z of [1, nz - 2]) {
      box(1, 18, 1, 1, z - 1, z + 1, CHROM_D); // Fuß
      for (const x of [1, 18]) box(x, x, 0, 0, z, z, SCHWARZ); // Rollen
      box(9, 10, 2, 59, z, z, CHROM); // Stange
    }
    box(9, 10, 59, 59, 1, nz - 2, CHROM); // Kleiderstange
    box(9, 10, 60, 60, 0, 1, CHROM_D);
    box(9, 10, 60, 60, nz - 2, nz - 1, CHROM_D);
    cyl('z', 9, 4, 0, 1, nz - 2, CHROM_D); // Querstrebe unten
  },
});

// Kleiderwand: Holzrückwand, Kleiderstange auf 1,475 m und ein Boden oben (1,78 m) für gefaltete Ware
model({
  id: 'kleiderwand', name: 'Kleiderwand', dims: [18, 80, 48], menue: 'einrichtung',
  draw: ({ box, rough, nx, ny, nz }) => {
    rough(0, 1, 0, ny - 1, 0, nz - 1, HOLZ_H, 0.04);
    for (let z = 0; z < nz; z += 8) box(1, 1, 0, ny - 1, z, z, HOLZ); // Fugen
    box(0, nx - 1, 0, 2, 0, nz - 1, HOLZ_D); // Sockel
    box(2, nx - 1, h(1.75), h(1.75), 0, nz - 1, HOLZ_D); // Boden oben
    for (const z of [0, nz - 1]) box(2, nx - 1, h(1.75) - 3, h(1.75), z, z, HOLZ_D); // Konsolen
    box(9, 10, 59, 59, 1, nz - 2, MESSING); // Kleiderstange
    for (const z of [1, nz - 2]) box(2, 10, 59, 59, z, z, MESSING);
  },
});

// Wühltisch: Holztisch mit Bord darunter, für gefaltete Ware
model({
  id: 'wuehltisch', name: 'Wühltisch', dims: [32, 30, 56], menue: 'einrichtung',
  draw: ({ box, rough, nx, nz }) => {
    rough(0, nx - 1, 28, 29, 0, nz - 1, HOLZ_H, 0.05); // Platte
    box(1, nx - 2, 27, 27, 1, nz - 2, HOLZ);
    for (const x of [1, nx - 2]) for (const z of [1, nz - 2]) box(x, x, 0, 26, z, z, HOLZ_D); // Beine
    box(1, nx - 2, h(0.3) - 1, h(0.3) - 1, 1, nz - 2, HOLZ); // Bord unten
    for (let z = 4; z < nz - 4; z += 9) box(nx - 1, nx - 1, 26, 26, z, z + 4, HOLZ_D);
  },
});

// Schuhregal: weiße Wandböden in vier Höhen, Holzkante
model({
  id: 'schuhregal', name: 'Schuhregal', dims: [16, 72, 40], menue: 'einrichtung',
  draw: ({ box, nx, ny, nz }) => {
    box(0, 0, 0, ny - 1, 0, nz - 1, CREME);
    for (const z of [0, nz - 1]) box(0, nx - 1, 0, ny - 1, z, z, CREME);
    for (const y of [h(0.1), h(0.5), h(0.9), h(1.3)]) {
      box(1, nx - 1, y - 1, y - 1, 1, nz - 2, CREME);
      box(nx - 1, nx - 1, y - 1, y - 1, 1, nz - 2, HOLZ);
    }
    box(0, nx - 1, ny - 1, ny - 1, 0, nz - 1, HOLZ);
  },
});

// Accessoire-Regal: Würfelregal in Salbei mit drei Böden (Mützen, Schals, Taschen)
model({
  id: 'accessoire_regal', name: 'Accessoire-Regal', dims: [16, 64, 36], menue: 'einrichtung',
  draw: ({ box, nx, ny, nz }) => {
    box(0, 0, 0, ny - 1, 0, nz - 1, SALBEI_D);
    for (const z of [0, nz - 1]) box(0, nx - 1, 0, ny - 1, z, z, SALBEI);
    for (const y of [0, h(0.55), h(1.05), ny - 1]) box(0, nx - 1, Math.max(0, y - 1), y, 0, nz - 1, SALBEI);
  },
});

// Umkleidekabine: Holzwände, Spiegel innen, Hocker; vorne ein Vorhang, offen zur Seite gerafft
model({
  id: 'umkleidekabine', name: 'Umkleidekabine', dims: [44, 88, 40], menue: 'einrichtung',
  draw: ({ box, rough, nx, ny, nz }) => {
    rough(0, 1, 0, ny - 4, 0, nz - 1, HOLZ_H, 0.04); // Rückwand
    for (const z of [0, nz - 1]) rough(0, nx - 1, 0, ny - 4, z, z, HOLZ_H, 0.04); // Seitenwände
    box(0, nx - 1, ny - 3, ny - 1, 0, nz - 1, HOLZ_D); // Blende oben
    box(2, 2, 16, 64, 10, nz - 11, SPIEGEL); // Spiegel
    box(2, 2, 16, 16, 10, nz - 11, MESSING);
    box(2, 2, 64, 64, 10, nz - 11, MESSING);
    box(3, 9, 0, 17, 4, 10, ROSA_D); // Hocker
    box(3, 9, 18, 18, 4, 10, ROSA);
    for (const z of [4, 12]) box(1, 2, 60, 60, z, z, MESSING); // Haken
    box(nx - 3, nx - 3, ny - 5, ny - 5, 1, nz - 2, MESSING); // Vorhangstange
    // Vorhang offen: an der rechten Seite gerafft
    for (let z = 1; z <= 6; z++) box(nx - 4, nx - 2, 1, ny - 6, z, z, z % 2 ? ROSA : ROSA_D);
  },
});

// Geschlossener Vorhang (wird über die Kabine gelegt, solange jemand anprobiert)
model({
  id: 'umkleide_vorhang', name: 'Vorhang', dims: [44, 88, 40], menue: 'leben',
  draw: ({ box, ny, nz, nx }) => {
    for (let z = 1; z <= nz - 2; z++) box(nx - 4, nx - 2, 3, ny - 6, z, z, Math.floor(z / 2) % 2 ? ROSA : ROSA_D);
  },
});

// Standspiegel mit Messingrahmen
model({
  id: 'standspiegel', name: 'Standspiegel', dims: [12, 72, 28], menue: 'deko',
  draw: ({ box, nz }) => {
    box(0, 11, 0, 1, 4, nz - 5, HOLZ_D); // Fuß
    box(4, 5, 2, 71, 2, nz - 3, MESSING); // Rahmen
    box(5, 5, 4, 69, 4, nz - 5, (x, y, z) => ((y + z) % 11 === 0 ? SPIEGEL_D : SPIEGEL));
  },
});

// Schaufensterpuppe: Ständer, Körper, Kleidung in Farbe `kleid` (Kleid) oder Anzug
function puppe(id, name, art, farbe) {
  model({
    id, name, dims: [16, 72, 20], menue: 'deko',
    draw: ({ box, cyl }) => {
      box(2, 13, 0, 0, 2, 17, SCHWARZ); // Fuß
      box(7, 8, 1, 20, 9, 10, CHROM_D); // Ständer
      cyl('y', 8, 10, 3, 64, 70, HAUT); // Kopf
      box(7, 8, 61, 63, 9, 10, HAUT); // Hals
      box(5, 10, 44, 60, 4, 15, HAUT); // Oberkörper
      if (art === 'kleid') {
        box(5, 10, 44, 60, 4, 15, farbe);
        for (let y = 20; y < 44; y++) { const w = Math.floor((44 - y) / 5); box(5 - Math.min(w, 3), 10 + Math.min(w, 3), y, y, 4 - w, 15 + w, farbe); }
        box(5, 10, 46, 46, 4, 15, shade(farbe, 0.8)); // Gürtel
      } else {
        box(5, 10, 40, 60, 4, 15, farbe); // Jacke
        box(10, 10, 48, 60, 9, 10, CREME); // Hemd
        box(10, 10, 50, 58, 9, 9, SCHWARZ); // Krawatte
        box(6, 9, 20, 39, 5, 8, shade(farbe, 0.85)); // Hosenbeine
        box(6, 9, 20, 39, 11, 14, shade(farbe, 0.85));
      }
      for (const z of [2, 17]) box(6, 9, 45, 59, z, z + (z === 2 ? 1 : -1) * 1 + 0, art === 'kleid' ? HAUT : farbe); // Arme
    },
  });
}
puppe('puppe_kleid', 'Schaufensterpuppe Kleid', 'kleid', '#c8574f');
puppe('puppe_anzug', 'Schaufensterpuppe Anzug', 'anzug', '#3f4b5e');

// Boutique-Kassentresen: geschwungene Holzfront in Rosa, Kasse und Seidenpapier
model({
  id: 'boutique_tresen', name: 'Boutique-Kassentresen', dims: [28, 48, 64], menue: 'einrichtung',
  draw: ({ box, rough, nx, nz }) => {
    rough(0, nx - 1, 0, h(0.95), 0, nz - 1, ROSA, 0.03);
    for (let z = 2; z < nz - 2; z += 3) box(nx - 1, nx - 1, 2, h(0.95) - 2, z, z, ROSA_D); // Lamellen
    box(0, nx - 1, 0, 1, 0, nz - 1, HOLZ_D); // Sockel
    box(0, nx - 1, h(0.95) + 1, h(0.95) + 1, 0, nz - 1, HOLZ_H); // Platte
    const y0 = h(0.95) + 2;
    box(6, 12, y0, y0 + 4, 8, 16, SCHWARZ); // Kasse
    box(10, 12, y0 + 5, y0 + 8, 10, 14, '#2d3640');
    box(12, 12, y0 + 6, y0 + 7, 11, 13, '#7fd3a0');
    box(8, 16, y0, y0 + 1, nz - 24, nz - 12, CREME); // Seidenpapier
    box(9, 15, y0 + 2, y0 + 6, nz - 9, nz - 4, ROSA_D); // Tüte
    box(11, 13, y0 + 7, y0 + 8, nz - 8, nz - 8, MESSING);
  },
});

// Samtsessel in Salbei (zum Warten, Deko)
model({
  id: 'samtsessel', name: 'Samtsessel', dims: [32, 36, 32], menue: 'deko',
  draw: ({ box, rough, nz }) => {
    for (const x of [3, 28]) for (const z of [3, 28]) box(x, x, 0, 4, z, z, MESSING); // Beine
    rough(2, 29, 5, 15, 2, 29, SALBEI, 0.05); // Sitz
    rough(2, 8, 16, 35, 2, 29, SALBEI_D, 0.05); // Lehne
    for (const z of [2, nz - 3]) rough(2, 29, 16, 22, z, z + (z === 2 ? 2 : -2) + 0, SALBEI_D, 0.05); // Armlehnen
  },
});

// Hängeschild „MODE“ (unter der Decke)
model({
  id: 'schild_mode', name: 'Hängeschild Mode', dims: [4, 56, 60], menue: 'schilder',
  draw: ({ box, text, textWidth, nz }) => {
    for (const z of [10, nz - 11]) box(1, 2, 24, 55, z, z, CHROM_D); // Seile
    box(0, 3, 0, 23, 2, nz - 3, ROSA);
    box(0, 3, 0, 0, 2, nz - 3, ROSA_D);
    const w = textWidth('MODE', 2);
    for (const [x, seite] of [[3, '+x'], [0, '-x']]) {
      const left = seite === '+x' ? Math.floor((nz + w) / 2) : Math.floor((nz - w) / 2);
      text(x, 18, left, 'MODE', '#ffffff', 2, seite);
    }
  },
});

// ── Ware (1-cm-Würfel) ────────────────────────────────────────────────────────

// Hängende Kleidung: 40 cm breit (entlang X, so hängt sie seitlich an der Stange), 6 cm dick, 80 cm hoch.
// Bügel und Haken oben; `form` zeichnet das Teil von `oben` (unter dem Bügel) nach unten.
function haengend(id, name, form) {
  model({
    id, name, dims: [40, 80, 6], size: 0.01, menue: 'leben',
    draw: (api) => {
      const { box } = api;
      box(19, 20, 75, 79, 2, 3, CHROM_D); // Haken
      box(19, 20, 79, 79, 2, 3, 0);
      box(18, 18, 78, 79, 2, 3, CHROM_D);
      for (let x = 3; x <= 36; x++) box(x, x, 72 + Math.floor((19.5 - Math.abs(x - 19.5)) / 7), 72 + Math.floor((19.5 - Math.abs(x - 19.5)) / 7), 2, 3, HOLZ); // Bügel
      form({ ...api, top: 71 });
    },
  });
}

const muster = (a, b, n = 4) => (x, y) => ((x + y) % n === 0 ? b : a);

haengend('tshirt_salbei', 'T-Shirt', ({ box, top }) => {
  box(2, 37, top - 10, top, 1, 4, SALBEI); // Ärmel und Schultern
  box(9, 30, top - 34, top, 1, 4, SALBEI); // Körper
  box(16, 23, top - 1, top, 1, 4, 0); // Halsausschnitt
  box(9, 30, top - 34, top - 34, 1, 4, SALBEI_D); // Saum
});
haengend('hemd_blau', 'Hemd', ({ box, top }) => {
  const c = '#a9c4de', d = '#86a6c6';
  box(1, 38, top - 8, top, 1, 4, c); // Schultern
  box(2, 6, top - 30, top - 9, 1, 4, c); // lange Ärmel
  box(33, 37, top - 30, top - 9, 1, 4, c);
  box(9, 30, top - 40, top, 1, 4, c);
  box(16, 23, top - 2, top, 1, 4, '#ffffff'); // Kragen
  for (let y = top - 38; y < top - 3; y += 6) box(19, 20, y, y, 4, 4, '#ffffff'); // Knöpfe
  box(9, 30, top - 40, top - 40, 1, 4, d);
});
haengend('kleid_rot', 'Sommerkleid', ({ box, top }) => {
  const c = '#c8574f', d = '#f3e1c8';
  box(12, 27, top - 18, top, 1, 4, c); // Oberteil
  box(12, 15, top, top, 1, 4, c); box(24, 27, top, top, 1, 4, c); box(16, 23, top - 3, top, 1, 4, 0);
  box(12, 27, top - 20, top - 19, 1, 4, shade(c, 0.8)); // Taille
  for (let y = top - 62; y < top - 20; y++) { const w = Math.floor((top - 20 - y) / 4); box(12 - w, 27 + w, y, y, 1, 4, (x) => ((x * 3 + y * 5) % 17 === 0 ? d : c)); }
});
haengend('pullover_creme', 'Strickpullover', ({ box, top }) => {
  const c = '#e9dcc3', d = '#d2c09f';
  box(1, 38, top - 34, top, 1, 4, muster(c, d, 3));
  box(1, 7, top - 34, top - 10, 1, 4, 0); box(32, 38, top - 34, top - 10, 1, 4, 0);
  for (const x of [2, 3, 4, 5, 34, 35, 36, 37]) box(x, x, top - 34, top - 10, 1, 4, muster(c, d, 3));
  box(8, 31, top - 38, top, 1, 4, muster(c, d, 3));
  box(15, 24, top - 2, top, 1, 4, d);
  box(8, 31, top - 38, top - 36, 1, 4, d); // Bund
});
haengend('jacke_senf', 'Wolljacke', ({ box, top }) => {
  const c = '#c9962f', d = '#9e7322';
  box(0, 39, top - 36, top, 0, 5, c);
  box(0, 6, top - 36, top - 10, 0, 5, 0); box(33, 39, top - 36, top - 10, 0, 5, 0);
  for (const x of [1, 2, 3, 4, 5, 34, 35, 36, 37, 38]) box(x, x, top - 36, top - 10, 0, 5, c);
  box(7, 32, top - 56, top, 0, 5, c);
  box(14, 25, top - 4, top, 0, 5, d); // Kragen
  for (let y = top - 50; y < top - 8; y += 9) box(20, 21, y, y + 1, 5, 5, '#3b2a17'); // Knöpfe
  box(10, 15, top - 44, top - 42, 5, 5, d); box(24, 29, top - 44, top - 42, 5, 5, d); // Taschen
});

// Gefaltete Ware und Accessoires (stehen auf Tisch und Böden)
model({
  id: 'jeans_gefaltet', name: 'Jeans', dims: [26, 8, 30], size: 0.01, menue: 'leben',
  draw: ({ box }) => {
    for (let i = 0; i < 2; i++) {
      const y = i * 4;
      box(0, 25, y, y + 3, 0, 29, (x, yy, z) => ((x + z * 2) % 9 === 0 ? '#3b5778' : '#4a6a91'));
      box(0, 25, y + 3, y + 3, 0, 0, '#c9a24a'); // Naht
      box(24, 25, y + 1, y + 2, 4, 8, '#7a5234'); // Etikett
    }
  },
});
model({
  id: 'schal_rosa', name: 'Schal', dims: [16, 10, 22], size: 0.01, menue: 'leben',
  draw: ({ cyl }) => {
    cyl('z', 8, 5, 4, 0, 21, (i, j, t) => ((t + i) % 4 === 0 ? ROSA_D : ROSA)); // aufgerollt
    cyl('z', 8, 5, 1, 0, 21, ROSA_D);
  },
});
model({
  id: 'muetze_strick', name: 'Strickmütze', dims: [20, 20, 20], size: 0.01, menue: 'leben',
  draw: ({ box, cyl }) => {
    for (let y = 0; y < 14; y++) { const r = y < 5 ? 9 : Math.max(2, 9 - Math.floor((y - 4) / 1.6)); cyl('y', 10, 10, r, y, y, y < 4 ? '#8a3b3b' : (y % 2 ? '#b24c4c' : '#a14444')); }
    cyl('y', 10, 10, 3, 14, 18, CREME); // Bommel
    box(9, 11, 18, 19, 9, 11, CREME);
  },
});
model({
  id: 'tasche_leder', name: 'Ledertasche', dims: [14, 34, 30], size: 0.01, menue: 'leben',
  draw: ({ box }) => {
    const c = '#8a5a3a';
    box(0, 13, 0, 22, 0, 29, c);
    box(13, 13, 14, 22, 2, 27, shade(c, 0.85)); // Klappe
    box(13, 13, 14, 15, 13, 16, MESSING);
    for (const z of [6, 23]) box(6, 7, 23, 32, z, z, '#5e3c26'); // Griff
    box(6, 7, 32, 33, 6, 23, '#5e3c26');
  },
});

// Schuhe (Paar, 28 cm lang entlang X, 11 cm breit)
function schuh(id, name, c, sohle, hoch) {
  model({
    id, name, dims: [28, hoch, 11], size: 0.01, menue: 'leben',
    draw: ({ box }) => {
      for (const z0 of [0, 6]) {
        box(0, 27, 0, 1, z0, z0 + 4, sohle);
        box(0, 26, 2, 6, z0, z0 + 4, c); // Vorderfuß
        box(0, 11, 7, hoch - 1, z0, z0 + 4, c); // Ferse / Schaft
        box(12, 18, 7, 8, z0, z0 + 4, c);
        if (hoch <= 12) for (let x = 13; x < 22; x += 3) box(x, x, 7, 7, z0 + 1, z0 + 3, '#ffffff'); // Schnürung
      }
    },
  });
}
schuh('sneaker_weiss', 'Sneaker', '#f1efe9', '#c8574f', 12);
schuh('stiefel_braun', 'Stiefeletten', '#6e4a2e', SCHWARZ, 22);
