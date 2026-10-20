import * as THREE from 'three';
import { InteractableComponent, type InteractionOption } from '../interaction/InteractableComponent';
import type { CheckoutDef } from '../content/definitions';
import type { Entity } from '../ecs/Entity';
import type { Describable, InfoRow } from '../ui/describe';

// Kasse mit Warteschlange.
// Kunden reihen sich ein (join) und laufen zu ihrem Platz (spot). Wer vorne steht und
// angekommen ist, wird kassiert: vom Kassierer (wenn einer die Kasse besetzt) oder vom
// Spieler per Klick ("Kassieren"). Das eigentliche Bezahlen erledigt das Spiel (serve).

export interface CheckoutServices {
  /** Den vordersten Kunden abrechnen; byHand = der Spieler hat geklickt. */
  serve(checkout: Entity, byHand: boolean): void;
  /** Ist dieser Kunde fertig zum Bezahlen (steht vorne und ist angekommen)? */
  isReady(customer: Entity): boolean;
  /** Name einer Person (für die Info-Anzeige) */
  nameOf(e: Entity): string;
}

export class CheckoutComponent extends InteractableComponent implements Describable {
  override readonly kontext = 'kasse';
  readonly queue: Entity[] = [];
  /** Angestellte Person, die gerade an dieser Kasse arbeitet */
  cashier: Entity | null = null;

  constructor(readonly def: CheckoutDef, private readonly services?: CheckoutServices) {
    super();
  }

  join(customer: Entity): number {
    if (!this.queue.includes(customer)) {
      this.queue.push(customer);
      this.notifyChanged();
    }
    return this.queue.indexOf(customer);
  }

  leave(customer: Entity): void {
    const i = this.queue.indexOf(customer);
    if (i < 0) return;
    this.queue.splice(i, 1);
    this.notifyChanged();
  }

  indexOf(customer: Entity): number {
    return this.queue.indexOf(customer);
  }

  get front(): Entity | null {
    return this.queue[0] ?? null;
  }

  /** Platz in der Warteschlange (0 = vorne) in Weltkoordinaten. */
  spot(i: number): THREE.Vector3 {
    const [kx, kz] = this.def.kunde, [rx, rz] = this.def.richtung;
    const len = Math.hypot(rx, rz) || 1;
    return this.toWorld(kx + (rx / len) * this.def.abstand * i, kz + (rz / len) * this.def.abstand * i);
  }

  /** Wo das Personal steht. */
  cashierSpot(): THREE.Vector3 {
    return this.toWorld(this.def.personal[0], this.def.personal[1]);
  }

  /** Blickrichtung des Personals: zur Kundenseite. */
  cashierFacing(): number {
    const a = this.cashierSpot(), b = this.spot(0);
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  options(): InteractionOption[] {
    const front = this.front;
    if (!front || this.cashier || !this.services?.isReady(front)) return [];
    return [{ aktion: 'auswaehlen', text: 'kassieren', prioritaet: 10, run: () => this.services?.serve(this.entity, true) }];
  }

  describe(): InfoRow[] {
    return [
      { label: 'Warteschlange', value: this.queue.length ? `${this.queue.length} Kunde${this.queue.length === 1 ? '' : 'n'}` : 'leer' },
      { label: 'Personal', value: this.cashier ? this.services?.nameOf(this.cashier) ?? 'besetzt' : 'niemand (du kassierst)' },
    ];
  }

  private toWorld(x: number, z: number): THREE.Vector3 {
    const o = this.entity.object;
    const v = new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotation.y);
    return v.add(o.position);
  }
}
