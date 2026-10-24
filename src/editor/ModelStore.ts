import { readFolderEntries } from '../core/Data';
import type { Content } from '../content/Content';
import type { ModelLibrary, VoxelPartBehavior } from '../assets/ModelLibrary';
import { provideThumbnail } from '../assets/thumbnail';
import { CUSTOM_PREFIX, centeredGrid, decodeGrid, partEffects, shelfFromParts, toBuildDef, validateVoxelModel, type VoxelModelData } from './VoxelModel';

// Modelle aus dem Voxel-Editor liegen im Projekt unter data/modelle/*.json – sie gehören zum Spiel
// wie die Bauteile in data/bau. Der Editor ist ein Entwicklerwerkzeug: Im Entwicklungsmodus speichert
// er direkt dorthin; sonst wird exportiert und die Datei von Hand nach data/modelle gelegt.
// Nur der Entwurf (die gerade offene Arbeit) wird zur Sicherheit im Browser gemerkt.

const DRAFT_KEY = 'urbanevolution.editor.entwurf';

export function projectModels(): VoxelModelData[] {
  const out: VoxelModelData[] = [];
  for (const { file, data } of readFolderEntries('modelle')) {
    const where = `modelle/${file}.json`;
    try {
      const m = validateVoxelModel(data, where);
      if (m.id !== file) throw new Error(`${where}: id "${m.id}" passt nicht zum Dateinamen`);
      out.push(m);
    } catch (err) {
      // Ein kaputtes Modell soll das Spiel nicht stoppen
      console.warn(err);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Entwurf im Browser merken (nur für den Editor, gegen versehentliches Schließen). */
export function saveDraft(m: VoxelModelData): void {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(m)); } catch { /* dann eben nicht */ }
}

export function loadDraft(): VoxelModelData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? validateVoxelModel(JSON.parse(raw), 'Entwurf') : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* nichts zu tun */ }
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

export async function deleteFromProject(id: string): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  try {
    const res = await fetch('/__editor/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    return ((await res.json()) as { ok: boolean }).ok;
  } catch {
    return false;
  }
}

/** Modelle ins Spiel bringen: als Bauteil im gewählten Reiter des Baumenüs und als Modell. */
export function registerCustomModels(content: Content, models?: ModelLibrary): number {
  let n = 0;
  for (const m of projectModels()) {
    const grid = centeredGrid(m);
    // Bearbeitetes Original: ersetzt das Modell überall, wo es benutzt wird (nur im Voxel-Stil)
    if (m.ersetzt) {
      if (models && !models.voxelStyle) continue;
      models?.registerVoxelModel(m.ersetzt, grid, partBehaviors(m));
      provideThumbnail(m.ersetzt, grid);
      for (const d of [...content.bau.all(), ...content.waren.all()]) if (d.model === m.ersetzt) d.icon = m.vorschau ?? d.icon;
      continue;
    }
    models?.registerVoxelModel(CUSTOM_PREFIX + m.id, grid, partBehaviors(m));
    // Markierte Regalböden gelten auch für Bauteile aus data/bau, die dieses Modell benutzen
    const boeden = m.teile ? shelfFromParts(m) : null;
    if (boeden) for (const d of content.bau.all()) if (d.model === CUSTOM_PREFIX + m.id && d.regal) Object.assign(d.regal, boeden);
    // Ohne gespeichertes Vorschaubild rendert das Baumenü eins aus dem Modell
    if (!m.vorschau) provideThumbnail(CUSTOM_PREFIX + m.id, grid);
    // Bauteile aus data/bau, die dieses Modell benutzen, bekommen sein Vorschaubild (wenn sie keins haben)
    for (const d of content.bau.all()) if (d.model === CUSTOM_PREFIX + m.id && !d.icon && m.vorschau) d.icon = m.vorschau;
    // Nur-Modelle und Modelle mit derselben id wie ein Bauteil aus den Spieldaten werden kein eigenes Bauteil
    if (m.typ === 'modell') continue;
    if (content.bau.has(m.id) && !content.bau.get(m.id).model?.startsWith(CUSTOM_PREFIX)) continue;
    // Benutzt schon ein Bauteil aus data/bau dieses Modell (z. B. das Holzregal), bleibt es dabei –
    // markierte Regalböden & Co. gelten dann dort (siehe oben)
    if (content.bau.all().some((d) => d.model === CUSTOM_PREFIX + m.id)) continue;
    content.bau.add(toBuildDef(m, content.baumenue.kategorien, decodeGrid(m)));
    n++;
  }
  return n;
}

/** Wirkung, Achse und Winkel je Funktionsteil (für die Modell-Bibliothek) */
function partBehaviors(m: VoxelModelData): VoxelPartBehavior[] {
  const effects = partEffects(m.teile);
  return (m.teile ?? []).map((t, i) => ({ wirkung: effects[i], achse: t.achse, kante: t.kante, winkel: t.winkel }));
}
