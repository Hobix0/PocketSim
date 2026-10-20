import type * as THREE from 'three';
import type { ProductDef } from '../content/definitions';
import type { World } from '../ecs/World';
import type { Entity } from '../ecs/Entity';
import type { StoragePort } from '../economy/Purchasing';
import { StorageSurfaceComponent } from '../components/StorageSurfaceComponent';
import { CartonComponent } from '../components/CartonComponent';
import { createCartonEntity } from '../factory/createProductEntity';
import type { FactoryContext } from '../factory/FactoryContext';

// Das Lager: alle festen Ablageflächen in der Welt zusammen (Paletten, Regale, Gitterboxen …).
// Ladeflächen von LKW zählen nicht dazu (`temporaer`).
// Liefert Kartons auf den nächsten freien Platz und stellt vorhandene Kartons um.

export class CartonStorage implements StoragePort {
  constructor(private readonly world: World, private readonly ctx: FactoryContext) {}

  /** Feste Ablagen (ohne LKW-Ladeflächen) */
  surfaces(): StorageSurfaceComponent[] {
    return [...this.world.query(StorageSurfaceComponent)].map(([, s]) => s).filter((s) => !s.temporaer);
  }

  freeSlots(): number {
    return this.surfaces().reduce((n, s) => n + s.free, 0);
  }

  capacity(): number {
    return this.surfaces().reduce((n, s) => n + s.capacity, 0);
  }

  deliver(produkt: ProductDef, menge: number): void {
    const surface = this.surfaces().find((s) => s.free > 0);
    if (!surface) throw new Error('Kein freier Lagerplatz – der Einkauf hätte das vorher prüfen müssen');
    const carton = createCartonEntity(produkt, menge, this.ctx);
    this.world.add(carton);
    place(carton, surface);
  }

  /** Freie Ablage, die `near` am nächsten liegt (oder null) */
  nearestFree(near: THREE.Vector3, except?: StorageSurfaceComponent): StorageSurfaceComponent | null {
    let best: StorageSurfaceComponent | null = null, bestD = Infinity;
    for (const s of this.surfaces()) {
      if (s === except || s.free <= 0) continue;
      const d = s.entity.object.position.distanceToSquared(near);
      if (d < bestD) { best = s; bestD = d; }
    }
    return best;
  }

  /** Vorhandenen Karton auf den nächsten freien festen Platz stellen; false, wenn alles voll ist. */
  store(carton: Entity): boolean {
    const target = this.nearestFree(carton.object.position);
    if (!target) return false;
    carton.require(CartonComponent).leaveStorage();
    place(carton, target);
    return true;
  }
}

/** Karton auf einen freien Platz der Ablage stellen; false, wenn sie voll ist. */
export function place(carton: Entity, surface: StorageSurfaceComponent): boolean {
  const pos = surface.occupy(carton.id);
  if (!pos) return false;
  carton.object.position.copy(pos);
  carton.object.rotation.y = surface.entity.object.rotation.y;
  carton.require(CartonComponent).ablage = surface;
  return true;
}
