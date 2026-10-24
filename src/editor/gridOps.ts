import { VoxelGrid, FILLED, CELL_MASK } from '../voxel/VoxelGrid';

// Bearbeitungs-Operationen für den Voxel-Editor – ohne Grafik, damit sie testbar sind.
// Zellen sind [x, y, z] im Gitter (Ecke bei 0, 0, 0). Gitter-Operationen geben ein neues Gitter zurück.

export type Cell = [number, number, number];

const inside = (g: VoxelGrid, c: Cell) => c.every((v, i) => v >= 0 && v < g.dims[i]);

/** Gerade Linie von a nach b (3D, Schritt für Schritt). */
export function cellsLine(a: Cell, b: Cell): Cell[] {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const n = Math.max(...d.map(Math.abs));
  const out: Cell[] = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    out.push([Math.round(a[0] + d[0] * t), Math.round(a[1] + d[1] * t), Math.round(a[2] + d[2] * t)]);
  }
  return out;
}

/** Gefülltes Rechteck zwischen a und b in der Ebene, deren Achse `axis` konstant ist (a[axis]). */
export function cellsRect(a: Cell, b: Cell, axis: number, hollow = false): Cell[] {
  const u = (axis + 1) % 3, v = (axis + 2) % 3;
  const [u0, u1] = [Math.min(a[u], b[u]), Math.max(a[u], b[u])];
  const [v0, v1] = [Math.min(a[v], b[v]), Math.max(a[v], b[v])];
  const out: Cell[] = [];
  for (let i = u0; i <= u1; i++) for (let j = v0; j <= v1; j++) {
    if (hollow && i !== u0 && i !== u1 && j !== v0 && j !== v1) continue;
    const c: Cell = [0, 0, 0];
    c[axis] = a[axis]; c[u] = i; c[v] = j;
    out.push(c);
  }
  return out;
}

/** Quadratischer Pinsel (Kantenlänge `size`) in der Ebene `axis` um die Zelle. */
export function cellsBrush(center: Cell, size: number, axis: number): Cell[] {
  if (size <= 1) return [center];
  const lo = -Math.floor((size - 1) / 2), hi = lo + size - 1;
  const a: Cell = [...center], b: Cell = [...center];
  const u = (axis + 1) % 3, v = (axis + 2) % 3;
  a[u] += lo; a[v] += lo; b[u] += hi; b[v] += hi;
  return cellsRect(a, b, axis);
}

/** Zellen gespiegelt an der Mitte (X und/oder Z), ohne Doppelte. */
export function mirrored(cells: Cell[], dims: [number, number, number], mx: boolean, mz: boolean): Cell[] {
  const key = (c: Cell) => `${c[0]},${c[1]},${c[2]}`;
  const map = new Map<string, Cell>();
  for (const c of cells) {
    const variants: Cell[] = [c];
    if (mx) variants.push([dims[0] - 1 - c[0], c[1], c[2]]);
    if (mz) for (const v of [...variants]) variants.push([v[0], v[1], dims[2] - 1 - v[2]]);
    for (const v of variants) map.set(key(v), v);
  }
  return [...map.values()];
}

/** Um 90° um die Hochachse drehen (von oben gesehen gegen den Uhrzeigersinn). */
export function rotateY(g: VoxelGrid): VoxelGrid {
  const [nx, ny, nz] = g.dims;
  const out = new VoxelGrid(g.size, [0, 0, 0], [nz, ny, nx]);
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
    const v = g.get(x, y, z);
    if (v) out.data[out.index(z, y, nx - 1 - x)] = v;
  }
  return out;
}

/** Spiegeln an einer Achse (0 = X, 2 = Z). */
export function mirror(g: VoxelGrid, axis: 0 | 2): VoxelGrid {
  const out = new VoxelGrid(g.size, [0, 0, 0], [...g.dims]);
  const [nx, ny, nz] = g.dims;
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
    const v = g.get(x, y, z);
    if (v) out.data[out.index(axis === 0 ? nx - 1 - x : x, y, axis === 2 ? nz - 1 - z : z)] = v;
  }
  return out;
}

/** Inhalt verschieben; null, wenn dabei Würfel aus dem Bauraum fallen würden. */
export function shift(g: VoxelGrid, d: Cell): VoxelGrid | null {
  const out = new VoxelGrid(g.size, [0, 0, 0], [...g.dims]);
  const [nx, ny, nz] = g.dims;
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
    const v = g.get(x, y, z);
    if (!v) continue;
    const c: Cell = [x + d[0], y + d[1], z + d[2]];
    if (!inside(out, c)) return null;
    out.data[out.index(...c)] = v;
  }
  return out;
}

/** Grenzen des Inhalts (oder null, wenn leer) */
export function bounds(g: VoxelGrid): { lo: Cell; hi: Cell } | null {
  const lo: Cell = [Infinity, Infinity, Infinity], hi: Cell = [-1, -1, -1];
  const [nx, ny, nz] = g.dims;
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
    if (!g.get(x, y, z)) continue;
    const c = [x, y, z];
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c[i]); hi[i] = Math.max(hi[i], c[i]); }
  }
  return hi[0] < 0 ? null : { lo, hi };
}

