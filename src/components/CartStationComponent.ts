import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { ModelProvider } from '../assets/ModelLibrary';
import type { Describable, InfoRow } from '../ui/describe';

// Wagenbox: Hier stehen leere Einkaufswagen. Kunden mit größerem Einkauf nehmen sich einen,
// legen ihre Ware hinein und bringen ihn nach dem Einpacken zurück. Zu sehen ist immer,
// wie viele Wagen gerade frei sind. Die Wagen stehen ineinandergeschoben entlang der Box (lokal Z),
// mit der Front nach vorne (+X), wo die Kunden sie herausziehen.

const ABSTAND = 0.34;

export class CartStationComponent extends Component implements Describable {
  frei: number;
  private readonly carts: THREE.Object3D[] = [];

  constructor(
    readonly anzahl: number,
    private readonly cartModel?: string,
    private readonly models?: ModelProvider,
  ) {
    super();
    this.frei = anzahl;
  }

  /** Einen Wagen nehmen; false, wenn keiner frei ist. */
  take(): boolean {
    if (this.frei <= 0) return false;
    this.frei--;
    this.render();
    this.notifyChanged();
    return true;
  }

  /** Wagen zurückstellen. */
  give(): void {
    this.frei = Math.min(this.anzahl, this.frei + 1);
    this.render();
    this.notifyChanged();
  }

  /** Wo Kunden einen Wagen nehmen oder abstellen (vor der Box, auf dem Boden). */
  pickupSpot(): THREE.Vector3 {
    const o = this.entity.object;
    const fwd = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotation.y);
    return o.position.clone().addScaledVector(fwd, 1.1);
  }

  override onAttach(): void {
    if (!this.cartModel || !this.models) return;
    const start = -((this.anzahl - 1) * ABSTAND) / 2;
    for (let i = 0; i < this.anzahl; i++) {
      const holder = new THREE.Group();
      holder.position.set(0, 0.02, start + i * ABSTAND);
      this.entity.object.add(holder);
      this.carts.push(holder);
      this.models.instance(this.cartModel).then((obj) => holder.add(obj), () => {});
    }
    this.render();
  }

  override onDetach(): void {
    for (const c of this.carts) this.entity.object.remove(c);
    this.carts.length = 0;
  }

  describe(): InfoRow[] {
    return [{ label: 'Freie Wagen', value: `${this.frei} / ${this.anzahl}` }];
  }

  private render(): void {
    this.carts.forEach((c, i) => { c.visible = i < this.frei; });
  }
}
