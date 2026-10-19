import { Emitter } from '../core/Emitter';
import type { UtilitySettings } from '../content/definitions';
import type { PlayerState } from '../state/PlayerState';

// Versorgung mit Strom und Wasser – getrennt von den Rohstoffen.
//  - Bedarf = Grundlast (Summe der werte aller Bauteile) + laufende Maschinen
//  - Der Hausanschluss begrenzt den Bedarf; er lässt sich in Stufen ausbauen
//  - Verbrauch wird mitgezählt und zum Tagesende bezahlt
// Keine three.js-Abhängigkeit.

export type UtilityKind = 'strom' | 'wasser';
export const UTILITY_KINDS: UtilityKind[] = ['strom', 'wasser'];

export interface UtilityEvents extends Record<string, unknown> {
  upgraded: { art: UtilityKind; anschluss: number };
}

export type UpgradeResult = { ok: true } | { ok: false; grund: 'max' | 'gesperrt' | 'geld' };

export class Utilities {
  readonly events = new Emitter<UtilityEvents>();
  private readonly stufe: Record<UtilityKind, number> = { strom: 0, wasser: 0 };
  /** Verbrauch seit dem letzten Abrechnen (kWh bzw. l) */
  private readonly verbraucht: Record<UtilityKind, number> = { strom: 0, wasser: 0 };

  constructor(readonly settings: UtilitySettings, private readonly player: PlayerState) {}

  /** Hausanschluss (kW bzw. l/h) */
  anschluss(art: UtilityKind): number {
    return this.settings[art].stufen[this.stufe[art]].anschluss;
  }

  /** Nächste Ausbaustufe (oder null) */
  nextStage(art: UtilityKind): { anschluss: number; preis: number; freischaltLevel: number } | null {
    return this.settings[art].stufen[this.stufe[art] + 1] ?? null;
  }

  verbrauch(art: UtilityKind): number {
    return this.verbraucht[art];
  }

  /** Kosten des bisherigen Verbrauchs (noch nicht bezahlt) */
  kosten(art: UtilityKind): number {
    return Math.round(this.verbraucht[art] * this.settings[art].preis * 100) / 100;
  }

  /** Verbrauch mitzählen: Bedarf (kW bzw. l/h) über so viele Spielminuten. */
  run(minutes: number, bedarf: Record<UtilityKind, number>): void {
    for (const art of UTILITY_KINDS) this.verbraucht[art] += (bedarf[art] * minutes) / 60;
  }

  /** Tagesende: Verbrauch bezahlen (auch ins Minus, Strom wird nicht abgestellt). */
  bill(): Record<UtilityKind, number> {
    const out = { strom: 0, wasser: 0 };
    for (const art of UTILITY_KINDS) {
      const k = this.kosten(art);
      if (k > 0) this.player.charge(k, art);
      out[art] = k;
      this.verbraucht[art] = 0;
    }
    return out;
  }

  upgrade(art: UtilityKind): UpgradeResult {
    const next = this.nextStage(art);
    if (!next) return { ok: false, grund: 'max' };
    if (next.freischaltLevel > this.player.level) return { ok: false, grund: 'gesperrt' };
    if (!this.player.spend(next.preis, 'anschluss')) return { ok: false, grund: 'geld' };
    this.stufe[art]++;
    this.events.emit('upgraded', { art, anschluss: next.anschluss });
    return { ok: true };
  }

  state(): { stufe: Record<UtilityKind, number>; verbraucht: Record<UtilityKind, number> } {
    return { stufe: { ...this.stufe }, verbraucht: { ...this.verbraucht } };
  }

  restore(s: { stufe?: Partial<Record<UtilityKind, number>>; verbraucht?: Partial<Record<UtilityKind, number>> }): void {
    for (const art of UTILITY_KINDS) {
      const max = this.settings[art].stufen.length - 1;
      this.stufe[art] = Math.min(max, Math.max(0, Math.round(s.stufe?.[art] ?? 0)));
      this.verbraucht[art] = Math.max(0, s.verbraucht?.[art] ?? 0);
    }
  }
}
