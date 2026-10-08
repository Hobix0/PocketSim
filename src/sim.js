// Simulation: Welt, Gebäude, Förderbänder, Strom, Markt, Aufträge, Forschung.
import { ITEMS, ITEM_IDS, RECIPES, BUILDINGS, DEPOSITS, RESEARCH, RESEARCH_BY_ID, GOALS, EVENTS, CONFIG } from './data.js';

export const DX = [0, 1, 0, -1];
export const DZ = [-1, 0, 1, 0];
const MINABLE = new Set([2, 3, 4, 5]);
const LUMBER_RADIUS = 3;
const MAX_LEVEL = 5;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const hash = (x, z) => {
    let h = (x * 374761393 + z * 668265263 + seed * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296 * 2 - 1;
  };
  const smooth = t => t * t * (3 - 2 * t);
  const value = (x, z) => {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const fx = smooth(x - x0), fz = smooth(z - z0);
    const a = hash(x0, z0), b = hash(x0 + 1, z0), c = hash(x0, z0 + 1), d = hash(x0 + 1, z0 + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
  return (x, z) => value(x, z) * 0.55 + value(x * 2.1, z * 2.1) * 0.3 + value(x * 4.3, z * 4.3) * 0.15;
}

export const levelMul = lvl => 1 + 0.35 * (lvl - 1);
export const upgradeCost = e => Math.round(BUILDINGS[e.type].cost * 0.6 * e.level);

export class Game {
  constructor() { this.listeners = {}; }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { (this.listeners[ev] || []).forEach(fn => fn(data)); }
  toast(text, kind = 'info') { this.emit('toast', { text, kind }); }

  // ───────────────────────── Neues Spiel / Weltgenerierung
  newGame(seed = Math.floor(Math.random() * 1e9)) {
    this.seed = seed;
    this.W = this.H = CONFIG.mapSize;
    const N = this.W * this.H;
    this.terrain = new Uint8Array(N);
    this.deposit = new Uint8Array(N);
    this.grid = new Int32Array(N).fill(-1);
    this.entities = new Map();
    this.nextId = 1;
    this.money = CONFIG.startMoney;
    this.time = 0;
    this.research = new Set();
    this.market = Object.fromEntries(ITEM_IDS.map(id => [id, 1]));
    this.contracts = [];
    this.contractTimer = 20;
    this.event = null;
    this.eventTimer = 180;
    this.goalIndex = 0;
    this.stats = { sold: {}, produced: {}, earned: 0, spent: 0, powerCost: 0, contractsDone: 0, history: [], snaps: [] };
    this._acc = { earned: 0, power: 0, snap: 0, goal: 0 };
    this.generate();
    const c = Math.floor(this.W / 2);
    this.place('depot', c - 1, c - 1, 0, true);
    this.place('netz', c + 3, c - 1, 0, true);
    this.recomputeMods();
    this.rebuild();
  }

  generate() {
    const { W, H } = this;
    const r = rng(this.seed);
    const nWater = makeNoise(this.seed + 11), nForest = makeNoise(this.seed + 23), nShape = makeNoise(this.seed + 37);
    const cx = W / 2, cz = H / 2;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const i = z * W + x, d = Math.hypot(x - cx, z - cz);
      if (nWater(x * 0.055, z * 0.055) < -0.3 && d > 9) this.terrain[i] = 1;
      else if (nForest(x * 0.09, z * 0.09) > 0.16 && d > 7) this.deposit[i] = 1;
    }
    const patch = (type, px, pz, rad) => {
      for (let z = Math.floor(pz - rad - 2); z <= pz + rad + 2; z++) for (let x = Math.floor(px - rad - 2); x <= px + rad + 2; x++) {
        if (!this.inBounds(x, z)) continue;
        const d = Math.hypot(x - px, z - pz);
        if (d <= rad * (0.75 + 0.5 * (nShape(x * 0.4, z * 0.4) + 0.5))) {
          const i = z * W + x;
          this.terrain[i] = 0;
          this.deposit[i] = type;
        }
      }
    };
    // Garantierte Startvorkommen rund um das Depot
    const startTypes = [2, 3, 4, 5, 2];
    const off = r() * Math.PI * 2;
    startTypes.forEach((t, k) => {
      const a = off + k / startTypes.length * Math.PI * 2;
      const dist = 9 + r() * 4;
      patch(t, cx + Math.cos(a) * dist, cz + Math.sin(a) * dist, 2.2 + r() * 0.8);
    });
    // Weitere Vorkommen auf der Karte
    for (let k = 0; k < 22; k++) {
      const t = [2, 3, 4, 5, 2, 3, 4][k % 7];
      const x = 4 + r() * (W - 8), z = 4 + r() * (H - 8);
      if (Math.hypot(x - cx, z - cz) < 16) continue;
      patch(t, x, z, 2 + r() * 2.5);
    }
    // Startbereich freiräumen
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (Math.hypot(x - cx, z - cz) < 6) { const i = z * W + x; this.terrain[i] = 0; this.deposit[i] = 0; }
    }
  }

  // ───────────────────────── Grid-Helfer
  inBounds(x, z) { return x >= 0 && z >= 0 && x < this.W && z < this.H; }
  idx(x, z) { return z * this.W + x; }
  at(x, z) {
    if (!this.inBounds(x, z)) return null;
    const id = this.grid[z * this.W + x];
    return id >= 0 ? this.entities.get(id) : null;
  }
  countBuildings(fn) { let n = 0; for (const e of this.entities.values()) if (fn(e)) n++; return n; }
  isUnlocked(type) { const u = BUILDINGS[type].unlock; return !u || this.research.has(u); }
  recipeUnlocked(rid) {
    const r = RECIPES[rid];
    return (!r.unlock || this.research.has(r.unlock)) && this.isUnlocked(r.building);
  }
  recipesFor(type) { return Object.keys(RECIPES).filter(rid => RECIPES[rid].building === type); }

  // ───────────────────────── Bauen
  canPlace(type, x, z) {
    const B = BUILDINGS[type];
    if (!this.isUnlocked(type)) return { ok: false, reason: 'Noch nicht erforscht' };
    const s = B.size;
    let ore = 0;
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) {
      const tx = x + dx, tz = z + dz;
      if (!this.inBounds(tx, tz)) return { ok: false, reason: 'Außerhalb der Karte' };
      const i = this.idx(tx, tz);
      if (this.terrain[i] === 1) return { ok: false, reason: 'Kein Bauen auf Wasser' };
      const occ = this.at(tx, tz);
      if (occ && !(occ.type === 'band' && type !== 'band')) return { ok: false, reason: 'Feld belegt' };
      if (MINABLE.has(this.deposit[i])) ore++;
    }
    if (B.kind === 'miner' && ore === 0) return { ok: false, reason: 'Muss auf einem Vorkommen stehen' };
    if (this.money < B.cost) return { ok: false, reason: 'Zu wenig Geld' };
    return { ok: true };
  }

  place(type, x, z, rot = 0, free = false) {
    const B = BUILDINGS[type];
    if (!free && !this.canPlace(type, x, z).ok) return null;
    const s = B.size;
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) {
      const occ = this.at(x + dx, z + dz);
      if (occ) this.remove(occ.id, true, true);
    }
    const e = { id: this.nextId++, type, x, z, rot, level: 1 };
    this.initEntity(e);
    this.entities.set(e.id, e);
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) {
      const i = this.idx(x + dx, z + dz);
      this.grid[i] = e.id;
      if (this.deposit[i] === 1) this.deposit[i] = 0; // Rodung
    }
    if (!free) { this.money -= B.cost; this.stats.spent += B.cost; }
    this.dirty = true;
    return e;
  }

  initEntity(e) {
    const B = BUILDINGS[e.type];
    switch (B.kind) {
      case 'belt': e.items = []; break;
      case 'splitter': e.buf = null; e.rr = 0; break;
      case 'junction': e.bufs = [null, null]; break;
      case 'miner': {
        const counts = {};
        for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
          const d = this.deposit[this.idx(e.x + dx, e.z + dz)];
          if (MINABLE.has(d)) counts[d] = (counts[d] || 0) + 1;
        }
        const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        e.res = DEPOSITS[best[0]].item; e.tiles = best[1];
        e.progress = 0; e.out = 0; e.rr = 0;
        break;
      }
      case 'lumber': e.progress = 0; e.out = 0; e.rr = 0; break;
      case 'machine': {
        const rs = this.recipesFor(e.type).filter(r => this.recipeUnlocked(r));
        e.recipe = rs[0] || this.recipesFor(e.type)[0];
        e.inBuf = {}; e.outBuf = {}; e.progress = 0; e.crafting = false; e.rr = 0;
        break;
      }
      case 'storage': e.inv = {}; e.total = 0; e.rr = 0; break;
      case 'generator': e.fuel = 0; e.burn = 0; e.output = 0; break;
    }
  }

  remove(id, refund = true, silent = false) {
    const e = this.entities.get(id);
    if (!e) return;
    const B = BUILDINGS[e.type];
    if (B.kind === 'depot' && this.countBuildings(o => o.type === 'depot') <= 1) {
      if (!silent) this.toast('Das letzte Handelsdepot kann nicht abgerissen werden', 'warn');
      return false;
    }
    const s = B.size;
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) this.grid[this.idx(e.x + dx, e.z + dz)] = -1;
    this.entities.delete(id);
    if (refund) {
      const total = B.cost + (e.level > 1 ? Array.from({ length: e.level - 1 }, (_, k) => Math.round(B.cost * 0.6 * (k + 1))).reduce((a, b) => a + b, 0) : 0);
      this.money += Math.round(total * (B.kind === 'belt' ? 1 : CONFIG.refund));
    }
    this.dirty = true;
    return true;
  }

  rotate(id) {
    const e = this.entities.get(id);
    if (!e) return;
    e.rot = (e.rot + 1) % 4;
    if (e.type === 'band') e.items.forEach(it => { it.f = 0; });
    this.dirty = true;
  }

  setBeltDir(x, z, dir) {
    const e = this.at(x, z);
    if (e && e.type === 'band' && e.rot !== dir) { e.rot = dir; e.items.forEach(it => { it.f = 0; }); this.dirty = true; return true; }
    return false;
  }

  upgrade(id) {
    const e = this.entities.get(id);
    if (!e || e.level >= MAX_LEVEL) return false;
    const cost = upgradeCost(e);
    if (this.money < cost) { this.toast('Zu wenig Geld für das Upgrade', 'warn'); return false; }
    this.money -= cost; this.stats.spent += cost;
    e.level++;
    this.emit('entityChanged', e);
    return true;
  }
  canUpgrade(e) { return ['machine', 'miner', 'lumber'].includes(BUILDINGS[e.type].kind) && e.level < MAX_LEVEL; }

  setRecipe(id, rid) {
    const e = this.entities.get(id);
    if (!e || !this.recipeUnlocked(rid)) return;
    if (e.recipe === rid) return;
    e.recipe = rid; e.inBuf = {}; e.progress = 0; e.crafting = false;
    this.emit('entityChanged', e);
  }

  // Nach Änderungen am Grid: Nachbarschaften, Bandreihenfolge, Formen
  rebuild() {
    this.dirty = false;
    const belts = [];
    for (const e of this.entities.values()) {
      const s = BUILDINGS[e.type].size;
      if (e.type === 'band') { belts.push(e); continue; }
      const per = [];
      for (let i = 0; i < s; i++) {
        per.push({ nx: e.x + i, nz: e.z - 1, tx: e.x + i, tz: e.z });
        per.push({ nx: e.x + s, nz: e.z + i, tx: e.x + s - 1, tz: e.z + i });
        per.push({ nx: e.x + i, nz: e.z + s, tx: e.x + i, tz: e.z + s - 1 });
        per.push({ nx: e.x - 1, nz: e.z + i, tx: e.x, tz: e.z + i });
      }
      e._perim = per;
      if (e.type === 'holzfaeller') e._forest = this.countForest(e);
    }
    // Bandformen (gerade / Kurve)
    for (const b of belts) {
      const d = b.rot;
      const neighbour = side => {
        const s = (d + side) % 4;
        const n = this.at(b.x + DX[s], b.z + DZ[s]);
        if (!n) return 0;
        if (n.type === 'band') return n.rot === (s + 2) % 4 ? 2 : 0;
        return 1;
      };
      const back = neighbour(2), left = neighbour(3) === 2, right = neighbour(1) === 2;
      b._shape = 0;
      if (!back) {
        if (left && !right) b._shape = 1;
        else if (right && !left) b._shape = 2;
      }
    }
    // Downstream zuerst simulieren, damit Bänder lückenlos laufen
    const seen = new Set(), order = [];
    for (const b of belts) {
      if (seen.has(b.id)) continue;
      const chain = [];
      let cur = b;
      while (cur && cur.type === 'band' && !seen.has(cur.id)) {
        seen.add(cur.id); chain.push(cur);
        cur = this.at(cur.x + DX[cur.rot], cur.z + DZ[cur.rot]);
      }
      for (let i = chain.length - 1; i >= 0; i--) order.push(chain[i]);
    }
    this._beltOrder = order;
    this.emit('world');
  }

  countForest(e) {
    let n = 0;
    const s = 2, R = LUMBER_RADIUS;
    for (let z = e.z - R; z < e.z + s + R; z++) for (let x = e.x - R; x < e.x + s + R; x++) {
      if (this.inBounds(x, z) && this.deposit[this.idx(x, z)] === 1) n++;
    }
    return n;
  }

  // ───────────────────────── Itemfluss
  dirTo(x, z, sx, sz) {
    for (let d = 0; d < 4; d++) if (x + DX[d] === sx && z + DZ[d] === sz) return d;
    return -1;
  }

  // Versucht ein Item in ein Gebäude zu schieben. (sx,sz) = Feld der Quelle.
  insert(e, t, sx, sz, dry = false) {
    const B = BUILDINGS[e.type];
    switch (B.kind) {
      case 'belt': {
        const s = this.dirTo(e.x, e.z, sx, sz), d = e.rot;
        if (s < 0 || s === d) return false;
        const last = e.items[e.items.length - 1];
        if (last && last.p < CONFIG.beltSpacing) return false;
        if (!dry) e.items.push({ t, p: 0, f: s === (d + 2) % 4 ? 0 : s === (d + 3) % 4 ? 1 : 2 });
        return true;
      }
      case 'splitter': {
        if (e.buf) return false;
        const s = this.dirTo(e.x, e.z, sx, sz);
        if (s < 0) return false;
        if (!dry) e.buf = { t, from: s, timer: 0, out: -1 };
        return true;
      }
      case 'junction': {
        const s = this.dirTo(e.x, e.z, sx, sz);
        if (s < 0) return false;
        const out = (s + 2) % 4, axis = out % 2;
        if (e.bufs[axis]) return false;
        if (!dry) e.bufs[axis] = { t, from: s, out, timer: 0 };
        return true;
      }
      case 'machine': {
        const r = RECIPES[e.recipe];
        if (!r || !r.in[t]) return false;
        if ((e.inBuf[t] || 0) >= r.in[t] * 2 + 1) return false;
        if (!dry) e.inBuf[t] = (e.inBuf[t] || 0) + 1;
        return true;
      }
      case 'depot':
        if (!dry) { this.deliver(t); e._sold = (e._sold || 0) + 1; }
        return true;
      case 'storage':
        if (e.total >= B.capacity) return false;
        if (!dry) { e.inv[t] = (e.inv[t] || 0) + 1; e.total++; }
        return true;
      case 'generator':
        if (B.fuel !== t || e.fuel >= 5) return false;
        if (!dry) e.fuel++;
        return true;
    }
    return false;
  }

  // Gibt ein Item an ein benachbartes Gebäude ab (reihum)
  dump(e, t, beltsOnly = false) {
    const per = e._perim, n = per.length;
    for (let k = 0; k < n; k++) {
      const i = (e.rr + k) % n, p = per[i];
      const tgt = this.at(p.nx, p.nz);
      if (!tgt || tgt === e) continue;
      const kind = BUILDINGS[tgt.type].kind;
      if (beltsOnly && kind !== 'belt' && kind !== 'splitter' && kind !== 'junction') continue;
      if (kind === 'storage' && BUILDINGS[e.type].kind === 'storage') continue;
      if (this.insert(tgt, t, p.tx, p.tz)) { e.rr = i + 1; return true; }
    }
    return false;
  }

  deliver(t) {
    this.stats.sold[t] = (this.stats.sold[t] || 0) + 1;
    const c = this.contracts.find(c => c.item === t && c.delivered < c.qty);
    if (c) {
      c.delivered++;
      if (c.delivered >= c.qty) {
        this.money += c.reward; this.stats.earned += c.reward; this._acc.earned += c.reward;
        this.stats.contractsDone++;
        this.contracts.splice(this.contracts.indexOf(c), 1);
        this.toast(`Auftrag erfüllt: +${fmtMoney(c.reward)}`, 'success');
        this.emit('money', c.reward);
        this.emit('contracts');
      }
      return;
    }
    const p = this.price(t);
    this.money += p; this.stats.earned += p; this._acc.earned += p;
    this.market[t] = Math.max(0.35, this.market[t] * 0.9985);
  }

  price(t) {
    let m = ITEMS[t].price * this.market[t];
    if (this.event) {
      if (this.event.price?.[t]) m *= this.event.price[t];
      if (this.event.priceAll) m *= this.event.priceAll;
    }
    return m;
  }

  // ───────────────────────── Simulation
  get daylight() {
    const d = this.dayFrac;
    return Math.max(0, Math.sin((d - 0.25) * Math.PI * 2));
  }
  get dayFrac() { return (this.time / CONFIG.dayLength + 0.32) % 1; }
  get day() { return Math.floor(this.time / CONFIG.dayLength + 0.32) + 1; }
  get wind() {
    const w = 0.6 + 0.3 * Math.sin(this.time * 0.031) + 0.15 * Math.sin(this.time * 0.17 + 1.3);
    return Math.max(0.15, Math.min(1, w)) * (this.event?.wind || 1);
  }

  recomputeMods() {
    const m = { beltMul: 1, minerMul: 1, machineMul: 1, gridMul: 1 };
    for (const id of this.research) {
      const ef = RESEARCH_BY_ID[id]?.effect;
      if (ef) for (const k in ef) m[k] *= ef[k];
    }
    this.mods = m;
  }

  tick(dt) {
    if (this.dirty) this.rebuild();
    this.time += dt;
    const mods = this.mods;
    const ratio = this.power?.ratio ?? 1;
    const beltV = CONFIG.beltSpeed * mods.beltMul;

    let demand = 0, renewable = 0, gridCap = 0;
    const thermal = [];

    for (const e of this.entities.values()) {
      const B = BUILDINGS[e.type];
      switch (B.kind) {
        case 'miner':
        case 'lumber': {
          const base = B.kind === 'miner' ? e.tiles * CONFIG.minerRate : (e._forest || 0) * CONFIG.lumberRate;
          const want = e.out < 6 && base > 0;
          e._active = want;
          if (want) {
            demand += B.power;
            e.progress += base * mods.minerMul * levelMul(e.level) * ratio * dt;
            while (e.progress >= 1 && e.out < 6) { e.progress -= 1; e.out++; this.count('produced', B.kind === 'miner' ? e.res : 'holz'); }
          }
          if (e.out > 0 && this.dump(e, B.kind === 'miner' ? e.res : 'holz')) e.out--;
          break;
        }
        case 'machine': {
          const r = RECIPES[e.recipe];
          if (!r) break;
          let outTotal = 0;
          for (const k in e.outBuf) outTotal += e.outBuf[k];
          if (!e.crafting && outTotal < 8 && this.recipeUnlocked(e.recipe)) {
            let ok = true;
            for (const k in r.in) if ((e.inBuf[k] || 0) < r.in[k]) { ok = false; break; }
            if (ok) {
              for (const k in r.in) e.inBuf[k] -= r.in[k];
              e.crafting = true;
            }
          }
          e._active = e.crafting;
          if (e.crafting) {
            demand += B.power;
            e.progress += dt * mods.machineMul * levelMul(e.level) * ratio / r.time;
            if (e.progress >= 1) {
              e.progress = 0; e.crafting = false;
              for (const k in r.out) { e.outBuf[k] = (e.outBuf[k] || 0) + r.out[k]; this.count('produced', k, r.out[k]); }
            }
          }
          for (const k in e.outBuf) if (e.outBuf[k] > 0 && this.dump(e, k)) e.outBuf[k]--;
          break;
        }
        case 'storage': {
          for (const k in e.inv) {
            if (e.inv[k] > 0 && this.dump(e, k, true)) { e.inv[k]--; e.total--; break; }
          }
          break;
        }
        case 'grid': gridCap += B.supply * mods.gridMul; break;
        case 'generator':
          if (e.type === 'windrad') { e.output = B.supply * this.wind; renewable += e.output; }
          else if (e.type === 'solar') { e.output = B.supply * this.daylight; renewable += e.output; }
          else thermal.push(e);
          break;
        case 'splitter': {
          const b = e.buf;
          if (!b) break;
          b.timer = Math.min(1, b.timer + dt * beltV);
          if (b.timer >= 0.5 && b.out < 0) {
            for (let k = 1; k <= 4; k++) {
              const d = (e.rr + k) % 4;
              if (d === b.from) continue;
              const tgt = this.at(e.x + DX[d], e.z + DZ[d]);
              if (tgt && this.insert(tgt, b.t, e.x, e.z, true)) { b.out = d; e.rr = d; break; }
            }
            if (b.out < 0) b.timer = 0.5;
          }
          if (b.timer >= 1 && b.out >= 0) {
            const tgt = this.at(e.x + DX[b.out], e.z + DZ[b.out]);
            if (tgt && this.insert(tgt, b.t, e.x, e.z)) e.buf = null;
            else { b.out = -1; b.timer = 0.5; }
          }
          break;
        }
        case 'junction':
          for (let a = 0; a < 2; a++) {
            const b = e.bufs[a];
            if (!b) continue;
            b.timer = Math.min(1, b.timer + dt * beltV);
            if (b.timer >= 1) {
              const tgt = this.at(e.x + DX[b.out], e.z + DZ[b.out]);
              if (tgt && this.insert(tgt, b.t, e.x, e.z)) e.bufs[a] = null;
            }
          }
          break;
      }
    }

    // Bänder
    const SP = CONFIG.beltSpacing, step = beltV * dt;
    for (const e of this._beltOrder) {
      const items = e.items;
      if (!items.length) continue;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const lim = i === 0 ? 1 : items[i - 1].p - SP;
        const np = Math.min(it.p + step, lim);
        if (np > it.p) it.p = np;
      }
      if (items[0].p >= 1) {
        const tgt = this.at(e.x + DX[e.rot], e.z + DZ[e.rot]);
        if (tgt && this.insert(tgt, items[0].t, e.x, e.z)) items.shift();
      }
    }

    // Strom
    const thermalCap = thermal.reduce((s, e) => s + ((e.burn > 0 || e.fuel > 0) ? BUILDINGS[e.type].supply : 0), 0);
    const need = Math.max(0, demand - renewable);
    const load = thermalCap > 0 ? Math.min(1, need / thermalCap) : 0;
    let thermalOut = 0;
    for (const e of thermal) {
      const B = BUILDINGS[e.type];
      if (e.burn <= 0 && e.fuel > 0 && load > 0) { e.fuel--; e.burn = B.burnTime; }
      if (e.burn > 0) { e.output = B.supply * load; e.burn -= dt * load; thermalOut += e.output; }
      else e.output = 0;
      e._active = e.output > 0;
    }
    const own = renewable + thermalOut;
    const gridDraw = Math.max(0, Math.min(gridCap, demand - own));
    const supply = own + gridCap;
    const cost = gridDraw * CONFIG.gridCostPerKWs * (this.event?.gridCost || 1) * dt;
    this.money -= cost; this.stats.powerCost += cost; this._acc.power += cost;
    this.power = { demand, supply, own, gridCap, gridDraw, ratio: demand > 0 ? Math.min(1, supply / demand) : 1 };

    // Markt erholt sich
    for (const k in this.market) this.market[k] += (1 - this.market[k]) * 0.015 * dt;

    this.tickContracts(dt);
    this.tickEvents(dt);
    this.tickStats(dt);
  }

  count(kind, t, n = 1) { this.stats[kind][t] = (this.stats[kind][t] || 0) + n; }

  // ───────────────────────── Aufträge
  producible() {
    const set = new Set(['eisenerz', 'kupfererz', 'kohle', 'sand', 'holz']);
    for (const rid in RECIPES) if (this.recipeUnlocked(rid)) for (const k in RECIPES[rid].out) set.add(k);
    return [...set];
  }

  tickContracts(dt) {
    for (const c of [...this.contracts]) {
      c.time -= dt;
      if (c.time <= 0) {
        this.contracts.splice(this.contracts.indexOf(c), 1);
        this.toast(`Auftrag „${c.qty}× ${ITEMS[c.item].name}“ ist verfallen`, 'warn');
        this.emit('contracts');
      }
    }
    this.contractTimer -= dt;
    if (this.contractTimer <= 0) {
      this.contractTimer = 50 + Math.random() * 30;
      if (this.contracts.length < 3) this.addContract();
    }
  }

  addContract() {
    const pool = this.producible().filter(t => !this.contracts.some(c => c.item === t));
    if (!pool.length) return;
    const weights = pool.map(t => Math.sqrt(ITEMS[t].price));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0), item = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { item = pool[i]; break; } }
    const value = 350 + Math.min(40000, this.stats.earned * 0.04);
    const price = ITEMS[item].price;
    let qty = Math.max(1, Math.round(value / price));
    if (qty > 20) qty = Math.round(qty / 5) * 5;
    qty = Math.min(qty, 400);
    const time = Math.min(720, Math.max(240, 150 + qty * 1.5 + price * 0.1));
    this.contracts.push({ id: Math.random().toString(36).slice(2, 8), item, qty, delivered: 0, time, total: time, reward: Math.round(qty * price * 1.8 + 120) });
    this.emit('contracts');
  }

  // ───────────────────────── Ereignisse
  tickEvents(dt) {
    if (this.event) {
      this.event.left -= dt;
      if (this.event.left <= 0) { this.event = null; this.emit('event'); }
    }
    this.eventTimer -= dt;
    if (this.eventTimer <= 0) {
      this.eventTimer = 150 + Math.random() * 120;
      if (this.event) return;
      const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
      if (ev.grant) {
        const amount = Math.round(500 + Math.min(20000, this.stats.earned * 0.03));
        this.money += amount;
        this.toast(`${ev.title}: ${ev.text} (+${fmtMoney(amount)})`, 'success');
        return;
      }
      if (ev.wind && !this.countBuildings(e => e.type === 'windrad')) return;
      this.event = { ...ev, left: ev.duration };
      this.emit('event');
      this.toast(`${ev.title}: ${ev.text}`, 'event');
    }
  }

  // ───────────────────────── Statistik & Ziele
  tickStats(dt) {
    const a = this._acc;
    a.snap += dt;
    if (a.snap >= 5) {
      a.snap -= 5;
      const h = this.stats.history;
      h.push({ t: Math.round(this.time), money: Math.round(this.money), earned: Math.round(a.earned), power: Math.round(a.power) });
      if (h.length > 360) h.shift();
      a.earned = 0; a.power = 0;
      const s = this.stats.snaps;
      s.push({ produced: { ...this.stats.produced }, sold: { ...this.stats.sold } });
      if (s.length > 13) s.shift();
    }
    a.goal += dt;
    if (a.goal >= 0.5) {
      a.goal = 0;
      const g = GOALS[this.goalIndex];
      if (g && g.check(this)) {
        this.money += g.reward;
        this.goalIndex++;
        this.toast(`Ziel erreicht: ${g.text} (+${fmtMoney(g.reward)})`, 'success');
        this.emit('goal', g);
      }
    }
  }

  // Einnahmen pro Minute (aus den letzten 60 s)
  incomePerMin() {
    const h = this.stats.history, n = Math.min(12, h.length);
    if (!n) return 0;
    let s = 0;
    for (let i = h.length - n; i < h.length; i++) s += h[i].earned - h[i].power;
    return s * 60 / (n * 5);
  }

  ratePerMin(kind, t) {
    const s = this.stats.snaps;
    if (s.length < 2) return 0;
    const old = s[0][kind][t] || 0, now = this.stats[kind][t] || 0;
    return (now - old) * 60 / ((s.length - 1) * 5 + this._acc.snap);
  }

  // ───────────────────────── Forschung
  researchState(id) {
    const r = RESEARCH_BY_ID[id];
    if (this.research.has(id)) return 'done';
    if (!r.prereq.every(p => this.research.has(p))) return 'locked';
    const reqOk = Object.entries(r.req).every(([k, n]) => (this.stats.sold[k] || 0) >= n);
    if (!reqOk) return 'req';
    if (this.money < r.cost) return 'money';
    return 'ready';
  }

  doResearch(id) {
    if (this.researchState(id) !== 'ready') return false;
    const r = RESEARCH_BY_ID[id];
    this.money -= r.cost; this.stats.spent += r.cost;
    this.research.add(id);
    this.recomputeMods();
    // Maschinen ohne gültiges Rezept bekommen jetzt eines
    for (const e of this.entities.values()) {
      if (BUILDINGS[e.type].kind === 'machine' && !this.recipeUnlocked(e.recipe)) {
        const rs = this.recipesFor(e.type).filter(x => this.recipeUnlocked(x));
        if (rs[0]) e.recipe = rs[0];
      }
    }
    this.toast(`Forschung abgeschlossen: ${r.name}`, 'success');
    this.emit('research', id);
    return true;
  }

  // ───────────────────────── Speichern / Laden
  serialize() {
    const ents = [];
    for (const e of this.entities.values()) {
      const o = {};
      for (const k in e) if (k[0] !== '_') o[k] = e[k];
      ents.push(o);
    }
    return {
      v: 2, seed: this.seed, W: this.W, money: this.money, time: this.time,
      terrain: b64(this.terrain), deposit: b64(this.deposit),
      research: [...this.research], market: this.market, contracts: this.contracts,
      contractTimer: this.contractTimer, event: this.event, eventTimer: this.eventTimer,
      goalIndex: this.goalIndex, stats: this.stats, nextId: this.nextId, entities: ents,
    };
  }

  load(d) {
    if (!d || d.v !== 2) throw new Error('Unbekanntes Spielstandformat');
    this.seed = d.seed; this.W = this.H = d.W;
    this.terrain = unb64(d.terrain); this.deposit = unb64(d.deposit);
    this.grid = new Int32Array(this.W * this.H).fill(-1);
    this.entities = new Map();
    for (const e of d.entities) {
      if (!BUILDINGS[e.type]) continue; // entfernte Gebäudetypen (z. B. Fahrzeugwerk)
      if (e.items) e.items = e.items.filter(it => ITEMS[it.t]);
      if (e.recipe && !RECIPES[e.recipe]) { e.recipe = this.recipesFor(e.type)[0]; e.inBuf = {}; e.outBuf = {}; e.crafting = false; }
      this.entities.set(e.id, e);
      const s = BUILDINGS[e.type].size;
      for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) this.grid[this.idx(e.x + dx, e.z + dz)] = e.id;
    }
    Object.assign(this, {
      money: d.money, time: d.time, research: new Set(d.research.filter(id => RESEARCH_BY_ID[id])), market: { ...Object.fromEntries(ITEM_IDS.map(id => [id, 1])), ...d.market },
      contracts: d.contracts.filter(c => ITEMS[c.item]), contractTimer: d.contractTimer, event: d.event, eventTimer: d.eventTimer,
      goalIndex: Math.min(d.goalIndex, GOALS.length), stats: d.stats, nextId: d.nextId,
    });
    this._acc = { earned: 0, power: 0, snap: 0, goal: 0 };
    this.power = null;
    this.recomputeMods();
    this.rebuild();
  }
}

function b64(arr) {
  let s = '';
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s) {
  const bin = atob(s), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function fmtMoney(v) {
  const a = Math.abs(v);
  const s = a >= 1e6 ? (a / 1e6).toFixed(2).replace('.', ',') + ' Mio' : Math.round(a).toLocaleString('de-DE');
  return (v < 0 ? '−' : '') + s + ' €';
}
