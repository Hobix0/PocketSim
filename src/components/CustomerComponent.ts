import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Entity } from '../ecs/Entity';
import type { CustomerSettings, ProductDef } from '../content/definitions';
import type { Describable, InfoRow } from '../ui/describe';
import type { Wish } from '../economy/Customers';
import type { VisitOutcome } from '../economy/StoreStats';
import { basketTotal } from '../economy/StoreStats';
import { ShelfComponent } from './ShelfComponent';
import { CheckoutComponent } from './CheckoutComponent';
import { frontOf } from './WorkerComponent';
import { PathFollower, turnTowards, type PathFinder } from '../navigation/PathFollower';
import { formatMoney } from '../ui/format';

// Ein Kunde als Zustandsmaschine:
//   sucht (geht zum Regal) → greift → … nächster Wunsch … → zur_kasse → wartet → an_kasse → geht
// Fehlt ein Produkt, wird es gemerkt (Tagesbericht, Ruf). Ohne Kasse oder nach zu langem Warten
// legt der Kunde die Ware zurück und geht. Bezahlt wird über das Spiel (paid()).

export type CustomerState = 'sucht' | 'greift' | 'zur_kasse' | 'wartet' | 'an_kasse' | 'geht';

export interface CustomerServices {
  findPath?: PathFinder;
  /** Regal, in dem das Produkt gerade liegt (das nächstgelegene), außer `exclude` */
  findShelf(produkt: ProductDef, from: THREE.Vector3, exclude?: Entity): Entity | null;
  /** Kasse mit der kürzesten Schlange */
  findCheckout(): Entity | null;
  /** Wohin der Kunde am Ende geht (dort verschwindet er) */
  exitPoint(): THREE.Vector3;
  settings: CustomerSettings;
  /** Gehgeschwindigkeit dieses Kunden in m/s */
  speed: number;
  text(key: string, werte?: Record<string, string | number>): string;
  /** Aktueller Verkaufspreis */
  priceOf(produkt: ProductDef): number;
  /** Kauft der Kunde zu diesem Preis? (Zufall nach Preisempfinden) */
  willBuy(produkt: ProductDef): boolean;
  /** Ist das ein Schnäppchen? */
  isBargain(produkt: ProductDef): boolean;
  /** Der Besuch ist entschieden (für Ruf und Tagesbericht) */
  left(outcome: VisitOutcome, fehlend: ProductDef[], zuTeuer: ProductDef[], schnaeppchen: number): void;
}

export interface BasketLine {
  produkt: ProductDef;
  menge: number;
  /** Aus welchem Regal (zum Zurücklegen) */
  regal: Entity;
  /** Preis beim Griff ins Regal */
  preis: number;
}

// Einkaufskorb in der Hand (eine Geometrie für alle)
let basketGeo: THREE.BoxGeometry | null = null;
let basketMat: THREE.MeshStandardMaterial | null = null;

export class CustomerComponent extends Component implements Describable {
  state: CustomerState = 'sucht';
  readonly basket: BasketLine[] = [];
  private current: Wish | null = null;
  private shelf: Entity | null = null;
  private checkout: Entity | null = null;
  private slot = -1;
  private timer = 0;
  private waited = 0;
  private readonly path = new PathFollower();
  private basketMesh: THREE.Mesh | null = null;

  constructor(readonly wishes: Wish[], private readonly services: CustomerServices) {
    super();
  }

  /** Steht vorne an der Kasse und kann bezahlen. */
  get isReady(): boolean {
    return this.state === 'an_kasse';
  }

  get artikel(): number {
    return this.basket.reduce((n, l) => n + l.menge, 0);
  }

  override onAttach(): void {
    this.nextWish();
  }

  override onDetach(): void {
    this.checkout?.get(CheckoutComponent)?.leave(this.entity);
    this.checkout = null;
    if (this.basketMesh) this.entity.object.remove(this.basketMesh);
  }

  override update(dt: number): void {
    if (dt <= 0) return;
    const s = this.services.settings;
    switch (this.state) {
      case 'sucht':
        if (!this.shelf?.world) { this.retryWish(); return; }
        if (this.walk(dt)) {
          this.state = 'greift';
          this.timer = s.sekundenProGriff * (this.current?.menge ?? 1);
          this.notifyChanged();
        }
        break;
      case 'greift':
        if (this.shelf?.world) this.face(this.shelf.object.position, dt);
        this.timer -= dt;
        if (this.timer <= 0) this.take();
        break;
      case 'zur_kasse':
      case 'wartet':
      case 'an_kasse': {
        const c = this.checkout?.get(CheckoutComponent);
        if (!this.checkout?.world || !c) { this.goToCheckout(); return; }
        this.waited += dt;
        if (this.waited > s.geduld) { this.giveUp('zu_lange'); return; }
        const i = c.indexOf(this.entity);
        if (i < 0) { this.goToCheckout(); return; }
        if (i !== this.slot) {
          this.slot = i;
          this.path.goTo(this.entity.object, c.spot(i), this.services.findPath);
          if (this.state === 'an_kasse') this.setState('wartet');
        }
        if (this.walk(dt)) {
          this.face(c.cashierSpot(), dt);
          const next: CustomerState = i === 0 ? 'an_kasse' : 'wartet';
          if (next !== this.state) this.setState(next);
        }
        break;
      }
      case 'geht':
        if (this.walk(dt)) this.entity.world?.remove(this.entity);
        break;
    }
  }

  /** Das Spiel hat abgerechnet. */
  paid(): void {
    this.checkout?.get(CheckoutComponent)?.leave(this.entity);
    this.checkout = null;
    this.basket.length = 0;
    this.renderBasket();
    this.leave('zufrieden');
  }

