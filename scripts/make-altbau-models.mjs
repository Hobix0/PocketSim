// Erzeugt die Modelle für verfallene Altbauten in der Stadt (data/modelle/<id>.json, typ "modell"):
// Altbau-Wand (Putz mit Rissen und Ziegelstellen), vernageltes Fenster (auch mit „ZU VERMIETEN“),
// vernagelte Tür, staubiger Dielenboden, Gerümpel – und fürs Renovieren das Baugerüst und den Bauzaun.
// Die Altbau-Teile haben dieselben Maße wie Wand, Schaufenster und Boden, damit sie beim Renovieren 1:1 getauscht werden.
// Vorne ist +X, Würfel zu 2,5 cm.
//
// Aufruf: npm run modelle:altbau   (Baukasten: scripts/lib/voxel-model.mjs)

import { model, shade, hash } from './lib/voxel-model.mjs';

const PUTZ = '#cbbfa8', PUTZ_D = '#a99c84', ZIEGEL = '#a4553d', ZIEGEL_D = '#83412f', FUGE = '#8c8476', MOOS = '#6f7f4a';
const BRETT = '#8a6a48', BRETT_D = '#6a4f35', BRETT_H = '#a07c55', NAGEL = '#55585c', SCHMUTZ = '#7d7260';
const ROHR = '#8f969d', ROHR_D = '#6b7178', PLANKE = '#b98a55', NETZ = '#6aa06a', BETON = '#9a9c98';

/** Verwitterter Putz: Flecken, unten dunkler (Spritzwasser), Risse, offene Ziegelstellen */
function putz(x, y, z, ny) {
  const n = hash(Math.floor(x / 2), Math.floor(y / 3), Math.floor(z / 3));
  // Ziegel schauen durch (zwei große Stellen)
  const stelle = ((y - 40) ** 2) / 300 + ((z - 18) ** 2) / 120 < 1 || ((y - 110) ** 2) / 200 + ((z - 60) ** 2) / 90 < 1;
  if (stelle) return (y % 3 === 0 || (z + (Math.floor(y / 3) % 2) * 3) % 6 === 0) ? FUGE : (hash(x, y, z) > 0.5 ? ZIEGEL : ZIEGEL_D);
  // Riss: eine Zickzacklinie
  if (Math.abs(z - (50 + Math.round(Math.sin(y / 7) * 4 + y / 9))) < 1 && y > 60 && y < 140) return SCHMUTZ;
  let c = n > 0.7 ? PUTZ_D : PUTZ;
  if (y < 14) c = shade(c, 0.78 + y / 70);
  if (y < 4 && hash(x, y, z) > 0.55) c = MOOS;
  if (y > ny - 6) c = shade(c, 0.85);
  return c;
}

// Altbau-Wand: 0,2 × 4 × 2 m wie „Wand Weiß“
model({
  id: 'altbau_wand', name: 'Altbau-Wand', dims: [8, 160, 80], menue: 'gebaeude',
  draw: ({ box, ny }) => {
    box(0, 7, 0, ny - 1, 0, 79, (x, y, z) => (x === 7 ? putz(x, y, z, ny) : x === 0 ? shade(PUTZ, 0.92 + hash(x, Math.floor(y / 4), Math.floor(z / 4)) * 0.08) : PUTZ_D));
  },
});

/** Wand mit Öffnung (y0–y1, z0–z1), vorne verwitterter Putz */
function wandMitOeffnung(box, nx, ny, y0, y1, z0, z1) {
  box(0, nx - 1, 0, ny - 1, 0, 79, (x, y, z) => {
    if (y >= y0 && y <= y1 && z >= z0 && z <= z1) return 0;
    return x === nx - 1 ? putz(x, y, z, ny) : PUTZ_D;
  });
}

