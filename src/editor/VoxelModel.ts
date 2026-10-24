import { VoxelGrid, MAX_PARTS, PART_SHIFT, partOf } from '../voxel/VoxelGrid';
import type { BuildCategory, BuildDef, BuildLayer, ShelfDef } from '../content/definitions';
import { asObject, num, str, optStr, bool } from '../content/validate';
import { readData } from '../core/Data';

// Modelle aus dem Voxel-Editor (data/modelle/*.json) – Inhalte des Spiels, gebaut mit dem Entwicklerwerkzeug.
//
// Format:
//   { "id", "name", "typ": "deko" | "regal" | "modell", "menue": Reiter im Baumenü, "preis", "ebene", "kantenlaenge",
//     "groesse": [Breite, Höhe, Tiefe] in Würfeln, "palette": ["#rrggbb", …],
//     "voxel": "Lauflängen-Code", "regal": { "kapazitaet", "kuehlung" }, "vorschau": "data:image/png;…",
//     "objekt": "fahrzeug", "teile": [{ "rolle": "rad", "zellen": "Lauflängen-Code" }, …] }
//
// "objekt" sagt, was das Modell ist (data/editor/objekttypen.json), "teile" sind die markierten Funktionsteile:
// Regalböden, Leuchten, Räder, bewegliche Klappen … – je Teil die Würfel, die dazugehören (1 = dazu, 0 = nicht).
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
  /** Objekttyp aus data/editor/objekttypen.json (ohne Angabe: wie "typ") */
  objekt?: string;
  /** Markierte Funktionsteile; das n-te Teil hat im Gitter die Nummer n + 1 */
  teile?: ModelPart[];
}

/** Kante eines beweglichen Teils, um die es sich dreht */
export type PartEdge = 'unten' | 'oben' | 'vorne' | 'hinten' | 'links' | 'rechts';
export const PART_EDGES: PartEdge[] = ['unten', 'oben', 'vorne', 'hinten', 'links', 'rechts'];

/** Funktionsteil: Rolle und Würfel (Lauflängen-Code wie "voxel", 1 = gehört dazu) */
export interface ModelPart {
  rolle: string;
  zellen: string;
  /** Nur bewegliche Teile: Drehachse, Kante mit dem Drehpunkt, Winkel in Grad */
  achse?: 'x' | 'y' | 'z';
  kante?: PartEdge;
  winkel?: number;
}

/** Teil ohne Würfel (so hält der Editor es; die Würfel tragen die Nummer selbst) */
export type PartInfo = Omit<ModelPart, 'zellen'>;

// ── Objekttypen und Rollen (data/editor/objekttypen.json) ──────────────

export type PartEffect = 'regalboden' | 'licht' | 'signal' | 'rad' | 'beweglich';

export interface ObjectRole {
  id: string;
  name: string;
  farbe: string;
  wirkung: PartEffect;
  hilfe: string;
}

export interface ObjectType {
  id: string;
  name: string;
  typ: ModelType;
  rollen: string[];
}

export interface ObjectCatalog {
  typen: ObjectType[];
  rollen: ObjectRole[];
}

const EFFECTS: PartEffect[] = ['regalboden', 'licht', 'signal', 'rad', 'beweglich'];
let catalog: ObjectCatalog | null = null;

/** Katalog der Objekttypen (einmal gelesen und geprüft) */
export function objectCatalog(): ObjectCatalog {
  if (catalog) return catalog;
  const where = 'editor/objekttypen.json';
  const o = asObject(readData<unknown>('editor/objekttypen'), where);
  const rollen = (Array.isArray(o.rollen) ? o.rollen : []).map((r, i) => {
    const w = `${where} → rollen[${i}]`, x = asObject(r, w);
    const wirkung = str(x, 'wirkung', w) as PartEffect;
    if (!EFFECTS.includes(wirkung)) throw new Error(`${w}: "wirkung" muss eines von ${EFFECTS.join(', ')} sein`);
    return { id: str(x, 'id', w), name: str(x, 'name', w), farbe: str(x, 'farbe', w), wirkung, hilfe: optStr(x, 'hilfe', w) ?? '' };
  });
  const typen = (Array.isArray(o.typen) ? o.typen : []).map((t, i) => {
    const w = `${where} → typen[${i}]`, x = asObject(t, w);
    const typ = str(x, 'typ', w) as ModelType;
    if (typ !== 'deko' && typ !== 'regal' && typ !== 'modell') throw new Error(`${w}: "typ" muss "deko", "regal" oder "modell" sein`);
    const r = Array.isArray(x.rollen) ? x.rollen.map(String) : [];
    for (const id of r) if (!rollen.some((k) => k.id === id)) throw new Error(`${w}: unbekannte Rolle "${id}"`);
    return { id: str(x, 'id', w), name: str(x, 'name', w), typ, rollen: r };
  });
  catalog = { typen, rollen };
  return catalog;
}

