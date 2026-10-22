// Erzeugt die Modelle für Wohnhäuser und Wohnetagen über Läden (data/modelle/<id>.json, typ "modell"),
// jeweils in vier Putzfarben: Fenster, Fenster mit Blumenkasten, Balkon, Wand, Ecke (Obergeschoss, 3 m hoch),
// Erdgeschoss-Fenster, Erdgeschoss-Wand und Haustür (4 m hoch wie die Ladenwände),
// dazu Giebel und Satteldach für 6, 8 und 10 m tiefe Häuser und ein Gesims zwischen Laden und Wohnungen.
// Vorne ist +X, Würfel zu 2,5 cm. Die Bauteile setzt der Gebäude-Generator (src/world/Level.ts → buildingParts).
//
// Aufruf: npm run modelle:wohn   (Baukasten: scripts/lib/voxel-model.mjs)

import { model, shade, hash } from './lib/voxel-model.mjs';

export const FARBEN = { creme: '#efe3c8', rosa: '#e8c4bc', salbei: '#c5d3b8', hellblau: '#c7d6de' };
const WEISS = '#f6f3ec', GLAS = '#9fb7c0', GLAS_H = '#c0d3d9', VORHANG = '#f1e7d6', HOLZ = '#8a5f3c', HOLZ_D = '#6a4a30';
const BLUME = ['#d9534f', '#f0ad4e', '#e78fb3', '#ffffff'], BLATT = '#5f8a4c', GELAENDER = '#3b3f45', STEIN = '#b9b4aa';

/** Putz: einfarbig (hält die Dateien klein) */
const putz = (c) => c;

/** Fenster in eine Wand (Front +X bei x = nx - 1): Rahmen, Glas mit Sprosse, Vorhang, Fensterbank */
function fenster(box, nx, y0, y1, z0, z1, mitVorhang = true) {
  box(nx - 2, nx - 1, y0 - 1, y1 + 1, z0 - 1, z1 + 1, WEISS);
  box(nx - 2, nx - 1, y0, y1, z0, z1, (x, y, z) => (mitVorhang && (z < z0 + 3 || z > z1 - 3) ? VORHANG : (y + z) % 9 === 0 ? GLAS_H : GLAS));
  box(nx - 1, nx - 1, y0, y1, Math.floor((z0 + z1) / 2), Math.floor((z0 + z1) / 2), WEISS);
  box(nx - 1, nx - 1, Math.floor((y0 + y1) / 2), Math.floor((y0 + y1) / 2), z0, z1, WEISS);
  box(nx - 1, nx, y0 - 2, y0 - 1, z0 - 2, z1 + 2, STEIN);
}

