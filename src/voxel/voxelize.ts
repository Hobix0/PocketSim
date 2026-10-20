import * as THREE from 'three';
import { VoxelGrid, cellKey } from './VoxelGrid';

// Dreiecke → Würfel. Jede Oberfläche wird dicht abgetastet (halbe Kantenlänge),
// jeder getroffene Würfel bekommt die Farbe an dieser Stelle (Palette, Etikett …).
// Das Ergebnis ist eine Hülle aus Würfeln – innen bleibt es leer, sichtbar ist nur die Hülle.

export interface VoxelSource {
  geometry: THREE.BufferGeometry;
  /** Lage des Meshes im Modell */
  matrix: THREE.Matrix4;
  /** Nur ein Teil der Dreiecke (Flächengruppe); ohne Angabe alle */
  start?: number;
  count?: number;
  /** Durchsichtig (kommt in ein eigenes Gitter mit Glas-Material) */
  glass: boolean;
  /** Farbe 0xRRGGBB an einer Stelle; uv = erster UV-Satz, uv1 = zweiter (oder null) */
  color(uv: THREE.Vector2 | null, uv1: THREE.Vector2 | null): number;
}

export interface VoxelResult {
  solid: VoxelGrid | null;
  glass: VoxelGrid | null;
}

export function voxelize(sources: VoxelSource[], size: number): VoxelResult {
  const solid = new Map<number, number>();
  const glass = new Map<number, number>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  const ua = new THREE.Vector2(), ub = new THREE.Vector2(), uc = new THREE.Vector2(), u = new THREE.Vector2();
  const la = new THREE.Vector2(), lb = new THREE.Vector2(), lc = new THREE.Vector2(), l = new THREE.Vector2();

  for (const src of sources) {
    const target = src.glass ? glass : solid;
    const geo = src.geometry;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
    const uv1 = geo.attributes.uv1 as THREE.BufferAttribute | undefined;
    const idx = geo.index;
    const total = idx ? idx.count : pos.count;
    const start = src.start ?? 0;
    const end = Math.min(total, start + (src.count ?? total));
    const vertex = (i: number) => (idx ? idx.getX(i) : i);

    for (let i = start; i + 2 < end; i += 3) {
      const i0 = vertex(i), i1 = vertex(i + 1), i2 = vertex(i + 2);
      a.fromBufferAttribute(pos, i0).applyMatrix4(src.matrix);
      b.fromBufferAttribute(pos, i1).applyMatrix4(src.matrix);
      c.fromBufferAttribute(pos, i2).applyMatrix4(src.matrix);
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
      if (n.lengthSq() === 0) continue;
      // Ein Hauch nach innen: Flächen genau auf einer Zellgrenze landen so in der Zelle des Modells
      n.normalize().multiplyScalar(-size * 0.01);
      if (uv) { ua.fromBufferAttribute(uv, i0); ub.fromBufferAttribute(uv, i1); uc.fromBufferAttribute(uv, i2); }
      if (uv1) { la.fromBufferAttribute(uv1, i0); lb.fromBufferAttribute(uv1, i1); lc.fromBufferAttribute(uv1, i2); }

      const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const steps = Math.max(1, Math.ceil(longest / (size * 0.5)));
      // Auch in der Fläche ein Hauch zur Mitte: Kanten genau auf einer Zellgrenze zählen nach innen
      const k = Math.min(0.5, (size * 0.02) / longest);
      for (let s = 0; s <= steps; s++) {
        for (let t = 0; t <= steps - s; t++) {
          const w1 = (s / steps) * (1 - k) + k / 3, w2 = (t / steps) * (1 - k) + k / 3, w0 = 1 - w1 - w2;
          const key = cellKey(
            Math.floor((a.x * w0 + b.x * w1 + c.x * w2 + n.x) / size),
            Math.floor((a.y * w0 + b.y * w1 + c.y * w2 + n.y) / size),
            Math.floor((a.z * w0 + b.z * w1 + c.z * w2 + n.z) / size),
          );
          if (target.has(key)) continue;
          if (uv) u.set(ua.x * w0 + ub.x * w1 + uc.x * w2, ua.y * w0 + ub.y * w1 + uc.y * w2);
          if (uv1) l.set(la.x * w0 + lb.x * w1 + lc.x * w2, la.y * w0 + lb.y * w1 + lc.y * w2);
          target.set(key, src.color(uv ? u : null, uv1 ? l : null));
        }
      }
    }
  }
  // Glas, das in einer festen Zelle steckt, sieht man ohnehin nicht
  for (const key of solid.keys()) glass.delete(key);
  return { solid: VoxelGrid.fromCells(size, solid), glass: VoxelGrid.fromCells(size, glass) };
}
