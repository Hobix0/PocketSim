import { asObject, bool, num, numList, numberMap, optStr, str, strList, vec3, type Raw } from './validate';

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
  /** Stück pro Karton beim Einkauf. */
  gebinde: number;
  frisch: boolean;
  /** Muss gekühlt werden (nur in Regale mit Kühlung). */
  kuehlung: boolean;
  freischaltLevel: number;
  /** true, solange EK/VK nur Startwerte je Kategorie sind (siehe scripts/import-3d.config.json). */
  preisOffen: boolean;
  /** Pfad unter data/, z. B. "3d/Produkte/…/SM_Apfel_Rot.fbx". */
  model?: string;
  icon?: string;
  /** Maße in Metern: Breite, Höhe, Tiefe. */
  groesse?: [number, number, number];
}

/** Maße und Ersatzfarbe. Die Maße gelten auch, wenn es ein Modell gibt (Grundfläche fürs Bauen). */
export interface PlaceholderDef {
  groesse: [number, number, number]; // Breite, Höhe, Tiefe in Metern
  farbe: string;
}

/**
 * Bau-Ebene: bestimmt Höhe und Kollision beim Bauen.
 * boden = Fliesen/Gehweg, wand = Wände/Fenster/Türen, anbau = an Wänden (Markise …),
 * objekt = steht auf dem Boden, decke = hängt unter der Decke.
 */
export type BuildLayer = 'boden' | 'wand' | 'anbau' | 'objekt' | 'decke';
const LAYERS: BuildLayer[] = ['boden', 'wand', 'anbau', 'objekt', 'decke'];

/** Regal mit Fächern für Ware. Mit `ebenen` (Höhen der Böden) wird die Ware sichtbar einsortiert. */
export interface ShelfDef {
  /** Höhen der Regalböden in Metern; je Boden ein Fach. */
  ebenen?: number[];
  /** Anzahl Fächer, wenn keine Ebenen angegeben sind (Ware dann nicht sichtbar). */
  faecher: number;
  /** Stück pro Fach. */
  kapazitaet: number;
  /** Lage der Ware in der Tiefe (lokales X) und nutzbare Länge (lokales Z). */
  mitte: number;
  laenge: number;
  kuehlung: boolean;
}

/** Ein Bauelement (data/bau/*.json). `werte` werden auf Raum-/Gebäudeebene summiert. */
export interface BuildDef {
  id: string;
  name: string;
  kategorie: string;
  ebene: BuildLayer;
  regal?: ShelfDef;
  /** Interaktions-Kontext (data/interaktion/kontexte.json). Ohne Kontext ist das Element nicht anklickbar. */
  kontext?: string;
  /** Besondere Fähigkeiten, z. B. ["einkauf"]. Jede Funktion wird zu einer Komponente (siehe factory). */
  funktionen: string[];
  /** Ablagefläche für Kartons: gestapelt auf der Oberseite (`ebenen`) oder auf Regalböden (`boeden`, Höhen in m). */
  ablage?: { ebenen?: number; boeden?: number[] };
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

/** Einstellungen des Baumenüs (data/baumenue/standard.json). */
export interface BuildSettings {
  raster: number;
  deckenhoehe: number;
  rueckerstattung: number;
  kategorien: { id: string; name: string }[];
}

/** Eine Rolle für Angestellte (data/personal/rollen.json). */
export interface RoleDef {
  name: string;
  beschreibung: string;
  lohnProTag: number;
  farbe: string;
}

/** Einstellungen für Personal (data/personal/standard.json). */
export interface StaffSettings {
  bewerberAnzahl: number;
  tempo: { min: number; max: number };
  gehgeschwindigkeit: number;
  sekundenProStueck: number;
  startPunkt: [number, number, number];
}

/** Belohnungen für Arbeit (data/arbeit/standard.json). */
export interface WorkSettings {
  xpProKartonVonHand: number;
}

/** Einstellungen für Kartons (data/lager/standard.json). */
export interface StorageSettings {
  karton: { groesse: [number, number, number]; farbe: string };
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
    gebinde: num(o, 'gebinde', where, 1),
    frisch: bool(o, 'frisch', where),
    kuehlung: o.kuehlung === undefined ? false : bool(o, 'kuehlung', where),
    freischaltLevel: num(o, 'freischaltLevel', where, 1),
    preisOffen: o.preisOffen === undefined ? false : bool(o, 'preisOffen', where),
    model: optStr(o, 'model', where),
    icon: optStr(o, 'icon', where),
    groesse: o.groesse === undefined ? undefined : vec3(o, 'groesse', where),
  };
}

export function validateBuild(raw: unknown, where: string): BuildDef {
  const o = asObject(raw, where);
  const ph = asObject(o.platzhalter, `${where} → platzhalter`);
  return {
    id: str(o, 'id', where),
    name: str(o, 'name', where),
    kategorie: str(o, 'kategorie', where),
    ebene: layer(o, where),
    regal: o.regal === undefined ? undefined : shelf(o.regal, `${where} → regal`),
    kontext: optStr(o, 'kontext', where),
    funktionen: strList(o, 'funktionen', where),
    ablage: o.ablage === undefined ? undefined : storage(o.ablage, `${where} → ablage`),
    preis: num(o, 'preis', where, 0),
    freischaltLevel: num(o, 'freischaltLevel', where, 1),
    werte: numberMap(o, 'werte', where),
    platzhalter: { groesse: vec3(ph, 'groesse', `${where} → platzhalter`), farbe: str(ph, 'farbe', `${where} → platzhalter`) },
    model: optStr(o, 'model', where),
    icon: optStr(o, 'icon', where),
  };
}

function layer(o: Raw, where: string): BuildLayer {
  const v = str(o, 'ebene', where);
  if (!LAYERS.includes(v as BuildLayer)) throw new Error(`${where}: "ebene" muss eines von ${LAYERS.join(', ')} sein`);
  return v as BuildLayer;
}

function shelf(raw: unknown, where: string): ShelfDef {
  const o = asObject(raw, where);
  const ebenen = o.ebenen === undefined ? undefined : numList(o, 'ebenen', where);
  return {
    ebenen,
    faecher: ebenen ? ebenen.length : num(o, 'faecher', where, 1),
    kapazitaet: num(o, 'kapazitaet', where, 1),
    mitte: o.mitte === undefined ? 0 : num(o, 'mitte', where),
    laenge: o.laenge === undefined ? 1 : num(o, 'laenge', where, 0),
    kuehlung: o.kuehlung === undefined ? false : bool(o, 'kuehlung', where),
  };
}

function storage(raw: unknown, where: string): { ebenen?: number; boeden?: number[] } {
  const o = asObject(raw, where);
  if (o.boeden !== undefined) return { boeden: numList(o, 'boeden', where) };
  return { ebenen: num(o, 'ebenen', where, 1) };
}
