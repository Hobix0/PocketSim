import * as THREE from 'three';
import type { VoxelGrid } from './VoxelGrid';

// Würfelgitter → Geometrie ("Greedy Meshing").
// Gezeichnet werden nur Flächen, an die kein anderer Würfel grenzt. Benachbarte Flächen
// gleicher Farbe und Richtung werden zu einem großen Rechteck zusammengefasst.
// Eine einfarbige Wand aus Zehntausenden Würfeln wird so zu wenigen Rechtecken.

export function greedyMesh(grid: VoxelGrid): THREE.BufferGeometry {
  const dims = grid.dims;
  const s = grid.size;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();

  const quad = (p: number[], du: number[], dv: number[], d: number, front: boolean, rgb: number) => {
    const base = positions.length / 3;
    const corners = [
      p,
      [p[0] + du[0], p[1] + du[1], p[2] + du[2]],
      [p[0] + du[0] + dv[0], p[1] + du[1] + dv[1], p[2] + du[2] + dv[2]],
      [p[0] + dv[0], p[1] + dv[1], p[2] + dv[2]],
    ];
    color.setHex(rgb & 0xffffff, THREE.SRGBColorSpace);
    for (const k of corners) {
      positions.push((grid.min[0] + k[0]) * s, (grid.min[1] + k[1]) * s, (grid.min[2] + k[2]) * s);
      normals.push(d === 0 ? (front ? 1 : -1) : 0, d === 1 ? (front ? 1 : -1) : 0, d === 2 ? (front ? 1 : -1) : 0);
      colors.push(color.r, color.g, color.b);
    }
    // Ecken laufen von außen gesehen gegen den Uhrzeigersinn (u × v zeigt nach +d)
    if (front) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const x = [0, 0, 0];
    const q = [0, 0, 0];
    q[d] = 1;
    const mask = new Int32Array(dims[u] * dims[v]);

    // Ebene zwischen Schicht x[d] und x[d] + 1
    for (x[d] = -1; x[d] < dims[d];) {
      let n = 0;
      for (x[v] = 0; x[v] < dims[v]; x[v]++) {
        for (x[u] = 0; x[u] < dims[u]; x[u]++) {
          const a = grid.get(x[0], x[1], x[2]);
          const b = grid.get(x[0] + q[0], x[1] + q[1], x[2] + q[2]);
          // positiv: Fläche von a nach +d; negativ: Fläche von b nach −d
          mask[n++] = (a !== 0) === (b !== 0) ? 0 : a !== 0 ? a : -b;
        }
      }
      x[d]++;

      n = 0;
      for (let j = 0; j < dims[v]; j++) {
        for (let i = 0; i < dims[u];) {
          const m = mask[n];
          if (m === 0) { i++; n++; continue; }
          let w = 1;
          while (i + w < dims[u] && mask[n + w] === m) w++;
          let h = 1;
          grow: for (; j + h < dims[v]; h++) {
            for (let k = 0; k < w; k++) if (mask[n + k + h * dims[u]] !== m) break grow;
          }
          const p = [0, 0, 0];
          p[d] = x[d]; p[u] = i; p[v] = j;
          const du = [0, 0, 0]; du[u] = w;
          const dv = [0, 0, 0]; dv[v] = h;
          quad(p, du, dv, d, m > 0, Math.abs(m));
          for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * dims[u]] = 0;
          i += w;
          n += w;
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
