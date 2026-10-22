import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Entity } from '../ecs/Entity';
import type { ModelProvider } from '../assets/ModelLibrary';
import type { Describable, InfoRow } from '../ui/describe';

// Umkleidekabine (Modeladen): Kunden mit Kleidung im Korb gehen hinein, ziehen den Vorhang zu
// und probieren an. Immer nur ein Kunde je Kabine. Vorhang und Eingang aus data/bau → "umkleide".

export class FittingRoomComponent extends Component implements Describable {
  private kunde: Entity | null = null;
  private vorhang: THREE.Object3D | null = null;
  private zu = false;

  constructor(private readonly def: { vorhang: string; eingang: [number, number] }, private readonly models?: ModelProvider) {
    super();
  }

  get frei(): boolean {
    return this.kunde === null;
  }

  /** Kabine für einen Kunden reservieren; false, wenn besetzt */
  reserve(kunde: Entity): boolean {
    if (this.kunde && this.kunde !== kunde) return false;
    this.kunde = kunde;
    this.notifyChanged();
    return true;
  }

  release(kunde: Entity): void {
    if (this.kunde !== kunde) return;
    this.kunde = null;
    this.close(false);
    this.notifyChanged();
  }

  /** Wo man vor der Kabine steht (Welt) */
  entrance(): THREE.Vector3 {
    const [x, z] = this.def.eingang;
    return this.entity.object.localToWorld(new THREE.Vector3(x, 0, z));
  }

  /** Mitte der Kabine (Welt), dort steht man beim Anprobieren */
  inside(): THREE.Vector3 {
    return this.entity.object.localToWorld(new THREE.Vector3(0, 0, 0));
  }

  /** Vorhang zuziehen (true) oder öffnen */
  close(zu: boolean): void {
    this.zu = zu;
    if (this.vorhang) { this.vorhang.visible = zu; return; }
    if (!zu || !this.models) return;
    this.models.instance(this.def.vorhang).then((obj) => {
      if (!this.entity?.object || this.vorhang) return;
      this.vorhang = obj;
      this.entity.object.add(obj);
      obj.visible = this.zu;
    });
  }

  override onDetach(): void {
    this.kunde = null;
  }

  describe(): InfoRow[] {
    return [{ label: 'Umkleide', value: this.kunde ? 'besetzt' : 'frei' }];
  }
}
