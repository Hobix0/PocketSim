import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { PlayerState } from '../src/state/PlayerState';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { NavGrid } from '../src/navigation/NavGrid';
import { CustomerSpawner, planWishes, parseTime, rufFaktor } from '../src/economy/Customers';
import { StoreStats } from '../src/economy/StoreStats';
import { Goals } from '../src/state/Goals';
import { StoreLoop } from '../src/core/StoreLoop';
import { PriceBook } from '../src/economy/Prices';
import { ShelfComponent } from '../src/components/ShelfComponent';
import { CheckoutComponent } from '../src/components/CheckoutComponent';
import { CustomerComponent } from '../src/components/CustomerComponent';

// Spielablauf: Wege, Kundenzustrom, Wünsche, Ruf, Tagesbericht, Ziele – und ein ganzer Einkauf.

const content = new Content();
const ctx = { content };
const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
const nav = { zelle: 0.25, radius: 0.25 };
const player = (geld = 1000) => new PlayerState('test', { geld, xp: 0 }, { xpFuerLevel: [0, 100, 250] });

/** Boden aus 2-m-Fliesen: x und z von -n … n Kacheln */
function floor(w: World, n = 2): void {
  for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) {
    w.add(createBuildEntity(content.bau.get('boden_fliese_innen'), { position: [x * 2, 0, z * 2], drehung: 0 }, ctx));
  }
}

const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

describe('Wegfindung', () => {
  it('geht um ein Regal herum statt hindurch', () => {
    const w = new World(new THREE.Group());
    floor(w);
    // Regal quer im Weg: 2 m lang entlang X (gedreht), bei z = 0
    w.add(createBuildEntity(content.bau.get('wandregal_weiss'), { position: [0, 0.05, 0], drehung: 90 }, ctx));
    const g = new NavGrid(bounds, nav, w);
    expect(g.isWalkable(0, 0)).toBe(false);
    const path = g.findPath({ x: 0, y: 0, z: -2 }, { x: 0, y: 0, z: 2 })!;
    expect(path).not.toBeNull();
    // Kein Wegpunkt liegt im Regal, und der Weg weicht seitlich aus
    expect(path.every((p) => g.isWalkable(p.x, p.z))).toBe(true);
    expect(Math.max(...path.map((p) => Math.abs(p.x)))).toBeGreaterThan(1);
    expect(path[path.length - 1]).toMatchObject({ x: 0, z: 2 });
    expect(path[0].y).toBeCloseTo(0.05); // Höhe der Fliesen
  });

  it('Wände sperren, Türen lassen durch', () => {
    const w = new World(new THREE.Group());
    floor(w);
    // Wand quer über den Boden bei z = 0 (Module zu 2 m), in der Mitte eine Tür
    for (const x of [-4, -2, 2, 4]) w.add(createBuildEntity(content.bau.get('wand_weiss'), { position: [x, 0, 0], drehung: 90 }, ctx));
    const door = w.add(createBuildEntity(content.bau.get('tuer'), { position: [0, 0, 0], drehung: 90 }, ctx));
    const g = new NavGrid(bounds, nav, w);
    const path = g.findPath({ x: -3, y: 0, z: -2 }, { x: -3, y: 0, z: 2 })!;
    expect(path.some((p) => Math.abs(p.x) < 1 && Math.abs(p.z) < 0.5)).toBe(true); // durch die Tür
    // Tür durch eine Wand ersetzen: jetzt gibt es keinen Weg mehr
    w.remove(door);
    w.add(createBuildEntity(content.bau.get('wand_weiss'), { position: [0, 0, 0], drehung: 90 }, ctx));
    g.invalidate();
    expect(g.findPath({ x: -3, y: 0, z: -2 }, { x: -3, y: 0, z: 2 })).toBeNull();
  });
});

describe('Kundenzustrom', () => {
  const s = content.kunden;

  it('kommt nur während der Öffnungszeiten, mehr bei gutem Ruf', () => {
    const sp = new CustomerSpawner(s, () => 0.5);
    expect(sp.isOpen(parseTime('07:59'))).toBe(false);
    expect(sp.isOpen(parseTime('08:00'))).toBe(true);
    expect(sp.isOpen(parseTime(s.schluss))).toBe(false);
    expect(sp.spawns(60, parseTime('06:00'), 50, 0)).toBe(0);
    // Eine Stunde um 12 Uhr: so viele wie in den Daten (bei Zufall 0,5 genau der Mittelwert)
    let n = 0;
    for (let m = 0; m < 60; m++) n += sp.spawns(1, 12 * 60 + m, 50, 0);
    expect(n).toBe(Math.round(s.kundenProStunde[12] * rufFaktor(s, 50)));
    expect(rufFaktor(s, 100)).toBeGreaterThan(rufFaktor(s, 0));
  });

  it('nie mehr als maxImLaden', () => {
    const sp = new CustomerSpawner(s, () => 0.9);
    expect(sp.spawns(600, 12 * 60, 100, s.maxImLaden - 2)).toBe(2);
  });

  it('Wünsche: verschiedene Produkte, meist aus dem Sortiment', () => {
    const alle = content.produkte.all();
    const sortiment = alle.slice(0, 3);
    let ausSortiment = 0, gesamt = 0;
    for (let i = 0; i < 200; i++) {
      const wishes = planWishes(s, sortiment, alle);
      expect(new Set(wishes.map((w) => w.produkt.id)).size).toBe(wishes.length);
      expect(wishes.length).toBeGreaterThanOrEqual(1);
      for (const w of wishes) { gesamt++; if (sortiment.includes(w.produkt)) ausSortiment++; }
    }
    expect(ausSortiment / gesamt).toBeGreaterThan(0.6);
  });
});