/** Auf den Inhalt zuschneiden. `keepFloor`: unten nicht abschneiden (stehende Modelle bleiben auf dem Boden). */
export function crop(g: VoxelGrid, keepFloor = true): VoxelGrid | null {
  const b = bounds(g);
  if (!b) return null;
  if (keepFloor) b.lo[1] = 0;
  const dims: [number, number, number] = [b.hi[0] - b.lo[0] + 1, b.hi[1] - b.lo[1] + 1, b.hi[2] - b.lo[2] + 1];
  const out = new VoxelGrid(g.size, [0, 0, 0], dims);
  for (let x = 0; x < dims[0]; x++) for (let y = 0; y < dims[1]; y++) for (let z = 0; z < dims[2]; z++) {
    out.data[out.index(x, y, z)] = g.get(x + b.lo[0], y + b.lo[1], z + b.lo[2]);
  }
  return out;
}

/** Bauraum ändern; der Inhalt bleibt unten in der Mitte stehen (was nicht passt, fällt weg). */
export function resize(g: VoxelGrid, dims: [number, number, number], size = g.size): VoxelGrid {
  const out = new VoxelGrid(size, [0, 0, 0], dims);
  const dx = Math.floor(dims[0] / 2) - Math.floor(g.dims[0] / 2);
  const dz = Math.floor(dims[2] / 2) - Math.floor(g.dims[2] / 2);
  for (let x = 0; x < g.dims[0]; x++) for (let y = 0; y < g.dims[1]; y++) for (let z = 0; z < g.dims[2]; z++) {
    const v = g.get(x, y, z);
    if (v) out.set(x + dx, y, z + dz, v);
  }
  return out;
}

/**
 * Zusammenhängende Würfel gleicher Farbe (6er-Nachbarschaft). `toleranz` (0–255 je Kanal) lässt auch ähnliche
 * Farben zu – beim Markieren von Teilen mit Farbrauschen (Holz, Beton) markiert ein Klick so die ganze Fläche.
 */
export function floodCells(g: VoxelGrid, start: Cell, toleranz = 0): Cell[] {
  // Gleiche Farbe zählt – egal, zu welchem Funktionsteil die Würfel gehören
  const from = g.get(...start) & CELL_MASK;
  if (!from) return [];
  const near = (v: number) => {
    if ((v & CELL_MASK) === from) return true;
    if (!toleranz || !v) return false;
    for (const sh of [16, 8, 0]) if (Math.abs(((v >> sh) & 255) - ((from >> sh) & 255)) > toleranz) return false;
    return true;
  };
  const out: Cell[] = [];
  const seen = new Set<number>();
  const stack: Cell[] = [start];
  while (stack.length) {
    const c = stack.pop()!;
    if (!inside(g, c)) continue;
    const i = g.index(...c);
    if (seen.has(i) || !near(g.data[i])) continue;
    seen.add(i);
    out.push(c);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) stack.push([c[0] + dx, c[1] + dy, c[2] + dz]);
  }
  return out;
}

/** Alle Würfel einer Farbe (für „Farbe ersetzen“) */
export function cellsOfColor(g: VoxelGrid, rgb: number): Cell[] {
  const target = (rgb & 0xffffff) | FILLED;
  const out: Cell[] = [];
  const [nx, ny, nz] = g.dims;
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) if ((g.data[g.index(x, y, z)] & CELL_MASK) === target) out.push([x, y, z]);
  return out;
}

/** Größenvorlagen für „Neu“ */
export const PRESETS: { name: string; size: number; meter: [number, number, number] }[] = [
  { name: 'Kleines Objekt (0,5 m)', size: 0.025, meter: [0.5, 0.5, 0.5] },
  { name: 'Regal (0,5 × 2 × 2 m)', size: 0.025, meter: [0.5, 2, 2] },
  { name: 'Theke / Maschine (0,8 × 1,4 × 1,4 m)', size: 0.025, meter: [0.8, 1.4, 1.4] },
  { name: 'Wandmodul (0,25 × 4 × 2 m)', size: 0.05, meter: [0.25, 4, 2] },
  { name: 'Bodenfliese (2 × 0,05 × 2 m)', size: 0.025, meter: [2, 0.05, 2] },
  { name: 'Deckenleuchte (0,4 × 0,6 × 0,4 m)', size: 0.025, meter: [0.4, 0.6, 0.4] },
  { name: 'Produkt (0,1 × 0,25 × 0,1 m, fein)', size: 0.004, meter: [0.1, 0.25, 0.1] },
];

export function presetDims(p: { size: number; meter: [number, number, number] }): [number, number, number] {
  return p.meter.map((m) => Math.max(1, Math.round(m / p.size))) as [number, number, number];
}