for (const [name, c] of Object.entries(FARBEN)) {
  // Obergeschoss: 0,2 × 3 × 2 m
  model({ id: `wohn_wand_${name}`, name: 'Wohnhaus Wand', dims: [8, 120, 80], menue: 'gebaeude',
    draw: ({ box }) => box(0, 7, 0, 119, 0, 79, putz(c)) });
  model({ id: `wohn_fenster_${name}`, name: 'Wohnhaus Fenster', dims: [9, 120, 80], menue: 'gebaeude',
    draw: ({ box }) => { box(0, 7, 0, 119, 0, 79, putz(c)); fenster(box, 8, 36, 92, 24, 55); } });
  model({ id: `wohn_blumen_${name}`, name: 'Wohnhaus Fenster mit Blumen', dims: [14, 120, 80], menue: 'gebaeude',
    draw: ({ box }) => {
      box(0, 7, 0, 119, 0, 79, putz(c)); fenster(box, 8, 36, 92, 24, 55);
      box(8, 11, 28, 32, 21, 58, HOLZ); // Blumenkasten
      for (let z = 22; z <= 57; z += 2) { box(9, 12, 33, 34 + (z % 3), z, z, BLATT); if (z % 4 === 0) box(10, 12, 35 + (z % 3), 36 + (z % 3), z, z + 1, BLUME[(z / 4) % 4]); }
    } });
  model({ id: `wohn_balkon_${name}`, name: 'Wohnhaus Balkon', dims: [32, 120, 80], menue: 'gebaeude',
    draw: ({ box }) => {
      box(0, 7, 0, 119, 0, 79, putz(c));
      box(6, 7, 4, 100, 26, 53, WEISS); box(7, 7, 6, 98, 28, 51, (x, y, z) => (z < 31 || z > 48 ? VORHANG : GLAS)); // Balkontür
      box(7, 7, 6, 98, 39, 40, WEISS);
      box(8, 31, 0, 2, 6, 73, STEIN); // Platte
      for (let z = 6; z <= 73; z += 3) box(30, 31, 3, 40, z, z, GELAENDER); // Geländer
      box(8, 31, 40, 41, 6, 6, GELAENDER); box(8, 31, 40, 41, 73, 73, GELAENDER); box(30, 31, 40, 41, 6, 73, GELAENDER);
      for (let z = 9; z < 71; z += 9) { box(26, 29, 3, 7, z, z + 3, '#b3643e'); box(27, 28, 8, 12, z + 1, z + 2, BLATT); } // Töpfe
    } });
  model({ id: `wohn_ecke_${name}`, name: 'Wohnhaus Ecke', dims: [8, 120, 8], menue: 'gebaeude',
    draw: ({ box }) => box(0, 7, 0, 119, 0, 7, shade(c, 0.94)) });
  // Erdgeschoss eines Wohnhauses: 0,2 × 4 × 2 m wie die Ladenwände
  model({ id: `wohn_eg_wand_${name}`, name: 'Wohnhaus Erdgeschoss', dims: [8, 160, 80], menue: 'gebaeude',
    draw: ({ box }) => { box(0, 7, 0, 159, 0, 79, putz(c)); box(0, 7, 0, 10, 0, 79, shade(c, 0.82)); } });
  model({ id: `wohn_eg_fenster_${name}`, name: 'Wohnhaus Erdgeschoss Fenster', dims: [9, 160, 80], menue: 'gebaeude',
    draw: ({ box }) => { box(0, 7, 0, 159, 0, 79, putz(c)); box(0, 7, 0, 10, 0, 79, shade(c, 0.82)); fenster(box, 8, 50, 110, 22, 57); } });
  model({ id: `wohn_tuer_${name}`, name: 'Haustür', dims: [16, 160, 80], menue: 'gebaeude',
    draw: ({ box }) => {
      box(0, 7, 0, 159, 0, 79, putz(c)); box(0, 7, 0, 10, 0, 79, shade(c, 0.82));
      box(6, 8, 6, 104, 22, 57, WEISS); // Türrahmen
      box(8, 8, 8, 86, 25, 54, (x, y, z) => ((z - 25) % 10 === 0 || y % 26 === 8 ? HOLZ_D : HOLZ)); // Tür
      box(8, 8, 89, 101, 25, 54, (x, y, z) => ((y + z) % 7 === 0 ? GLAS_H : GLAS)); // Oberlicht
      box(9, 9, 46, 48, 49, 51, '#c9a24a'); // Klinke
      box(9, 9, 52, 66, 60, 68, '#c9a24a'); box(9, 9, 54, 64, 61, 67, '#efe3c8'); // Klingelschild
      box(8, 15, 0, 3, 18, 61, STEIN); // Stufe
      box(8, 10, 60, 70, 10, 16, '#3b5e7a'); // Briefkasten
      box(9, 9, 106, 118, 34, 45, WEISS); box(9, 9, 108, 116, 36, 43, '#4a4a4a'); // Hausnummer
    } });
  // Giebel (Dreieck) für 6, 8 und 10 m tiefe Häuser: Neigung wie das Satteldach
  for (const d of [6, 8, 10]) {
    const nz = d * 40, ny = Math.round(nz / 2 * 0.75);
    model({ id: `giebel_${d}_${name}`, name: 'Giebel', dims: [8, ny, nz], menue: 'gebaeude',
      draw: ({ box }) => {
        for (let y = 0; y < ny; y++) { const w = Math.round((ny - y) / 0.75); box(0, 7, y, y, Math.max(0, nz / 2 - w), Math.min(nz - 1, nz / 2 + w - 1), c); }
        const y0 = Math.round(ny * 0.3); fenster(box, 8, y0, y0 + 28, nz / 2 - 10, nz / 2 + 9, false); // Dachfenster
      } });
  }
}

// Satteldach-Module (2 m entlang des Firsts, über die ganze Tiefe, 30 cm Überstand) in Rot und Anthrazit.
// Mit 10-cm-Würfeln: schräge Flächen kosten sonst sehr viel Platz in der Datei, und grob sieht es gemütlich aus.
for (const [farbe, c] of [['rot', '#b0533f'], ['grau', '#55595f']]) {
  for (const d of [6, 8, 10]) for (const kamin of [false, true]) {
    const ue = 3, nz = d * 10 + 2 * ue, first = Math.round((d * 10) / 2 * 0.75), ny = first + 3;
    model({ id: `satteldach_${d}_${farbe}${kamin ? '_kamin' : ''}`, name: 'Satteldach', dims: [20, ny, nz], size: 0.1, menue: 'gebaeude',
      draw: ({ box }) => {
        for (let z = 0; z < nz; z++) {
          const h = Math.round((nz / 2 - Math.abs(z - nz / 2 + 0.5)) * 0.75) - 1;
          const col = Math.floor(Math.abs(z - nz / 2 + 0.5)) % 2 ? shade(c, 0.88) : c; // Ziegelreihen
          box(0, 19, Math.max(0, h - 1), h, z, z, col);
        }
        box(0, 19, first - 1, first, nz / 2 - 1, nz / 2, shade(c, 0.7)); // First
        if (kamin) box(7, 8, Math.round(first * 0.55), first + 2, Math.round(nz * 0.3), Math.round(nz * 0.3) + 1, '#8c5a48'); // Schornstein
      } });
  }
}

// Gesims zwischen Laden und Wohnungen (2 m, ragt etwas vor)
model({ id: 'gesims', name: 'Gesims', dims: [10, 10, 80], menue: 'gebaeude',
  draw: ({ box }) => { box(0, 9, 0, 5, 0, 79, WEISS); box(0, 8, 6, 9, 0, 79, shade(WEISS, 0.92)); } });
