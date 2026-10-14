// Einstiegspunkt: Simulation, Darstellung und Oberfläche verdrahten; Eingabe und Spielschleife.
import { Game, SAVE_VERSION, footprint } from './sim.js';
import { Renderer } from './render.js';
import { UI, money } from './ui.js';
import { CONFIG, LOTS, FURNITURE, PRODUCTS, SHOP_TYPES } from './data.js';
import { sound, audio } from './audio.js';

const SAVE_KEY = 'pocketsim.cafe.save';
const SETTINGS_KEY = 'pocketsim.cafe.settings';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* egal */ } },
};

const game = new Game();
let hasSave = false;
try {
  const raw = store.get(SAVE_KEY);
  if (raw) {
    const data = JSON.parse(raw);
    if (data.v <= SAVE_VERSION) { game.load(data); hasSave = true; }
  }
} catch (err) { console.warn('Spielstand konnte nicht geladen werden', err); }

let settings = {};
try { settings = JSON.parse(store.get(SETTINGS_KEY) || '{}'); } catch { /* egal */ }
audio.on = settings.sound !== false;

const state = {
  tool: 'select', buildType: null, rot: 0, variant: 0, moveId: 0, selected: null,
  view: 0, speed: 1, paused: true, started: false, hover: null, touchPreview: null, panelShop: 0,
  sound: audio.on, photo: false,
};

const canvas = document.getElementById('scene');
const renderer = new Renderer(canvas, game);

function save(manual = false) {
  const ok = store.set(SAVE_KEY, JSON.stringify(game.serialize()));
  if (manual) ui.toast(ok ? 'Gespeichert' : 'Speichern nicht möglich', ok ? 'good' : 'bad');
}

const isWall = (type) => FURNITURE[type]?.layer === 'wall';

// ───────────── Aktionen (von UI und Eingabe genutzt) ─────────────

