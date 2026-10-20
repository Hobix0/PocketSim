import { VoxelGrid } from '../voxel/VoxelGrid';
import type { BuildCategory, BuildDef, BuildLayer } from '../content/definitions';
import { asObject, num, str, optStr, bool } from '../content/validate';

// Modelle aus dem Voxel-Editor (data/modelle/*.json) – Inhalte des Spiels, gebaut mit dem Entwicklerwerkzeug.
//
// Format:
//   { "id", "name", "typ": "deko" | "regal" | "modell", "menue": Reiter im Baumenü, "preis", "ebene", "kantenlaenge",
//     "groesse": [Breite, Höhe, Tiefe] in Würfeln, "palette": ["#rrggbb", …],
//     "voxel": "Lauflängen-Code", "regal": { "kapazitaet", "kuehlung" }, "vorschau": "data:image/png;…" }
//
// "voxel" listet alle Zellen (x außen, dann y, dann z innen) als "Anzahl*Farbe", getrennt durch Kommas;
// Farbe 0 = leer, sonst Nummer in der Palette (ab 1). So bleibt auch ein großes Modell klein.
// Vorne ist +X (dorthin zeigt bei Regalen die Ware), der Ursprung liegt unten in der Mitte.

/** deko/regal = eigenes Bauteil im Baumenü; modell = nur das Modell, ein Bauteil in data/bau verweist darauf */
export type ModelType = 'deko' | 'regal' | 'modell';

export interface VoxelModelData {
  id: string;
  name: string;
  typ: ModelType;
  /** Reiter im Baumenü (data/baumenue → kategorien[].id), z. B. "einrichtung" oder "deko" */
  menue: string;
  preis: number;
  ebene: BuildLayer;
  kantenlaenge: number;
  groesse: [number, number, number];
  palette: string[];
  voxel: string;
  regal?: { kapazitaet: number; kuehlung: boolean };
  vorschau?: string;
  /** Bearbeitetes Original: Pfad des Modells, das ersetzt wird (z. B. "3d/Baubar/…/SM_Build_Kasse.fbx") */
  ersetzt?: string;
  /** Lage der Würfel zum Ursprung (Ecke in Würfeln) – nur bei ersetzten Originalen, damit nichts verrutscht */
  ursprung?: [number, number, number];
}

/** Reiter, wenn in der Datei keiner steht */
export function defaultMenu(typ: ModelType): string {
  return typ === 'regal' ? 'einrichtung' : 'deko';
}

/** Asset-Kategorie und Bau-Ebene, die zu einem Reiter des Baumenüs passen */
export function placeInMenu(menue: string, kategorien: BuildCategory[], fallbackEbene: BuildLayer): { kategorie: string; ebene: BuildLayer } {
  const tab = kategorien.find((k) => k.id === menue && !k.spezial);
  return {
    kategorie: tab?.kategorien?.[0] ?? (tab ? 'gebaeude_basis' : 'deko'),
    ebene: tab?.ebenen?.length ? (tab.ebenen.includes(fallbackEbene) ? fallbackEbene : tab.ebenen[0]) : fallbackEbene,
  };
}
/** Pfad-Vorsilbe für eigene Modelle in der ModelLibrary */
export const CUSTOM_PREFIX = 'eigen/';

/** Gitter (Ecke bei 0, 0, 0) → Datei-Inhalt. */
export function encodeGrid(grid: VoxelGrid): { palette: string[]; voxel: string } {
  const palette: string[] = [];
  const index = new Map<number, number>();
  const runs: string[] = [];
  let last = -1, count = 0;
  const flush = () => { if (count) runs.push(`${count}*${last}`); };
  for (const v of grid.data) {
    let c = 0;
    if (v !== 0) {
      const rgb = v & 0xffffff;
      c = index.get(rgb) ?? 0;
      if (!c) {
        palette.push(`#${rgb.toString(16).padStart(6, '0')}`);
        c = palette.length;
        index.set(rgb, c);
      }
    }
    if (c === last) count++;
    else { flush(); last = c; count = 1; }
  }
  flush();
  return { palette, voxel: runs.join(',') };
}

/** Datei-Inhalt → Gitter mit der Ecke bei (0, 0, 0) (zum Bearbeiten). */
export function decodeGrid(m: Pick<VoxelModelData, 'groesse' | 'kantenlaenge' | 'palette' | 'voxel'>): VoxelGrid {
  const grid = new VoxelGrid(m.kantenlaenge, [0, 0, 0], [...m.groesse]);
  const colors = m.palette.map((c) => parseInt(c.replace('#', ''), 16));
  let i = 0;
  for (const run of m.voxel ? m.voxel.split(',') : []) {
    const [n, c] = run.split('*').map(Number);
    if (c > 0) {
      const rgb = colors[c - 1];
      grid.data.fill((rgb & 0xffffff) | (1 << 24), i, Math.min(grid.data.length, i + n));
    }
    i += n;
  }
  return grid;
}

/** Gitter so verschieben, dass der Ursprung unten in der Mitte liegt (wie bei allen Modellen im Spiel).
 *  Bearbeitete Originale behalten ihre Lage (`ursprung`). */
export function centeredGrid(m: VoxelModelData): VoxelGrid {
  const g = decodeGrid(m);
  if (m.ursprung) {
    const placed = new VoxelGrid(g.size, [...m.ursprung], [...g.dims]);
    placed.data.set(g.data);
    return placed;
  }
  // Deckenleuchten & Co. hängen vom Ursprung nach unten, alles andere steht darauf
  const y = m.ebene === 'decke' ? -g.dims[1] : 0;
  const out = new VoxelGrid(g.size, [-Math.floor(g.dims[0] / 2), y, -Math.floor(g.dims[2] / 2)], [...g.dims]);
  out.data.set(g.data);
  return out;
}

