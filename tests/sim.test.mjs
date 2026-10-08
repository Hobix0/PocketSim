// Headless-Tests der Simulation: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, migrate } from '../src/sim.js';
import { findPath } from '../src/logistics.js';
import { CONFIG } from '../src/data.js';

const STEP = 1 / CONFIG.tickRate;
const run = (g, seconds) => { for (let i = 0; i < seconds * CONFIG.tickRate; i++) g.tick(STEP); };

// Leere Halle (nur Trafo) mit Versand an der Ostwand in Zeile z0
function line(z0 = 4) {
  const g = new Game();
  g.newGame(42);
  for (const e of [...g.entities.values()]) if (e.type !== 'trafo') g.remove(e.id, false, true);
  g.money = 1e6;
  g.place('versand', g.W - 2, z0, 0, true);
  return { g };
}

// Starthalle ohne Altbestand, sonst wie im Spiel (Eingang, Versand, Regal, Staplerstation)
function hall() {
  const g = new Game();
  g.newGame(42);
  for (const e of [...g.entities.values()]) if (e.type === 'altregal' || e.type === 'altbuero' || e.type === 'palette') g.remove(e.id, false, true);
  g.money = 1e6;
  return g;
}

test('neue Halle: Tore, Trafo, Regal, Stapler, Stützen blockieren Felder', () => {
  const g = new Game();
  g.newGame(1);
  assert.equal(g.countBuildings(e => e.type === 'eingang'), 1);
  assert.equal(g.countBuildings(e => e.type === 'regal'), 1);
  assert.equal(g.forklifts.length, 1);
  assert.equal(g.countBuildings(e => e.type === 'versand'), 1);
  assert.ok(g.columns.length > 0);
  const [cx, cz] = g.columns[0];
  assert.equal(g.canPlace('band', cx, cz).ok, false);
});

test('Wandtore nur an der Außenwand und automatisch nach innen gedreht', () => {
  const g = new Game();
  g.newGame(2);
  g.money = 1e6;
  assert.equal(g.canPlace('eingang', 10, 5).reason, 'Muss an der Außenwand stehen');
  assert.equal(g.wallRotation(0, 5, 2), 1);
  assert.equal(g.wallRotation(g.W - 2, 5, 2), 3);
  assert.equal(g.wallRotation(5, 0, 2), 2);
});

test('Palettenfluss: Eingang → Regal → Aufgabe → Säge → Abnahme → Regal → Versand', () => {
  const g = hall();
  const feeder = g.place('aufgabe', 8, 4, 1);      // Bandseite Osten
  feeder.want = 'rundstahl';
  for (let x = 10; x < 12; x++) g.place('band', x, 4, 1);
  g.place('saege', 12, 4, 1);
  for (let x = 14; x < 17; x++) g.place('band', x, 4, 1);
  g.place('abnahme', 17, 4, 3);                    // Bandseite Westen
  run(g, 300);
  assert.ok((g.stats.bought.rundstahl || 0) >= 20, 'Paletten wurden eingekauft');
  assert.ok((g.stats.produced.rohling || 0) >= 40, `Säge hat produziert (${g.stats.produced.rohling || 0})`);
  assert.ok((g.stats.sold.rohling || 0) >= 20, `Rohlinge wurden per Palette versendet (${g.stats.sold.rohling || 0})`);
  assert.equal(g.stats.sold.rundstahl || 0, 0, 'Einkaufsware wird nicht versendet');
});

test('Rohlinge bleiben im Lager, wenn eine Aufgabestation sie anfordert', () => {
  const g = hall();
  const f = g.place('aufgabe', 20, 4, 1);
  f.want = 'rohling';
  const rack = [...g.entities.values()].find(e => e.type === 'regal');
  rack.slots[0] = g.newPallet('rohling', 20);
  run(g, 60);
  assert.equal(g.stats.sold.rohling || 0, 0);
  assert.ok(f.pallets.length > 0 || g.forklifts.some(fl => fl.carry?.item === 'rohling'), 'Palette ging zur Aufgabestation');
});

test('Abnahmestation gibt Teilpaletten nach Wartezeit frei', () => {
  const g = hall();
  const c = g.place('abnahme', 20, 4, 3);
  g.rebuild();
  for (let i = 0; i < 5; i++) assert.ok(g.insert(c, 'welle', 19, 4));
  assert.equal(g.insert(c, 'welle', 22, 4), false, 'nur von der Bandseite');
  assert.equal(c.pallets[0].ready, undefined);
  run(g, CONFIG.partialPickup + 1);
  assert.ok(c.pallets.length === 0 || c.pallets[0].ready || g.forklifts.some(f => f.carry), 'Teilpalette freigegeben');
});

