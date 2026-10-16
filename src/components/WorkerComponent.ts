import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Entity } from '../ecs/Entity';
import type { Employee } from '../economy/Staff';
import type { Describable, InfoRow } from '../ui/describe';
import { CartonComponent } from './CartonComponent';
import { stockFromCarton, type StockingTask } from '../economy/Stocking';
import { formatMoney } from '../ui/format';

// Arbeitsverhalten eines Auffüllers als Zustandsmaschine:
//   warten → zum Karton gehen → Karton aufnehmen → zum Regal gehen → einräumen → warten …
// Läuft in Spielzeit (steht in der Pause). Gelaufen wird vorerst in gerader Linie –
// Wegfindung um Hindernisse kommt mit der Kunden-KI (Meilenstein 9).

export type WorkerState = 'wartet' | 'holt' | 'bringt' | 'raeumt';

export interface WorkerServices {
  findTask(): StockingTask | null;
  gehgeschwindigkeit: number;
  sekundenProStueck: number;
  /** Anzeigename der Rolle, z. B. "Auffüller" */
  rollenName: string;
  /** Text aus data/texte/standard.json */
  text(key: string, werte?: Record<string, string | number>): string;
}

export class WorkerComponent extends Component implements Describable {
  state: WorkerState = 'wartet';
  private task: StockingTask | null = null;
  private wait = 0;
  private stockTimer = 0;
  private readonly target = new THREE.Vector3();

  constructor(readonly employee: Employee, private readonly services: WorkerServices) {
    super();
  }

  /** Produkt der aktuellen Aufgabe (für Statusanzeigen). */
  get produktName(): string | null {
    return this.task?.carton.get(CartonComponent)?.produkt.name ?? null;
  }

  override update(dt: number): void {
    if (dt <= 0) return;
    switch (this.state) {
      case 'wartet':
        this.wait -= dt;
        if (this.wait <= 0) this.startTask();
        break;
      case 'holt':
        if (!this.taskValid()) return this.reset();
        if (this.walk(dt)) this.pickUp();
        break;
      case 'bringt':
        if (!this.taskValid()) return this.reset();
        this.walk(dt);
        this.carry();
        if (this.arrived()) {
          this.state = 'raeumt';
          this.stockTimer = this.carton.menge * this.services.sekundenProStueck / this.employee.tempo;
          this.notifyChanged();
        }
        break;
      case 'raeumt':
        if (!this.taskValid()) return this.reset();
        this.stockTimer -= dt;
        if (this.stockTimer <= 0) this.finish();
        break;
    }
  }

  override onDetach(): void {
    this.reset();
  }

  describe(): InfoRow[] {
    return [
      { label: 'Rolle', value: this.services.rollenName },
      { label: 'Lohn', value: `${formatMoney(this.employee.lohn)} / Tag` },
      { label: 'Tempo', value: `${Math.round(this.employee.tempo * 100)} %` },
      { label: 'Gerade', value: this.statusText() },
    ];
  }

  statusText(): string {
    return this.services.text(`status_${this.state}`, { produkt: this.produktName ?? '' });
  }

  private get carton(): CartonComponent {
    return this.task!.carton.require(CartonComponent);
  }

  private startTask(): void {
    const task = this.services.findTask();
    if (!task) { this.wait = 1; return; }
    this.task = task;
    this.carton.reservedBy = this.entity.id;
    this.setTarget(task.carton.object.position, 0.6);
    this.state = 'holt';
    this.notifyChanged();
  }

  private pickUp(): void {
    this.carton.leaveStorage();
    this.setTarget(frontOf(this.task!.shelf), 0);
    this.state = 'bringt';
    this.notifyChanged();
  }

  private finish(): void {
    const { carton, shelf } = this.task!;
    const result = stockFromCarton(carton, shelf);
    if (result.ok && !result.leer) {
      // Rest bleibt übrig (Regal inzwischen voller): Karton neben dem Regal abstellen
      const c = carton.get(CartonComponent);
      if (c) c.reservedBy = null;
      carton.object.position.y = this.entity.object.position.y;
    } else if (!result.ok) {
      carton.require(CartonComponent).reservedBy = null;
      carton.object.position.y = this.entity.object.position.y;
    }
    this.task = null;
    this.state = 'wartet';
    this.wait = 0.5;
    this.notifyChanged();
  }

  /** Aufgabe abbrechen (Karton oder Regal verschwunden, Figur entlassen). */
  private reset(): void {
    if (this.task?.carton.world) {
      const c = this.task.carton.get(CartonComponent);
      if (c && c.reservedBy === this.entity.id) {
        c.reservedBy = null;
        if (!c.ablage) this.task.carton.object.position.y = this.entity.object.position.y;
      }
    }
    this.task = null;
    this.state = 'wartet';
    this.wait = 1;
    this.notifyChanged();
  }

  private taskValid(): boolean {
    return !!this.task && !!this.task.carton.world && !!this.task.shelf.world;
  }

  private setTarget(p: THREE.Vector3, keepDistance: number): void {
    const pos = this.entity.object.position;
    this.target.set(p.x, pos.y, p.z);
    if (keepDistance > 0) {
      const dir = new THREE.Vector3().subVectors(pos, this.target).setY(0);
      if (dir.lengthSq() > 1e-6) this.target.addScaledVector(dir.normalize(), keepDistance);
    }
  }

  private arrived(): boolean {
    const p = this.entity.object.position;
    return Math.hypot(this.target.x - p.x, this.target.z - p.z) < 0.05;
  }

  /** Ein Stück Richtung Ziel gehen; true, wenn angekommen. */
  private walk(dt: number): boolean {
    const p = this.entity.object.position;
    const dx = this.target.x - p.x, dz = this.target.z - p.z;
    const dist = Math.hypot(dx, dz);
    const step = this.services.gehgeschwindigkeit * this.employee.tempo * dt;
    if (dist <= step) { p.x = this.target.x; p.z = this.target.z; return true; }
    p.x += (dx / dist) * step;
    p.z += (dz / dist) * step;
    this.entity.object.rotation.y = Math.atan2(dx, dz);
    return false;
  }

  /** Getragener Karton schwebt vor der Figur. */
  private carry(): void {
    const o = this.entity.object;
    const c = this.task!.carton.object;
    c.position.set(o.position.x + Math.sin(o.rotation.y) * 0.35, o.position.y + 0.75, o.position.z + Math.cos(o.rotation.y) * 0.35);
    c.rotation.y = o.rotation.y;
  }
}

/** Punkt vor der Vorderseite (lokales +X) eines Regals, auf dem Boden. */
export function frontOf(shelf: Entity): THREE.Vector3 {
  const o = shelf.object;
  const dir = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotation.y);
  return o.position.clone().addScaledVector(dir, 0.75);
}
