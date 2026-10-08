// Palettenlogistik: Gabelstapler fahren Paletten zwischen Wareneingang, Regalen,
// Aufgabe-/Abnahmestationen und Versand. Wegfindung per A* über freie Hallenfelder.
import { BUILDINGS, ITEMS, CONFIG } from './data.js';

const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
const RACK_LEVEL_H = [0.1, 0.95, 1.8];

// ───────────────────────── Begehbarkeit & Zugänge
export function walkable(g, x, z) {
  if (!g.inBounds(x, z) || g.terrain[g.idx(x, z)] !== 0) return false;
  const e = g.at(x, z);
  return !e || BUILDINGS[e.type].kind === 'parking';
}

// Felder, von denen aus ein Stapler an ein Gebäude heranfährt
export function accessTiles(g, e) {
  const B = BUILDINGS[e.type], s = B.size, out = [];
  if (B.kind === 'parking') {
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) out.push({ x: e.x + dx, z: e.z + dz, side: -1 });
    return out;
  }
  for (let i = 0; i < s; i++) {
    out.push({ x: e.x + i, z: e.z - 1, side: 0 }, { x: e.x + s, z: e.z + i, side: 1 }, { x: e.x + i, z: e.z + s, side: 2 }, { x: e.x - 1, z: e.z + i, side: 3 });
  }
  return out.filter(t => {
    if (!walkable(g, t.x, t.z)) return false;
    if (B.kind === 'inbound' || B.kind === 'outbound') return t.side === e.rot;   // Tore nur von der Hallenseite
    if (B.kind === 'feeder' || B.kind === 'collector') return t.side !== e.rot;  // vorne ist die Bandseite
    return true;
  });
}

// A* mit mehreren Zielfeldern; liefert Felder ohne Startfeld, [] wenn schon am Ziel, null wenn unerreichbar
export function findPath(g, sx, sz, goals) {
  const W = g.W, key = (x, z) => z * W + x;
  const goalSet = new Set(goals.map(t => key(t.x, t.z)));
  if (!goalSet.size) return null;
  if (goalSet.has(key(sx, sz))) return [];
  const h = (x, z) => Math.min(...goals.map(t => Math.abs(t.x - x) + Math.abs(t.z - z)));
  const open = [[h(sx, sz), 0, sx, sz]];
  const came = new Map(), cost = new Map([[key(sx, sz), 0]]);
  let guard = 0;
  while (open.length && guard++ < 6000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, gc, x, z] = open.splice(bi, 1)[0];
    const k = key(x, z);
    if (goalSet.has(k)) {
      const path = [];
      let c = k;
      while (c !== key(sx, sz)) { path.push([c % W, Math.floor(c / W)]); c = came.get(c); }
      return path.reverse();
    }
    if (gc > (cost.get(k) ?? Infinity)) continue;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      const nk = key(nx, nz);
      if (!walkable(g, nx, nz)) continue;
      const nc = gc + 1;
      if (nc < (cost.get(nk) ?? Infinity)) {
        cost.set(nk, nc); came.set(nk, k);
        open.push([nc + h(nx, nz), nc, nx, nz]);
      }
    }
  }
  return null;
}

// Nächstes begehbares Feld (Breitensuche), falls ein Stapler zugebaut wurde
function nearestWalkable(g, x, z) {
  const seen = new Set([z * g.W + x]), q = [[x, z]];
  while (q.length) {
    const [cx, cz] = q.shift();
    if (walkable(g, cx, cz)) return [cx, cz];
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d], nz = cz + DZ[d], k = nz * g.W + nx;
      if (g.inBounds(nx, nz) && !seen.has(k)) { seen.add(k); q.push([nx, nz]); }
    }
  }
  return [x, z];
}

// ───────────────────────── Paletten in Gebäuden
export function palletsOf(e) {
  const k = BUILDINGS[e.type].kind;
  if (k === 'inbound') return e.dock;
  if (k === 'rack') return e.slots.filter(Boolean);
  if (k === 'feeder' || k === 'collector') return e.pallets;
  return [];
}

