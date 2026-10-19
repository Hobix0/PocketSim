import type { World } from '../ecs/World';
import type { NavSettings } from '../content/definitions';
import { FootprintComponent, type Rect } from '../components/FootprintComponent';

// Raster für die Wegfindung von Kunden und Personal.
// Begehbar ist, was auf Boden (Fliesen, Gehweg) liegt oder eine Tür/ein Durchgang ist –
// außer dort, wo Objekte oder Wände stehen (mit etwas Abstand, damit Figuren nicht hineinragen).
// Wege werden mit A* gesucht und danach geglättet (gerade Linien, wo frei).
// Keine three.js-Abhängigkeit; neu aufgebaut wird nur, wenn sich etwas Gebautes ändert.

export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface Bounds {
  minX: number; maxX: number; minZ: number; maxZ: number;
}

const SQRT2 = Math.SQRT2;
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

export class NavGrid {
  readonly nx: number;
  readonly nz: number;
  private readonly walk: Uint8Array;
  /** Bodenhöhe je Zelle (NaN = unbekannt, z. B. in Türen) */
  private readonly height: Float32Array;
  private dirty = true;

  constructor(
    private readonly bounds: Bounds,
    private readonly settings: NavSettings,
    private readonly world: World,
  ) {
    this.nx = Math.ceil((bounds.maxX - bounds.minX) / settings.zelle);
    this.nz = Math.ceil((bounds.maxZ - bounds.minZ) / settings.zelle);
    this.walk = new Uint8Array(this.nx * this.nz);
    this.height = new Float32Array(this.nx * this.nz);
  }

  /** Beim nächsten Weg neu aufbauen (nach Bauen, Abreißen, Verschieben). */
  invalidate(): void {
    this.dirty = true;
  }

  isWalkable(x: number, z: number): boolean {
    this.ensure();
    const c = this.cell(x, z);
    return c !== null && this.walk[c] === 1;
  }

  /** Bodenhöhe an einer Stelle oder null, wenn unbekannt. */
  heightAt(x: number, z: number): number | null {
    this.ensure();
    const c = this.cell(x, z);
    if (c === null) return null;
    const h = this.height[c];
    return Number.isNaN(h) ? null : h;
  }

  /** Weg von a nach b als Punktliste (ohne Start, mit Ziel) oder null, wenn es keinen gibt. */
  findPath(a: Point, b: Point): Point[] | null {
    this.ensure();
    const start = this.nearestWalkable(a.x, a.z);
    const goal = this.nearestWalkable(b.x, b.z);
    if (start === null || goal === null) return null;
    const cells = this.astar(start, goal);
    if (!cells) return null;
    const pts = this.smooth(cells).map((c) => this.center(c));
    // Das genaue Ziel anhängen, wenn es selbst begehbar ist (sonst endet der Weg in der nächsten freien Zelle)
    const last = pts[pts.length - 1];
    if (this.isWalkable(b.x, b.z)) { last.x = b.x; last.z = b.z; }
    for (const p of pts) p.y = this.heightAt(p.x, p.z) ?? b.y;
    return pts;
  }

  // ── Aufbau ──────────────────────────────────────────────────────

  private ensure(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.walk.fill(0);
    this.height.fill(NaN);
    const blockers: Rect[] = [];
    const doors: Rect[] = [];
    for (const [, f] of this.world.query(FootprintComponent)) {
      const r = f.rect();
      if (f.ebene === 'boden') {
        const top = f.top();
        this.mark(r, 0, (c) => {
          this.walk[c] = 1;
          this.height[c] = Number.isNaN(this.height[c]) ? top : Math.max(this.height[c], top);
        });
      } else if (f.durchgang) doors.push(r);
      else if (f.ebene === 'objekt' || f.ebene === 'wand') blockers.push(r);
    }
    for (const r of doors) this.mark(r, 0, (c) => { this.walk[c] = 1; });
    // Hindernisse mit Abstand: so ragt keine Figur in Regale oder Wände
    for (const r of blockers) this.mark(r, this.settings.radius, (c) => { this.walk[c] = 0; });
  }

