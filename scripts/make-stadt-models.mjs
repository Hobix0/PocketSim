// Erzeugt die Voxel-Modelle für eine lebendige Stadt: Park, Spielplatz, Gärten, Bushaltestelle
// (data/modelle/<id>.json, typ "modell"). Die Spielwerte stehen in data/bau/<id>.json.
// Vorne ist +X, Ursprung unten in der Mitte. Laub und Hecken haben Farbflecken in Blöcken statt Rauschen
// je Würfel – das hält die Dateien klein (und die Ladezeit kurz).
//
// Aufruf: npm run modelle:stadt   (Baukasten: scripts/lib/voxel-model.mjs)

import { model, shade, hash } from './lib/voxel-model.mjs';

const LAUB = '#5f9e4a', LAUB_D = '#4b8340', LAUB_H = '#79b65a', LAUB_DD = '#3d6e36';
const STAMM = '#7a5a3c', STAMM_D = '#614630', HOLZ = '#c9a26b', HOLZ_D = '#a5824f', HOLZ_H = '#d8b582';
const STEIN = '#b9b3a7', STEIN_D = '#9d978b', STEIN_H = '#cfc9bd', WASSER = '#6fb3cf', WASSER_D = '#5a9cbb', WASSER_H = '#9fd1e3';
const ERDE = '#6b4f36', SAND = '#e3cf9b', SAND_D = '#cfb983', WEISS = '#eeeae0', ROT = '#c8382f', GELB = '#e6b929', BLAU = '#3f78b5';
const METALL = '#7d868d', METALL_D = '#5f676d', GRUEN = '#3f8f5a', GRUEN_UE = '#5fd08a', SCHWARZ = '#26282b';
// Glas der Bushaltestelle (wird im Spiel durchsichtig gezeichnet)
const GLAS = '#cfe6ec';
const BLUETEN = ['#e86a8a', '#f2c14e', '#ffffff', '#b07cd8', '#ef8a4c', '#e0475b'];

/** Vier Wände eines Rahmens (Beeteinfassung, Sandkasten) */
const rahmen = (box, x0, x1, y0, y1, z0, z1, t, c) => {
  box(x0, x0 + t - 1, y0, y1, z0, z1, c); box(x1 - t + 1, x1, y0, y1, z0, z1, c);
  box(x0, x1, y0, y1, z0, z0 + t - 1, c); box(x0, x1, y0, y1, z1 - t + 1, z1, c);
};

/** Laubfarbe in Flecken (Blöcke zu 3 Würfeln), oben heller */
const laub = (x, y, z, hoch = 1) => {
  const h = hash(Math.floor(x / 3), Math.floor(y / 3), Math.floor(z / 3));
  if (h > 0.82) return LAUB_H;
  if (h < 0.25) return hoch > 0.6 ? LAUB : LAUB_D;
  return hoch > 0.75 ? LAUB_H : hoch < 0.3 ? LAUB_DD : LAUB;
};

// ── Parkbaum (Linde): kräftiger Stamm, breite runde Krone aus drei Kugeln. 10-cm-Würfel, 3,6 × 7 × 3,6 m
model({
  id: 'parkbaum', name: 'Parkbaum', dims: [36, 70, 36], size: 0.1, menue: 'aussen',
  draw: ({ set, get, cyl, nx, ny, nz }) => {
    const mx = nx / 2, mz = nz / 2;
    // Wurzelansatz und Stamm, oben zwei Äste
    cyl('y', mx, mz, 3, 0, 1, STAMM_D);
    cyl('y', mx, mz, 2, 0, 30, (i, j, t) => ((i + t) % 5 === 0 ? STAMM_D : STAMM));
    for (let t = 0; t < 10; t++) { set(mx + 1 + Math.floor(t / 2), 28 + t, mz, STAMM); set(mx - 1 - Math.floor(t / 3), 28 + t, mz + 1, STAMM); }
    // Krone: drei sich überlappende Kugeln
    const kugeln = [[mx, 46, mz, 15], [mx - 6, 40, mz + 4, 10], [mx + 6, 41, mz - 5, 10], [mx + 2, 56, mz + 1, 10]];
    for (let x = 0; x < nx; x++) for (let y = 24; y < ny; y++) for (let z = 0; z < nz; z++) {
      for (const [cx, cy, cz, r] of kugeln) {
        const d = Math.hypot(x - cx, (y - cy) * 1.1, z - cz);
        // Ränder leicht ausgefranst
        if (d <= r - 1 || (d <= r && hash(x, y, z) > 0.45)) { if (!get(x, y, z) || get(x, y, z) === STAMM) set(x, y, z, laub(x, y, z, (y - 30) / 40)); break; }
      }
    }
  },
});

