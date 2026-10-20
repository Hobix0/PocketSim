import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Entity } from '../ecs/Entity';
import type { Employee } from '../economy/Staff';
import type { Describable, InfoRow } from '../ui/describe';
import { CartonComponent } from './CartonComponent';
import { isHaulTask, stockFromCarton, type WorkTask } from '../economy/Stocking';
import { formatMoney } from '../ui/format';
import { PathFollower, type PathFinder } from '../navigation/PathFollower';

// Arbeitsverhalten von Auffüllern und Lageristen als Zustandsmaschine:
//   warten → zum Karton gehen → Karton aufnehmen → zum Regal (bzw. Lagerplatz) gehen → einräumen → warten …
// Welche Aufgabe es gibt, entscheidet findTask: Auffüller räumen in Regale, Lageristen laden LKW ab.
// Läuft in Simulationszeit (steht in der Pause). Wege kommen aus der Wegfindung (findPath);
// ohne sie (z. B. in Tests) wird direkt hingelaufen.

export type WorkerState = 'wartet' | 'holt' | 'bringt' | 'raeumt';

export interface WorkerServices {
  findTask(): WorkTask | null;
  findPath?: PathFinder;
  gehgeschwindigkeit: number;
  sekundenProStueck: number;
  /** Anzeigename der Rolle, z. B. "Auffüller" */
  rollenName: string;
  /** Text aus data/texte/standard.json */
  text(key: string, werte?: Record<string, string | number>): string;
}

export class WorkerComponent extends Component implements Describable {
  state: WorkerState = 'wartet';
  private task: WorkTask | null = null;
  private wait = 0;
  private stockTimer = 0;
  private readonly path = new PathFollower();

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
          // Einlagern geht schnell, Einräumen dauert je Stück
          const t = this.task!;
          this.stockTimer = (isHaulTask(t) ? 2 : this.carton.menge * this.services.sekundenProStueck) / this.employee.tempo;
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
    const lager = this.task && isHaulTask(this.task) && (this.state === 'bringt' || this.state === 'raeumt');
    return this.services.text(lager ? 'status_lagert' : `status_${this.state}`, { produkt: this.produktName ?? '' });
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
    const t = this.task!;
    if (isHaulTask(t)) this.setTarget(t.ziel, 0.6);
    else this.setTarget(frontOf(t.shelf), 0);
    this.state = 'bringt';
    this.notifyChanged();
  }

  private finish(): void {
    const t = this.task!;
    if (isHaulTask(t)) {
      // Platz war reserviert: Karton hinstellen
      const c = t.carton.require(CartonComponent);
      t.carton.object.position.copy(t.ziel);
      t.carton.object.rotation.y = t.ablage.entity.object.rotation.y;
      c.ablage = t.ablage;
      c.reservedBy = null;
      this.task = null;
      this.state = 'wartet';
      this.wait = 0.3;
      this.notifyChanged();
      return;
    }
    const { carton, shelf } = t;
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
    // Reservierten Lagerplatz wieder freigeben
    if (this.task && isHaulTask(this.task) && this.task.carton.get(CartonComponent)?.ablage !== this.task.ablage) {
      this.task.ablage.release(this.task.carton.id);
    }
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
    const t = this.task;
    if (!t || !t.carton.world) return false;
    return isHaulTask(t) ? !!t.ablage.entity.world : !!t.shelf.world;
  }

  private setTarget(p: THREE.Vector3, keepDistance: number): void {
    const pos = this.entity.object.position;
    const target = new THREE.Vector3(p.x, pos.y, p.z);
    if (keepDistance > 0) {
      const dir = new THREE.Vector3().subVectors(pos, target).setY(0);
      if (dir.lengthSq() > 1e-6) target.addScaledVector(dir.normalize(), keepDistance);
    }
    this.path.goTo(this.entity.object, target, this.services.findPath);
  }

  private arrived(): boolean {
    return this.path.done;
  }

  /** Ein Stück den Weg entlang gehen; true, wenn angekommen. */
  private walk(dt: number): boolean {
    return this.path.step(this.entity.object, this.services.gehgeschwindigkeit * this.employee.tempo, dt);
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