  statusText(): string {
    const produkt = this.current?.produkt.name ?? '';
    return this.services.text(`kunde_status_${this.state}`, { produkt });
  }

  describe(): InfoRow[] {
    const rows: InfoRow[] = [{ label: 'Gerade', value: this.statusText() }];
    for (const w of this.wishes) {
      const mark = w.status === 'gefunden' ? `✓ ${w.genommen}×` : w.status === 'fehlt' ? '✗ fehlt' : w.status === 'zu_teuer' ? '✗ zu teuer' : `${w.menge}× gesucht`;
      rows.push({ label: w.produkt.name, value: mark });
    }
    if (this.basket.length) rows.push({ label: 'Im Korb', value: `${this.artikel} Artikel · ${formatMoney(basketTotal(this.basket))}` });
    if (this.checkout) rows.push({ label: 'Geduld', value: `${Math.max(0, Math.round(this.services.settings.geduld - this.waited))} s` });
    return rows;
  }

  // ── Ablauf ──────────────────────────────────────────────────────

  private nextWish(): void {
    for (const w of this.wishes) {
      if (w.status !== 'offen') continue;
      const shelf = this.services.findShelf(w.produkt, this.entity.object.position);
      if (shelf) { this.goToShelf(w, shelf); return; }
      w.status = 'fehlt';
    }
    this.current = null;
    if (this.basket.length) this.goToCheckout();
    else this.leave('ohne_einkauf');
  }

  /** Das Regal ist weg oder leer: anderes Regal mit dem Produkt suchen, sonst fehlt es. */
  private retryWish(): void {
    const w = this.current;
    if (!w) { this.nextWish(); return; }
    const other = this.services.findShelf(w.produkt, this.entity.object.position, this.shelf ?? undefined);
    if (other) this.goToShelf(w, other);
    else { w.status = 'fehlt'; this.nextWish(); }
  }

  private goToShelf(w: Wish, shelf: Entity): void {
    this.current = w;
    this.shelf = shelf;
    // Nicht alle auf denselben Punkt: etwas seitlich entlang des Regals
    const s = shelf.get(ShelfComponent);
    const spread = (s?.def.laenge ?? 1) * 0.6 * (Math.random() - 0.5);
    const side = new THREE.Vector3(0, 0, spread).applyAxisAngle(new THREE.Vector3(0, 1, 0), shelf.object.rotation.y);
    this.path.goTo(this.entity.object, frontOf(shelf).add(side), this.services.findPath);
    this.setState('sucht');
  }

  private take(): void {
    const w = this.current!;
    const shelf = this.shelf;
    // Steht da, aber zu teuer: nicht kaufen
    if (shelf?.world && !this.services.willBuy(w.produkt)) {
      w.status = 'zu_teuer';
      this.nextWish();
      return;
    }
    const n = shelf?.world ? shelf.get(ShelfComponent)?.take(w.produkt.id, w.menge) ?? 0 : 0;
    if (n > 0 && shelf) {
      w.genommen = n;
      w.status = 'gefunden';
      this.basket.push({ produkt: w.produkt, menge: n, regal: shelf, preis: this.services.priceOf(w.produkt) });
      this.renderBasket();
      this.nextWish();
    } else {
      this.retryWish();
    }
  }

  private goToCheckout(): void {
    const checkout = this.services.findCheckout();
    if (!checkout) { this.putBack(); this.leave('keine_kasse'); return; }
    this.checkout = checkout;
    const c = checkout.require(CheckoutComponent);
    this.slot = c.join(this.entity);
    this.path.goTo(this.entity.object, c.spot(this.slot), this.services.findPath);
    this.setState('zur_kasse');
  }

  private giveUp(outcome: VisitOutcome): void {
    this.checkout?.get(CheckoutComponent)?.leave(this.entity);
    this.checkout = null;
    this.putBack();
    this.leave(outcome);
  }

  private leave(outcome: VisitOutcome): void {
    const bought = outcome === 'zufrieden' ? this.wishes.filter((w) => w.status === 'gefunden') : [];
    this.services.left(
      outcome,
      this.wishes.filter((w) => w.status === 'fehlt').map((w) => w.produkt),
      this.wishes.filter((w) => w.status === 'zu_teuer').map((w) => w.produkt),
      bought.filter((w) => this.services.isBargain(w.produkt)).length,
    );
    this.path.goTo(this.entity.object, this.services.exitPoint(), this.services.findPath);
    this.setState('geht');
  }

  /** Ware zurück in die Regale (soweit noch da und Platz ist). */
  private putBack(): void {
    for (const l of this.basket) if (l.regal.world) l.regal.get(ShelfComponent)?.add(l.produkt, l.menge);
    this.basket.length = 0;
    this.renderBasket();
  }

  private setState(s: CustomerState): void {
    this.state = s;
    this.notifyChanged();
  }

  private walk(dt: number): boolean {
    return this.path.step(this.entity.object, this.services.speed, dt);
  }

  private face(p: THREE.Vector3, dt: number): void {
    const o = this.entity.object.position;
    turnTowards(this.entity.object, Math.atan2(p.x - o.x, p.z - o.z), dt);
  }

  private renderBasket(): void {
    const show = this.basket.length > 0;
    if (show && !this.basketMesh) {
      basketGeo ??= new THREE.BoxGeometry(0.28, 0.16, 0.2);
      basketMat ??= new THREE.MeshStandardMaterial({ color: '#c8382f', roughness: 0.7 });
      this.basketMesh = new THREE.Mesh(basketGeo, basketMat);
      this.basketMesh.position.set(0.3, 0.72, 0.05);
      this.basketMesh.castShadow = true;
      this.entity.object.add(this.basketMesh);
    }
    if (this.basketMesh) this.basketMesh.visible = show;
  }
}
