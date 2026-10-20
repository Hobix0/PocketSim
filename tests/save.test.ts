import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { PlayerState } from '../src/state/PlayerState';
import { GameClock } from '../src/state/GameClock';
import { Staff } from '../src/economy/Staff';
import { StoreStats } from '../src/economy/StoreStats';
import { PriceBook, buyChance } from '../src/economy/Prices';
import { Goals } from '../src/state/Goals';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { CartonStorage } from '../src/world/CartonStorage';
import { ShelfComponent } from '../src/components/ShelfComponent';
import { CartonComponent } from '../src/components/CartonComponent';
import { StorageSurfaceComponent } from '../src/components/StorageSurfaceComponent';
import { applyWorld, collectWorld, validateSave, SAVE_VERSION } from '../src/save/SaveGame';

// Spielstand: Speichern und Laden ergibt dieselbe Welt und dieselben Werte.

const content = new Content();
const ctx = { content };
const player = () => new PlayerState('test', { geld: 1000, xp: 0 }, { xpFuerLevel: [0, 100, 250] });

describe('Welt speichern und laden', () => {
  it('Bauten, Drehung, Regalinhalt und Kartons auf ihren Plätzen bleiben erhalten', () => {
    const w = new World(new THREE.Group());
    const cola = content.produkte.get('cola_0_5l');
    const shelf = w.add(createBuildEntity(content.bau.get('wandregal_weiss'), { position: [-1, 0.05, -2.75], drehung: 270 }, ctx));
    shelf.require(ShelfComponent).add(cola, 30);
    const palette = w.add(createBuildEntity(content.bau.get('europalette'), { position: [2.9, 0.05, -2.55], drehung: 0 }, ctx));
    const storage = new CartonStorage(w, ctx);
    storage.deliver(cola, 12);
    storage.deliver(content.produkte.get('wasser_sprudel_1_5l'), 6);
    // Einen Karton wieder wegnehmen, damit Platz 0 frei ist und die Plätze nicht einfach nachrücken
    const first = [...w.query(CartonComponent)][0][0];
    w.remove(first);

    const saved = JSON.parse(JSON.stringify(collectWorld(w, content)));
    expect(saved.bauten.map((b: { typ: string }) => b.typ)).toEqual(['wandregal_weiss', 'europalette']);

    const w2 = new World(new THREE.Group());
    applyWorld(saved, w2, content, ctx);
    const shelf2 = [...w2.query(ShelfComponent)][0];
    expect(shelf2[0].object.rotation.y).toBeCloseTo(THREE.MathUtils.degToRad(270));
    expect(shelf2[1].saveState()).toEqual(shelf.require(ShelfComponent).saveState());
    const cartons = [...w2.query(CartonComponent)];
    expect(cartons.map(([, c]) => [c.produkt.id, c.menge])).toEqual([['wasser_sprudel_1_5l', 6]]);
    const surface = [...w2.query(StorageSurfaceComponent)][0][1];
    expect(surface.slotOf(cartons[0][0].id)).toBe(palette.require(StorageSurfaceComponent).slotOf([...w.query(CartonComponent)][0][0].id));
  });

  it('unbekannte Bauteile und Produkte werden übersprungen statt abzustürzen', () => {
    const w = new World(new THREE.Group());
    applyWorld({ bauten: [{ typ: 'gibt_es_nicht', pos: [0, 0, 0], rot: 0 }], kartons: [{ produkt: 'weg', menge: 3, pos: [0, 0, 0], rot: 0 }], waren: [] }, w, content, ctx);
    expect([...w.all()]).toHaveLength(0);
  });

  it('prüft Spielstände', () => {
    expect(() => validateSave(null)).toThrow('Kein Spielstand');
    expect(() => validateSave({ version: SAVE_VERSION + 1 })).toThrow('neueren Version');
    expect(() => validateSave({ version: 1, level: 'start' })).toThrow('"spieler" fehlt');
  });
});

describe('Systeme speichern und laden', () => {
  it('Uhr', () => {
    const settings = { startTag: 1, startUhrzeit: '07:00', spielminutenProSekunde: 1, geschwindigkeiten: [1, 3, 8], wochentage: ['Mo', 'Di'] };
    const a = new GameClock(settings);
    a.update(90);
    a.setStufe(3);
    const b = new GameClock(settings);
    b.restore(a.state());
    expect([b.uhrzeit, b.stufe]).toEqual([a.uhrzeit, 3]);
  });

  it('Personal: Team, Bewerbungen und fortlaufende Nummern', () => {
    const a = new Staff(content.rollen, content.personal, content.namen, player(), () => 0.3);
    a.hire(a.candidates[0].id);
    const b = new Staff(content.rollen, content.personal, content.namen, player(), () => 0.3);
    b.restore(JSON.parse(JSON.stringify(a.state())));
    expect(b.team).toEqual(a.team);
    expect(b.candidates).toEqual(a.candidates);
    b.refreshCandidates();
    expect(Math.min(...b.candidates.map((c) => c.id))).toBeGreaterThan(Math.max(...a.candidates.map((c) => c.id)));
  });

  it('Ruf, heutige Zahlen und Verlauf', () => {
    const p = player();
    const a = new StoreStats(content.kunden, p);
    const cola = content.produkte.get('cola_0_5l');
    a.recordSale(10, 4, [{ produkt: cola, menge: 4 }]);
    a.recordVisit('zufrieden', [cola]);
    a.closeDay(2);
    a.recordSale(3, 1);
    const b = new StoreStats(content.kunden, player());
    b.restore(JSON.parse(JSON.stringify(a.state())), (id) => content.produkte.find(id));
    expect(b.ruf).toBe(a.ruf);
    expect(b.heute.umsatz).toBe(3);
    expect(b.verlauf).toHaveLength(1);
    expect(b.verlauf[0].verkauft).toEqual([{ produkt: cola, anzahl: 4 }]);
    expect(b.closeDay(3).umsatz).toBe(3);
  });

  it('Ziele: erledigte bleiben erledigt, ohne neue Belohnung', () => {
    const p = player();
    const goals = new Goals([{ id: 'a', text: 'A', belohnung: { geld: 50 } }], p);
    goals.restore(['a']);
    goals.complete('a');
    expect(p.geld).toBe(1000);
    expect(goals.open).toHaveLength(0);
  });
});

describe('Preise', () => {
  const s = content.kunden.preis;
  const cola = content.produkte.get('cola_0_5l');

  it('eigene Preise werden gerundet und begrenzt; der empfohlene Preis zählt als „nicht geändert“', () => {
    const prices = new PriceBook(s);
    prices.set(cola, cola.vk * 1.2 + 0.013);
    expect(prices.get(cola) * 20).toBeCloseTo(Math.round(prices.get(cola) * 20));
    prices.set(cola, 1000);
    expect(prices.get(cola)).toBeCloseTo(Math.round(cola.vk * s.max * 20) / 20);
    prices.set(cola, cola.vk);
    expect(prices.isOwn(cola)).toBe(false);
    prices.set(cola, cola.vk * 0.8);
    const b = new PriceBook(s);
    b.restore(prices.state());
    expect(b.get(cola)).toBe(prices.get(cola));
  });

  it('Kaufchance: bis zur Toleranz kauft jeder, darüber immer weniger', () => {
    expect(buyChance(s, 1)).toBe(1);
    expect(buyChance(s, 1 + s.toleranz)).toBe(1);
    expect(buyChance(s, 1.3)).toBeLessThan(1);
    expect(buyChance(s, 1.3)).toBeGreaterThan(buyChance(s, 1.5));
    expect(buyChance(s, 3)).toBe(0);
  });
});
