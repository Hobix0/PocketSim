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
  /** Produkte, die Kunden zu teuer waren */
  zuTeuer: { produkt: ProductDef; anzahl: number }[];
  /** Meistverkaufte Produkte (Stück) */
  verkauft: { produkt: ProductDef; anzahl: number }[];
}

/** Bericht im Spielstand: Produkte nur als id */
type Counted = { produkt: string; anzahl: number }[];
export type SavedReport = Omit<DayReport, 'fehlt' | 'zuTeuer' | 'verkauft'> & { fehlt: Counted; zuTeuer: Counted; verkauft: Counted };

export interface StoreStatsState {
  ruf: number;
  heute: SavedReport;
  verlauf: SavedReport[];
}

/** So viele Tage merkt sich der Verlauf (für die Übersicht) */
const HISTORY_DAYS = 28;

export interface StoreEvents extends Record<string, unknown> {
  changed: { ruf: number };
  report: DayReport;
}

export class StoreStats {
  readonly events = new Emitter<StoreEvents>();
  private rufWert: number;
  private day!: DayReport;
  private missing = new Map<string, { produkt: ProductDef; anzahl: number }>();
  private expensive = new Map<string, { produkt: ProductDef; anzahl: number }>();
  private sold = new Map<string, { produkt: ProductDef; anzahl: number }>();
  /** Abgeschlossene Tage, ältester zuerst */
  readonly verlauf: DayReport[] = [];

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
  recordVisit(outcome: VisitOutcome, fehlend: ProductDef[], zuTeuer: ProductDef[] = []): void {
    const r = this.settings.ruf;
    this.day.kunden++;
    let delta = fehlend.length * r.jeFehlendemArtikel + zuTeuer.length * this.settings.preis.rufJeZuTeuer;
    for (const p of zuTeuer) count(this.expensive, p);
    if (outcome === 'zufrieden') { this.day.zufrieden++; delta += r.zufrieden; }
    else this.day.ohneEinkauf++;
    if (outcome === 'keine_kasse') delta += r.keineKasse;
    if (outcome === 'zu_lange') delta += r.zuLangeGewartet;
    for (const p of fehlend) count(this.missing, p);
    this.setRuf(this.rufWert + delta);
  }

  recordSale(betrag: number, artikel: number, lines: { produkt: ProductDef; menge: number }[] = []): void {
    this.day.umsatz = Math.round((this.day.umsatz + betrag) * 100) / 100;
    this.day.artikel += artikel;
    for (const l of lines) count(this.sold, l.produkt, l.menge);
  }

  /** Günstige Preise sprechen sich herum (kleiner Ruf-Bonus je Kunde). */
  recordBargain(anzahl: number): void {
    if (anzahl > 0) this.setRuf(this.rufWert + anzahl * this.settings.preis.rufJeSchnaeppchen);
  }

  /** Tag abschließen: Bericht senden und neu zählen. */
  closeDay(neuerTag: number): DayReport {
    const report: DayReport = {
      ...this.day,
      rufNachher: this.rufWert,
      fehlt: top(this.missing),
      zuTeuer: top(this.expensive),
      verkauft: top(this.sold),
    };
    this.verlauf.push(report);
    if (this.verlauf.length > HISTORY_DAYS) this.verlauf.shift();
    this.reset(neuerTag);
    this.events.emit('report', report);
    return report;
  }

  private reset(tag: number): void {
    this.day = { tag, kunden: 0, zufrieden: 0, ohneEinkauf: 0, umsatz: 0, artikel: 0, kosten: {}, rufVorher: this.rufWert, rufNachher: this.rufWert, fehlt: [], zuTeuer: [], verkauft: [] };
    this.missing = new Map();
    this.expensive = new Map();
    this.sold = new Map();
  }

  /** Stand für den Spielstand */
  state(): StoreStatsState {
    const heute: DayReport = { ...this.day, rufNachher: this.rufWert, fehlt: [...this.missing.values()], zuTeuer: [...this.expensive.values()], verkauft: [...this.sold.values()] };
    return { ruf: this.rufWert, heute: toSaved(heute), verlauf: this.verlauf.map(toSaved) };
  }

  /** Spielstand übernehmen; unbekannte Produkte (z. B. gelöschte Daten) fallen weg. */
  restore(s: StoreStatsState, produkt: (id: string) => ProductDef | undefined): void {
    const back = (list: Counted) => list.flatMap((c) => { const p = produkt(c.produkt); return p ? [{ produkt: p, anzahl: c.anzahl }] : []; });
    const fromSaved = (r: SavedReport): DayReport => ({ ...r, kosten: { ...r.kosten }, fehlt: back(r.fehlt), zuTeuer: back(r.zuTeuer ?? []), verkauft: back(r.verkauft ?? []) });
    this.rufWert = s.ruf;
    this.day = fromSaved(s.heute);
    this.missing = new Map(this.day.fehlt.map((c) => [c.produkt.id, { ...c }]));
    this.expensive = new Map(this.day.zuTeuer.map((c) => [c.produkt.id, { ...c }]));
    this.sold = new Map(this.day.verkauft.map((c) => [c.produkt.id, { ...c }]));
    this.day.fehlt = []; this.day.zuTeuer = []; this.day.verkauft = [];
    this.verlauf.splice(0, this.verlauf.length, ...s.verlauf.map(fromSaved));
    this.events.emit('changed', { ruf: this.rufWert });
  }

  private setRuf(v: number): void {
    const next = Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;
    if (next === this.rufWert) return;
    this.rufWert = next;
    this.events.emit('changed', { ruf: next });
  }
}

function count(map: Map<string, { produkt: ProductDef; anzahl: number }>, p: ProductDef, n = 1): void {
  const m = map.get(p.id) ?? { produkt: p, anzahl: 0 };
  m.anzahl += n;
  map.set(p.id, m);
}

function top(map: Map<string, { produkt: ProductDef; anzahl: number }>, n = 5): { produkt: ProductDef; anzahl: number }[] {
  return [...map.values()].sort((a, b) => b.anzahl - a.anzahl).slice(0, n).map((c) => ({ ...c }));
}

function toSaved(r: DayReport): SavedReport {
  const ids = (list: { produkt: ProductDef; anzahl: number }[]) => list.map((c) => ({ produkt: c.produkt.id, anzahl: c.anzahl }));
  return { ...r, kosten: { ...r.kosten }, fehlt: ids(r.fehlt), zuTeuer: ids(r.zuTeuer), verkauft: ids(r.verkauft) };
}

/** Summe eines Einkaufs (Verkaufspreise). */
export function basketTotal(lines: { produkt: ProductDef; menge: number; preis?: number }[]): number {
  return Math.round(lines.reduce((s, l) => s + (l.preis ?? l.produkt.vk) * l.menge, 0) * 100) / 100;
}
