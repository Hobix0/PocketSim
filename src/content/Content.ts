import { readData, readFolderEntries } from '../core/Data';
import { Registry } from './Registry';
import {
  validateBuild, validateCategory, validateProduct,
  type BuildDef, type CategoryDef, type ProductDef, type ValueInfo,
} from './definitions';

// Alle Spielinhalte an einem Ort. Wird einmal beim Start geladen und geprüft;
// fehlerhafte Daten stoppen den Start mit einer klaren Meldung.

export class Content {
  readonly kategorien: Registry<CategoryDef>;
  readonly produkte: Registry<ProductDef>;
  readonly bau: Registry<BuildDef>;
  readonly werte: Record<string, ValueInfo>;

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
    this.crossCheck();
  }

  /** Querverweise prüfen: Jede Produktkategorie muss es geben, jeder Wert braucht einen Namen. */
  private crossCheck(): void {
    for (const p of this.produkte.all()) {
      if (!this.kategorien.has(p.kategorie)) throw new Error(`produkte/${p.id}.json: unbekannte Kategorie "${p.kategorie}"`);
    }
    for (const b of this.bau.all()) {
      for (const key of Object.keys(b.werte)) {
        if (!(key in this.werte)) throw new Error(`bau/${b.id}.json: Wert "${key}" fehlt in werte/standard.json`);
      }
    }
  }
}