// ── Hecke (Liguster): 2 m lang, 0,6 m breit, 1 m hoch, oben gerade geschnitten
model({
  id: 'hecke', name: 'Hecke', dims: [12, 20, 40], size: 0.05, menue: 'aussen',
  draw: ({ box }) => {
    box(0, 11, 0, 19, 0, 39, (x, y, z) => {
      const rand = x === 0 || x === 11 || y === 19;
      if (rand && hash(x, y, z) > 0.88) return undefined; // kleine Lücken an der Oberfläche
      return y < 3 ? LAUB_DD : laub(x, y, z, y / 19);
    });
  },
});

// ── Blumenbeet: 2 × 2 m, Holzeinfassung, Erde, bunte Blumen in Tuffs
model({
  id: 'blumenbeet', name: 'Blumenbeet', dims: [40, 10, 40], size: 0.05, menue: 'aussen',
  draw: ({ box, set }) => {
    rahmen(box, 0, 39, 0, 3, 0, 39, 2, HOLZ_D);
    box(2, 37, 0, 2, 2, 37, ERDE);
    for (let x = 3; x < 37; x += 3) for (let z = 3; z < 37; z += 3) {
      const h = hash(x, 7, z);
      const hoehe = 3 + Math.floor(h * 4);
      const farbe = BLUETEN[Math.floor(hash(Math.floor(x / 9), 1, Math.floor(z / 9)) * BLUETEN.length)];
      for (let y = 3; y < 3 + hoehe; y++) set(x, y, z, LAUB_D);
      set(x, 3 + hoehe, z, farbe); set(x + 1, 2 + hoehe, z, farbe); set(x, 2 + hoehe, z + 1, farbe);
      set(x + 1, 3, z + 1, LAUB);
    }
  },
});

// ── Gartenzaun (Holzlatten, weiß): 2 m lang, 0,9 m hoch
model({
  id: 'gartenzaun', name: 'Gartenzaun', dims: [4, 19, 40], size: 0.05, menue: 'aussen',
  draw: ({ box }) => {
    for (const y of [5, 13]) box(1, 1, y, y + 1, 0, 39, shade(WEISS, 0.92));
    for (let z = 1; z < 40; z += 4) { box(2, 2, 0, 16, z, z + 1, WEISS); box(2, 2, 17, 17, z, z, WEISS); }
    for (const z of [0, 39]) box(0, 3, 0, 18, z, z, HOLZ_D);
  },
});

// ── Brunnen: runde Steinfassung (Ø 2,8 m), Wasser, Mittelsäule mit Schale und Wasserstrahl
model({
  id: 'brunnen', name: 'Brunnen', dims: [56, 40, 56], size: 0.05, menue: 'aussen',
  draw: ({ set, cyl, nx, nz }) => {
    const mx = nx / 2 - 0.5, mz = nz / 2 - 0.5;
    for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) {
      const d = Math.hypot(x - mx, z - mz);
      if (d > 27.5) continue;
      if (d > 24.5) { for (let y = 0; y <= 9; y++) set(x, y, z, y === 9 ? STEIN_H : (Math.floor(Math.atan2(z - mz, x - mx) * 8) + y) % 7 === 0 ? STEIN_D : STEIN); continue; }
      set(x, 0, z, STEIN_D);
      // Wasser mit hellen Wellenringen
      const ring = Math.floor(d) % 6;
      for (let y = 1; y <= 6; y++) set(x, y, z, y < 6 ? WASSER_D : ring === 0 ? WASSER_H : WASSER);
    }
    // Mittelsäule, Schale, kleine Krone
    cyl('y', mx, mz, 3, 0, 22, (i, j, t) => (t % 6 === 0 ? STEIN_D : STEIN));
    for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) {
      const d = Math.hypot(x - mx, z - mz);
      if (d <= 9) set(x, 23, z, d > 8 ? STEIN_H : STEIN);
      if (d <= 8 && d > 7) set(x, 24, z, STEIN_H);
      if (d <= 7) set(x, 24, z, WASSER);
    }
    cyl('y', mx, mz, 1, 24, 30, WASSER_H);
    // Strahl fällt in Bögen zurück
    for (let a = 0; a < 8; a++) {
      const w = (a / 8) * Math.PI * 2;
      for (let s = 0; s <= 8; s++) set(Math.round(mx + Math.cos(w) * s * 0.9), Math.round(31 - (s * s) / 6), Math.round(mz + Math.sin(w) * s * 0.9), WASSER_H);
    }
  },
});

