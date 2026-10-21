import * as THREE from 'three';
import { Emitter } from '../core/Emitter';
import type { InputMap } from '../input/InputMap';
import type { Pointer } from '../input/Pointer';
import type { PlayerState } from '../state/PlayerState';
import type { TerrainSettings } from '../content/definitions';
import type { Terrain } from '../world/Terrain';

// Gelände-Werkzeug: Boden anheben, absenken oder ebnen – solange die linke Maustaste gehalten wird.
// Ein Kreis zeigt den Pinsel auf dem Gelände. Bewegte Erde kostet Geld (je m³, aus data/gelaende).
// Wo gebaut werden darf, entscheidet `erlaubt` (eigenes Grundstück, nichts gebaut darauf).

export type TerrainMode = 'heben' | 'senken' | 'ebnen';

export interface TerrainToolEvents extends Record<string, unknown> {
  message: { key: string; art?: 'gut' | 'warnung' };
  changed: undefined;
}

export class TerrainTool {
  readonly events = new Emitter<TerrainToolEvents>();
  mode: TerrainMode | null = null;
  radius: number;
  private readonly ring: THREE.LineLoop;
  private readonly raycaster = new THREE.Raycaster();
  private schuld = 0;

  constructor(
    private readonly terrain: Terrain,
    private readonly ground: THREE.Mesh,
    scene: THREE.Scene,
    private readonly input: InputMap,
    private readonly pointer: Pointer,
    private readonly player: PlayerState,
    private readonly settings: TerrainSettings,
    private readonly erlaubt: (x: number, z: number) => boolean,
  ) {
    this.radius = settings.pinsel[1] ?? settings.pinsel[0] ?? 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(64 * 3), 3));
    this.ring = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: '#5fd08a', depthTest: false }));
    this.ring.renderOrder = 20;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  get active(): boolean {
    return this.mode !== null;
  }

  start(mode: TerrainMode): void {
    this.mode = mode;
    (this.ring.material as THREE.LineBasicMaterial).color.set(mode === 'heben' ? '#5fd08a' : mode === 'senken' ? '#e0a050' : '#9ec3e6');
    this.events.emit('changed', undefined);
  }

  cancel(): void {
    if (!this.mode) return;
    this.pay();
    this.mode = null;
    this.ring.visible = false;
    this.events.emit('changed', undefined);
  }

  setRadius(r: number): void {
    this.radius = r;
    this.events.emit('changed', undefined);
  }

  update(camera: THREE.Camera, dt: number): void {
    if (!this.mode) return;
    this.raycaster.setFromCamera(this.pointer.ndc, camera);
    const hit = this.raycaster.intersectObject(this.ground, false)[0];
    if (!hit) { this.ring.visible = false; return; }
    const { x, z } = hit.point;
    this.drawRing(x, z);
    if (!this.input.isHeld('auswaehlen')) { this.pay(); return; }
    // Kein Geld mehr: aufhören (was schon bewegt wurde, wird noch abgerechnet)
    if (this.player.geld - this.schuld <= 0) {
      this.events.emit('message', { key: 'gelaende_kein_geld', art: 'warnung' });
      this.cancel();
      return;
    }
    const s = this.settings;
    const step = s.tempo * Math.min(dt, 0.1);
    const volumen = this.mode === 'ebnen'
      ? this.terrain.flatten(x, z, this.radius, step, this.erlaubt)
      : this.terrain.brush(x, z, this.radius, this.mode === 'heben' ? step : -step, this.erlaubt);
    this.schuld += volumen * s.preisProKubikmeter;
    if (this.schuld >= 1) this.pay();
  }

  /** Aufgelaufene Kosten abbuchen (in Euro-Schritten, der Rest beim Loslassen) */
  private pay(): void {
    const betrag = Math.round(this.schuld * 100) / 100;
    if (betrag > 0) this.player.charge(betrag, 'gelaende');
    this.schuld = 0;
  }

  private drawRing(x: number, z: number): void {
    const pos = this.ring.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const px = x + Math.cos(a) * this.radius, pz = z + Math.sin(a) * this.radius;
      pos.setXYZ(i, px, this.terrain.heightAt(px, pz) + 0.06, pz);
    }
    pos.needsUpdate = true;
    this.ring.geometry.computeBoundingSphere();
    this.ring.visible = true;
  }
}
