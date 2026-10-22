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

// ── Verkaufsregale: kurze Stücke und Ecken ───────────────────────────────────
for (const [id, L] of Object.entries(LOOK)) {
  model({ id: `vr_wand_kurz_${id}`, name: `Wandregal kurz ${L.name}`, dims: [20, 76, 20], menue: 'einrichtung',
    draw: (api) => regal(api, 20, 76, 20, L, [0.12, 0.56, 1.0, 1.44]) });
  model({ id: `vr_gondel_kurz_${id}`, name: `Gondel kurz ${L.name}`, dims: [20, 60, 20], menue: 'einrichtung',
    draw: (api) => regal(api, 20, 60, 20, L, [0.12, 0.55, 0.98]) });
  // Innenecke: Rückwände hinten (−X) und links (−Z), offen nach vorne und rechts – passt in eine Raumecke
  model({ id: `vr_innenecke_${id}`, name: `Wandregal Innenecke ${L.name}`, dims: [20, 76, 20], menue: 'einrichtung',
    draw: ({ box }) => {
      box(0, 1, 0, 75, 0, 19, L.rueck); box(0, 19, 0, 75, 0, 1, L.rueck);
      box(19, 19, 0, 75, 19, 19, L.korpus); box(2, 19, 0, 3, 2, 19, L.korpus);
      for (const m of [0.12, 0.56, 1.0, 1.44]) { const y = h(m) - 1; box(2, 19, y, y, 2, 19, L.boden); box(19, 19, y - 1, y, 2, 18, L.leiste); box(2, 18, y - 1, y, 19, 19, L.leiste); }
      box(0, 19, 74, 75, 0, 19, L.korpus);
    } });
  // Außenecke: Viertelkreis-Böden um einen Pfosten hinten links – schließt eine Regalreihe rund ab
  model({ id: `vr_aussenecke_${id}`, name: `Wandregal Außenecke ${L.name}`, dims: [20, 76, 20], menue: 'einrichtung',
    draw: ({ box, set }) => {
      box(0, 1, 0, 75, 0, 1, L.korpus);
      for (const m of [0.06, 0.12, 0.56, 1.0, 1.44, 1.88]) {
        const y = Math.max(0, h(m) - 1);
        for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) {
          const r = Math.hypot(x + 0.5, z + 0.5);
          if (r <= 19.5) set(x, y, z, r > 18.5 ? L.leiste : m < 0.1 || m > 1.8 ? L.korpus : L.boden);
        }
      }
    } });
}