test('Stapler finden Wege um Hindernisse und erkennen zugebaute Ziele', () => {
  const g = hall();
  for (let z = 2; z < 10; z++) g.place('band', 12, z, 0);
  const path = findPath(g, 10, 5, [{ x: 14, z: 5 }]);
  assert.ok(path && path.length > 4, 'Umweg um die Bahn');
  for (let z = 0; z < g.H; z++) if (!g.at(12, z) && g.terrain[g.idx(12, z)] === 0) g.place('band', 12, z, 0);
  assert.equal(findPath(g, 10, 5, [{ x: 14, z: 5 }]), null, 'durchgehende Bahn trennt die Halle');
});

test('Maschinen nehmen an der Ausgangsseite nichts an', () => {
  const { g } = line();
  const saw = g.place('saege', 10, 10, 1);       // Ausgang Osten (x = 12)
  g.rebuild();
  assert.equal(g.insert(saw, 'rundstahl', 12, 10, true), false, 'Vorderseite');
  assert.equal(g.insert(saw, 'rundstahl', 9, 10, true), true, 'Rückseite');
  assert.equal(g.insert(saw, 'rundstahl', 10, 9, true), true, 'Seite');
});

test('Maschinen geben nur nach vorne ab', () => {
  const { g } = line();
  const saw = g.place('saege', 10, 10, 1);
  saw.outBuf = { rohling: 4 };
  g.place('band', 9, 10, 3);                      // hinten, zeigt weg
  g.place('band', 12, 10, 1);                     // vorne, zeigt weg
  g.rebuild();
  g.tick(STEP);
  assert.equal(g.at(9, 10).items.length, 0);
  assert.equal(g.at(12, 10).items.length, 1);
});

test('Rollenbahn-Durchsatz entspricht Geschwindigkeit / Abstand', () => {
  const { g } = line();
  for (let x = 2; x < g.W - 2; x++) g.place('band', x, 4, 1);
  g.rebuild();
  const first = g.at(2, 4);
  const feed = seconds => { for (let i = 0; i < seconds * CONFIG.tickRate; i++) { g.insert(first, 'rundstahl', 1, 4); g.tick(STEP); } };
  feed(40);                                        // Bahn vollständig füllen
  const before = g.stats.sold.rundstahl || 0;
  feed(30);
  const perSec = ((g.stats.sold.rundstahl || 0) - before) / 30;
  const max = CONFIG.beltSpeed / CONFIG.beltSpacing;
  assert.ok(perSec > max * 0.85 && perSec <= max * 1.02, `Durchsatz ${perSec.toFixed(2)}/s, erwartet ≈ ${max}`);
});

test('Altbestand kostet Entsorgung', () => {
  const g = new Game();
  g.newGame(3);
  const office = [...g.entities.values()].find(e => e.type === 'altbuero');
  const before = g.money;
  assert.ok(g.remove(office.id));
  assert.equal(g.money, before - 400);
});

test('Speichern und Laden erhalten den Zustand', () => {
  const g = hall();
  const feeder = g.place('aufgabe', 8, 4, 1);
  for (let x = 10; x < 12; x++) g.place('band', x, 4, 1);
  g.place('saege', 12, 4, 1);
  for (let x = 14; x < 17; x++) g.place('band', x, 4, 1);
  g.place('abnahme', 17, 4, 3);
  run(g, 120);
  const json = JSON.parse(JSON.stringify(g.serialize()));
  const h = new Game();
  h.load(json);
  assert.equal(h.entities.size, g.entities.size);
  assert.equal(Math.round(h.money), Math.round(g.money));
  assert.equal(h.forklifts.length, g.forklifts.length);
  const before = h.stats.produced.rohling || 0;
  run(h, 60);
  assert.ok((h.stats.produced.rohling || 0) > before, 'Produktion läuft nach dem Laden weiter');
});

test('Spielstände: v2 abgelehnt, v3 wird migriert', () => {
  assert.throws(() => migrate({ v: 2 }), /älteren Version/);
  const m = migrate({ v: 3, entities: [{ type: 'lager' }, { type: 'eingang', item: 'stahlblech' }], goalIndex: 4 });
  assert.equal(m.v, 4);
  assert.equal(m.entities.length, 1);
  assert.equal(m.entities[0].order, 'stahlblech');
  assert.throws(() => migrate(null));
});
