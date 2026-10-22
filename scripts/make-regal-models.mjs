// Baukästen für Regale (data/modelle/<id>.json, typ "modell"), Würfel zu 2,5 cm, vorne ist +X:
//   Verkaufsregale in vier Oberflächen: Wandregal, Gondel (Rücken an Rücken stellen), Kopfregal, Aktionstisch
//   Kühlung in Weiß und Anthrazit: offenes Kühlregal, Glastür-Kühlschrank (1 und 2 Türen), Truhe (Insel, Kopf), Eistruhe
//   Schwerlastregale in drei Farben: Stahlböden, Holzböden, Gitterrost, hoch (4 Ebenen)
// Böden liegen auf den Höhen, die in data/bau → "regal"/"ablage" stehen.
//
// Aufruf: npm run modelle:regale   (Baukasten: scripts/lib/voxel-model.mjs)

import { model, shade } from './lib/voxel-model.mjs';

const h = (m) => Math.round(m / 0.025);
const HOLZ = '#b9845a', HOLZ_D = '#8a5e3b', GLAS = '#cfe6ec', STAHL = '#c3c8cc', STAHL_D = '#8f969d', SCHWARZ = '#1f1f22';

// ── Verkaufsregale ───────────────────────────────────────────────────────────
const LOOK = {
  weiss: { name: 'Weiß', korpus: '#eeeae2', boden: '#f7f5f0', rueck: '#e3ded4', leiste: '#5fd08a' },
  holz: { name: 'Holz', korpus: HOLZ_D, boden: HOLZ, rueck: shade(HOLZ, 0.9), leiste: '#f1ead9' },
  schwarz: { name: 'Schwarz', korpus: '#2b2b2e', boden: HOLZ, rueck: '#3a3a3e', leiste: '#e9c23a' },
  salbei: { name: 'Salbei', korpus: '#5e7a61', boden: '#e9dcc3', rueck: '#7c9a7e', leiste: '#f1ead9' },
};

/** Regal-Korpus: Seiten, Rückwand, Sockel, Böden mit Preisleiste vorne */
function regal({ box }, nx, ny, nz, L, boeden, { ruecken = true, oben = true } = {}) {
  for (const z of [0, nz - 1]) box(0, nx - 1, 0, ny - 1, z, z, L.korpus);
  if (ruecken) box(0, 1, 0, ny - 1, 1, nz - 2, (x, y, z) => ((y + z) % 8 === 0 ? shade(L.rueck, 0.93) : L.rueck));
  box(2, nx - 1, 0, 3, 1, nz - 2, L.korpus);
  for (const m of boeden) {
    const y = Math.max(4, h(m) - 1);
    box(2, nx - 1, y, y, 1, nz - 2, L.boden);
    box(nx - 1, nx - 1, y - 1, y, 1, nz - 2, L.leiste);
  }
  if (oben) box(0, nx - 1, ny - 2, ny - 1, 0, nz - 1, L.korpus);
}

for (const [id, L] of Object.entries(LOOK)) {
  model({ id: `vr_wand_${id}`, name: `Wandregal ${L.name}`, dims: [20, 76, 40], menue: 'einrichtung',
    draw: (api) => regal(api, 20, 76, 40, L, [0.12, 0.56, 1.0, 1.44]) });
  model({ id: `vr_gondel_${id}`, name: `Gondel ${L.name}`, dims: [20, 60, 40], menue: 'einrichtung',
    draw: (api) => regal(api, 20, 60, 40, L, [0.12, 0.55, 0.98]) });
  model({ id: `vr_kopf_${id}`, name: `Kopfregal ${L.name}`, dims: [20, 72, 40], menue: 'einrichtung',
    draw: (api) => {
      regal(api, 20, 64, 40, L, [0.12, 0.5, 0.88], { oben: false });
      // Aktionsschild oben
      api.box(4, 6, 58, 71, 3, 36, '#c8382f'); api.box(6, 6, 60, 69, 5, 34, '#f1ead9');
      const w = api.textWidth('AKTION', 1); api.text(6, 67, Math.floor(20 + w / 2), 'AKTION', '#c8382f', 1, '+x');
    } });
  model({ id: `vr_aktion_${id}`, name: `Aktionstisch ${L.name}`, dims: [32, 36, 40], menue: 'einrichtung',
    draw: ({ box }) => {
      for (const [x, z] of [[1, 1], [1, 37], [29, 1], [29, 37]]) box(x, x + 1, 0, 14, z, z + 1, L.korpus);
      box(14, 31, 15, 16, 0, 39, L.boden); box(31, 31, 14, 16, 0, 39, L.leiste); // untere Stufe vorne
      box(0, 13, 15, 29, 0, 39, L.korpus); box(0, 13, 29, 30, 0, 39, L.boden); box(13, 13, 28, 30, 0, 39, L.leiste); // obere Stufe hinten
      box(2, 3, 31, 35, 4, 35, '#c8382f');
    } });
}

