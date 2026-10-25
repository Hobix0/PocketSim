// Wochenrhythmus: wie viel an welchem Wochentag los ist und welche Tage Ruhetage sind (Laden zu,
// keine Lieferungen, kein Lohn). Werte: data/kunden/standard.json → "woche". Tag 1 ist ein Montag.

export interface WeekSettings {
  /** Kundenfaktor je Wochentag, Montag zuerst */
  faktor: number[];
  /** Ruhetage (0 = Montag … 6 = Sonntag) */
  ruhetage: number[];
}

const DAY = 24 * 60;

/** Wochentag zu einer Spielzeit (Minuten seit Tag 1, 00:00): 0 = Montag … 6 = Sonntag */
export function weekday(totalMinutes: number): number {
  return Math.floor(totalMinutes / DAY) % 7;
}

export function isRestDay(w: WeekSettings | undefined, totalMinutes: number): boolean {
  return !!w?.ruhetage.includes(weekday(totalMinutes));
}

export function dayFactor(w: WeekSettings | undefined, totalMinutes: number): number {
  return w?.faktor[weekday(totalMinutes)] ?? 1;
}

/** Beginn des nächsten Tages, der kein Ruhetag ist (ab dem Tag, in dem `totalMinutes` liegt) */
export function nextWorkday(w: WeekSettings | undefined, totalMinutes: number): number {
  let day = Math.floor(totalMinutes / DAY) * DAY;
  for (let i = 0; i < 7 && isRestDay(w, day); i++) day += DAY;
  return day;
}
