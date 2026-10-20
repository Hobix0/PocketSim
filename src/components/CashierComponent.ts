import { Component } from '../ecs/Component';
import type { Entity } from '../ecs/Entity';
import type { Employee } from '../economy/Staff';
import type { Describable, InfoRow } from '../ui/describe';
import { CheckoutComponent } from './CheckoutComponent';
import { CustomerComponent } from './CustomerComponent';
import { PathFollower, turnTowards, type PathFinder } from '../navigation/PathFollower';
import { formatMoney } from '../ui/format';

// Arbeitsverhalten eines Kassierers:
//   sucht_kasse → geht_zur_kasse → wartet_kasse ⇄ kassiert
// Eine Kasse gehört immer nur einer Person. Kassiert wird umso schneller, je höher das Tempo.

export type CashierState = 'sucht_kasse' | 'geht_zur_kasse' | 'wartet_kasse' | 'kassiert';

export interface CashierServices {
  /** Freie Kasse (ohne Personal) suchen */
  findCheckout(): Entity | null;
  findPath?: PathFinder;
  /** Den vordersten Kunden abrechnen */
  serve(checkout: Entity): void;
  gehgeschwindigkeit: number;
  sekundenProArtikel: number;
  rollenName: string;
  text(key: string, werte?: Record<string, string | number>): string;
}

export class CashierComponent extends Component implements Describable {
  state: CashierState = 'sucht_kasse';
  private checkout: Entity | null = null;
  private wait = 0;
  private timer = 0;
  private serving: Entity | null = null;
  private readonly path = new PathFollower();

  constructor(readonly employee: Employee, private readonly services: CashierServices) {
    super();
  }

  override update(dt: number): void {
    if (dt <= 0) return;
    if (this.state !== 'sucht_kasse' && !this.checkout?.world) { this.release(); return; }
    const c = this.checkout?.get(CheckoutComponent);
    switch (this.state) {
      case 'sucht_kasse':
        this.wait -= dt;
        if (this.wait <= 0) this.claim();
        break;
      case 'geht_zur_kasse':
        if (this.path.step(this.entity.object, this.services.gehgeschwindigkeit * this.employee.tempo, dt)) this.setState('wartet_kasse');
        break;
      case 'wartet_kasse': {
        turnTowards(this.entity.object, c!.cashierFacing(), dt);
        const front = c!.front;
        const customer = front?.get(CustomerComponent);
        if (front && customer?.isReady) {
          this.serving = front;
          this.timer = Math.max(1, customer.artikel) * this.services.sekundenProArtikel / this.employee.tempo;
          this.setState('kassiert');
        }
        break;
      }
      case 'kassiert':
        if (c!.front !== this.serving || !this.serving?.get(CustomerComponent)?.isReady) { this.setState('wartet_kasse'); return; }
        this.timer -= dt;
        if (this.timer <= 0) {
          this.services.serve(this.checkout!);
          this.serving = null;
          this.setState('wartet_kasse');
        }
        break;
    }
  }

  override onDetach(): void {
    this.release();
  }

  statusText(): string {
    return this.services.text(`status_${this.state}`);
  }

  describe(): InfoRow[] {
    return [
      { label: 'Rolle', value: this.services.rollenName },
      { label: 'Lohn', value: `${formatMoney(this.employee.lohn)} / Tag` },
      { label: 'Tempo', value: `${Math.round(this.employee.tempo * 100)} %` },
      { label: 'Gerade', value: this.statusText() },
    ];
  }

  private claim(): void {
    const checkout = this.services.findCheckout();
    if (!checkout) { this.wait = 1; return; }
    const c = checkout.require(CheckoutComponent);
    c.cashier = this.entity;
    this.checkout = checkout;
    this.path.goTo(this.entity.object, c.cashierSpot(), this.services.findPath);
    this.setState('geht_zur_kasse');
  }

  /** Kasse freigeben (Kasse abgerissen, Person entlassen). */
  private release(): void {
    const c = this.checkout?.get(CheckoutComponent);
    if (c && c.cashier === this.entity) c.cashier = null;
    this.checkout = null;
    this.serving = null;
    this.wait = 1;
    if (this.state !== 'sucht_kasse') this.setState('sucht_kasse');
  }

  private setState(s: CashierState): void {
    this.state = s;
    this.notifyChanged();
  }
}
