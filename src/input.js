// Kamera, Maus/Touch/Tastatur und Werkzeuge (Auswählen, Bauen, Abreißen).
import { BUILDINGS } from './data.js';
import { DX, DZ } from './sim.js';

const ISO_PITCH = Math.atan(1 / Math.SQRT2); // echte Isometrie: 35,26°
const MIN_D = 6, MAX_D = 60;

export class Controls {
  constructor(canvas, game, renderer, hooks) {
    this.canvas = canvas;
    this.game = game;
    this.r = renderer;
    this.hooks = hooks; // { onSelect, onTool, onHover, sound }
    this.cam = { target: { x: game.W / 2, z: game.H / 2 + 1 }, dist: 44, yaw: Math.PI / 5, pitch: 0.95, showGrid: false, iso: false };
    this.camGoal = { dist: 44, yaw: Math.PI / 5 };
    this.tool = 'select';
    this.buildType = null;
    this.buildRot = 0;
    this.selected = null;
    this.pointers = new Map();
    this.keys = new Set();
    this.drag = null;
    this.hoverTile = null;

    canvas.addEventListener('pointerdown', e => this.down(e));
    addEventListener('pointermove', e => this.move(e));
    addEventListener('pointerup', e => this.up(e));
    addEventListener('pointercancel', e => this.up(e, true));
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('keydown', e => this.key(e, true));
    addEventListener('keyup', e => this.key(e, false));
    addEventListener('blur', () => this.keys.clear());
  }

  // ───────────────────────── Werkzeuge
  setTool(tool, type = null) {
    if (tool === 'build' && (!type || (this.tool === 'build' && this.buildType === type))) tool = 'select';
    this.tool = tool;
    this.buildType = tool === 'build' ? type : null;
    this.drag = null;
    this.r.setGhost(null);
    this.r.setBeltGhost([], () => true);
    this.cam.showGrid = tool === 'build';
    if (tool !== 'select') this.select(null);
    this.hooks.onTool?.(tool, this.buildType);
    this.refreshGhost();
  }

  select(e) {
    this.selected = e ? e.id : null;
    this.r.setSelection(e);
    this.hooks.onSelect?.(e);
  }

  rotate() {
    if (this.tool === 'build') {
      this.buildRot = (this.buildRot + 1) % 4;
      this.refreshGhost();
      this.hooks.sound?.('rotate');
    } else if (this.selected != null) {
      this.game.rotate(this.selected);
      this.hooks.sound?.('rotate');
    }
  }

  // ───────────────────────── Kamera
  zoom(f) { this.camGoal.dist = Math.min(MAX_D, Math.max(MIN_D, this.camGoal.dist * f)); }

  // Isometrische Ansicht: orthografische Kamera, Drehung in 90°-Schritten
  setIso(on) {
    this.cam.iso = on;
    if (on) {
      const step = Math.PI / 2;
      this.camGoal.yaw = Math.round((this.camGoal.yaw - Math.PI / 4) / step) * step + Math.PI / 4;
    }
    this.hooks.onIso?.(on);
  }

  turn(dir) {
    if (this.cam.iso) this.camGoal.yaw += dir * Math.PI / 2;
    else this.camGoal.yaw += dir * Math.PI / 4;
  }

  pitchFor(dist) { return this.cam.iso ? ISO_PITCH : 0.62 + 0.45 * Math.min(1, (dist - MIN_D) / 40); }

