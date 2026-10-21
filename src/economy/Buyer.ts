import type { BuyerSettings, ProductDef } from '../content/definitions';
import type { OrderLine } from './Purchasing';

// Einkäufer: kauft automatisch nach, was der Laden führt.
// "Gelistet" ist jedes Produkt, das schon einmal in einem Regal stand oder einem Fach fest gehört.
// Ziel je Produkt: so viel, wie in seine Regalplätze passt (mindestens ein Karton), plus Reserve-Kartons im Lager.
// Bestellt wird, sobald mindestens ein ganzer Karton fehlt – die leersten Produkte zuerst,
// solange Geld (über dem Mindestguthaben) und Lagerplatz reichen. Keine three.js-Abhängigkeit.

/** Stand eines Produkts für die Planung */
export interface StockInfo {
  produkt: ProductDef;
  /** Platz in Regalen (feste Fächer + Fächer, in denen es gerade steht), in Stück */
  regalPlatz: number;
  /** Alles, was da ist oder kommt: Regal + Kartons im Lager/auf dem LKW + unterwegs, in Stück */
  bestand: number;
}

export interface PlanLimits {
  /** Was ausgegeben werden darf (Geld minus Mindestguthaben) */
  budget: number;
  /** Freie Lagerplätze (Kartons) */
  freiePlaetze: number;
  /** Gesamtkosten einer Auswahl (Ware + Versand) */
  kosten(lines: OrderLine[]): number;
}

/** Zielbestand eines Produkts in Stück */
export function targetStock(s: StockInfo, settings: BuyerSettings): number {
  return Math.max(s.regalPlatz, s.produkt.gebinde) + settings.reserveKartons * s.produkt.gebinde;
}

/** Was nachbestellt werden soll – die knappsten Produkte zuerst, bis Geld oder Platz ausgehen */
export function planReorder(items: StockInfo[], settings: BuyerSettings, limits: PlanLimits): OrderLine[] {
  const needs = items
    .map((s) => {
      const ziel = targetStock(s, settings);
      return { s, ziel, kartons: Math.floor((ziel - s.bestand) / s.produkt.gebinde) };
    })
    .filter((n) => n.kartons >= 1)
    .sort((a, b) => a.s.bestand / a.ziel - b.s.bestand / b.ziel);
  const lines: OrderLine[] = [];
  let plaetze = limits.freiePlaetze;
  for (const n of needs) {
    // So viele Kartons wie möglich, notfalls weniger
    for (let k = Math.min(n.kartons, plaetze); k >= 1; k--) {
      const probe = [...lines, { produkt: n.s.produkt.id, kartons: k }];
      if (limits.kosten(probe) > limits.budget) continue;
      lines.push({ produkt: n.s.produkt.id, kartons: k });
      plaetze -= k;
      break;
    }
    if (plaetze <= 0) break;
  }
  return lines;
}

/** Was der Einkäufer kennt: gelistete Produkte und solche, die nicht nachgekauft werden sollen */
export class Listing {
  readonly gelistet = new Set<string>();
  /** Vom Spieler ausgenommen („nicht nachkaufen“) */
  readonly aus = new Set<string>();

  add(produktId: string): void {
    this.gelistet.add(produktId);
  }

  /** Soll dieses Produkt nachgekauft werden? */
  aktiv(produktId: string): boolean {
    return this.gelistet.has(produktId) && !this.aus.has(produktId);
  }

  setAktiv(produktId: string, an: boolean): void {
    if (an) { this.gelistet.add(produktId); this.aus.delete(produktId); } else this.aus.add(produktId);
  }

  state(): { gelistet: string[]; aus: string[] } {
    return { gelistet: [...this.gelistet], aus: [...this.aus] };
  }

  restore(s: unknown, known: (id: string) => boolean): void {
    this.gelistet.clear();
    this.aus.clear();
    if (!s || typeof s !== 'object') return;
    const { gelistet, aus } = s as { gelistet?: unknown; aus?: unknown };
    for (const id of Array.isArray(gelistet) ? gelistet : []) if (typeof id === 'string' && known(id)) this.gelistet.add(id);
    for (const id of Array.isArray(aus) ? aus : []) if (typeof id === 'string' && known(id)) this.aus.add(id);
  }
}