// ── Kühlung ──────────────────────────────────────────────────────────────────
const KUEHL = {
  weiss: { name: 'Weiß', body: '#eef0ee', trim: STAHL, innen: '#dfe7ea' },
  anthrazit: { name: 'Anthrazit', body: '#3a3f44', trim: '#2b2f33', innen: '#cdd8dc' },
};
const LICHT = '#fff3c4';

for (const [id, K] of Object.entries(KUEHL)) {
  // Offenes Kühlregal (Multideck): schräge Böden, Lichtkante oben, Luftschlitze unten
  model({ id: `kuehlregal_${id}`, name: `Kühlregal offen ${K.name}`, dims: [28, 80, 40], menue: 'einrichtung',
    draw: ({ box }) => {
      for (const z of [0, 39]) box(0, 27, 0, 79, z, z, K.body);
      box(0, 2, 0, 79, 1, 38, K.innen);
      box(2, 27, 0, 11, 1, 38, K.body); box(27, 27, 2, 5, 2, 37, (x, y, z) => (z % 2 ? SCHWARZ : K.trim));
      for (const m of [0.35, 0.75, 1.1, 1.45]) { const y = h(m) - 1; box(3, 24 - Math.round(m * 4), y, y, 1, 38, STAHL); box(24 - Math.round(m * 4), 24 - Math.round(m * 4), y, y + 1, 1, 38, '#5fd08a'); }
      box(0, 27, 72, 79, 0, 39, K.body); box(20, 27, 72, 72, 1, 38, LICHT); box(27, 27, 74, 78, 1, 38, K.trim);
    } });
  // Glastür-Kühlschrank: 1 oder 2 Türen
  for (const [n, nz] of [[1, 28], [2, 56]]) {
    model({ id: `kuehlschrank_${id}_${n}`, name: `Glastür-Kühlschrank ${K.name} (${n} Tür${n > 1 ? 'en' : ''})`, dims: [28, 84, nz], menue: 'einrichtung',
      draw: ({ box }) => {
        box(0, 27, 0, 83, 0, nz - 1, K.body);
        box(0, 25, 4, 77, 2, nz - 3, 0); box(0, 1, 4, 77, 2, nz - 3, K.innen);
        for (const m of [0.2, 0.6, 1.0, 1.4]) box(2, 24, h(m) - 1, h(m) - 1, 2, nz - 3, STAHL);
        const tw = Math.floor((nz - 2) / n);
        for (let i = 0; i < n; i++) {
          const z0 = 1 + i * tw, z1 = z0 + tw - 1;
          box(27, 27, 3, 78, z0, z1, K.trim); box(27, 27, 5, 76, z0 + 2, z1 - 2, GLAS);
          const g = i % 2 ? z0 + 3 : z1 - 3; box(27, 27, 30, 50, g, g, STAHL_D);
        }
        box(26, 27, 79, 83, 1, nz - 2, LICHT); box(27, 27, 80, 82, 3, nz - 4, '#4a86b0');
      } });
  }
  // Tiefkühltruhe als Insel (lang) und als Kopf (quadratisch): Glasschiebedeckel, Griffleiste
  for (const [art, nz, name] of [['insel', 60, 'Truhen-Insel'], ['kopf', 36, 'Truhen-Kopf']]) {
    model({ id: `truhe_${id}_${art}`, name: `${name} ${K.name}`, dims: [36, 36, nz], menue: 'einrichtung',
      draw: ({ box }) => {
        box(0, 35, 0, 31, 0, nz - 1, K.body); box(2, 33, 3, 31, 2, nz - 3, 0); box(2, 33, 3, 3, 2, nz - 3, K.innen);
        box(0, 35, 2, 3, 0, nz - 1, K.trim); box(0, 35, 26, 26, 0, nz - 1, '#4a86b0');
        box(1, 34, 32, 32, 1, nz - 2, GLAS); for (const x of [0, 35]) box(x, x, 32, 33, 0, nz - 1, K.trim); for (const z of [0, nz - 1]) box(0, 35, 32, 33, z, z, K.trim); box(17, 18, 32, 33, 1, nz - 2, STAHL_D);
      } });
  }
  // Eistruhe: kleiner, gewölbter Glasdeckel, buntes Eis-Schild
  model({ id: `eistruhe_${id}`, name: `Eistruhe ${K.name}`, dims: [28, 40, 36], menue: 'einrichtung',
    draw: ({ box, text, textWidth }) => {
      box(0, 27, 0, 31, 0, 35, K.body); box(2, 25, 3, 31, 2, 33, 0); box(2, 25, 3, 3, 2, 33, K.innen);
      for (let x = 1; x <= 26; x++) { const y = 32 + Math.round(Math.sin((x / 27) * Math.PI) * 4); box(x, x, y, y, 1, 34, GLAS); }
      box(27, 27, 10, 24, 4, 31, '#e46b7b'); box(27, 27, 12, 22, 6, 29, '#f7f3ea');
      const w = textWidth('EIS', 2); text(27, 21, Math.floor(18 + w / 2), 'EIS', '#4a86b0', 2, '+x');
    } });
}

