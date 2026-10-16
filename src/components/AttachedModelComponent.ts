import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { ModelProvider } from '../assets/ModelLibrary';
import { reapplyHighlight } from '../interaction/highlight';

// Ein zusätzliches Modell an einer Entity, z. B. das Produkt oben auf einem Karton.
// Wird auf eine Höchstgröße verkleinert, damit es auf seine Unterlage passt.

export class AttachedModelComponent extends Component {
  private model: THREE.Object3D | null = null;
  private attached = false;

  constructor(
    private readonly path: string,
    private readonly provider: ModelProvider | undefined,
    private readonly offset: [number, number, number],
    private readonly maxSize: number,
  ) {
    super();
  }

  override onAttach(): void {
    this.attached = true;
    this.provider?.instance(this.path).then(
      (obj) => {
        if (!this.attached) return;
        const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
        const largest = Math.max(size.x, size.y, size.z);
        if (largest > this.maxSize) obj.scale.multiplyScalar(this.maxSize / largest);
        obj.position.set(...this.offset);
        this.model = obj;
        this.entity.object.add(obj);
        reapplyHighlight(this.entity);
      },
      (err: unknown) => console.warn(`${this.entity.object.name}: Zusatzmodell nicht geladen –`, err),
    );
  }

  override onDetach(): void {
    this.attached = false;
    if (this.model) this.entity.object.remove(this.model);
    this.model = null;
  }
}