/** Bretter quer vor einer Öffnung, leicht schief, mit Nägeln */
function bretter(box, x, y0, y1, z0, z1) {
  for (let y = y0; y <= y1; y += 7) {
    const s = Math.round((hash(1, y, 2) - 0.5) * 2);
    for (let z = z0 - 1; z <= z1 + 1; z++) {
      const yy = y + Math.round(((z - z0) / (z1 - z0) - 0.5) * s * 2);
      box(x, x, yy, yy + 4, z, z, (hash(x, yy, z) > 0.5 ? BRETT : BRETT_H));
    }
    box(x + 1, x + 1, y + 2, y + 2, z0, z0, NAGEL);
    box(x + 1, x + 1, y + 2, y + 2, z1, z1, NAGEL);
  }
}

// Vernageltes Fenster (0,28 × 4 × 2 m wie „Schaufenster Groß“), optional mit Zettel „ZU VERMIETEN“
function fenster(id, name, schild) {
  model({
    id, name, dims: [12, 160, 80], menue: 'gebaeude',
    draw: ({ box, text, textWidth, nx, ny }) => {
      wandMitOeffnung(box, nx - 2, ny, 16, 118, 6, 73);
      box(0, 3, 16, 118, 6, 73, BRETT_D); // dunkel dahinter
      box(nx - 3, nx - 3, 14, 15, 4, 75, PUTZ_D); // Fensterbank
      bretter(box, nx - 2, 18, 112, 7, 72);
      if (schild) {
        box(nx - 1, nx - 1, 62, 84, 18, 61, '#f4efe2');
        const w = textWidth('ZU', 2);
        text(nx - 1, 82, 40 + Math.floor(w / 2), 'ZU', '#c8483c', 2);
        const w2 = textWidth('VERMIETEN', 1);
        text(nx - 1, 70, 40 + Math.floor(w2 / 2), 'VERMIETEN', '#2b2b2e', 1);
      }
    },
  });
}
fenster('altbau_fenster', 'Vernageltes Fenster', false);
fenster('altbau_fenster_schild', 'Vernageltes Fenster (zu vermieten)', true);

// Vernagelte Tür (0,5 × 4 × 2 m wie der Eingang): alte Holztür mit Kreuzbrettern
model({
  id: 'altbau_tuer', name: 'Vernagelte Tür', dims: [20, 160, 80], menue: 'gebaeude',
  draw: ({ box, nx, ny }) => {
    box(6, 13, 0, ny - 1, 0, 79, (x, y, z) => {
      if (y < 100 && z >= 22 && z <= 57) return 0;
      return x === 13 ? putz(x, y, z, ny) : PUTZ_D;
    });
    box(6, 6, 0, 99, 22, 57, (x, y, z) => ((z - 22) % 6 === 0 ? BRETT_D : BRETT)); // Tür
    box(14, 15, 100, 102, 20, 59, PUTZ_D); // Sturz
    for (const [a, b] of [[0, 1], [1, 0]]) for (let i = 0; i <= 90; i++) {
      const z = 23 + Math.round((a ? i : 90 - i) * 34 / 90);
      box(14, 14, 4 + i, 7 + i, z, z + 1, BRETT_H); // Kreuz
    }
    box(7, 7, 48, 50, 51, 53, NAGEL); // Klinke
    box(14, 19, 0, 1, 20, 59, BETON); // Stufe
  },
});

// Staubiger Dielenboden (2 × 2 m wie „Boden Fliese Innen“), mit Lücken und Dreck
model({
  id: 'altbau_boden', name: 'Alter Dielenboden', dims: [80, 2, 80], menue: 'gebaeude',
  draw: ({ box }) => {
    box(0, 79, 0, 1, 0, 79, (x, y, z) => {
      const diele = Math.floor(x / 8);
      if (x % 8 === 0) return y === 0 ? BRETT_D : 0;
      if (hash(diele, 0, Math.floor(z / 26)) > 0.9 && y === 1) return 0; // fehlendes Stück
      const staub = hash(Math.floor(x / 5), 3, Math.floor(z / 5));
      if (y === 1 && staub > 0.82) return '#b8ad99';
      return shade(diele % 2 ? BRETT : BRETT_H, 0.85 + hash(diele, 1, Math.floor(z / 10)) * 0.2);
    });
  },
});