  update(dt) {
    const c = this.cam, g = this.camGoal;
    const pan = (this.keys.has('shift') ? 40 : 18) * dt * (c.dist / 30);
    let fx = 0, fz = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) fz -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) fz += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) fx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) fx += 1;
    if (fx || fz) this.panBy(fx * pan, fz * pan);
    if (!c.iso && this.keys.has('q')) g.yaw += dt * 1.6;
    if (!c.iso && this.keys.has('e')) g.yaw -= dt * 1.6;
    const k = 1 - Math.exp(-dt * 12);
    c.dist += (g.dist - c.dist) * k;
    c.yaw += (g.yaw - c.yaw) * k;
    c.pitch += (this.pitchFor(c.dist) - c.pitch) * k;
    c.target.x = Math.max(-2, Math.min(this.game.W + 2, c.target.x));
    c.target.z = Math.max(-2, Math.min(this.game.H + 2, c.target.z));
  }

  // Verschiebung in Kamerakoordinaten (x = rechts, z = zum Betrachter)
  panBy(sx, sz) {
    const y = this.cam.yaw;
    this.cam.target.x += Math.cos(y) * sx + Math.sin(y) * sz;
    this.cam.target.z += -Math.sin(y) * sx + Math.cos(y) * sz;
  }

  syncCamera() { this.r.applyCamera(this.cam); }

  focus(x, z) { this.cam.target.x = x; this.cam.target.z = z; }

  // ───────────────────────── Zeiger
  down(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (this.pointers.size === 2) {
      // Zwei Finger: Geste startet, laufende Aktion abbrechen
      this.cancelDrag();
      this.startGesture();
      return;
    }
    if (this.pointers.size > 2) return;
    const tile = this.pickTile(e);
    if (e.button === 2 || e.button === 1) { this.drag = { mode: e.button === 1 ? 'orbit' : 'pan', x: e.clientX, y: e.clientY, grab: this.groundAt(e) }; return; }
    if (this.tool === 'select') {
      this.drag = { mode: 'click', x: e.clientX, y: e.clientY, grab: this.groundAt(e), tile };
    } else if (this.tool === 'build') {
      if (this.buildType === 'band') this.drag = { mode: 'belt', start: tile, end: tile };
      else this.drag = { mode: 'place', tile };
      this.hoverTile = tile;
      this.refreshGhost();
    } else if (this.tool === 'delete') {
      this.drag = { mode: 'delete', done: new Set() };
      this.deleteAt(tile);
    }
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (p) { p.px = p.x; p.py = p.y; p.x = e.clientX; p.y = e.clientY; }
    if (this.pointers.size >= 2) { this.updateGesture(); return; }
    if (e.target !== this.canvas && !this.drag) { this.r.setHover(null); this.hooks.onHover?.(null); return; }
    const tile = this.pickTile(e);
    const d = this.drag;
    if (d) {
      if (d.mode === 'click' && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.mode = 'pan';
      if (d.mode === 'pan') { this.grabPan(e, d.grab); return; }
      if (d.mode === 'orbit') {
        if (this.cam.iso) return;
        this.camGoal.yaw -= (e.clientX - d.x) * 0.008;
        this.cam.yaw = this.camGoal.yaw;
        d.x = e.clientX; d.y = e.clientY;
        return;
      }
      if (d.mode === 'belt' && tile) { d.end = tile; }
      if (d.mode === 'place' && tile) d.tile = tile;
      if (d.mode === 'delete') this.deleteAt(tile);
    }
    if (!tile || tile.x !== this.hoverTile?.x || tile.z !== this.hoverTile?.z) {
      this.hoverTile = tile;
      this.refreshGhost();
    }
  }

  up(e, cancel = false) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.gesture) { if (this.pointers.size < 2) this.gesture = null; this.drag = null; return; }
    const d = this.drag;
    this.drag = null;
    if (!d || cancel) { this.refreshGhost(); return; }
    if (d.mode === 'click') {
      const ent = d.tile ? this.game.at(d.tile.x, d.tile.z) : null;
      this.select(ent);
      if (ent) this.hooks.sound?.('click');
    } else if (d.mode === 'belt') {
      this.placeBelts(this.beltPath(d.start, d.end));
    } else if (d.mode === 'place' && d.tile) {
      const { x, z } = this.anchor(d.tile);
      const res = this.game.canPlace(this.buildType, x, z);
      if (res.ok) {
        this.game.place(this.buildType, x, z, this.buildRot);
        this.hooks.sound?.('place');
      } else {
        this.game.toast(res.reason, 'warn');
        this.hooks.sound?.('error');
      }
    }
    if (e.pointerType !== 'mouse') this.hoverTile = null;
    this.refreshGhost();
  }

  cancelDrag() { this.drag = null; this.r.setBeltGhost([], () => true); this.refreshGhost(); }

  startGesture() {
    const [a, b] = [...this.pointers.values()];
    this.gesture = {
      d: Math.hypot(a.x - b.x, a.y - b.y),
      ang: Math.atan2(b.y - a.y, b.x - a.x),
      grab: this.groundAtXY((a.x + b.x) / 2, (a.y + b.y) / 2),
    };
  }

  updateGesture() {
    const gs = this.gesture;
    if (!gs) return;
    const [a, b] = [...this.pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (d > 10) { this.camGoal.dist = Math.min(MAX_D, Math.max(MIN_D, this.camGoal.dist * gs.d / d)); this.cam.dist = this.camGoal.dist; }
    let da = ang - gs.ang;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    if (!this.cam.iso) { this.camGoal.yaw -= da; this.cam.yaw = this.camGoal.yaw; }
    gs.d = d; gs.ang = ang;
    this.cam.pitch = this.pitchFor(this.cam.dist);
    this.grabPanXY((a.x + b.x) / 2, (a.y + b.y) / 2, gs.grab);
  }

  groundAt(e) { return this.groundAtXY(e.clientX, e.clientY); }
  groundAtXY(x, y) { this.syncCamera(); const p = this.r.pick(x, y); return p ? { x: p.fx, z: p.fz } : null; }
  grabPan(e, grab) { this.grabPanXY(e.clientX, e.clientY, grab); }
  grabPanXY(x, y, grab) {
    if (!grab) return;
    this.syncCamera();
    const p = this.r.pick(x, y);
    if (!p) return;
    this.cam.target.x += grab.x - p.fx;
    this.cam.target.z += grab.z - p.fz;
    this.syncCamera();
  }

  pickTile(e) {
    if (e.target !== this.canvas && !this.drag) return null;
    this.syncCamera();
    const p = this.r.pick(e.clientX, e.clientY);
    if (!p || !this.game.inBounds(p.x, p.z)) return null;
    return { x: p.x, z: p.z, fx: p.fx, fz: p.fz };
  }

  // Mehrfeld-Gebäude: Feld unter dem Zeiger ist die Mitte
  anchor(tile) {
    const s = BUILDINGS[this.buildType].size;
    if (s === 1) return { x: tile.x, z: tile.z };
    const g = this.game;
    let x = Math.max(0, Math.min(g.W - s, Math.round(tile.fx - s / 2)));
    let z = Math.max(0, Math.min(g.H - s, Math.round(tile.fz - s / 2)));
    // Rolltore rasten an der nächsten Außenwand ein
    if (BUILDINGS[this.buildType].wall) {
      const d = [z, g.W - s - x, g.H - s - z, x];
      const m = d.indexOf(Math.min(...d));
      if (m === 0) z = 0; else if (m === 1) x = g.W - s; else if (m === 2) z = g.H - s; else x = 0;
    }
    return { x, z };
  }

  refreshGhost() {
    const t = this.hoverTile, g = this.game;
    if (this.tool === 'build' && t) {
      if (this.buildType === 'band') {
        const path = this.drag?.mode === 'belt' ? this.beltPath(this.drag.start, this.drag.end) : [{ x: t.x, z: t.z, dir: this.buildRot }];
        this.r.setBeltGhost(path, p => this.beltOk(p));
        this.r.setGhost(null);
        this.r.setHover(null);
      } else {
        const { x, z } = this.anchor(t);
        this.r.setGhost(this.buildType, x, z, this.buildRot, g.canPlace(this.buildType, x, z).ok);
        this.r.setHover(null);
      }
      this.hooks.onHover?.(t);
      return;
    }
    this.r.setGhost(null);
    this.r.setBeltGhost([], () => true);
    if (t) {
      const ent = g.at(t.x, t.z);
      if (ent) { const s = BUILDINGS[ent.type].size; this.r.setHover(ent.x, ent.z, s, this.tool === 'delete' ? 0xee6018 : 0xffffff); }
      else this.r.setHover(t.x, t.z, 1, this.tool === 'delete' ? 0xee6018 : 0xffffff);
    } else this.r.setHover(null);
    this.hooks.onHover?.(t);
  }

  beltOk(p) {
    const ent = this.game.at(p.x, p.z);
    if (ent) return ent.type === 'band';
    return this.game.inBounds(p.x, p.z) && this.game.terrain[this.game.idx(p.x, p.z)] === 0;
  }

  beltPath(a, b) {
    if (!a || !b) return [];
    const dx = b.x - a.x, dz = b.z - a.z;
    if (!dx && !dz) return [{ x: a.x, z: a.z, dir: this.buildRot }];
    const tiles = [];
    const horizFirst = Math.abs(dx) >= Math.abs(dz);
    let x = a.x, z = a.z;
    tiles.push({ x, z });
    const stepX = () => { while (x !== b.x) { x += Math.sign(dx); tiles.push({ x, z }); } };
    const stepZ = () => { while (z !== b.z) { z += Math.sign(dz); tiles.push({ x, z }); } };
    if (horizFirst) { stepX(); stepZ(); } else { stepZ(); stepX(); }
    for (let i = 0; i < tiles.length; i++) {
      const cur = tiles[i], nxt = tiles[i + 1] || null, prev = tiles[i - 1];
      const ref = nxt ? [nxt.x - cur.x, nxt.z - cur.z] : [cur.x - prev.x, cur.z - prev.z];
      cur.dir = [0, 1, 2, 3].find(d => DX[d] === ref[0] && DZ[d] === ref[1]);
    }
    this.buildRot = tiles[tiles.length - 1].dir;
    return tiles;
  }

  placeBelts(path) {
    const g = this.game;
    let placed = 0, poor = false;
    for (const p of path) {
      const ent = g.at(p.x, p.z);
      if (ent) { if (ent.type === 'band' && g.setBeltDir(p.x, p.z, p.dir)) placed++; continue; }
      const res = g.canPlace('band', p.x, p.z);
      if (res.ok) { g.place('band', p.x, p.z, p.dir); placed++; }
      else if (res.reason === 'Zu wenig Geld') poor = true;
    }
    if (poor) g.toast('Zu wenig Geld für alle Bänder', 'warn');
    if (placed) this.hooks.sound?.('place');
    this.r.setBeltGhost([], () => true);
  }

  deleteAt(tile) {
    if (!tile) return;
    const ent = this.game.at(tile.x, tile.z);
    if (!ent || this.drag?.done?.has(ent.id)) return;
    this.drag?.done?.add(ent.id);
    if (this.game.remove(ent.id)) this.hooks.sound?.('delete');
  }

  // ───────────────────────── Tastatur
  key(e, down) {
    if (e.target.closest?.('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (!down) { this.keys.delete(k); if (k === 'shift') this.keys.delete('shift'); return; }
    this.keys.add(k);
    if (e.repeat) return;
    if (k === 'r') this.rotate();
    else if (k === 'i') this.setIso(!this.cam.iso);
    else if (this.cam.iso && (k === 'q' || k === 'e')) this.turn(k === 'q' ? 1 : -1);
    else if (k === 'x' || k === 'delete') this.setTool(this.tool === 'delete' ? 'select' : 'delete');
    else if (k === 'escape') { if (this.tool !== 'select') this.setTool('select'); else this.select(null); this.hooks.onEscape?.(); }
    else if (k === 'c' && this.selected != null) {
      const ent = this.game.entities.get(this.selected);
      if (ent && this.game.isUnlocked(ent.type)) { this.buildRot = ent.rot; this.setTool('build', ent.type); }
    } else if (k === 'c' && this.tool === 'select' && this.hoverTile) {
      const ent = this.game.at(this.hoverTile.x, this.hoverTile.z);
      if (ent && this.game.isUnlocked(ent.type)) { this.buildRot = ent.rot; this.setTool('build', ent.type); }
    }
    this.hooks.onKey?.(k, e);
  }
}
