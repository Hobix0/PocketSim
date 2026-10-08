// Einstiegspunkt: Spiel, Renderer, Steuerung und UI verdrahten; Spielschleife.
import { Game } from './sim.js';
import { Renderer } from './render.js';
import { Controls } from './input.js';
import { UI } from './ui.js';
import { sound, audio } from './audio.js';
import { BUILDINGS, ITEM_IDS, CONFIG } from './data.js';
import { loadLibrary } from './models.js';

const SAVE_KEY = 'pocketsim.hall.save';
const SETTINGS_KEY = 'pocketsim.hall.settings';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* egal */ } },
};

const game = new Game();
game.speed = 1;
game.paused = true;

// Eigene Modelle aus models/ laden (falls vorhanden), bevor Szene und Vorschaubilder entstehen
await loadLibrary();

let hasSave = false, loadError = null;
try {
  const raw = store.get(SAVE_KEY);
  if (raw) { game.load(JSON.parse(raw)); hasSave = true; }
} catch (err) { loadError = err; console.warn('Spielstand konnte nicht geladen werden', err); }
if (!hasSave) game.newGame();

const canvas = document.getElementById('scene');
const renderer = new Renderer(canvas, game);
renderer._initialSync = true;
renderer.syncWorld();

const thumbs = Renderer.thumbnails(Object.keys(BUILDINGS), ITEM_IDS);

let ui;
const controls = new Controls(canvas, game, renderer, {
  onSelect: e => ui?.onSelect(e),
  onTool: () => ui?.onTool(),
  onHover: t => ui?.onHover(t),
  onKey: (k, e) => { if (k === 'tab') e.preventDefault(); ui?.onKey(k); },
  onEscape: () => ui?.onEscape(),
  onIso: on => ui?.onIso(on),
  sound,
});

const api = {
  save() { store.set(SAVE_KEY, JSON.stringify(game.serialize())); },
  newGame(seed) {
    game.newGame(seed);
    renderer._initialSync = true;
    renderer.syncWorld();
    controls.select(null);
    controls.focus(game.W / 2, game.H / 2 + 1);
    ui.renderGoal(); ui.renderContracts(); ui.renderBuild();
    api.save();
  },
  exportSave() {
    const blob = new Blob([JSON.stringify(game.serialize())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pocketsim-tag${game.day}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  importSave(data) {
    game.load(data);
    renderer._initialSync = true;
    renderer.syncWorld();
    controls.select(null);
    ui.renderGoal(); ui.renderContracts(); ui.renderBuild();
    api.save();
  },
  saveSettings() {
    store.set(SETTINGS_KEY, JSON.stringify({ ...renderer.quality, sound: audio.enabled, iso: controls.cam.iso }));
  },
};

try {
  const s = JSON.parse(store.get(SETTINGS_KEY) || 'null');
  if (s) {
    renderer.setQuality({ shadows: s.shadows ?? true, bloom: s.bloom ?? true, ao: s.ao ?? renderer.quality.ao, trusses: s.trusses ?? true });
    audio.enabled = s.sound !== false;
    if (s.iso) controls.cam.iso = true;
  }
} catch { /* Standardwerte */ }

ui = new UI(game, controls, renderer, thumbs, api);
if (controls.cam.iso) controls.setIso(true);
if (loadError) setTimeout(() => ui.toast(`${loadError.message}. Es startet ein neues Spiel.`, 'warn'), 600);
game.on('money', () => sound('money'));

// ───────────────────────── Titelbildschirm
const title = document.getElementById('title');
const actions = document.getElementById('titleActions');
document.getElementById('loading').remove();
let attract = true;
const start = () => {
  attract = false;
  game.paused = false;
  ui.renderSpeed();
  title.classList.add('out');
  setTimeout(() => title.remove(), 600);
  sound('success');
};
actions.innerHTML = (hasSave ? `<button class="btn" id="btnContinue"><span>Weiterspielen · Tag ${game.day}</span><span>→</span></button>` : '')
  + `<button class="btn ${hasSave ? 'ghost' : ''}" id="btnNew"><span>Neues Spiel</span><span>→</span></button>`;
document.getElementById('btnContinue')?.addEventListener('click', start);
document.getElementById('btnNew').addEventListener('click', () => {
  if (hasSave && !confirm('Neues Spiel beginnen? Der bisherige Spielstand wird überschrieben.')) return;
  const seedVal = parseInt(document.getElementById('seedInput').value, 10);
  api.newGame(Number.isFinite(seedVal) ? seedVal : undefined);
  start();
});

// ───────────────────────── Schleife
const STEP = 1 / CONFIG.tickRate;
let last = performance.now(), saveTimer = 0, acc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!game.paused) {
    // Feste Tickrate: gleichmäßige, reproduzierbare Simulation unabhängig von der Bildrate
    acc = Math.min(acc + dt * game.speed, 0.5);
    while (acc >= STEP) { game.tick(STEP); acc -= STEP; }
    saveTimer += dt;
    if (saveTimer > 30) { saveTimer = 0; api.save(); }
  } else if (game.dirty) game.rebuild();
  if (attract && !controls.cam.iso) controls.camGoal.yaw += dt * 0.05;
  controls.update(dt);
  renderer.render(dt, controls.cam);
  ui.frame(dt);
}
requestAnimationFrame(loop);

addEventListener('visibilitychange', () => { if (document.hidden && !attract) api.save(); });
addEventListener('pagehide', () => { if (!attract) api.save(); });

// Für Debugging in der Konsole
window.pocketsim = { game, renderer, controls, ui };
