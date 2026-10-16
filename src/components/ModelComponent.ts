import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { PlaceholderDef } from '../content/definitions';

// Darstellung einer Entity. Solange es kein Blender-Modell gibt, wird ein
// Quader aus den Platzhalter-Daten gezeigt. Später lädt diese Komponente das
// GLB aus `model` – wer sie benutzt, muss dafür nichts ändern.
// Der Ursprung liegt unten in der Mitte, damit Objekte auf dem Boden stehen.

export class ModelComponent extends Component {
  private mesh: THREE.Mesh | null = null;

  constructor(private readonly placeholder: PlaceholderDef) {
    super();
  }

  override onAttach(): void {
    const [w, h, d] = this.placeholder.groesse;
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: this.placeholder.farbe, roughness: 0.85 }),
    );
    this.mesh.position.y = h / 2;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.entity.object.add(this.mesh);
  }

  override onDetach(): void {
    if (!this.mesh) return;
    this.entity.object.remove(this.mesh);
    this.mesh.geometry.dispose();
    // Auch die Kopien aus der Hervorhebung freigeben (siehe interaction/highlight.ts)
    const data = this.mesh.userData as { baseMaterial?: THREE.Material; glowMaterial?: THREE.Material };
    for (const m of new Set([this.mesh.material as THREE.Material, data.baseMaterial, data.glowMaterial])) m?.dispose();
    this.mesh = null;
  }
}
