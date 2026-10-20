import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { PlayerState } from '../src/state/PlayerState';
import { Purchasing } from '../src/economy/Purchasing';
import { Deliveries, type Shipment } from '../src/economy/Deliveries';
import { findHaulTask } from '../src/economy/Stocking';
import { CartonStorage } from '../src/world/CartonStorage';
import { TruckFleet, type DeliveryRoute } from '../src/world/TruckFleet';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { createWorkerEntity } from '../src/factory/createWorkerEntity';
import { createCartonEntity } from '../src/factory/createProductEntity';
import { CartonComponent } from '../src/components/CartonComponent';
import { StorageSurfaceComponent } from '../src/components/StorageSurfaceComponent';
import { StorageDropComponent } from '../src/components/StorageDropComponent';
import { TruckComponent } from '../src/components/TruckComponent';
import { RampComponent } from '../src/components/RampComponent';
import { collectWorld } from '../src/save/SaveGame';
import type { GameActions } from '../src/factory/FactoryContext';

// Lager und Logistik: Liefertermine, Lieferkosten, LKW, Abladen (Fahrer, Lagerist, von Hand), Laderampe.

const content = new Content();
const route: DeliveryRoute = { strasseZ: 9, hoehe: 0.04, von: -27, bis: 27, halt: -0.8, zufahrtX: 13 };
const DAY = 24 * 60;

function setup(geld = 1000) {
  const world = new World(new THREE.Group());
  const player = new PlayerState('test', { geld, xp: 0 }, { xpFuerLevel: [0, 100, 250] });
  const ctx = { content };
  const palette = world.add(createBuildEntity(content.bau.get('europalette'), { position: [2, 0.05, -2], drehung: 0 }, ctx));
  const storage = new CartonStorage(world, ctx);
  let now = 7 * 60; // Tag 1, 07:00
  const clock = { get: () => now, set: (m: number) => { now = m; } };
  const fleet = new TruckFleet(world, ctx, content.logistik, route, storage, player);
  const deliveries = new Deliveries(content.logistik, storage, clock.get, () => fleet.onTrucks());
  deliveries.events.on('arrived', (s) => fleet.receive(s));
  const purchasing = new Purchasing(content.waren, player, deliveries);
  return { world, player, ctx, palette, storage, clock, fleet, deliveries, purchasing };
}

/** Simulation laufen lassen, bis die Bedingung erfüllt ist (höchstens `max` Schritte zu 0,1 s) */
function runUntil(world: World, cond: () => boolean, max = 2000, onStep?: () => void): boolean {
  for (let i = 0; i < max; i++) {
    if (cond()) return true;
    world.update(0.1);
    onStep?.();
  }
  return cond();
}

const cartonsOnTruck = (w: World) => [...w.query(CartonComponent)].filter(([, c]) => c.ablage?.temporaer).length;

describe('Liefertermine und Lieferkosten', () => {
  it('normale Lieferung kommt zum nächsten Termin, nach dem letzten am nächsten Morgen; Express nach den Minuten aus den Daten', () => {
    const { deliveries } = setup();
    const t = content.logistik;
    expect(deliveries.arrival('normal', 7 * 60)).toBe(8 * 60);
    expect(deliveries.arrival('normal', 8 * 60)).toBe(10 * 60); // genau zur vollen Stunde: der nächste
    expect(deliveries.arrival('normal', 21 * 60)).toBe(DAY + 6 * 60);
    expect(deliveries.arrival('express', 21 * 60)).toBe(21 * 60 + t.express.minuten);
  });

  it('Lieferkosten: Grundbetrag + je Karton, Express mit Aufschlag', () => {
    const { deliveries } = setup();
    const k = content.logistik.lieferkosten;
    expect(deliveries.fee(0, 'normal')).toBe(0);
    expect(deliveries.fee(5, 'normal')).toBeCloseTo(k.grund + 5 * k.proKarton);
    expect(deliveries.fee(5, 'express')).toBeCloseTo(k.grund + 5 * k.proKarton + content.logistik.express.aufschlag);
  });
});

