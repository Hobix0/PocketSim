import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { PlayerState } from '../src/state/PlayerState';
import { Purchasing } from '../src/economy/Purchasing';
import { World } from '../src/ecs/World';
import { CartonStorage } from '../src/world/CartonStorage';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { CartonComponent } from '../src/components/CartonComponent';
import { StorageSurfaceComponent } from '../src/components/StorageSurfaceComponent';

// Aufbau: Spieler mit Startgeld, eine Europalette als Lager (12 Kartonplätze)
function setup(geld = 1000) {
  const content = new Content();
  const world = new World(new THREE.Group());
  const player = new PlayerState('test', { geld, xp: 0 }, { xpFuerLevel: [0, 100, 250] });
  const ctx = { content };
  const palette = world.add(createBuildEntity(content.bau.get('europalette'), { position: [2, 0.14, -3], drehung: 90 }, ctx));
  const storage = new CartonStorage(world, ctx);
  const purchasing = new Purchasing(content.produkte, player, storage);
  return { content, world, player, palette, storage, purchasing };
}

describe('Lagerfläche', () => {
  it('Europalette fasst 3 × 2 Kartons auf 2 Ebenen', () => {
    const { palette } = setup();
    const s = palette.require(StorageSurfaceComponent);
    expect(s.capacity).toBe(12);
    expect(s.free).toBe(12);
  });
});

describe('Einkauf', () => {
  it('bucht EK × Gebinde ab und liefert Kartons auf die Palette', () => {
    const { purchasing, player, world, palette, content } = setup();
    const cola = content.produkte.get('cola_0_5l');
    const r = purchasing.order([{ produkt: 'cola_0_5l', kartons: 2 }]);
    expect(r).toEqual({ ok: true, kosten: 2 * purchasing.cartonPrice(cola), kartons: 2 });
    expect(player.geld).toBe(1000 - 2 * purchasing.cartonPrice(cola));
    const cartons = [...world.query(CartonComponent)];
    expect(cartons).toHaveLength(2);
    expect(cartons[0][1].menge).toBe(cola.gebinde);
    expect(palette.require(StorageSurfaceComponent).free).toBe(10);
    // Kartons stehen auf der Palette, nicht im Ursprung
    expect(cartons[0][0].object.position.y).toBeGreaterThan(0.14);
  });

  it('lehnt ab, wenn Lagerplatz fehlt – ohne Geld abzubuchen', () => {
    const { purchasing, player } = setup();
    const r = purchasing.order([{ produkt: 'cola_0_5l', kartons: 13 }]);
    expect(r).toEqual({ ok: false, fehler: { grund: 'platz', frei: 12, noetig: 13 } });
    expect(player.geld).toBe(1000);
  });

  it('lehnt ab, wenn das Geld nicht reicht', () => {
    const { purchasing, world } = setup(1);
    const r = purchasing.order([{ produkt: 'cola_0_5l', kartons: 1 }]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.fehler.grund).toBe('geld');
    expect([...world.query(CartonComponent)]).toHaveLength(0);
  });

  it('lehnt gesperrte Produkte ab', () => {
    const { purchasing, content, player } = setup();
    const p = content.produkte.get('cola_0_5l');
    const gesperrt = { ...p, freischaltLevel: 3 };
    (content.produkte as unknown as { items: Map<string, unknown> }).items.set('cola_0_5l', gesperrt);
    expect(purchasing.isUnlocked(gesperrt)).toBe(false);
    const r = purchasing.order([{ produkt: 'cola_0_5l', kartons: 1 }]);
    expect(!r.ok && r.fehler.grund).toBe('gesperrt');
    player.addXp(250);
    expect(purchasing.order([{ produkt: 'cola_0_5l', kartons: 1 }]).ok).toBe(true);
  });

  it('gibt den Platz frei, wenn ein Karton entfernt wird', () => {
    const { purchasing, world, palette } = setup();
    purchasing.order([{ produkt: 'cola_0_5l', kartons: 1 }]);
    const [[carton]] = [...world.query(CartonComponent)];
    world.remove(carton);
    expect(palette.require(StorageSurfaceComponent).free).toBe(12);
  });

  it('meldet eine leere Auswahl', () => {
    const { purchasing } = setup();
    expect(purchasing.order([{ produkt: 'cola_0_5l', kartons: 0 }])).toEqual({ ok: false, fehler: { grund: 'leer' } });
  });
});
