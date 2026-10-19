import { Emitter } from '../core/Emitter';
import type { GoalDef } from '../content/definitions';
import type { PlayerState } from '../state/PlayerState';

// Ziele für den Einstieg (data/ziele/*.json). Texte, Reihenfolge und Belohnungen stehen in den Daten;
// wann ein Ziel erfüllt ist, meldet das Spiel mit complete(id). Keine three.js-Abhängigkeit.

export interface GoalEvents extends Record<string, unknown> {
  completed: GoalDef;
}

export class Goals {
  readonly events = new Emitter<GoalEvents>();
  private readonly done = new Set<string>();

  constructor(readonly list: GoalDef[], private readonly player: PlayerState) {}

  isDone(id: string): boolean {
    return this.done.has(id);
  }

  /** Noch offene Ziele in der Reihenfolge der Datei. */
  get open(): GoalDef[] {
    return this.list.filter((g) => !this.done.has(g.id));
  }

  /** Ziel erfüllt: Belohnung auszahlen (nur beim ersten Mal). Unbekannte ids werden ignoriert. */
  complete(id: string): void {
    const goal = this.list.find((g) => g.id === id);
    if (!goal || this.done.has(id)) return;
    this.done.add(id);
    if (goal.belohnung.geld) this.player.earn(goal.belohnung.geld, 'ziel');
    if (goal.belohnung.xp) this.player.addXp(goal.belohnung.xp);
    this.events.emit('completed', goal);
  }
}
