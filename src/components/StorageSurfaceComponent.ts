import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Describable, InfoRow } from '../ui/describe';

// Ablagefläche für Kartons, z. B. eine Europalette oder ein Schwerlastregal.
// Aus Grundfläche und Kartonmaß ergibt sich ein Raster je Ebene. Die Ebenen sind
// entweder gestapelt auf der Oberseite (Palette) oder die Regalböden (Schwerlastregal).
// Belegt wird von unten nach oben.
// `temporaer`: nur zum Abholen, z. B. die Ladefläche eines LKW – zählt nicht als Lagerplatz.

export class StorageSurfaceComponent extends Component implements Describable {
  /** Platz-Mittelpunkte (Unterkante des Kartons) in lokalen Koordinaten der Entity. */
  readonly slots: THREE.Vector3[] = [];
  /** Platz-Nummer → id der Karton-Entity */
  private readonly occupied = new Map<number, number>();

  readonly temporaer: boolean;

  constructor(
    footprint: [number, number, number],
    ablage: { ebenen?: number; boeden?: number[] },
    karton: [number, number, number],
    options: { temporaer?: boolean; versatz?: [number, number, number]; vonHinten?: boolean } = {},
  ) {
    super();
    this.temporaer = options.temporaer ?? false;
    const [ox, oy, oz] = options.versatz ?? [0, 0, 0];
    const [w, h, d] = footprint;
    const [kw, kh, kd] = karton;
    const nx = Math.max(1, Math.floor(w / kw));
    const nz = Math.max(1, Math.floor(d / kd));
    const heights = ablage.boeden ?? Array.from({ length: ablage.ebenen ?? 1 }, (_, i) => h + i * kh);
    for (const y of heights) {
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          this.slots.push(new THREE.Vector3(ox + (ix - (nx - 1) / 2) * kw, oy + y, oz + (iz - (nz - 1) / 2) * kd));
        }
      }
    }
    // Ladeflächen: von hinten (lokal −X) nach vorne belegen, je Reihe erst unten
    if (options.vonHinten) this.slots.sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
  }

  /** Belegte Plätze */
  get used(): number {
    return this.occupied.size;
  }

  get capacity(): number {
    return this.slots.length;
  }

  get free(): number {
    return this.slots.length - this.occupied.size;
  }

  /** Weltposition eines Platzes */
  slotPosition(slot: number): THREE.Vector3 {
    this.entity.object.updateWorldMatrix(true, false);
    return this.entity.object.localToWorld(this.slots[slot].clone());
  }

  /** Kartons auf dieser Ablage (ids) */
  get entityIds(): number[] {
    return [...this.occupied.values()];
  }

  /** Nächsten freien Platz für eine Entity belegen; gibt die Weltposition zurück (null, wenn voll). */
  occupy(entityId: number): THREE.Vector3 | null {
    const slot = this.slots.findIndex((_, i) => !this.occupied.has(i));
    if (slot < 0) return null;
    this.occupied.set(slot, entityId);
    this.entity.object.updateWorldMatrix(true, false);
    return this.entity.object.localToWorld(this.slots[slot].clone());
  }

  /** Platz-Nummer einer Entity (oder -1). */
  slotOf(entityId: number): number {
    for (const [slot, id] of this.occupied) if (id === entityId) return slot;
    return -1;
  }

  /** Einen bestimmten Platz belegen (beim Laden); null, wenn er nicht frei ist. */
  occupyAt(slot: number, entityId: number): THREE.Vector3 | null {
    if (slot < 0 || slot >= this.slots.length || this.occupied.has(slot)) return null;
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
