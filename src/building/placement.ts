import type { BuildDef, BuildLayer, BuildSettings } from '../content/definitions';
import type { Entity } from '../ecs/Entity';
import type { World } from '../ecs/World';
import { FootprintComponent, containsPoint, footprintRect, overlaps } from '../components/FootprintComponent';

// Regeln fürs Platzieren beim Bauen – ohne Grafik, damit sie testbar sind.
//  - Objekte und Deckenleuchten brauchen Boden (Fliesen, Gehweg) unter sich.
//  - Objekte dürfen sich nicht mit anderen Objekten oder Wänden überschneiden,
//    Deckenleuchten nicht mit anderen Deckenleuchten.
//  - Kostet Geld (außer beim Verschieben) und muss freigeschaltet sein.

export type PlacementError = 'boden' | 'belegt' | 'geld' | 'gesperrt';

export interface PlacementResult {
  ok: boolean;
  grund?: PlacementError;
  /** Höhe, auf der das Objekt steht (Oberkante des Bodens bzw. Deckenhöhe) */
  y: number;
}

/** Welche Ebenen sich gegenseitig im Weg sind. */
const COLLIDES: Record<BuildLayer, BuildLayer[]> = {
  boden: ['boden'],
  wand: ['wand', 'objekt'],
  anbau: ['anbau'],
  objekt: ['objekt', 'wand'],
  decke: ['decke'],
};

export interface PlacementOptions {
  /** Entity, die gerade verschoben wird (zählt nicht als Hindernis, kostet nichts) */
  moving?: Entity;
  geld: number;
  level: number;
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
  const y = def.ebene === 'decke' ? settings.deckenhoehe : def.ebene === 'objekt' ? floor ?? 0 : 0;

  if (!opts.moving && def.freischaltLevel > opts.level) return { ok: false, grund: 'gesperrt', y };
  if (needsFloor && floor === null) return { ok: false, grund: 'boden', y };
  for (const [e, f] of world.query(FootprintComponent)) {
    if (e === opts.moving || !COLLIDES[def.ebene].includes(f.ebene)) continue;
    if (overlaps(rect, f.rect())) return { ok: false, grund: 'belegt', y };
  }
  if (!opts.moving && def.preis > opts.geld) return { ok: false, grund: 'geld', y };
  return { ok: true, y };
}

/** Auf das Bauraster runden. */
export function snap(v: number, raster: number): number {
  return Math.round(v / raster) * raster;
}
