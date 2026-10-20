import * as THREE from 'three';
import type { World } from '../ecs/World';
import { LampComponent } from '../components/LampComponent';

// Echte Lichtquellen für Lampen. Es gibt eine feste Zahl davon (aus data/licht): Jede Lichtquelle in
// three.js kostet Rechenzeit, und eine wechselnde Zahl würde die Shader jedes Mal neu übersetzen.
// Die Lichter wandern zu den Lampen, die der Kamera am nächsten sind; ungenutzte bleiben dunkel.

export class LampLights {
  private readonly lights: THREE.PointLight[] = [];
  private timer = 0;

  constructor(scene: THREE.Scene, private readonly world: World, anzahl: number) {
    for (let i = 0; i < anzahl; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 5, 2);
      l.castShadow = false;
      this.lights.push(l);
      scene.add(l);
    }
  }

  /** `focus`: wo die Kamera hinschaut; `staerke`: Faktor (nachts heller) */
  update(dt: number, focus: THREE.Vector3, staerke: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const lamps = [...this.world.query(LampComponent)].map(([, l]) => ({ l, pos: l.worldPosition(new THREE.Vector3()) }));
    lamps.sort((a, b) => a.pos.distanceToSquared(focus) - b.pos.distanceToSquared(focus));
    this.lights.forEach((light, i) => {
      const lamp = lamps[i];
      if (!lamp) { light.intensity = 0; return; }
      light.position.copy(lamp.pos);
      light.color.set(lamp.l.def.farbe);
      light.distance = lamp.l.def.reichweite;
      light.intensity = lamp.l.def.staerke * staerke;
    });
  }
}