// ── Palettenregal-System (wie im Zentrallager) ───────────────────────────────
// Stützrahmen: 1,10 m tief, 10 cm stark, mit Lochraster; Traversen-Ebenen hängen zwischen zwei Rahmen
const PAL = {
  klassik: { name: 'Blau-Orange', rahmen: '#2f5d9e', traeger: '#e07a2a' },
  verzinkt: { name: 'Verzinkt', rahmen: '#a9b0b5', traeger: '#d3d8dc' },
  gruen: { name: 'Grün-Gelb', rahmen: '#3f6b55', traeger: '#e9c23a' },
};
for (const [pid, P] of Object.entries(PAL)) {
  for (const [hm, ny] of [['300', 120], ['450', 180]]) {
    model({ id: `pal_rahmen_${pid}_${hm}`, name: `Stützrahmen ${P.name} (${Number(hm) / 100} m)`, dims: [44, ny, 4], menue: 'lager',
      draw: ({ box, set }) => {
        for (const x0 of [0, 41]) {
          box(x0, x0 + 2, 0, ny - 1, 0, 3, P.rahmen);
          for (let y = 4; y < ny - 2; y += 2) for (const z of [0, 3]) set(x0 + 1, y, z, shade(P.rahmen, 0.7)); // Lochraster
          box(x0 - (x0 ? 1 : 0), x0 + 3 - (x0 ? 1 : 0), 0, 0, 0, 3, STAHL_D); // Fußplatte
        }
        // Diagonalverbände zwischen den Stützen
        for (let y0 = 6; y0 + 16 < ny - 2; y0 += 16) {
          const [xa, xb] = (y0 / 16) % 2 < 1 ? [3, 40] : [40, 3];
          for (let i = 0; i <= 90; i++) { const t = i / 90, x = Math.round(xa + (xb - xa) * t), y = Math.round(y0 + 16 * t); box(x, x, y, y + 1, 1, 2, P.rahmen); }
        }
        for (const y of [2, ny - 3]) box(3, 40, y, y + 1, 1, 2, P.rahmen);
      } });
  }
  for (const [bm, nz] of [['180', 72], ['270', 108]]) {
    for (const [did, dname] of [['offen', 'für Paletten'], ['gitter', 'mit Gitterrost']]) {
      model({ id: `pal_traverse_${pid}_${bm}_${did}`, name: `Traversen-Ebene ${P.name} ${Number(bm) / 100} m (${dname})`, dims: [44, 5, nz], menue: 'lager',
        draw: ({ box }) => {
          for (const x0 of [0, 42]) { box(x0, x0 + 1, 0, 3, 0, nz - 1, P.traeger); for (const z of [0, nz - 1]) box(x0, x0 + 1, 0, 4, z, z, shade(P.traeger, 0.75)); }
          if (did === 'gitter') box(2, 41, 4, 4, 1, nz - 2, (x, y, z) => (x % 3 === 0 || z % 3 === 0 ? STAHL_D : 0));
          else for (let z = 6; z < nz - 4; z += 18) box(2, 41, 3, 3, z, z + 1, STAHL_D); // Palettenauflagen
        } });
    }
  }
}
// Anfahrschutz (vor die Stütze stellen) und Gangendschutz (vor das Regalende), gelb-schwarz
const WARN = (x, y, z) => (Math.floor((x + y + z) / 3) % 2 ? '#e9c23a' : SCHWARZ);
model({ id: 'pal_anfahrschutz', name: 'Anfahrschutz', dims: [10, 16, 10], menue: 'lager',
  draw: ({ box }) => { box(0, 9, 0, 15, 0, 1, WARN); box(0, 1, 0, 15, 0, 9, WARN); box(0, 9, 0, 0, 0, 9, STAHL_D); } });
model({ id: 'pal_gangendschutz', name: 'Gangendschutz', dims: [44, 20, 6], menue: 'lager',
  draw: ({ box }) => {
    for (const x of [1, 42]) box(x, x + 1, 0, 19, 2, 3, '#e9c23a');
    for (const y of [8, 16]) box(0, 43, y, y + 2, 1, 4, WARN);
    for (const x of [0, 41]) box(x, x + 3, 0, 0, 0, 5, STAHL_D);
  } });

// ── Warnelemente fürs Lager ──────────────────────────────────────────────────
const GELB = '#e9c23a', ORANGE = '#e8742c', ROT = '#c8382f', WEISS = '#f4f1ea';
const BAND = (y) => (Math.floor(y / 3) % 2 ? GELB : SCHWARZ); // Warnstreifen quer
const SCHRAEG = (x, y, z) => (Math.floor((x + y + z) / 3) % 2 ? GELB : SCHWARZ);

// Rammschutzpfosten: gelbes Stahlrohr mit schwarzen Bändern, Fußplatte
model({ id: 'rammschutz_pfosten', name: 'Rammschutzpfosten', dims: [8, 44, 8], menue: 'lager',
  draw: ({ box, cyl }) => { box(0, 7, 0, 0, 0, 7, STAHL_D); cyl('y', 4, 4, 3, 1, 41, (i, j, y) => (y > 30 && y < 36 ? SCHWARZ : y > 18 && y < 24 ? SCHWARZ : GELB)); cyl('y', 4, 4, 2, 42, 43, GELB); } });
