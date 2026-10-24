import * as THREE from 'three';
import type { ModelProvider } from '../assets/ModelLibrary';

// LKW im Industriegebiet (nur zum Anschauen): Kommt Ware im Zentrallager an, fährt ein LKW über die
// Industriestraße vor, hält am Tor und fährt weiter; wird Ware in einen Laden geschickt, fährt einer
// vom Tor los. Die eigentliche Lieferung in den Laden übernimmt wie immer der LKW an der Laderampe.

interface Fahrt {
  obj: THREE.Object3D;
  /** Fährt zum Tor, steht dort, fährt weg */
  phase: 'hin' | 'steht' | 'weg';
  ziel: number;
  warten: number;
}

export interface RoadSettings {
  /** Fahrspur (z) und Anfang/Ende der Straße (x) */
  z: number;
  von: number;
  bis: number;
  /** m/s */
  tempo: number;
}

export class IndustryTraffic {
  private readonly fahrten: Fahrt[] = [];

  constructor(private readonly scene: THREE.Object3D, private readonly models: ModelProvider | undefined, private readonly model: string, private readonly road: RoadSettings) {}

  /** Ein LKW kommt zum Tor bei x und hält dort `sekunden` */
  anliefern(x: number, sekunden = 6): void {
    this.add(this.road.von, { phase: 'hin', ziel: x, warten: sekunden });
  }

  /** Ein LKW fährt vom Tor bei x los */
  abholen(x: number): void {
    this.add(x, { phase: 'steht', ziel: x, warten: 2 });
  }

  update(dt: number): void {
    for (let i = this.fahrten.length - 1; i >= 0; i--) {
      const f = this.fahrten[i];
      const p = f.obj.position;
      if (f.phase === 'hin') {
        p.x = Math.min(f.ziel, p.x + this.road.tempo * dt * Math.min(1, (f.ziel - p.x) / 6 + 0.25)); // bremst vor dem Tor
        if (f.ziel - p.x < 0.05) f.phase = 'steht';
      } else if (f.phase === 'steht') {
        f.warten -= dt;
        if (f.warten <= 0) f.phase = 'weg';
      } else {
        p.x += this.road.tempo * dt;
        if (p.x > this.road.bis) { this.scene.remove(f.obj); this.fahrten.splice(i, 1); }
      }
    }
  }

  private add(x: number, f: Omit<Fahrt, 'obj'>): void {
    if (!this.models) return;
    const obj = new THREE.Group();
    obj.position.set(x, 0.04, this.road.z);
    this.scene.add(obj);
    this.fahrten.push({ obj, ...f });
    this.models.instance(this.model).then((m) => obj.add(m));
  }
}