// Gerümpel: alte Kisten, kaputter Stuhl, Eimer
model({
  id: 'geruempel', name: 'Gerümpel', dims: [32, 34, 40], menue: 'gebaeude',
  draw: ({ box, cyl, rough }) => {
    rough(2, 15, 0, 13, 2, 17, '#b08a5c', 0.08);
    rough(4, 13, 14, 23, 4, 14, '#9c7a50', 0.08);
    box(15, 15, 2, 12, 2, 17, BRETT_D);
    // Stuhl, umgekippt
    box(18, 29, 0, 1, 22, 33, BRETT_D);
    box(18, 19, 0, 12, 22, 23, BRETT); box(18, 19, 0, 12, 32, 33, BRETT);
    box(18, 29, 12, 13, 22, 33, BRETT_H);
    // Eimer
    cyl('y', 8, 31, 4, 0, 9, '#6f8ea8');
    cyl('y', 8, 31, 3, 1, 9, 0);
    box(4, 12, 10, 10, 31, 31, NAGEL);
    // Staubfusseln
    for (let i = 0; i < 12; i++) box(Math.floor(hash(i, 1, 1) * 31), Math.floor(hash(i, 1, 1) * 31), 0, 0, Math.floor(hash(i, 2, 3) * 39), Math.floor(hash(i, 2, 3) * 39), '#b8ad99');
  },
});

// Baugerüst vor einer Wand (2 m breit, 4,25 m hoch, 60 cm tief): Rohre, Bohlen, grünes Netz
model({
  id: 'geruest', name: 'Baugerüst', dims: [24, 170, 80], menue: 'gebaeude',
  draw: ({ box, ny }) => {
    for (const x of [1, 22]) for (const z of [1, 78]) box(x, x + 1, 0, ny - 1, z, z + 1, ROHR); // Ständer
    for (const y of [48, 96, 144]) {
      box(1, 23, y, y + 1, 1, 78, PLANKE); // Bohlen
      box(22, 23, y + 18, y + 19, 1, 78, ROHR_D); // Geländer
      box(22, 23, y + 9, y + 10, 1, 78, ROHR_D);
    }
    for (let i = 0; i < 46; i++) box(22, 23, i, i + 1, 2 + i * 1.65 | 0, 3 + i * 1.65 | 0, ROHR_D); // Diagonale
    box(23, 23, 98, 140, 4, 76, (x, y, z) => ((y + z) % 4 === 0 ? shade(NETZ, 0.8) : NETZ)); // Netz oben
    box(0, 23, 0, 1, 0, 3, BETON); box(0, 23, 0, 1, 76, 79, BETON); // Fußplatten
  },
});

// Bauzaun (2 m): Gitterfeld in Betonfüßen
model({
  id: 'bauzaun', name: 'Bauzaun', dims: [8, 76, 80], menue: 'aussen',
  draw: ({ box }) => {
    for (const z of [0, 78]) { box(3, 4, 4, 75, z, z + 1, ROHR); box(0, 7, 0, 3, z - 1 < 0 ? 0 : z - 2, z + 2 > 79 ? 79 : z + 3, BETON); }
    box(3, 4, 74, 75, 0, 79, ROHR); box(3, 4, 4, 5, 0, 79, ROHR);
    for (let z = 2; z < 78; z += 4) box(4, 4, 6, 73, z, z, ROHR_D);
    for (let y = 8; y < 74; y += 6) box(4, 4, y, y, 2, 77, ROHR_D);
    box(5, 5, 30, 46, 24, 56, '#e8c53a'); // Schild
    box(5, 5, 36, 40, 26, 54, '#2b2b2e');
  },
});

// ── Stadt: Parkplatz ──────────────────────────────────────────────────────────

// Parkplatz-Boden (2 × 2 m): Asphalt mit weißer Trennlinie am linken Rand (−X) und Fahrbahnkante
model({
  id: 'parkplatz', name: 'Parkplatz', dims: [80, 2, 80], menue: 'aussen',
  draw: ({ box }) => {
    box(0, 79, 0, 1, 0, 79, (x, y, z) => shade('#4a4d52', 0.92 + hash(Math.floor(x / 3), y, Math.floor(z / 3)) * 0.12));
    box(0, 2, 1, 1, 2, 77, '#e9e9e4'); // Trennlinie
  },
});
