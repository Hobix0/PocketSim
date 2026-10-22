import { Emitter } from '../core/Emitter';
import type { ProductDef } from '../content/definitions';
import type { Registry } from '../content/Registry';
import type { PlayerState } from '../state/PlayerState';
import type { ShippingKind, StoragePort } from './Purchasing';
import type { CentralStock } from './Production';

// Zentrallager im Industriegebiet: ein großer Bestand (Stück je Ware), unabhängig vom Ladenlager.
//  · Großhandel → Zentrallager: Einkaufen mit Ziel „Zentrallager“ (dieses Lager ist dann der StoragePort)
//  · Produktionslinien holen ihre Rohstoffe hier und liefern fertige Kartons hierher (CentralStock)
//  · Zentrallager → Laden: „abholen lassen“ – ein LKW bringt die Kartons wie eine Lieferung zum Laden
// Ohne eigenes (gekauftes oder gemietetes) Zentrallager-Grundstück geht nichts davon.
// Werte: data/produktion/zentrallager.json

export interface WarehouseSettings {
  /** Platz im Lager (Kartons) */
  kapazitaet: number;
  /** Lieferung vom Großhandel hierher: Spielminuten (normal / express) und Kosten */
  anlieferung: { minuten: number; expressMinuten: number; grund: number; proKarton: number; expressAufschlag: number };
  /** Abholen in den Laden: Kosten je Fahrt und Karton */
  abholung: { grund: number; proKarton: number };
}

interface Incoming {
  ankunft: number;
  waren: { produkt: string; menge: number }[];
}

export interface WarehouseEvents extends Record<string, unknown> {
  arrived: { kartons: number };
  produced: { produkt: ProductDef; menge: number };
  sent: { kartons: number; ankunft: number };
}

export interface ShopDelivery {
  freeSlots(): number;
  deliver(produkt: ProductDef, menge: number): void;
  ship?(art: ShippingKind): number;
}

export type TransferResult = { ok: true; kosten: number; ankunft?: number } | { ok: false; grund: 'kein_lager' | 'bestand' | 'platz' | 'geld' };

export class CentralWarehouse implements StoragePort, CentralStock {
  readonly events = new Emitter<WarehouseEvents>();
  private readonly bestand = new Map<string, number>();
  private readonly incoming: Incoming[] = [];
  private draft: { produkt: string; menge: number }[] = [];

  constructor(
    readonly settings: WarehouseSettings,
    private readonly waren: Registry<ProductDef>,
    private readonly player: PlayerState,
    /** Gehört dir ein Zentrallager? */
    readonly active: () => boolean,
    private readonly now: () => number,
  ) {}

  // ── Bestand ──────────────────────────────────────────────

  available(ware: string): number {
    return this.bestand.get(ware) ?? 0;
  }

  /** Kartons, die eine Menge belegt */
  private kartonsFor(ware: string, menge: number): number {
    const g = this.waren.find(ware)?.gebinde ?? 1;
    return Math.ceil(menge / Math.max(1, g));
  }

  /** Belegte Kartonplätze */
  get belegt(): number {
    let n = 0;
    for (const [w, m] of this.bestand) n += this.kartonsFor(w, m);
    return n;
  }

  /** Bestand als Liste (für das Fenster), Waren mit mehr Kartons zuerst */
  list(): { produkt: ProductDef; menge: number; kartons: number }[] {
    const out: { produkt: ProductDef; menge: number; kartons: number }[] = [];
    for (const [w, m] of this.bestand) {
      const p = this.waren.find(w);
      if (p && m > 0) out.push({ produkt: p, menge: m, kartons: Math.floor(m / Math.max(1, p.gebinde)) });
    }
    return out.sort((a, b) => b.kartons - a.kartons || a.produkt.name.localeCompare(b.produkt.name));
  }

  take(ware: string, menge: number): void {
    const rest = this.available(ware) - menge;
    if (rest > 0) this.bestand.set(ware, rest); else this.bestand.delete(ware);
  }

  put(ware: string, menge: number): boolean {
    if (!this.active()) return false;
    if (this.belegt - this.kartonsFor(ware, this.available(ware)) + this.kartonsFor(ware, this.available(ware) + menge) > this.settings.kapazitaet) return false;
    this.bestand.set(ware, this.available(ware) + menge);
    const p = this.waren.find(ware);
    if (p && !p.rohstoff) this.events.emit('produced', { produkt: p, menge });
    return true;
  }

