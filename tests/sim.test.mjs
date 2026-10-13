// Headless-Tests der Simulation: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim.js';
import { findPath } from '../src/path.js';
import { CONFIG } from '../src/data.js';

const STEP = 1 / CONFIG.tickRate;
const run = (g, seconds, until) => {
  for (let i = 0; i < seconds * CONFIG.tickRate; i++) {
    g.tick(STEP);
    if (until && until()) return true;
  }
  return false;
};

// Funktionierendes Mini-Café im Erdgeschoss
function cafe(seed = 7) {
  const g = new Game(seed);
  g.money = 1e6;
  const shop = g.shopOnFloor(0);
  assert.ok(g.place('theke', 0, 6, 2, 0).ok);
  assert.ok(g.place('kaffeemaschine', 0, 8, 2, 2).ok);
  assert.ok(g.place('vitrine', 0, 4, 2, 0).ok);
  assert.ok(g.place('tisch', 0, 3, 7, 0).ok);
  assert.ok(g.place('stuhl', 0, 2, 7, 0).ok);
  assert.ok(g.place('stuhl', 0, 4, 7, 0).ok);
  g.hire(shop.id);
  g.clock = CONFIG.openFrom;
  return { g, shop };
}

test('Wegfindung umgeht Hindernisse und schneidet keine Ecken', () => {
  const wall = new Set(['2,0', '2,1', '2,2', '2,3']);
  const p = findPath(5, 5, (x, z) => wall.has(`${x},${z}`), 0, 0, 4, 0);
  assert.ok(p && p.length);
  for (const [x, z] of p) assert.ok(!wall.has(`${x},${z}`));
  assert.ok(p.some(([, z]) => z === 4), 'muss unten herum laufen');
  assert.equal(findPath(3, 1, (x) => x === 1, 0, 0, 2, 0), null);
});

test('neues Spiel: Erdgeschoss mit Café, obere Etagen gesperrt', () => {
  const g = new Game(1);
  assert.equal(g.floors[0].unlocked, true);
  assert.equal(g.shopOnFloor(0).type, 'cafe');
  assert.equal(g.floors[1].unlocked, false);
  const st = g.shopStatus(g.shopOnFloor(0));
  assert.equal(st.ready, false);
  assert.ok(st.reasons.includes('Theke mit Kasse fehlt'));
});

test('Platzieren: belegt, Treppenhaus, Eingang und Kosten', () => {
  const g = new Game(1);
  const m0 = g.money;
  assert.ok(g.place('tisch', 0, 5, 5, 0).ok);
  assert.equal(g.money, m0 - 140);
  assert.equal(g.place('stuhl', 0, 5, 5, 0).reason, 'Platz belegt');
  assert.equal(g.place('stuhl', 0, 0, 0, 0).reason, 'Treppenhaus');
  assert.equal(g.place('stuhl', 0, CONFIG.doorX, CONFIG.D - 1, 0).reason, 'Laufweg muss frei bleiben');
  assert.equal(g.place('stuhl', 1, 5, 5, 0).reason, 'Etage noch nicht angemietet');
  // Teppich liegt unter Möbeln
  assert.ok(g.place('teppich', 0, 5, 5, 0).ok);
  assert.ok(g.place('pflanze', 0, 6, 6, 0).ok);
  // Verkaufen gibt die Hälfte zurück
  const id = g.itemAt(0, 6, 6).id;
  const before = g.money;
  g.remove(id);
  assert.equal(g.money, before + 30);
});

test('Theke braucht Platz davor und darf nicht vom Eingang abgeschnitten werden', () => {
  const g = new Game(1);
  g.money = 1e6;
  // Vorderseite zur Rückwand gedreht → kein Platz für Gäste
  assert.equal(g.place('theke', 0, 6, 0, 2).ok, false);
  assert.ok(g.place('theke', 0, 6, 0, 0).ok);
  // Feld vor der Kasse zubauen geht nicht
  assert.equal(g.place('pflanze', 0, 6, 2, 0).reason, 'Vor der Theke muss Platz für Gäste sein');
});

test('Sitzplätze: Stuhl zählt nur mit Tisch daneben, Sofa hat zwei', () => {
  const g = new Game(1);
  g.money = 1e6;
  g.place('stuhl', 0, 5, 5, 0);
  assert.equal(g.derived[0].seats.length, 0);
  g.place('tisch', 0, 6, 5, 0);
  assert.equal(g.derived[0].seats.length, 1);
  assert.ok(Math.abs(g.derived[0].seats[0].yaw - Math.PI / 2) < 1e-6, 'Stuhl schaut zum Tisch');
  g.place('sofa', 0, 8, 5, 0);
  assert.equal(g.derived[0].seats.length, 3);
});

test('Gäste kommen, stellen sich an, kaufen und zahlen', () => {
  const { g, shop } = cafe();
  assert.equal(g.shopStatus(shop).serving, true);
  const m0 = g.money;
  run(g, 240);
  assert.ok(g.today.served >= 3, `nur ${g.today.served} bedient`);
  assert.ok(g.today.revenue > 0);
  assert.ok(g.money > m0 - 200, 'Umsatz gleicht Nachbestellungen aus');
  assert.ok(Object.keys(g.today.sold).length > 0);
});