function takePallet(e, pid) {
  const k = BUILDINGS[e.type].kind;
  if (k === 'rack') {
    const i = e.slots.findIndex(p => p?.id === pid);
    if (i < 0) return null;
    const p = e.slots[i]; e.slots[i] = null; return p;
  }
  const list = k === 'inbound' ? e.dock : e.pallets;
  const i = list.findIndex(p => p.id === pid);
  return i < 0 ? null : list.splice(i, 1)[0];
}

function slotHeight(e, pid) {
  if (BUILDINGS[e.type].kind !== 'rack') return 0.06;
  let i = e.slots.findIndex(p => p?.id === pid);
  if (i < 0) i = e.slots.findIndex(p => !p);
  return RACK_LEVEL_H[Math.floor(Math.max(0, i) / 2)] ?? 0.06;
}

function putPallet(g, e, p) {
  const k = BUILDINGS[e.type].kind;
  p.res = 0;
  if (k === 'rack') {
    const i = e.slots.findIndex(s => !s);
    if (i < 0) return false;
    e.slots[i] = p;
  } else if (k === 'feeder') {
    if (e.pallets.length >= 2) return false;
    e.pallets.push(p);
  } else if (k === 'outbound') {
    for (let n = 0; n < p.qty; n++) g.deliver(p.item);
    e._sold = (e._sold || 0) + p.qty;
  } else return false;
  return true;
}

const freeCapacity = e => {
  const k = BUILDINGS[e.type].kind;
  if (k === 'rack') return e.slots.filter(s => !s).length - e.incoming;
  if (k === 'feeder') return 2 - e.pallets.length - e.incoming;
  if (k === 'outbound') return Infinity;
  return 0;
};

// Teile, die versendet werden dürfen: keine Einkaufsware, und keine Aufgabestation fordert sie an
export function shippable(g, item) {
  if (ITEMS[item].buy) return false;
  for (const e of g.entities.values()) if (e.type === 'aufgabe' && e.want === item) return false;
  return true;
}

// ───────────────────────── Stapler
export function createForklift(g, station) {
  const f = {
    id: g.nextForkliftId++, home: station.id,
    x: station.x + 0.5 + (g.forklifts.filter(o => o.home === station.id).length % 2), z: station.z + 0.5,
    h: 0, path: [], state: 'idle', job: null, carry: null, timer: 0, fork: 0.06, forkTarget: 0.06, idleT: 0, goal: null,
  };
  g.forklifts.push(f);
  return f;
}

const tileOf = f => [Math.floor(f.x), Math.floor(f.z)];

function route(g, f, target) {
  const [tx, tz] = tileOf(f);
  const path = findPath(g, tx, tz, accessTiles(g, target));
  if (!path) return false;
  f.path = path;
  f.goal = target.id;
  return true;
}

function faceTo(f, e) {
  const s = BUILDINGS[e.type].size;
  f.h = Math.atan2(e.x + s / 2 - f.x, e.z + s / 2 - f.z);
}

function release(g, f) {
  const j = f.job;
  if (!j) return;
  const src = g.entities.get(j.src), dest = g.entities.get(j.dest);
  if (!f.carry && src) { const p = palletsOf(src).find(p => p.id === j.pid); if (p) p.res = 0; }
  if (dest && j.counted) dest.incoming = Math.max(0, (dest.incoming || 0) - 1);
  f.job = null;
}

function assign(g, f, job) {
  const dest = g.entities.get(job.dest);
  if (job.src != null) {
    const src = g.entities.get(job.src);
    if (!route(g, f, src)) { src._unreachable = g.time; return false; }
    const p = palletsOf(src).find(p => p.id === job.pid);
    p.res = f.id;
    f.state = 'toPick';
  } else {
    if (!route(g, f, dest)) { dest._unreachable = g.time; return false; }
    f.state = 'toDrop';
  }
  if (dest && BUILDINGS[dest.type].kind !== 'outbound') { dest.incoming = (dest.incoming || 0) + 1; job.counted = true; }
  f.job = job;
  f.idleT = 0;
  return true;
}

