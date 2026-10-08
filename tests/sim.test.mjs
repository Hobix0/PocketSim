// Headless-Tests der Simulation: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, migrate } from '../src/sim.js';
import { CONFIG } from '../src/data.js';

const STEP = 1 / CONFIG.tickRate;
const run = (g, seconds) => { for (let i = 0; i < seconds * CONFIG.tickRate; i++) g.tick(STEP); };

// Neue Halle ohne Altbestand, mit Wareneingang links und Versand rechts in Zeile z0
function line(z0 = 4) {
  const g = new Game();
  g.newGame(42);
  for (const e of [...g.entities.values()]) if (e.type !== 'trafo') g.remove(e.id, false, true);
  g.money = 1e6;
  const inb = g.place('eingang', 0, z0, 0, true);
  inb.item = 'rundstahl';
  g.place('versand', g.W - 2, z0, 0, true);
  return { g, inb };
}

test('neue Halle: Tore, Trafo, Stützen blockieren Felder', () => {
  const g = new Game();
  g.newGame(1);
  assert.equal(g.countBuildings(e => e.type === 'eingang'), 1);
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

test('Wareneingang → Bandsäge → Versand verkauft Rohlinge', () => {
  const { g } = line();
  const z = 4;
  for (let x = 2; x < 5; x++) g.place('band', x, z, 1);
  g.place('saege', 5, z, 1);                       // Ausgang zeigt nach Osten
  for (let x = 7; x < g.W - 2; x++) g.place('band', x, z, 1);
  run(g, 60);
  assert.ok((g.stats.bought.rundstahl || 0) > 20, 'Material wurde eingekauft');
  assert.ok((g.stats.produced.rohling || 0) > 20, 'Säge hat produziert');
  assert.ok((g.stats.sold.rohling || 0) > 10, 'Rohlinge wurden verkauft');
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
  const { g, inb } = line();
  inb.on = false;
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
  const { g } = line();
  for (let x = 2; x < g.W - 2; x++) g.place('band', x, 4, 1);
  run(g, 40);
  const json = JSON.parse(JSON.stringify(g.serialize()));
  const h = new Game();
  h.load(json);
  assert.equal(h.entities.size, g.entities.size);
  assert.equal(Math.round(h.money), Math.round(g.money));
  run(h, 5);
  assert.ok((h.stats.sold.rundstahl || 0) > (g.stats.sold.rundstahl || 0));
});

test('Alte Spielstände werden abgelehnt', () => {
  assert.throws(() => migrate({ v: 2 }), /älteren Version/);
  assert.throws(() => migrate(null));
});
