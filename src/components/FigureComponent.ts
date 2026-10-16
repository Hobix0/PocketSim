import * as THREE from 'three';
import { Component } from '../ecs/Component';

// Einfache Spielfigur (Körper, Kopf), bis es Figuren aus Blender gibt.
// Die Farbe des Körpers zeigt die Rolle. Ursprung unten in der Mitte.

export class FigureComponent extends Component {
  private group: THREE.Group | null = null;

  constructor(private readonly farbe: string) {
    super();
  }

  override onAttach(): void {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.75, 4, 10), new THREE.MeshStandardMaterial({ color: this.farbe, roughness: 0.8 }));
    body.position.y = 0.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), new THREE.MeshStandardMaterial({ color: '#e8c4a0', roughness: 0.8 }));
    head.position.y = 1.4;
    for (const m of [body, head]) { m.castShadow = true; g.add(m); }
    this.group = g;
    this.entity.object.add(g);
  }

  override onDetach(): void {
    if (!this.group) return;
    this.entity.object.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    });
    this.group = null;
  }
}
