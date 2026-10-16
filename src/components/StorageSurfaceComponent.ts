import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Describable, InfoRow } from '../ui/describe';

// Ablagefläche für Kartons, z. B. eine Europalette.
// Aus Grundfläche, Höhe und Kartonmaß ergeben sich Plätze in einem Raster,
// die Ebene für Ebene von unten nach oben belegt werden.

export class StorageSurfaceComponent extends Component implements Describable {
  /** Platz-Mittelpunkte (Unterkante des Kartons) in lokalen Koordinaten der Entity. */
  readonly slots: THREE.Vector3[] = [];
  /** Platz-Nummer → id der Karton-Entity */
  private readonly occupied = new Map<number, number>();

  constructor(footprint: [number, number, number], ebenen: number, karton: [number, number, number]) {
    super();
    const [w, h, d] = footprint;
    const [kw, kh, kd] = karton;
    const nx = Math.max(1, Math.floor(w / kw));
    const nz = Math.max(1, Math.floor(d / kd));
    for (let level = 0; level < ebenen; level++) {
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          this.slots.push(new THREE.Vector3((ix - (nx - 1) / 2) * kw, h + level * kh, (iz - (nz - 1) / 2) * kd));
        }
      }
    }
  }

  get capacity(): number {
    return this.slots.length;
  }

  get free(): number {
    return this.slots.length - this.occupied.size;
  }

  /** Nächsten freien Platz für eine Entity belegen; gibt die Weltposition zurück (null, wenn voll). */
  occupy(entityId: number): THREE.Vector3 | null {
    const slot = this.slots.findIndex((_, i) => !this.occupied.has(i));
    if (slot < 0) return null;
    this.occupied.set(slot, entityId);
    this.entity.object.updateWorldMatrix(true, false);
    return this.entity.object.localToWorld(this.slots[slot].clone());
  }

  /** Platz einer Entity wieder freigeben. */
  release(entityId: number): void {
    for (const [slot, id] of this.occupied) if (id === entityId) this.occupied.delete(slot);
  }

  describe(): InfoRow[] {
    return [{ label: 'Kartonplätze belegt', value: `${this.occupied.size} / ${this.capacity}` }];
  }
}
