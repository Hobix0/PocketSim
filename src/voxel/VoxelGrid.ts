// Würfelgitter eines Modells: dichtes 3D-Feld mit einer Farbe pro Zelle.
// Zelle (x, y, z) liegt in Modellkoordinaten bei (min + x) · kantenlaenge.
// Keine three.js-Abhängigkeit – so lässt es sich ohne Browser testen.

/** Markiert eine belegte Zelle; so ist auch Schwarz (0x000000) von "leer" unterscheidbar. */
export const FILLED = 1 << 24;

/** Bereich für Zellkoordinaten beim Sammeln: −2048 … 2047 je Achse. */
const OFF = 2048;
const SPAN = 4096;

/** Zellkoordinaten → eine Zahl (für Maps beim Sammeln). */
export function cellKey(x: number, y: number, z: number): number {
  return ((x + OFF) * SPAN + (y + OFF)) * SPAN + (z + OFF);
}

export function keyToCell(key: number): [number, number, number] {
  const z = key % SPAN;
  const rest = (key - z) / SPAN;
  const y = rest % SPAN;
  const x = (rest - y) / SPAN;
  return [x - OFF, y - OFF, z - OFF];
}

export class VoxelGrid {
  readonly data: Uint32Array;

  constructor(
    /** Kantenlänge eines Würfels in Metern */
    readonly size: number,
    /** Zellkoordinate der Ecke (0, 0, 0) des Feldes */
    readonly min: [number, number, number],
    /** Anzahl Zellen je Achse */
    readonly dims: [number, number, number],
  ) {
    this.data = new Uint32Array(dims[0] * dims[1] * dims[2]);
  }

  /** Aus gesammelten Zellen (cellKey → 0xRRGGBB) ein passend großes Feld bauen. */
  static fromCells(size: number, cells: Map<number, number>): VoxelGrid | null {
    if (cells.size === 0) return null;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const key of cells.keys()) {
      const c = keyToCell(key);
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c[i]); hi[i] = Math.max(hi[i], c[i]); }
    }
    const grid = new VoxelGrid(size, [lo[0], lo[1], lo[2]], [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1]);
    for (const [key, rgb] of cells) {
      const [x, y, z] = keyToCell(key);
      grid.data[grid.index(x - lo[0], y - lo[1], z - lo[2])] = (rgb & 0xffffff) | FILLED;
    }
    return grid;
  }

  index(x: number, y: number, z: number): number {
    return (x * this.dims[1] + y) * this.dims[2] + z;
  }

  /** Wert an einer Feldposition (0 = leer, auch außerhalb des Feldes). */
  get(x: number, y: number, z: number): number {
    const [nx, ny, nz] = this.dims;
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return 0;
    return this.data[this.index(x, y, z)];
  }

  /**
   * Gröbere Fassung für größere Entfernung: je faktor³ Würfel werden zu einem.
   * Belegt, sobald einer der Würfel belegt ist; Farbe = die häufigste darunter.
   */
  downsample(faktor: number): VoxelGrid {
    if (faktor <= 1) return this;
    const lo = this.min.map((m) => Math.floor(m / faktor)) as [number, number, number];
    const hi = this.min.map((m, i) => Math.floor((m + this.dims[i] - 1) / faktor));
    const out = new VoxelGrid(this.size * faktor, lo, [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1]);
    const counts = new Map<number, number>();
    for (let cx = 0; cx < out.dims[0]; cx++) for (let cy = 0; cy < out.dims[1]; cy++) for (let cz = 0; cz < out.dims[2]; cz++) {
      counts.clear();
      let best = 0, bestN = 0;
      const x0 = (lo[0] + cx) * faktor - this.min[0], y0 = (lo[1] + cy) * faktor - this.min[1], z0 = (lo[2] + cz) * faktor - this.min[2];
      for (let x = x0; x < x0 + faktor; x++) for (let y = y0; y < y0 + faktor; y++) for (let z = z0; z < z0 + faktor; z++) {
        const v = this.get(x, y, z);
        if (v === 0) continue;
        const n = (counts.get(v) ?? 0) + 1;
        counts.set(v, n);
        if (n > bestN) { best = v; bestN = n; }
      }
      if (best) out.data[out.index(cx, cy, cz)] = best;
    }
    return out;
  }

  /** Belegte Zellen zählen. */
  get count(): number {
    let n = 0;
    for (const v of this.data) if (v !== 0) n++;
    return n;
  }
}
