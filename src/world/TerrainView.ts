import * as THREE from 'three';
import type { Terrain } from './Terrain';

// Darstellung des Geländes im Voxel-Stil: Jede Zelle des Höhenrasters (0,5 m) ist eine Säule mit
// flacher Grasoberseite auf ihrer gerundeten Höhe (Terrain.cellHeight). Wo die Nachbarzelle tiefer
// liegt, entsteht eine senkrechte Erdwand – Schicht für Schicht leicht abgestuft, oben mit Graskante.
// Jede Zelle hat einen winzigen Farbunterschied, so wirkt der Boden wie aus Würfeln.
// Neu gebaut wird nur, wenn sich das Gelände geändert hat.

export class TerrainView {
  private version = -1;
  private readonly gras: THREE.Color;
  private readonly erde: THREE.Color;

  constructor(private readonly ground: THREE.Mesh, private readonly terrain: Terrain, grasFarbe: string, erdFarbe: string) {
    // Die Geometrie liegt direkt in Weltkoordinaten
    ground.rotation.set(0, 0, 0);
    ground.position.set(0, 0, 0);
    const mat = ground.material as THREE.MeshStandardMaterial;
    mat.vertexColors = true;
    mat.color.set('#ffffff');
    mat.needsUpdate = true;
    this.gras = new THREE.Color(grasFarbe);
    this.erde = new THREE.Color(erdFarbe);
    this.update();
  }

  update(): void {
    if (this.terrain.version === this.version) return;
    this.version = this.terrain.version;
    const t = this.terrain, s = t.zelle, b = t.bounds;
    const cx = t.nx - 1, cz = t.nz - 1;
    const h = new Float32Array(cx * cz);
    for (let i = 0; i < cx; i++) for (let j = 0; j < cz; j++) h[i * cz + j] = t.cellHeight(i, j);
    const at = (i: number, j: number) => (i < 0 || j < 0 || i >= cx || j >= cz ? 0 : h[i * cz + j]);

    const pos: number[] = [], nrm: number[] = [], col: number[] = [];
    const c = new THREE.Color();
    const quad = (p: number[][], n: number[], color: THREE.Color) => {
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...p[k]); nrm.push(...n); col.push(color.r, color.g, color.b); }
    };

    for (let i = 0; i < cx; i++) for (let j = 0; j < cz; j++) {
      const y = at(i, j);
      const x0 = b.minX + i * s, x1 = x0 + s, z0 = b.minZ + j * s, z1 = z0 + s;
      // Oberseite: Gras, je Zelle ein Hauch heller oder dunkler
      c.copy(this.gras).multiplyScalar(0.97 + hash(i, j) * 0.06);
      quad([[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], [0, 1, 0], c);
      // Seitenwände zu tieferen Nachbarn (−x, +x, −z, +z), in Stufen
      const sides: [number, number, number[][], number[]][] = [
        [i - 1, j, [[x0, 0, z0], [x0, 0, z1]], [-1, 0, 0]],
        [i + 1, j, [[x1, 0, z1], [x1, 0, z0]], [1, 0, 0]],
        [i, j - 1, [[x1, 0, z0], [x0, 0, z0]], [0, 0, -1]],
        [i, j + 1, [[x0, 0, z1], [x1, 0, z1]], [0, 0, 1]],
      ];
      for (const [ni, nj, [a, e], n] of sides) {
        const unten = at(ni, nj);
        if (unten >= y - 1e-4) continue;
        for (let top = y, layer = 0; top > unten + 1e-4; top -= t.stufe, layer++) {
          let oben = top;
          const bot = Math.max(unten, top - t.stufe);
          const wand = (y0: number, y1: number) => quad([[a[0], y0, a[2]], [a[0], y1, a[2]], [e[0], y1, e[2]], [e[0], y0, e[2]]], n, c);
          // Schmale Graskante oben, darunter Erde in leicht wechselnden Schichten
          if (layer === 0) { oben = Math.max(bot, top - 0.06); c.copy(this.gras).multiplyScalar(0.85); wand(top, oben); }
          c.copy(this.erde).multiplyScalar((layer % 2 ? 0.92 : 1.05) * (0.96 + hash(i + layer, j - layer) * 0.08));
          if (oben > bot) wand(oben, bot);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    this.ground.geometry.dispose();
    this.ground.geometry = geo;
  }
}

/** Fester Zufallswert 0..1 je Zelle */
function hash(i: number, j: number): number {
  const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
