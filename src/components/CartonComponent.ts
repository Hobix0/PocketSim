import { Component } from '../ecs/Component';
import type { ProductDef } from '../content/definitions';
import type { Describable, InfoRow } from '../ui/describe';
import type { StorageSurfaceComponent } from './StorageSurfaceComponent';
import { formatMoney } from '../ui/format';

// Ein Karton mit Ware: welches Produkt, wie viele Stück, auf welcher Ablage.
// Ware fließt physisch: Gekauftes steht als Karton im Lager, bis es eingeräumt wird.

export class CartonComponent extends Component implements Describable {
  /** Ablage, auf der der Karton steht (Platz wird beim Entfernen freigegeben). */
  ablage: StorageSurfaceComponent | null = null;

  constructor(readonly produkt: ProductDef, public menge: number) {
    super();
  }

  override onDetach(): void {
    this.ablage?.release(this.entity.id);
    this.ablage = null;
  }

  describe(): InfoRow[] {
    return [
      { label: 'Inhalt', value: `${this.menge} Stück` },
      { label: 'Einkaufswert', value: formatMoney(this.menge * this.produkt.ek) },
      { label: 'Verkaufswert', value: formatMoney(this.menge * this.produkt.vk) },
    ];
  }
}
