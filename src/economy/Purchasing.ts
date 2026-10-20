import { Emitter } from '../core/Emitter';
import type { ProductDef } from '../content/definitions';
import type { Registry } from '../content/Registry';
import type { PlayerState } from '../state/PlayerState';

// Einkauf beim Großhandel: Ware wird kartonweise zum Einkaufspreis (EK) gekauft.
// Wohin sie geht, entscheidet die Schnittstelle StoragePort: direkt ins Lager (CartonStorage)
// oder per LKW (Deliveries – dann kommen Lieferkosten und eine Ankunftszeit dazu).
// Geprüft wird der Reihe nach: Auswahl leer? Produkt freigeschaltet? Genug Lagerplatz? Genug Geld?
// Erst wenn alles passt, wird bezahlt und geliefert – ein Fehler ändert nichts.
// Keine three.js-Abhängigkeit.

export interface OrderLine {
  produkt: string;
  kartons: number;
}

/** Normale Lieferung zum nächsten Termin oder Express */
export type ShippingKind = 'normal' | 'express';

/** Was das Lager für den Einkauf können muss. */
export interface StoragePort {
  freeSlots(): number;
  /** Einen Karton liefern (bzw. für die Lieferung vormerken) */
  deliver(produkt: ProductDef, menge: number): void;
  /** Lieferkosten für so viele Kartons (ohne: kostenlos) */
  fee?(kartons: number, art: ShippingKind): number;
  /** Vorgemerkte Kartons als eine Lieferung abschicken; gibt die Ankunft (Spielminuten) zurück */
  ship?(art: ShippingKind): number;
}

export type OrderError =
  | { grund: 'leer' }
  | { grund: 'gesperrt'; produkt: ProductDef; level: number }
  | { grund: 'platz'; frei: number; noetig: number }
  | { grund: 'geld'; kosten: number };

export type OrderResult =
  | { ok: true; kosten: number; kartons: number; versand?: number; ankunft?: number }
  | { ok: false; fehler: OrderError };

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

  /** Kosten (Ware + Versand) und Kartonzahl einer Auswahl (ohne zu kaufen). */
  quote(lines: OrderLine[], art: ShippingKind = 'normal'): { kosten: number; ware: number; versand: number; kartons: number } {
    let ware = 0, kartons = 0;
    for (const l of lines) {
      if (l.kartons <= 0) continue;
      ware += this.cartonPrice(this.produkte.get(l.produkt)) * l.kartons;
      kartons += l.kartons;
    }
    ware = Math.round(ware * 100) / 100;
    const versand = kartons ? Math.round((this.storage.fee?.(kartons, art) ?? 0) * 100) / 100 : 0;
    return { kosten: Math.round((ware + versand) * 100) / 100, ware, versand, kartons };
  }

  /** Gibt es Lieferkosten (also einen LKW)? */
  get shipping(): boolean {
    return typeof this.storage.ship === 'function';
  }

  freeSlots(): number {
    return this.storage.freeSlots();
  }

  order(input: OrderLine[], art: ShippingKind = 'normal'): OrderResult {
    const lines = input.filter((l) => l.kartons > 0);
    if (!lines.length) return { ok: false, fehler: { grund: 'leer' } };

    for (const l of lines) {
      const p = this.produkte.get(l.produkt);
      if (!this.isUnlocked(p)) return { ok: false, fehler: { grund: 'gesperrt', produkt: p, level: p.freischaltLevel } };
    }
    const { kosten, ware, versand, kartons } = this.quote(lines, art);
    const frei = this.storage.freeSlots();
    if (kartons > frei) return { ok: false, fehler: { grund: 'platz', frei, noetig: kartons } };
    if (kosten > this.player.geld) return { ok: false, fehler: { grund: 'geld', kosten } };
    this.player.spend(ware, 'einkauf');
    if (versand > 0) this.player.spend(versand, 'lieferung');

    for (const l of lines) {
      const p = this.produkte.get(l.produkt);
      for (let i = 0; i < l.kartons; i++) this.storage.deliver(p, p.gebinde);
    }
    const ankunft = this.storage.ship?.(art);
    this.events.emit('ordered', { kosten, kartons, lines });
    return ankunft === undefined ? { ok: true, kosten, kartons } : { ok: true, kosten, kartons, versand, ankunft };
  }
}
