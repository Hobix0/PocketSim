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
  /** Steht auf dem Immobilienmarkt (Ladenlokal oder Grundstück); `miete` je Tag, ohne: nur kaufen */
  angebot?: PlotOffer;
}

export interface PlotOffer {
  groesse: 'klein' | 'mittel' | 'gross' | 'grundstueck';
  zustand?: 'alt' | 'neu';
  lage: string;
  miete?: number;
  /** Freistehend mit eigenem Parkplatz (mehr Kundschaft von weiter weg) */
  parkplatz?: boolean;
}

export interface PlotEvents extends Record<string, unknown> {
  bought: PlotDef;
  rented: PlotDef;
  /** Mietvertrag beendet: gekündigt oder (nach mehreren Tagen ohne Miete) ausgelaufen */
  ended: { plot: PlotDef; grund: 'gekuendigt' | 'keine_miete' };
  /** Miete konnte heute nicht bezahlt werden */
  unpaid: { plot: PlotDef; tage: number };
}

export type BuyResult = { ok: true } | { ok: false; grund: 'gesperrt' | 'geld' | 'besessen' | 'keine_miete' | 'nicht_gemietet' | 'nicht_leer' };

/** So viele Tage ohne Miete, dann endet der Mietvertrag */
export const MIETE_TAGE_OHNE_ZAHLUNG = 3;

export class Plots {
  readonly events = new Emitter<PlotEvents>();
  private readonly owned = new Set<string>();
  /** Gemietet: id → Tage ohne bezahlte Miete */
  private readonly rented = new Map<string, number>();

  constructor(readonly list: PlotDef[], private readonly player: PlayerState) {
    for (const p of list) if (p.besessen) this.owned.add(p.id);
  }

  /** Gibt es überhaupt Grundstücke? Ohne Angabe im Level darf überall gebaut werden. */
  get active(): boolean {
    return this.list.length > 0;
  }

  /** Gehört dir (gekauft oder gemietet): hier darfst du bauen */
  isOwned(id: string): boolean {
    return this.owned.has(id) || this.rented.has(id);
  }

  isRented(id: string): boolean {
    return this.rented.has(id);
  }

  /** Miete aller gemieteten Flächen je Tag */
  get mieteProTag(): number {
    return [...this.rented.keys()].reduce((n, id) => n + (this.list.find((p) => p.id === id)?.angebot?.miete ?? 0), 0);
  }

  /** Liegt der Punkt auf einem eigenen Grundstück (mit etwas Spielraum für Wände am Rand)? */
  allows(x: number, z: number, rand = 0): boolean {
    if (!this.active) return true;
    return this.list.some((p) => this.isOwned(p.id)
      && x >= p.rect.minX - rand && x <= p.rect.maxX + rand && z >= p.rect.minZ - rand && z <= p.rect.maxZ + rand);
  }

  buy(id: string): BuyResult {
    const p = this.list.find((x) => x.id === id);
    if (!p || this.owned.has(id)) return { ok: false, grund: 'besessen' };
    if (p.freischaltLevel > this.player.level) return { ok: false, grund: 'gesperrt' };
    // Gemietet und jetzt gekauft: der Mietvertrag endet
    if (!this.player.spend(p.preis, 'grundstueck')) return { ok: false, grund: 'geld' };
    this.rented.delete(id);
    this.owned.add(id);
    this.events.emit('bought', p);
    return { ok: true };
  }

  /** Mieten: die erste Tagesmiete gleich, dann jeden Morgen */
  rent(id: string): BuyResult {
    const p = this.list.find((x) => x.id === id);
    if (!p || this.isOwned(id)) return { ok: false, grund: 'besessen' };
    if (!p.angebot?.miete) return { ok: false, grund: 'keine_miete' };
    if (p.freischaltLevel > this.player.level) return { ok: false, grund: 'gesperrt' };
    if (!this.player.spend(p.angebot.miete, 'miete')) return { ok: false, grund: 'geld' };
    this.rented.set(id, 0);
    this.events.emit('rented', p);
    return { ok: true };
  }

  /** Kündigen (nur wenn innen nichts mehr von dir steht – das prüft `leer`) */
  cancel(id: string, leer: (p: PlotDef) => boolean = () => true): BuyResult {
    const p = this.list.find((x) => x.id === id);
    if (!p || !this.rented.has(id)) return { ok: false, grund: 'nicht_gemietet' };
    if (!leer(p)) return { ok: false, grund: 'nicht_leer' };
    this.rented.delete(id);
    this.events.emit('ended', { plot: p, grund: 'gekuendigt' });
    return { ok: true };
  }

  /** Jeden Morgen: Miete abbuchen; wer mehrere Tage nicht zahlen kann, verliert den Mietvertrag */
  payRent(): void {
    for (const [id, tage] of [...this.rented]) {
      const p = this.list.find((x) => x.id === id);
      if (!p) { this.rented.delete(id); continue; }
      if (this.player.spend(p.angebot?.miete ?? 0, 'miete')) { this.rented.set(id, 0); continue; }
      const n = tage + 1;
      if (n >= MIETE_TAGE_OHNE_ZAHLUNG) { this.rented.delete(id); this.events.emit('ended', { plot: p, grund: 'keine_miete' }); }
      else { this.rented.set(id, n); this.events.emit('unpaid', { plot: p, tage: n }); }
    }
  }

  /** Gemietete Flächen für den Spielstand: [id, Tage ohne Miete] */
  rentState(): [string, number][] {
    return [...this.rented];
  }

  restoreRent(list: unknown): void {
    this.rented.clear();
    if (!Array.isArray(list)) return;
    for (const x of list) {
      if (Array.isArray(x) && typeof x[0] === 'string' && this.list.some((p) => p.id === x[0]) && !this.owned.has(x[0])) this.rented.set(x[0], Number(x[1]) || 0);
    }
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
