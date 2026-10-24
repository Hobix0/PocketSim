import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Entity } from '../ecs/Entity';
import type { Employee } from '../economy/Staff';
import { PathFollower, turnTowards, type PathFinder } from '../navigation/PathFollower';
import type { Describable, InfoRow } from '../ui/describe';

// Werksmitarbeiter (Industriegebiet): gehen von einer laufenden Produktionslinie zur nächsten, stellen sich
// an den Schaltschrank und prüfen die Anlage. Mit genug Werksmitarbeitern laufen die Linien im vollen Tempo
// (siehe Game → tempo der Maschinen); ohne laufen sie gemütlich mit halbem Tempo weiter.

export type PlantWorkerState = 'wartet' | 'geht' | 'prueft';

export interface PlantWorkerServices {
  findPath?: PathFinder;
  gehgeschwindigkeit: number;
  /** Laufende Linien (Ziele für den Rundgang) */
  linien(): Entity[];
  /** Wo man wartet, wenn nichts läuft (z. B. vor dem Zentrallager) */
  warteplatz(): THREE.Vector3;
  /** Name einer Linie (für den Status) */
  name(linie: Entity): string;
  rollenName: string;
  text(key: string, werte?: Record<string, string | number>): string;
}

/** Sekunden an einer Linie */
const PRUEFEN = 18;

export class PlantWorkerComponent extends Component implements Describable {
  state: PlantWorkerState = 'wartet';
  private ziel: Entity | null = null;
  private letzte: Entity | null = null;
  private timer = 0;
  private readonly path = new PathFollower();

  constructor(readonly employee: Employee, private readonly services: PlantWorkerServices) {
    super();
  }

  override update(dt: number): void {
    if (dt <= 0) return;
    const o = this.entity.object;
    const speed = this.services.gehgeschwindigkeit * this.employee.tempo;
    switch (this.state) {
      case 'wartet':
        this.timer -= dt;
        if (this.path.step(o, speed, dt) && this.timer <= 0) { this.timer = 3; this.next(); }
        break;
      case 'geht':
        if (!this.ziel?.world) { this.next(); return; }
        if (this.path.step(o, speed, dt)) { this.state = 'prueft'; this.timer = PRUEFEN / Math.max(0.3, this.employee.tempo); this.notifyChanged(); }
        break;
      case 'prueft':
        if (!this.ziel?.world) { this.next(); return; }
        turnTowards(o, Math.atan2(this.ziel.object.position.x - o.position.x, this.ziel.object.position.z - o.position.z), dt);
        this.timer -= dt;
        if (this.timer <= 0) { this.letzte = this.ziel; this.next(); }
        break;
    }
  }

  /** Nächste laufende Linie (möglichst eine andere als eben), sonst zum Warteplatz */
  private next(): void {
    const linien = this.services.linien();
    const andere = linien.filter((l) => l !== this.letzte);
    const pool = andere.length ? andere : linien;
    this.ziel = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    if (this.ziel) {
      // Vor den Schaltschrank (vorne rechts an der Linie)
      const p = this.ziel.object.localToWorld(new THREE.Vector3(1.25, 0, -1.6));
      this.path.goTo(this.entity.object, p, this.services.findPath);
      this.state = 'geht';
    } else {
      this.path.goTo(this.entity.object, this.services.warteplatz(), this.services.findPath);
      this.state = 'wartet';
    }
    this.notifyChanged();
  }

  statusText(): string {
    if (this.state === 'wartet' || !this.ziel) return this.services.text('status_werk_wartet');
    return this.services.text(this.state === 'geht' ? 'status_werk_geht' : 'status_werk_prueft', { linie: this.services.name(this.ziel) });
  }

  describe(): InfoRow[] {
    return [{ label: 'Gerade', value: this.statusText() }];
  }
}
