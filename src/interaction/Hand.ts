import { Emitter } from '../core/Emitter';
import type { Entity } from '../ecs/Entity';

// Was der Spieler gerade in der Hand hält (vorerst: einen Karton).
// Gehört zum Spieler, nicht zur Welt – im Koop-Modus hat jeder seine eigene Hand.

export interface HandEvents extends Record<string, unknown> {
  changed: Entity | null;
}

export class Hand {
  readonly events = new Emitter<HandEvents>();
  private held: Entity | null = null;

  get carried(): Entity | null {
    return this.held;
  }

  take(entity: Entity): void {
    if (this.held === entity) return;
    this.held = entity;
    this.events.emit('changed', entity);
  }

  clear(): void {
    if (!this.held) return;
    this.held = null;
    this.events.emit('changed', null);
  }
}
