import { readData, readFolderEntries } from '../core/Data';
import { Registry } from './Registry';
import type { FigureSettings } from '../voxel/figure';
import {
  validateBuild, validateCategory, validateProduct,
  type BuildDef, type BuildSettings, type CategoryDef, type ContextInfo, type ProductDef, type RoleDef,
  type StaffSettings, type StorageSettings, type ValueInfo, type WorkSettings, type CustomerSettings,
  type RecipeDef, type UtilitySettings, validateRecipe, type LogisticsSettings,
} from './definitions';

/** Funktionen, die ein Bauteil haben kann (je eine Komponente, siehe createBuildEntity) */
export const FUNKTIONEN = ['einkauf', 'rampe'];

// Alle Spielinhalte an einem Ort. Wird einmal beim Start geladen und geprüft;
// fehlerhafte Daten stoppen den Start mit einer klaren Meldung.

export class Content {
  readonly kategorien: Registry<CategoryDef>;
  readonly produkte: Registry<ProductDef>;
  /** Rohstoffe für Maschinen (data/rohstoffe) – getrennt von Produkten und von der Versorgung */
  readonly rohstoffe: Registry<ProductDef>;
  /** Alles, was es im Großhandel und als Karton gibt: Produkte und Rohstoffe */
  readonly waren: Registry<ProductDef>;
  readonly rezepte: Registry<RecipeDef>;
  readonly versorgung: UtilitySettings;
  /** Lieferungen per LKW (data/logistik/standard.json) */
  readonly logistik: LogisticsSettings;
  readonly bau: Registry<BuildDef>;
  readonly werte: Record<string, ValueInfo>;
  readonly kontexte: Record<string, ContextInfo>;
  readonly lager: StorageSettings;
  readonly baumenue: BuildSettings;
  readonly rollen: Record<string, RoleDef>;
  readonly personal: StaffSettings;
  readonly namen: string[];
  readonly arbeit: WorkSettings;
  /** Aussehen der Voxel-Figuren (data/figuren/standard.json) */
  readonly figuren: FigureSettings;
  /** Kunden: Öffnungszeiten, Andrang, Ruf (data/kunden/standard.json) */
  readonly kunden: CustomerSettings;
  /** Anzeigetexte, z. B. "auswaehlen" → "Auswählen" (data/texte/standard.json). */
  readonly texte: Record<string, string>;

  constructor() {
    // Kategorien stehen als Liste in einer Datei; sie werden wie Ordner-Einträge behandelt
    const kat = readData<unknown[]>('sortiment/kategorien').map((data, i) => ({
      file: (data as { id?: string }).id ?? `#${i}`,
      data,
    }));
    this.kategorien = new Registry('sortiment/kategorien', kat, validateCategory);
    this.produkte = new Registry('produkte', readFolderEntries('produkte'), validateProduct);
    this.bau = new Registry('bau', readFolderEntries('bau'), validateBuild);
    this.rohstoffe = new Registry('rohstoffe', readFolderEntries('rohstoffe'), (raw, where) => ({ ...validateProduct(raw, where), rohstoff: true }));
    this.waren = new Registry('waren', [], validateProduct);
    for (const p of [...this.produkte.all(), ...this.rohstoffe.all()]) {
      if (this.waren.has(p.id)) throw new Error(`rohstoffe/${p.id}.json: id gibt es schon als Produkt`);
      this.waren.add(p);
    }
    this.rezepte = new Registry('rezepte', readFolderEntries('rezepte'), validateRecipe);
    this.versorgung = readData<UtilitySettings>('versorgung/standard');
    this.logistik = readData<LogisticsSettings>('logistik/standard');
    this.werte = readData<Record<string, ValueInfo>>('werte/standard');
    this.kontexte = readData<Record<string, ContextInfo>>('interaktion/kontexte');
    this.lager = readData<StorageSettings>('lager/standard');
    this.baumenue = readData<BuildSettings>('baumenue/standard');
    this.rollen = readData<Record<string, RoleDef>>('personal/rollen');
    this.personal = readData<StaffSettings>('personal/standard');
    this.namen = readData<string[]>('personal/namen');
    this.arbeit = readData<WorkSettings>('arbeit/standard');
    this.figuren = readData<FigureSettings>('figuren/standard');
    this.kunden = readData<CustomerSettings>('kunden/standard');
    this.texte = readData<Record<string, string>>('texte/standard');
    this.crossCheck();
  }

  /** Text zu einem Schlüssel; Platzhalter wie {level} werden ersetzt. Ohne Text: der Schlüssel selbst. */
  text(key: string, werte: Record<string, string | number> = {}): string {
    return (this.texte[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) => (name in werte ? String(werte[name]) : m));
  }

  /** Querverweise prüfen: Kategorien, Kontexte und Werte müssen bekannt sein. */
  private crossCheck(): void {
    for (const p of this.waren.all()) {
      if (!this.kategorien.has(p.kategorie)) throw new Error(`${p.rohstoff ? 'rohstoffe' : 'produkte'}/${p.id}.json: unbekannte Kategorie "${p.kategorie}"`);
    }
    const maschinen = new Set(this.bau.all().flatMap((b) => (b.maschine ? [b.maschine.typ] : [])));
    for (const r of this.rezepte.all()) {
      const where = `rezepte/${r.id}.json`;
      if (!maschinen.has(r.maschine)) throw new Error(`${where}: keine Maschine vom Typ "${r.maschine}" in data/bau`);
      for (const l of [...r.eingang, r.ausgang]) if (!this.waren.has(l.ware)) throw new Error(`${where}: unbekannte Ware "${l.ware}"`);
    }
    for (const b of this.bau.all()) {
      for (const f of b.funktionen) if (!FUNKTIONEN.includes(f)) throw new Error(`bau/${b.id}.json: unbekannte Funktion "${f}" (bekannt: ${FUNKTIONEN.join(', ')})`);
      if (b.kontext && !(b.kontext in this.kontexte)) throw new Error(`bau/${b.id}.json: unbekannter Kontext "${b.kontext}"`);
      for (const key of Object.keys(b.werte)) {
        if (!(key in this.werte)) throw new Error(`bau/${b.id}.json: Wert "${key}" fehlt in werte/standard.json`);
      }
    }
  }
}