  /** Alle Zellen, deren Mitte im (um `grow` vergrößerten) Rechteck liegt. */
  private mark(r: Rect, grow: number, fn: (cell: number) => void): void {
    const s = this.settings.zelle, b = this.bounds;
    const x0 = Math.max(0, Math.ceil((r.minX - grow - b.minX) / s - 0.5));
    const x1 = Math.min(this.nx - 1, Math.floor((r.maxX + grow - b.minX) / s - 0.5));
    const z0 = Math.max(0, Math.ceil((r.minZ - grow - b.minZ) / s - 0.5));
    const z1 = Math.min(this.nz - 1, Math.floor((r.maxZ + grow - b.minZ) / s - 0.5));
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) fn(ix * this.nz + iz);
  }

  // ── Suche ───────────────────────────────────────────────────────

  private cell(x: number, z: number): number | null {
    const s = this.settings.zelle;
    const ix = Math.floor((x - this.bounds.minX) / s), iz = Math.floor((z - this.bounds.minZ) / s);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return null;
    return ix * this.nz + iz;
  }

  private center(c: number): Point {
    const s = this.settings.zelle;
    const ix = Math.floor(c / this.nz), iz = c % this.nz;
    return { x: this.bounds.minX + (ix + 0.5) * s, y: 0, z: this.bounds.minZ + (iz + 0.5) * s };
  }

  /** Nächste begehbare Zelle (Breitensuche, höchstens 3 m weit). */
  private nearestWalkable(x: number, z: number): number | null {
    const start = this.cell(x, z);
    if (start === null) return null;
    if (this.walk[start]) return start;
    const maxSteps = Math.ceil(3 / this.settings.zelle);
    const seen = new Set([start]);
    let frontier = [start];
    for (let step = 0; step < maxSteps && frontier.length; step++) {
      const next: number[] = [];
      for (const c of frontier) {
        const ix = Math.floor(c / this.nz), iz = c % this.nz;
        for (const [dx, dz] of DIRS) {
          const jx = ix + dx, jz = iz + dz;
          if (jx < 0 || jz < 0 || jx >= this.nx || jz >= this.nz) continue;
          const n = jx * this.nz + jz;
          if (seen.has(n)) continue;
          if (this.walk[n]) return n;
          seen.add(n);
          next.push(n);
        }
      }
      frontier = next;
    }
    return null;
  }

  private astar(start: number, goal: number): number[] | null {
    const n = this.nx * this.nz;
    const g = new Float32Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const gx = Math.floor(goal / this.nz), gz = goal % this.nz;
    const h = (c: number) => {
      const dx = Math.abs(Math.floor(c / this.nz) - gx), dz = Math.abs((c % this.nz) - gz);
      return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
    };
    const heap = new MinHeap();
    g[start] = 0;
    heap.push(start, h(start));
    while (heap.size) {
      const c = heap.pop();
      if (c === goal) break;
      if (closed[c]) continue;
      closed[c] = 1;
      const ix = Math.floor(c / this.nz), iz = c % this.nz;
      for (const [dx, dz, cost] of DIRS) {
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= this.nx || jz >= this.nz) continue;
        const m = jx * this.nz + jz;
        if (!this.walk[m] || closed[m]) continue;
        // Diagonal nur, wenn keine Ecke geschnitten wird
        if (dx && dz && (!this.walk[jx * this.nz + iz] || !this.walk[ix * this.nz + jz])) continue;
        const ng = g[c] + cost;
        if (ng < g[m]) {
          g[m] = ng;
          parent[m] = c;
          heap.push(m, ng + h(m));
        }
      }
    }
    if (start !== goal && parent[goal] === -1) return null;
    const path: number[] = [];
    for (let c = goal; c !== -1; c = parent[c]) path.push(c);
    return path.reverse();
  }

  /** Zwischenpunkte weglassen, solange die direkte Linie frei ist. */
  private smooth(cells: number[]): number[] {
    if (cells.length <= 2) return cells.length > 1 ? cells.slice(1) : cells;
    const out: number[] = [];
    let anchor = cells[0];
    for (let i = 1; i < cells.length; i++) {
      if (i === cells.length - 1 || !this.lineFree(anchor, cells[i + 1])) {
        out.push(cells[i]);
        anchor = cells[i];
      }
    }
    return out;
  }

  private lineFree(a: number, b: number): boolean {
    const ax = Math.floor(a / this.nz) + 0.5, az = (a % this.nz) + 0.5;
    const bx = Math.floor(b / this.nz) + 0.5, bz = (b % this.nz) + 0.5;
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * 3);
    // Die Hindernisse sind schon um den Figurabstand vergrößert – die Mittellinie genügt
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ix = Math.floor(ax + (bx - ax) * t), iz = Math.floor(az + (bz - az) * t);
      if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz || !this.walk[ix * this.nz + iz]) return false;
    }
    return true;
  }
}

/** Kleiner Binärheap für A* (Zelle + Priorität). */
class MinHeap {
  private readonly items: number[] = [];
  private readonly prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, p: number): void {
    const a = this.items, q = this.prio;
    a.push(item); q.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (q[parent] <= q[i]) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      [q[i], q[parent]] = [q[parent], q[i]];
      i = parent;
    }
  }

  pop(): number {
    const a = this.items, q = this.prio;
    const top = a[0];
    const lastA = a.pop()!, lastQ = q.pop()!;
    if (a.length) {
      a[0] = lastA; q[0] = lastQ;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && q[l] < q[m]) m = l;
        if (r < a.length && q[r] < q[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [q[i], q[m]] = [q[m], q[i]];
        i = m;
      }
    }
    return top;
  }
}