/** Objekttyp eines Modells (ältere Dateien ohne "objekt": nach "typ") */
export function objectTypeOf(m: Pick<VoxelModelData, 'objekt' | 'typ'>): ObjectType {
  const c = objectCatalog();
  return c.typen.find((t) => t.id === m.objekt) ?? c.typen.find((t) => t.id === m.typ) ?? { id: m.typ, name: m.typ, typ: m.typ, rollen: [] };
}

/** Wirkung jedes Teils (Index = Teilnummer − 1); unbekannte Rollen haben keine */
export function partEffects(teile: Pick<ModelPart, 'rolle'>[] | undefined): (PartEffect | undefined)[] {
  const rollen = objectCatalog().rollen;
  return (teile ?? []).map((t) => rollen.find((r) => r.id === t.rolle)?.wirkung);
}

/**
 * Oberkante eines markierten Bodens: die oberste Schicht, in der mindestens halb so viele Würfel liegen wie in der
 * stärksten – so zählen mitmarkierte Pfostenstücke nicht. −1, wenn das Teil leer ist.
 */
function boardTop(grid: VoxelGrid, part: number): number {
  const [nx, ny, nz] = grid.dims;
  const perY = new Array<number>(ny).fill(0);
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) if (partOf(grid.data[(x * ny + y) * nz + z]) === part) perY[y]++;
  const most = Math.max(...perY);
  if (!most) return -1;
  for (let y = ny - 1; y >= 0; y--) if (perY[y] >= most / 2) return y;
  return -1;
}

/** Würfel-Bereich eines Teils (in Feldkoordinaten); null, wenn kein Würfel dazugehört */
export function partBounds(grid: VoxelGrid, part: number): { lo: [number, number, number]; hi: [number, number, number] } | null {
  const [nx, ny, nz] = grid.dims;
  const lo: [number, number, number] = [Infinity, Infinity, Infinity], hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let found = false;
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
    if (partOf(grid.data[(x * ny + y) * nz + z]) !== part) continue;
    found = true;
    if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y; if (z < lo[2]) lo[2] = z;
    if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y; if (z > hi[2]) hi[2] = z;
  }
  return found ? { lo, hi } : null;
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

/** Gitter (Ecke bei 0, 0, 0) → Datei-Inhalt. `parts`: die Teile des Editors (Index = Nummer − 1, null = gelöscht). */
export function encodeGrid(grid: VoxelGrid, parts: (PartInfo | null)[] = []): { palette: string[]; voxel: string; teile?: ModelPart[] } {
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
  // Funktionsteile: nur benutzte, neu durchnummeriert
  const used = new Set<number>();
  for (const v of grid.data) if (v) used.add(partOf(v));
  const teile: ModelPart[] = [];
  for (let p = 1; p <= MAX_PARTS; p++) {
    const info = parts[p - 1];
    if (!info || !used.has(p)) continue;
    const mask: string[] = [];
    let bit = -1, n = 0;
    for (const v of grid.data) {
      const b = v && partOf(v) === p ? 1 : 0;
      if (b === bit) n++;
      else { if (n) mask.push(`${n}*${bit}`); bit = b; n = 1; }
    }
    if (n) mask.push(`${n}*${bit}`);
    teile.push({ ...info, zellen: mask.join(',') });
  }
  return teile.length ? { palette, voxel: runs.join(','), teile } : { palette, voxel: runs.join(',') };
}