let photoResume = false;
const actions = {
  setSpeed(v) {
    if (!state.started) return;
    if (v === 0) state.paused = true;
    else { state.speed = v; state.paused = false; }
    ui.update();
  },
  setTool(t) {
    state.tool = t;
    if (t !== 'build') state.buildType = t === 'move' ? state.buildType : null;
    if (t !== 'move') state.moveId = 0;
    state.touchPreview = null;
    if (t !== 'select') state.selected = null;
    renderer.setBuildMode(t === 'build' || t === 'move');
    renderer.setSelected(null);
    if (t !== 'build' && t !== 'move') renderer.setGhost(null);
    ui.update();
  },
  pickBuild(type) {
    state.buildType = state.buildType === type ? null : type;
    state.variant = 0;
    state.touchPreview = null;
    if (!state.buildType) renderer.setGhost(null);
    ui.update();
  },
  rotate() {
    if (state.tool === 'build' || state.tool === 'move') { state.rot = (state.rot + 1) & 3; return; }
    if (state.selected?.kind === 'item') actions.inspectorAction('rotate');
  },
  setView(v) {
    state.view = v;
    renderer.setView(v);
    state.selected = null;
    renderer.setSelected(null);
    renderer.setGhost(null);
    state.touchPreview = null;
    if (v === 'out' && state.tool !== 'select') actions.setTool('select');
    ui.update(true);
  },
  inspectorAction(act, arg) {
    const sel = state.selected;
    if (act === 'close') { state.selected = null; renderer.setSelected(null); return ui.update(); }
    if (act === 'pet' && sel?.kind === 'agent') { game.pet(sel.id); sound.purr(); return ui.update(); }
    if (!sel || sel.kind !== 'item') return;
    const it = game.items.get(sel.id);
    if (!it) return;
    if (act === 'variant') {
      game.setVariant(it.id, Number(arg));
    } else if (act === 'rotate') {
      const r = game.move(it.id, it.x, it.z, (it.rot + 1) & 3);
      if (!r.ok) {
        // Bei nicht quadratischen Möbeln darf sich die Ecke verschieben
        const alt = [[0, 0], [-1, 0], [0, -1], [1, 0], [0, 1], [-1, -1]].map(([dx, dz]) => game.move(it.id, it.x + dx, it.z + dz, (it.rot + 1) & 3)).find((x) => x.ok);
        if (!alt) ui.toast(r.reason, 'bad');
      }
      renderer.setSelected(game.items.get(it.id));
    } else if (act === 'move') {
      state.moveId = it.id;
      state.buildType = it.type;
      state.variant = it.v || 0;
      state.rot = it.rot;
      state.tool = 'move';
      state.selected = null;
      renderer.setSelected(null);
      renderer.setBuildMode(true);
    } else if (act === 'sell') {
      const back = game.remove(it.id);
      ui.toast(`${FURNITURE[it.type].name} verkauft (+${money(back)})`);
      state.selected = null;
      renderer.setSelected(null);
    }
    ui.update();
  },
  panelAction(act, args) {
    const shopId = Number(args[0]);
    switch (act) {
      case 'tab': state.panelShop = shopId; break;
      case 'price': {
        const s = game.shops.get(shopId);
        game.setPrice(shopId, args[1], s.menu[args[1]].price + Number(args[2]));
        break;
      }
      case 'product': game.toggleProduct(shopId, args[1], args[2]); break;
      case 'buy': if (!game.buy(shopId, args[1], Number(args[2]))) ui.toast('Nicht genug Geld', 'bad'); break;
      case 'auto': game.shops.get(shopId).auto[args[1]] = args[2]; break;
      case 'hire': game.hire(shopId); break;
      case 'fire': game.fire(shopId); break;
      case 'buyLot': {
        const f = Number(args[0]);
        const r = game.buyLot(f);
        if (r.ok) { ui.toast(`${LOTS[f].name} gekauft – such dir einen Laden aus!`, 'good'); sound.chime(); actions.setView(f); ui.openPanel('building'); }
        else ui.toast(r.reason, 'bad');
        break;
      }
      case 'openShop': {
        const f = Number(args[0]);
        const s = game.openShop(f, args[1]);
        if (s) {
          ui.toast(`${s.name} eröffnet – jetzt einrichten!`, 'good');
          sound.chime();
          ui.closeModal();
          actions.setView(f);
          actions.setTool('build');
        }
        break;
      }
      case 'rename': {
        const s = game.shops.get(shopId);
        const name = String(args[1]).trim().slice(0, 24);
        if (s && name) { s.name = name; game.designVersion++; }
        break;
      }
      case 'view': ui.closeModal(); actions.setView(Number(args[0])); break;
      case 'save': save(true); break;
      case 'sound':
        audio.on = state.sound = !audio.on;
        store.set(SETTINGS_KEY, JSON.stringify({ sound: audio.on }));
        sound.rain(game.weather.type === 'regen');
        break;
      case 'newGame':
        if (confirm('Wirklich neu anfangen? Der bisherige Spielstand geht verloren.')) {
          store.del(SAVE_KEY);
          location.reload();
        }
        break;
      default:
    }
    ui.update();
  },
  reportClosed() {
    state.paused = false;
    save();
    sound.rain(game.weather.type === 'regen');
    ui.update();
  },
  // Fotomodus: Oberfläche aus, Spiel pausiert, Tageszeit frei wählbar
  photoMode(on) {
    if (on === state.photo) return;
    state.photo = on;
    document.body.classList.toggle('photo', on);
    document.getElementById('photoBar').classList.toggle('hidden', !on);
    if (on) {
      photoResume = !state.paused;
      state.paused = true;
      ui.closeModal();
      state.selected = null;
      renderer.setSelected(null);
      renderer.setGhost(null);
      renderer.setBuildMode(false);
    } else {
      renderer.clockOverride = null;
      state.paused = !photoResume;
      renderer.setBuildMode(state.tool === 'build' || state.tool === 'move');
    }
    ui.update();
  },
  photoTime(which) {
    renderer.clockOverride = { morning: 8 * 60 + 10, noon: 13 * 60, evening: 18 * 60 + 50 }[which];
  },
  savePhoto() {
    const a = document.createElement('a');
    a.href = renderer.screenshot();
    a.download = `pocketsim-cafe-tag${game.day}.jpg`;
    a.click();
  },
};

const ui = new UI(game, renderer, state, actions);

// ───────────── Eingabe ─────────────

let down = null;
canvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  down = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType, button: e.button };
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') state.hover = renderer.pickCell(e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => { if (!down) state.hover = null; });
window.addEventListener('pointerup', (e) => {
  const d = down;
  down = null;
  if (!d || e.target !== canvas) return;
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.t > 650 || d.button > 0) return;
  click(e.clientX, e.clientY, d.type);
});

