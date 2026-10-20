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
  /** id der Angestellten, die den Karton gerade holt oder trägt (dann für andere tabu). */
  reservedBy: number | null = null;

  constructor(readonly produkt: ProductDef, public menge: number) {
    super();
  }

  /** Stück entnehmen; meldet die Änderung. */
  remove(n: number): void {
    this.menge = Math.max(0, this.menge - n);
    this.notifyChanged();
  }

  /** Von der Ablage nehmen (Platz wird frei), z. B. wenn jemand den Karton trägt. */
  leaveStorage(): void {
    this.ablage?.release(this.entity.id);
    this.ablage = null;
  }

  override onDetach(): void {
    this.leaveStorage();
  }

  describe(): InfoRow[] {
    return [
      { label: 'Inhalt', value: `${this.menge} Stück` },
      { label: 'Einkaufswert', value: formatMoney(this.menge * this.produkt.ek) },
      { label: 'Verkaufswert', value: formatMoney(this.menge * this.produkt.vk) },
    ];
  }
}