function stepForklift(g, f, dt) {
  const job = f.job;
  // Auftrag noch gültig?
  if (job) {
    const src = job.src != null ? g.entities.get(job.src) : null;
    const dest = g.entities.get(job.dest);
    if ((f.state === 'toPick' || f.state === 'load') && (!src || !palletsOf(src).some(p => p.id === job.pid))) { release(g, f); f.state = 'idle'; f.path = []; }
    else if ((f.state === 'toDrop' || f.state === 'unload') && !dest) { f.job = null; f.state = 'idle'; f.path = []; }
  }
  if (f.repath && f.goal != null) {
    f.repath = false;
    const target = g.entities.get(f.goal);
    if (target && !route(g, f, target)) { release(g, f); f.state = 'idle'; f.path = []; }
  }
  // Fahren
  if (f.path.length) {
    const [nx, nz] = f.path[0];
    const tx = nx + 0.5, tz = nz + 0.5;
    const dx = tx - f.x, dz = tz - f.z, dist = Math.hypot(dx, dz);
    const stepLen = CONFIG.forkliftSpeed * dt;
    if (dist > 1e-4) {
      const want = Math.atan2(dx, dz);
      let d = want - f.h;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      f.h += d * Math.min(1, dt * 12);
    }
    if (dist <= stepLen) { f.x = tx; f.z = tz; f.path.shift(); }
    else { f.x += dx / dist * stepLen; f.z += dz / dist * stepLen; }
    f.fork += ((f.carry ? 0.25 : 0.06) - f.fork) * Math.min(1, dt * 4);
    if (f.path.length) return;
  }
  // angekommen (auch wenn der Stapler schon am Zielfeld stand)
  if (f.state === 'toPick' || f.state === 'toDrop') {
    if (f.state === 'toPick') {
      const src = g.entities.get(f.job.src);
      faceTo(f, src);
      f.forkTarget = slotHeight(src, f.job.pid);
      f.state = 'load'; f.timer = CONFIG.forkliftHandling;
    } else if (f.state === 'toDrop') {
      const dest = g.entities.get(f.job.dest);
      faceTo(f, dest);
      f.forkTarget = slotHeight(dest, null);
      f.state = 'unload'; f.timer = CONFIG.forkliftHandling;
    }
    return;
  }
  if (f.state === 'load' || f.state === 'unload') {
    f.fork += (f.forkTarget - f.fork) * Math.min(1, dt * 5);
    f.timer -= dt;
    if (f.timer > 0) return;
    if (f.state === 'load') {
      const src = g.entities.get(f.job.src);
      f.carry = takePallet(src, f.job.pid);
      const dest = g.entities.get(f.job.dest);
      if (!f.carry) { release(g, f); f.state = 'idle'; return; }
      if (dest && route(g, f, dest)) f.state = 'toDrop';
      else { if (dest) dest._unreachable = g.time; release(g, f); f.state = 'idle'; }
    } else {
      const dest = g.entities.get(f.job.dest);
      const ok = dest && putPallet(g, dest, f.carry);
      if (f.job.counted && dest) dest.incoming = Math.max(0, dest.incoming - 1);
      if (ok) f.carry = null;
      f.job = null;
      f.state = 'idle';
    }
    return;
  }
  // Leerlauf: nach kurzer Zeit zurück zur Station
  f.fork += (0.06 - f.fork) * Math.min(1, dt * 4);
  if (f.state === 'idle') {
    f.idleT += dt;
    const home = g.entities.get(f.home);
    if (home && f.idleT > 2 && !f.carry) {
      const [tx, tz] = tileOf(f);
      const atHome = tx >= home.x && tx < home.x + 2 && tz >= home.z && tz < home.z + 2;
      if (!atHome && route(g, f, home)) f.idleT = -999;
    }
  }
}

