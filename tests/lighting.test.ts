import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { daylight } from '../src/world/DayCycle';
import { LampLights } from '../src/world/LampLights';
import { LampComponent } from '../src/components/LampComponent';
import { createBuildEntity } from '../src/factory/createBuildEntity';

// Tag und Nacht, Lampen

const content = new Content();
const l = content.licht;

describe('Tag und Nacht', () => {
  it('mittags voller Tag, nachts Nacht, in der Dämmerung dazwischen', () => {
    expect(daylight(l, 12 * 60)).toMatchObject({ tag: 1, daemmerung: 0, sonne: l.tag.sonne });
    expect(daylight(l, 2 * 60)).toMatchObject({ tag: 0, sonne: l.nacht.sonne });
    const abend = daylight(l, 20 * 60 + 30);
    expect(abend.tag).toBeGreaterThan(0);
    expect(abend.tag).toBeLessThan(1);
    expect(abend.daemmerung).toBeGreaterThan(0.5);
    // wird abends immer dunkler
    expect(daylight(l, 20 * 60).tag).toBeGreaterThan(daylight(l, 21 * 60).tag);
  });
});

describe('Lampen', () => {
  it('Lampen aus data/bau bekommen eine Leuchtfläche; die Lichtquellen gehen an die Lampen nahe der Kamera', () => {
    const scene = new THREE.Scene();
    const world = new World(new THREE.Group());
    const ctx = { content };
    const near = world.add(createBuildEntity(content.bau.get('pendelleuchte'), { position: [0, 4, 0], drehung: 0 }, ctx));
    world.add(createBuildEntity(content.bau.get('hallenstrahler'), { position: [30, 4, 0], drehung: 0 }, ctx));
    expect(near.object.getObjectByName('leuchtflaeche')).toBeDefined();
    const lights = new LampLights(scene, world, 1);
    lights.update(1, new THREE.Vector3(0, 0, 0), 1);
    const pl = scene.children.find((c) => c instanceof THREE.PointLight) as THREE.PointLight;
    const lamp = near.require(LampComponent);
    expect(pl.position.distanceTo(lamp.worldPosition())).toBeLessThan(1e-6);
    expect(pl.intensity).toBe(lamp.def.staerke);
    // Nur so viele Lichtquellen wie in den Daten, egal wie viele Lampen
    expect(scene.children.filter((c) => c instanceof THREE.PointLight)).toHaveLength(1);
  });

  it('viele Lampen an einem Fleck teilen sich ein Licht und brennen nicht aus', () => {
    const scene = new THREE.Scene();
    const world = new World(new THREE.Group());
    const ctx = { content };
    // Zehn Pendelleuchten dicht an dicht, eine weit weg
    for (let i = 0; i < 10; i++) world.add(createBuildEntity(content.bau.get('pendelleuchte'), { position: [i * 0.25, 4, 0], drehung: 0 }, ctx));
    world.add(createBuildEntity(content.bau.get('pendelleuchte'), { position: [12, 4, 0], drehung: 0 }, ctx));
    const b = { abstand: 2.6, zusatz: 0.2, maxFaktor: 1.8, tiefer: 0 };
    const lights = new LampLights(scene, world, 4, b);
    lights.update(1, new THREE.Vector3(0, 0, 0), 1);
    const on = scene.children.filter((c): c is THREE.PointLight => c instanceof THREE.PointLight && c.intensity > 0);
    expect(lights.gruppen).toBe(2);
    expect(on).toHaveLength(2);
    const einzel = content.bau.get('pendelleuchte').licht!.staerke;
    // Die Gruppe sitzt in der Mitte der zehn und ist höchstens maxFaktor-mal so hell wie eine Lampe
    expect(on[0].position.x).toBeCloseTo(1.125);
    expect(on[0].intensity).toBeLessThanOrEqual(einzel * b.maxFaktor + 1e-9);
    expect(on[0].intensity).toBeGreaterThan(einzel);
    expect(on[1].intensity).toBeCloseTo(einzel);
  });
});
