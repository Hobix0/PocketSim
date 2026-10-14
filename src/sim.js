// Wirtschaftssimulation des Gebäudes – ohne Grafik, damit sie auch unter Node läuft.
// Koordinaten: jede Ladenetage ist ein Raster W × D (1 Feld = 1 m). x läuft nach rechts,
// z nach vorn zur Straße. Links davon (x < 0) liegt das Treppenhaus, vorne (z ≥ D) die Straße.
import {
  CONFIG, FLOORS, SHOP_TYPES, FURNITURE, PRODUCTS, SUPPLIES, DEMAND_CURVE, WEATHER, REGULARS,
  PET_NAMES, PET_COLORS, QUESTS, DESIGN_COST, PAINT, WALL_PATTERNS, FLOOR_MATS, FACADES, AWNINGS, FRAMES,
  productsFor, suppliesFor, defaultDesign, defaultExterior, calendar,
} from './data.js';
import { findPath, reachable } from './path.js';

export const SAVE_VERSION = 2;
const { W, D, floorHeight: H } = CONFIG;
const CORE = CONFIG.core;
const LAYERS = ['floor', 'rug', 'wall', 'ceil'];

export function makeRng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.state = () => a;
  f.set = (s) => { a = s >>> 0; };
  return f;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round2 = (v) => Math.round(v * 100) / 100;

// Größe auf dem Raster nach Drehung
export const footprint = (type, rot) => {
  const f = FURNITURE[type];
  return rot % 2 ? [f.d, f.w] : [f.w, f.d];
};

// Blickrichtung (Vorderseite) eines gedrehten Möbels als Rastervektor
export const facing = (rot) => [[0, 1], [1, 0], [0, -1], [-1, 0]][rot & 3];

// Wandobjekte: an welcher Wand hängt ein Objekt mit dieser Drehung?
export const wallSideOf = (rot) => ['back', 'left', 'front', 'right'][rot & 3];

// Punkt im unrotierten Möbel (lx, lz in Metern ab Ecke) → Etagenkoordinaten
export function localToFloor(item, lx, lz) {
  const def = FURNITURE[item.type];
  const [w, d] = footprint(item.type, item.rot);
  const cx = lx - def.w / 2, cz = lz - def.d / 2;
  const [s, c] = facing(item.rot);
  return [item.x + w / 2 + cx * c + cz * s, item.z + d / 2 - cx * s + cz * c];
}

// Liegt ein Wandfeld vor einem Fenster? (Rückwand läuft entlang x, rechte Wand rückwärts entlang z)
function onWindow(rot, x, z) {
  const hit = (spans, a) => spans.some(([u0, u1]) => a < u1 && a + 1 > u0);
  if (rot === 0) return hit(CONFIG.windows.back, x);
  if (rot === 3) return hit(CONFIG.windows.right.map(([u0, u1]) => [D + 0.2 - u1, D + 0.2 - u0]), z);
  return false;
}

// Eingangsfeld eines Ladens: im EG die Ladentür, oben die Tür zum Treppenhaus
export const entryCell = (f) => (f === 0 ? [CONFIG.doorX, D - 1] : [0, CORE.shopDoorZ]);

// Felder, auf die nichts Blockierendes gebaut werden darf (Laufweg an der Tür)
export function isReserved(f, x, z) {
  const [ex, ez] = entryCell(f);
  if (f === 0) return x === ex && (z === ez || z === ez - 1);
  return z === ez && (x === ex || x === ex + 1);
}

// Wegpunkte durch das Treppenhaus: Etage k → k+1 (Podesttreppe)
function flight(k) {
  const b = k * H;
  return [
    { f: k, x: -2.45, z: 6.3, y: b, core: true },
    { f: k, x: -2.45, z: 5.5, y: b, core: true },
    { f: k, x: -2.45, z: 1.5, y: b + H / 2, core: true, stair: true },
    { f: k, x: -2.45, z: 0.75, y: b + H / 2, core: true },
    { f: k + 1, x: -0.95, z: 0.75, y: b + H / 2, core: true },
    { f: k + 1, x: -0.95, z: 1.5, y: b + H / 2, core: true },
    { f: k + 1, x: -0.95, z: 5.5, y: b + H, core: true, stair: true },
    { f: k + 1, x: -0.95, z: 6.2, y: b + H, core: true },
  ];
}

// Vom Gehweg (vor der passenden Haustür) bis zum Eingangsfeld der Etage f
export function inPath(f) {
  if (f === 0) {
    const x = CONFIG.doorX + 0.5;
    return [{ f: 0, x, z: D + 0.5, y: 0 }, { f: 0, x, z: D - 0.5, y: 0 }];
  }
  const pts = [{ f: 0, x: CORE.door, z: D + 0.5, y: 0, core: true }, { f: 0, x: CORE.door, z: D - 0.8, y: 0, core: true }];
  for (let k = 0; k < f; k++) pts.push(...flight(k));
  pts.push({ f, x: -0.95, z: CORE.shopDoorZ + 0.5, y: f * H, core: true }, { f, x: 0.5, z: CORE.shopDoorZ + 0.5, y: f * H });
  return pts;
}
const outPath = (f) => inPath(f).reverse();
const doorFront = (f) => (f === 0 ? CONFIG.doorX + 0.5 : CORE.door);

const AGENT_LOOKS = {
  skin: ['#f1c9a5', '#e0ac87', '#c68863', '#8d5a3b', '#5c3a26', '#f6d7bf'],
  coat: ['#7a4a2e', '#3f5e4f', '#8a3b32', '#c08a3e', '#3b4a63', '#6b5a4a', '#2f2f33', '#a35d3a', '#5e3d55', '#cbb89a'],
  pants: ['#2b2f3a', '#3b4a63', '#5a4a3a', '#1e1e22', '#6b6f78', '#7a6650'],
  hair: ['#1f1712', '#3b2a1d', '#6d4a2c', '#b98a4b', '#d8c39a', '#8a8a8a', '#a3402b'],
  scarf: ['#c8952f', '#b8483d', '#e8e1d5', '#3f6e8c', '#d27537', '#365648', '#7a2e35'],
};

export class Game {
  constructor(seed = 1) {
    this.newGame(seed);
  }

