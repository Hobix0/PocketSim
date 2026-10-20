import * as THREE from 'three';
import type { Point } from './NavGrid';

// Läuft eine Figur einen Weg entlang (Punktliste aus der Wegfindung).
// Die Figur dreht sich weich in Laufrichtung; die Höhe folgt dem Boden.

/** Weg suchen; null = kein Weg (dann wird direkt hingelaufen). */
export type PathFinder = (from: Point, to: Point) => Point[] | null;

export class PathFollower {
  private points: Point[] = [];
  private index = 0;

  get done(): boolean {
    return this.index >= this.points.length;
  }

  /** Ziel des aktuellen Weges (oder null). */
  get goal(): Point | null {
    return this.points[this.points.length - 1] ?? null;
  }

  /** Neuen Weg von der aktuellen Position zum Ziel planen. */
  goTo(obj: THREE.Object3D, target: Point, find?: PathFinder): void {
    const p = obj.position;
    const path = find?.({ x: p.x, y: p.y, z: p.z }, target);
    this.points = path && path.length ? path : [{ ...target }];
    this.index = 0;
  }

  stop(): void {
    this.points = [];
    this.index = 0;
  }

  /** Ein Stück weitergehen; true, wenn das Ziel erreicht ist. */
  step(obj: THREE.Object3D, speed: number, dt: number): boolean {
    let budget = speed * dt;
    const p = obj.position;
    while (budget > 0 && this.index < this.points.length) {
      const t = this.points[this.index];
      const dx = t.x - p.x, dz = t.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-4) turnTowards(obj, Math.atan2(dx, dz), dt);
      if (dist <= budget) {
        p.x = t.x; p.z = t.z; p.y = t.y;
        budget -= dist;
        this.index++;
      } else {
        const f = budget / dist;
        p.x += dx * f;
        p.z += dz * f;
        p.y += (t.y - p.y) * Math.min(1, f * 2);
        budget = 0;
      }
    }
    return this.done;
  }
}

/** Weich in eine Richtung drehen (kürzester Weg um den Kreis). */
export function turnTowards(obj: THREE.Object3D, angle: number, dt: number, speed = 10): void {
  let d = angle - obj.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  obj.rotation.y += d * Math.min(1, speed * dt);
}
