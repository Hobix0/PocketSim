import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Entity } from '../ecs/Entity';
import type { Describable, InfoRow } from '../ui/describe';

// Sitzplätze (z. B. Bistrotisch mit zwei Stühlen): Kunden mit Kaffee setzen sich nach dem Bezahlen
// eine Weile hin. Ein Platz gehört immer nur einem Kunden. Lage der Plätze relativ zum Bauteil (x, z in m)
// aus data/bau → "sitze"; man setzt sich vom Platz aus nach außen an (dort ist der Weg frei).

export class SeatComponent extends Component implements Describable {
  private readonly belegt: (Entity | null)[];

  constructor(private readonly sitze: [number, number][], private readonly tiefe: number) {
    super();
    this.belegt = sitze.map(() => null);
  }

  get frei(): number {
    return this.belegt.filter((b) => b === null).length;
  }

  /** Freien Platz für einen Kunden reservieren; -1, wenn alles besetzt ist */
  reserve(kunde: Entity): number {
    const i = this.belegt.indexOf(null);
    if (i >= 0) { this.belegt[i] = kunde; this.notifyChanged(); }
    return i;
  }

  release(kunde: Entity): void {
    const i = this.belegt.indexOf(kunde);
    if (i >= 0) { this.belegt[i] = null; this.notifyChanged(); }
  }

  /** Wo man sitzt (Welt) */
  seat(i: number): THREE.Vector3 {
    const [x, z] = this.sitze[i];
    return this.entity.object.localToWorld(new THREE.Vector3(x, 0, z));
  }

  /** Von wo man sich hinsetzt: vom Platz aus nach außen, knapp außerhalb des Bauteils */
  approach(i: number): THREE.Vector3 {
    const [x, z] = this.sitze[i];
    const len = Math.hypot(x, z) || 1;
    const d = this.tiefe / 2 + 0.3;
    return this.entity.object.localToWorld(new THREE.Vector3((x / len) * d, 0, (z / len) * d));
  }

  /** Mitte des Tisches (dahin schaut man) */
  center(): THREE.Vector3 {
    return this.entity.object.getWorldPosition(new THREE.Vector3());
  }

  describe(): InfoRow[] {
    return [{ label: 'Plätze frei', value: `${this.frei} von ${this.sitze.length}` }];
  }
}
