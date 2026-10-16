// Zugriff auf alle JSON-Dateien unter /data.
// Vite sammelt die Dateien beim Bauen automatisch ein (import.meta.glob).
// Neue Dateien in einem Datenordner tauchen dadurch ohne Code-Änderung auf.

const files = import.meta.glob('/data/**/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/** Eine einzelne Datei lesen, z. B. readData('kamera/standard'). */
export function readData<T>(path: string): T {
  const key = `/data/${path}.json`;
  if (!(key in files)) throw new Error(`Daten-Datei fehlt: ${key}`);
  return structuredClone(files[key]) as T;
}

/** Alle Dateien eines Ordners lesen, z. B. readFolder('produkte') – Grundlage für Kataloge. */
export function readFolder<T>(folder: string): T[] {
  const prefix = `/data/${folder}/`;
  return Object.keys(files)
    .filter((k) => k.startsWith(prefix))
    .sort()
    .map((k) => structuredClone(files[k]) as T);
}
