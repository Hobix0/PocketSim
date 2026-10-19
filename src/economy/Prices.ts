import { Emitter } from '../core/Emitter';
import type { CustomerSettings, ProductDef } from '../content/definitions';

// Eigene Verkaufspreise. Ohne Angabe gilt der empfohlene Preis (vk aus data/produkte).
// Kunden vergleichen mit diesem empfohlenen Preis (siehe buyChance). Keine three.js-Abhängigkeit.

export interface PriceEvents extends Record<string, unknown> {
  changed: { produkt: string };
}

export class PriceBook {
  readonly events = new Emitter<PriceEvents>();
  private readonly own = new Map<string, number>();

  constructor(private readonly settings: CustomerSettings['preis']) {}

  /** Aktueller Verkaufspreis */
  get(p: ProductDef): number {
    return this.own.get(p.id) ?? p.vk;
  }

  isOwn(p: ProductDef): boolean {
    return this.own.has(p.id);
  }

  /** Preis setzen (auf 5 Cent gerundet, im erlaubten Bereich rund um den empfohlenen Preis). */
  set(p: ProductDef, preis: number): void {
    // Genau der empfohlene Preis (der oft nicht auf 5 Cent endet) zählt als „nicht geändert“
    if (Math.abs(preis - p.vk) < 0.005) { this.reset(p); return; }
    const min = Math.max(0.05, p.vk * this.settings.min), max = p.vk * this.settings.max;
    const v = Math.round(Math.min(max, Math.max(min, preis)) * 20) / 20;
    if (Math.abs(v - p.vk) < 0.001) this.own.delete(p.id);
    else this.own.set(p.id, v);
    this.events.emit('changed', { produkt: p.id });
  }

  reset(p: ProductDef): void {
    if (this.own.delete(p.id)) this.events.emit('changed', { produkt: p.id });
  }

  /** Preis im Verhältnis zum empfohlenen (1 = empfohlen) */
  ratio(p: ProductDef): number {
    return p.vk > 0 ? this.get(p) / p.vk : 1;
  }

  state(): Record<string, number> {
    return Object.fromEntries(this.own);
  }

  restore(s: Record<string, number>): void {
    this.own.clear();
    for (const [id, v] of Object.entries(s)) if (Number.isFinite(v) && v > 0) this.own.set(id, v);
  }
}

/** Wie wahrscheinlich ein Kunde bei diesem Preisverhältnis zugreift (0–1). */
export function buyChance(s: CustomerSettings['preis'], ratio: number): number {
  const over = ratio - 1 - s.toleranz;
  if (over <= 1e-9) return 1;
  return Math.max(0, 1 - over * s.elastizitaet);
}
