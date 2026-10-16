import type { ProductDef } from '../content/definitions';
import type { World } from '../ecs/World';
import type { StoragePort } from '../economy/Purchasing';
import { StorageSurfaceComponent } from '../components/StorageSurfaceComponent';
import { CartonComponent } from '../components/CartonComponent';
import { createCartonEntity } from '../factory/createProductEntity';
import type { FactoryContext } from '../factory/FactoryContext';

// Das Lager aus Sicht des Einkaufs: alle Ablageflächen in der Welt zusammen.
// Liefert Kartons auf den nächsten freien Platz.

export class CartonStorage implements StoragePort {
  constructor(private readonly world: World, private readonly ctx: FactoryContext) {}

  freeSlots(): number {
    let free = 0;
    for (const [, surface] of this.world.query(StorageSurfaceComponent)) free += surface.free;
    return free;
  }

  deliver(produkt: ProductDef, menge: number): void {
    const surface = [...this.world.query(StorageSurfaceComponent)].map(([, s]) => s).find((s) => s.free > 0);
    if (!surface) throw new Error('Kein freier Lagerplatz – der Einkauf hätte das vorher prüfen müssen');
    const carton = createCartonEntity(produkt, menge, this.ctx);
    this.world.add(carton);
    const pos = surface.occupy(carton.id)!;
    carton.object.position.copy(pos);
    carton.object.rotation.y = surface.entity.object.rotation.y;
    carton.require(CartonComponent).ablage = surface;
  }
}