// ── Schaukel: Holzgestell (2,4 m breit, 2,2 m hoch), zwei Sitze an Ketten
model({
  id: 'schaukel', name: 'Schaukel', dims: [34, 46, 50], size: 0.05, menue: 'aussen',
  draw: ({ box, set, nz }) => {
    // A-Böcke an beiden Enden
    for (const z of [1, nz - 2]) for (let y = 0; y <= 43; y++) {
      const off = Math.round((43 - y) * 0.33);
      set(16 - off, y, z, HOLZ_D); set(17 - off, y, z, HOLZ_D);
      set(16 + off, y, z, HOLZ_D); set(17 + off, y, z, HOLZ_D);
    }
    box(15, 18, 43, 45, 0, nz - 1, HOLZ);
    for (const [z0, farbe] of [[12, ROT], [33, BLAU]]) {
      for (let y = 9; y <= 42; y++) { set(16, y, z0, METALL); set(16, y, z0 + 5, METALL); }
      box(14, 19, 8, 8, z0, z0 + 5, farbe);
    }
  },
});

// ── Rutsche: Leiter hinten, Podest mit Geländer, Rutschbahn nach vorne (+X). 3,5 m lang
model({
  id: 'rutsche', name: 'Rutsche', dims: [70, 40, 20], size: 0.05, menue: 'aussen',
  draw: ({ box, set }) => {
    // Podest auf vier Pfosten
    for (const [x, z] of [[8, 3], [8, 16], [20, 3], [20, 16]]) box(x, x + 1, 0, 30, z, z + 1, HOLZ_D);
    box(8, 21, 26, 27, 3, 17, HOLZ);
    // Leiter nach hinten
    for (const z of [5, 14]) for (let y = 0; y <= 26; y++) set(Math.round(8 - (26 - y) * 0.25), y, z, HOLZ_D);
    for (let y = 3; y < 26; y += 4) box(Math.round(8 - (26 - y) * 0.25), Math.round(8 - (26 - y) * 0.25), y, y, 5, 14, HOLZ_H);
    // Geländer und Dach
    for (const z of [3, 17]) box(8, 21, 28, 34, z, z, (x, y) => (y === 34 ? HOLZ_D : x % 3 === 0 ? HOLZ : undefined));
    box(7, 22, 35, 36, 2, 18, ROT);
    // Rutschbahn (gelb) mit Seitenwangen
    for (let x = 22; x < 70; x++) {
      const y = Math.max(1, Math.round(26 - (x - 22) * 0.55));
      box(x, x, y, y, 6, 13, GELB);
      set(x, y + 1, 5, GELB); set(x, y + 1, 14, GELB);
      if (y <= 2) box(x, x, 0, y - 1, 6, 13, GELB);
    }
  },
});

// ── Sandkasten: 2 × 2 m Holzrahmen mit Sitzkante, Sand, Eimer und Schaufel
model({
  id: 'sandkasten', name: 'Sandkasten', dims: [40, 8, 40], size: 0.05, menue: 'aussen',
  draw: ({ box, cyl, set }) => {
    rahmen(box, 0, 39, 0, 4, 0, 39, 3, HOLZ);
    box(3, 36, 0, 2, 3, 36, (x, y, z) => (hash(Math.floor(x / 4), y, Math.floor(z / 4)) > 0.7 ? SAND_D : SAND));
    box(3, 36, 3, 3, 3, 36, (x, y, z) => (hash(x, 3, z) > 0.93 ? SAND_D : undefined));
    // Sandhügel, Eimer, Schaufel
    for (let x = 18; x < 28; x++) for (let z = 18; z < 28; z++) if (Math.hypot(x - 23, z - 23) < 5) set(x, 3, z, SAND_D);
    cyl('y', 10, 28, 2, 3, 6, ROT); set(10, 6, 28, undefined);
    box(28, 33, 3, 3, 10, 10, BLAU); box(26, 27, 3, 3, 9, 11, BLAU);
  },
});