describe('Einkauf per LKW', () => {
  it('bucht Ware und Lieferung getrennt ab, stellt noch nichts ins Lager, plant aber den Platz ein', () => {
    const { purchasing, player, world, storage, deliveries } = setup();
    const cola = content.produkte.get('cola_0_5l');
    const r = purchasing.order([{ produkt: 'cola_0_5l', kartons: 3 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ware = 3 * purchasing.cartonPrice(cola);
    expect(r.versand).toBeCloseTo(deliveries.fee(3, 'normal'));
    expect(r.ankunft).toBe(8 * 60);
    expect(player.geld).toBeCloseTo(1000 - ware - r.versand!);
    expect([...world.query(CartonComponent)]).toHaveLength(0);
    expect(storage.freeSlots()).toBe(12);
    expect(deliveries.freeSlots()).toBe(9);
    // Mehr als frei ist (inkl. Eingeplantem) geht nicht
    const zuViel = purchasing.order([{ produkt: 'cola_0_5l', kartons: 10 }]);
    expect(zuViel).toEqual({ ok: false, fehler: { grund: 'platz', frei: 9, noetig: 10 } });
  });

  it('Bestellungen zum selben Termin kommen mit demselben LKW', () => {
    const { purchasing, deliveries } = setup();
    purchasing.order([{ produkt: 'cola_0_5l', kartons: 1 }]);
    purchasing.order([{ produkt: 'wasser_sprudel_0_5l', kartons: 2 }]);
    purchasing.order([{ produkt: 'cola_0_5l', kartons: 1 }], 'express');
    expect(deliveries.unterwegs.map((s) => [s.art, s.kartons.length])).toEqual([['express', 1], ['normal', 3]]);
  });

  it('meldet fällige Lieferungen genau einmal; Spielstand übernimmt, was unterwegs ist', () => {
    const { purchasing, deliveries, clock } = setup();
    purchasing.order([{ produkt: 'cola_0_5l', kartons: 2 }]);
    const arrived: Shipment[] = [];
    const d2 = new Deliveries(content.logistik, { freeSlots: () => 12 }, clock.get);
    d2.restore(JSON.parse(JSON.stringify(deliveries.state())), (id) => content.waren.has(id));
    d2.events.on('arrived', (s) => arrived.push(s));
    d2.update(7 * 60 + 59);
    expect(arrived).toHaveLength(0);
    d2.update(8 * 60);
    d2.update(8 * 60 + 5);
    expect(arrived).toHaveLength(1);
    expect(arrived[0].kartons).toHaveLength(2);
  });
});

describe('LKW', () => {
  it('fährt vor, stellt die Kartons auf die Ladefläche (kein Lagerplatz) und wartet', () => {
    const { purchasing, deliveries, clock, world, fleet, storage } = setup();
    purchasing.order([{ produkt: 'cola_0_5l', kartons: 4 }]);
    clock.set(8 * 60);
    deliveries.update();
    expect(fleet.list).toHaveLength(1);
    expect(fleet.list[0].state).toBe('anfahrt');
    expect(fleet.onTrucks()).toBe(4);
    expect(runUntil(world, () => fleet.list[0]?.state === 'steht')).toBe(true);
    const truck = fleet.list[0].entity;
    expect(truck.object.position.x).toBeCloseTo(route.halt);
    expect(cartonsOnTruck(world)).toBe(4);
    expect(storage.freeSlots()).toBe(12); // Ladefläche zählt nicht als Lager
    expect(deliveries.freeSlots()).toBe(8);
    // Kartons stehen auf der Ladefläche (oben auf dem LKW)
    const [, c] = [...world.query(CartonComponent)][0];
    expect(c.ablage!.entity).toBe(truck);
    expect([...world.query(CartonComponent)][0][0].object.position.y).toBeGreaterThan(1);
  });

  it('nach der Wartezeit lädt der Fahrer selbst ab (gegen Gebühr) und fährt weg', () => {
    const { purchasing, deliveries, clock, world, fleet, player, palette } = setup();
    purchasing.order([{ produkt: 'cola_0_5l', kartons: 2 }]);
    clock.set(8 * 60);
    deliveries.update();
    runUntil(world, () => fleet.list[0]?.state === 'steht');
    const geld = player.geld;
    fleet.update(content.logistik.wartezeitMinuten - 1);
    expect(cartonsOnTruck(world)).toBe(2);
    fleet.update(2);
    expect(cartonsOnTruck(world)).toBe(0);
    expect(palette.require(StorageSurfaceComponent).used).toBe(2);
    expect(player.geld).toBeCloseTo(geld - 2 * content.logistik.fahrerAbladenProKarton);
    expect(fleet.list[0].state).toBe('abfahrt');
    expect(runUntil(world, () => fleet.list.length === 0)).toBe(true);
    expect([...world.all()].some((e) => e.get(TruckComponent))).toBe(false);
  });

  it('ohne freien Platz nimmt der Fahrer die Ware zurück und erstattet den Einkaufspreis', () => {
    const { world, fleet, player, palette, ctx } = setup();
    // Palette vorher anderweitig voll machen
    const s = palette.require(StorageSurfaceComponent);
    while (s.free) {
      const k = world.add(createCartonEntity(content.produkte.get('cola_0_5l'), 1, ctx));
      s.occupy(k.id);
      k.require(CartonComponent).ablage = s;
    }
    fleet.receive({ id: 1, ankunft: 0, art: 'normal', kartons: [{ produkt: 'cola_0_5l', menge: 12 }] });
    runUntil(world, () => fleet.list[0]?.state === 'steht');
    const geld = player.geld;
    fleet.update(content.logistik.wartezeitMinuten + 1);
    expect(player.geld).toBeCloseTo(geld + 12 * content.produkte.get('cola_0_5l').ek);
    expect(cartonsOnTruck(world)).toBe(0);
  });

  it('ein Lagerist lädt den LKW ab und stellt die Kartons auf die Palette', () => {
    const { world, fleet, storage, palette, ctx } = setup();
    fleet.receive({ id: 1, ankunft: 0, art: 'normal', kartons: [{ produkt: 'cola_0_5l', menge: 12 }, { produkt: 'cola_0_5l', menge: 12 }] });
    runUntil(world, () => fleet.list[0]?.state === 'steht');
    const employee = { id: 1, name: 'Test', rolle: 'lagerist', lohn: 75, tempo: 1 };
    const services = { gehgeschwindigkeit: 3, sekundenProStueck: 0.1 };
    world.add(createWorkerEntity(employee, {
      auffuellen: { findTask: () => null, ...services },
      abladen: { findTask: () => findHaulTask(world, storage, () => true), ...services },
      kassieren: { findCheckout: () => null, serve: () => {}, gehgeschwindigkeit: 1, sekundenProArtikel: 1 },
    }, ctx)).object.position.set(0, 0.04, 6);
    // Fertig, wenn beide Kartons wirklich auf der Palette stehen (der Platz wird schon beim Losgehen reserviert)
    const onPalette = () => [...world.query(CartonComponent)].filter(([, c]) => c.ablage === palette.require(StorageSurfaceComponent) && c.reservedBy === null).length;
    expect(runUntil(world, () => onPalette() === 2, 4000)).toBe(true);
    expect(cartonsOnTruck(world)).toBe(0);
    expect(palette.require(StorageSurfaceComponent).used).toBe(2);
    fleet.update(1);
    expect(fleet.list[0].state).toBe('abfahrt');
  });

  it('mit einer Laderampe hält der LKW dort – rückwärts, die Ladefläche an der Rampe', () => {
    const { world, fleet, ctx } = setup();
    const rampe = world.add(createBuildEntity(content.bau.get('laderampe'), { position: [0, 0, -6], drehung: 90 }, ctx));
    fleet.receive({ id: 1, ankunft: 0, art: 'normal', kartons: [{ produkt: 'cola_0_5l', menge: 12 }] });
    expect(fleet.list[0].dock).toBe(rampe);
    expect(rampe.require(RampComponent).belegt).toBe(true);
    expect(runUntil(world, () => fleet.list[0]?.state === 'steht', 4000)).toBe(true);
    const truck = fleet.list[0].entity.object;
    // Rampe zeigt mit drehung 90 nach −Z: der LKW steht dahinter, Front zeigt weg (−Z)
    expect(truck.position.z).toBeLessThan(-6 - 1);
    const front = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), truck.rotation.y);
    expect(front.z).toBeCloseTo(-1);
    // Zweite Lieferung: Rampe belegt → Straße
    fleet.receive({ id: 2, ankunft: 0, art: 'normal', kartons: [{ produkt: 'cola_0_5l', menge: 12 }] });
    expect(fleet.list[1].dock).toBeNull();
  });

  it('Kartons auf dem LKW landen nicht als lose Kartons im Spielstand, sondern in der Ladung', () => {
    const { world, fleet } = setup();
    fleet.receive({ id: 1, ankunft: 0, art: 'normal', kartons: [{ produkt: 'cola_0_5l', menge: 12 }] });
    runUntil(world, () => fleet.list[0]?.state === 'steht');
    expect(collectWorld(world, content).kartons).toHaveLength(0);
    expect(fleet.cargo()).toEqual([{ produkt: 'cola_0_5l', menge: 12 }]);
  });
});

describe('Umlagern von Hand', () => {
  it('mit einem Karton in der Hand bietet eine Ablage „Hier abstellen“ an – nicht die, auf der er schon steht', () => {
    const { world, palette, ctx, storage } = setup();
    const carton = world.add(createCartonEntity(content.produkte.get('cola_0_5l'), 12, ctx));
    let carried: typeof carton | null = null;
    const actions = { carriedCarton: () => carried, placeCarton: () => {} } as unknown as GameActions;
    const box = world.add(createBuildEntity(content.bau.get('gitterbox'), { position: [-2, 0.05, -2], drehung: 0 }, { content, actions }));
    const drop = box.require(StorageDropComponent);
    expect(drop.options()).toHaveLength(0);
    carried = carton;
    expect(drop.options().map((o) => o.text)).toEqual(['abstellen']);
    storage.store(carton);
    expect(carton.require(CartonComponent).ablage).not.toBeNull();
    // Gitterbox: 3 × 2 Kartons auf zwei Lagen
    expect(box.require(StorageSurfaceComponent).capacity).toBe(12);
    expect(palette.require(StorageSurfaceComponent).capacity).toBe(12);
  });
});
