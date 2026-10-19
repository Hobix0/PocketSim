import type { CustomerSettings, ProductDef } from '../content/definitions';

// Kundenzustrom und Einkaufswünsche – ohne Grafik, damit es testbar bleibt.
//  - Während der Öffnungszeiten kommen Kunden; wie viele, hängt von der Uhrzeit und vom Ruf ab.
//  - Jeder Kunde hat 1–4 Wünsche: meist etwas aus dem aktuellen Sortiment, manchmal etwas,
//    das es (noch) nicht gibt. Was fehlt, zeigt der Tagesbericht.

/** "08:30" → Minuten seit Mitternacht */
export function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Andrang-Faktor aus dem Ruf (0–100). */
export function rufFaktor(s: CustomerSettings, ruf: number): number {
  const t = Math.min(1, Math.max(0, ruf / 100));
  return s.rufFaktor.min + (s.rufFaktor.max - s.rufFaktor.min) * t;
}

export class CustomerSpawner {
  private acc = 0;
  private readonly open: number;
  private readonly close: number;

  constructor(private readonly settings: CustomerSettings, private readonly random: () => number = Math.random) {
    this.open = parseTime(settings.oeffnung);
    this.close = parseTime(settings.schluss);
  }

  isOpen(minuteOfDay: number): boolean {
    return minuteOfDay >= this.open && minuteOfDay < this.close;
  }

  get oeffnung(): string {
    return this.settings.oeffnung;
  }

  /**
   * Wie viele Kunden jetzt neu kommen.
   * @param minutes vergangene Spielminuten seit dem letzten Aufruf
   * @param minuteOfDay aktuelle Uhrzeit in Minuten
   * @param imLaden wie viele Kunden schon da sind
   */
  spawns(minutes: number, minuteOfDay: number, ruf: number, imLaden: number): number {
    if (!this.isOpen(minuteOfDay)) { this.acc = 0; return 0; }
    const hour = Math.floor(minuteOfDay / 60) % 24;
    const proStunde = (this.settings.kundenProStunde[hour] ?? 0) * rufFaktor(this.settings, ruf);
    // Etwas Zufall, damit Kunden nicht im Takt kommen
    this.acc += (proStunde * minutes / 60) * (0.5 + this.random());
    let n = 0;
    while (this.acc >= 1 && imLaden + n < this.settings.maxImLaden) { this.acc -= 1; n++; }
    if (imLaden + n >= this.settings.maxImLaden) this.acc = Math.min(this.acc, 1);
    return n;
  }
}

export interface Wish {
  produkt: ProductDef;
  menge: number;
  /** offen → gefunden (genommen > 0) oder fehlt */
  status: 'offen' | 'gefunden' | 'fehlt';
  genommen: number;
}

/**
 * Einkaufsliste für einen Kunden.
 * @param sortiment Produkte, die gerade in Regalen stehen
 * @param alle Produkte, die es auf dem aktuellen Level geben könnte
 */
export function planWishes(s: CustomerSettings, sortiment: ProductDef[], alle: ProductDef[], random: () => number = Math.random): Wish[] {
  const between = (r: { min: number; max: number }) => r.min + Math.floor(random() * (r.max - r.min + 1));
  const count = between(s.wuensche);
  const wishes: Wish[] = [];
  for (let i = 0; i < count * 3 && wishes.length < count; i++) {
    const pool = sortiment.length && random() < s.wunschAusSortiment ? sortiment : alle;
    if (!pool.length) break;
    const produkt = pool[Math.floor(random() * pool.length)];
    if (wishes.some((w) => w.produkt.id === produkt.id)) continue;
    wishes.push({ produkt, menge: between(s.menge), status: 'offen', genommen: 0 });
  }
  return wishes;
}
