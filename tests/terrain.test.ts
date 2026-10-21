import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { PlayerState } from '../src/state/PlayerState';
import { Terrain, cutDepth } from '../src/world/Terrain';
import { TruckFleet } from '../src/world/TruckFleet';
import { CartonStorage } from '../src/world/CartonStorage';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { snapPlacement } from '../src/building/snapping';
import { CartonComponent } from '../src/components/CartonComponent';
import { TerrainCutComponent } from '../src/components/TerrainCutComponent';

// Gelände: Höhenfeld, Pinsel, Absenkungen; abgesenkte Rampe vor dem Ladetor

const content = new Content();
const bounds = { minX: -20, maxX: 20, minZ: -15, maxZ: 15 };
const ueberall = () => true;

describe('Gelände', () => {
  it('Pinsel hebt in der Mitte am meisten, ebnen zieht zurück auf flach', () => {
    const t = new Terrain(bounds, 0.5, 2.5);
    const v0 = t.version;
    const m3 = t.brush(0, 0, 2, 1, ueberall);
    expect(m3).toBeGreaterThan(0);
    expect(t.version).toBeGreaterThan(v0);
    expect(t.editAt(0, 0)).toBeCloseTo(1);
    expect(t.editAt(1, 0)).toBeGreaterThan(0);
    expect(t.editAt(1, 0)).toBeLessThan(1);
    expect(t.editAt(3, 0)).toBe(0);
    expect(t.maxEditIn(-0.5, 0.5, -0.5, 0.5)).toBeCloseTo(1);
    for (let i = 0; i < 20; i++) t.flatten(0, 0, 3, 0.2, ueberall);
    expect(t.maxEditIn(-3, 3, -3, 3)).toBe(0);
  });

  it('bleibt in den Grenzen, verändert nur Erlaubtes und lässt sich speichern', () => {
    const t = new Terrain(bounds, 0.5, 2.5);
    for (let i = 0; i < 10; i++) t.brush(5, 5, 1.5, -1, (x) => x >= 5);
    expect(t.editAt(5, 5)).toBeCloseTo(-2.5);
    expect(t.editAt(4, 5)).toBe(0);
    const t2 = new Terrain(bounds, 0.5, 2.5);
    t2.restore(JSON.parse(JSON.stringify(t.state())));
    expect(t2.editAt(5, 5)).toBeCloseTo(-2.5);
    t2.restore([[-1, 3], 'kaputt', [10 ** 9, 1]]);
    expect(t2.maxEditIn(-20, 20, -15, 15)).toBe(0);
  });

  it('Absenkung: flach in voller Tiefe, dann Schräge hinauf, seitlich davon nichts', () => {
    const c = { x: 0, z: 0, dx: 1, dz: 0, breite: 3.6, tiefe: 1.1, flach: 8, schraege: 6 };
    expect(cutDepth(c, 4, 0, 0)).toBeCloseTo(-1.1);
    expect(cutDepth(c, 11, 0, 0)).toBeCloseTo(-1.1 * 0.5);
    expect(cutDepth(c, 15, 0, 0)).toBe(0);
    expect(cutDepth(c, 4, 2, 0)).toBe(0);
    const t = new Terrain(bounds);
    t.setCuts([c]);
    expect(t.heightAt(4, 0)).toBeCloseTo(-1.1);
  });
});

describe('Abgesenkte Rampe', () => {
  function setup() {
    const world = new World(new THREE.Group());
    const player = new PlayerState('test', { geld: 1000, xp: 0 }, { xpFuerLevel: [0, 100] });
    const ctx = { content };
    for (const z of [-2, 0, 2]) world.add(createBuildEntity(content.bau.get('betonboden'), { position: [-1, 0, z], drehung: 0 }, ctx));
    world.add(createBuildEntity(content.bau.get('europalette'), { position: [-1, 0.05, -2], drehung: 0 }, ctx));
    const tor = world.add(createBuildEntity(content.bau.get('ladetor'), { position: [0.1, 0, 0], drehung: 0 }, ctx));
    const storage = new CartonStorage(world, ctx);
    const route = { strasseZ: 9, hoehe: 0.04, von: -27, bis: 27, halt: -0.8 };
    const fleet = new TruckFleet(world, ctx, content.logistik, route, storage, player, bounds);
    return { world, ctx, tor, fleet };
  }

  it('rastet außen vor dem Ladetor ein, in Richtung des Tors', () => {
    const { world } = setup();
    const def = content.bau.get('rampenabfahrt');
    const s = snapPlacement(world, def, 6, 0.4, 0, content.baumenue);
    expect(s.x).toBeCloseTo(0.1 + 0.2 + def.platzhalter.groesse[0] / 2);
    expect(s.z).toBeCloseTo(0);
    expect(s.drehung).toBe(0);
  });

  it('der LKW setzt rückwärts hinunter: Ladefläche bündig mit dem Hallenboden, keine Ladebordwand', () => {
    const { world, ctx, fleet } = setup();
    const def = content.bau.get('rampenabfahrt');
    const ab = world.add(createBuildEntity(def, { position: [0.3 + def.platzhalter.groesse[0] / 2, 0, 0], drehung: 0 }, ctx));
    expect(ab.require(TerrainCutComponent).cut()).toMatchObject({ x: expect.closeTo(0.3, 5), dx: expect.closeTo(1, 5) });
    fleet.receive({ id: 1, ankunft: 0, art: 'normal', kartons: [{ produkt: 'cola_0_5l', menge: 12 }] });
    const truck = fleet.list[0];
    expect(truck.abgesenkt).toBe(true);
    let tiefster = 0;
    for (let i = 0; i < 8000 && truck.state !== 'steht'; i++) { world.update(0.05); tiefster = Math.min(tiefster, truck.entity.object.position.y); }
    expect(truck.state).toBe('steht');
    const o = truck.entity.object;
    expect(o.position.y).toBeCloseTo(-1.1, 2);
    expect(tiefster).toBeCloseTo(-1.1, 2);
    expect(o.rotation.z).toBe(0);
    // Ladefläche (1,15 m über der Fahrbahn) liegt auf Höhe des Hallenbodens (0,05 m)
    const carton = [...world.query(CartonComponent)].find(([, c]) => c.ablage?.temporaer)!;
    expect(carton[0].object.position.y).toBeCloseTo(0.05, 2);
  });
});
