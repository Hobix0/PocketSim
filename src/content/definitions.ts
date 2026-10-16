import { asObject, bool, num, numberMap, optStr, str, vec3 } from './validate';

// Datenformate der Inhalte und ihre Prüfung.
// Ein neues Feld kommt hier dazu – Logik, die das Feld nicht kennt, bleibt unberührt.

/** Warenkategorie, z. B. "Molkerei & Eier" (data/sortiment/kategorien.json). */
export interface CategoryDef {
  id: string;
  name: string;
}

/** Ein Produkt (data/produkte/*.json). EK = Großhandelspreis, VK = Regalpreis. */
export interface ProductDef {
  id: string;
  name: string;
  kategorie: string;
  ek: number;
  vk: number;
  frisch: boolean;
  freischaltLevel: number;
  model?: string;
  icon?: string;
}

/** Ersatzdarstellung, solange es noch kein Blender-Modell gibt. */
export interface PlaceholderDef {
  groesse: [number, number, number]; // Breite, Höhe, Tiefe in Metern
  farbe: string;
}

/** Ein Bauelement (data/bau/*.json). `werte` werden auf Raum-/Gebäudeebene summiert. */
export interface BuildDef {
  id: string;
  name: string;
  kategorie: string;
  /** Interaktions-Kontext (data/interaktion/kontexte.json). Ohne Kontext ist das Element nicht anklickbar. */
  kontext?: string;
  preis: number;
  freischaltLevel: number;
  werte: Record<string, number>;
  platzhalter: PlaceholderDef;
  model?: string;
  icon?: string;
}

/** Ein Interaktions-Kontext, z. B. "Regal" (data/interaktion/kontexte.json). */
export interface ContextInfo {
  name: string;
}

/** Anzeigename und Einheit eines Werts (data/werte/standard.json). */
export interface ValueInfo {
  name: string;
  einheit: string;
}

export function validateCategory(raw: unknown, where: string): CategoryDef {
  const o = asObject(raw, where);
  return { id: str(o, 'id', where), name: str(o, 'name', where) };
}

export function validateProduct(raw: unknown, where: string): ProductDef {
  const o = asObject(raw, where);
  return {
    id: str(o, 'id', where),
    name: str(o, 'name', where),
    kategorie: str(o, 'kategorie', where),
    ek: num(o, 'ek', where, 0),
    vk: num(o, 'vk', where, 0),
    frisch: bool(o, 'frisch', where),
    freischaltLevel: num(o, 'freischaltLevel', where, 1),
    model: optStr(o, 'model', where),
    icon: optStr(o, 'icon', where),
  };
}

export function validateBuild(raw: unknown, where: string): BuildDef {
  const o = asObject(raw, where);
  const ph = asObject(o.platzhalter, `${where} → platzhalter`);
  return {
    id: str(o, 'id', where),
    name: str(o, 'name', where),
    kategorie: str(o, 'kategorie', where),
    kontext: optStr(o, 'kontext', where),
    preis: num(o, 'preis', where, 0),
    freischaltLevel: num(o, 'freischaltLevel', where, 1),
    werte: numberMap(o, 'werte', where),
    platzhalter: { groesse: vec3(ph, 'groesse', `${where} → platzhalter`), farbe: str(ph, 'farbe', `${where} → platzhalter`) },
    model: optStr(o, 'model', where),
    icon: optStr(o, 'icon', where),
  };
}
