import { Emitter } from '../core/Emitter';
import { levelUnlocks, type Unlocks } from './Research';
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
  /** Ganze Paletten (günstiger je Karton, brauchen einen Palettenplatz) */
  paletten?: number;
}

/** Paletten im Einkauf: Kartons je Palette und Rabatt */
export interface PalletOffer {
  kartons: number;
  rabatt: number;
}

/** Normale Lieferung zum nächsten Termin oder Express */
export type ShippingKind = 'normal' | 'express';

/** Was das Lager für den Einkauf können muss. */
export interface StoragePort {
  freeSlots(): number;
  /** Einen Karton liefern (bzw. für die Lieferung vormerken) */
  deliver(produkt: ProductDef, menge: number): void;
  /** Lieferkosten für so viele Kartons und Paletten (ohne: kostenlos) */
  fee?(kartons: number, art: ShippingKind, paletten?: number): number;
  /** Freie Palettenplätze (ohne: keine Paletten möglich) */
  freePalletSlots?(): number;
  /** Eine ganze Palette liefern (bzw. vormerken) */
  deliverPallet?(produkt: ProductDef, kartons: number): void;
  /** Vorgemerkte Kartons als eine Lieferung abschicken; gibt die Ankunft (Spielminuten) zurück */
  ship?(art: ShippingKind): number;
}

export type OrderError =
  | { grund: 'leer' }
  | { grund: 'gesperrt'; produkt: ProductDef; level: number; sperre: string }
  | { grund: 'platz'; frei: number; noetig: number }
  | { grund: 'palettenplatz'; frei: number; noetig: number }
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
    /** Was freigeschaltet ist (Level und Forschung); ohne Angabe nur nach Level */
    readonly unlocks: Unlocks = levelUnlocks(() => player.level),
    /** Paletten: Kartons je Palette, Rabatt (ohne: nur Kartons) */
    readonly palette: PalletOffer | null = null,
  ) {}

  /** Preis einer ganzen Palette (mit Rabatt), auf Cent gerundet */
  palletPrice(p: ProductDef): number {
    if (!this.palette) return 0;
    return Math.round(this.cartonPrice(p) * this.palette.kartons * (1 - this.palette.rabatt) * 100) / 100;
  }

  /** Können Paletten gekauft werden? */
  get pallets(): boolean {
    return !!this.palette && typeof this.storage.deliverPallet === 'function';
  }

  freePalletSlots(): number {
    return this.storage.freePalletSlots?.() ?? 0;
  }

  /** Preis eines Kartons: EK × Stück pro Karton, auf Cent gerundet. */
  cartonPrice(p: ProductDef): number {
    return Math.round(p.ek * p.gebinde * 100) / 100;
  }

  isUnlocked(p: ProductDef): boolean {
    return this.unlocks.ok(p);
  }

  /** Kosten (Ware + Versand) und Kartonzahl einer Auswahl (ohne zu kaufen). */
  quote(lines: OrderLine[], art: ShippingKind = 'normal'): { kosten: number; ware: number; versand: number; kartons: number; paletten: number } {
    let ware = 0, kartons = 0, paletten = 0;
    for (const l of lines) {
      const p = this.produkte.get(l.produkt);
      if (l.kartons > 0) { ware += this.cartonPrice(p) * l.kartons; kartons += l.kartons; }
      const pal = this.pallets ? l.paletten ?? 0 : 0;
      if (pal > 0) { ware += this.palletPrice(p) * pal; paletten += pal; }
    }
    ware = Math.round(ware * 100) / 100;
    const versand = kartons || paletten ? Math.round((this.storage.fee?.(kartons, art, paletten) ?? 0) * 100) / 100 : 0;
    return { kosten: Math.round((ware + versand) * 100) / 100, ware, versand, kartons, paletten };
  }

  /** Gibt es Lieferkosten (also einen LKW)? */
  get shipping(): boolean {
    return typeof this.storage.ship === 'function';
  }

  freeSlots(): number {
    return this.storage.freeSlots();
  }

  order(input: OrderLine[], art: ShippingKind = 'normal'): OrderResult {
    const lines = input.filter((l) => l.kartons > 0 || (this.pallets && (l.paletten ?? 0) > 0));
    if (!lines.length) return { ok: false, fehler: { grund: 'leer' } };

    for (const l of lines) {
      const p = this.produkte.get(l.produkt);
      if (!this.isUnlocked(p)) return { ok: false, fehler: { grund: 'gesperrt', produkt: p, level: p.freischaltLevel, sperre: this.unlocks.sperre(p) ?? '' } };
    }
    const { kosten, ware, versand, kartons, paletten } = this.quote(lines, art);
    const frei = this.storage.freeSlots();
    if (kartons > frei) return { ok: false, fehler: { grund: 'platz', frei, noetig: kartons } };
    const palFrei = this.freePalletSlots();
    if (paletten > palFrei) return { ok: false, fehler: { grund: 'palettenplatz', frei: palFrei, noetig: paletten } };
    if (kosten > this.player.geld) return { ok: false, fehler: { grund: 'geld', kosten } };
    this.player.spend(ware, 'einkauf');
    if (versand > 0) this.player.spend(versand, 'lieferung');

    for (const l of lines) {
      const p = this.produkte.get(l.produkt);
      for (let i = 0; i < l.kartons; i++) this.storage.deliver(p, p.gebinde);
      if (this.pallets) for (let i = 0; i < (l.paletten ?? 0); i++) this.storage.deliverPallet!(p, this.palette!.kartons);
    }
    const ankunft = this.storage.ship?.(art);
    this.events.emit('ordered', { kosten, kartons, lines });
    return ankunft === undefined ? { ok: true, kosten, kartons } : { ok: true, kosten, kartons, versand, ankunft };
  }
}
