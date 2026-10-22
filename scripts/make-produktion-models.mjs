// Erzeugt die Modelle der Produktionslinien (data/modelle/linie_<id>.json, typ "modell"):
// Jede Linie ist 2 m breit, 4 m lang (entlang Z) und steht auf einem Stahlgestell mit Förderband und Schaltschrank.
// Darauf sitzt, was die Linie ausmacht: Abfüllkarussell, Backofen-Tunnel, Milchtanks, Nähtische …
// Vorbild sind echte Produktionsanlagen, stark vereinfacht. Vorne ist +X, Würfel zu 2,5 cm.
//
// Aufruf: npm run modelle:produktion   (Baukasten: scripts/lib/voxel-model.mjs)

import { model, shade } from './lib/voxel-model.mjs';

const STAHL = '#b8bec4', STAHL_D = '#7d858c', BAND = '#2b2d30', GELB = '#e8c53a', SCHALT = '#d6d9dc', GLAS = '#cfe6ec';
const NX = 80, NY = 88, NZ = 160, BAND_Y = 34;

/** Gemeinsamer Unterbau: Beine, Rahmen, Förderband mit Rollen, Schaltschrank mit Lampen, gelbe Kante */
function unterbau(api, farbe) {
  const { box } = api;
  for (const x of [22, 57]) for (let z = 6; z < NZ; z += 36) box(x, x + 1, 0, BAND_Y - 3, z, z + 1, STAHL_D); // Beine
  box(20, 59, BAND_Y - 3, BAND_Y - 2, 2, NZ - 3, STAHL); // Rahmen
  box(22, 57, BAND_Y - 1, BAND_Y, 0, NZ - 1, (x, y, z) => (z % 6 === 0 ? '#45484c' : BAND)); // Band
  for (const x of [20, 59]) box(x, x, BAND_Y - 1, BAND_Y + 1, 0, NZ - 1, GELB); // Kanten
  // Schaltschrank vorne rechts mit Bildschirm und Not-Aus
  box(64, 76, 0, 62, 4, 22, SCHALT);
  box(77, 77, 40, 54, 7, 19, '#2d3640');
  box(77, 77, 42, 52, 8, 18, (x, y, z) => ((y + z) % 5 ? '#7fd3a0' : '#4f9a6c'));
  box(77, 78, 30, 32, 9, 11, '#c8483c');
  box(77, 77, 24, 26, 15, 17, '#5fd08a');
  box(64, 76, 63, 64, 4, 22, farbe); // Farbe der Linie oben am Schrank
}

/** Reihe kleiner Dinge auf dem Band (Flaschen, Brote …) */
function aufBand(api, fn, von = 8, bis = NZ - 8, abstand = 10) {
  for (let z = von; z <= bis; z += abstand) fn(z);
}