// ───────────────────────── Disponent
function nearest(list, from) {
  let best = null, bd = Infinity;
  for (const e of list) {
    const d = Math.abs(e.x - from.x) + Math.abs(e.z - from.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function chooseDest(g, item, from, srcKind) {
  const ents = [...g.entities.values()];
  const feeders = ents.filter(e => e.type === 'aufgabe' && e.want === item && freeCapacity(e) > 0);
  if (feeders.length) return { dest: nearest(feeders, from), prio: 0 };
  if (srcKind !== 'rack') {
    // Einkaufsware lässt in jedem Regal einen Platz für Fertigware frei
    const reserve = srcKind === 'inbound' ? 1 : 0;
    const racks = ents.filter(e => e.type === 'regal' && freeCapacity(e) > reserve);
    if (racks.length) return { dest: nearest(racks, from), prio: srcKind === 'inbound' ? 2 : 1 };
  }
  if ((srcKind === 'rack' || srcKind === 'collector' || srcKind === 'carry') && shippable(g, item)) {
    const out = ents.filter(e => e.type === 'versand');
    if (out.length) return { dest: nearest(out, from), prio: 3 };
  }
  if (srcKind === 'carry') {
    const racks = ents.filter(e => e.type === 'regal' && freeCapacity(e) > 0);
    if (racks.length) return { dest: nearest(racks, from), prio: 1 };
  }
  return null;
}

function plan(g) {
  const free = g.forklifts.filter(f => !f.job && (f.state === 'idle'));
  if (!free.length) return;
  // Zuerst Stapler, die noch eine Palette auf der Gabel haben
  for (const f of free.filter(f => f.carry)) {
    const c = chooseDest(g, f.carry.item, { x: f.x, z: f.z }, 'carry');
    if (c) assign(g, f, { src: null, dest: c.dest.id, pid: f.carry.id });
  }
  const jobs = [];
  for (const e of g.entities.values()) {
    const k = BUILDINGS[e.type].kind;
    if (k !== 'inbound' && k !== 'rack' && k !== 'collector') continue;
    if (e._unreachable && g.time - e._unreachable < 5) continue;
    for (const p of palletsOf(e)) {
      if (p.res || (k === 'collector' && !p.ready)) continue;
      const c = chooseDest(g, p.item, e, k);
      if (c && c.dest !== e) jobs.push({ src: e.id, dest: c.dest.id, pid: p.id, prio: c.prio, t: p.t, at: e });
    }
  }
  jobs.sort((a, b) => a.prio - b.prio || a.t - b.t);
  const taken = new Set();
  for (const job of jobs) {
    const idle = free.filter(f => !f.job && !f.carry && !taken.has(f.id));
    if (!idle.length) break;
    const dest = g.entities.get(job.dest);
    if (freeCapacity(dest) <= 0) continue;
    const f = nearest(idle, job.at);
    if (assign(g, f, job)) taken.add(f.id);
  }
}

export function tickLogistics(g, dt) {
  for (const f of g.forklifts) stepForklift(g, f, dt);
  g._planT = (g._planT || 0) + dt;
  if (g._planT >= 0.4) { g._planT = 0; plan(g); }
}

// Nach Umbauten: zugebaute Stapler freistellen, Wege neu berechnen
export function afterRebuild(g) {
  for (const f of g.forklifts) {
    const [tx, tz] = tileOf(f);
    if (!walkable(g, tx, tz)) {
      const [nx, nz] = nearestWalkable(g, tx, tz);
      f.x = nx + 0.5; f.z = nz + 0.5;
    }
    if (f.path.length) f.repath = true;
  }
}

export function forkliftStatus(f) {
  const what = f.carry ? `${ITEMS[f.carry.item].name} (${f.carry.qty})` : '';
  switch (f.state) {
    case 'toPick': return 'Fährt zur Palette';
    case 'load': return 'Lädt auf';
    case 'toDrop': return `Bringt ${what}`;
    case 'unload': return 'Lädt ab';
    default: return f.path.length ? 'Fährt zur Station' : f.carry ? `Wartet mit ${what}` : 'Bereit';
  }
}
