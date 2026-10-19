import { readData, readFolderEntries } from '../core/Data';
import { Registry } from './Registry';
import type { FigureSettings } from '../voxel/figure';
import {
  validateBuild, validateCategory, validateProduct,
  type BuildDef, type BuildSettings, type CategoryDef, type ContextInfo, type ProductDef, type RoleDef,
  type StaffSettings, type StorageSettings, type ValueInfo, type WorkSettings, type CustomerSettings,
} from './definitions';

// Alle Spielinhalte an einem Ort. Wird einmal beim Start geladen und geprüft;
// fehlerhafte Daten stoppen den Start mit einer klaren Meldung.

export class Content {
  readonly kategorien: Registry<CategoryDef>;
  readonly produkte: Registry<ProductDef>;
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
    for (const p of this.produkte.all()) {
      if (!this.kategorien.has(p.kategorie)) throw new Error(`produkte/${p.id}.json: unbekannte Kategorie "${p.kategorie}"`);
    }
    for (const b of this.bau.all()) {
      if (b.kontext && !(b.kontext in this.kontexte)) throw new Error(`bau/${b.id}.json: unbekannter Kontext "${b.kontext}"`);
      for (const key of Object.keys(b.werte)) {
        if (!(key in this.werte)) throw new Error(`bau/${b.id}.json: Wert "${key}" fehlt in werte/standard.json`);
      }
    }
  }
}
