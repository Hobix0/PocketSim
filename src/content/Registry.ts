import type { DataEntry } from '../core/Data';

// Nachschlagewerk für eine Art von Inhalten (Produkte, Bauelemente …).
// Wird aus allen Dateien eines Datenordners gebaut; jede Datei wird geprüft.
// Regeln: Die id muss eindeutig sein und dem Dateinamen entsprechen.

export class Registry<T extends { id: string }> {
  private readonly items = new Map<string, T>();

  constructor(
    readonly name: string,
    entries: DataEntry[],
    validate: (raw: unknown, where: string) => T,
  ) {
    for (const { file, data } of entries) {
      const where = `${name}/${file}.json`;
      const item = validate(data, where);
      if (item.id !== file) throw new Error(`${where}: id "${item.id}" passt nicht zum Dateinamen "${file}"`);
      this.items.set(item.id, item);
    }
  }

  /** Eintrag holen; Fehler, wenn es ihn nicht gibt. */
  get(id: string): T {
    const item = this.items.get(id);
    if (!item) throw new Error(`${this.name}: unbekannte id "${id}"`);
    return item;
  }

  find(id: string): T | undefined {
    return this.items.get(id);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  all(): T[] {
    return [...this.items.values()];
  }

  get size(): number {
    return this.items.size;
  }
}
