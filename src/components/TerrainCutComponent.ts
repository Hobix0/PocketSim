import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { TerrainCut } from '../world/Terrain';

// Bauteil, das das Gelände absenkt (z. B. die Rampenabfahrt vor einem Ladetor).
// Das Bauteil liegt mittig; die Absenkung beginnt an seinem hinteren Ende (lokal −X, an der Wand)
// und führt nach vorne (+X) erst flach, dann als Schräge wieder hinauf.

export class TerrainCutComponent extends Component {
  constructor(
    readonly def: { tiefe: number; flach: number; schraege: number; breite: number },
    /** Länge des Bauteils entlang X */
    private readonly laenge: number,
  ) {
    super();
  }

  /** Absenkung in Weltkoordinaten */
  cut(): TerrainCut {
    const o = this.entity.object;
    const fwd = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotation.y);
    const start = o.position.clone().addScaledVector(fwd, -this.laenge / 2);
    return { x: start.x, z: start.z, dx: fwd.x, dz: fwd.z, ...this.def };
  }
}