describe('Ruf und Tagesbericht', () => {
  it('Ruf steigt bei zufriedenen Kunden und fällt bei fehlender Ware und ohne Kasse', () => {
    const p = player();
    const stats = new StoreStats(content.kunden, p);
    const r = content.kunden.ruf;
    const cola = content.produkte.get('cola_0_5l');
    stats.recordVisit('zufrieden', []);
    expect(stats.ruf).toBeCloseTo(r.start + r.zufrieden);
    stats.recordVisit('keine_kasse', [cola, cola]);
    expect(stats.ruf).toBeCloseTo(r.start + r.zufrieden + r.keineKasse + 2 * r.jeFehlendemArtikel);
  });

  it('der Bericht zählt Umsatz, Ausgaben nach Grund und vermisste Produkte – danach beginnt ein neuer Tag', () => {
    const p = player();
    const stats = new StoreStats(content.kunden, p);
    const cola = content.produkte.get('cola_0_5l'), milch = content.produkte.all().find((x) => x.id !== 'cola_0_5l')!;
    stats.recordSale(12.5, 5);
    p.spend(40, 'einkauf');
    p.spend(80, 'lohn');
    stats.recordVisit('ohne_einkauf', [milch]);
    stats.recordVisit('zufrieden', [milch, cola]);
    const report = stats.closeDay(2);
    expect(report).toMatchObject({ tag: 1, kunden: 2, zufrieden: 1, ohneEinkauf: 1, umsatz: 12.5, artikel: 5, kosten: { einkauf: 40, lohn: 80 } });
    expect(report.fehlt.map((f) => [f.produkt.id, f.anzahl])).toEqual([[milch.id, 2], [cola.id, 1]]);
    expect(stats.heute).toMatchObject({ tag: 2, kunden: 0, umsatz: 0, kosten: {} });
  });
});

describe('Ziele', () => {
  it('Belohnung gibt es nur einmal, unbekannte Ziele werden ignoriert', () => {
    const p = player(0);
    const goals = new Goals([{ id: 'a', text: 'A', belohnung: { geld: 50, xp: 10 } }, { id: 'b', text: 'B', belohnung: {} }], p);
    goals.complete('a');
    goals.complete('a');
    goals.complete('gibt_es_nicht');
    expect(p.geld).toBe(50);
    expect(p.xp).toBe(10);
    expect(goals.open.map((g) => g.id)).toEqual(['b']);
  });
});

describe('Ein ganzer Einkauf', () => {
  it('Kunde holt Cola aus dem Regal, stellt sich an, bezahlt und geht', () => {
    const w = new World(new THREE.Group());
    floor(w, 3);
    const cola = content.produkte.get('cola_0_5l');
    const shelf = w.add(createBuildEntity(content.bau.get('wandregal_weiss'), { position: [-3, 0.05, -3], drehung: 0 }, ctx));
    shelf.require(ShelfComponent).add(cola, 24);
    const p = player();
    // Zufall: Wunsch aus dem Sortiment, eine Cola, ein Wunsch
    const store = new StoreLoop(w, content, p, bounds, [[4, 0.05, 4]], () => fctx, new PriceBook(content.kunden.preis), seq(0, 0, 0, 0.5, 0, 0.5));
    const fctx = { content, checkout: store.checkoutServices };
    const checkout = w.add(createBuildEntity(content.bau.get('kasse_schwarz'), { position: [2, 0.05, -1], drehung: 0 }, fctx));

    store.update(10, parseTime('12:00'));
    const customer = [...w.query(CustomerComponent)][0];
    expect(customer).toBeDefined();
    const [entity, c] = customer;
    expect(c.wishes.map((x) => x.produkt.id)).toEqual(['cola_0_5l']);

    const states = new Set<string>();
    for (let i = 0; i < 2000 && !c.isReady; i++) { w.update(0.05); states.add(c.state); }
    expect([...states]).toEqual(expect.arrayContaining(['sucht', 'greift']));
    expect(c.isReady).toBe(true);
    expect(checkout.require(CheckoutComponent).front).toBe(entity);
    expect(shelf.require(ShelfComponent).bestand).toBe(24 - c.artikel);

    const geld = p.geld;
    store.serve(checkout, true);
    expect(p.geld).toBeCloseTo(geld + cola.vk * c.wishes[0].genommen);
    expect(store.stats.heute.umsatz).toBeCloseTo(cola.vk * c.wishes[0].genommen);
    expect(c.state).toBe('geht');
    for (let i = 0; i < 2000 && entity.world; i++) w.update(0.05);
    expect(entity.world).toBeNull();
    expect(store.stats.heute).toMatchObject({ kunden: 1, zufrieden: 1 });
  });

  it('ohne Kasse legt der Kunde die Ware zurück und der Ruf sinkt', () => {
    const w = new World(new THREE.Group());
    floor(w, 3);
    const cola = content.produkte.get('cola_0_5l');
    const shelf = w.add(createBuildEntity(content.bau.get('wandregal_weiss'), { position: [-3, 0.05, -3], drehung: 0 }, ctx));
    shelf.require(ShelfComponent).add(cola, 24);
    const store = new StoreLoop(w, content, player(), bounds, [[4, 0.05, 4]], () => ({ content }), new PriceBook(content.kunden.preis), seq(0, 0, 0, 0.5, 0, 0.5));
    store.update(10, parseTime('12:00'));
    const [, c] = [...w.query(CustomerComponent)][0];
    for (let i = 0; i < 2000 && c.state !== 'geht'; i++) w.update(0.05);
    expect(c.state).toBe('geht');
    expect(shelf.require(ShelfComponent).bestand).toBe(24);
    expect(store.stats.ruf).toBeLessThan(content.kunden.ruf.start);
  });
});
