import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { Entity } from '../src/ecs/Entity';
import { PlayerState } from '../src/state/PlayerState';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { createCartonEntity } from '../src/factory/createProductEntity';
import { ShelfComponent } from '../src/components/ShelfComponent';
import { BuyerComponent } from '../src/components/BuyerComponent';
import { findStockingTask } from '../src/economy/Stocking';
import { planReorder, targetStock } from '../src/economy/Buyer';
import { Purchasing } from '../src/economy/Purchasing';
import { CartonStorage } from '../src/world/CartonStorage';
import { BuyerSystem } from '../src/world/BuyerSystem';

// Feste Regalplätze und der Einkäufer

const content = new Content();
const ctx = { content };
const cola = content.produkte.get('cola_0_5l');
const wasser = content.produkte.get('wasser_sprudel_0_5l');
const settings = { pruefenAlleMinuten: 60, reserveKartons: 1, mindestGuthaben: 100, versand: 'normal' as const };

function shelfIn(w: World, x = 0) {
  return w.add(createBuildEntity(content.bau.get('wandregal_weiss'), { position: [x, 0, 0], drehung: 0 }, ctx));
}

describe('Feste Regalplätze', () => {
  it('ein festes Fach nimmt nur sein Produkt – auch leer', () => {
    const w = new World(new THREE.Group());
    const s = shelfIn(w).require(ShelfComponent);
    s.faecher.forEach((_, i) => s.setFest(i, cola));
    expect(s.space(wasser)).toBe(0);
    expect(s.add(wasser, 6)).toBe(0);
    expect(s.add(cola, 6)).toBe(6);
    s.take(cola.id, 6);
    expect(s.faecher[0].produkt).toBeNull();
    expect(s.faecher[0].fest).toBe(cola);
    expect(s.festPlatz(cola.id)).toBe(s.faecher.length * s.kapazitaet);
  });

  it('der Auffüller bringt ein Produkt mit festem Platz nur in dieses Regal', () => {
    const w = new World(new THREE.Group());
    const frei = shelfIn(w, 0);
    const fest = shelfIn(w, 3);
    const s = fest.require(ShelfComponent);
    s.faecher.forEach((_, i) => s.setFest(i, cola));
    w.add(createCartonEntity(cola, cola.gebinde, ctx));
    expect(findStockingTask(w, () => true)?.shelf).toBe(fest);
    // Festes Regal voll: dann bleibt der Karton im Lager, statt ins freie Regal zu wandern
    s.add(cola, 999);
    expect(findStockingTask(w, () => true)).toBeNull();
    expect(frei.require(ShelfComponent).bestand).toBe(0);
  });

  it('feste Fächer stehen im Spielstand', () => {
    const w = new World(new THREE.Group());
    const s = shelfIn(w).require(ShelfComponent);
    s.setFest(1, wasser);
    const saved = JSON.parse(JSON.stringify(s.saveState()));
    const s2 = shelfIn(new World(new THREE.Group())).require(ShelfComponent);
    s2.loadState(saved, (id) => content.produkte.find(id));
    expect(s2.faecher[1].fest).toBe(wasser);
    expect(s2.faecher[0].fest).toBeNull();
  });
});

describe('Einkäufer', () => {
  it('plant genug für Regalplatz plus Reserve, die knappsten zuerst, im Rahmen von Geld und Platz', () => {
    const items = [
      { produkt: cola, regalPlatz: 36, bestand: 30 },
      { produkt: wasser, regalPlatz: 24, bestand: 0 },
    ];
    expect(targetStock(items[0], settings)).toBe(36 + cola.gebinde);
    const viel = planReorder(items, settings, { budget: 1e6, freiePlaetze: 100, kosten: () => 0 });
    expect(viel[0].produkt).toBe(wasser.id);
    expect(viel.find((l) => l.produkt === wasser.id)!.kartons).toBe(Math.floor((24 + wasser.gebinde) / wasser.gebinde));
    const eng = planReorder(items, settings, { budget: 1e6, freiePlaetze: 1, kosten: () => 0 });
    expect(eng).toEqual([{ produkt: wasser.id, kartons: 1 }]);
    const arm = planReorder(items, settings, { budget: 10, freiePlaetze: 100, kosten: (l) => l.reduce((n, x) => n + x.kartons * 8, 0) });
    expect(arm).toEqual([{ produkt: wasser.id, kartons: 1 }]);
  });

  it('bestellt am Terminal nach, was einmal im Regal stand', () => {
    const w = new World(new THREE.Group());
    const player = new PlayerState('t', { geld: 2000, xp: 0 }, { xpFuerLevel: [0, 100] });
    for (const z of [-3, 3]) w.add(createBuildEntity(content.bau.get('europalette'), { position: [5, 0, z], drehung: 0 }, ctx));
    const storage = new CartonStorage(w, ctx);
    const purchasing = new Purchasing(content.waren, player, storage);
    const buyers = new BuyerSystem(w, content.produkte, purchasing, player, settings);
    const shelf = shelfIn(w).require(ShelfComponent);
    shelf.add(cola, 3);
    expect(buyers.listing.aktiv(cola.id)).toBe(true);
    const terminal = w.add(createBuildEntity(content.bau.get('einkaufsterminal'), { position: [-3, 0, 0], drehung: 0 }, ctx));
    const buyer = new BuyerComponent({ id: 1, name: 'Ida', rolle: 'einkaeufer', lohn: 95, tempo: 1 },
      { findTerminal: () => terminal, gehgeschwindigkeit: 3, rollenName: 'Einkäufer', text: (k) => k });
    const figur = w.add(new Entity('personal'));
    figur.add(buyer);
    for (let i = 0; i < 200 && !buyer.ready; i++) w.update(0.1);
    expect(buyer.ready).toBe(true);
    const ordered: number[] = [];
    buyers.events.on('ordered', ({ kartons }) => ordered.push(kartons));
    buyers.update(0);
    expect(ordered.length).toBe(1);
    const kartons = [...w.all()].filter((e) => e.typeId === 'karton').length;
    expect(kartons).toBeGreaterThan(0);
    // Nächste Prüfung erst nach dem Intervall, und dann ist genug da
    buyers.update(30);
    buyers.update(60);
    expect(ordered.length).toBe(1);
    // Nicht mehr nachkaufen
    buyers.listing.setAktiv(cola.id, false);
    expect(buyers.stock().length).toBe(0);
  });
});
