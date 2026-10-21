import type { BuildDef, BuildLayer, BuildSettings } from '../content/definitions';
import type { Entity } from '../ecs/Entity';
import type { World } from '../ecs/World';
import { FootprintComponent, containsPoint, footprintRect, overlaps, type Rect } from '../components/FootprintComponent';

// Regeln fürs Platzieren beim Bauen – ohne Grafik, damit sie testbar sind.
//  - Objekte und Deckenleuchten brauchen Boden (Fliesen, Gehweg) unter sich.
//  - Objekte dürfen sich nicht mit anderen Objekten oder Wänden überschneiden,
//    Deckenleuchten nicht mit anderen Deckenleuchten.
//  - Schienenleuchten hängen nur unter einer Lichtschiene (und stören die Schiene dabei nicht).
//  - Kostet Geld (außer beim Verschieben) und muss freigeschaltet sein.

export type PlacementError = 'boden' | 'belegt' | 'geld' | 'gesperrt' | 'grundstueck' | 'strom' | 'gelaende' | 'schiene';

export interface PlacementResult {
  ok: boolean;
  grund?: PlacementError;
  /** Höhe, auf der das Objekt steht (Oberkante des Bodens bzw. Deckenhöhe) */
  y: number;
}

/** Welche Ebenen sich gegenseitig im Weg sind. Anbauteile stören nur gleiche Teile an derselben Stelle. */
const COLLIDES: Record<BuildLayer, BuildLayer[]> = {
  boden: ['boden'],
  wand: ['wand', 'objekt'],
  anbau: [],
  objekt: ['objekt', 'wand'],
  decke: ['decke'],
};

/** Wie weit sich zwei Rechtecke entlang ihrer längeren Überschneidung überlappen (0 = gar nicht) */
function wallOverlap(a: Rect, b: Rect): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const d = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  return w > 0 && d > 0 ? Math.max(w, d) : 0;
}

export interface PlacementOptions {
  /** Entity, die gerade verschoben wird (zählt nicht als Hindernis, kostet nichts) */
  moving?: Entity;
  geld: number;
  level: number;
  /** Darf hier gebaut werden (eigenes Grundstück)? Ohne Angabe überall. */
  plotOk?: (x: number, z: number, rand: number) => boolean;
  /** Ist das Gelände hier eben genug zum Bauen? (Hügel und Gruben aus dem Gelände-Werkzeug) */
  gelaendeOk?: (r: Rect) => boolean;
  /** Freier Stromanschluss (kW) für neue Verbraucher; ohne Angabe unbegrenzt */
  stromFrei?: number;
}

export function checkPlacement(
  world: World,
  def: BuildDef,
  x: number,
  z: number,
  rotationY: number,
  settings: BuildSettings,
  opts: PlacementOptions,
): PlacementResult {
  const rect = footprintRect({ x, z }, rotationY, def.platzhalter.groesse);

  // Höhe: oberste Bodenfläche unter dem Mittelpunkt
  let floor: number | null = null;
  for (const [e, f] of world.query(FootprintComponent)) {
    if (e === opts.moving || f.ebene !== 'boden') continue;
    if (containsPoint(f.rect(), x, z)) floor = Math.max(floor ?? 0, f.top());
  }
  const needsFloor = def.ebene === 'objekt' || def.ebene === 'decke';
  // Schienenleuchten hängen an der Unterkante ihrer Schiene (die Schiene selbst hängt an Abhängern unter der Decke)
  const rail = def.anSchiene ? railAt(world, x, z, opts.moving) : null;
  const railFoot = rail?.get(FootprintComponent);
  const y = rail && railFoot ? rail.object.position.y - railFoot.groesse[1]
    : def.ebene === 'decke' ? settings.deckenhoehe : def.ebene === 'objekt' ? floor ?? 0 : 0;

  if (!opts.moving && def.freischaltLevel > opts.level) return { ok: false, grund: 'gesperrt', y };
  if (opts.plotOk && !opts.plotOk(x, z, def.ebene === 'wand' || def.ebene === 'anbau' ? 0.4 : 0)) return { ok: false, grund: 'grundstueck', y };
  if (opts.gelaendeOk && !def.absenkung && def.ebene !== 'decke' && !opts.gelaendeOk(rect)) return { ok: false, grund: 'gelaende', y };
  if (needsFloor && floor === null) return { ok: false, grund: 'boden', y };
  if (def.anSchiene && !rail) return { ok: false, grund: 'schiene', y };
  // Wände brauchen Boden auf mindestens einer Seite
  if (def.ebene === 'wand' && !floorNear(world, rect, opts.moving)) return { ok: false, grund: 'boden', y };
  for (const [e, f] of world.query(FootprintComponent)) {
    if (e === opts.moving) continue;
    if (def.ebene === 'anbau') {
      // Dasselbe Teil zweimal an dieselbe Stelle geht nicht
      if (e.typeId === def.id && Math.hypot(e.object.position.x - x, e.object.position.z - z) < 0.05) return { ok: false, grund: 'belegt', y };
      continue;
    }
    if (!COLLIDES[def.ebene].includes(f.ebene)) continue;
    // Leuchte und Schiene gehören zusammen
    if ((def.anSchiene && f.schiene) || (def.schiene && f.anSchiene)) continue;
    const other = f.rect();
    if (!overlaps(rect, other)) continue;
    // Wandteile dürfen sich an Enden und Ecken überlappen (Eckpfeiler) – erst ab 35 cm entlang der Wand ist es „belegt“
    if (def.ebene === 'wand' && f.ebene === 'wand' && wallOverlap(rect, other) < 0.35) continue;
    return { ok: false, grund: 'belegt', y };
  }
  if (!opts.moving && opts.stromFrei !== undefined && (def.werte.strom ?? 0) > opts.stromFrei + 1e-9) return { ok: false, grund: 'strom', y };
  if (!opts.moving && def.preis > opts.geld) return { ok: false, grund: 'geld', y };
  return { ok: true, y };
}

/** Hängt an dieser Stelle eine Lichtschiene? */
export function railAt(world: World, x: number, z: number, moving?: Entity): Entity | null {
  for (const [e, f] of world.query(FootprintComponent)) {
    if (e === moving || !f.schiene) continue;
    const r = f.rect(), t = 0.06;
    if (x >= r.minX - t && x <= r.maxX + t && z >= r.minZ - t && z <= r.maxZ + t) return e;
  }
  return null;
}

/** Liegt Boden direkt neben (oder unter) diesem Rechteck? */
function floorNear(world: World, r: Rect, moving?: Entity): boolean {
  const grow = 0.3;
  for (const [e, f] of world.query(FootprintComponent)) {
    if (e === moving || f.ebene !== 'boden') continue;
    if (overlaps({ minX: r.minX - grow, maxX: r.maxX + grow, minZ: r.minZ - grow, maxZ: r.maxZ + grow }, f.rect(), 0)) return true;
  }
  return false;
}

/** Auf das Bauraster runden. */
export function snap(v: number, raster: number): number {
  return Math.round(v / raster) * raster;
}