test('manche Gäste setzen sich hin', () => {
  const { g } = cafe(3);
  let sat = false;
  run(g, 600, () => {
    sat = [...g.agents.values()].some((a) => a.state === 'sitting');
    return sat;
  });
  assert.ok(sat, 'niemand hat sich gesetzt');
});

test('zu teuer: Gäste drehen an der Tür um', () => {
  const { g, shop } = cafe();
  for (const p of Object.keys(shop.menu)) g.setPrice(shop.id, p, 25);
  run(g, 240);
  assert.equal(g.today.served, 0);
  assert.ok(g.today.lostPrice > 0);
});

test('ohne Barista wird nicht verkauft', () => {
  const { g, shop } = cafe();
  g.fire(shop.id);
  run(g, 120);
  assert.equal(g.today.served, 0);
  assert.equal(g.shopStatus(shop).serving, false);
});

test('Tagesende: Lohn und Miete, frische Ware verdirbt, neuer Tag beginnt', () => {
  const { g, shop } = cafe();
  g.buy(shop.id, 'croissant', 2);
  const day = g.day;
  run(g, (CONFIG.openUntil - g.clock) + 200, () => g.day > day);
  assert.equal(g.day, day + 1);
  assert.equal(g.clock, CONFIG.dayStart);
  const r = g.history.at(-1);
  assert.equal(r.wages, CONFIG.wage);
  assert.equal(r.rent, 95);
  assert.equal(shop.stock.croissant, 0);
  assert.equal(g.agents.size, 0);
});

test('Etage anmieten, Café oben eröffnen, Gäste nehmen die Treppe', () => {
  const g = new Game(5);
  g.money = 1e6;
  assert.equal(g.openShop(1, 'cafe'), null, 'gesperrt');
  assert.ok(g.unlockFloor(1).ok);
  assert.equal(g.openShop(1, 'buchladen'), null, 'Buchladen noch nicht verfügbar');
  const shop = g.openShop(1, 'cafe');
  assert.ok(shop);
  assert.ok(g.place('theke', 1, 7, 2, 0).ok);
  assert.ok(g.place('kaffeemaschine', 1, 9, 2, 0).ok);
  g.hire(shop.id);
  g.clock = CONFIG.openFrom;
  let up = false, back = false;
  run(g, 400, () => {
    for (const a of g.agents.values()) {
      if (a.shop === shop.id && a.floor === 1 && a.state === 'queue') up = true;
      if (up && a.shop === shop.id && a.state === 'leaving' && a.floor === 0) back = true;
    }
    return up && back;
  });
  assert.ok(up, 'kein Gast oben angekommen');
  assert.ok(back, 'kein Gast wieder herunter gekommen');
  assert.ok(g.today.served > 0);
});

test('Treppe darf nicht verbaut werden', () => {
  const g = new Game(1);
  g.money = 1e6;
  // Riegel quer durch die Etage zwischen Eingang und Treppe
  for (let z = 0; z < CONFIG.D; z++) {
    const r = g.place('pflanze', 0, 3, z, 0);
    if (z < CONFIG.D - 1) assert.ok(r.ok, `z=${z} ${r.reason}`);
    else assert.equal(r.reason, 'Treppe wäre vom Eingang nicht erreichbar');
  }
});

test('Umbau während Betrieb: Theke entfernen schickt Wartende heim', () => {
  const { g } = cafe();
  run(g, 120, () => [...g.regState.values()].some((r) => r.queue.length > 0));
  const reg = g.derived[0].registers[0];
  g.remove(reg.id);
  for (const a of g.agents.values()) if (a.kind === 'customer') assert.ok(['leaving', 'exit', 'approach', 'toSeat', 'sitting'].includes(a.state), a.state);
  run(g, 60);
});

test('Speichern und Laden', () => {
  const { g, shop } = cafe();
  run(g, 100);
  const data = JSON.parse(JSON.stringify(g.serialize()));
  const h = new Game(99);
  h.load(data);
  assert.equal(h.items.size, g.items.size);
  assert.equal(h.money, g.money);
  assert.equal(h.shopOnFloor(0).staff, shop.staff);
  assert.equal(h.derived[0].seats.length, g.derived[0].seats.length);
  run(h, 60);
});

test('Ein ganzer Tag läuft stabil durch', () => {
  const { g } = cafe(11);
  const day = g.day;
  run(g, 900, () => g.day > day);
  const r = g.history.at(-1);
  assert.ok(r.served > 20, `nur ${r.served} Gäste`);
  assert.ok(r.revenue > 100);
  for (const v of [g.money, g.rep]) assert.ok(Number.isFinite(v));
});

test('ohne Vitrine: Snack-Wunsch zählt nicht als „zu teuer“', () => {
  const g = new Game(4);
  g.money = 1e6;
  const shop = g.shopOnFloor(0);
  g.place('theke', 0, 6, 2, 0);
  g.place('kaffeemaschine', 0, 8, 2, 2);
  g.hire(shop.id);
  for (const p of Object.keys(shop.menu)) g.setPrice(shop.id, p, 1);
  g.clock = CONFIG.openFrom;
  run(g, 300);
  assert.ok(g.today.served > 0);
  assert.equal(g.today.lostPrice, 0);
});
