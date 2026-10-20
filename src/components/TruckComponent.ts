import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Entity } from '../ecs/Entity';
import type { Describable, InfoRow } from '../ui/describe';
import { StorageSurfaceComponent } from './StorageSurfaceComponent';

// Ein Liefer-LKW: fährt eine Strecke ab, steht zum Abladen und fährt wieder weg.
// Die Kartons stehen nach der Ankunft auf seiner Ladefläche (StorageSurfaceComponent, temporaer).
// Vorne ist +X (wie bei allen Modellen). Läuft in Simulationszeit; was beim Ankommen und
// Abfahren passiert, entscheidet die Flotte (TruckFleet).

export type TruckState = 'anfahrt' | 'steht' | 'abfahrt';

/** Wie schnell der LKW einlenkt (rad pro Sekunde) */
const TURN_RATE = 1.6;

/** Punkt der Strecke; `rueckwaerts`: dieses Stück wird rückwärts gefahren (z. B. an die Rampe) */
export interface RoutePoint {
  p: THREE.Vector3;
  rueckwaerts?: boolean;
}

export interface TruckServices {
  arrived(truck: TruckComponent): void;
  left(truck: TruckComponent): void;
  text(key: string, werte?: Record<string, string | number>): string;
}

export class TruckComponent extends Component implements Describable {
  state: TruckState = 'anfahrt';
  /** Spielminuten, die der LKW noch aufs Abladen wartet */
  wartet = 0;
  private route: RoutePoint[];
  private leg = 0;

  constructor(
    /** Kartons, die er bringt (werden bei Ankunft auf die Ladefläche gestellt) */
    readonly ladung: { produkt: string; menge: number }[],
    anfahrt: RoutePoint[],
    private readonly abfahrt: RoutePoint[],
    private readonly speed: number,
    /** Wo er steht: eine Laderampe oder null (Straße) */
    readonly dock: Entity | null,
    private readonly services: TruckServices,
  ) {
    super();
    this.route = anfahrt;
  }

  get ladeflaeche(): StorageSurfaceComponent {
    return this.entity.require(StorageSurfaceComponent);
  }

  /** Kartons, die noch auf der Ladefläche stehen */
  get kartons(): number {
    return this.state === 'anfahrt' ? this.ladung.length : this.ladeflaeche.used;
  }

  depart(): void {
    if (this.state !== 'steht') return;
    this.state = 'abfahrt';
    this.route = this.abfahrt;
    this.leg = 0;
    this.notifyChanged();
  }

  override update(dt: number): void {
    if (dt <= 0 || this.state === 'steht') return;
    const o = this.entity.object;
    let rest = this.speed * dt;
    while (rest > 0 && this.leg < this.route.length) {
      const target = this.route[this.leg];
      const d = new THREE.Vector3().subVectors(target.p, o.position);
      const len = d.length();
      if (len > 1e-4) {
        // Fahrtrichtung: Front (+X) zeigt in Fahrtrichtung, beim Rückwärtsfahren entgegen – weich eingedreht
        const dir = target.rueckwaerts ? d.clone().negate() : d;
        const goal = Math.atan2(-dir.z, dir.x);
        const diff = Math.atan2(Math.sin(goal - o.rotation.y), Math.cos(goal - o.rotation.y));
        const turn = TURN_RATE * dt;
        o.rotation.y += Math.abs(diff) <= turn ? diff : Math.sign(diff) * turn;
      }
      if (len <= rest) {
        o.position.copy(target.p);
        rest -= len;
        this.leg++;
      } else {
        o.position.addScaledVector(d, rest / len);
        rest = 0;
      }
    }
    if (this.leg >= this.route.length) {
      if (this.state === 'anfahrt') {
        const last = this.route[this.route.length - 1], prev = this.route[this.route.length - 2];
        if (prev) {
          const d = new THREE.Vector3().subVectors(last.p, prev.p);
          if (last.rueckwaerts) d.negate();
          o.rotation.y = Math.atan2(-d.z, d.x);
        }
        this.state = 'steht';
        this.services.arrived(this);
        this.notifyChanged();
      } else this.services.left(this);
    }
  }

  describe(): InfoRow[] {
    const t = this.services.text;
    const rows: InfoRow[] = [{ label: t('lkw_ladung'), value: `${this.kartons} Kartons` }];
    if (this.state === 'steht') rows.push({ label: t('lkw_wartet'), value: `${Math.max(0, Math.ceil(this.wartet))} min` });
    else rows.push({ label: t('lkw_status'), value: t(this.state === 'anfahrt' ? 'lkw_kommt' : 'lkw_faehrt') });
    return rows;
  }
}
