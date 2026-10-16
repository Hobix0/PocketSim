import type * as THREE from 'three';
import { Emitter } from '../core/Emitter';
import type { Component, ComponentClass } from './Component';
import type { Entity } from './Entity';

// Verwaltet alle Entities: hinzufügen, entfernen, jeden Frame aktualisieren,
// und nach Entities mit bestimmten Komponenten suchen.
// Meldet Änderungen über `events`, z. B. für HUD-Anzeigen.

export interface WorldEvents extends Record<string, unknown> {
  added: Entity;
  removed: Entity;
}

export class World {
  readonly events = new Emitter<WorldEvents>();
  private readonly entities = new Map<number, Entity>();

  /** root: Knoten in der Szene, unter den alle Entities gehängt werden. */
  constructor(private readonly root: THREE.Object3D) {}

  add(entity: Entity): Entity {
    if (entity.world) throw new Error(`${entity.object.name} ist schon in einer Welt`);
    entity.world = this;
    this.entities.set(entity.id, entity);
    this.root.add(entity.object);
    for (const c of entity.all()) c.onAttach();
    this.events.emit('added', entity);
    return entity;
  }

  remove(entity: Entity): void {
    if (entity.world !== this) return;
    for (const c of entity.all()) c.onDetach();
    this.root.remove(entity.object);
    this.entities.delete(entity.id);
    entity.world = null;
    this.events.emit('removed', entity);
  }

  update(dt: number): void {
    for (const e of this.entities.values()) for (const c of e.all()) c.update(dt);
  }

  get(id: number): Entity | undefined {
    return this.entities.get(id);
  }

  get size(): number {
    return this.entities.size;
  }

  all(): IterableIterator<Entity> {
    return this.entities.values();
  }

  /** Alle Entities mit einer bestimmten Komponente, jeweils als [Entity, Komponente]. */
  *query<T extends Component>(cls: ComponentClass<T>): Generator<[Entity, T]> {
    for (const e of this.entities.values()) {
      const c = e.get(cls);
      if (c) yield [e, c];
    }
  }
}