function click(cx, cy, pointerType) {
  if (!state.started || state.photo) return;
  // In der Straßenansicht: Klick auf einen Laden springt hinein
  if (state.view === 'out' && state.tool === 'select' && !renderer.pickAgent(cx, cy)) {
    const lot = renderer.pickLot(cx, cy);
    if (lot != null) return actions.setView(lot);
  }
  const cell = renderer.pickCell(cx, cy);
  const f = state.view;
  if (state.tool === 'select') {
    const agent = renderer.pickAgent(cx, cy);
    if (agent) { state.selected = { kind: 'agent', id: agent }; renderer.setSelected(null); return ui.update(); }
    let id = renderer.pickItem(cx, cy);
    if (!id && cell?.inside && f !== 'out') id = game.itemAt(f, cell.x, cell.z)?.id;
    if (id) { state.selected = { kind: 'item', id }; renderer.setSelected(game.items.get(id)); }
    else { state.selected = null; renderer.setSelected(null); }
    return ui.update();
  }
  if (f === 'out' || !cell) return;
  if (state.tool === 'sell') {
    const id = renderer.pickItem(cx, cy) || (cell.inside && game.itemAt(f, cell.x, cell.z)?.id);
    if (!id) return;
    const it = game.items.get(id);
    const back = game.remove(id);
    ui.toast(`${FURNITURE[it.type].name} verkauft (+${money(back)})`);
    return ui.update();
  }
  if ((state.tool === 'build' || state.tool === 'move') && state.buildType) {
    const o = anchor(state.buildType, cell, state.rot);
    // Auf Touchgeräten erst Vorschau zeigen, zweites Tippen baut
    if (pointerType !== 'mouse') {
      const same = state.touchPreview && state.touchPreview.x === o.x && state.touchPreview.z === o.z && state.touchPreview.rot === o.rot;
      if (!same) { state.touchPreview = { ...o }; state.hover = cell; return; }
    }
    if (state.tool === 'move') {
      const r = game.move(state.moveId, o.x, o.z, o.rot);
      if (!r.ok) return ui.toast(r.reason, 'bad');
      actions.setTool('select');
      state.selected = { kind: 'item', id: r.item.id };
      renderer.setSelected(r.item);
      return ui.update();
    }
    const r = game.place(state.buildType, f, o.x, o.z, o.rot, state.variant);
    if (!r.ok) return ui.toast(r.reason, 'bad');
    sound.click();
    state.touchPreview = null;
    ui.update();
  }
}

// Möbel so ansetzen, dass die angetippte Zelle in seiner Mitte liegt.
// Wandobjekte drehen sich selbst zur nächsten Wand.
function anchor(type, cell, rot) {
  if (isWall(type)) {
    const cx = Math.max(0, Math.min(CONFIG.W - 1, cell.x)), cz = Math.max(0, Math.min(CONFIG.D - 1, cell.z));
    const r = game.wallRotFor(type, cx, cz);
    const [fw, fd] = footprint(type, r);
    const x = r === 0 ? cx - Math.floor((fw - 1) / 2) : r === 1 ? 0 : CONFIG.W - fw;
    const z = r === 0 ? 0 : cz - Math.floor((fd - 1) / 2);
    return { x: Math.max(0, Math.min(CONFIG.W - fw, x)), z: Math.max(0, Math.min(CONFIG.D - fd, z)), rot: r };
  }
  const [w, d] = footprint(type, rot);
  return { x: cell.x - Math.floor((w - 1) / 2), z: cell.z - Math.floor((d - 1) / 2), rot };
}

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (!state.started) return;
  const k = e.key.toLowerCase();
  if (state.photo) { if (k === 'escape' || k === 'p') actions.photoMode(false); return; }
  if (k === 'r') actions.rotate();
  else if (k === 'escape') {
    if (ui.panel) ui.closeModal();
    else if (state.tool !== 'select') actions.setTool('select');
    else { state.selected = null; renderer.setSelected(null); ui.update(); }
  } else if (k === ' ') { e.preventDefault(); actions.setSpeed(state.paused ? state.speed : 0); }
  else if (k === '1') actions.setSpeed(1);
  else if (k === '2') actions.setSpeed(2);
  else if (k === '3') actions.setSpeed(4);
  else if (k === 'b') actions.setTool(state.tool === 'build' ? 'select' : 'build');
  else if (k === 'p') actions.photoMode(true);
  else if (k === 'delete' || k === 'backspace') { if (state.selected?.kind === 'item') actions.inspectorAction('sell'); }
  else if (k === 'pageup' || k === 'pagedown') {
    const order = ['out', ...LOTS.map((_, i) => i)];
    const i = order.indexOf(state.view);
    actions.setView(order[Math.max(0, Math.min(order.length - 1, i + (k === 'pageup' ? 1 : -1)))]);
  }
});

// ───────────── Bauvorschau ─────────────