  newGame(seed = (Math.random() * 1e9) | 0) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.money = CONFIG.startMoney;
    this.day = 1;
    this.clock = CONFIG.dayStart;
    this.rep = CONFIG.startRep;
    this.nextId = 1;
    this.time = 0;
    this.floors = FLOORS.map((_, i) => ({ index: i, unlocked: i === 0, shop: 0, design: defaultDesign() }));
    this.exterior = defaultExterior();
    this.items = new Map();
    this.shops = new Map();
    this.agents = new Map();
    this.history = [];
    this.fx = [];
    this.layoutVersion = 0;
    this.designVersion = 0;
    this.autoAcc = 0;
    this.seatTaken = new Map();
    this.regState = new Map();
    this.regulars = REGULARS.map((name, i) => ({ i, name, look: this.newLook(), fav: null, visits: 0, hearts: 0, lastDay: 0, met: false }));
    this.weather = this.rollWeather(true);
    this.forecast = this.rollWeather();
    this.resetToday();
    this.rebuild();
    const shop = this.openShop(0, 'cafe');
    // Startausstattung im Lager
    shop.stock.bohnen = 100; shop.stock.milch = 40; shop.stock.tee = 50;
    this.newQuest();
  }

  resetToday() {
    this.today = {
      revenue: 0, supplies: 0, build: 0, served: 0, entered: 0, tips: 0, quest: 0,
      lostPrice: 0, lostWait: 0, lostFull: 0, lostStock: 0, sat80: 0, sits: 0,
      satSum: 0, satN: 0, sold: {}, repStart: this.rep, petted: [],
    };
  }

  rollWeather(first = false) {
    if (first) return { type: 'sonne', temp: 15 };
    const entries = Object.entries(WEATHER);
    let r = this.rng() * entries.reduce((s, [, w]) => s + w.w, 0);
    let type = entries[0][0];
    for (const [id, w] of entries) { r -= w.w; if (r <= 0) { type = id; break; } }
    const [lo, hi] = WEATHER[type].temp;
    // Je später im Herbst, desto kühler
    const cool = Math.min(6, Math.floor(this.day / 10));
    return { type, temp: Math.round(lo + this.rng() * (hi - lo)) - cool };
  }

  // ───────────────────────── Raster & abgeleitete Daten ─────────────────────────

  rebuild() {
    this.grid = this.floors.map(() => Object.fromEntries(LAYERS.map((l) => [l, new Int32Array(W * D)])));
    for (const it of this.items.values()) this.stamp(it, it.id);
    this.refresh();
  }

  cellsOf(type, x, z, rot) {
    const [w, d] = footprint(type, rot);
    const out = [];
    for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) out.push([x + i, z + k]);
    return out;
  }

  stamp(it, val) {
    const layer = this.grid[it.floor][FURNITURE[it.type].layer];
    for (const [x, z] of this.cellsOf(it.type, it.x, it.z, it.rot)) layer[z * W + x] = val;
  }

  blockedFn(f) {
    const occ = this.grid[f].floor;
    return (x, z) => occ[z * W + x] !== 0;
  }

  itemAt(f, x, z, layers = LAYERS) {
    if (x < 0 || z < 0 || x >= W || z >= D) return null;
    for (const l of layers) {
      const id = this.grid[f][l][z * W + x];
      if (id) return this.items.get(id);
    }
    return null;
  }

  // Theken, Sitzplätze, Ausstattung und Ambiente neu berechnen (nach jeder Umbaumaßnahme)
  refresh() {
    this.layoutVersion++;
    this.derived = this.floors.map((fl, f) => {
      const items = [...this.items.values()].filter((it) => it.floor === f);
      const registers = items.filter((it) => FURNITURE[it.type].register).sort((a, b) => a.id - b.id).map((it) => {
        let st = this.regState.get(it.id);
        if (!st) { st = { id: it.id, queue: [], serving: 0, timer: 0 }; this.regState.set(it.id, st); }
        const spot = localToFloor(it, 0.5, 2.5).map(Math.floor);
        st.item = it;
        st.spot = spot;
        st.queueSpots = this.queueSpots(f, spot, facing(it.rot));
        return st;
      });
      const seats = [];
      for (const it of items) {
        const def = FURNITURE[it.type];
        if (def.seat === 'chair') {
          const [s, c] = facing(it.rot);
          for (const [dx, dz] of [[s, c], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const t = this.itemAt(f, it.x + dx, it.z + dz, ['floor']);
            if (!t || !FURNITURE[t.type].table || !!FURNITURE[t.type].tall !== !!def.needsTall) continue;
            seats.push({
              id: `${it.id}:0`, item: it.id, floor: f, cell: [it.x, it.z], h: def.needsTall ? 0.74 : 0.47,
              x: it.x + 0.5 - dx * 0.08, z: it.z + 0.5 - dz * 0.08, yaw: Math.atan2(dx, dz),
            });
            break;
          }
        } else if (def.seat === 'free') {
          const yaw = it.rot * Math.PI / 2;
          for (let k = 0; k < def.w; k++) {
            const [x, z] = localToFloor(it, k + 0.5, def.low ? 0.5 : 0.45);
            seats.push({ id: `${it.id}:${k}`, item: it.id, floor: f, cell: [Math.floor(x), Math.floor(z)], x, z, yaw, h: def.low ? 0.16 : 0.47 });
          }
        }
      }
      const machines = items.filter((it) => FURNITURE[it.type].machine);
      const displays = items.filter((it) => FURNITURE[it.type].display);
      const decor = items.reduce((sum, it) => sum + (FURNITURE[it.type].decor || 0), 0);
      const variety = new Set(items.filter((it) => FURNITURE[it.type].decor).map((it) => it.type)).size;
      const ds = fl.design;
      const custom = Object.values(ds.walls).filter((w) => w.pattern !== 'glatt' || w.color !== 'creme').length;
      const designBonus = Math.min(8, custom * 1.5 + (ds.floor !== 'eiche' ? 2 : 0));
      const appeal = Math.round(Math.min(100, clamp(decor * 1.2, 0, 55) + clamp(seats.length * 2, 0, 25) + clamp(variety * 1.2, 0, 12) + designBonus));
      return { registers, seats, machines, displays, decor, variety, appeal };
    });
    // Sitzplätze, die es nicht mehr gibt, freigeben
    const valid = new Set(this.derived.flatMap((d) => d.seats.map((s) => s.id)));
    for (const [sid, aid] of [...this.seatTaken]) {
      if (!valid.has(sid)) {
        this.seatTaken.delete(sid);
        const a = this.agents.get(aid);
        if (a) { a.seat = null; this.leave(a); }
      }
    }
    // Entfernte Theken: Warteschlangen auflösen
    const regIds = new Set(this.derived.flatMap((d) => d.registers.map((r) => r.id)));
    for (const [id, st] of [...this.regState]) {
      if (regIds.has(id)) continue;
      this.regState.delete(id);
      for (const aid of st.queue) {
        const a = this.agents.get(aid);
        if (a) { a.register = 0; a.sat -= 20; this.leave(a); }
      }
    }
    for (const r of this.derived.flatMap((d) => d.registers)) this.requeue(r);
    this.syncPets();
    // Laufende Gäste neu routen, falls ihr Weg verbaut wurde
    for (const a of this.agents.values()) {
      if (!a.route.length || a.x < 0 || a.z >= D) continue;
      if (a.kind === 'pet') { if (a.goal) this.petRoute(a, a.goal); continue; }
      if (a.state === 'leaving') this.exitRoute(a);
      else if (a.goal) this.routeTo(a, a.goal);
    }
  }

  // Warteschlange: gerade Linie vor der Theke, biegt an Hindernissen ab
  queueSpots(f, spot, dir) {
    const blocked = this.blockedFn(f);
    const ok = (x, z) => x >= 0 && z >= 0 && x < W && z < D && !blocked(x, z) && !isReserved(f, x, z);
    if (!ok(spot[0], spot[1])) return [];
    const spots = [spot];
    const used = new Set([spot[1] * W + spot[0]]);
    let [x, z] = spot, [dx, dz] = dir;
    for (let k = 0; k < 7; k++) {
      let moved = false;
      for (const [cx, cz] of [[dx, dz], [-dz, dx], [dz, -dx]]) {
        const nx = x + cx, nz = z + cz;
        if (!ok(nx, nz) || used.has(nz * W + nx)) continue;
        x = nx; z = nz; dx = cx; dz = cz;
        used.add(nz * W + nx);
        spots.push([nx, nz]);
        moved = true;
        break;
      }
      if (!moved) break;
    }
    return spots;
  }

  // ───────────────────────── Bauen ─────────────────────────

  // Für Wandobjekte: passende Drehung je nach nächster Wand (vorne sind Schaufenster)
  wallRotFor(type, x, z) {
    const d = [[z, 0], [x, 1], [W - 1 - x, 3]].sort((a, b) => a[0] - b[0]);
    return d[0][1];
  }

  canPlace(type, f, x, z, rot, ignoreId = 0) {
    const def = FURNITURE[type];
    const fl = this.floors[f];
    if (!def || !fl) return { ok: false, reason: 'Unbekannt' };
    if (!fl.unlocked) return { ok: false, reason: 'Etage noch nicht angemietet' };
    const shop = this.shops.get(fl.shop);
    if (!shop) return { ok: false, reason: 'Erst einen Laden auf dieser Etage eröffnen' };
    if (def.shops !== '*' && !def.shops.includes(shop.type)) return { ok: false, reason: `Passt nicht in ${SHOP_TYPES[shop.type].name}` };
    const layer = this.grid[f][def.layer];
    const cells = this.cellsOf(type, x, z, rot);
    const [fx, fz] = facing(rot);
    for (const [cx, cz] of cells) {
      if (cx < 0 || cz < 0 || cx >= W || cz >= D) return { ok: false, reason: 'Außerhalb der Etage' };
      if (def.layer === 'floor' && isReserved(f, cx, cz)) return { ok: false, reason: 'Laufweg an der Tür muss frei bleiben' };
      const o = layer[cz * W + cx];
      if (o && o !== ignoreId) return { ok: false, reason: 'Platz belegt' };
      if (def.layer === 'wall') {
        const bx = cx - fx, bz = cz - fz;
        if (bx >= 0 && bz >= 0 && bx < W && bz < D) return { ok: false, reason: 'Muss an eine Wand' };
        if ((rot & 3) === 2) return { ok: false, reason: 'Vorne sind Fenster' };
        if (f > 0 && (rot & 3) === 1 && cz === CORE.shopDoorZ) return { ok: false, reason: 'Hier ist die Tür' };
        if (onWindow(rot & 3, cx, cz)) return { ok: false, reason: 'Hier ist ein Fenster' };
      }
    }
    if (def.layer !== 'floor') return { ok: true };

    // Probehalber eintragen und Erreichbarkeit prüfen
    const occ = this.grid[f].floor;
    const backup = cells.map(([cx, cz]) => occ[cz * W + cx]);
    const ig = ignoreId ? this.items.get(ignoreId) : null;
    const ignored = ig ? this.cellsOf(ig.type, ig.x, ig.z, ig.rot) : [];
    for (const [cx, cz] of ignored) occ[cz * W + cx] = 0;
    for (const [cx, cz] of cells) occ[cz * W + cx] = -1;
    let reason = '';
    try {
      const blocked = this.blockedFn(f);
      const entry = entryCell(f);
      const reach = reachable(W, D, blocked, entry[0], entry[1]);
      const regs = [...this.items.values()].filter((it) => it.floor === f && it.id !== ignoreId && FURNITURE[it.type].register);
      if (def.register) regs.push({ type, x, z, rot, floor: f });
      for (const r of regs) {
        const [nx, nz] = localToFloor(r, 0.5, 2.5).map(Math.floor);
        if (nx < 0 || nz < 0 || nx >= W || nz >= D || blocked(nx, nz)) { reason = 'Vor der Theke muss Platz für Gäste sein'; break; }
        if (!reach.has(nz * W + nx)) { reason = 'Theke wäre vom Eingang nicht erreichbar'; break; }
      }
    } finally {
      cells.forEach(([cx, cz], i) => { occ[cz * W + cx] = backup[i]; });
      for (const [cx, cz] of ignored) occ[cz * W + cx] = ignoreId;
    }
    return reason ? { ok: false, reason } : { ok: true };
  }

  place(type, f, x, z, rot = 0, v = 0, free = false) {
    const def = FURNITURE[type];
    const check = this.canPlace(type, f, x, z, rot);
    if (!check.ok) return { ok: false, reason: check.reason };
    if (!free && this.money < def.cost) return { ok: false, reason: 'Nicht genug Geld' };
    if (!free) { this.money -= def.cost; this.today.build += def.cost; }
    const it = { id: this.nextId++, type, floor: f, x, z, rot: rot & 3, v: clamp(v | 0, 0, (def.v?.length || 1) - 1) };
    if (def.pet) {
      const used = new Set([...this.items.values()].map((i) => i.petName));
      it.petName = PET_NAMES.find((n) => !used.has(n)) || PET_NAMES[Math.floor(this.rng() * PET_NAMES.length)];
      it.petColor = PET_COLORS[Math.floor(this.rng() * PET_COLORS.length)];
    }
    this.items.set(it.id, it);
    this.stamp(it, it.id);
    this.refresh();
    if (def.pet) this.fx.push({ kind: 'toast', text: `${it.petName} ist eingezogen! 🐈`, tone: 'good' });
    return { ok: true, item: it };
  }

  move(id, x, z, rot) {
    const it = this.items.get(id);
    if (!it) return { ok: false, reason: 'Unbekannt' };
    const check = this.canPlace(it.type, it.floor, x, z, rot, id);
    if (!check.ok) return check;
    this.stamp(it, 0);
    Object.assign(it, { x, z, rot: rot & 3 });
    this.stamp(it, id);
    this.refresh();
    return { ok: true, item: it };
  }

  setVariant(id, v) {
    const it = this.items.get(id);
    if (!it) return;
    it.v = clamp(v | 0, 0, (FURNITURE[it.type].v?.length || 1) - 1);
    this.layoutVersion++;
  }

  remove(id, refund = true) {
    const it = this.items.get(id);
    if (!it) return 0;
    this.stamp(it, 0);
    this.items.delete(id);
    const back = refund ? Math.round(FURNITURE[it.type].cost * CONFIG.sellRefund) : 0;
    this.money += back;
    this.refresh();
    return back;
  }

  // ───────────────────────── Gestalten ─────────────────────────

  pay(cost) {
    if (this.money < cost) return false;
    this.money = round2(this.money - cost);
    this.today.build += cost;
    return true;
  }

  // patch: { color?, pattern? }, side: 'back' | 'left' | 'right' | 'front' | 'all'
  paintWalls(f, side, patch) {
    const fl = this.floors[f];
    if (!fl?.unlocked) return { ok: false, reason: 'Etage noch nicht angemietet' };
    if (patch.color && !PAINT.some((p) => p.id === patch.color)) return { ok: false, reason: 'Unbekannte Farbe' };
    if (patch.pattern && !WALL_PATTERNS.some((p) => p.id === patch.pattern)) return { ok: false, reason: 'Unbekanntes Muster' };
    const sides = side === 'all' ? ['back', 'left', 'right', 'front'] : [side];
    const change = sides.filter((s) => Object.entries(patch).some(([k, v]) => fl.design.walls[s][k] !== v));
    if (!change.length) return { ok: true, cost: 0 };
    const cost = change.length * DESIGN_COST.wall;
    if (!this.pay(cost)) return { ok: false, reason: 'Nicht genug Geld' };
    for (const s of change) Object.assign(fl.design.walls[s], patch);
    this.designChanged();
    return { ok: true, cost };
  }

  setWainscot(f, patch) {
    const fl = this.floors[f];
    if (!fl?.unlocked) return { ok: false, reason: 'Etage noch nicht angemietet' };
    if (!Object.entries(patch).some(([k, v]) => fl.design.wainscot[k] !== v)) return { ok: true, cost: 0 };
    if (!this.pay(DESIGN_COST.wainscot)) return { ok: false, reason: 'Nicht genug Geld' };
    Object.assign(fl.design.wainscot, patch);
    this.designChanged();
    return { ok: true, cost: DESIGN_COST.wainscot };
  }

  setFloorMat(f, id) {
    const fl = this.floors[f];
    if (!fl?.unlocked) return { ok: false, reason: 'Etage noch nicht angemietet' };
    if (!FLOOR_MATS.some((m) => m.id === id)) return { ok: false, reason: 'Unbekannter Boden' };
    if (fl.design.floor === id) return { ok: true, cost: 0 };
    if (!this.pay(DESIGN_COST.floor)) return { ok: false, reason: 'Nicht genug Geld' };
    fl.design.floor = id;
    this.designChanged();
    return { ok: true, cost: DESIGN_COST.floor };
  }

  setCeiling(f, color) {
    const fl = this.floors[f];
    if (!fl?.unlocked) return { ok: false, reason: 'Etage noch nicht angemietet' };
    if (fl.design.ceiling === color) return { ok: true, cost: 0 };
    if (!this.pay(DESIGN_COST.ceiling)) return { ok: false, reason: 'Nicht genug Geld' };
    fl.design.ceiling = color;
    this.designChanged();
    return { ok: true, cost: DESIGN_COST.ceiling };
  }

  setExterior(key, value) {
    const lists = { facade: FACADES, awning: AWNINGS, sign: PAINT, frames: FRAMES };
    if (!lists[key]?.some((o) => o.id === value)) return { ok: false, reason: 'Unbekannt' };
    if (this.exterior[key] === value) return { ok: true, cost: 0 };
    if (!this.pay(DESIGN_COST[key])) return { ok: false, reason: 'Nicht genug Geld' };
    this.exterior[key] = value;
    this.designChanged();
    return { ok: true, cost: DESIGN_COST[key] };
  }

  setApron(shopId, color) {
    const s = this.shops.get(shopId);
    if (!s || !PAINT.some((p) => p.id === color)) return;
    s.apron = color;
    this.designVersion++;
  }

  designChanged() {
    this.designVersion++;
    this.refresh();
  }

  // ───────────────────────── Etagen & Läden ─────────────────────────

  canUnlock(f) {
    const fl = this.floors[f];
    if (!fl || fl.unlocked) return { ok: false, reason: 'Schon angemietet' };
    if (!this.floors[f - 1].unlocked) return { ok: false, reason: 'Erst die Etage darunter anmieten' };
    if (this.money < FLOORS[f].unlockCost) return { ok: false, reason: 'Nicht genug Geld' };
    return { ok: true };
  }

  unlockFloor(f) {
    const c = this.canUnlock(f);
    if (!c.ok) return c;
    this.money -= FLOORS[f].unlockCost;
    this.today.build += FLOORS[f].unlockCost;
    this.floors[f].unlocked = true;
    this.designChanged();
    return { ok: true };
  }

  openShop(f, type, name) {
    const fl = this.floors[f];
    const st = SHOP_TYPES[type];
    if (!fl || !fl.unlocked || fl.shop || !st || !st.available) return null;
    const shop = {
      id: this.nextId++, type, floor: f, name: name || (f ? `${st.defaultName} ${FLOORS[f].short}` : st.defaultName),
      open: true, staff: 0, menu: {}, stock: {}, auto: {}, apron: 'tanne',
      day: { revenue: 0, served: 0, satSum: 0, satN: 0, sold: {} },
    };
    for (const p of productsFor(type)) shop.menu[p] = { price: PRODUCTS[p].price, on: true, unlocked: !PRODUCTS[p].recipe };
    for (const s of suppliesFor(type)) { shop.stock[s] = 0; shop.auto[s] = true; }
    this.shops.set(shop.id, shop);
    fl.shop = shop.id;
    this.designChanged();
    return shop;
  }

  shopOnFloor(f) { return this.shops.get(this.floors[f]?.shop) || null; }

  hire(shopId) {
    const s = this.shops.get(shopId);
    if (!s || s.staff >= CONFIG.maxStaff) return false;
    s.staff++;
    return true;
  }

  fire(shopId) {
    const s = this.shops.get(shopId);
    if (!s || s.staff <= 0) return false;
    s.staff--;
    return true;
  }

  setPrice(shopId, pid, price) {
    const s = this.shops.get(shopId);
    if (!s?.menu[pid]) return;
    s.menu[pid].price = round2(clamp(Math.round(price * 10) / 10, 0.5, 30));
  }

  toggleProduct(shopId, pid, on) {
    const s = this.shops.get(shopId);
    if (s?.menu[pid]) s.menu[pid].on = on ?? !s.menu[pid].on;
  }

  unlockRecipe(shopId, pid) {
    const s = this.shops.get(shopId);
    const p = PRODUCTS[pid];
    if (!s?.menu[pid] || s.menu[pid].unlocked) return { ok: false, reason: 'Schon auf der Karte' };
    if (!this.pay(p.recipe)) return { ok: false, reason: 'Nicht genug Geld' };
    s.menu[pid].unlocked = true;
    s.menu[pid].on = true;
    return { ok: true };
  }

  buy(shopId, sid, packs = 1, auto = false) {
    const s = this.shops.get(shopId);
    const sup = SUPPLIES[sid];
    if (!s || !sup || !(sid in s.stock)) return false;
    const cost = round2(sup.cost * packs * (auto ? 1 + CONFIG.autoFee : 1));
    if (this.money < cost) return false;
    this.money = round2(this.money - cost);
    this.today.supplies = round2(this.today.supplies + cost);
    s.stock[sid] += sup.pack * packs;
    return true;
  }

  // Ist das Produkt grundsätzlich im Angebot (Karte + Rezept + Ausstattung)?
  offerable(shop, pid) {
    const p = PRODUCTS[pid];
    const m = shop.menu[pid];
    if (!m?.on || !m.unlocked) return false;
    const d = this.derived[shop.floor];
    if (p.needs === 'machine' && !d.machines.length) return false;
    if (p.needs === 'display' && !d.displays.length) return false;
    return true;
  }

  inStock(shop, pid) {
    return Object.entries(PRODUCTS[pid].uses).every(([s, n]) => shop.stock[s] >= n);
  }

  // Beliebtheit je nach Wetter: Warmes ist an kalten Tagen gefragt
  popularity(pid) {
    const p = PRODUCTS[pid];
    return p.pop * (p.warm && this.weather.temp < 12 ? 1.6 : 1);
  }

  // Gründe, warum ein Laden (noch) nicht verkauft
  shopStatus(shop) {
    const reasons = [];
    const d = this.derived[shop.floor];
    if (!d.registers.length) reasons.push('Theke mit Kasse fehlt');
    if (!shop.staff) reasons.push('Keine Barista eingestellt');
    if (!productsFor(shop.type).some((p) => this.offerable(shop, p))) reasons.push('Siebträger oder Vitrine fehlt');
    if (!shop.open) reasons.push('Laden ist geschlossen');
    const ready = reasons.length === 0;
    const hours = this.clock >= CONFIG.openFrom && this.clock < CONFIG.openUntil;
    return { ready, serving: ready && hours, reasons, hours };
  }

  staffedRegisters(shop) {
    return this.derived[shop.floor].registers.slice(0, shop.staff);
  }

  // Arbeitsgeschwindigkeit: zusätzliche Baristas helfen an der Maschine
  serviceSpeed(shop) {
    const regs = Math.max(1, Math.min(shop.staff, this.derived[shop.floor].registers.length));
    const helpers = Math.max(0, shop.staff - regs);
    return 1.6 * (1 + 0.5 * Math.min(helpers / regs, 2));
  }

  // Positionen der Baristas für die Darstellung
  staffSpots(f) {
    const shop = this.shopOnFloor(f);
    if (!shop || !shop.staff) return [];
    const d = this.derived[f];
    const out = [];
    const regs = d.registers.slice(0, shop.staff);
    for (const r of regs) {
      const [x, z] = localToFloor(r.item, 0.5, 0.5);
      out.push({ x, z, yaw: r.item.rot * Math.PI / 2, busy: !!r.serving, role: 'kasse' });
    }
    const helpers = shop.staff - regs.length;
    for (let k = 0; k < helpers; k++) {
      const m = d.machines[k % Math.max(1, d.machines.length)];
      if (m) {
        const [x, z] = localToFloor(m, 0.5 + (k >= d.machines.length ? 0.35 : 0), 1.35);
        out.push({ x, z, yaw: m.rot * Math.PI / 2 + Math.PI, busy: true, role: 'maschine' });
      } else if (d.registers[0]) {
        const [x, z] = localToFloor(d.registers[0].item, 1.5, 0.5);
        out.push({ x, z, yaw: d.registers[0].item.rot * Math.PI / 2, busy: false, role: 'hilfe' });
      }
    }
    return out;
  }

  // ───────────────────────── Zeit ─────────────────────────

  tick(dt) {
    this.time += dt;
    this.clock += dt * CONFIG.minutesPerSecond;

    this.spawn(dt);
    for (const d of this.derived) for (const r of d.registers) this.updateRegister(r, dt);
    for (const a of [...this.agents.values()]) {
      if (a.kind === 'pet') this.updatePet(a, dt);
      else this.updateAgent(a, dt);
    }

    this.autoAcc += dt;
    if (this.autoAcc >= 1) { this.autoAcc = 0; this.autoReorder(); }

    if (this.clock >= CONFIG.openUntil) {
      const inside = [...this.agents.values()].some((a) => a.kind === 'customer');
      if (!inside || this.clock >= CONFIG.openUntil + 90) this.endDay();
      else if (this.clock >= CONFIG.openUntil + 45) {
        // Ladenschluss: wer noch wartet, geht
        for (const a of [...this.agents.values()]) if (a.kind === 'customer' && (a.state === 'queue' || a.state === 'toQueue')) this.leave(a);
      }
    }
  }

  spawn(dt) {
    const hour = Math.floor(this.clock / 60);
    const wx = WEATHER[this.weather.type];
    // Passanten auf dem Gehweg (nur Kulisse)
    const pedRate = (hour >= 7 && hour < 20 ? 0.12 : 0.03) * wx.ped;
    if (this.rng() < pedRate * dt) this.spawnPedestrian();

    const repMult = 0.3 + 1.4 * this.rep / 100;
    const weekend = calendar(this.day).weekend ? 1.25 : 1;
    for (const shop of this.shops.values()) {
      if (!this.shopStatus(shop).serving) continue;
      const appeal = this.derived[shop.floor].appeal;
      const perHour = CONFIG.baseCustomersPerHour * (DEMAND_CURVE[hour] ?? 0) * repMult * (0.6 + 0.9 * appeal / 100)
        * (shop.floor > 0 ? 0.85 : 1) * wx.demand * weekend;
      const perSecond = perHour / 60 * CONFIG.minutesPerSecond;
      let count = 0;
      for (const a of this.agents.values()) if (a.shop === shop.id) count++;
      if (count < 40 && this.rng() < perSecond * dt) this.spawnCustomer(shop);
    }
  }

  newLook() {
    const pick = (arr) => arr[Math.floor(this.rng() * arr.length)];
    return {
      skin: pick(AGENT_LOOKS.skin), shirt: pick(AGENT_LOOKS.coat), pants: pick(AGENT_LOOKS.pants),
      hair: pick(AGENT_LOOKS.hair), hairStyle: Math.floor(this.rng() * 3), height: 0.92 + this.rng() * 0.16,
      scarf: this.rng() < 0.6 ? pick(AGENT_LOOKS.scarf) : null, hat: this.rng() < 0.25 ? pick(AGENT_LOOKS.scarf) : null,
      coat: this.rng() < 0.65, umbrella: pick(['#2f5d50', '#b8483d', '#2c3a50', '#d0a03e', '#3a3a3d', '#c76f9a']),
    };
  }

  spawnPedestrian() {
    const left = this.rng() < 0.5;
    const z = D + 1.5 + this.rng() * 1.4;
    const a = {
      id: this.nextId++, kind: 'ped', floor: 0, x: left ? -12 : W + 9, z, y: 0, yaw: 0, state: 'pass',
      look: this.newLook(), speed: CONFIG.walkSpeed * (0.85 + this.rng() * 0.3),
      route: [{ f: 0, x: left ? W + 9 : -12, z: z + (this.rng() - 0.5) * 0.4, y: 0 }],
    };
    this.agents.set(a.id, a);
  }

  spawnCustomer(shop) {
    const left = this.rng() < 0.5;
    const z = D + 1.6 + this.rng() * 0.8;
    // Manchmal kommt ein Stammgast
    let reg = null;
    if (this.rng() < 0.3) {
      const present = new Set([...this.agents.values()].map((a) => a.regular));
      const pool = this.regulars.filter((r) => r.lastDay !== this.day && !present.has(r.i));
      if (pool.length) reg = pool[Math.floor(this.rng() * pool.length)];
    }
    const x0 = doorFront(shop.floor);
    const a = {
      id: this.nextId++, kind: 'customer', shop: shop.id, floor: 0, x: left ? -12 : W + 9, z, y: 0, yaw: 0,
      state: 'approach', look: reg ? reg.look : this.newLook(), speed: CONFIG.walkSpeed * (0.9 + this.rng() * 0.2),
      route: [
        { f: 0, x: x0 + (this.rng() - 0.5) * 0.6, z: D + 1.7, y: 0 },
        { f: 0, x: x0, z: D + 0.6, y: 0 },
      ],
      wants: [], sat: 72, wait: 0, patience: 55 + this.rng() * 60, timer: 0, seat: null, register: 0, qIndex: -1,
      cup: false, goal: null, done: false, paid: 0, regular: reg ? reg.i : -1,
    };
    if (reg) { reg.lastDay = this.day; a.patience += 25; }
    this.agents.set(a.id, a);
  }

  bubble(a, icon) { this.fx.push({ kind: 'bubble', agent: a.id, icon }); }

  // Gast steht vor der Tür und liest die Karte
  decide(a) {
    const shop = this.shops.get(a.shop);
    if (!shop || !this.shopStatus(shop).serving) return this.turnAway(a, '🔒');
    this.today.entered++;
    const offer = productsFor(shop.type).filter((p) => this.offerable(shop, p));
    const pick = (kind) => {
      const list = offer.filter((p) => PRODUCTS[p].kind === kind);
      if (!list.length) return null;
      const total = list.reduce((s, p) => s + this.popularity(p), 0);
      let r = this.rng() * total;
      for (const p of list) { r -= this.popularity(p); if (r <= 0) return p; }
      return list[list.length - 1];
    };
    const wish = [];
    const reg = this.regulars[a.regular];
    if (reg?.fav && offer.includes(reg.fav) && this.rng() < 0.7) wish.push(reg.fav);
    else if (this.rng() < 0.88) { const p = pick('drink'); if (p) wish.push(p); }
    if (this.rng() < 0.42) { const p = pick('snack'); if (p && !wish.includes(p)) wish.push(p); }
    // Wer nichts Passendes findet, nimmt irgendetwas von der Karte
    if (!wish.length) { const p = pick('drink') || pick('snack'); if (p) wish.push(p); }
    const willing = 0.85 + this.rng() * 0.55 + (this.rep - 50) / 500 + (reg ? reg.hearts * 0.03 : 0);
    a.wants = wish.filter((p) => shop.menu[p].price <= PRODUCTS[p].fair * willing);
    if (reg && !reg.fav && wish.length) reg.fav = wish[0];
    if (!a.wants.length) {
      this.today.lostPrice++;
      a.sat = 30;
      return this.turnAway(a, '💸');
    }
    if (a.wants.length < wish.length) a.sat -= 8;

    // Kürzeste Schlange an einer besetzten Kasse
    const regs = this.staffedRegisters(shop).filter((r) => r.queueSpots.length);
    regs.sort((r1, r2) => r1.queue.length - r2.queue.length);
    const r = regs[0];
    if (!r || r.queue.length >= r.queueSpots.length) {
      this.today.lostFull++;
      a.sat = 35;
      return this.turnAway(a, '😤');
    }
    if (reg && !reg.met) {
      reg.met = true;
      this.fx.push({ kind: 'toast', text: `Neuer Stammgast: ${reg.name}`, tone: 'good' });
    }
    r.queue.push(a.id);
    a.register = r.id;
    a.qIndex = r.queue.length - 1;
    a.state = 'toQueue';
    const spot = r.queueSpots[Math.min(a.qIndex, r.queueSpots.length - 1)];
    this.routeTo(a, { f: shop.floor, x: spot[0], z: spot[1] });
  }

  turnAway(a, icon) {
    if (icon) this.bubble(a, icon);
    this.finish(a);
    a.state = 'exit';
    a.goal = null;
    const left = a.x < CONFIG.doorX - 3;
    a.route = [{ f: 0, x: a.x, z: D + 1.8, y: 0 }, { f: 0, x: left ? -12 : W + 9, z: D + 1.8 + this.rng() * 0.6, y: 0 }];
  }

  // Wegeplanung zu einem Feld im eigenen Laden; goal = { f, x, z, allowBlocked, exact }
  routeTo(a, goal) {
    a.goal = goal;
    const pts = [];
    let cx, cz;
    if (a.z >= D || a.x < 0) {
      // Noch draußen oder im Treppenhaus: durch die passende Tür hinein
      pts.push(...inPath(goal.f));
      [cx, cz] = entryCell(goal.f);
    } else {
      cx = clamp(Math.floor(a.x), 0, W - 1);
      cz = clamp(Math.floor(a.z), 0, D - 1);
    }
    const y = goal.f * H;
    const path = findPath(W, D, this.blockedFn(goal.f), cx, cz, goal.x, goal.z, goal.allowBlocked)
      || [[goal.x, goal.z]]; // notfalls direkt (z. B. eingebaut) – niemand bleibt stecken
    pts.push(...path.map(([x, z]) => ({ f: goal.f, x: x + 0.5, z: z + 0.5, y })));
    if (goal.exact) pts.push({ f: goal.f, x: goal.exact[0], z: goal.exact[1], y });
    a.route = pts;
    return true;
  }

  requeue(r) {
    r.queue = r.queue.filter((id) => this.agents.has(id));
    r.queue.forEach((id, i) => {
      const a = this.agents.get(id);
      const spot = r.queueSpots[Math.min(i, r.queueSpots.length - 1)];
      if (!spot) return;
      if (a.state === 'ordering') return;
      if (a.qIndex !== i || (a.goal && (a.goal.x !== spot[0] || a.goal.z !== spot[1]))) {
        a.qIndex = i;
        a.state = 'toQueue';
        this.routeTo(a, { f: r.item.floor, x: spot[0], z: spot[1] });
      }
    });
  }

  updateRegister(r, dt) {
    const shop = this.shopOnFloor(r.item.floor);
    if (!shop) return;
    const staffed = this.staffedRegisters(shop).includes(r);
    if (r.serving) {
      if (!staffed) return; // Barista fehlt – Bestellung wartet
      r.timer -= dt * this.serviceSpeed(shop);
      if (r.timer <= 0) this.completeOrder(r, shop);
      return;
    }
    if (!staffed) return;
    const front = this.agents.get(r.queue[0]);
    if (!front || front.state !== 'queue' || front.qIndex !== 0) return;
    // Bestellung aufnehmen
    const d = this.derived[shop.floor];
    const items = [];
    for (const p of front.wants) {
      if (this.offerable(shop, p) && this.inStock(shop, p)) items.push(p);
      else { front.sat -= 14; this.today.lostStock++; }
    }
    if (front.wait > 25) front.sat -= (front.wait - 25) * 0.35;
    if (!items.length) {
      this.bubble(front, '❌');
      r.queue.shift();
      this.leave(front);
      this.requeue(r);
      return;
    }
    if (items.length < front.wants.length) this.bubble(front, '😕');
    for (const p of items) for (const [s, n] of Object.entries(PRODUCTS[p].uses)) shop.stock[s] -= n;
    const coffee = 1 / (1 + 0.35 * Math.max(0, d.machines.length - 1));
    r.timer = 2 + items.reduce((t, p) => t + PRODUCTS[p].prep * (PRODUCTS[p].kind === 'drink' ? coffee : 1), 0);
    r.serving = front.id;
    front.items = items;
    front.state = 'ordering';
  }

  completeOrder(r, shop) {
    const a = this.agents.get(r.serving);
    r.serving = 0;
    r.queue.shift();
    if (!a) { this.requeue(r); return; }
    let total = 0;
    for (const p of a.items) {
      const price = shop.menu[p].price;
      total += price;
      this.today.sold[p] = (this.today.sold[p] || 0) + 1;
      shop.day.sold[p] = (shop.day.sold[p] || 0) + 1;
      a.sat += clamp((PRODUCTS[p].fair - price) / PRODUCTS[p].fair * 40, -20, 8);
      this.questProgress('sell', 1, p);
    }
    total = round2(total);
    a.paid = total;
    this.earn(total, shop);
    this.today.served++;
    shop.day.served++;
    this.questProgress('serve', 1);
    a.cup = a.items.some((p) => PRODUCTS[p].kind === 'drink') ? 'cup' : 'bag';
    this.fx.push({ kind: 'money', floor: shop.floor, x: r.spot[0] + 0.5, z: r.spot[1] + 0.5, amount: total });

    // Trinkgeld von zufriedenen Gästen
    const d = this.derived[shop.floor];
    const reg = this.regulars[a.regular];
    if (a.sat + d.appeal * 0.12 >= 82 || (reg && reg.hearts >= 3 && a.sat >= 60)) {
      const tip = round2(Math.max(0.2, total * (0.05 + this.rng() * 0.1 + (reg ? reg.hearts * 0.02 : 0))));
      this.earn(tip, shop);
      this.today.tips = round2(this.today.tips + tip);
      this.fx.push({ kind: 'money', floor: shop.floor, x: r.spot[0] + 0.5, z: r.spot[1] + 0.5, amount: tip, tip: true });
    }
    this.requeue(r);

    // Hinsetzen – ab und zu, bei Schmuddelwetter öfter
    const chance = (SHOP_TYPES[shop.type].sitChance || 0) + d.appeal * 0.002 + WEATHER[this.weather.type].sit;
    if (this.rng() < chance) {
      const free = d.seats.filter((s) => !this.seatTaken.has(s.id));
      if (free.length) {
        const seat = free[Math.floor(this.rng() * free.length)];
        this.seatTaken.set(seat.id, a.id);
        a.seat = seat.id;
        a.state = 'toSeat';
        this.routeTo(a, { f: seat.floor, x: seat.cell[0], z: seat.cell[1], allowBlocked: true, exact: [seat.x, seat.z] });
        return;
      }
      a.sat -= 10;
      this.bubble(a, '🪑');
    } else this.bubble(a, a.sat >= 70 ? '😊' : a.sat >= 45 ? '🙂' : '😐');
    this.leave(a);
  }

  earn(amount, shop) {
    this.money = round2(this.money + amount);
    this.today.revenue = round2(this.today.revenue + amount);
    shop.day.revenue = round2(shop.day.revenue + amount);
    this.questProgress('revenue', amount);
  }

  seatById(id) {
    for (const d of this.derived) for (const s of d.seats) if (s.id === id) return s;
    return null;
  }

  leave(a) {
    if (a.state === 'exit' || a.state === 'leaving') return;
    if (a.register) {
      const r = this.regState.get(a.register);
      if (r) {
        if (r.serving === a.id) r.serving = 0;
        const i = r.queue.indexOf(a.id);
        if (i >= 0) { r.queue.splice(i, 1); this.requeue(r); }
      }
      a.register = 0;
    }
    if (a.seat) { this.seatTaken.delete(a.seat); a.seat = null; }
    this.finish(a);
    if (a.z >= D) return this.turnAway(a, '');
    a.state = 'leaving';
    a.side = this.rng() < 0.5 ? -1 : 1;
    this.exitRoute(a);
  }

  exitRoute(a) {
    const f = a.floor;
    const pts = [];
    if (a.x >= 0 && a.z < D) {
      const [ex, ez] = entryCell(f);
      const path = findPath(W, D, this.blockedFn(f), clamp(Math.floor(a.x), 0, W - 1), clamp(Math.floor(a.z), 0, D - 1), ex, ez) || [[ex, ez]];
      pts.push(...path.map(([x, z]) => ({ f, x: x + 0.5, z: z + 0.5, y: f * H })));
      pts.push(...outPath(f));
    }
    const x0 = doorFront(f);
    pts.push(
      { f: 0, x: x0 + a.side, z: D + 1.9, y: 0 },
      { f: 0, x: a.side < 0 ? -12 : W + 9, z: D + 1.7 + (a.id % 7) * 0.12, y: 0 },
    );
    a.route = pts;
    a.goal = null;
  }

  // Zufriedenheit verbuchen (einmal je Gast)
  finish(a) {
    if (a.done || a.kind !== 'customer') return;
    a.done = true;
    const shop = this.shops.get(a.shop);
    if (a.paid && shop) a.sat += this.derived[shop.floor].appeal * 0.12;
    a.sat = clamp(a.sat, 0, 100);
    this.today.satSum += a.sat;
    this.today.satN++;
    if (shop) { shop.day.satSum += a.sat; shop.day.satN++; }
    if (a.paid && a.sat >= 80) { this.today.sat80++; this.questProgress('happy', 1); }
    const weight = a.paid ? 0.035 : 0.02;
    this.rep = clamp(this.rep + (a.sat - this.rep) * weight, 0, 100);
    const reg = this.regulars[a.regular];
    if (reg) {
      reg.visits += a.paid ? 1 : 0;
      const before = Math.floor(reg.hearts);
      if (a.sat >= 72) reg.hearts = Math.min(5, reg.hearts + 0.34);
      else if (a.sat < 40) reg.hearts = Math.max(0, reg.hearts - 1);
      if (Math.floor(reg.hearts) > before) this.fx.push({ kind: 'toast', text: `${reg.name} mag dein Café ${'❤'.repeat(Math.floor(reg.hearts))}`, tone: 'good' });
    }
  }

  updateAgent(a, dt) {
    // Warten in der Schlange kostet Geduld
    if (a.kind === 'customer' && (a.state === 'queue' || a.state === 'toQueue')) {
      a.wait += dt;
      if (a.wait > a.patience) {
        a.sat -= 35;
        this.today.lostWait++;
        this.bubble(a, '😠');
        return this.leave(a);
      }
    }
    if (a.state === 'sitting') {
      a.timer -= dt;
      if (a.timer <= 0) { this.bubble(a, a.sat >= 70 ? '😊' : '🙂'); this.leave(a); }
      return;
    }
    this.walk(a, dt);
    if (!a.route.length) this.arrive(a);
  }

  walk(a, dt) {
    let step = a.speed * dt;
    while (step > 0 && a.route.length) {
      const w = a.route[0];
      const dx = w.x - a.x, dz = w.z - a.z, dy = w.y - a.y;
      const dist = Math.hypot(dx, dz, dy * 0.6);
      const sp = w.stair ? CONFIG.climbSpeed / CONFIG.walkSpeed : 1;
      if (dist <= step * sp) {
        a.x = w.x; a.z = w.z; a.y = w.y; a.floor = w.f;
        step -= dist / sp;
        a.route.shift();
      } else {
        const k = step * sp / dist;
        a.x += dx * k; a.z += dz * k; a.y += dy * k;
        if (Math.abs(dx) + Math.abs(dz) > 1e-3) a.yaw = Math.atan2(dx, dz);
        step = 0;
      }
    }
  }

  arrive(a) {
    switch (a.state) {
      case 'approach': return this.decide(a);
      case 'toQueue': {
        a.state = 'queue';
        const r = this.regState.get(a.register);
        if (r) a.yaw = Math.atan2(r.spot[0] + 0.5 - a.x, r.spot[1] + 0.5 - a.z) || a.yaw;
        if (r && a.qIndex === 0) { const [s, c] = facing(r.item.rot); a.yaw = Math.atan2(-s, -c); }
        return;
      }
      case 'toSeat': {
        const seat = this.seatById(a.seat);
        if (!seat) return this.leave(a);
        a.state = 'sitting';
        a.x = seat.x; a.z = seat.z; a.yaw = seat.yaw; a.seatH = seat.h;
        a.timer = 25 + this.rng() * 50 + (this.weather.type === 'regen' ? 20 : 0);
        a.sat += 6;
        this.today.sits++;
        this.questProgress('sit', 1);
        return;
      }
      case 'leaving': case 'exit': case 'pass':
        this.agents.delete(a.id);
        return;
      default:
    }
  }

  // ───────────────────────── Café-Katzen ─────────────────────────

  syncPets() {
    const homes = new Map([...this.items.values()].filter((it) => FURNITURE[it.type].pet).map((it) => [it.id, it]));
    for (const a of [...this.agents.values()]) {
      if (a.kind === 'pet' && !homes.has(a.home)) this.agents.delete(a.id);
    }
    const have = new Set([...this.agents.values()].filter((a) => a.kind === 'pet').map((a) => a.home));
    for (const it of homes.values()) {
      if (have.has(it.id)) continue;
      const [x, z] = localToFloor(it, 0.5, 0.5);
      this.agents.set(this.nextId, {
        id: this.nextId++, kind: 'pet', home: it.id, name: it.petName, color: it.petColor, floor: it.floor,
        x, z, y: it.floor * H, yaw: it.rot * Math.PI / 2, state: 'sleep', timer: 10 + this.rng() * 20, route: [], speed: 0.7, goal: null,
      });
    }
  }

  petRoute(a, goal) {
    a.goal = goal;
    const sx = clamp(Math.floor(a.x), 0, W - 1), sz = clamp(Math.floor(a.z), 0, D - 1);
    const path = findPath(W, D, this.blockedFn(a.floor), sx, sz, goal.x, goal.z, true) || [];
    a.route = path.map(([x, z]) => ({ f: a.floor, x: x + 0.5, z: z + 0.5, y: a.floor * H }));
    if (goal.exact) a.route.push({ f: a.floor, x: goal.exact[0], z: goal.exact[1], y: a.floor * H });
  }

  updatePet(a, dt) {
    const home = this.items.get(a.home);
    if (!home) return;
    if (a.route.length) {
      this.walk(a, dt);
      if (a.route.length) return;
      a.goal = null;
      a.timer = a.state === 'home' ? 25 + this.rng() * 40 : 4 + this.rng() * 8;
      a.state = a.state === 'home' ? 'sleep' : 'idle';
      return;
    }
    a.timer -= dt;
    if (a.timer > 0) return;
    // Nächstes Ziel: herumstreunen, zu einem Gast oder zurück ins Körbchen
    const blocked = this.blockedFn(a.floor);
    if (a.state === 'idle' && this.rng() < 0.3) {
      const [x, z] = localToFloor(home, 0.5, 0.5);
      a.state = 'home';
      this.petRoute(a, { x: home.x, z: home.z, exact: [x, z] });
      return;
    }
    const guests = [...this.agents.values()].filter((g) => g.kind === 'customer' && g.state === 'sitting' && g.floor === a.floor);
    let tx, tz;
    if (guests.length && this.rng() < 0.4) {
      const g = guests[Math.floor(this.rng() * guests.length)];
      tx = clamp(Math.floor(g.x + (this.rng() < 0.5 ? 1 : -1)), 0, W - 1);
      tz = clamp(Math.floor(g.z), 0, D - 1);
      if (blocked(tx, tz)) { tx = undefined; }
      else { g.sat += 4; this.fx.push({ kind: 'bubble', agent: g.id, icon: '😻' }); }
    }
    if (tx === undefined) {
      for (let k = 0; k < 10; k++) {
        const x = Math.floor(this.rng() * W), z = Math.floor(this.rng() * D);
        if (!blocked(x, z)) { tx = x; tz = z; break; }
      }
    }
    if (tx === undefined) { a.timer = 5; return; }
    a.state = 'walk';
    this.petRoute(a, { x: tx, z: tz });
  }

  // Katze streicheln: einmal am Tag gibt es etwas Ruf
  pet(agentId) {
    const a = this.agents.get(agentId);
    if (!a || a.kind !== 'pet') return false;
    this.bubble(a, '❤️');
    if (!this.today.petted.includes(a.home)) {
      this.today.petted.push(a.home);
      this.rep = clamp(this.rep + 1, 0, 100);
    }
    return true;
  }

  // ───────────────────────── Tagesaufgabe ─────────────────────────

  newQuest() {
    const lvl = Math.min(6, Math.floor(this.day / 4) + this.shops.size - 1);
    const prods = [];
    for (const s of this.shops.values()) for (const p of productsFor(s.type)) if (this.offerable(s, p) && !prods.includes(p)) prods.push(p);
    const pool = QUESTS.filter((q) => q.kind !== 'sell' || prods.length);
    const tpl = pool[Math.floor(this.rng() * pool.length)];
    this.quest = { kind: tpl.kind, progress: 0, done: false, ...tpl.gen(this.rng, lvl, prods) };
  }

  questProgress(kind, amount, product) {
    const q = this.quest;
    if (!q || q.done || q.kind !== kind || (q.product && q.product !== product)) return;
    q.progress = round2(q.progress + amount);
    if (q.progress >= q.goal) {
      q.done = true;
      this.money = round2(this.money + q.reward);
      this.today.quest = q.reward;
      this.fx.push({ kind: 'toast', text: `Tagesaufgabe geschafft: +${q.reward} €`, tone: 'good' });
    }
  }

  autoReorder() {
    if (this.clock < CONFIG.dayStart || this.clock >= CONFIG.openUntil - 30) return;
    for (const shop of this.shops.values()) {
      if (!this.shopStatus(shop).ready) continue;
      const used = new Set();
      for (const p of productsFor(shop.type)) if (this.offerable(shop, p)) for (const s of Object.keys(PRODUCTS[p].uses)) used.add(s);
      for (const s of used) {
        if (shop.auto[s] && shop.stock[s] < SUPPLIES[s].pack * 0.25) this.buy(shop.id, s, 1, true);
      }
    }
  }

  endDay() {
    const t = this.today;
    let staff = 0;
    for (const s of this.shops.values()) staff += s.staff;
    const wages = staff * CONFIG.wage;
    const rent = this.floors.reduce((sum, fl, i) => sum + (fl.unlocked ? FLOORS[i].rent : 0), 0);
    let spoiled = 0;
    for (const s of this.shops.values()) {
      for (const sid of Object.keys(s.stock)) {
        if (!SUPPLIES[sid].fresh) continue;
        spoiled += s.stock[sid] * SUPPLIES[sid].cost / SUPPLIES[sid].pack;
        s.stock[sid] = 0;
      }
    }
    this.money = round2(this.money - wages - rent);
    const report = {
      day: this.day, date: calendar(this.day).label, weather: { ...this.weather },
      revenue: t.revenue, tips: t.tips, quest: t.quest, supplies: t.supplies, wages, rent, spoiled: round2(spoiled), build: t.build,
      profit: round2(t.revenue + t.quest - t.supplies - wages - rent),
      served: t.served, entered: t.entered, lostPrice: t.lostPrice, lostWait: t.lostWait, lostFull: t.lostFull, lostStock: t.lostStock,
      sat: t.satN ? Math.round(t.satSum / t.satN) : null, rep: Math.round(this.rep), repDelta: Math.round(this.rep - t.repStart),
      sold: { ...t.sold }, money: this.money, questText: this.quest?.text, questDone: !!this.quest?.done,
    };
    this.history.push(report);
    if (this.history.length > 120) this.history.shift();
    // Neuer Tag: Gäste gehen nach Hause, die Katzen bleiben
    for (const a of [...this.agents.values()]) if (a.kind !== 'pet') this.agents.delete(a.id);
    this.seatTaken.clear();
    for (const r of this.regState.values()) { r.queue = []; r.serving = 0; r.timer = 0; }
    this.day++;
    this.clock = CONFIG.dayStart;
    this.weather = this.forecast;
    this.forecast = this.rollWeather();
    report.next = { ...this.weather, date: calendar(this.day).label };
    this.resetToday();
    for (const s of this.shops.values()) s.day = { revenue: 0, served: 0, satSum: 0, satN: 0, sold: {} };
    this.newQuest();
    this.fx.push({ kind: 'dayEnd', report });
    return report;
  }

  // ───────────────────────── Speichern ─────────────────────────

  serialize() {
    return {
      v: SAVE_VERSION, seed: this.seed, rng: this.rng.state(), money: this.money, day: this.day, clock: this.clock,
      rep: this.rep, nextId: this.nextId, exterior: this.exterior, weather: this.weather, forecast: this.forecast,
      quest: this.quest, regulars: this.regulars,
      floors: this.floors.map((f) => ({ unlocked: f.unlocked, shop: f.shop, design: f.design })),
      items: [...this.items.values()],
      shops: [...this.shops.values()],
      history: this.history, today: this.today,
    };
  }

  load(raw) {
    const data = migrate(raw);
    this.seed = data.seed;
    this.rng = makeRng(data.seed);
    this.rng.set(data.rng);
    this.money = data.money; this.day = data.day; this.clock = data.clock; this.rep = data.rep; this.nextId = data.nextId;
    this.floors = FLOORS.map((_, i) => ({
      index: i, unlocked: !!data.floors[i]?.unlocked, shop: data.floors[i]?.shop || 0,
      design: mergeDesign(data.floors[i]?.design),
    }));
    this.exterior = { ...defaultExterior(), ...data.exterior };
    this.items = new Map(data.items.map((it) => [it.id, { v: 0, ...it }]));
    this.shops = new Map(data.shops.map((s) => [s.id, { apron: 'tanne', ...s, menu: { ...s.menu }, stock: { ...s.stock }, auto: { ...s.auto } }]));
    // Neue Produkte/Waren späterer Versionen ergänzen
    for (const s of this.shops.values()) {
      for (const p of productsFor(s.type)) if (!s.menu[p]) s.menu[p] = { price: PRODUCTS[p].price, on: true, unlocked: !PRODUCTS[p].recipe };
      for (const sid of suppliesFor(s.type)) if (!(sid in s.stock)) { s.stock[sid] = 0; s.auto[sid] = true; }
      s.day = { revenue: 0, served: 0, satSum: 0, satN: 0, sold: {}, ...s.day };
    }
    this.regulars = REGULARS.map((name, i) => data.regulars?.[i] || { i, name, look: this.newLook(), fav: null, visits: 0, hearts: 0, lastDay: 0, met: false });
    this.weather = data.weather || { type: 'sonne', temp: 14 };
    this.forecast = data.forecast || this.rollWeather();
    this.history = data.history || [];
    this.today = { ...this.today, ...data.today, petted: data.today?.petted || [] };
    this.agents = new Map();
    this.seatTaken = new Map();
    this.regState = new Map();
    this.fx = [];
    this.time = 0;
    this.layoutVersion = 0;
    this.designVersion++;
    this.rebuild();
    this.quest = data.quest || null;
    if (!this.quest) this.newQuest();
  }
}