/**
 * Regalböden finden: Höhen, auf denen eine große Fläche frei nach oben liegt.
 * Je Boden entsteht ein Fach, auf dem die Ware im Spiel steht.
 */
export function detectShelfLevels(grid: VoxelGrid, minAnteil = 0.3, minLuft = 0.12): number[] {
  const [nx, ny, nz] = grid.dims;
  const flaeche = nx * nz;
  const luft = Math.max(1, Math.round(minLuft / grid.size));
  const levels: number[] = [];
  for (let y = 0; y < ny - 1; y++) {
    let frei = 0;
    for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) {
      if (!grid.get(x, y, z)) continue;
      // Oberseite mit genug Platz darüber
      let ok = true;
      for (let k = 1; k <= luft && ok; k++) if (y + k < ny && grid.get(x, y + k, z)) ok = false;
      if (ok) frei++;
    }
    if (frei / flaeche >= minAnteil) levels.push(Math.round((grid.min[1] + y + 1) * grid.size * 1000) / 1000);
  }
  return levels;
}

/** Modell → Bauelement im gewählten Reiter des Baumenüs. */
export function toBuildDef(m: VoxelModelData, kategorien: BuildCategory[], grid = decodeGrid(m)): BuildDef {
  const [nx, ny, nz] = m.groesse;
  const s = m.kantenlaenge;
  const place = placeInMenu(m.menue, kategorien, m.ebene);
  const def: BuildDef = {
    id: m.id,
    name: m.name,
    kategorie: place.kategorie,
    ebene: place.ebene,
    durchgang: false,
    aussen: false,
    funktionen: [],
    preis: m.preis,
    freischaltLevel: 1,
    werte: {},
    platzhalter: { groesse: [nx * s, ny * s, nz * s], farbe: '#b9c0c6' },
    model: CUSTOM_PREFIX + m.id,
    icon: m.vorschau,
  };
  if (m.typ === 'regal') {
    const ebenen = detectShelfLevels(grid);
    def.kontext = 'regal';
    def.regal = {
      ebenen: ebenen.length ? ebenen : [0.05],
      faecher: Math.max(1, ebenen.length),
      kapazitaet: m.regal?.kapazitaet ?? 20,
      kuehlung: m.regal?.kuehlung ?? false,
      // Erste Reihe Ware knapp hinter der Vorderkante (+X); ShelfComponent stellt sie bei mitte + 0,12 auf
      mitte: (nx * s) / 2 - 0.18,
      laenge: nz * s * 0.9,
    };
  }
  return def;
}

const LAYERS: BuildLayer[] = ['boden', 'wand', 'anbau', 'objekt', 'decke'];

/** Datei prüfen – mit Meldung, welche Datei und welches Feld falsch ist. */
export function validateVoxelModel(raw: unknown, where: string): VoxelModelData {
  const o = asObject(raw, where);
  const groesse = o.groesse;
  if (!Array.isArray(groesse) || groesse.length !== 3 || !groesse.every((v) => Number.isInteger(v) && v > 0 && v <= 256)) {
    throw new Error(`${where}: "groesse" muss drei ganze Zahlen von 1 bis 256 sein`);
  }
  const typ = str(o, 'typ', where);
  if (typ !== 'deko' && typ !== 'regal' && typ !== 'modell') throw new Error(`${where}: "typ" muss "deko", "regal" oder "modell" sein`);
  const ebene = str(o, 'ebene', where) as BuildLayer;
  if (!LAYERS.includes(ebene)) throw new Error(`${where}: "ebene" muss eines von ${LAYERS.join(', ')} sein`);
  const palette = o.palette;
  if (!Array.isArray(palette) || !palette.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))) {
    throw new Error(`${where}: "palette" muss eine Liste von Farben wie "#a1b2c3" sein`);
  }
  const regal = o.regal === undefined ? undefined : asObject(o.regal, `${where} → regal`);
  return {
    id: str(o, 'id', where),
    name: str(o, 'name', where),
    typ,
    menue: optStr(o, 'menue', where) ?? defaultMenu(typ),
    preis: num(o, 'preis', where, 0),
    ebene,
    kantenlaenge: num(o, 'kantenlaenge', where, 0.001),
    groesse: groesse as [number, number, number],
    palette: palette as string[],
    voxel: typeof o.voxel === 'string' ? o.voxel : '',
    regal: regal ? { kapazitaet: num(regal, 'kapazitaet', `${where} → regal`, 1), kuehlung: regal.kuehlung === undefined ? false : bool(regal, 'kuehlung', `${where} → regal`) } : undefined,
    vorschau: optStr(o, 'vorschau', where),
    ersetzt: optStr(o, 'ersetzt', where),
    ursprung: o.ursprung === undefined ? undefined : intVec3(o.ursprung, `${where} → ursprung`),
  };
}

/** Name → gültige id (Kleinbuchstaben, Ziffern, Unterstrich) mit Vorsilbe "modell_". */
export function idFromName(name: string): string {
  const base = name.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'neu';
  return `modell_${base}`.slice(0, 48);
}

function intVec3(v: unknown, where: string): [number, number, number] {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => Number.isInteger(x))) throw new Error(`${where}: drei ganze Zahlen erwartet`);
  return v as [number, number, number];
}

/** id für ein bearbeitetes Original, z. B. "original_kasse_schwarz" */
export function originalId(baseId: string): string {
  return `original_${baseId}`.replace(/[^a-z0-9_]/g, '_').slice(0, 48);
}
