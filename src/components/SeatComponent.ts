import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Entity } from '../ecs/Entity';
import type { Describable, InfoRow } from '../ui/describe';

// Sitzplätze (z. B. Bistrotisch mit zwei Stühlen): Kunden mit Kaffee setzen sich nach dem Bezahlen
// eine Weile hin. Ein Platz gehört immer nur einem Kunden. Lage der Plätze relativ zum Bauteil (x, z in m)
// aus data/bau → "sitze" (optional mit Blickrichtung); man geht von der nächsten Kante aus auf den Platz.

export class SeatComponent extends Component implements Describable {
  private readonly belegt: (Entity | null)[];

  constructor(private readonly sitze: [number, number, number?][], private readonly groesse: [number, number, number]) {
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

  /** Von wo man sich hinsetzt: vom Platz aus zur nächsten Kante des Bauteils, knapp außerhalb */
  approach(i: number): THREE.Vector3 {
    const [x, z] = this.sitze[i];
    const hx = this.groesse[0] / 2, hz = this.groesse[2] / 2;
    const p = hx - Math.abs(x) < hz - Math.abs(z)
      ? new THREE.Vector3(Math.sign(x || 1) * (hx + 0.3), 0, z)
      : new THREE.Vector3(x, 0, Math.sign(z || 1) * (hz + 0.3));
    return this.entity.object.localToWorld(p);
  }

  /** Wohin man im Sitzen schaut: in die Blickrichtung des Platzes, sonst zur Mitte (Tisch) */
  lookAt(i: number): THREE.Vector3 {
    const [x, z, blick] = this.sitze[i];
    if (blick === undefined) return this.entity.object.getWorldPosition(new THREE.Vector3());
    const a = THREE.MathUtils.degToRad(blick);
    return this.entity.object.localToWorld(new THREE.Vector3(x + Math.cos(a), 0, z - Math.sin(a)));
  }

  describe(): InfoRow[] {
    return [{ label: 'Plätze frei', value: `${this.frei} von ${this.sitze.length}` }];
  }
}
