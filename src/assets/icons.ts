// Adressen der Vorschaubilder aus data/3d (Icons_Baubar, Icons_Produkte).
// Vite kopiert die Bilder beim Bauen mit; geladen werden sie erst, wenn sie im UI erscheinen.

const urls = import.meta.glob('/data/3d/Icons_*/*.png', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

/** Adresse zu einem Icon-Pfad aus den Daten, z. B. "3d/Icons_Produkte/T_Icon_Cola_0_5L.png". */
export function iconUrl(path: string | undefined): string | undefined {
  return path ? urls[`/data/${path}`] : undefined;
}
