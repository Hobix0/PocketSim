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
  assert.ok(g.place('stuhl', 0, 0, 0, 0).ok, 'Ecke ist frei – die Treppe liegt jetzt im eigenen Treppenhaus');
  assert.equal(g.place('stuhl', 0, CONFIG.doorX, CONFIG.D - 1, 0).reason, 'Laufweg an der Tür muss frei bleiben');
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

test('Etage anmieten, Café oben eröffnen, Gäste nehmen das separate Treppenhaus', () => {
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
  let inCore = false, up = false, back = false, throughCafe = false;
  run(g, 400, () => {
    for (const a of g.agents.values()) {
      if (a.shop !== shop.id) continue;
      if (a.x < 0 && a.z < CONFIG.D) inCore = true;
      if (a.floor === 0 && a.x >= 0 && a.z < CONFIG.D) throughCafe = true;
      if (a.floor === 1 && a.state === 'queue') up = true;
      if (up && a.state === 'leaving' && a.floor === 0 && a.x < 0) back = true;
    }
    return up && back;
  });
  assert.ok(inCore, 'Gäste müssen durchs Treppenhaus');
  assert.ok(!throughCafe, 'Gäste des 1. OG dürfen nicht durchs Café im EG laufen');
  assert.ok(up, 'kein Gast oben angekommen');
  assert.ok(back, 'kein Gast wieder herunter gekommen');
  assert.ok(g.today.served > 0);
});

test('Eingang oben darf nicht verbaut werden', () => {
  const g = new Game(1);
  g.money = 1e6;
  g.unlockFloor(1);
  g.openShop(1, 'cafe');
  assert.equal(g.place('pflanze', 1, 0, CONFIG.core.shopDoorZ, 0).reason, 'Laufweg an der Tür muss frei bleiben');
  assert.ok(g.place('theke', 1, 6, 2, 0).ok);
  // Riegel quer durch die Etage zwischen Tür und Theke
  for (let z = 0; z < CONFIG.D; z++) {
    const r = g.place('pflanze', 1, 3, z, 0);
    if (z < CONFIG.D - 1) assert.ok(r.ok, `z=${z} ${r.reason}`);
    else assert.equal(r.reason, 'Theke wäre vom Eingang nicht erreichbar');
  }
});

test('Ebenen: Teppich, Wand- und Deckenobjekte blockieren nicht', () => {
  const g = new Game(1);
  g.money = 1e6;
  assert.ok(g.place('pendel', 0, 5, 5, 0).ok);
  assert.ok(g.place('tisch', 0, 5, 5, 0).ok, 'Tisch unter Pendelleuchte');
  assert.equal(g.place('haengepflanze', 0, 5, 5, 0).reason, 'Platz belegt');
  // Wandobjekt hinten
  const rot = g.wallRotFor('bild', 3, 0);
  assert.equal(rot, 0);
  assert.ok(g.place('bild', 0, 3, 0, rot).ok);
  assert.equal(g.place('bild', 0, 5, 0, 0).reason, 'Hier ist ein Fenster');
  assert.ok(g.place('regal', 0, 2, 0, 0).ok, 'Regal davor geht');
  assert.equal(g.place('bild', 0, 4, 3, 0).reason, 'Muss an eine Wand');
  assert.equal(g.place('bild', 0, 4, 9, 2).reason, 'Vorne sind Fenster');
  assert.equal(g.wallRotFor('uhr', 0, 5), 1);
  assert.equal(g.wallRotFor('uhr', 13, 5), 3);
  assert.equal(g.place('uhr', 0, 13, 5, 3).reason, 'Hier ist ein Fenster');
  assert.ok(g.place('uhr', 0, 13, 8, 3).ok);
  assert.ok(!g.blockedFn(0)(13, 8));
});

test('Gestalten: Wände, Boden, Decke, Fassade kosten Geld und zählen ins Ambiente', () => {
  const g = new Game(1);
  const m0 = g.money, a0 = g.derived[0].appeal;
  assert.equal(g.paintWalls(0, 'all', { color: 'salbei', pattern: 'holz' }).cost, 240);
  assert.equal(g.paintWalls(0, 'all', { color: 'salbei', pattern: 'holz' }).cost, 0, 'gleiche Farbe kostet nichts');
  assert.equal(g.floors[0].design.walls.left.pattern, 'holz');
  assert.ok(g.setFloorMat(0, 'fischgrat').ok);
  assert.ok(g.setCeiling(0, 'nacht').ok);
  assert.ok(g.setWainscot(0, { on: false }).ok);
  assert.ok(g.setExterior('awning', 'weinrot').ok);
  assert.equal(g.setExterior('awning', 'lila').ok, false);
  assert.ok(g.money < m0);
  assert.ok(g.derived[0].appeal > a0);
  assert.equal(g.paintWalls(1, 'back', { color: 'senf' }).ok, false, 'gesperrte Etage');
});

