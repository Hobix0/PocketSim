import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { LightDef } from '../content/definitions';

// Eine Lampe: Die Leuchtfläche glüht (leuchtet auch ohne Licht im Raum) und die Lampe meldet,
// wo ihr Licht herkommt. Echte Lichtquellen verteilt LampLights auf die Lampen nahe der Kamera –
// so bleibt das Spiel schnell, auch mit vielen Lampen.

export class LampComponent extends Component {
  private glow: THREE.Mesh | null = null;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly hell: THREE.Color;
  private readonly aus: THREE.Color;

  constructor(readonly def: LightDef) {
    super();
    this.hell = new THREE.Color(def.farbe);
    this.aus = this.hell.clone().multiplyScalar(0.35);
    // Ohne Tonemapping, damit die Fläche wirklich hell wirkt
    this.material = new THREE.MeshBasicMaterial({ color: this.hell, toneMapped: false });
  }

  /** Weltposition der Lichtquelle */
  worldPosition(target = new THREE.Vector3()): THREE.Vector3 {
    this.entity.object.updateWorldMatrix(true, false);
    return this.entity.object.localToWorld(target.set(...this.def.position));
  }

  /** Helligkeit der Leuchtfläche: 0 = aus, 1 = an */
  setGlow(an: number): void {
    this.material.color.copy(this.aus).lerp(this.hell, Math.max(0, Math.min(1, an)));
  }

  override onAttach(): void {
    const [w, h, d] = this.def.groesse;
    this.glow = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.material);
    this.glow.position.set(...this.def.position);
    this.glow.name = 'leuchtflaeche';
    this.entity.object.add(this.glow);
  }

  override onDetach(): void {
    if (this.glow) {
      this.entity.object.remove(this.glow);
      this.glow.geometry.dispose();
      this.glow = null;
    }
  }
}
