import { Emitter } from '../core/Emitter';
import type { CustomerSettings, ProductDef } from '../content/definitions';
import type { PlayerState } from '../state/PlayerState';

// Kennzahlen des Ladens: Ruf (0–100) und die Zahlen des laufenden Tages.
// Am Tagesende entsteht daraus der Tagesbericht. Keine three.js-Abhängigkeit.

/** Wie ein Kundenbesuch ausging. */
export type VisitOutcome = 'zufrieden' | 'ohne_einkauf' | 'keine_kasse' | 'zu_lange';

export interface DayReport {
  tag: number;
  kunden: number;
  zufrieden: number;
  ohneEinkauf: number;
  umsatz: number;
  artikel: number;
  /** Ausgaben nach Grund (einkauf, lohn, bau …) */
  kosten: Record<string, number>;
  rufVorher: number;
  rufNachher: number;
  /** Am häufigsten vermisste Produkte */
  fehlt: { produkt: ProductDef; anzahl: number }[];
}

export interface StoreEvents extends Record<string, unknown> {
  changed: { ruf: number };
  report: DayReport;
}

export class StoreStats {
  readonly events = new Emitter<StoreEvents>();
  private rufWert: number;
  private day!: DayReport;
  private missing = new Map<string, { produkt: ProductDef; anzahl: number }>();

  constructor(private readonly settings: CustomerSettings, player: PlayerState, tag = 1) {
    this.rufWert = settings.ruf.start;
    this.reset(tag);
    // Ausgaben mitschreiben, egal wo sie entstehen (Einkauf, Löhne, Bauen)
    player.events.on('transaction', ({ betrag, grund }) => {
      if (betrag < 0) this.day.kosten[grund] = (this.day.kosten[grund] ?? 0) - betrag;
    });
  }

  get ruf(): number {
    return this.rufWert;
  }

  get heute(): Readonly<DayReport> {
    return this.day;
  }

  /** Ein Kunde ist gegangen. */
  recordVisit(outcome: VisitOutcome, fehlend: ProductDef[]): void {
    const r = this.settings.ruf;
    this.day.kunden++;
    let delta = fehlend.length * r.jeFehlendemArtikel;
    if (outcome === 'zufrieden') { this.day.zufrieden++; delta += r.zufrieden; }
    else this.day.ohneEinkauf++;
    if (outcome === 'keine_kasse') delta += r.keineKasse;
    if (outcome === 'zu_lange') delta += r.zuLangeGewartet;
    for (const p of fehlend) {
      const m = this.missing.get(p.id) ?? { produkt: p, anzahl: 0 };
      m.anzahl++;
      this.missing.set(p.id, m);
    }
    this.setRuf(this.rufWert + delta);
  }

  recordSale(betrag: number, artikel: number): void {
    this.day.umsatz = Math.round((this.day.umsatz + betrag) * 100) / 100;
    this.day.artikel += artikel;
  }

  /** Tag abschließen: Bericht senden und neu zählen. */
  closeDay(neuerTag: number): DayReport {
    const report: DayReport = {
      ...this.day,
      rufNachher: this.rufWert,
      fehlt: [...this.missing.values()].sort((a, b) => b.anzahl - a.anzahl).slice(0, 5),
    };
    this.reset(neuerTag);
    this.events.emit('report', report);
    return report;
  }

  private reset(tag: number): void {
    this.day = { tag, kunden: 0, zufrieden: 0, ohneEinkauf: 0, umsatz: 0, artikel: 0, kosten: {}, rufVorher: this.rufWert, rufNachher: this.rufWert, fehlt: [] };
    this.missing = new Map();
  }

  private setRuf(v: number): void {
    const next = Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;
    if (next === this.rufWert) return;
    this.rufWert = next;
    this.events.emit('changed', { ruf: next });
  }
}

/** Summe eines Einkaufs (Verkaufspreise). */
export function basketTotal(lines: { produkt: ProductDef; menge: number }[]): number {
  return Math.round(lines.reduce((s, l) => s + l.produkt.vk * l.menge, 0) * 100) / 100;
}