/** Teile einer Datei für den Editor (ohne Würfel) */
export function partInfos(m: Pick<VoxelModelData, 'teile'>): PartInfo[] {
  return (m.teile ?? []).map(({ zellen: _z, ...info }) => info);
}

/** Datei-Inhalt → Gitter mit der Ecke bei (0, 0, 0) (zum Bearbeiten). */
export function decodeGrid(m: Pick<VoxelModelData, 'groesse' | 'kantenlaenge' | 'palette' | 'voxel' | 'teile'>): VoxelGrid {
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
  // Funktionsteile: Nummer in die Würfel schreiben
  (m.teile ?? []).slice(0, MAX_PARTS).forEach((t, k) => {
    let j = 0;
    for (const run of t.zellen ? t.zellen.split(',') : []) {
      const [n, b] = run.split('*').map(Number);
      if (b === 1) for (let q = j; q < Math.min(grid.data.length, j + n); q++) if (grid.data[q]) grid.data[q] = (grid.data[q] & 0x1ffffff) | ((k + 1) << PART_SHIFT);
      j += n;
    }
  });
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
    fahrbahn: false,
    schiene: false,
    anSchiene: false, ausgeblendet: false, obergeschoss: false,
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
      // Markierte Regalböden gehen vor der Erkennung
      ...shelfFromParts(m, grid),
    };
  }
  return def;
}

/**
 * Fächer aus markierten Regalböden: je Boden ein Fach auf seiner Oberkante; Tiefe und Länge der Ware
 * nach den Böden. null, wenn keine Böden markiert sind. `grid`: decodeGrid(m) (Ecke bei 0, 0, 0).
 */
export function shelfFromParts(m: VoxelModelData, grid = decodeGrid(m)): Pick<ShelfDef, 'ebenen' | 'faecher' | 'mitte' | 'laenge'> | null {
  const effects = partEffects(m.teile);
  const boards = effects.flatMap((e, i) => (e === 'regalboden' ? [partBounds(grid, i + 1)] : [])).filter((b) => b !== null);
  if (!boards.length) return null;
  const s = m.kantenlaenge, [nx, ny] = m.groesse;
  const ox = m.ursprung ? m.ursprung[0] : -Math.floor(nx / 2);
  const oy = m.ursprung ? m.ursprung[1] : m.ebene === 'decke' ? -ny : 0;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const parts = effects.flatMap((e, i) => (e === 'regalboden' ? [i + 1] : []));
  const ebenen = [...new Set(parts.map((p) => boardTop(grid, p)).filter((y) => y >= 0).map((y) => round((oy + y + 1) * s)))].sort((a, b) => a - b);
  const front = Math.max(...boards.map((b) => b.hi[0])) + 1;
  const z0 = Math.min(...boards.map((b) => b.lo[2])), z1 = Math.max(...boards.map((b) => b.hi[2])) + 1;
  return { ebenen, faecher: ebenen.length, mitte: round((ox + front) * s - 0.18), laenge: round((z1 - z0) * s * 0.9) };
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
    objekt: optStr(o, 'objekt', where),
    teile: o.teile === undefined ? undefined : validateParts(o.teile, `${where} → teile`),
  };
}

function validateParts(raw: unknown, where: string): ModelPart[] {
  if (!Array.isArray(raw) || raw.length > MAX_PARTS) throw new Error(`${where}: Liste mit höchstens ${MAX_PARTS} Teilen erwartet`);
  return raw.map((t, i) => {
    const w = `${where}[${i}]`, x = asObject(t, w);
    const part: ModelPart = { rolle: str(x, 'rolle', w), zellen: str(x, 'zellen', w) };
    if (x.achse !== undefined) {
      if (x.achse !== 'x' && x.achse !== 'y' && x.achse !== 'z') throw new Error(`${w}: "achse" muss "x", "y" oder "z" sein`);
      part.achse = x.achse;
    }
    if (x.kante !== undefined) {
      if (!PART_EDGES.includes(x.kante as PartEdge)) throw new Error(`${w}: "kante" muss eines von ${PART_EDGES.join(', ')} sein`);
      part.kante = x.kante as PartEdge;
    }
    if (x.winkel !== undefined) part.winkel = num(x, 'winkel', w, -360);
    return part;
  });
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
