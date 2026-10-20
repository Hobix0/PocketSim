import * as THREE from 'three';
import type { Pointer } from '../input/Pointer';
import type { Bounds } from '../camera/ManagementCamera';

// Markiert das Rasterfeld unter dem Mauszeiger.
// Grundlage für späteres Bauen: Die Maus trifft eine Ebene auf Bodenhöhe,
// der Treffer wird auf das Raster gerundet.

export interface Cell {
  x: number; // Feldmitte in Metern
  z: number;
}

export class GridCursor {
  readonly mesh: THREE.Mesh;
  cell: Cell | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();

  constructor(private readonly cellSize: number, color: string, private readonly pointer: Pointer) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(cellSize * 0.94, cellSize * 0.94),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  /** Feld unter dem Zeiger bestimmen; null außerhalb der Grenzen. `hidden` blendet nur die Markierung aus. */
  update(camera: THREE.Camera, bounds: Bounds, hidden = false): void {
    this.cell = null;
    if (this.pointer.inside) {
      this.raycaster.setFromCamera(this.pointer.ndc, camera);
      if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) {
        const s = this.cellSize;
        const x = (Math.floor(this.hit.x / s) + 0.5) * s;
        const z = (Math.floor(this.hit.z / s) + 0.5) * s;
        if (x > bounds.minX && x < bounds.maxX && z > bounds.minZ && z < bounds.maxZ) this.cell = { x, z };
      }
    }
    this.mesh.visible = this.cell !== null && !hidden;
    if (this.cell) this.mesh.position.set(this.cell.x, 0.12, this.cell.z);
  }
}
