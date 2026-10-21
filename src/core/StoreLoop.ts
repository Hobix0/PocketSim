import * as THREE from 'three';
import { Emitter } from './Emitter';
import { readData } from './Data';
import type { Content } from '../content/Content';
import type { CustomerSettings, NavSettings, ProductDef } from '../content/definitions';
import type { World } from '../ecs/World';
import type { Entity } from '../ecs/Entity';
import type { PlayerState } from '../state/PlayerState';
import type { FactoryContext } from '../factory/FactoryContext';
import type { StaffServices } from '../factory/createWorkerEntity';
import type { CheckoutServices } from '../components/CheckoutComponent';
import { NavGrid, type Bounds, type Point } from '../navigation/NavGrid';
import { CustomerSpawner, planWishes } from '../economy/Customers';
import { StoreStats, basketTotal, type VisitOutcome } from '../economy/StoreStats';
import { findHaulTask, findStockingTask } from '../economy/Stocking';
import type { StorageSurfaceComponent } from '../components/StorageSurfaceComponent';
import { buyChance, type PriceBook } from '../economy/Prices';
import { createCustomerEntity } from '../factory/createCustomerEntity';
import { CustomerComponent } from '../components/CustomerComponent';
import { TerminalComponent } from '../components/TerminalComponent';
import { CheckoutComponent } from '../components/CheckoutComponent';
import { ShelfComponent } from '../components/ShelfComponent';
import { FootprintComponent } from '../components/FootprintComponent';
import { SelectableComponent } from '../components/SelectableComponent';
import { CartStationComponent } from '../components/CartStationComponent';

// Ladenbetrieb: Kunden kommen, kaufen ein, bezahlen an der Kasse, gehen wieder.
// Verbindet Wegfindung, Kundenzustrom, Kassen und Kennzahlen. Die Darstellung (HUD, Fenster)
// hängt sich nur an die Ereignisse; im Koop-Modus könnte das hier auf dem Server laufen.

export interface StoreLoopEvents extends Record<string, unknown> {
  /** `kasse`, `kunde`: wo es passiert ist (für Effekte) */
  sale: { betrag: number; artikel: number; byHand: boolean; kasse: THREE.Vector3; kunde: THREE.Vector3 };
  visit: { outcome: VisitOutcome };
  opened: undefined;
  closed: undefined;
}

export class StoreLoop {
  readonly events = new Emitter<StoreLoopEvents>();
  readonly settings: CustomerSettings;
  readonly nav: NavGrid;
  readonly spawner: CustomerSpawner;
  readonly stats: StoreStats;
  /** Für die Kassen (wird an die Fabrik gegeben) */
  readonly checkoutServices: CheckoutServices;
  private nummer = 0;
  private wasOpen = false;

  constructor(
    private readonly world: World,
    private readonly content: Content,
    private readonly player: PlayerState,
    bounds: Bounds,
    /** Wo Kunden auftauchen und verschwinden; leer = keine Kunden */
    private readonly kundenPunkte: [number, number, number][],
    private readonly ctx: () => FactoryContext,
    readonly prices: PriceBook,
    private readonly random: () => number = Math.random,
  ) {
    this.settings = content.kunden;
    this.nav = new NavGrid(bounds, readData<NavSettings>('navigation/standard'), world);
    this.spawner = new CustomerSpawner(this.settings, random);
    this.stats = new StoreStats(this.settings, player);
    this.checkoutServices = {
      serve: (checkout, byHand) => this.serve(checkout, byHand),
      isReady: (c) => c.get(CustomerComponent)?.isReady ?? false,
      nameOf: (e) => e.get(SelectableComponent)?.titel ?? '',
    };
    // Wege neu berechnen, wenn sich Gebautes ändert
    const touch = (e: Entity) => { if (e.get(FootprintComponent)) this.nav.invalidate(); };
    world.events.on('added', touch);
    world.events.on('removed', touch);
  }

  readonly findPath = (a: Point, b: Point): Point[] | null => this.nav.findPath(a, b);

  get kundenImLaden(): number {
    let n = 0;
    for (const _ of this.world.query(CustomerComponent)) n++;
    return n;
  }

  /** Einmal pro Frame mit den vergangenen Spielminuten und der Uhrzeit (Minuten seit Mitternacht). */
  update(minutes: number, minuteOfDay: number): void {
    const open = this.spawner.isOpen(minuteOfDay);
    if (open !== this.wasOpen) {
      this.wasOpen = open;
      this.events.emit(open ? 'opened' : 'closed', undefined);
    }
    if (!this.kundenPunkte.length || minutes <= 0) return;
    const n = this.spawner.spawns(minutes, minuteOfDay, this.stats.ruf, this.kundenImLaden);
    for (let i = 0; i < n; i++) this.spawnCustomer();
  }

  get offen(): boolean {
    return this.wasOpen;
  }

  /** Öffnungsstatus zur Uhrzeit übernehmen, ohne „hat geöffnet“ zu melden (z. B. nach dem Laden). */
  sync(minuteOfDay: number): void {
    this.wasOpen = this.spawner.isOpen(minuteOfDay);
  }