function updateGhost() {
  const building = !state.photo && (state.tool === 'build' || state.tool === 'move') && state.buildType && state.view !== 'out';
  const cell = state.touchPreview ? null : state.hover;
  if (!building || (!cell && !state.touchPreview) || (cell && !cell.inside && !state.touchPreview)) {
    renderer.setGhost(null);
    renderer.setHover(!state.photo && state.tool === 'select' && state.hover?.inside ? state.hover : null);
    return;
  }
  const o = state.touchPreview || anchor(state.buildType, cell, state.rot);
  const check = game.canPlace(state.buildType, state.view, o.x, o.z, o.rot, state.tool === 'move' ? state.moveId : 0);
  const afford = state.tool === 'move' || game.money >= FURNITURE[state.buildType].cost;
  renderer.setGhost(state.buildType, state.view, o.x, o.z, o.rot, check.ok && afford, state.variant);
  renderer.setHover(null);
  const hint = document.getElementById('hint');
  if (!check.ok) hint.textContent = check.reason;
  else if (!afford) hint.textContent = 'Nicht genug Geld';
  else if (state.touchPreview) hint.textContent = 'Nochmal tippen zum Bauen · ⟳ dreht';
}

// ───────────── Spielschleife ─────────────

let last = performance.now(), acc = 0, uiAcc = 0, saveAcc = 0, lastWeather = null;
const STEP = 1 / CONFIG.tickRate;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.started && !state.paused) {
    acc += dt * state.speed;
    let n = 0;
    while (acc >= STEP && n++ < 40) { game.tick(STEP); acc -= STEP; }
    if (n >= 40) acc = 0;
  }
  const fx = game.fx.splice(0);
  for (const e of fx) {
    if (e.kind === 'dayEnd') {
      state.paused = true;
      ui.showReport(e.report);
      sound.chime();
      save();
    } else if (e.kind === 'toast') {
      ui.toast(e.text, e.tone);
      if (e.text.startsWith('Tagesaufgabe')) sound.chime();
    } else if (e.kind === 'money' && !e.tip && (state.view === 'out' || state.view === e.lot)) sound.ding();
  }
  if (lastWeather !== game.weather.type && state.started) { lastWeather = game.weather.type; sound.rain(lastWeather === 'regen'); }
  updateGhost();
  if (renderer.clockOverride != null) {
    const real = game.clock;
    game.clock = renderer.clockOverride;
    renderer.frame(0, fx, dt);
    game.clock = real;
  } else renderer.frame(state.paused ? 0 : dt * state.speed, fx, dt);
  uiAcc += dt;
  if (uiAcc > 0.25) { uiAcc = 0; if (!state.photo) ui.update(); }
  saveAcc += dt;
  if (saveAcc > 20 && state.started) { saveAcc = 0; save(); }
  requestAnimationFrame(loop);
}

// ───────────── Titelbildschirm ─────────────

function start() {
  sound.unlock();
  document.getElementById('title').classList.add('hidden');
  state.started = true;
  state.paused = false;
  if (!hasSave) {
    actions.setTool('build');
    const st = SHOP_TYPES[game.shopOnLot(0).type];
    ui.toast(`Willkommen! Stell zuerst ${st.mode === 'counter' ? 'eine Theke' : 'eine Kasse'} auf.`, 'good');
  } else if (game.quest && !game.quest.done) ui.toast(`Heute: ${game.quest.text}`);
  sound.rain(game.weather.type === 'regen');
  ui.update(true);
}

const titleActions = document.getElementById('titleActions');
const choice = () => `<div class="startpick">${Object.entries(SHOP_TYPES).map(([id, t]) => `<button class="shoptype" data-start="${id}" ${t.available ? '' : 'disabled'}><b>${t.icon} ${t.name}</b><small>${t.desc}</small>${t.available ? '' : '<span class="soon">bald verfügbar</span>'}</button>`).join('')}</div>`;
titleActions.innerHTML = hasSave
  ? `<button class="btn primary" id="continue">Weiterspielen · Tag ${game.day}</button><button class="btn" id="fresh">Neues Spiel</button>`
  : `<div class="pickhead">Mit welchem Laden fängst du an?</div>${choice()}`;
document.getElementById('continue')?.addEventListener('click', start);
titleActions.addEventListener('click', (e) => {
  const b = e.target.closest('[data-start]');
  if (!b || b.disabled) return;
  store.del(SAVE_KEY);
  game.newGame(undefined, b.dataset.start);
  hasSave = false;
  start();
});
document.getElementById('fresh')?.addEventListener('click', () => {
  if (!confirm('Bisherigen Spielstand löschen und neu anfangen?')) return;
  titleActions.innerHTML = `<div class="pickhead">Mit welchem Laden fängst du an?</div>${choice()}`;
});
document.getElementById('loading').textContent = '';
window.addEventListener('beforeunload', () => { if (state.started) save(); });
renderer.setView(0);
ui.update(true);
requestAnimationFrame(loop);

// Für Tests und Neugierige
window.pocketsim = { game, state, renderer, ui, actions, PRODUCTS };
