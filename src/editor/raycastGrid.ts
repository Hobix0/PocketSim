// Strahl durch ein Würfelgitter verfolgen (Schritt für Schritt von Zelle zu Zelle).
// Liefert den ersten getroffenen Würfel und die Seite, auf die der Strahl trifft –
// oder den Boden (y = 0) innerhalb des Gitters, wenn kein Würfel im Weg ist.
// Koordinaten in Zellen; keine three.js-Abhängigkeit.

export interface GridHit {
  /** Getroffene Zelle (bei Bodentreffer: y = -1, also unter der untersten Schicht) */
  cell: [number, number, number];
  /** Seite, auf die der Strahl trifft (zeigt aus der Zelle heraus) */
  normal: [number, number, number];
  /** Boden statt Würfel */
  ground: boolean;
}

export function raycastGrid(
  dims: [number, number, number],
  filled: (x: number, y: number, z: number) => boolean,
  origin: [number, number, number],
  dir: [number, number, number],
  maxDist = 1000,
): GridHit | null {
  // Eintritt in die Box des Gitters
  let tMin = 0, tMax = maxDist;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-12) {
      if (origin[i] < 0 || origin[i] > dims[i]) return groundHit(dims, origin, dir);
      continue;
    }
    let t0 = (0 - origin[i]) / dir[i], t1 = (dims[i] - origin[i]) / dir[i];
    if (t0 > t1) [t0, t1] = [t1, t0];
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
  }
  if (tMin > tMax) return groundHit(dims, origin, dir);

  const p = [0, 1, 2].map((i) => origin[i] + dir[i] * (tMin + 1e-6));
  const cell = p.map((v, i) => Math.min(dims[i] - 1, Math.max(0, Math.floor(v)))) as [number, number, number];
  const step = dir.map((d) => (d > 0 ? 1 : -1));
  const tDelta = dir.map((d) => (Math.abs(d) < 1e-12 ? Infinity : Math.abs(1 / d)));
  const tNext = [0, 1, 2].map((i) => {
    if (Math.abs(dir[i]) < 1e-12) return Infinity;
    const boundary = dir[i] > 0 ? cell[i] + 1 : cell[i];
    return tMin + (boundary - p[i]) / dir[i];
  });
  // Seite beim Eintritt: die Achse, über die der Strahl zuletzt in die Box kam
  let normal: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-12) continue;
    const t = ((dir[i] > 0 ? 0 : dims[i]) - origin[i]) / dir[i];
    if (Math.abs(t - tMin) < 1e-6) normal = [0, 0, 0].map((_, k) => (k === i ? -step[i] : 0)) as [number, number, number];
  }

  for (let guard = 0; guard < dims[0] + dims[1] + dims[2] + 3; guard++) {
    if (filled(cell[0], cell[1], cell[2])) return { cell: [...cell], normal, ground: false };
    // Nächste Zellgrenze
    let axis = 0;
    if (tNext[1] < tNext[axis]) axis = 1;
    if (tNext[2] < tNext[axis]) axis = 2;
    if (tNext[axis] > tMax) break;
    cell[axis] += step[axis];
    if (cell[axis] < 0 || cell[axis] >= dims[axis]) break;
    tNext[axis] += tDelta[axis];
    normal = [0, 0, 0].map((_, k) => (k === axis ? -step[axis] : 0)) as [number, number, number];
  }
  return groundHit(dims, origin, dir);
}

/** Boden y = 0 innerhalb der Grundfläche treffen (Platz für die unterste Schicht). */
function groundHit(dims: [number, number, number], origin: [number, number, number], dir: [number, number, number]): GridHit | null {
  if (dir[1] >= 0 || origin[1] <= 0) return null;
  const t = -origin[1] / dir[1];
  const x = Math.floor(origin[0] + dir[0] * t), z = Math.floor(origin[2] + dir[2] * t);
  if (x < 0 || z < 0 || x >= dims[0] || z >= dims[2]) return null;
  return { cell: [x, -1, z], normal: [0, 1, 0], ground: true };
}
