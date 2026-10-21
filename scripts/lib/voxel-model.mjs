// Baukasten für Voxel-Modelle aus Skripten (data/modelle/<id>.json, wie aus dem Voxel-Editor).
// Koordinaten in Würfeln: x = Tiefe (vorne ist +X), y = Höhe, z = Breite. Ursprung unten in der Mitte.
// Alle Grenzen sind einschließlich (box(0, 3, …) = 4 Würfel).

import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('data/modelle');

/** Farbe heller (f > 1) oder dunkler (f < 1) */
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('');
}

/** Fester Zufall aus drei Zahlen (gleiches Ergebnis bei jedem Lauf) */
export function hash(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// 3 × 5 Pixel-Schrift für Schilder
const FONT = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], E: ['111', '100', '110', '100', '111'],
  G: ['011', '100', '101', '101', '011'], L: ['100', '100', '100', '100', '111'], R: ['110', '101', '110', '101', '101'],
  N: ['101', '111', '111', '111', '101'], O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
  U: ['101', '101', '101', '101', '111'], S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
  I: ['111', '010', '010', '010', '111'], K: ['101', '110', '100', '110', '101'], W: ['101', '101', '111', '111', '101'],
  C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'], F: ['111', '100', '110', '100', '100'],
  H: ['101', '101', '111', '101', '101'], M: ['101', '111', '111', '101', '101'], Z: ['111', '001', '010', '100', '111'],
  ' ': ['000', '000', '000', '000', '000'], '!': ['010', '010', '010', '000', '010'],
};

/**
 * Ein Modell zeichnen und speichern.
 * @param {{ id: string, name: string, dims: [number, number, number], size?: number, ebene?: string, menue?: string,
 *           draw: (api: object) => void }} opts
 */
export function model({ id, name, dims, size = 0.025, ebene = 'objekt', menue = 'lager', draw }) {
  const [nx, ny, nz] = dims;
  const data = new Array(nx * ny * nz).fill(0);
  const idx = (x, y, z) => (x * ny + y) * nz + z;
  const inside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz;
  const set = (x, y, z, c) => { if (inside(x, y, z)) data[idx(x, y, z)] = c; };
  const get = (x, y, z) => (inside(x, y, z) ? data[idx(x, y, z)] : 0);
  const clear = (x, y, z) => set(x, y, z, 0);
  const range = (a, b) => { const out = []; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i); return out; };
  // Farbe als Funktion: `undefined` lässt die Zelle, wie sie ist; 0 macht sie leer
  const paint = (x, y, z, col) => { if (col !== undefined && col !== null) set(x, y, z, col); };
  const box = (x0, x1, y0, y1, z0, z1, c) => { for (const x of range(x0, x1)) for (const y of range(y0, y1)) for (const z of range(z0, z1)) paint(x, y, z, typeof c === 'function' ? c(x, y, z) : c); };
  const hole = (x0, x1, y0, y1, z0, z1) => box(x0, x1, y0, y1, z0, z1, 0);
  /** Quader mit leichtem Farbrauschen (Beton, Holz, Asphalt) – nur außen, in 5 Stufen (spart Platz in der Datei) */
  const rough = (x0, x1, y0, y1, z0, z1, c, amount = 0.06) => box(x0, x1, y0, y1, z0, z1, (x, y, z) => {
    const outside = x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1;
    return outside ? shade(c, 1 + (Math.round(hash(x, y, z) * 4) / 4 - 0.5) * 2 * amount) : c;
  });
  /** Zylinder entlang einer Achse; (a, b) = Mitte in den beiden anderen Achsen, r = Radius, von–bis entlang der Achse */
  const cyl = (axis, a, b, r, from, to, c) => {
    for (const t of range(from, to)) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      if (i * i + j * j > r * r + r * 0.6) continue;
      const col = typeof c === 'function' ? c(i, j, t) : c;
      if (axis === 'x') paint(t, a + i, b + j, col);
      else if (axis === 'y') paint(a + i, t, b + j, col);
      else paint(a + i, b + j, t, col);
    }
  };
  /** Nur die Kanten eines Quaders (Rahmen, Gestelle) */
  const frame = (x0, x1, y0, y1, z0, z1, c, t = 1) => {
    for (const [xa, xb] of [[x0, x0 + t - 1], [x1 - t + 1, x1]]) for (const [ya, yb] of [[y0, y0 + t - 1], [y1 - t + 1, y1]]) box(xa, xb, ya, yb, z0, z1, c);
    for (const [xa, xb] of [[x0, x0 + t - 1], [x1 - t + 1, x1]]) for (const [za, zb] of [[z0, z0 + t - 1], [z1 - t + 1, z1]]) box(xa, xb, y0, y1, za, zb, c);
    for (const [ya, yb] of [[y0, y0 + t - 1], [y1 - t + 1, y1]]) for (const [za, zb] of [[z0, z0 + t - 1], [z1 - t + 1, z1]]) box(x0, x1, ya, yb, za, zb, c);
  };
  /**
   * Text auf eine Fläche schreiben, die nach +X zeigt (in Ebene x), von links nach rechts gelesen.
   * zLeft = linker Rand (von vorne gesehen ist links das größere z), yTop = obere Kante. scale = Würfel je Pixel.
   */
  const text = (x, yTop, zLeft, str, c, scale = 1) => {
    let z = zLeft;
    for (const ch of str.toUpperCase()) {
      const g = FONT[ch] ?? FONT[' '];
      for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
        if (g[row][col] !== '1') continue;
        box(x, x, yTop - (row + 1) * scale + 1, yTop - row * scale, z - (col + 1) * scale + 1, z - col * scale, c);
      }
      z -= 4 * scale;
    }
  };
  /** Breite eines Textes in Würfeln */
  const textWidth = (str, scale = 1) => str.length * 4 * scale - scale;

  draw({ nx, ny, nz, set, get, clear, box, hole, rough, cyl, frame, text, textWidth, shade, hash, range });

  // Lauflängen-Code wie im Editor (VoxelModel.encodeGrid): Anzahl*Farbe, Farbe 0 = leer
  const palette = [];
  const index = new Map();
  const runs = [];
  let last = -1, count = 0;
  for (const v of data) {
    let c = 0;
    if (v) {
      if (!index.has(v)) { palette.push(v); index.set(v, palette.length); }
      c = index.get(v);
    }
    if (c === last) count++;
    else { if (count) runs.push(`${count}*${last}`); last = c; count = 1; }
  }
  if (count) runs.push(`${count}*${last}`);
  const file = { id, name, typ: 'modell', menue, preis: 0, ebene, kantenlaenge: size, groesse: dims, palette, voxel: runs.join(',') };
  fs.mkdirSync(OUT, { recursive: true });
  // Ein schon vorhandenes Vorschaubild (aus dem Editor) bleibt erhalten
  const target = path.join(OUT, `${id}.json`);
  if (fs.existsSync(target)) {
    const old = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (old.vorschau) file.vorschau = old.vorschau;
  }
  fs.writeFileSync(target, JSON.stringify(file, null, 2) + '\n');
  const filled = data.reduce((n, v) => n + (v ? 1 : 0), 0);
  console.log(`${id}: ${dims.join('×')} Würfel zu ${size * 100} cm, ${filled} gefüllt, ${palette.length} Farben`);
}
