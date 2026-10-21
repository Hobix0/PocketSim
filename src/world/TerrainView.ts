import * as THREE from 'three';
import type { Terrain } from './Terrain';

// Darstellung des Geländes: Der Bodenteppich des Levels wird zu einem Gitter mit einem Eckpunkt je
// Höhenpunkt. An steilen Stellen (Hänge, Gruben) färbt er sich erdig. Neu gebaut wird nur, wenn sich
// das Gelände geändert hat.

export class TerrainView {
  private version = -1;
  private readonly gras: THREE.Color;
  private readonly erde: THREE.Color;

  constructor(private readonly ground: THREE.Mesh, private readonly terrain: Terrain, grasFarbe: string, erdFarbe: string) {
    const b = terrain.bounds;
    // Gitter mit einem Punkt je Höhenpunkt; liegt wie der alte Boden (rotiert um −90° um X)
    ground.geometry.dispose();
    ground.geometry = new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ, terrain.nx - 1, terrain.nz - 1);
    ground.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
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
    const t = this.terrain;
    const geo = this.ground.geometry as THREE.PlaneGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    // Zeile iy läuft von oben (kleinstes z in der Welt nach der Drehung) – Punkt k = iy · nx + ix
    for (let iy = 0; iy < t.nz; iy++) for (let ix = 0; ix < t.nx; ix++) pos.setZ(iy * t.nx + ix, t.vertexHeight(ix, iy));
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      // Lokales z ist nach der Drehung oben: flach = 1, steil → 0
      const steil = Math.min(1, Math.max(0, (1 - nrm.getZ(k)) * 6));
      c.copy(this.gras).lerp(this.erde, steil);
      colors.set([c.r, c.g, c.b], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
  }
}
