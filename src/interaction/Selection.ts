import { Emitter } from '../core/Emitter';
import type { Entity } from '../ecs/Entity';

// Die aktuell ausgewählte Entity. Meldet jede Änderung, damit Hervorhebung
// und Info-Fenster nicht jeden Frame nachfragen müssen.

export interface SelectionEvents extends Record<string, unknown> {
  changed: { previous: Entity | null; current: Entity | null };
}

export class Selection {
  readonly events = new Emitter<SelectionEvents>();
  private entity: Entity | null = null;

  get current(): Entity | null {
    return this.entity;
  }

  set(entity: Entity | null): void {
    if (entity === this.entity) return;
    const previous = this.entity;
    this.entity = entity;
    this.events.emit('changed', { previous, current: entity });
  }

  clear(): void {
    this.set(null);
  }
}
