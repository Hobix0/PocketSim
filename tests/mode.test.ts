import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { Entity } from '../src/ecs/Entity';
import { PlayerState } from '../src/state/PlayerState';
import { Research } from '../src/economy/Research';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { ShelfComponent } from '../src/components/ShelfComponent';
import { FittingRoomComponent } from '../src/components/FittingRoomComponent';
import { CustomerComponent, type CustomerServices } from '../src/components/CustomerComponent';
import { FootprintComponent } from '../src/components/FootprintComponent';

// Modeladen: eigener Forschungsbaum, Kleiderständer mit hängender Ware, Anprobieren in der Umkleide

const content = new Content();

describe('Mode-Baum', () => {
  it('hat einen eigenen Tab; die Modeecke schaltet Ständer, Kasse und Kleidung frei', () => {
    expect(content.forschungWerte.baeume.map((b) => b.id)).toContain('mode');
    const ids = content.forschung.filter((n) => n.baum === 'mode').map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['modeecke', 'umkleide', 'accessoires', 'schaufenster', 'schuhe']));
    expect(content.bau.get('kleiderstaender').forschung).toBe('modeecke');
    expect(content.bau.get('umkleidekabine').forschung).toBe('umkleide');
    expect(content.produkte.get('tshirt').forschung).toBe('modeecke');
    expect(content.produkte.get('sneaker').forschung).toBe('schuhe');
    const player = new PlayerState('t', { geld: 10000, xp: 300 }, { xpFuerLevel: [0, 100, 250, 500, 900] });
    const research = new Research(content.forschung, player, { ...content.forschungWerte, ideenProXp: 0, startIdeen: 0 });
    research.addIdeen(100);
    expect(research.research('umkleide')).toBe(false); // erst die Modeecke
    expect(research.research('modeecke')).toBe(true);
    expect(research.research('umkleide')).toBe(true);
  });

  it('Kleiderständer: Kleidung hängt mit dem Haken an der Stange', () => {
    const w = new World(new THREE.Group());
    const st = w.add(createBuildEntity(content.bau.get('kleiderstaender'), { position: [0, 0, 0], drehung: 0 }, { content }));
    const s = st.require(ShelfComponent);
    expect(s.add(content.produkte.get('tshirt'), 12)).toBe(12);
    // Ebene + Höhe des Bügelmodells = Höhe der Stange (1,475 m)
    expect(s.def.ebenen![0] + 0.01 + content.produkte.get('tshirt').groesse![1]).toBeCloseTo(1.48, 1);
  });
});

describe('Anprobieren', () => {
  function laden(passtNicht: number) {
    const w = new World(new THREE.Group());
    const staender = w.add(createBuildEntity(content.bau.get('kleiderstaender'), { position: [2, 0, 0], drehung: 0 }, { content }));
    staender.require(ShelfComponent).add(content.produkte.get('tshirt'), 10);
    const kabine = w.add(createBuildEntity(content.bau.get('umkleidekabine'), { position: [-2, 0, 0], drehung: 0 }, { content }));
    const gedanken: string[] = [];
    const ergebnis: string[] = [];
    const settings = { ...content.kunden, anprobieren: { kategorien: ['mode'], chance: 1, sekunden: { min: 2, max: 2 }, passtNicht } };
    const services: CustomerServices = {
      findShelf: (p) => (staender.require(ShelfComponent).menge(p.id) > 0 ? staender : null),
      findCheckout: () => null,
      exitPoint: () => new THREE.Vector3(10, 0, 0),
      settings, speed: 3,
      text: (k) => k,
      priceOf: (p) => p.vk,
      willBuy: () => true,
      isBargain: () => false,
      left: (o) => ergebnis.push(o),
      denkt: (art) => gedanken.push(art),
      findFittingRoom: () => (kabine.require(FittingRoomComponent).frei ? kabine : null),
    };
    const k = new Entity('kunde');
    k.object.position.set(0, 0, 3);
    const c = k.add(new CustomerComponent([{ produkt: content.produkte.get('tshirt'), menge: 1, status: 'offen', genommen: 0 }], services));
    w.add(k);
    const run = (until: () => boolean, max = 4000) => { for (let i = 0; i < max && !until(); i++) w.update(1 / 30); return until(); };
    return { w, k, c, kabine, staender, gedanken, ergebnis, run };
  }

  it('mit Kleidung im Korb geht der Kunde in die Umkleide, der Vorhang geht zu, danach geht es weiter', () => {
    const { k, c, kabine, gedanken, ergebnis, run } = laden(0);
    expect(run(() => c.state === 'zur_kabine')).toBe(true);
    expect(kabine.require(FittingRoomComponent).frei).toBe(false);
    expect(run(() => c.state === 'probiert')).toBe(true);
    expect(k.object.visible).toBe(false);
    expect(run(() => c.state !== 'probiert')).toBe(true);
    expect(k.object.visible).toBe(true);
    expect(kabine.require(FittingRoomComponent).frei).toBe(true);
    expect(gedanken).toContain('anprobiert');
    expect(ergebnis).toEqual(['keine_kasse']); // mit dem Shirt zur Kasse (im Test gibt es keine)
  });

  it('passt es nicht, hängt der Kunde das Teil zurück an den Ständer', () => {
    const { c, staender, gedanken, ergebnis, run } = laden(1);
    expect(run(() => c.state === 'probiert')).toBe(true);
    expect(staender.require(ShelfComponent).menge('tshirt')).toBe(9);
    expect(run(() => c.state !== 'probiert')).toBe(true);
    expect(gedanken).toContain('passt_nicht');
    expect(staender.require(ShelfComponent).menge('tshirt')).toBe(10);
    expect(c.basket.length).toBe(0);
    expect(ergebnis).toEqual(['ohne_einkauf']);
  });

  it('die Kabine ist kein Durchgang (sie steht als Möbel im Weg)', () => {
    const { kabine } = laden(0);
    expect(kabine.get(FootprintComponent)).toBeDefined();
  });
});