  /** Den vordersten Kunden an einer Kasse abrechnen. */
  serve(checkout: Entity, byHand: boolean): void {
    const c = checkout.get(CheckoutComponent);
    const front = c?.front;
    const customer = front?.get(CustomerComponent);
    if (!c || !front || !customer?.isReady) return;
    const artikel = customer.artikel;
    const betrag = basketTotal(customer.basket);
    if (betrag > 0) this.player.earn(betrag, 'verkauf');
    this.stats.recordSale(betrag, artikel, customer.basket);
    const work = this.content.arbeit;
    this.player.addXp(work.xpProKunde + (byHand ? work.xpProKundeVonHand : 0));
    customer.paid();
    this.events.emit('sale', { betrag, artikel, byHand, kasse: checkout.object.position.clone(), kunde: front.object.position.clone() });
  }

  /** Was das Personal braucht (Auffüller und Kassierer). */
  staffServices(
    isCartonFree: (carton: Entity) => boolean,
    storage: { nearestFree(near: THREE.Vector3): StorageSurfaceComponent | null } = { nearestFree: () => null },
  ): StaffServices {
    const personal = this.content.personal;
    return {
      auffuellen: {
        findTask: () => findStockingTask(this.world, isCartonFree),
        findPath: this.findPath,
        gehgeschwindigkeit: personal.gehgeschwindigkeit,
        sekundenProStueck: personal.sekundenProStueck,
      },
      abladen: {
        findTask: () => findHaulTask(this.world, storage, isCartonFree),
        findPath: this.findPath,
        gehgeschwindigkeit: personal.gehgeschwindigkeit,
        sekundenProStueck: personal.sekundenProStueck,
      },
      einkaufen: {
        findTerminal: () => [...this.world.query(TerminalComponent)][0]?.[0] ?? null,
        findPath: this.findPath,
        gehgeschwindigkeit: personal.gehgeschwindigkeit,
      },
      kassieren: {
        findCheckout: () => [...this.world.query(CheckoutComponent)].find(([, k]) => !k.cashier)?.[0] ?? null,
        findPath: this.findPath,
        serve: (checkout) => this.serve(checkout, false),
        gehgeschwindigkeit: personal.gehgeschwindigkeit,
        sekundenProArtikel: this.settings.kassierenSekundenProArtikel,
      },
    };
  }

  // ── Kunden ──────────────────────────────────────────────────────

  private spawnCustomer(): void {
    const s = this.settings;
    const sortiment = this.sortiment();
    const alle = this.content.produkte.all().filter((p) => p.freischaltLevel <= this.player.level);
    const wishes = planWishes(s, sortiment, alle, this.random);
    const start = this.kundenPunkte[Math.floor(this.random() * this.kundenPunkte.length)];
    const names = this.content.namen;
    const name = names[Math.floor(this.random() * names.length)];
    const speed = s.gehgeschwindigkeit.min + this.random() * (s.gehgeschwindigkeit.max - s.gehgeschwindigkeit.min);
    const entity = createCustomerEntity(this.nummer++, name, start, wishes, {
      findPath: this.findPath,
      findShelf: (p, from, exclude) => this.findShelf(p, from, exclude),
      findCheckout: () => this.findCheckout(),
      exitPoint: () => new THREE.Vector3(...this.kundenPunkte[Math.floor(this.random() * this.kundenPunkte.length)]),
      settings: s,
      speed,
      text: (k, v) => this.content.text(k, v),
      findCartStation: (from) => {
        let best: Entity | null = null, bestD = Infinity;
        for (const [e, st] of this.world.query(CartStationComponent)) {
          const d = e.object.position.distanceToSquared(from);
          if (st.frei > 0 && d < bestD) { best = e; bestD = d; }
        }
        return best;
      },
      einkaufswagen: s.einkaufswagen,
      models: this.ctx().models,
      priceOf: (p) => this.prices.get(p),
      willBuy: (p) => this.random() < buyChance(s.preis, this.prices.ratio(p)),
      isBargain: (p) => this.prices.ratio(p) <= s.preis.schnaeppchenAb,
      left: (outcome, fehlend, zuTeuer, schnaeppchen) => {
        this.stats.recordVisit(outcome, fehlend, zuTeuer);
        this.stats.recordBargain(schnaeppchen);
        this.events.emit('visit', { outcome });
      },
    }, this.ctx());
    this.world.add(entity);
  }

  /** Produkte, die gerade in irgendeinem Regal liegen. */
  private sortiment(): ProductDef[] {
    const map = new Map<string, ProductDef>();
    for (const [, s] of this.world.query(ShelfComponent)) for (const f of s.faecher) if (f.produkt && f.menge > 0) map.set(f.produkt.id, f.produkt);
    return [...map.values()];
  }

  private findShelf(p: ProductDef, from: THREE.Vector3, exclude?: Entity): Entity | null {
    let best: Entity | null = null, bestD = Infinity;
    for (const [e, s] of this.world.query(ShelfComponent)) {
      if (e === exclude || !s.faecher.some((f) => f.produkt?.id === p.id && f.menge > 0)) continue;
      const d = e.object.position.distanceToSquared(from);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  /** Kasse mit der kürzesten Schlange; besetzte Kassen bevorzugt. */
  private findCheckout(): Entity | null {
    let best: Entity | null = null, bestScore = Infinity;
    for (const [e, c] of this.world.query(CheckoutComponent)) {
      const score = c.queue.length + (c.cashier ? 0 : 0.5);
      if (score < bestScore) { best = e; bestScore = score; }
    }
    return best;
  }
}
