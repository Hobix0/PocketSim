import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { PlaceholderDef } from '../content/definitions';
import type { ModelProvider } from '../assets/ModelLibrary';
import { reapplyHighlight } from '../interaction/highlight';

// Darstellung einer Entity.
// Zuerst steht ein schlichter Quader in den Maßen des Modells da. Gibt es ein
// Blender-Modell, wird es im Hintergrund geladen und ersetzt dann den Quader.
// Ohne Modell (oder ohne ModelProvider, z. B. in Tests) bleibt der Quader.
// Der Ursprung liegt unten in der Mitte, damit Objekte auf dem Boden stehen.

export class ModelComponent extends Component {
  private placeholderMesh: THREE.Mesh | null = null;
  private model: THREE.Object3D | null = null;
  private attached = false;

  constructor(
    private readonly placeholder: PlaceholderDef,
    private readonly modelPath?: string,
    private readonly provider?: ModelProvider,
  ) {
    super();
  }

  /** Ist das Blender-Modell geladen und sichtbar? */
  get loaded(): boolean {
    return this.model !== null;
  }

  override onAttach(): void {
    this.attached = true;
    this.showPlaceholder();
    if (this.modelPath && this.provider) {
      this.provider.instance(this.modelPath).then(
        (obj) => this.showModel(obj),
        (err: unknown) => console.warn(`${this.entity.object.name}: Modell nicht geladen –`, err),
      );
    }
  }

  override onDetach(): void {
    this.attached = false;
    this.removePlaceholder();
    if (this.model) {
      // Geometrie und Material teilen sich alle Exemplare – nur aus der Szene nehmen
      this.entity.object.remove(this.model);
      this.model = null;
    }
  }

  private showPlaceholder(): void {
    const [w, h, d] = this.placeholder.groesse;
    this.placeholderMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: this.placeholder.farbe, roughness: 0.85 }),
    );
    this.placeholderMesh.position.y = h / 2;
    this.placeholderMesh.castShadow = true;
    this.placeholderMesh.receiveShadow = true;
    this.entity.object.add(this.placeholderMesh);
  }

  private showModel(obj: THREE.Object3D): void {
    if (!this.attached) return; // Entity wurde entfernt, während das Modell lud
    this.removePlaceholder();
    this.model = obj;
    this.entity.object.add(obj);
    reapplyHighlight(this.entity);
  }

  private removePlaceholder(): void {
    const mesh = this.placeholderMesh;
    if (!mesh) return;
    this.entity.object.remove(mesh);
    mesh.geometry.dispose();
    // Auch Kopien aus der Hervorhebung freigeben (siehe interaction/highlight.ts)
    const data = mesh.userData as { baseMaterial?: THREE.Material; glowMaterial?: THREE.Material };
    for (const m of new Set([mesh.material as THREE.Material, data.baseMaterial, data.glowMaterial])) m?.dispose();
    this.placeholderMesh = null;
  }
}