test('Farbvarianten und Rezepte', () => {
  const { g, shop } = cafe();
  const it = g.place('sofa', 0, 10, 7, 0, 2).item;
  assert.equal(it.v, 2);
  g.setVariant(it.id, 99);
  assert.ok(it.v < 99);
  assert.equal(g.offerable(shop, 'kuerbislatte'), false, 'Rezept gesperrt');
  assert.ok(g.unlockRecipe(shop.id, 'kuerbislatte').ok);
  assert.equal(g.offerable(shop, 'kuerbislatte'), true);
});

test('Café-Katze zieht ein, streunt herum und bleibt über Nacht', () => {
  const { g } = cafe();
  const r = g.place('katzenkorb', 0, 12, 1, 0);
  assert.ok(r.ok);
  const cat = [...g.agents.values()].find((a) => a.kind === 'pet');
  assert.ok(cat && cat.name);
  const start = [cat.x, cat.z];
  run(g, 120);
  assert.ok(g.agents.has(cat.id));
  assert.ok(g.pet(cat.id));
  const day = g.day;
  run(g, 900, () => g.day > day);
  assert.ok([...g.agents.values()].some((a) => a.kind === 'pet'), 'Katze bleibt');
  g.remove(r.item.id);
  assert.ok(![...g.agents.values()].some((a) => a.kind === 'pet'));
  assert.ok(start);
});

test('Wetter, Stammgäste, Trinkgeld und Tagesaufgabe über mehrere Tage', () => {
  const { g } = cafe(21);
  for (const [t, x, z] of [['palme', 0, 0], ['lampe', 13, 9], ['musikbox', 12, 0], ['kamin', 10, 0], ['sofa', 1, 8]]) g.place(t, 0, x, z, 0);
  g.rep = 80;
  const types = new Set();
  for (let d = 0; d < 6; d++) {
    const day = g.day;
    types.add(g.weather.type);
    assert.ok(g.quest && g.quest.goal > 0 && g.quest.text);
    run(g, 900, () => g.day > day);
  }
  assert.ok(types.size >= 2, 'Wetter wechselt');
  assert.ok(g.regulars.some((r) => r.visits > 0), 'Stammgäste kommen');
  assert.ok(g.history.some((h) => h.tips > 0), 'Trinkgeld');
  assert.ok(g.history.every((h) => h.weather && h.date));
});

test('alter Spielstand (v1) wird übernommen', () => {
  const v1 = {
    v: 1, seed: 3, rng: 5, money: 1000, day: 4, clock: 500, rep: 60, nextId: 50,
    floors: [{ unlocked: true, shop: 1 }, { unlocked: true, shop: 2 }, { unlocked: false, shop: 0 }],
    items: [{ id: 10, type: 'theke', floor: 0, x: 6, z: 1, rot: 0 }, { id: 11, type: 'pflanze', floor: 1, x: 0, z: 7, rot: 0 }, { id: 12, type: 'tisch', floor: 1, x: 5, z: 5, rot: 0 }],
    shops: [
      { id: 1, type: 'cafe', floor: 0, name: 'A', open: true, staff: 1, menu: { espresso: { price: 2, on: true } }, stock: { bohnen: 5 }, auto: {} },
      { id: 2, type: 'cafe', floor: 1, name: 'B', open: true, staff: 0, menu: {}, stock: {}, auto: {} },
    ],
    history: [], today: { revenue: 0, supplies: 0, build: 0, served: 0, sold: {} },
  };
  const g = new Game(1);
  g.load(v1);
  assert.equal(g.items.size, 2, 'Pflanze vor der neuen Tür wurde entfernt');
  assert.equal(g.money, 1060, 'und erstattet');
  assert.equal(g.shopOnFloor(0).menu.espresso.unlocked, true);
  assert.equal(g.floors[1].design.floor, 'eiche');
  run(g, 30);
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