// ── Picknicktisch: Tisch mit zwei angesetzten Bänken (1,8 m lang)
model({
  id: 'picknicktisch', name: 'Picknicktisch', dims: [36, 16, 38], size: 0.05, menue: 'aussen',
  draw: ({ box }) => {
    box(10, 25, 14, 15, 1, 36, (x) => (x % 3 === 0 ? HOLZ_D : HOLZ)); // Tischplatte
    for (const x0 of [0, 30]) box(x0, x0 + 5, 8, 9, 1, 36, (x) => (x % 3 === 0 ? HOLZ_D : HOLZ)); // Bänke
    // Gekreuzte Beine an beiden Enden
    for (const z of [5, 32]) for (let y = 0; y <= 13; y++) {
      const off = Math.round((13 - y) * 1.0);
      box(17 - off, 17 - off, y, y, z, z + 1, HOLZ_D); box(18 + off, 18 + off, y, y, z, z + 1, HOLZ_D);
    }
    for (const z of [5, 32]) box(0, 35, 7, 7, z, z + 1, HOLZ_D);
  },
});

// ── Bushaltestelle: schmales Wartehäuschen (1 m tief, 3 m lang) mit Glasrückwand, Dach, Bank, Fahrplan;
// Haltestellenschild (grünes H). Vorne (+X) offen zur Straße – passt an den Bordstein, ohne den Gehweg zu versperren.
model({
  id: 'bushaltestelle', name: 'Bushaltestelle', dims: [20, 60, 64], size: 0.05, menue: 'aussen',
  draw: ({ box, frame, text, nz }) => {
    // Rahmen (Pfosten), Dach
    for (const z of [0, 59]) for (const x of [1, 17]) box(x, x, 0, 48, z, z + 1, METALL_D);
    box(0, 19, 49, 51, 0, 61, METALL);
    box(0, 19, 52, 52, 1, 60, GRUEN);
    // Glasrückwand und Seitenscheiben
    box(1, 1, 4, 46, 2, 58, GLAS); frame(1, 1, 3, 47, 2, 58, METALL_D);
    for (const z of [1, 59]) box(2, 10, 4, 46, z, z, GLAS);
    // Bank und Fahrplan
    box(3, 8, 9, 10, 8, 38, HOLZ); for (const z of [9, 36]) box(4, 7, 0, 8, z, z + 1, METALL_D);
    box(2, 2, 22, 40, 44, 55, WEISS); frame(2, 2, 22, 40, 44, 55, METALL_D);
    for (let y = 25; y < 38; y += 3) box(2, 2, y, y, 46, 53, '#9aa1a6');
    // Haltestellenschild an einem Mast vorne rechts
    box(18, 19, 0, 58, nz - 2, nz - 1, METALL);
    box(18, 19, 47, 57, nz - 3, nz - 1, GELB);
    box(19, 19, 48, 56, nz - 3, nz - 1, GRUEN);
    text(19, 55, nz - 1, 'H', GELB, 1);
  },
});

// ── Wäscheleine: zwei T-Pfosten, Leinen mit bunter Wäsche (Hintergärten)
model({
  id: 'waescheleine', name: 'Wäscheleine', dims: [16, 38, 60], size: 0.05, menue: 'aussen',
  draw: ({ box, set }) => {
    for (const z of [1, 58]) { box(7, 8, 0, 36, z, z, METALL); box(1, 14, 35, 36, z, z, METALL); }
    for (const x of [2, 13]) for (let z = 2; z < 58; z++) set(x, 34 - Math.round(Math.sin(((z - 2) / 56) * Math.PI) * 2), z, '#d8d4c8');
    // Wäsche: Handtücher, Hemden, Socken
    const stuecke = [[2, 6, 12, ROT, 9], [2, 16, 26, WEISS, 12], [2, 30, 37, GELB, 7], [2, 42, 54, BLAU, 11],
      [13, 8, 18, GRUEN_UE, 10], [13, 22, 30, '#e86a8a', 6], [13, 34, 46, WEISS, 13], [13, 49, 54, '#b07cd8', 8]];
    for (const [x, z0, z1, farbe, lang] of stuecke) {
      for (let z = z0; z <= z1; z++) {
        const top = 33 - Math.round(Math.sin(((z - 2) / 56) * Math.PI) * 2);
        for (let y = top - lang; y <= top; y++) set(x, y, z, (y + z) % 7 === 0 ? shade(farbe, 0.9) : farbe);
      }
    }
  },
});

// ── Kiesweg: 2 × 2 m Platte für Parkwege (Ebene „boden“)
model({
  id: 'kiesweg', name: 'Kiesweg', dims: [40, 2, 40], size: 0.05, menue: 'aussen',
  draw: ({ box }) => {
    box(0, 39, 0, 1, 0, 39, (x, y, z) => {
      const h = hash(Math.floor(x / 2), y, Math.floor(z / 2));
      return y === 0 ? '#bfb39a' : h > 0.85 ? '#a89c84' : h < 0.15 ? '#d6ccb4' : '#c9bea5';
    });
  },
});
