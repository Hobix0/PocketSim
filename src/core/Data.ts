// Zugriff auf alle JSON-Dateien unter /data.
// Vite sammelt die Dateien beim Bauen automatisch ein (import.meta.glob).
// Neue Dateien in einem Datenordner tauchen dadurch ohne Code-Änderung auf.

const files = import.meta.glob('/data/**/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/** Eine Datei aus einem Ordner: Dateiname ohne Endung und Inhalt. */
export interface DataEntry {
  file: string;
  data: unknown;
}

/** Gibt es diese Datei? z. B. hasData('level/musterschau') */
export function hasData(path: string): boolean {
  return `/data/${path}.json` in files;
}

/** Eine einzelne Datei lesen, z. B. readData('kamera/standard'). */
export function readData<T>(path: string): T {
  const key = `/data/${path}.json`;
  if (!(key in files)) throw new Error(`Daten-Datei fehlt: ${key}`);
  return structuredClone(files[key]) as T;
}

/** Alle Dateien eines Ordners mit Dateinamen, z. B. readFolderEntries('produkte'). */
export function readFolderEntries(folder: string): DataEntry[] {
  const prefix = `/data/${folder}/`;
  return Object.keys(files)
    .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
    .sort()
    .map((k) => ({ file: k.slice(prefix.length, -'.json'.length), data: structuredClone(files[k]) }));
}

/** Nur die Inhalte aller Dateien eines Ordners. */
export function readFolder<T>(folder: string): T[] {
  return readFolderEntries(folder).map((e) => e.data as T);
}