  // ── StoragePort: Einkauf beim Großhandel mit Ziel Zentrallager ──────────

  freeSlots(): number {
    if (!this.active()) return 0;
    const unterwegs = this.incoming.reduce((n, i) => n + i.waren.length, 0) + this.draft.length;
    return Math.max(0, this.settings.kapazitaet - this.belegt - unterwegs);
  }

  freePalletSlots(): number {
    return Math.floor(this.freeSlots() / 18);
  }

  fee(kartons: number, art: ShippingKind, paletten = 0): number {
    if (kartons + paletten <= 0) return 0;
    const a = this.settings.anlieferung;
    return a.grund + a.proKarton * (kartons + paletten * 18) + (art === 'express' ? a.expressAufschlag : 0);
  }

  deliver(produkt: ProductDef, menge: number): void {
    this.draft.push({ produkt: produkt.id, menge });
  }

  deliverPallet(produkt: ProductDef, kartons: number): void {
    for (let i = 0; i < kartons; i++) this.draft.push({ produkt: produkt.id, menge: produkt.gebinde });
  }

  ship(art: ShippingKind): number {
    const a = this.settings.anlieferung;
    const ankunft = this.now() + (art === 'express' ? a.expressMinuten : a.minuten);
    if (this.draft.length) this.incoming.push({ ankunft, waren: this.draft });
    this.draft = [];
    return ankunft;
  }

  /** Was noch kommt (Kartons) */
  get unterwegs(): number {
    return this.incoming.reduce((n, i) => n + i.waren.length, 0);
  }

  /** Fällige Lieferungen einlagern */
  update(now = this.now()): void {
    for (let i = this.incoming.length - 1; i >= 0; i--) {
      const s = this.incoming[i];
      if (s.ankunft > now) continue;
      this.incoming.splice(i, 1);
      for (const w of s.waren) this.bestand.set(w.produkt, this.available(w.produkt) + w.menge);
      this.events.emit('arrived', { kartons: s.waren.length });
    }
  }

  // ── Abholen in den Laden ─────────────────────────────────

  transferCost(kartons: number): number {
    return kartons > 0 ? this.settings.abholung.grund + this.settings.abholung.proKarton * kartons : 0;
  }

  /** So viele Kartons eines Produkts mit dem LKW in den Laden bringen lassen */
  send(produkt: ProductDef, kartons: number, laden: ShopDelivery, art: ShippingKind = 'normal'): TransferResult {
    if (!this.active()) return { ok: false, grund: 'kein_lager' };
    if (kartons <= 0 || this.available(produkt.id) < kartons * produkt.gebinde) return { ok: false, grund: 'bestand' };
    if (laden.freeSlots() < kartons) return { ok: false, grund: 'platz' };
    const kosten = this.transferCost(kartons);
    if (!this.player.spend(kosten, 'lieferung')) return { ok: false, grund: 'geld' };
    this.take(produkt.id, kartons * produkt.gebinde);
    for (let i = 0; i < kartons; i++) laden.deliver(produkt, produkt.gebinde);
    const ankunft = laden.ship?.(art);
    this.events.emit('sent', { kartons, ankunft: ankunft ?? this.now() });
    return ankunft === undefined ? { ok: true, kosten } : { ok: true, kosten, ankunft };
  }

  // ── Spielstand ───────────────────────────────────────────

  state(): { bestand: [string, number][]; unterwegs: Incoming[] } {
    return { bestand: [...this.bestand], unterwegs: this.incoming.map((i) => ({ ankunft: i.ankunft, waren: i.waren.map((w) => ({ ...w })) })) };
  }

  restore(raw: unknown): void {
    this.bestand.clear();
    this.incoming.length = 0;
    const d = raw as { bestand?: unknown; unterwegs?: unknown } | undefined;
    if (Array.isArray(d?.bestand)) {
      for (const x of d.bestand) if (Array.isArray(x) && this.waren.has(String(x[0])) && Number(x[1]) > 0) this.bestand.set(String(x[0]), Number(x[1]));
    }
    if (Array.isArray(d?.unterwegs)) {
      for (const i of d.unterwegs as Incoming[]) {
        if (typeof i?.ankunft !== 'number' || !Array.isArray(i.waren)) continue;
        this.incoming.push({ ankunft: i.ankunft, waren: i.waren.filter((w) => this.waren.has(w.produkt) && w.menge > 0) });
      }
    }
  }
}
