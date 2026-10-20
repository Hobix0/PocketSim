import { VoxelGrid, cellKey } from './VoxelGrid';

// Spielfigur aus Würfeln: Schuhe, Beine, Oberkörper, Arme, Kopf mit Augen und Frisur.
// Maße in Würfeln (bei 2,5 cm ist die Figur etwa 1,70 m groß). Blickrichtung +Z, Füße bei y = 0.
// Keine three.js-Abhängigkeit – das Gitter wird mit greedyMesh zur Geometrie.

export type Frisur = 'kurz' | 'lang' | 'keine';

export interface FigureLook {
  haut: string;
  haare: string;
  oberteil: string;
  hose: string;
  schuhe: string;
  frisur: Frisur;
}

/** Listen, aus denen ein Aussehen gewählt wird (data/figuren/standard.json). */
export interface FigureSettings {
  kantenlaenge: number;
  haut: string[];
  haare: string[];
  oberteile: string[];
  hosen: string[];
  schuhe: string[];
  frisuren: Frisur[];
}

/** Aussehen aus einer Zahl ableiten – dieselbe Zahl ergibt immer dieselbe Figur. */
export function lookFromSeed(s: FigureSettings, seed: number, oberteil?: string): FigureLook {
  let h = (seed * 2654435761) >>> 0;
  const pick = <T>(list: T[]): T => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return list[h % list.length];
  };
  return {
    haut: pick(s.haut),
    haare: pick(s.haare),
    oberteil: oberteil ?? pick(s.oberteile),
    hose: pick(s.hosen),
    schuhe: pick(s.schuhe),
    frisur: pick(s.frisuren),
  };
}

export function buildFigureGrid(look: FigureLook, size: number): VoxelGrid {
  const cells = new Map<number, number>();
  const hex = (c: string) => parseInt(c.replace('#', ''), 16);
  const shade = (rgb: number, f: number) =>
    (Math.round(((rgb >> 16) & 255) * f) << 16) | (Math.round(((rgb >> 8) & 255) * f) << 8) | Math.round((rgb & 255) * f);
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, rgb: number) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) cells.set(cellKey(x, y, z), rgb);
  };

  const haut = hex(look.haut), haare = hex(look.haare), oben = hex(look.oberteil), hose = hex(look.hose), schuhe = hex(look.schuhe);

  // Schuhe und Beine
  for (const [a, b] of [[-5, -1], [1, 5]]) {
    box(a, b, 0, 2, -2, 3, schuhe);
    box(a, b, 3, 28, -2, 2, hose);
  }
  // Oberkörper mit Gürtel und etwas dunklerem Saum
  box(-6, 6, 29, 52, -3, 3, oben);
  box(-6, 6, 29, 29, -3, 3, shade(hose, 0.7));
  box(-6, 6, 30, 31, -3, 3, shade(oben, 0.85));
  // Arme mit Händen
  for (const [a, b] of [[-9, -7], [7, 9]]) {
    box(a, b, 34, 52, -2, 2, oben);
    box(a, b, 30, 33, -2, 2, haut);
  }
  // Hals und Kopf
  box(-2, 2, 53, 54, -2, 2, haut);
  box(-5, 5, 55, 66, -5, 5, haut);
  // Augen und Mund auf der Vorderseite
  box(-3, -2, 60, 61, 5, 5, 0x2b2622);
  box(2, 3, 60, 61, 5, 5, 0x2b2622);
  box(-1, 1, 57, 57, 5, 5, shade(haut, 0.75));
  // Frisur
  if (look.frisur !== 'keine') {
    box(-5, 5, 66, 67, -5, 5, haare);       // oben
    box(-5, 5, 59, 66, -5, -5, haare);      // hinten
    box(-5, -5, 63, 66, -5, 2, haare);      // Seiten
    box(5, 5, 63, 66, -5, 2, haare);
    box(-5, 5, 65, 66, 5, 5, haare);        // Pony
    if (look.frisur === 'lang') {
      box(-5, 5, 50, 66, -6, -6, haare);
      box(-6, -6, 56, 66, -5, 1, haare);
      box(6, 6, 56, 66, -5, 1, haare);
    }
  }
  return VoxelGrid.fromCells(size, cells)!;
}