// Rammschutzbügel: U-Bügel 1 m
model({ id: 'rammschutz_buegel', name: 'Rammschutzbügel', dims: [6, 36, 40], menue: 'lager',
  draw: ({ box }) => {
    for (const z of [1, 36]) { box(1, 4, 1, 33, z, z + 2, (x, y) => BAND(y)); box(0, 5, 0, 0, z - 1, z + 3, STAHL_D); }
    box(1, 4, 31, 34, 1, 38, (x, y, z) => SCHRAEG(x, y, z));
  } });
// Säulenschutz: Rahmen aus Planken um eine Stütze (0,5 × 0,5 m)
model({ id: 'saeulenschutz', name: 'Säulenschutz', dims: [20, 32, 20], menue: 'lager',
  draw: ({ box }) => {
    for (const [x0, x1, z0, z1] of [[0, 19, 0, 1], [0, 19, 18, 19], [0, 1, 0, 19], [18, 19, 0, 19]]) box(x0, x1, 4, 31, z0, z1, (x, y, z) => SCHRAEG(x, y, z));
    for (const [x, z] of [[0, 0], [18, 0], [0, 18], [18, 18]]) box(x, x + 1, 0, 3, z, z + 1, STAHL_D);
  } });
// Leitplanke (Rammschutz-Planke) auf Pfosten: 1 m, 2 m und Ecke
function planke(id, name, nz, ecke = false) {
  model({ id, name, dims: [ecke ? 40 : 8, 22, nz], menue: 'lager',
    draw: ({ box }) => {
      const pfosten = (x, z) => { box(x, x + 3, 0, 0, z, z + 3, STAHL_D); box(x + 1, x + 2, 1, 21, z + 1, z + 2, GELB); };
      const balken = (x0, x1, z0, z1) => { for (const y of [6, 15]) box(x0, x1, y, y + 4, z0, z1, (x, yy, z) => SCHRAEG(x, yy, z)); };
      if (!ecke) { for (const z of [0, nz - 4]) pfosten(2, z); if (nz > 50) pfosten(2, Math.floor(nz / 2) - 2); balken(1, 6, 0, nz - 1); return; }
      pfosten(0, 0); pfosten(36, 0); pfosten(0, 36);
      balken(0, 39, 1, 5); balken(1, 5, 0, 39);
    } });
}
planke('leitplanke_1m', 'Rammschutz-Planke 1 m', 40);
planke('leitplanke_2m', 'Rammschutz-Planke 2 m', 80);
planke('leitplanke_ecke', 'Rammschutz-Planke Ecke', 40, true);
// Fußgänger-Schutzgeländer 2 m (gelb, Handlauf, Knieleiste, Fußleiste) und mit Schwenktor
function gelaender(id, name, tor) {
  model({ id, name, dims: [4, 44, 80], menue: 'lager',
    draw: ({ box }) => {
      for (const z of tor ? [0, 39, 40, 79] : [0, 39, 79]) { box(0, 3, 0, 0, Math.max(0, z - 1), Math.min(79, z + 1), STAHL_D); box(1, 2, 1, 43, z, z, GELB); }
      const [a, b] = tor ? [[0, 39], [41, 78]] : [[0, 79], null];
      for (const [z0, z1] of [a, b].filter(Boolean)) { box(1, 2, 42, 43, z0, z1, GELB); box(1, 2, 22, 23, z0, z1, GELB); box(1, 2, 2, 5, z0, z1, (x, y, z) => SCHRAEG(x, y, z)); }
      if (tor) { box(1, 2, 40, 41, 41, 78, ORANGE); box(1, 2, 20, 21, 41, 78, ORANGE); box(1, 2, 1, 41, 78, 78, ORANGE); box(0, 3, 30, 33, 40, 40, SCHWARZ); }
    } });
}
gelaender('schutzgelaender_2m', 'Schutzgeländer 2 m', false);
gelaender('schutzgelaender_tor', 'Schutzgeländer mit Tor', true);
// Leitkegel (Pylon) und Leitbake
model({ id: 'leitkegel', name: 'Leitkegel', dims: [12, 30, 12], menue: 'lager',
  draw: ({ box, cyl }) => {
    box(0, 11, 0, 1, 0, 11, SCHWARZ);
    for (let y = 2; y < 30; y++) cyl('y', 6, 6, Math.max(1, Math.round(5 - (y - 2) / 6.5)), y, y, (y > 10 && y < 14) || (y > 18 && y < 21) ? WEISS : ORANGE);
  } });