function mergeDesign(d) {
  const base = defaultDesign();
  if (!d) return base;
  return {
    walls: Object.fromEntries(Object.keys(base.walls).map((k) => [k, { ...base.walls[k], ...d.walls?.[k] }])),
    wainscot: { ...base.wainscot, ...d.wainscot },
    floor: d.floor || base.floor,
    ceiling: d.ceiling || base.ceiling,
  };
}

// Ältere Spielstände auf das aktuelle Format bringen
export function migrate(data) {
  if (!data || typeof data !== 'object') throw new Error('Kein Spielstand');
  if (data.v === SAVE_VERSION) return data;
  if (data.v === 1) {
    // v1: Treppe stand im Laden; oben ist jetzt die Tür zum Treppenhaus
    let refund = 0;
    const items = data.items.filter((it) => {
      if (it.floor === 0 || FURNITURE[it.type]?.layer !== 'floor') return !!FURNITURE[it.type];
      const [w, d] = footprint(it.type, it.rot);
      for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) {
        if (isReserved(it.floor, it.x + i, it.z + k)) { refund += FURNITURE[it.type].cost; return false; }
      }
      return true;
    }).map((it) => ({ ...it, v: 0 }));
    return {
      ...data, v: SAVE_VERSION, items, money: data.money + refund,
      shops: data.shops.map((s) => ({ ...s, menu: Object.fromEntries(Object.entries(s.menu).map(([k, m]) => [k, { unlocked: true, ...m }])) })),
    };
  }
  throw new Error('Spielstand passt nicht zu dieser Version');
}
