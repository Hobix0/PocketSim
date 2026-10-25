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
import type { ModelProvider } from '../assets/ModelLibrary';
import { CartStationComponent } from './CartStationComponent';
import { SeatComponent } from './SeatComponent';
import { FittingRoomComponent } from './FittingRoomComponent';

// Ein Kunde als Zustandsmaschine:
//   [holt_wagen] → sucht (geht zum Regal) → greift → … nächster Wunsch … → zur_kasse → wartet → an_kasse
//   → packt (ein) → [bringt_wagen] → geht
// Wer viel kaufen will, holt sich einen leeren Einkaufswagen aus einer Wagenbox; die Ware liegt sichtbar darin,
// an der Kasse auf dem Band, danach wird eingepackt und der Wagen zurückgebracht.
// Fehlt ein Produkt, wird es gemerkt (Tagesbericht, Ruf). Ohne Kasse oder nach zu langem Warten
// legt der Kunde die Ware zurück und geht. Bezahlt wird über das Spiel (paid()).

export type CustomerState = 'holt_wagen' | 'sucht' | 'greift' | 'zur_kasse' | 'wartet' | 'an_kasse' | 'packt' | 'bringt_wagen' | 'zum_platz' | 'sitzt' | 'zur_kabine' | 'probiert' | 'geht';

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
  /** Nächste Wagenbox mit freiem Wagen (oder null) */
  findCartStation?(from: THREE.Vector3): Entity | null;
  /** Einkaufswagen und Einpacken (aus data/kunden); ohne: Korb in der Hand, kein Einpacken */
  einkaufswagen?: { model: string; abArtikel: number; packSekundenProArtikel: number };
  /** Modelle für Wagen und Ware darin (fehlt in Tests) */
  models?: ModelProvider;
  /** Der Besuch ist entschieden (für Ruf und Tagesbericht) */
  left(outcome: VisitOutcome, fehlend: ProductDef[], zuTeuer: ProductDef[], schnaeppchen: number): void;
  /** Der Kunde denkt etwas (für Gedankenblasen): fehlt, zu teuer, Schnäppchen, glücklich (alles gefunden) */
  denkt?(art: 'fehlt' | 'zu_teuer' | 'schnaeppchen' | 'gluecklich' | 'gemuetlich' | 'anprobiert' | 'passt_nicht', produkt?: ProductDef): void;
  /** Nächster Tisch mit freiem Sitzplatz (Café); ohne: niemand setzt sich */
  findSeat?(from: THREE.Vector3): Entity | null;
  /** Nächste Bedientheke (Café-Tresen), an der es das Produkt gibt; ohne: keine Bedienung */
  findCounter?(produkt: ProductDef, from: THREE.Vector3): Entity | null;
  /** Nächste freie Umkleidekabine (Mode); ohne: niemand probiert an */
  findFittingRoom?(from: THREE.Vector3): Entity | null;
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
  /** Wagenbox, aus der der Wagen kommt; Wagen und Ware darin */
  private station: Entity | null = null;
  private cart: THREE.Group | null = null;
  private items: THREE.Group | null = null;
  /** Was eingepackt wird (nach dem Bezahlen) */
  private packing: BasketLine[] = [];
  private packTotal = 0;
  /** Sitzplatz im Café (Tisch und Platz) und wie weit das Hinsetzen ist */
  private seat: { table: Entity; index: number } | null = null;
  private sitIn = 0;
  /** Umkleide, in der der Kunde anprobiert; ob er es schon versucht hat */
  private room: Entity | null = null;
  private anprobiert = false;

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
    // Großer Einkauf: erst einen Wagen holen (wenn eine Wagenbox einen frei hat)
    const w = this.services.einkaufswagen;
    const geplant = this.wishes.reduce((n, x) => n + x.menge, 0);
    const station = w && geplant >= w.abArtikel ? this.services.findCartStation?.(this.entity.object.position) ?? null : null;
    if (station) {
      this.station = station;
      this.path.goTo(this.entity.object, station.require(CartStationComponent).pickupSpot(), this.services.findPath);
      this.setState('holt_wagen');
      return;
    }
    this.nextWish();
  }

  override onDetach(): void {
    this.seat?.table.get(SeatComponent)?.release(this.entity);
    this.room?.get(FittingRoomComponent)?.release(this.entity);
    this.checkout?.get(CheckoutComponent)?.leave(this.entity);
    this.checkout = null;
    if (this.basketMesh) this.entity.object.remove(this.basketMesh);
    // Wagen, die ein Kunde beim Verschwinden noch hat, kommen zurück in die Box
    if (this.cart) this.station?.get(CartStationComponent)?.give();
  }

  /** Schiebt einen Einkaufswagen */
  get hasCart(): boolean {
    return this.cart !== null;
  }

  override update(dt: number): void {
    if (dt <= 0) return;
    const s = this.services.settings;
    switch (this.state) {
      case 'holt_wagen': {
        const st = this.station?.get(CartStationComponent);
        if (!this.station?.world || !st) { this.station = null; this.nextWish(); return; }
        if (this.walk(dt)) {
          if (st.take()) this.attachCart(); else this.station = null;
          this.nextWish();
        }
        break;
      }
      case 'packt':
        // erst zum Packplatz hinter der Kasse, dann einpacken
        if (!this.walk(dt)) break;
        this.timer -= dt;
        // Stück für Stück wandert die Ware wieder in den Wagen bzw. die Tasche
        this.renderItems(this.packing, Math.round((1 - Math.max(0, this.timer) / this.packTotal) * countOf(this.packing)));
        if (this.timer <= 0) { this.packing = []; this.renderItems([]); this.leave('zufrieden'); }
        break;
      case 'bringt_wagen':
        if (this.walk(dt)) {
          this.station?.get(CartStationComponent)?.give();
          this.detachCart();
          this.path.goTo(this.entity.object, this.services.exitPoint(), this.services.findPath);
          this.setState('geht');
        }
        break;
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
        if (!this.checkout?.world || !c) { this.checkout = null; this.nextWishOrCheckout(); return; }
        this.waited += dt;
        if (this.waited > s.geduld) { this.giveUp('zu_lange'); return; }
        const i = c.indexOf(this.entity);
        if (i < 0) { this.goToCheckout(this.checkout ?? undefined); return; }
        if (i !== this.slot) {
          this.slot = i;
          this.path.goTo(this.entity.object, c.spot(i), this.services.findPath);
          if (this.state === 'an_kasse') this.setState('wartet');
        }
        if (this.walk(dt)) {
          this.face(c.cashierSpot(), dt);
          const next: CustomerState = i === 0 ? 'an_kasse' : 'wartet';
          if (next !== this.state) {
            this.setState(next);
            // Vorne an der Kasse liegt die Ware auf dem Band, nicht mehr im Wagen
            this.renderItems(next === 'an_kasse' ? [] : this.basket);
          }
        }
        break;
      }
      case 'zum_platz': {
        const st = this.seat?.table.get(SeatComponent);
        if (!this.seat?.table.world || !st) { this.standUp(); return; }
        if (this.walk(dt)) { this.sitIn = 0; this.timer = this.sitSeconds(); this.setState('sitzt'); }
        break;
      }
      case 'sitzt': {
        const st = this.seat?.table.get(SeatComponent);
        if (!this.seat?.table.world || !st) { this.standUp(); return; }
        // Die ersten Augenblicke: auf den Stuhl rutschen und etwas tiefer sinken, dann zum Tisch schauen
        const o = this.entity.object;
        const tiefe = this.services.settings.cafe?.sitzTiefe ?? 0.2;
        if (this.sitIn < 1) {
          this.sitIn = Math.min(1, this.sitIn + dt * 2);
          const ziel = st.seat(this.seat.index);
          o.position.x += (ziel.x - o.position.x) * Math.min(1, dt * 6);
          o.position.z += (ziel.z - o.position.z) * Math.min(1, dt * 6);
          o.position.y = ziel.y - tiefe * this.sitIn;
          if (this.sitIn >= 1 && Math.random() < 0.5) this.services.denkt?.('gemuetlich');
        }
        this.face(st.lookAt(this.seat.index), dt);
        this.timer -= dt;
        if (this.timer <= 0) this.standUp();
        break;
      }
      case 'zur_kabine': {
        const fr = this.room?.get(FittingRoomComponent);
        if (!this.room?.world || !fr) { this.endTryOn(); return; }
        if (this.walk(dt)) {
          // Hinein, Vorhang zu
          this.entity.object.position.copy(fr.inside());
          this.entity.object.visible = false;
          fr.close(true);
          const t = this.services.settings.anprobieren?.sekunden ?? { min: 8, max: 14 };
          this.timer = t.min + Math.random() * (t.max - t.min);
          this.setState('probiert');
        }
        break;
      }
      case 'probiert':
        this.timer -= dt;
        if (this.timer <= 0 || !this.room?.world) this.endTryOn();
        break;
      case 'geht':
        if (this.walk(dt)) this.entity.world?.remove(this.entity);
        break;
    }
  }

  /** Das Spiel hat abgerechnet: hinter der Kasse einpacken (wenn eingestellt), dann gehen. */
  paid(): void {
    if (this.wishes.length && this.wishes.every((w) => w.status === 'gefunden')) this.services.denkt?.('gluecklich');
    const c = this.checkout?.get(CheckoutComponent);
    const packSpot = c?.spot(-1.6);
    c?.leave(this.entity);
    this.checkout = null;
    const w = this.services.einkaufswagen;
    this.packing = this.basket.splice(0);
    this.renderBasket();
    if (w && packSpot && this.packing.length) {
      this.packTotal = Math.max(1, w.packSekundenProArtikel * countOf(this.packing));
      this.timer = this.packTotal;
      this.path.goTo(this.entity.object, packSpot, this.services.findPath);
      this.setState('packt');
      return;
    }
    this.packing = [];
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
    let counter: Entity | null = null;
    for (const w of this.wishes) {
      if (w.status !== 'offen' || w.tresen) continue;
      const shelf = this.services.findShelf(w.produkt, this.entity.object.position);
      if (shelf) { this.goToShelf(w, shelf); return; }
      // Gibt es nur am Café-Tresen: dort bestellen (nach dem Rest des Einkaufs)
      const c = this.services.findCounter?.(w.produkt, this.entity.object.position) ?? null;
      if (c) { w.tresen = true; counter ??= c; continue; }
      w.status = 'fehlt';
      this.services.denkt?.('fehlt', w.produkt);
    }
    this.current = null;
    if (this.bestellt) this.goToCheckout(counter ?? this.wishes.map((w) => (w.tresen && w.status === 'offen' ? this.services.findCounter?.(w.produkt, this.entity.object.position) : null)).find((e) => e) ?? undefined);
    else if (this.basket.length) { if (!this.tryOn()) this.goToCheckout(); }
    else this.leave('ohne_einkauf');
  }

  /** Mode im Korb und eine Umkleide frei: erst anprobieren (einmal je Besuch). Gibt zurück, ob es losgeht. */
  private tryOn(): boolean {
    const a = this.services.settings.anprobieren;
    if (this.anprobiert || !a || !this.basket.some((l) => a.kategorien.includes(l.produkt.kategorie))) return false;
    this.anprobiert = true;
    if (Math.random() >= a.chance) return false;
    const room = this.services.findFittingRoom?.(this.entity.object.position) ?? null;
    const fr = room?.get(FittingRoomComponent);
    if (!room || !fr?.reserve(this.entity)) return false;
    this.room = room;
    this.path.goTo(this.entity.object, fr.entrance(), this.services.findPath);
    this.setState('zur_kabine');
    return true;
  }

  /** Fertig mit Anprobieren: Vorhang auf, heraus; passt ein Teil nicht, hängt es zurück. Dann zur Kasse. */
  private endTryOn(): void {
    const fr = this.room?.get(FittingRoomComponent);
    const o = this.entity.object;
    if (!o.visible) {
      o.visible = true;
      if (fr && this.room?.world) o.position.copy(fr.entrance());
    }
    fr?.release(this.entity);
    this.room = null;
    const a = this.services.settings.anprobieren;
    const mode = a ? this.basket.filter((l) => a.kategorien.includes(l.produkt.kategorie)) : [];
    if (mode.length && a && Math.random() < a.passtNicht) {
      const l = mode[Math.floor(Math.random() * mode.length)];
      this.basket.splice(this.basket.indexOf(l), 1);
      if (l.regal.world) l.regal.get(ShelfComponent)?.add(l.produkt, l.menge);
      this.services.denkt?.('passt_nicht', l.produkt);
      this.renderBasket();
    } else if (mode.length) {
      this.services.denkt?.('anprobiert', mode[0].produkt);
    }
    if (this.basket.length) this.goToCheckout();
    else this.leave('ohne_einkauf');
  }

  /** Kasse oder Tresen ist weg: neuen Tresen suchen (wenn bestellt wird) oder eine Kasse */
  private nextWishOrCheckout(): void {
    for (const w of this.wishes) if (w.tresen && w.status === 'offen') w.tresen = false;
    this.nextWish();
  }

  /** Stück, die noch am Tresen bestellt werden */
  get bestellt(): number {
    return this.wishes.reduce((n, w) => n + (w.tresen && w.status === 'offen' ? w.menge : 0), 0);
  }

  /** Am Tresen: die Bestellung wird zubereitet und kommt aus dem Fach des Tresens in die Hand */
  takeOrder(counter: Entity): void {
    const shelf = counter.get(ShelfComponent);
    for (const w of this.wishes) {
      if (!w.tresen || w.status !== 'offen') continue;
      if (!this.services.willBuy(w.produkt)) { w.status = 'zu_teuer'; this.services.denkt?.('zu_teuer', w.produkt); continue; }
      const n = shelf?.take(w.produkt.id, w.menge) ?? 0;
      if (n > 0) {
        w.genommen = n;
        w.status = 'gefunden';
        this.basket.push({ produkt: w.produkt, menge: n, regal: counter, preis: this.services.priceOf(w.produkt) });
      } else {
        w.status = 'fehlt';
        this.services.denkt?.('fehlt', w.produkt);
      }
    }
    this.renderBasket();
  }

  /** Am Tresen gab es nichts: ohne Einkauf gehen */
  leaveEmpty(): void {
    this.checkout?.get(CheckoutComponent)?.leave(this.entity);
    this.checkout = null;
    this.leave('ohne_einkauf');
  }

  /** Das Regal ist weg oder leer: anderes Regal mit dem Produkt suchen, sonst fehlt es. */
  private retryWish(): void {
    const w = this.current;
    if (!w) { this.nextWish(); return; }
    const other = this.services.findShelf(w.produkt, this.entity.object.position, this.shelf ?? undefined);
    if (other) this.goToShelf(w, other);
    else { w.status = 'fehlt'; this.services.denkt?.('fehlt', w.produkt); this.nextWish(); }
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
    // Steht da, aber zu teuer: nicht kaufen (reduzierte Ware vom letzten Tag nimmt man gern mit)
    const regal = shelf?.world ? shelf.get(ShelfComponent) : undefined;
    const reduziertDa = !!regal?.hatReduziert(w.produkt.id);
    if (shelf?.world && !reduziertDa && !this.services.willBuy(w.produkt)) {
      w.status = 'zu_teuer';
      this.services.denkt?.('zu_teuer', w.produkt);
      this.nextWish();
      return;
    }
    const { n, reduziert } = regal?.takeFresh(w.produkt.id, w.menge) ?? { n: 0, reduziert: 0 };
    if (n > 0 && shelf) {
      w.genommen = n;
      w.status = 'gefunden';
      if (reduziert > 0 || this.services.isBargain(w.produkt)) this.services.denkt?.('schnaeppchen', w.produkt);
      const preis = this.services.priceOf(w.produkt);
      if (n > reduziert) this.basket.push({ produkt: w.produkt, menge: n - reduziert, regal: shelf, preis });
      // Reduziert: an der Kasse günstiger
      if (reduziert > 0) this.basket.push({ produkt: w.produkt, menge: reduziert, regal: shelf, preis: Math.round(preis * (1 - ShelfComponent.frische.rabatt) * 100) / 100 });
      this.renderBasket();
      this.nextWish();
    } else {
      this.retryWish();
    }
  }

  private goToCheckout(counter?: Entity): void {
    const checkout = counter ?? this.services.findCheckout();
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
    // Café: Wer Kaffee gekauft hat, setzt sich noch eine Weile hin (ohne Wagen, wenn ein Platz frei ist)
    const cafe = this.services.settings.cafe;
    if (cafe && !this.cart && bought.some((w) => cafe.kategorien.includes(w.produkt.kategorie)) && Math.random() < cafe.chance) {
      const table = this.services.findSeat?.(this.entity.object.position) ?? null;
      const index = table?.get(SeatComponent)?.reserve(this.entity) ?? -1;
      if (table && index >= 0) {
        this.seat = { table, index };
        this.path.goTo(this.entity.object, table.require(SeatComponent).approach(index), this.services.findPath);
        this.setState('zum_platz');
        return;
      }
    }
    // Mit Wagen: erst zurück zur Wagenbox
    if (this.cart && this.station?.world) {
      this.path.goTo(this.entity.object, this.station.require(CartStationComponent).pickupSpot(), this.services.findPath);
      this.setState('bringt_wagen');
      return;
    }
    this.path.goTo(this.entity.object, this.services.exitPoint(), this.services.findPath);
    this.setState('geht');
  }

  private sitSeconds(): number {
    const s = this.services.settings.cafe?.sitzSekunden ?? { min: 20, max: 30 };
    return s.min + Math.random() * (s.max - s.min);
  }

  /** Aufstehen (oder der Tisch ist weg): Platz freigeben, wieder auf den Boden, zum Ausgang */
  private standUp(): void {
    const st = this.seat?.table.get(SeatComponent);
    if (this.seat && st) {
      const p = st.approach(this.seat.index);
      this.entity.object.position.set(p.x, p.y, p.z);
      st.release(this.entity);
    } else {
      this.entity.object.position.y = Math.max(0, this.entity.object.position.y);
    }
    this.seat = null;
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
    // Beim Packen bleibt der Kunde nach dem Ankommen stehen; mit Wagen geht es etwas langsamer
    return this.path.step(this.entity.object, this.services.speed * (this.cart ? 0.85 : 1), dt);
  }

  /** Wagen vor die Figur stellen (lokal +Z ist vorne) */
  private attachCart(): void {
    const w = this.services.einkaufswagen;
    this.cart = new THREE.Group();
    this.cart.position.set(0, 0, 0.72);
    this.entity.object.add(this.cart);
    if (w && this.services.models) {
      this.services.models.instance(w.model).then((obj) => {
        obj.rotation.y = -Math.PI / 2;
        this.cart?.add(obj);
      }, () => {});
    }
    this.renderBasket();
  }

  private detachCart(): void {
    if (this.cart) this.entity.object.remove(this.cart);
    this.cart = null;
    this.items = null;
    this.renderBasket();
  }

  /** Ware im Wagen zeigen (höchstens `n` Teile, ohne Angabe alle; Platz für 12) */
  private renderItems(lines: BasketLine[], n = Infinity): void {
    if (!this.cart || !this.services.models) return;
    if (this.items) this.cart.remove(this.items);
    this.items = new THREE.Group();
    this.cart.add(this.items);
    let i = 0;
    for (const l of lines) for (let k = 0; k < l.menge && i < Math.min(n, 12); k++, i++) {
      if (!l.produkt.model) continue;
      const slot = new THREE.Group();
      // 3 × 2 Plätze, zwei Lagen, im Korb des Wagens
      const col = i % 3, row = Math.floor(i / 3) % 2, lage = Math.floor(i / 6);
      slot.position.set((col - 1) * 0.13, 0.5 + lage * 0.14, 0.12 - row * 0.2);
      this.items.add(slot);
      this.services.models.instance(l.produkt.model).then((obj) => slot.add(obj), () => {});
    }
  }

  private face(p: THREE.Vector3, dt: number): void {
    const o = this.entity.object.position;
    turnTowards(this.entity.object, Math.atan2(p.x - o.x, p.z - o.z), dt);
  }

  private renderBasket(): void {
    if (this.cart) {
      if (this.basketMesh) this.basketMesh.visible = false;
      if (this.state !== 'an_kasse' && this.state !== 'packt') this.renderItems(this.basket);
      return;
    }
    const show = this.basket.length > 0 || this.state === 'packt';
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

function countOf(lines: BasketLine[]): number {
  return lines.reduce((n, l) => n + l.menge, 0);
}
