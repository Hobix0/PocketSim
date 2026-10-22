import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Entity } from '../ecs/Entity';
import type { Describable, InfoRow } from '../ui/describe';
import { StorageSurfaceComponent } from './StorageSurfaceComponent';
import { PalletPlacesComponent } from './PalletPlacesComponent';
import type { ShipmentLine } from '../economy/Deliveries';
import { LampComponent } from './LampComponent';

// Ein Liefer-LKW: fährt eine Strecke ab, steht zum Abladen und fährt wieder weg.
// Die Kartons stehen nach der Ankunft auf seiner Ladefläche (StorageSurfaceComponent, temporaer).
// Vorne ist +X (wie bei allen Modellen). Läuft in Simulationszeit; was beim Ankommen und
// Abfahren passiert, entscheidet die Flotte (TruckFleet).

export type TruckState = 'anfahrt' | 'steht' | 'abfahrt';

/** Geometrie der Ladebordwand (einmal für alle LKW) */
let lift: { plate: THREE.BoxGeometry; post: THREE.BoxGeometry; metal: THREE.Material; stripe: THREE.Material } | null = null;

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
  /** Steht an einer abgesenkten Rampe (Ladefläche bündig mit dem Boden – keine Ladebordwand nötig) */
  abgesenkt = false;
  /** Spielminuten, die der LKW noch aufs Abladen wartet */
  wartet = 0;
  private route: RoutePoint[];
  private leg = 0;
  private lift: THREE.Group | null = null;

  constructor(
    /** Kartons, die er bringt (werden bei Ankunft auf die Ladefläche gestellt) */
    readonly ladung: ShipmentLine[],
    anfahrt: RoutePoint[],
    private readonly abfahrt: RoutePoint[],
    private readonly speed: number,
    /** Wo er steht: eine Laderampe oder null (Straße) */
    readonly dock: Entity | null,
    private readonly services: TruckServices,
    /** Länge des LKW (für die Ladebordwand am Heck) */
    private readonly laenge = 7,
  ) {
    super();
    this.route = anfahrt;
  }

  get ladeflaeche(): StorageSurfaceComponent {
    return this.entity.require(StorageSurfaceComponent);
  }

  /** Kartons (lose) und Paletten, die noch auf der Ladefläche stehen */
  get kartons(): number {
    return this.state === 'anfahrt' ? this.ladung.length : this.ladeflaeche.used + this.paletten;
  }

  /** Paletten auf der Ladefläche */
  get paletten(): number {
    return this.state === 'anfahrt' ? this.ladung.filter((l) => (l.palette ?? 0) > 0).length : this.entity.get(PalletPlacesComponent)?.used ?? 0;
  }

  depart(): void {
    if (this.state !== 'steht') return;
    this.setLift(false);
    this.state = 'abfahrt';
    this.route = this.abfahrt;
    this.leg = 0;
    this.notifyChanged();
  }

  override update(dt: number): void {
    // Warnblinker beim Stehen und beim Rückwärtsfahren
    const lamp = this.entity.get(LampComponent);
    if (lamp) lamp.blinken = this.state === 'steht' || !!this.route[this.leg]?.rueckwaerts;
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
        // Neigung an Schrägen: Front hoch, wenn es (in Blickrichtung) bergauf geht
        const flach = Math.hypot(d.x, d.z);
        const pitch = flach > 1e-4 ? Math.atan2(d.y, flach) * (target.rueckwaerts ? -1 : 1) : 0;
        o.rotation.z += (pitch - o.rotation.z) * Math.min(1, dt * 8);
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
        o.rotation.z = 0;
        if (!this.abgesenkt) this.setLift(true);
        this.services.arrived(this);
        this.notifyChanged();
      } else this.services.left(this);
    }
  }

  /** Ladebordwand: heruntergeklappt liegt sie ebenerdig hinter dem Heck (so wird am Tor ohne Rampe entladen) */
  private setLift(down: boolean): void {
    if (this.lift) { this.entity.object.remove(this.lift); this.lift = null; }
    if (!down) return;
    lift ??= {
      plate: new THREE.BoxGeometry(1.1, 0.06, 2.2),
      post: new THREE.BoxGeometry(0.08, 1.2, 0.08),
      metal: new THREE.MeshStandardMaterial({ color: '#9aa1a6', roughness: 0.6, metalness: 0.3 }),
      stripe: new THREE.MeshStandardMaterial({ color: '#e6b929', roughness: 0.7 }),
    };
    const g = new THREE.Group();
    const plate = new THREE.Mesh(lift.plate, lift.metal);
    plate.position.set(-this.laenge / 2 - 0.55, 0.04, 0);
    plate.receiveShadow = true;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 2.2), lift.stripe);
    edge.position.set(-this.laenge / 2 - 1.08, 0.045, 0);
    g.add(plate, edge);
    for (const z of [-1.05, 1.05]) {
      const post = new THREE.Mesh(lift.post, lift.metal);
      post.position.set(-this.laenge / 2 - 0.05, 0.6, z);
      g.add(post);
    }
    this.lift = g;
    this.entity.object.add(g);
  }

  describe(): InfoRow[] {
    const t = this.services.text;
    const rows: InfoRow[] = [{ label: t('lkw_ladung'), value: `${this.kartons} Kartons` }];
    if (this.state === 'steht') rows.push({ label: t('lkw_wartet'), value: `${Math.max(0, Math.ceil(this.wartet))} min` });
    else rows.push({ label: t('lkw_status'), value: t(this.state === 'anfahrt' ? 'lkw_kommt' : 'lkw_faehrt') });
    return rows;
  }
}
