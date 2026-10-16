// Zahlen für die Anzeige formatieren (deutsch).

export function formatMoney(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
