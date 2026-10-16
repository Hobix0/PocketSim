import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Component } from '../src/ecs/Component';
import { Entity } from '../src/ecs/Entity';
import { World } from '../src/ecs/World';
import { ValuesComponent, sumValues } from '../src/components/ValuesComponent';

// Test-Komponente, die ihren Lebenszyklus mitschreibt
class Probe extends Component {
  log: string[] = [];
  override onAttach() { this.log.push('attach'); }
  override update(dt: number) { this.log.push(`update ${dt}`); }
  override onDetach() { this.log.push('detach'); }
}
class SpecialProbe extends Probe {}

describe('Entity', () => {
  it('findet Komponenten über ihre Klasse und Oberklasse', () => {
    const e = new Entity('test');
    const p = e.add(new SpecialProbe());
    expect(e.get(SpecialProbe)).toBe(p);
    expect(e.get(Probe)).toBe(p);
    expect(e.has(ValuesComponent)).toBe(false);
    expect(() => e.require(ValuesComponent)).toThrow(/keine ValuesComponent/);
  });

  it('erlaubt pro Klasse nur eine Komponente', () => {
    const e = new Entity('test');
    e.add(new Probe());
    expect(() => e.add(new Probe())).toThrow(/schon eine Probe/);
  });

  it('ruft onAttach erst, wenn die Entity in der Welt ist', () => {
    const world = new World(new THREE.Group());
    const e = new Entity('test');
    const p = e.add(new Probe());
    expect(p.log).toEqual([]);
    world.add(e);
    expect(p.log).toEqual(['attach']);
    const late = new Entity('test2');
    world.add(late);
    const q = late.add(new Probe());
    expect(q.log).toEqual(['attach']);
  });
});

describe('World', () => {
  it('verwaltet Lebenszyklus, Szene und Ereignisse', () => {
    const root = new THREE.Group();
    const world = new World(root);
    const events: string[] = [];
    world.events.on('added', (e) => events.push(`+${e.typeId}`));
    world.events.on('removed', (e) => events.push(`-${e.typeId}`));

    const e = new Entity('regal');
    const p = e.add(new Probe());
    world.add(e);
    world.update(0.5);
    expect(root.children).toContain(e.object);
    expect(world.get(e.id)).toBe(e);

    world.remove(e);
    expect(p.log).toEqual(['attach', 'update 0.5', 'detach']);
    expect(root.children).not.toContain(e.object);
    expect(world.size).toBe(0);
    expect(e.world).toBeNull();
    expect(events).toEqual(['+regal', '-regal']);
  });

  it('findet Entities mit einer Komponente', () => {
    const world = new World(new THREE.Group());
    const a = new Entity('a'); a.add(new Probe());
    const b = new Entity('b');
    world.add(a); world.add(b);
    expect([...world.query(Probe)].map(([e]) => e)).toEqual([a]);
  });
});

describe('sumValues', () => {
  it('summiert die Werte aller Bauteile', () => {
    const world = new World(new THREE.Group());
    const make = (werte: Record<string, number>) => { const e = new Entity('x'); e.add(new ValuesComponent(werte)); world.add(e); return e; };
    make({ slots: 4 });
    make({ slots: 4 });
    const kuehl = make({ slots: 3, strom: 0.8 });
    expect(sumValues(world)).toEqual({ slots: 11, strom: 0.8 });
    expect(sumValues(world, (id) => id === kuehl.id)).toEqual({ slots: 3, strom: 0.8 });
  });
});
