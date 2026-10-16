import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { BuildLayer } from '../content/definitions';

// Grundfläche eines Bauelements in der Welt (Rechteck in X/Z) und seine Bau-Ebene.
// Grundlage für "Ist hier noch frei?" und "Steht das auf Boden?" beim Bauen.
// Drehungen sind beim Bauen Vielfache von 90°, das Rechteck bleibt achsenparallel.

export interface Rect {
  minX: number; maxX: number; minZ: number; maxZ: number;
}

export class FootprintComponent extends Component {
  constructor(
    readonly ebene: BuildLayer,
    /** Breite (X), Höhe (Y), Tiefe (Z) in Metern, ungedreht */
    readonly groesse: [number, number, number],
  ) {
    super();
  }

  /** Aktuelles Rechteck in Weltkoordinaten. */
  rect(): Rect {
    const o = this.entity.object;
    return footprintRect(o.position, o.rotation.y, this.groesse);
  }

  /** Oberkante (für Böden: worauf Dinge gestellt werden). */
  top(): number {
    return this.entity.object.position.y + this.groesse[1];
  }
}

/** Rechteck einer Grundfläche an einer Position mit Drehung (auf 90° gerundet). */
export function footprintRect(pos: THREE.Vector3 | { x: number; z: number }, rotationY: number, groesse: [number, number, number]): Rect {
  const quarter = Math.round(rotationY / (Math.PI / 2));
  const swap = Math.abs(quarter) % 2 === 1;
  const w = swap ? groesse[2] : groesse[0];
  const d = swap ? groesse[0] : groesse[2];
  return { minX: pos.x - w / 2, maxX: pos.x + w / 2, minZ: pos.z - d / 2, maxZ: pos.z + d / 2 };
}

/** Überschneiden sich zwei Rechtecke? Berühren an der Kante zählt nicht. */
export function overlaps(a: Rect, b: Rect, tolerance = 0.02): boolean {
  return a.minX < b.maxX - tolerance && a.maxX > b.minX + tolerance && a.minZ < b.maxZ - tolerance && a.maxZ > b.minZ + tolerance;
}

export function containsPoint(r: Rect, x: number, z: number): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}
