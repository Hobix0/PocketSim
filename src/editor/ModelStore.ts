import { readFolderEntries } from '../core/Data';
import type { Content } from '../content/Content';
import type { ModelLibrary } from '../assets/ModelLibrary';
import { CUSTOM_PREFIX, centeredGrid, decodeGrid, toBuildDef, validateVoxelModel, type VoxelModelData } from './VoxelModel';

// Wo eigene Modelle liegen:
//   1. data/modelle/*.json – gehören zum Projekt (im Entwicklungsmodus speichert der Editor dorthin)
//   2. im Browser (localStorage) – z. B. im Artifact, wo es keinen Server zum Speichern gibt
// Gleiche id im Browser ersetzt die Datei (zuletzt bearbeitet gewinnt).

const STORAGE_KEY = 'urbanevolution.modelle';

export function projectModels(): VoxelModelData[] {
  const out: VoxelModelData[] = [];
  for (const { file, data } of readFolderEntries('modelle')) {
    const where = `modelle/${file}.json`;
    try {
      const m = validateVoxelModel(data, where);
      if (m.id !== file) throw new Error(`${where}: id "${m.id}" passt nicht zum Dateinamen`);
      out.push(m);
    } catch (err) {
      // Ein kaputtes eigenes Modell soll das Spiel nicht stoppen
      console.warn(err);
    }
  }
  return out;
}

export function browserModels(): VoxelModelData[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown[];
    return raw.flatMap((r, i) => {
      try { return [validateVoxelModel(r, `Browser-Speicher #${i + 1}`)]; } catch (err) { console.warn(err); return []; }
    });
  } catch {
    return [];
  }
}

/** Alle eigenen Modelle (Projekt + Browser). */
export function allModels(): VoxelModelData[] {
  const map = new Map<string, VoxelModelData>();
  for (const m of projectModels()) map.set(m.id, m);
  for (const m of browserModels()) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function saveToBrowser(m: VoxelModelData): boolean {
  try {
    const list = browserModels().filter((x) => x.id !== m.id);
    list.push(m);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function deleteFromBrowser(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(browserModels().filter((x) => x.id !== id)));
  } catch {
    // nichts zu tun
  }
}

/** Im Entwicklungsmodus: als Datei data/modelle/<id>.json ins Projekt schreiben. */
export async function saveToProject(m: VoxelModelData): Promise<string | null> {
  if (!import.meta.env.DEV) return null;
  try {
    const res = await fetch('/__editor/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m) });
    const out = (await res.json()) as { ok: boolean; datei?: string };
    return out.ok ? out.datei ?? null : null;
  } catch {
    return null;
  }
}

export async function deleteFromProject(id: string): Promise<void> {
  if (!import.meta.env.DEV) return;
  try { await fetch('/__editor/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }); } catch { /* egal */ }
}

/** Eigene Modelle ins Spiel bringen: als Bauelement (Baumenü „Eigene“) und als Modell. */
export function registerCustomModels(content: Content, models?: ModelLibrary): number {
  let n = 0;
  for (const m of allModels()) {
    models?.registerVoxelModel(CUSTOM_PREFIX + m.id, centeredGrid(m));
    // Bauteile aus data/bau, die dieses Modell benutzen, bekommen sein Vorschaubild (wenn sie keins haben)
    for (const d of content.bau.all()) if (d.model === CUSTOM_PREFIX + m.id && !d.icon && m.vorschau) d.icon = m.vorschau;
    // Nur-Modelle und Modelle mit derselben id wie ein Bauteil aus den Spieldaten werden kein eigenes Bauteil
    if (m.typ === 'modell') continue;
    if (content.bau.has(m.id) && !content.bau.get(m.id).model?.startsWith(CUSTOM_PREFIX)) continue;
    content.bau.add(toBuildDef(m, decodeGrid(m)));
    n++;
  }
  return n;
}
