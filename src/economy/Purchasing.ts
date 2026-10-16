import { Emitter } from '../core/Emitter';
import type { ProductDef } from '../content/definitions';
import type { Registry } from '../content/Registry';
import type { PlayerState } from '../state/PlayerState';

// Einkauf beim Großhandel: Ware wird kartonweise zum Einkaufspreis (EK) gekauft
// und sofort als Kartons ins Lager geliefert.
// Geprüft wird der Reihe nach: Auswahl leer? Produkt freigeschaltet? Genug Lagerplatz? Genug Geld?
// Erst wenn alles passt, wird bezahlt und geliefert – ein Fehler ändert nichts.
// Keine three.js-Abhängigkeit; das Lager wird über die Schnittstelle StoragePort angesprochen.

export interface OrderLine {
  produkt: string;
  kartons: number;
}

/** Was das Lager für den Einkauf können muss. */
export interface StoragePort {
  freeSlots(): number;
  deliver(produkt: ProductDef, menge: number): void;
}

export type OrderError =
  | { grund: 'leer' }
  | { grund: 'gesperrt'; produkt: ProductDef; level: number }
  | { grund: 'platz'; frei: number; noetig: number }
  | { grund: 'geld'; kosten: number };

export type OrderResult = { ok: true; kosten: number; kartons: number } | { ok: false; fehler: OrderError };

export interface PurchasingEvents extends Record<string, unknown> {
  ordered: { kosten: number; kartons: number; lines: OrderLine[] };
}

export class Purchasing {
  readonly events = new Emitter<PurchasingEvents>();

  constructor(
    private readonly produkte: Registry<ProductDef>,
    private readonly player: PlayerState,
    private readonly storage: StoragePort,
  ) {}

  /** Preis eines Kartons: EK × Stück pro Karton, auf Cent gerundet. */
  cartonPrice(p: ProductDef): number {
    return Math.round(p.ek * p.gebinde * 100) / 100;
  }

  isUnlocked(p: ProductDef): boolean {
    return p.freischaltLevel <= this.player.level;
  }

  /** Kosten und Kartonzahl einer Auswahl (ohne zu kaufen). */
  quote(lines: OrderLine[]): { kosten: number; kartons: number } {
    let kosten = 0, kartons = 0;
    for (const l of lines) {
      if (l.kartons <= 0) continue;
      kosten += this.cartonPrice(this.produkte.get(l.produkt)) * l.kartons;
      kartons += l.kartons;
    }
    return { kosten: Math.round(kosten * 100) / 100, kartons };
  }

  freeSlots(): number {
    return this.storage.freeSlots();
  }

  order(input: OrderLine[]): OrderResult {
    const lines = input.filter((l) => l.kartons > 0);
    if (!lines.length) return { ok: false, fehler: { grund: 'leer' } };

    for (const l of lines) {
      const p = this.produkte.get(l.produkt);
      if (!this.isUnlocked(p)) return { ok: false, fehler: { grund: 'gesperrt', produkt: p, level: p.freischaltLevel } };
    }
    const { kosten, kartons } = this.quote(lines);
    const frei = this.storage.freeSlots();
    if (kartons > frei) return { ok: false, fehler: { grund: 'platz', frei, noetig: kartons } };
    if (!this.player.spend(kosten, 'einkauf')) return { ok: false, fehler: { grund: 'geld', kosten } };

    for (const l of lines) {
      const p = this.produkte.get(l.produkt);
      for (let i = 0; i < l.kartons; i++) this.storage.deliver(p, p.gebinde);
    }
    this.events.emit('ordered', { kosten, kartons, lines });
    return { ok: true, kosten, kartons };
  }
}
