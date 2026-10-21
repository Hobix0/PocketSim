import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { LightDef } from '../content/definitions';

// Eine Lampe: Die Leuchtfläche glüht (leuchtet auch ohne Licht im Raum) und die Lampe meldet,
// wo ihr Licht herkommt. Echte Lichtquellen verteilt LampLights auf die Lampen nahe der Kamera –
// so bleibt das Spiel schnell, auch mit vielen Lampen.

export class LampComponent extends Component {
  /** Blinker an (z. B. Warnblinker eines stehenden LKW) */
  blinken = false;
  private glow: THREE.Mesh | null = null;
  private readonly extras: { mesh: THREE.Mesh; blinkt: boolean }[] = [];
  private blinkTime = 0;
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
    for (const z of this.def.zusatz ?? []) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...z.groesse), new THREE.MeshBasicMaterial({ color: z.farbe, toneMapped: false }));
      mesh.position.set(...z.position);
      this.entity.object.add(mesh);
      this.extras.push({ mesh, blinkt: !!z.blinkt });
    }
  }

  override update(dt: number): void {
    if (!this.extras.some((e) => e.blinkt)) return;
    this.blinkTime += dt;
    const an = this.blinken && Math.floor(this.blinkTime * 2.8) % 2 === 0;
    for (const e of this.extras) if (e.blinkt) e.mesh.visible = an;
  }

  override onDetach(): void {
    for (const e of this.extras) { this.entity.object.remove(e.mesh); e.mesh.geometry.dispose(); }
    this.extras.length = 0;
    if (this.glow) {
      this.entity.object.remove(this.glow);
      this.glow.geometry.dispose();
      this.glow = null;
    }
  }
}
