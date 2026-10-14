// Headless-Tests der Simulation: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim.js';
import { findPath } from '../src/path.js';
import { CONFIG, SHOP_TYPES, LOTS, lotX } from '../src/data.js';

const STEP = 1 / CONFIG.tickRate;
const run = (g, seconds, until) => {
  for (let i = 0; i < seconds * CONFIG.tickRate; i++) {
    g.tick(STEP);
    if (until && until()) return true;
  }
  return false;
};

// Funktionierendes Mini-Café auf Grundstück 1
function cafe(seed = 7) {
  const g = new Game(seed);
  g.money = 1e6;
  const shop = g.shopOnLot(0);
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

// Zweiter Laden eines Typs auf Grundstück 2
function second(type, setup, seed = 9) {
  const g = new Game(seed);
  g.money = 1e6;
  SHOP_TYPES[type].available = true;
  assert.ok(g.buyLot(1).ok);
  const shop = g.openShop(1, type);
  assert.ok(shop, `${type} eröffnet`);
  for (const [t, x, z, r] of setup) { const res = g.place(t, 1, x, z, r); assert.ok(res.ok, `${t} ${res.reason}`); }
  g.hire(shop.id); g.hire(shop.id);
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

test('neues Spiel: Grundstück 1 mit Laden, weitere zu kaufen', () => {
  const g = new Game(1);
  assert.equal(g.lots[0].owned, true);
  assert.equal(g.shopOnLot(0).type, 'cafe');
  assert.equal(g.lots.length, LOTS.length);
  assert.ok(g.lots.slice(1).every((l) => !l.owned));
  const st = g.shopStatus(g.shopOnLot(0));
  assert.equal(st.ready, false);
  assert.ok(st.reasons.includes('Theke fehlt'));
  SHOP_TYPES.supermarkt.available = true;
  const h = new Game(2, 'supermarkt');
  assert.equal(h.shopOnLot(0).type, 'supermarkt');
  assert.equal(h.lots[0].design.floor, 'terrazzo', 'Startlook passt zum Typ');
});

test('Platzieren: belegt, Eingang und Kosten', () => {
  const g = new Game(1);
  const m0 = g.money;
  assert.ok(g.place('tisch', 0, 5, 5, 0).ok);
  assert.equal(g.money, m0 - 140);
  assert.equal(g.place('stuhl', 0, 5, 5, 0).reason, 'Platz belegt');
  assert.ok(g.place('stuhl', 0, 0, 0, 0).ok);
  assert.equal(g.place('stuhl', 0, CONFIG.doorX, CONFIG.D - 1, 0).reason, 'Laufweg an der Tür muss frei bleiben');
  assert.equal(g.place('stuhl', 1, 5, 5, 0).reason, 'Ladenlokal gehört dir noch nicht');
  assert.equal(g.place('grill', 0, 2, 2, 0).reason, 'Passt nicht in Café');
  assert.ok(g.place('teppich', 0, 5, 5, 0).ok);
  assert.ok(g.place('pflanze', 0, 6, 6, 0).ok);
  const id = g.itemAt(0, 6, 6).id;
  const before = g.money;
  g.remove(id);
  assert.equal(g.money, before + 30);
});

test('Kasse braucht Platz davor und muss vom Eingang erreichbar sein', () => {
  const g = new Game(1);
  g.money = 1e6;
  assert.equal(g.place('theke', 0, 6, 0, 2).ok, false);
  assert.ok(g.place('theke', 0, 6, 0, 0).ok);
  assert.equal(g.place('pflanze', 0, 6, 2, 0).reason, 'Vor der Kasse muss Platz für Kund:innen sein');
  for (let x = 0; x < CONFIG.W; x++) {
    const r = g.place('pflanze', 0, x, 4, 0);
    if (x < CONFIG.W - 1) assert.ok(r.ok, `x=${x} ${r.reason}`);
    else assert.equal(r.reason, 'Kasse wäre vom Eingang nicht erreichbar');
  }
});

test('Sitzplätze: Stuhl mit Tisch, Sofa zwei, Diner-Ecke vier', () => {
  const g = new Game(1);
  g.money = 1e6;
  g.place('stuhl', 0, 5, 5, 0);
  assert.equal(g.derived[0].seats.length, 0);
  g.place('tisch', 0, 6, 5, 0);
  assert.equal(g.derived[0].seats.length, 1);
  assert.ok(Math.abs(g.derived[0].seats[0].yaw - Math.PI / 2) < 1e-6, 'Stuhl schaut zum Tisch');
  g.place('sofa', 0, 8, 5, 0);
  assert.equal(g.derived[0].seats.length, 3);
  g.place('diner', 0, 1, 1, 0);
  assert.equal(g.derived[0].seats.length, 7);
});

test('Café: Gäste kommen, stellen sich an, kaufen und zahlen', () => {
  const { g, shop } = cafe();
  assert.equal(g.shopStatus(shop).serving, true);
  run(g, 240);
  assert.ok(g.today.served >= 3, `nur ${g.today.served} bedient`);
  assert.ok(g.today.revenue > 0);
  for (const a of g.agents.values()) if (a.kind === 'customer' && a.z < CONFIG.D) {
    assert.ok(a.x >= lotX(0) - 0.01 && a.x <= lotX(0) + CONFIG.W + 0.01, 'Gäste bleiben im Laden');
  }
});

test('manche Gäste setzen sich hin', () => {
  const { g } = cafe(3);
  assert.ok(run(g, 600, () => [...g.agents.values()].some((a) => a.state === 'sitting')), 'niemand hat sich gesetzt');
});

test('zu teuer: Gäste drehen an der Tür um', () => {
  const { g, shop } = cafe();
  for (const p of Object.keys(shop.menu)) g.setPrice(shop.id, p, 25);
  run(g, 240);
  assert.equal(g.today.served, 0);
  assert.ok(g.today.lostPrice > 0);
});

test('ohne Personal wird nicht verkauft', () => {
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
  assert.equal(r.rent, LOTS[0].rent);
  assert.equal(shop.stock.croissant, 0);
  assert.ok([...g.agents.values()].every((a) => a.kind === 'pet'));
});

test('Grundstück kaufen und zweiten Laden eröffnen – Kundschaft geht in den richtigen Laden', () => {
  const g = new Game(5);
  g.money = 1e6;
  assert.equal(g.openShop(1, 'cafe'), null, 'Grundstück gehört noch nicht');
  assert.ok(g.buyLot(1).ok);
  assert.equal(g.buyLot(1).ok, false);
  const shop = g.openShop(1, 'cafe');
  assert.ok(shop && shop.name !== g.shopOnLot(0).name, 'eigener Name');
  assert.ok(g.place('theke', 1, 7, 2, 0).ok);
  assert.ok(g.place('kaffeemaschine', 1, 9, 2, 0).ok);
  g.hire(shop.id);
  g.clock = CONFIG.openFrom;
  let inside = false, wrong = false;
  run(g, 400, () => {
    for (const a of g.agents.values()) {
      if (a.shop !== shop.id || a.z >= CONFIG.D) continue;
      const lx = a.x - lotX(1);
      if (lx >= 0 && lx <= CONFIG.W) inside = true; else wrong = true;
    }
    return inside && shop.day.served > 2;
  });
  assert.ok(inside, 'niemand im zweiten Laden');
  assert.ok(!wrong, 'Kundschaft im falschen Laden');
  assert.ok(shop.day.served > 0);
});

test('Ebenen: Teppich, Wand- und Deckenobjekte blockieren nicht', () => {
  const g = new Game(1);
  g.money = 1e6;
  assert.ok(g.place('pendel', 0, 5, 5, 0).ok);
  assert.ok(g.place('tisch', 0, 5, 5, 0).ok, 'Tisch unter Pendelleuchte');
  assert.equal(g.place('haengepflanze', 0, 5, 5, 0).reason, 'Platz belegt');
  assert.ok(g.place('efeurahmen', 0, 7, 5, 0).ok);
  assert.equal(g.wallRotFor('bild', 3, 0), 0);
  assert.ok(g.place('bild', 0, 3, 0, 0).ok);
  assert.equal(g.place('bild', 0, 5, 0, 0).reason, 'Hier ist ein Fenster');
  assert.ok(g.place('regal', 0, 2, 0, 0).ok, 'Regal davor geht');
  assert.equal(g.place('bild', 0, 4, 3, 0).reason, 'Muss an eine Wand');
  assert.equal(g.place('bild', 0, 4, 9, 2).reason, 'Vorne ist das Schaufenster');
  assert.equal(g.wallRotFor('uhr', 0, 5), 1);
  assert.equal(g.wallRotFor('uhr', 13, 5), 3);
  assert.equal(g.place('uhr', 0, 13, 5, 3).reason, 'Hier ist ein Fenster');
  assert.ok(g.place('uhr', 0, 13, 8, 3).ok);
  assert.ok(!g.blockedFn(0)(13, 8));
});

test('Gestalten je Laden: Wände, Boden, Decke, Fassade', () => {
  const g = new Game(1);
  const m0 = g.money, a0 = g.derived[0].appeal;
  assert.equal(g.paintWalls(0, 'all', { color: 'salbei', pattern: 'holz' }).cost, 240);
  assert.equal(g.paintWalls(0, 'all', { color: 'salbei', pattern: 'holz' }).cost, 0, 'gleiche Farbe kostet nichts');
  assert.ok(g.setFloorMat(0, 'fischgrat').ok);
  assert.ok(g.setCeiling(0, 'nacht').ok);
  assert.ok(g.setWainscot(0, { on: true }).ok);
  assert.ok(g.setExterior(0, 'awning', 'weinrot').ok);
  assert.ok(g.setExterior(0, 'facade', 'holz').ok);
  assert.equal(g.setExterior(0, 'awning', 'lila').ok, false);
  assert.equal(g.lots[0].design.ext.facade, 'holz');
  assert.ok(g.money < m0);
  assert.ok(g.derived[0].appeal > a0);
  assert.equal(g.paintWalls(1, 'back', { color: 'senf' }).ok, false, 'fremdes Grundstück');
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

test('Ladenkatze zieht ein, streunt herum und bleibt über Nacht', () => {
  const { g } = cafe();
  const r = g.place('katzenkorb', 0, 12, 1, 0);
  assert.ok(r.ok);
  const cat = [...g.agents.values()].find((a) => a.kind === 'pet');
  assert.ok(cat && cat.name);
  run(g, 120);
  assert.ok(g.pet(cat.id));
  const day = g.day;
  run(g, 900, () => g.day > day);
  assert.ok([...g.agents.values()].some((a) => a.kind === 'pet'), 'Katze bleibt');
  g.remove(r.item.id);
  assert.ok(![...g.agents.values()].some((a) => a.kind === 'pet'));
});

test('Wetter, Stammkundschaft, Trinkgeld und Tagesaufgabe über mehrere Tage', () => {
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
  assert.ok(g.regulars.some((r) => r.visits > 0));
  assert.ok(g.history.some((h) => h.tips > 0), 'Trinkgeld');
});

test('Fast Food: Grill, Fritteuse und Getränke – schnelle Kundschaft', () => {
  const { g, shop } = second('fastfood', [['ff_theke', 6, 1, 0], ['grill', 2, 0, 0], ['fritteuse', 9, 0, 0], ['getraenke', 10, 0, 0], ['diner', 1, 6, 0], ['tisch', 11, 6, 0], ['stuhl', 12, 6, 0]]);
  assert.equal(g.shopStatus(shop).serving, true);
  run(g, 400);
  assert.ok(shop.day.served >= 4, `nur ${shop.day.served}`);
  const sold = Object.keys(shop.day.sold);
  assert.ok(sold.some((p) => ['burger', 'pommes', 'nuggets'].includes(p)), sold.join());
  assert.ok(!g.offerable(shop, 'shake'), 'ohne Shake-Maschine kein Shake');
});

test('Boutique: Kund:innen stöbern, probieren an und zahlen an der Kasse', () => {
  const { g, shop } = second('boutique', [['b_kasse', 6, 1, 0], ['kleiderstange', 1, 0, 0], ['kleidertisch', 2, 5, 0], ['accessoires', 12, 4, 3], ['umkleide', 13, 8, 3]], 11);
  g.buy(shop.id, 'pullover', 1); g.buy(shop.id, 'schals', 1); g.buy(shop.id, 'jacken', 1); g.buy(shop.id, 'jeans', 1);
  g.rep = 80;
  let browsing = false, fitting = false;
  run(g, 900, () => {
    for (const a of g.agents.values()) {
      if (a.shop !== shop.id) continue;
      if (a.state === 'browsing') browsing = true;
      if (a.state === 'fitting') fitting = true;
    }
    return browsing && fitting && shop.day.served >= 3;
  });
  assert.ok(browsing, 'niemand hat gestöbert');
  assert.ok(fitting, 'niemand hat anprobiert');
  assert.ok(shop.day.served >= 1);
  assert.ok(shop.day.revenue / shop.day.served > 15, 'Mode bringt große Bons');
});

test('Supermarkt: volle Körbe, Ware geht zurück wenn niemand kassiert', () => {
  const { g, shop } = second('supermarkt', [['s_kasse', 6, 1, 0], ['obststand', 0, 0, 0], ['brotregal', 2, 0, 0], ['getraenkeregal', 9, 0, 0], ['kuehlregal', 11, 0, 0], ['suessregal', 2, 5, 0]], 13);
  for (const s of ['obst_s', 'brot_s', 'milch_s', 'suess_s']) g.buy(shop.id, s, 1);
  run(g, 500);
  assert.ok(shop.day.served >= 4, `nur ${shop.day.served}`);
  const items = Object.values(shop.day.sold).reduce((a, b) => a + b, 0);
  assert.ok(items / shop.day.served >= 1.5, 'mehrere Artikel je Einkauf');
  const withBasket = [...g.agents.values()].filter((a) => a.shop === shop.id && a.basket?.length);
  const inBaskets = withBasket.reduce((s, a) => s + a.basket.length, 0);
  const stockBefore = Object.values(shop.stock).reduce((a, b) => a + b, 0);
  for (const a of withBasket) g.leave(a);
  const stockAfter = Object.values(shop.stock).reduce((a, b) => a + b, 0);
  assert.equal(stockAfter - stockBefore, inBaskets, 'Ware zurück ins Regal');
});

test('alter Spielstand (v2 mit Etagen) wird auf Grundstücke übernommen', () => {
  const v2 = {
    v: 2, seed: 3, rng: 5, money: 1000, day: 4, clock: 500, rep: 60, nextId: 50,
    exterior: { facade: 'ziegel', awning: 'tanne', sign: 'tanne', frames: 'tanne' },
    floors: [{ unlocked: true, shop: 1 }, { unlocked: true, shop: 2 }, { unlocked: false, shop: 0 }],
    items: [{ id: 10, type: 'theke', floor: 0, x: 6, z: 1, rot: 0 }, { id: 11, type: 'pflanze', floor: 1, x: CONFIG.doorX, z: CONFIG.D - 1, rot: 0 }, { id: 12, type: 'tisch', floor: 1, x: 5, z: 5, rot: 0 }],
    shops: [
      { id: 1, type: 'cafe', floor: 0, name: 'A', open: true, staff: 1, menu: { espresso: { price: 2, on: true } }, stock: { bohnen: 5 }, auto: {} },
      { id: 2, type: 'cafe', floor: 1, name: 'B', open: true, staff: 0, menu: {}, stock: {}, auto: {} },
    ],
    history: [], today: { revenue: 0, supplies: 0, build: 0, served: 0, sold: {} },
  };
  const g = new Game(1);
  g.load(v2);
  assert.equal(g.items.size, 2, 'Pflanze vor der Tür wurde entfernt');
  assert.equal(g.money, 1060, 'und erstattet');
  assert.equal(g.shopOnLot(1).name, 'B');
  assert.equal(g.lots[0].design.ext.facade, 'ziegel');
  assert.equal(g.items.get(12).lot, 1);
  run(g, 30);
});

test('Umbau während Betrieb: Kasse entfernen schickt Wartende heim', () => {
  const { g } = cafe();
  run(g, 120, () => [...g.regState.values()].some((r) => r.queue.length > 0));
  g.remove(g.derived[0].registers[0].id);
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
  assert.equal(h.shopOnLot(0).staff, shop.staff);
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

test('Preise: unter 20 € in 10-Cent-, darüber in Euro-Schritten', () => {
  const g = new Game(1);
  const s = g.shopOnLot(0);
  g.setPrice(s.id, 'espresso', 2.34);
  assert.equal(s.menu.espresso.price, 2.3);
  g.setPrice(s.id, 'espresso', 89.4);
  assert.equal(s.menu.espresso.price, 89);
  g.setPrice(s.id, 'espresso', 90);
  assert.equal(s.menu.espresso.price, 90);
});
