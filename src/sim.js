// Simulation: Fabrikhalle, Gebäude mit festen Ein-/Ausgängen, Rollenbahnen, Strom,
// Einkauf, Markt, Aufträge, Forschung. Läuft mit fester Tickrate und ohne DOM/Three.js.
import { ITEMS, ITEM_IDS, RECIPES, BUILDINGS, RESEARCH, RESEARCH_BY_ID, GOALS, EVENTS, CONFIG, BUY_UNLOCK } from './data.js';
import { tickLogistics, afterRebuild, createForklift, palletsOf } from './logistics.js';

export const DX = [0, 1, 0, -1];
export const DZ = [-1, 0, 1, 0];
const MAX_LEVEL = 5;
const OUT_CAP = 8;
export const TILE_FLOOR = 0, TILE_COLUMN = 2;

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

export const levelMul = lvl => 1 + 0.35 * (lvl - 1);
export const upgradeCost = e => Math.round(BUILDINGS[e.type].cost * 0.6 * e.level);
const PORTED = new Set(['machine', 'feeder']);

export class Game {
  constructor() { this.listeners = {}; }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { (this.listeners[ev] || []).forEach(fn => fn(data)); }
  toast(text, kind = 'info') { this.emit('toast', { text, kind }); }

  // ───────────────────────── Neues Spiel / Halle
  newGame(seed = Math.floor(Math.random() * 1e9)) {
    this.seed = seed;
    this.W = CONFIG.hallW;
    this.H = CONFIG.hallH;
    const N = this.W * this.H;
    this.terrain = new Uint8Array(N);
    this.grid = new Int32Array(N).fill(-1);
    this.entities = new Map();
    this.nextId = 1;
    this.forklifts = [];
    this.nextForkliftId = 1;
    this.nextPalletId = 1;
    this.money = CONFIG.startMoney;
    this.time = 0;
    this.research = new Set();
    this.market = Object.fromEntries(ITEM_IDS.map(id => [id, 1]));
    this.contracts = [];
    this.contractTimer = 25;
    this.event = null;
    this.eventTimer = 200;
    this.goalIndex = 0;
    this.stats = { sold: {}, produced: {}, bought: {}, earned: 0, spent: 0, powerCost: 0, buyCost: 0, contractsDone: 0, history: [], snaps: [] };
    this._acc = { earned: 0, power: 0, buy: 0, snap: 0, goal: 0 };
    this.layoutHall();
    this.recomputeMods();
    this.rebuild();
  }

