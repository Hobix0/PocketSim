import { Emitter } from '../core/Emitter';
import type { PlayerState } from '../state/PlayerState';

// Grundstücke: Wo gebaut werden darf. Das Level legt sie fest (data/level/*.json → "grundstuecke");
// manche gehören von Anfang an dazu, weitere kann man ab einem Level kaufen. Keine three.js-Abhängigkeit.

export interface PlotDef {
  id: string;
  name: string;
  /** Fläche in Metern */
  rect: { minX: number; maxX: number; minZ: number; maxZ: number };
  preis: number;
  freischaltLevel: number;
  /** Gehört von Anfang an dazu */
  besessen?: boolean;
}

export interface PlotEvents extends Record<string, unknown> {
  bought: PlotDef;
}

export type BuyResult = { ok: true } | { ok: false; grund: 'gesperrt' | 'geld' | 'besessen' };

export class Plots {
  readonly events = new Emitter<PlotEvents>();
  private readonly owned = new Set<string>();

  constructor(readonly list: PlotDef[], private readonly player: PlayerState) {
    for (const p of list) if (p.besessen) this.owned.add(p.id);
  }

  /** Gibt es überhaupt Grundstücke? Ohne Angabe im Level darf überall gebaut werden. */
  get active(): boolean {
    return this.list.length > 0;
  }

  isOwned(id: string): boolean {
    return this.owned.has(id);
  }

  /** Liegt der Punkt auf einem eigenen Grundstück (mit etwas Spielraum für Wände am Rand)? */
  allows(x: number, z: number, rand = 0): boolean {
    if (!this.active) return true;
    return this.list.some((p) => this.owned.has(p.id)
      && x >= p.rect.minX - rand && x <= p.rect.maxX + rand && z >= p.rect.minZ - rand && z <= p.rect.maxZ + rand);
  }

  buy(id: string): BuyResult {
    const p = this.list.find((x) => x.id === id);
    if (!p || this.owned.has(id)) return { ok: false, grund: 'besessen' };
    if (p.freischaltLevel > this.player.level) return { ok: false, grund: 'gesperrt' };
    if (!this.player.spend(p.preis, 'grundstueck')) return { ok: false, grund: 'geld' };
    this.owned.add(id);
    this.events.emit('bought', p);
    return { ok: true };
  }

  state(): string[] {
    return [...this.owned];
  }

  restore(ids: string[]): void {
    this.owned.clear();
    for (const p of this.list) if (p.besessen) this.owned.add(p.id);
    for (const id of ids) if (this.list.some((p) => p.id === id)) this.owned.add(id);
  }
}
