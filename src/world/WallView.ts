import * as THREE from 'three';
import type { World } from '../ecs/World';
import type { Entity } from '../ecs/Entity';
import { FootprintComponent } from '../components/FootprintComponent';

// Wände ein- und ausblenden wie bei den Sims (Taste „Wände“):
//   oben    – alle Wände ganz
//   schnitt – Wände zwischen Kamera und Blickpunkt sinken auf Sockelhöhe, der Rest bleibt stehen
//   unten   – alle Wände nur noch als niedrige Kante
// Gesenkte Wände werden nur in der Höhe gestaucht (Grundriss, Bauen und Wege bleiben gleich);
// Anbauteile an gesenkten Wänden (Markise, Schilder, Lampen) werden ausgeblendet. Werte: data/baumenue → "waende".

export type WallMode = 'oben' | 'schnitt' | 'unten';
export const WALL_MODES: WallMode[] = ['oben', 'schnitt', 'unten'];

export interface WallViewSettings {
  /** Höhe gesenkter Wände (m) */
  sockel: number;
  /** In der Schnittansicht: nur Wände in diesem Umkreis um den Blickpunkt (m) */
  radius: number;
  /** So viel länger (m) gilt eine Wand beim Schnitt-Test (damit Ecken mitgehen) */
  ueberstand: number;
  /** Wie schnell Wände sinken und steigen */
  tempo: number;
}

export class WallView {
  mode: WallMode = 'oben';
  /** Aktuelle Höhe je Wand (1 = ganz, sonst Anteil) */
  private readonly scale = new Map<Entity, number>();

  constructor(private readonly world: World, private readonly settings: WallViewSettings) {
    world.events.on('removed', (e) => this.scale.delete(e));
  }

  next(): WallMode {
    this.mode = WALL_MODES[(WALL_MODES.indexOf(this.mode) + 1) % WALL_MODES.length];
    return this.mode;
  }

  /** `oben`: Wohnetagen und Dächer zeigen (wie das flache Dach nur herausgezoomt) */
  update(dt: number, camera: THREE.Vector3, focus: THREE.Vector3, oben = true): void {
    const s = this.settings;
    const walls: [Entity, FootprintComponent][] = [];
    const anbau: Entity[] = [];
    for (const [e, f] of this.world.query(FootprintComponent)) {
      if (f.ebene === 'wand') walls.push([e, f]);
      else if (f.ebene === 'anbau') anbau.push(e);
    }
    const lowered = new Set<string>();
    const k = 1 - Math.exp(-s.tempo * dt);
    for (const [e, f] of walls) {
      const low = this.mode === 'unten' || (this.mode === 'schnitt' && this.blocks(e, f, camera, focus));
      const ziel = low ? Math.min(1, s.sockel / Math.max(0.01, f.groesse[1])) : 1;
      const now = this.scale.get(e) ?? 1;
      const v = Math.abs(ziel - now) < 0.002 ? ziel : now + (ziel - now) * k;
      this.scale.set(e, v);
      e.object.scale.y = v;
      if (v < 0.95) lowered.add(key(e.object.position));
    }
    // Anbauteile hängen an „ihrem“ Wandmodul (gleiche Stelle)
    for (const e of anbau) e.object.visible = !lowered.has(key(e.object.position)) && (oben || !e.object.userData.obergeschoss);
  }

  /**
   * Wie bei den Sims: Eine Wand sinkt, wenn sie vor dem Blickpunkt steht (Richtung Kamera)
   * und mit ihrer Fläche zur Kamera zeigt – so geht die ganze Vorderfront weg, Seiten- und Rückwände bleiben.
   * Zusätzlich sinkt jede Wand, durch die die Sichtlinie Kamera→Blickpunkt geht.
   */
  private blocks(e: Entity, f: FootprintComponent, camera: THREE.Vector3, focus: THREE.Vector3): boolean {
    const p = e.object.position;
    if (Math.hypot(p.x - focus.x, p.z - focus.z) > this.settings.radius) return false;
    // Wände laufen entlang ihrer längeren Seite
    const [w, , d] = f.groesse;
    const r = e.object.rotation.y;
    const along = w >= d ? new THREE.Vector2(Math.cos(r), -Math.sin(r)) : new THREE.Vector2(Math.sin(r), Math.cos(r));
    const half = Math.max(w, d) / 2 + this.settings.ueberstand;
    const a = new THREE.Vector2(p.x - along.x * half, p.z - along.y * half);
    const b = new THREE.Vector2(p.x + along.x * half, p.z + along.y * half);
    const cam = new THREE.Vector2(camera.x, camera.z), foc = new THREE.Vector2(focus.x, focus.z);
    if (segmentsCross(cam, foc, a, b)) return true;
    const blick = cam.clone().sub(foc);
    if (blick.lengthSq() < 1e-6) return false;
    blick.normalize();
    const vor = (p.x - foc.x) * blick.x + (p.z - foc.y) * blick.y;
    const zeigt = Math.abs(-along.y * blick.x + along.x * blick.y);
    return vor > this.settings.ueberstand && zeigt > 0.45;
  }
}

const key = (p: THREE.Vector3) => `${Math.round(p.x * 20)},${Math.round(p.z * 20)}`;

function segmentsCross(p1: THREE.Vector2, p2: THREE.Vector2, q1: THREE.Vector2, q2: THREE.Vector2): boolean {
  const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const d1 = cross(q1, q2, p1), d2 = cross(q1, q2, p2), d3 = cross(p1, p2, q1), d4 = cross(p1, p2, q2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