  layoutHall() {
    const { W, H } = this, r = rng(this.seed);
    // Stützenraster
    const ce = CONFIG.columnEvery;
    this.columns = [];
    for (let x = ce; x < W - 2; x += ce) for (const z of [Math.round(H / 3), Math.round(H * 2 / 3)]) {
      this.terrain[this.idx(x, z)] = TILE_COLUMN;
      this.columns.push([x, z]);
    }
    // Tore gegenüber in einer stützenfreien Reihe, damit eine gerade Linie möglich ist
    const mid = Math.floor(H / 2) - 1;
    this.place('eingang', 0, mid, 1, true);
    this.place('versand', W - 2, mid, 3, true);
    this.place('trafo', 0, H - 2, 0, true);
    // Erstausstattung: ein Regal und eine Staplerstation neben dem Wareneingang
    this.place('regal', 3, mid - 4, 0, true);
    this.place('station', 3, mid + 4, 0, true);
    // Altbestand: Meisterbüro, Regale an der Nordwand, Paletten, ein Stapler
    this.place('altbuero', W - 3, 0, 2, true);
    for (let x = 4; x < W - 6; x += 2 + Math.floor(r() * 3)) {
      if (r() < 0.55) this.place('altregal', x, 0, 2, true);
    }
    for (let k = 0; k < 9; k++) {
      const x = 3 + Math.floor(r() * (W - 6)), z = 3 + Math.floor(r() * (H - 6));
      if (Math.abs(z - mid - 0.5) < 3 || x < 8) continue; // Hauptgang und Lagerzone frei lassen
      if (this.isFree(x, z, 1)) this.place('palette', x, z, Math.floor(r() * 4), true);
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
  isFree(x, z, s) {
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) {
      if (!this.inBounds(x + dx, z + dz) || this.terrain[this.idx(x + dx, z + dz)] !== TILE_FLOOR || this.at(x + dx, z + dz)) return false;
    }
    return true;
  }
  countBuildings(fn) { let n = 0; for (const e of this.entities.values()) if (fn(e)) n++; return n; }
  isUnlocked(type) { const u = BUILDINGS[type].unlock; return !u || this.research.has(u); }
  recipeUnlocked(rid) {
    const r = RECIPES[rid];
    return (!r.unlock || this.research.has(r.unlock)) && this.isUnlocked(r.building);
  }
  recipesFor(type) { return Object.keys(RECIPES).filter(rid => RECIPES[rid].building === type); }
  buyUnlocked(item) { return !!ITEMS[item].buy && (!BUY_UNLOCK[item] || this.research.has(BUY_UNLOCK[item])); }

  // Wandgebäude zeigen automatisch in die Halle
  wallRotation(x, z, s) {
    if (x === 0) return 1;
    if (x + s === this.W) return 3;
    if (z === 0) return 2;
    if (z + s === this.H) return 0;
    return -1;
  }

  // ───────────────────────── Bauen
  canPlace(type, x, z) {
    const B = BUILDINGS[type];
    if (B.kind === 'decor') return { ok: false, reason: 'Nicht baubar' };
    if (!this.isUnlocked(type)) return { ok: false, reason: 'Noch nicht erforscht' };
    const s = B.size;
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) {
      const tx = x + dx, tz = z + dz;
      if (!this.inBounds(tx, tz)) return { ok: false, reason: 'Außerhalb der Halle' };
      if (this.terrain[this.idx(tx, tz)] === TILE_COLUMN) return { ok: false, reason: 'Hallenstütze im Weg' };
      const occ = this.at(tx, tz);
      if (occ && !(occ.type === 'band' && type !== 'band')) return { ok: false, reason: occ.type in BUILDINGS && BUILDINGS[occ.type].kind === 'decor' ? `${BUILDINGS[occ.type].name} im Weg` : 'Feld belegt' };
    }
    if (B.wall && this.wallRotation(x, z, s) < 0) return { ok: false, reason: 'Muss an der Außenwand stehen' };
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
    if (B.wall) rot = this.wallRotation(x, z, s);
    const e = { id: this.nextId++, type, x, z, rot, level: 1 };
    this.initEntity(e);
    this.entities.set(e.id, e);
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) this.grid[this.idx(x + dx, z + dz)] = e.id;
    if (!free) { this.money -= B.cost; this.stats.spent += B.cost; }
    if (B.kind === 'parking') createForklift(this, e);
    this.dirty = true;
    return e;
  }

  initEntity(e) {
    const B = BUILDINGS[e.type];
    switch (B.kind) {
      case 'belt': e.items = []; break;
      case 'splitter': e.buf = null; e.rr = 0; break;
      case 'junction': e.bufs = [null, null]; break;
      case 'machine': {
        const rs = this.recipesFor(e.type).filter(r => this.recipeUnlocked(r));
        e.recipe = rs[0] || this.recipesFor(e.type)[0];
        e.inBuf = {}; e.outBuf = {}; e.progress = 0; e.crafting = false; e.rr = 0;
        break;
      }
      case 'inbound': e.order = 'rundstahl'; e.on = true; e.timer = CONFIG.palletInterval * 0.7; e.dock = []; break;
      case 'rack': e.slots = Array(B.slots).fill(null); e.incoming = 0; break;
      case 'feeder': e.want = 'rundstahl'; e.pallets = []; e.incoming = 0; e.rr = 0; break;
      case 'collector': e.pallets = []; e.idle = 0; break;
    }
  }

  remove(id, refund = true, silent = false) {
    const e = this.entities.get(id);
    if (!e) return false;
    const B = BUILDINGS[e.type];
    if (B.kind === 'outbound' && this.countBuildings(o => o.type === 'versand') <= 1) {
      if (!silent) this.toast('Der letzte Versand kann nicht abgerissen werden', 'warn');
      return false;
    }
    if (B.kind === 'decor' && !silent) {
      if (this.money < B.removeCost) { this.toast(`Entsorgung kostet ${fmtMoney(B.removeCost)}`, 'warn'); return false; }
      this.money -= B.removeCost; this.stats.spent += B.removeCost;
      refund = false;
    }
    const lost = palletsOf(e).length;
    if (lost && !silent) this.toast(`${lost} Palette${lost > 1 ? 'n' : ''} beim Abriss verloren`, 'warn');
    if (B.kind === 'parking') this.forklifts = this.forklifts.filter(f => f.home !== e.id);
    const s = B.size;
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) this.grid[this.idx(e.x + dx, e.z + dz)] = -1;
    this.entities.delete(id);
    if (refund && B.cost) {
      let total = B.cost;
      for (let k = 1; k < e.level; k++) total += Math.round(B.cost * 0.6 * k);
      this.money += Math.round(total * (B.kind === 'belt' ? 1 : CONFIG.refund));
    }
    this.dirty = true;
    return true;
  }

  rotate(id) {
    const e = this.entities.get(id);
    if (!e) return;
    const B = BUILDINGS[e.type];
    if (B.wall || B.kind === 'decor' && e.type !== 'stapler') return;
    e.rot = (e.rot + 1) % 4;
    if (e.type === 'band') e.items.forEach(it => { it.f = 0; });
    this.dirty = true;
  }

  setBeltDir(x, z, dir) {
    const e = this.at(x, z);
    if (e && e.type === 'band' && e.rot !== dir) { e.rot = dir; e.items.forEach(it => { it.f = 0; }); this.dirty = true; return true; }
    return false;
  }

  canUpgrade(e) { return ['machine', 'inbound'].includes(BUILDINGS[e.type].kind) && e.level < MAX_LEVEL; }

  buyForklift(stationId) {
    const e = this.entities.get(stationId), B = e && BUILDINGS[e.type];
    if (!e || B.kind !== 'parking') return false;
    if (this.forklifts.filter(f => f.home === e.id).length >= B.maxForklifts) return false;
    if (this.money < B.forkliftCost) { this.toast('Zu wenig Geld für einen Stapler', 'warn'); return false; }
    this.money -= B.forkliftCost; this.stats.spent += B.forkliftCost;
    createForklift(this, e);
    this.emit('entityChanged', e);
    return true;
  }

  palletsIn(kind, item) {
    let n = 0;
    for (const e of this.entities.values()) {
      if (BUILDINGS[e.type].kind !== kind) continue;
      n += palletsOf(e).filter(p => !item || p.item === item).length;
    }
    return n;
  }

  newPallet(item, qty) { return { id: this.nextPalletId++, item, qty, t: this.time, res: 0 }; }
  upgrade(id) {
    const e = this.entities.get(id);
    if (!e || !this.canUpgrade(e)) return false;
    const cost = upgradeCost(e);
    if (this.money < cost) { this.toast('Zu wenig Geld für das Upgrade', 'warn'); return false; }
    this.money -= cost; this.stats.spent += cost;
    e.level++;
    this.emit('entityChanged', e);
    return true;
  }

  setRecipe(id, rid) {
    const e = this.entities.get(id);
    if (!e || !this.recipeUnlocked(rid) || e.recipe === rid) return;
    e.recipe = rid; e.inBuf = {}; e.progress = 0; e.crafting = false;
    this.emit('entityChanged', e);
  }

  setInbound(id, item) {
    const e = this.entities.get(id);
    if (!e || !this.buyUnlocked(item)) return;
    e.order = item;
    this.emit('entityChanged', e);
  }

  setFeeder(id, item) {
    const e = this.entities.get(id);
    if (!e || !ITEMS[item]) return;
    e.want = item;
    this.emit('entityChanged', e);
  }

  // Teilpalette an der Abnahmestation sofort zur Abholung freigeben
  releaseCollector(id) {
    const e = this.entities.get(id);
    const p = e?.pallets.find(p => !p.ready && p.qty > 0);
    if (p) { p.ready = true; this.emit('entityChanged', e); }
  }

  toggleInbound(id) {
    const e = this.entities.get(id);
    if (e) { e.on = !e.on; this.emit('entityChanged', e); }
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
        per.push({ nx: e.x + i, nz: e.z - 1, tx: e.x + i, tz: e.z, side: 0 });
        per.push({ nx: e.x + s, nz: e.z + i, tx: e.x + s - 1, tz: e.z + i, side: 1 });
        per.push({ nx: e.x + i, nz: e.z + s, tx: e.x + i, tz: e.z + s - 1, side: 2 });
        per.push({ nx: e.x - 1, nz: e.z + i, tx: e.x, tz: e.z + i, side: 3 });
      }
      // Gebäude mit Ports geben nur nach vorne ab
      e._perim = PORTED.has(BUILDINGS[e.type].kind) ? per.filter(p => p.side === e.rot) : per;
    }
    for (const b of belts) {
      const d = b.rot;
      const neighbour = side => {
        const s = (d + side) % 4;
        const n = this.at(b.x + DX[s], b.z + DZ[s]);
        if (!n) return 0;
        if (n.type === 'band') return n.rot === (s + 2) % 4 ? 2 : 0;
        return BUILDINGS[n.type].kind === 'decor' ? 0 : 1;
      };
      const back = neighbour(2), left = neighbour(3) === 2, right = neighbour(1) === 2;
      b._shape = 0;
      if (!back) {
        if (left && !right) b._shape = 1;
        else if (right && !left) b._shape = 2;
      }
    }
    // Downstream zuerst simulieren, damit Bahnen lückenlos laufen
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
    afterRebuild(this);
    this.emit('world');
  }

  // ───────────────────────── Teilefluss
  dirTo(x, z, sx, sz) {
    for (let d = 0; d < 4; d++) if (x + DX[d] === sx && z + DZ[d] === sz) return d;
    return -1;
  }

  // Seite eines Mehrfeld-Gebäudes, an der das Quellfeld liegt
  sideOf(e, sx, sz) {
    const s = BUILDINGS[e.type].size;
    if (sz < e.z) return 0;
    if (sx >= e.x + s) return 1;
    if (sz >= e.z + s) return 2;
    return 3;
  }

  // Versucht ein Teil in ein Gebäude zu schieben. (sx,sz) = Feld der Quelle.
  insert(e, t, sx, sz, dry = false) {
    const B = BUILDINGS[e.type];
    if (PORTED.has(B.kind) && this.sideOf(e, sx, sz) === e.rot) return false; // Ausgangsseite nimmt nichts an
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
      case 'outbound':
        if (!dry) { this.deliver(t); e._sold = (e._sold || 0) + 1; }
        return true;
      case 'collector': {
        if (this.sideOf(e, sx, sz) !== e.rot) return false;   // Teile nur von der Bandseite
        let p = e.pallets.find(p => !p.ready);
        if (p && p.qty > 0 && p.item !== t) return false;      // eine Palette = eine Teileart
        if (!p && e.pallets.length >= 2) return false;
        if (!dry) {
          if (!p) { p = this.newPallet(t, 0); e.pallets.push(p); }
          p.item = t; p.qty++;
          if (p.qty >= CONFIG.palletQty) p.ready = true;
          e.idle = 0;
        }
        return true;
      }
    }
    return false;
  }

  // Gibt ein Teil an ein benachbartes Gebäude ab (reihum über die Ausgangsfelder)
  dump(e, t) {
    const per = e._perim, n = per.length;
    for (let k = 0; k < n; k++) {
      const i = (e.rr + k) % n, p = per[i];
      const tgt = this.at(p.nx, p.nz);
      if (!tgt || tgt === e) continue;
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

  buyPrice(t) { return ITEMS[t].buy * (this.event?.buy?.[t] || 1); }

  // ───────────────────────── Simulation
  get daylight() { return Math.max(0, Math.sin((this.dayFrac - 0.25) * Math.PI * 2)); }
  get dayFrac() { return (this.time / CONFIG.dayLength + 0.32) % 1; }
  get day() { return Math.floor(this.time / CONFIG.dayLength + 0.32) + 1; }

  recomputeMods() {
    const m = { beltMul: 1, machineMul: 1, gridMul: 1 };
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
    let demand = 0, gridCap = 0;

    for (const e of this.entities.values()) {
      const B = BUILDINGS[e.type];
      switch (B.kind) {
        case 'inbound': {
          e._active = false; e._poor = false;
          if (e.on && e.dock.length < CONFIG.dockSlots) {
            e.timer += dt * levelMul(e.level);
            if (e.timer >= CONFIG.palletInterval) {
              const cost = this.buyPrice(e.order) * CONFIG.palletQty;
              if (this.money >= cost) {
                e.timer = 0;
                e.dock.push(this.newPallet(e.order, CONFIG.palletQty));
                this.money -= cost; this.stats.buyCost += cost; this._acc.buy += cost;
                this.count('bought', e.order, CONFIG.palletQty);
                e._recent = 2;
              } else { e.timer = CONFIG.palletInterval; e._poor = true; }
            }
          }
          e._active = e.dock.length > 0;
          break;
        }
        case 'feeder': {
          const p = e.pallets[0];
          e._active = !!p;
          if (p && this.dump(e, p.item)) { p.qty--; if (p.qty <= 0) e.pallets.shift(); }
          break;
        }
        case 'collector': {
          e.idle += dt;
          const p = e.pallets.find(p => !p.ready);
          if (p && p.qty > 0 && e.idle > CONFIG.partialPickup) p.ready = true;
          e._active = !!p && p.qty > 0;
          break;
        }
        case 'machine': {
          const r = RECIPES[e.recipe];
          if (!r) break;
          let outTotal = 0;
          for (const k in e.outBuf) outTotal += e.outBuf[k];
          if (!e.crafting && outTotal < OUT_CAP && this.recipeUnlocked(e.recipe)) {
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
        case 'grid': gridCap += B.supply * mods.gridMul; break;
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

    // Rollenbahnen
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

    tickLogistics(this, dt);

    // Strom
    const gridDraw = Math.min(gridCap, demand);
    const cost = gridDraw * CONFIG.gridCostPerKWs * (this.event?.gridCost || 1) * dt;
    this.money -= cost; this.stats.powerCost += cost; this._acc.power += cost;
    this.power = { demand, supply: gridCap, gridDraw, ratio: demand > 0 ? Math.min(1, gridCap / demand) : 1 };

    for (const k in this.market) this.market[k] += (1 - this.market[k]) * 0.015 * dt;

    this.tickContracts(dt);
    this.tickEvents(dt);
    this.tickStats(dt);
  }

  count(kind, t, n = 1) { this.stats[kind][t] = (this.stats[kind][t] || 0) + n; }

  // ───────────────────────── Aufträge
  producible() {
    const set = new Set();
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
    const time = Math.min(720, Math.max(240, 150 + qty * 1.5 + price * 0.5));
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
      h.push({ t: Math.round(this.time), money: Math.round(this.money), earned: Math.round(a.earned), power: Math.round(a.power), buy: Math.round(a.buy) });
      if (h.length > 360) h.shift();
      a.earned = 0; a.power = 0; a.buy = 0;
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

  // Ergebnis pro Minute: Umsatz minus Strom und Einkauf (letzte 60 s)
  incomePerMin() {
    const h = this.stats.history, n = Math.min(12, h.length);
    if (!n) return 0;
    let s = 0;
    for (let i = h.length - n; i < h.length; i++) s += h[i].earned - h[i].power - (h[i].buy || 0);
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
    if (!Object.entries(r.req).every(([k, n]) => (this.stats.sold[k] || 0) >= n)) return 'req';
    if (this.money < r.cost) return 'money';
    return 'ready';
  }

  doResearch(id) {
    if (this.researchState(id) !== 'ready') return false;
    const r = RESEARCH_BY_ID[id];
    this.money -= r.cost; this.stats.spent += r.cost;
    this.research.add(id);
    this.recomputeMods();
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
      v: CONFIG.saveVersion, seed: this.seed, W: this.W, H: this.H, money: this.money, time: this.time,
      terrain: b64(this.terrain), research: [...this.research], market: this.market, contracts: this.contracts,
      contractTimer: this.contractTimer, event: this.event, eventTimer: this.eventTimer,
      goalIndex: this.goalIndex, stats: this.stats, nextId: this.nextId, entities: ents,
      forklifts: this.forklifts, nextForkliftId: this.nextForkliftId, nextPalletId: this.nextPalletId,
    };
  }

  load(raw) {
    const d = migrate(raw);
    this.seed = d.seed; this.W = d.W; this.H = d.H;
    this.terrain = unb64(d.terrain);
    this.grid = new Int32Array(this.W * this.H).fill(-1);
    this.entities = new Map();
    this.columns = [];
    for (let i = 0; i < this.terrain.length; i++) if (this.terrain[i] === TILE_COLUMN) this.columns.push([i % this.W, Math.floor(i / this.W)]);
    for (const e of d.entities) {
      if (!BUILDINGS[e.type]) continue;
      if (e.items) e.items = e.items.filter(it => ITEMS[it.t]);
      if (e.recipe && !RECIPES[e.recipe]) { e.recipe = this.recipesFor(e.type)[0]; e.inBuf = {}; e.outBuf = {}; e.crafting = false; }
      this.entities.set(e.id, e);
      const s = BUILDINGS[e.type].size;
      for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) this.grid[this.idx(e.x + dx, e.z + dz)] = e.id;
    }
    Object.assign(this, {
      money: d.money, time: d.time, research: new Set(d.research.filter(id => RESEARCH_BY_ID[id])),
      market: { ...Object.fromEntries(ITEM_IDS.map(id => [id, 1])), ...d.market },
      contracts: d.contracts.filter(c => ITEMS[c.item]), contractTimer: d.contractTimer, event: d.event, eventTimer: d.eventTimer,
      goalIndex: Math.min(d.goalIndex, GOALS.length), stats: d.stats, nextId: d.nextId,
      forklifts: d.forklifts || [], nextForkliftId: d.nextForkliftId || 1, nextPalletId: d.nextPalletId || 1,
    });
    this.forklifts = this.forklifts.filter(f => this.entities.has(f.home));
    this.stats.bought ||= {};
    this._acc = { earned: 0, power: 0, buy: 0, snap: 0, goal: 0 };
    this.power = null;
    this.recomputeMods();
    this.rebuild();
  }
}

// Spielstand-Migrationen: jede Funktion hebt eine Version um eins an.
const MIGRATIONS = {
  // v3 → v4: Palettenlogistik. Bandlager und Deko-Stapler entfallen, Wareneingang liefert Paletten.
  3: d => {
    d.entities = d.entities.filter(e => e.type !== 'lager' && e.type !== 'stapler');
    for (const e of d.entities) {
      if (e.type === 'eingang') { e.order = e.item || 'rundstahl'; e.dock = []; e.timer = 0; delete e.item; delete e.out; delete e.progress; }
    }
    d.goalIndex = 0;
    d.forklifts = []; d.nextForkliftId = 1; d.nextPalletId = 1;
    d.v = 4;
    return d;
  },
};
export function migrate(d) {
  if (!d || typeof d.v !== 'number') throw new Error('Unbekanntes Spielstandformat');
  if (d.v < 3) throw new Error('Spielstand aus einer älteren Version (Außenkarte) – nicht kompatibel');
  while (d.v < CONFIG.saveVersion) {
    const m = MIGRATIONS[d.v];
    if (!m) throw new Error(`Keine Migration für Version ${d.v}`);
    d = m(d);
  }
  return d;
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
