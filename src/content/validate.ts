// Kleine Helfer, um JSON-Daten beim Laden zu prüfen.
// Fehlermeldungen nennen Datei und Feld, damit Tippfehler sofort auffallen.

export type Raw = Record<string, unknown>;

export function asObject(raw: unknown, where: string): Raw {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error(`${where}: Objekt erwartet`);
  return raw as Raw;
}

export function str(o: Raw, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`${where}: "${key}" muss ein Text sein`);
  return v;
}

export function optStr(o: Raw, key: string, where: string): string | undefined {
  return o[key] === undefined ? undefined : str(o, key, where);
}

export function num(o: Raw, key: string, where: string, min = -Infinity): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${where}: "${key}" muss eine Zahl sein`);
  if (v < min) throw new Error(`${where}: "${key}" muss mindestens ${min} sein`);
  return v;
}

export function bool(o: Raw, key: string, where: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`${where}: "${key}" muss true oder false sein`);
  return v;
}

export function vec3(o: Raw, key: string, where: string): [number, number, number] {
  const v = o[key];
  if (!Array.isArray(v) || v.length !== 3 || v.some((n) => typeof n !== 'number')) {
    throw new Error(`${where}: "${key}" muss eine Liste aus drei Zahlen sein`);
  }
  return [v[0], v[1], v[2]];
}

/** Liste aus Zahlen. */
export function numList(o: Raw, key: string, where: string): number[] {
  const v = o[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'number')) throw new Error(`${where}: "${key}" muss eine Liste aus Zahlen sein`);
  return v as number[];
}

/** Liste aus Texten; fehlt das Feld, ist die Liste leer. */
export function strList(o: Raw, key: string, where: string): string[] {
  const v = o[key] ?? [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new Error(`${where}: "${key}" muss eine Liste aus Texten sein`);
  return v as string[];
}

/** Objekt mit beliebigen Schlüsseln und Zahlenwerten, z. B. "werte": { "strom": 0.8 }. */
export function numberMap(o: Raw, key: string, where: string): Record<string, number> {
  const v = o[key] ?? {};
  const m = asObject(v, `${where} → ${key}`);
  for (const [k, n] of Object.entries(m)) {
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`${where}: "${key}.${k}" muss eine Zahl sein`);
  }
  return m as Record<string, number>;
}