const LINIEN = {
  abfuellanlage: { farbe: '#4f8fbf', draw: (api) => {
    const { box, cyl } = api;
    cyl('y', 40, 60, 16, BAND_Y + 1, BAND_Y + 30, STAHL); // Karussell
    cyl('y', 40, 60, 14, BAND_Y + 31, BAND_Y + 34, '#4f8fbf');
    for (let a = 0; a < 8; a++) { const x = 40 + Math.round(Math.cos(a * Math.PI / 4) * 12), z = 60 + Math.round(Math.sin(a * Math.PI / 4) * 12); box(x, x + 1, BAND_Y + 20, BAND_Y + 34, z, z + 1, STAHL_D); }
    cyl('y', 40, 128, 12, BAND_Y + 1, NY - 4, STAHL); // Tank
    cyl('y', 40, 128, 12, NY - 3, NY - 1, STAHL_D);
    aufBand(api, (z) => { box(37, 42, BAND_Y + 1, BAND_Y + 12, z, z + 4, '#3d7a4f'); box(38, 41, BAND_Y + 13, BAND_Y + 15, z + 1, z + 3, '#c8483c'); }, 6, 40, 9);
  } },
  backstrasse: { farbe: '#d9a45b', draw: (api) => {
    const { box } = api;
    box(18, 61, BAND_Y + 1, BAND_Y + 30, 40, 118, '#5a5f66'); // Ofentunnel
    box(18, 61, BAND_Y + 31, BAND_Y + 33, 38, 120, STAHL_D);
    box(61, 61, BAND_Y + 8, BAND_Y + 20, 50, 108, (x, y, z) => ((y + z) % 4 ? '#f0a040' : '#ffcf70')); // Glut im Fenster
    box(36, 44, BAND_Y + 34, NY - 1, 100, 108, STAHL); // Abzug
    aufBand(api, (z) => box(33, 46, BAND_Y + 1, BAND_Y + 6, z, z + 7, '#c88a4a'), 6, 32, 12);
    aufBand(api, (z) => box(33, 46, BAND_Y + 1, BAND_Y + 7, z, z + 7, '#a5652e'), 124, 152, 12);
  } },
  molkerei: { farbe: '#e9e6df', draw: (api) => {
    const { box, cyl } = api;
    for (const z of [40, 100]) { cyl('y', 40, z, 20, BAND_Y + 1, NY - 6, '#eceae4'); cyl('y', 40, z, 18, NY - 5, NY - 3, STAHL); box(39, 41, NY - 2, NY - 1, z - 1, z + 1, STAHL_D); }
    box(39, 41, BAND_Y + 40, BAND_Y + 42, 40, 100, STAHL_D); // Rohr
    aufBand(api, (z) => { box(37, 43, BAND_Y + 1, BAND_Y + 10, z, z + 5, '#ffffff'); box(37, 43, BAND_Y + 11, BAND_Y + 12, z, z + 5, '#4f8fbf'); }, 128, 152, 9);
  } },
  fleischerei: { farbe: '#c25b52', draw: (api) => {
    const { box, cyl } = api;
    box(20, 59, BAND_Y + 1, BAND_Y + 26, 54, 100, STAHL); // Schneidemaschine
    box(59, 59, BAND_Y + 6, BAND_Y + 20, 62, 92, GLAS);
    cyl('x', BAND_Y + 30, 77, 10, 30, 50, STAHL_D); // Wolf
    aufBand(api, (z) => box(32, 47, BAND_Y + 1, BAND_Y + 4, z, z + 7, z % 20 ? '#d9827a' : '#e8a8a0'), 8, 44, 12);
    aufBand(api, (z) => { box(32, 47, BAND_Y + 1, BAND_Y + 5, z, z + 7, '#ffffff'); box(33, 46, BAND_Y + 6, BAND_Y + 6, z + 1, z + 6, '#c25b52'); }, 112, 152, 12);
  } },
  tiefkuehllinie: { farbe: '#9fd0e6', draw: (api) => {
    const { box } = api;
    box(16, 63, BAND_Y + 1, BAND_Y + 36, 30, 130, '#dfe8ee'); // Froster
    box(16, 63, BAND_Y + 37, BAND_Y + 38, 28, 132, '#9fd0e6');
    box(63, 63, BAND_Y + 10, BAND_Y + 26, 44, 116, (x, y, z) => ((y * 3 + z) % 7 ? '#bfe3f2' : '#ffffff')); // Reif
    for (let z = 40; z < 124; z += 20) box(34, 46, BAND_Y + 39, BAND_Y + 46, z, z + 10, STAHL_D); // Lüfter
    aufBand(api, (z) => box(32, 47, BAND_Y + 1, BAND_Y + 5, z, z + 8, '#3f6fb0'), 136, 152, 12);
  } },
  packstation: { farbe: '#7fb35a', draw: (api) => {
    const { box } = api;
    box(18, 61, BAND_Y + 1, BAND_Y + 4, 60, 100, STAHL); // Waage
    box(46, 58, BAND_Y + 5, BAND_Y + 22, 62, 74, SCHALT);
    for (const [z, c] of [[8, '#d9534f'], [22, '#f0ad4e'], [36, '#7fb35a'], [116, '#e8d24a'], [130, '#d9534f'], [144, '#7fb35a']]) {
      box(30, 49, BAND_Y + 1, BAND_Y + 10, z, z + 11, '#a07c55'); // Kiste
      for (let x = 32; x < 48; x += 4) for (let zz = z + 2; zz < z + 10; zz += 4) box(x, x + 2, BAND_Y + 11, BAND_Y + 13, zz, zz + 2, c);
    }
  } },
  trockenwaren: { farbe: '#c9b27c', draw: (api) => {
    const { box } = api;
    for (let y = 0; y < 30; y++) { const w = 4 + Math.floor(y / 2); box(40 - w, 40 + w, BAND_Y + 20 + y, BAND_Y + 20 + y, 64 - w, 64 + w, y > 26 ? STAHL_D : STAHL); } // Trichter
    box(38, 42, BAND_Y + 8, BAND_Y + 19, 62, 66, STAHL_D);
    for (const x of [26, 52]) box(x, x + 1, BAND_Y + 1, BAND_Y + 30, 54, 55, STAHL_D);
    aufBand(api, (z) => box(34, 45, BAND_Y + 1, BAND_Y + 14, z, z + 6, '#e8dcc0'), 90, 152, 10);
  } },
  suesswaren: { farbe: '#8a5a3a', draw: (api) => {
    const { box } = api;
    box(20, 59, BAND_Y + 1, BAND_Y + 24, 50, 110, '#d6d9dc'); // Überzugsmaschine
    box(24, 55, BAND_Y + 25, BAND_Y + 28, 54, 106, '#5a3b22'); // Schokolade oben
    box(59, 59, BAND_Y + 6, BAND_Y + 18, 58, 102, GLAS);
    aufBand(api, (z) => box(34, 45, BAND_Y + 1, BAND_Y + 4, z, z + 5, '#e3c48a'), 8, 40, 9);
    aufBand(api, (z) => box(34, 45, BAND_Y + 1, BAND_Y + 5, z, z + 5, '#5a3b22'), 118, 152, 9);
  } },
  mischanlage: { farbe: '#6fb0a8', draw: (api) => {
    const { box, cyl } = api;
    cyl('y', 40, 70, 22, BAND_Y + 1, NY - 10, '#e9ecee'); // Mischkessel
    cyl('y', 40, 70, 23, NY - 9, NY - 8, '#6fb0a8');
    box(39, 41, NY - 7, NY - 1, 69, 71, STAHL_D); // Rührwerk
    box(34, 46, NY - 3, NY - 1, 64, 76, '#5a5f66');
    aufBand(api, (z) => { box(34, 45, BAND_Y + 1, BAND_Y + 14, z, z + 7, z % 20 ? '#6fb0a8' : '#e8c53a'); box(37, 42, BAND_Y + 15, BAND_Y + 17, z + 2, z + 5, '#ffffff'); }, 108, 152, 11);
  } },
  kosmetik: { farbe: '#d99ac0', draw: (api) => {
    const { box } = api;
    box(20, 59, BAND_Y + 30, BAND_Y + 36, 40, 110, STAHL); // Füllbrücke
    for (const z of [44, 104]) box(22, 25, BAND_Y + 1, BAND_Y + 30, z, z + 3, STAHL_D);
    for (let z = 50; z < 100; z += 10) box(38, 41, BAND_Y + 18, BAND_Y + 29, z, z + 3, '#d99ac0'); // Düsen
    aufBand(api, (z) => { box(37, 42, BAND_Y + 1, BAND_Y + 9, z, z + 4, z % 18 ? '#f5e6ee' : '#c8e0d8'); box(38, 41, BAND_Y + 10, BAND_Y + 11, z + 1, z + 3, '#d99ac0'); }, 6, 152, 8);
  } },
  naehstrasse: { farbe: '#8fae94', draw: (api) => {
    const { box, cyl } = api;
    for (const z of [16, 70, 124]) {
      box(16, 63, BAND_Y + 1, BAND_Y + 2, z, z + 24, '#c9a26a'); // Nähtisch
      box(34, 46, BAND_Y + 3, BAND_Y + 12, z + 6, z + 18, '#f1efe9'); // Nähmaschine
      box(34, 46, BAND_Y + 13, BAND_Y + 18, z + 6, z + 9, '#f1efe9');
      box(38, 42, BAND_Y + 3, BAND_Y + 4, z + 14, z + 20, '#c8574f'); // Stoff
    }
    for (const [z, c] of [[50, '#8fae94'], [56, '#c8574f'], [104, '#e9dcc3']]) cyl('z', BAND_Y + 8, 26, 4, z, z + 4, c); // Stoffballen
  } },
  schuhfertigung: { farbe: '#6e4a2e', draw: (api) => {
    const { box } = api;
    box(20, 59, BAND_Y + 1, BAND_Y + 20, 56, 96, '#5a5f66'); // Presse
    box(28, 51, BAND_Y + 21, BAND_Y + 34, 64, 88, STAHL);
    box(36, 43, BAND_Y + 35, NY - 6, 72, 80, STAHL_D);
    aufBand(api, (z) => { box(33, 46, BAND_Y + 1, BAND_Y + 2, z, z + 10, '#2b2b2e'); box(33, 46, BAND_Y + 3, BAND_Y + 7, z, z + 6, '#8a5a3a'); }, 8, 44, 14);
    aufBand(api, (z) => { box(33, 46, BAND_Y + 1, BAND_Y + 2, z, z + 10, '#c8574f'); box(33, 46, BAND_Y + 3, BAND_Y + 6, z, z + 9, '#f1efe9'); }, 108, 150, 14);
  } },
  konditorei: { farbe: '#f0c6c0', draw: (api) => {
    const { box, cyl } = api;
    box(22, 57, BAND_Y + 26, BAND_Y + 30, 50, 100, STAHL); // Dekorierbrücke
    for (const z of [52, 96]) box(24, 27, BAND_Y + 1, BAND_Y + 26, z, z + 3, STAHL_D);
    for (let z = 60; z < 92; z += 10) box(38, 41, BAND_Y + 16, BAND_Y + 25, z, z + 2, '#f6f3ec'); // Spritztüllen
    aufBand(api, (z) => { cyl('y', 40, z + 6, 6, BAND_Y + 1, BAND_Y + 6, '#f3e2b3'); cyl('y', 40, z + 6, 6, BAND_Y + 7, BAND_Y + 8, z > 100 ? '#d0465a' : '#f3e2b3'); }, 8, 148, 16);
  } },
};

for (const [id, l] of Object.entries(LINIEN)) {
  model({ id: `linie_${id}`, name: id, dims: [NX, NY, NZ], menue: 'maschinen',
    draw: (api) => { unterbau(api, l.farbe); l.draw(api); } });
}
void shade;
