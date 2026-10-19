import type { BuildDef, BuildSettings } from '../content/definitions';
import type { World } from '../ecs/World';
import { FootprintComponent, containsPoint } from '../components/FootprintComponent';
import { snap } from './placement';

// Wo ein Bauteil unter dem Zeiger einrastet – ohne Grafik, damit es testbar ist.
//  - Böden: im Raster der vorhandenen Fliesen (2 m)
//  - Wände, Fenster, Türen: an der nächsten Fliesenkante; die Außenseite zeigt vom Boden weg
//  - Eckpfeiler (kleine Wandteile): an der nächsten Fliesenecke
//  - Anbauteile (Markise, Schild …): genau auf das Wandmodul darunter
//  - alles andere: freies Raster (z. B. 25 cm), Drehung mit R
// Konventionen der Modelle: Wände laufen entlang Z, Außenseite +X; Drehung −90° = Außenseite +Z.

export interface Snapped {
  x: number;
  z: number;
  /** Drehung in Grad */
  drehung: number;
  /** Wand ohne Boden daneben (zeigt das Bauen als Fehler an) */
  ohneBoden?: boolean;
}

const TILE = 2;

/** Mittelpunkt der nächsten Bodenfliese als Bezug für das Raster (oder der Ursprung). */
function floorRef(world: World, x: number, z: number, aussen = false): { x: number; z: number } {
  let best: { x: number; z: number } | null = null, bestD = Infinity;
  for (const [e, f] of world.query(FootprintComponent)) {
    if (f.ebene !== 'boden' || f.aussen !== aussen) continue;
    const p = e.object.position;
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) { bestD = d; best = { x: p.x, z: p.z }; }
  }
  return best ?? { x: 0, z: 0 };
}

/** Liegt hier Innenboden (Fliesen)? Außenflächen wie der Gehweg zählen nicht. */
export function floorAt(world: World, x: number, z: number): boolean {
  for (const [, f] of world.query(FootprintComponent)) if (f.ebene === 'boden' && !f.aussen && containsPoint(f.rect(), x, z)) return true;
  return false;
}

/** Einrasten für ein Bauteil; `quarter` = wie oft R gedrückt wurde. */
export function snapPlacement(world: World, def: BuildDef, x: number, z: number, quarter: number, settings: BuildSettings): Snapped {
  const versatz = settings.wandVersatz ?? 0.1;
  const [w, , d] = def.platzhalter.groesse;
  if (def.ebene === 'boden') {
    // Am nächsten Boden derselben Art ausrichten (Gehweg liegt anders als die Fliesen innen)
    const r = floorRef(world, x, z, def.aussen);
    return { x: r.x + Math.round((x - r.x) / w) * w, z: r.z + Math.round((z - r.z) / d) * d, drehung: (quarter % 4) * 90 };
  }
  if (def.ebene === 'wand') {
    const r = floorRef(world, x, z);
    const edge = (v: number, ref: number) => ref + TILE / 2 + Math.round((v - ref - TILE / 2) / TILE) * TILE;
    const center = (v: number, ref: number) => ref + Math.round((v - ref) / TILE) * TILE;
    const flip = quarter % 2 === 1;
    if (Math.max(w, d) <= 0.5) {
      // Eckpfeiler: an die Ecke, nach außen versetzt (weg von den Fliesen)
      const ex = edge(x, r.x), ez = edge(z, r.z);
      const q = (sx: number, sz: number) => floorAt(world, ex + sx * TILE / 2, ez + sz * TILE / 2) ? 1 : 0;
      const ox = (q(-1, -1) + q(-1, 1)) - (q(1, -1) + q(1, 1));
      const oz = (q(-1, -1) + q(1, -1)) - (q(-1, 1) + q(1, 1));
      return { x: ex + Math.sign(ox) * versatz, z: ez + Math.sign(oz) * versatz, drehung: 0 };
    }
    const ex = edge(x, r.x), ez = edge(z, r.z);
    if (Math.abs(x - ex) <= Math.abs(z - ez)) {
      // Kante bei x = ex, Wand läuft entlang Z
      const cz = center(z, r.z);
      const left = floorAt(world, ex - TILE / 2, cz), right = floorAt(world, ex + TILE / 2, cz);
      let out = left && !right ? 1 : right && !left ? -1 : 0;
      if (flip) out = out === 0 ? -1 : -out;
      const drehung = out < 0 ? 180 : 0;
      return { x: ex + out * versatz, z: cz, drehung, ohneBoden: !left && !right };
    }
    // Kante bei z = ez, Wand läuft entlang X
    const cx = center(x, r.x);
    const below = floorAt(world, cx, ez - TILE / 2), above = floorAt(world, cx, ez + TILE / 2);
    let out = below && !above ? 1 : above && !below ? -1 : 0;
    if (flip) out = out === 0 ? -1 : -out;
    const drehung = out < 0 ? 90 : -90;
    return { x: cx, z: ez + out * versatz, drehung, ohneBoden: !below && !above };
  }
  if (def.ebene === 'anbau') {
    // Auf das nächste Wandmodul (gleiche Lage und Drehung wie die Wand)
    let best: { x: number; z: number; drehung: number } | null = null, bestD = 1.5 ** 2;
    for (const [e, f] of world.query(FootprintComponent)) {
      if (f.ebene !== 'wand') continue;
      const p = e.object.position;
      const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < bestD) { bestD = dd; best = { x: p.x, z: p.z, drehung: Math.round((e.object.rotation.y * 180) / Math.PI) }; }
    }
    if (best) return best;
  }
  return { x: snap(x, settings.raster), z: snap(z, settings.raster), drehung: (quarter % 4) * 90 };
}