// ── Schwerlastregale (Lager) ─────────────────────────────────────────────────
const SCHWER = {
  klassik: { name: 'Blau-Orange', rahmen: '#2f5d9e', traeger: '#e07a2a' },
  verzinkt: { name: 'Verzinkt', rahmen: '#a9b0b5', traeger: '#d3d8dc' },
  gruen: { name: 'Grün-Gelb', rahmen: '#3f6b55', traeger: '#e9c23a' },
};
const DECKS = {
  stahl: { name: 'Stahlböden', farbe: () => STAHL },
  holz: { name: 'Holzböden', farbe: (x, z) => ((x + z * 3) % 7 ? '#c9a26b' : '#b48d58') },
  gitter: { name: 'Gitterrost', farbe: (x, z) => (x % 3 === 0 || z % 3 === 0 ? STAHL_D : 0) },
};

/** Ein Regalfeld: zwei Rahmen mit Diagonalstreben, Traversen und Böden auf den angegebenen Höhen */
function schwerlast({ box, set }, nx, ny, nz, S, boeden, deck) {
  for (const z0 of [0, nz - 2]) {
    for (const x0 of [0, nx - 2]) box(x0, x0 + 1, 0, ny - 1, z0, z0 + 1, S.rahmen);
    // Diagonalen im Rahmen (Seitenansicht)
    for (let y0 = 4; y0 + 12 < ny - 2; y0 += 12) {
      const [xa, xb] = (y0 / 12) % 2 < 1 ? [2, nx - 3] : [nx - 3, 2];
      for (let i = 0; i <= 80; i++) {
        const t = i / 80, x = Math.round(xa + (xb - xa) * t), y = Math.round(y0 + 12 * t);
        for (const dz of [0, 1]) { set(x, y, z0 + dz, S.rahmen); set(x, y + 1, z0 + dz, S.rahmen); }
      }
    }
    box(0, nx - 1, 0, 0, z0, z0 + 1, shade(S.rahmen, 0.8));
  }
  for (const m of boeden) {
    const y = Math.max(1, h(m) - 1);
    for (const x0 of [0, nx - 2]) box(x0, x0 + 1, y - 2, y, 2, nz - 3, S.traeger);
    box(2, nx - 3, y, y, 2, nz - 3, (x, yy, z) => deck.farbe(x, z));
  }
}

for (const [sid, S] of Object.entries(SCHWER)) {
  for (const [did, D] of Object.entries(DECKS)) {
    model({ id: `schwerlast_${sid}_${did}`, name: `Schwerlastregal ${S.name} (${D.name})`, dims: [32, 96, 72], menue: 'lager',
      draw: (api) => schwerlast(api, 32, 96, 72, S, [0.05, 0.85, 1.65], D) });
  }
  model({ id: `schwerlast_${sid}_hoch`, name: `Schwerlastregal ${S.name} (hoch, 4 Ebenen)`, dims: [32, 128, 72], menue: 'lager',
    draw: (api) => schwerlast(api, 32, 128, 72, S, [0.05, 0.85, 1.65, 2.45], DECKS.stahl) });
}