model({ id: 'leitbake', name: 'Leitbake', dims: [8, 44, 12], menue: 'lager',
  draw: ({ box }) => { box(0, 7, 0, 1, 0, 11, SCHWARZ); box(3, 4, 2, 43, 1, 10, (x, y, z) => (Math.floor((y + z) / 4) % 2 ? ROT : WEISS)); } });
// Absperrpfosten mit gelb-schwarzer Kette (1,5 m)
model({ id: 'absperrkette', name: 'Absperrpfosten mit Kette', dims: [8, 40, 60], menue: 'lager',
  draw: ({ box, cyl, set }) => {
    for (const z of [4, 55]) { cyl('y', 4, z, 3, 0, 1, SCHWARZ); box(3, 4, 2, 37, z - 1, z, (x, y) => BAND(y)); box(2, 5, 38, 39, z - 2, z + 1, GELB); }
    for (let z = 5; z <= 54; z++) { const y = Math.round(34 - Math.sin(((z - 5) / 49) * Math.PI) * 8); set(4, y, z, Math.floor(z / 3) % 2 ? GELB : SCHWARZ); }
  } });
// Verkehrsspiegel an Pfosten (Kreuzungen im Lager)
model({ id: 'verkehrsspiegel', name: 'Verkehrsspiegel', dims: [10, 100, 28], menue: 'lager',
  draw: ({ box, cyl }) => {
    box(0, 9, 0, 0, 9, 18, STAHL_D); box(4, 5, 1, 78, 13, 14, '#c3c8cc');
    cyl('x', 88, 14, 11, 5, 5, ROT); cyl('x', 88, 14, 9, 6, 6, '#bcd2d9'); cyl('x', 86, 12, 3, 7, 7, WEISS);
  } });
// Warnschild „Achtung Staplerverkehr“ auf Ständer
model({ id: 'warnschild_stapler', name: 'Warnschild Staplerverkehr', dims: [6, 60, 28], menue: 'lager',
  draw: ({ box, set, text, textWidth }) => {
    for (const z of [3, 24]) { box(0, 5, 0, 0, z - 2, z + 1, STAHL_D); box(2, 3, 1, 36, z, z, STAHL_D); }
    // Dreieck gelb mit schwarzem Rand
    for (let y = 0; y < 22; y++) { const half = Math.round((22 - y) * 0.6); for (let z = 14 - half; z <= 13 + half; z++) set(4, 37 + y, z, y < 2 || Math.abs(z - 13.5) > half - 2 ? SCHWARZ : GELB); }
    box(4, 4, 42, 45, 11, 16, SCHWARZ); box(4, 4, 46, 50, 11, 12, SCHWARZ); // Stapler-Symbol (vereinfacht)
    box(4, 4, 25, 33, 1, 26, GELB); const w = textWidth('STAPLER', 1); text(5, 31, Math.floor(14 + w / 2), 'STAPLER', SCHWARZ, 1, '+x');
  } });
// Radstopper für LKW (rot-gelb)
model({ id: 'radstopper', name: 'Radstopper', dims: [16, 8, 24], menue: 'lager',
  draw: ({ box }) => { for (let x = 0; x < 16; x++) box(x, x, 0, Math.max(1, 7 - Math.abs(x - 8)), 0, 23, (xx, y, z) => (Math.floor(z / 4) % 2 ? ROT : GELB)); } });
