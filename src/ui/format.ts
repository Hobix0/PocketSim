// Zahlen für die Anzeige formatieren (deutsch).

export function formatMoney(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

/** Spielminuten seit Spielbeginn → "14:00", "morgen 06:00" oder "Tag 5, 06:00" (gemessen an `jetzt`) */
export function formatClock(total: number, jetzt: number): string {
  const day = (m: number) => Math.floor(m / (24 * 60));
  const m = Math.round(total) % (24 * 60);
  const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const diff = day(total) - day(jetzt);
  return diff <= 0 ? hhmm : diff === 1 ? `morgen ${hhmm}` : `Tag ${day(total) + 1}, ${hhmm}`;
}
