import * as THREE from 'three';
import { levelUnlocks, type Unlocks } from '../economy/Research';
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
import { SeatComponent } from '../components/SeatComponent';
import { FittingRoomComponent } from '../components/FittingRoomComponent';
import { findPalletJob } from '../economy/PalletLogistics';

// Ladenbetrieb: Kunden kommen, kaufen ein, bezahlen an der Kasse, gehen wieder.
// Verbindet Wegfindung, Kundenzustrom, Kassen und Kennzahlen. Die Darstellung (HUD, Fenster)
// hängt sich nur an die Ereignisse; im Koop-Modus könnte das hier auf dem Server laufen.

export interface StoreLoopEvents extends Record<string, unknown> {
  /** `kasse`, `kunde`: wo es passiert ist (für Effekte) */
  sale: { betrag: number; artikel: number; byHand: boolean; kasse: THREE.Vector3; kunde: THREE.Vector3 };
  visit: { outcome: VisitOutcome };
  /** Ein Kunde denkt etwas (Gedankenblase): `kunde` ist seine Figur */
  thought: { art: 'fehlt' | 'zu_teuer' | 'schnaeppchen' | 'gluecklich' | 'gemuetlich' | 'anprobiert' | 'passt_nicht'; produkt?: ProductDef; preis?: number; kunde: THREE.Object3D };
  opened: undefined;
  closed: undefined;
}

export class StoreLoop {
  readonly events = new Emitter<StoreLoopEvents>();
  readonly settings: CustomerSettings;
  /** Was Kunden sich wünschen können (Level und Forschung); Game setzt die Forschung ein */
  unlocks: Unlocks;
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
    this.unlocks = levelUnlocks(() => player.level);
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
    const kassen = [...this.world.query(CheckoutComponent)].length;
    const n = this.spawner.spawns(minutes, minuteOfDay, this.stats.ruf, this.kundenImLaden, this.sortiment().length, Math.max(1, kassen), this.lageFaktor());
    for (let i = 0; i < n; i++) this.spawnCustomer();
  }

  /**
   * Standorte (setzt das Spiel, siehe src/world/Sites.ts): Jeder Kunde geht gezielt in einen Laden und sucht
   * nur dort Ware, Kasse, Sitzplatz und Umkleide. Ohne: die ganze Welt ist ein Laden.
   */
  standorte: { at(x: number, z: number): string | null; pick(random: () => number): string; center(id: string): { x: number; z: number } } | null = null;

  /** Liegt das Bauteil im Standort (ohne Standort: überall)? */
  private inSite(e: Entity, site: string | null): boolean {
    return !site || !this.standorte || this.standorte.at(e.object.position.x, e.object.position.z) === site;
  }

  /** Kundenpunkte nahe am Standort (Haustüren, Straßenenden), zufällig unter den drei nächsten */
  private pointNear(site: string | null): [number, number, number] {
    const pts = this.kundenPunkte;
    if (!site || !this.standorte) return pts[Math.floor(this.random() * pts.length)];
    const c = this.standorte.center(site);
    const near = [...pts].sort((a, b) => Math.hypot(a[0] - c.x, a[2] - c.z) - Math.hypot(b[0] - c.x, b[2] - c.z)).slice(0, 3);
    return near[Math.floor(this.random() * near.length)];
  }

  /** Mehr Kundschaft durch weitere Läden in der Stadt (setzt das Spiel, siehe src/world/Locations.ts) */
  lageFaktor: () => number = () => 1;

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
    // Café-Tresen: erst die Bestellung aus dem Fach des Tresens holen
    if (c.def.bedienung) {
      customer.takeOrder(checkout);
      if (!customer.basket.length) { customer.leaveEmpty(); return; }
    }
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
    storage: { nearestFree(near: THREE.Vector3): StorageSurfaceComponent | null; store?(carton: Entity): boolean } = { nearestFree: () => null },
    /** Standort, dem die Person zugeteilt ist (Kasse, Tresen, Regale); ohne: überall */
    standort: () => string | undefined = () => undefined,
  ): StaffServices {
    const personal = this.content.personal;
    const hier = (e: Entity) => this.inSite(e, standort() ?? null);
    return {
      auffuellen: {
        findTask: () => findStockingTask(this.world, isCartonFree, undefined, hier),
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
        findCheckout: () => [...this.world.query(CheckoutComponent)].find(([e, k]) => !k.cashier && !k.def.bedienung && hier(e))?.[0] ?? null,
        findPath: this.findPath,
        serve: (checkout) => this.serve(checkout, false),
        gehgeschwindigkeit: personal.gehgeschwindigkeit,
        sekundenProArtikel: this.settings.kassierenSekundenProArtikel,
      },
      paletten: {
        findJob: () => findPalletJob(this.world, { arten: ['einlagern', 'nachschub', 'auffuellen'] }),
        findPath: this.findPath,
        walkable: (x, z) => this.nav.isWalkable(x, z),
        gehgeschwindigkeit: personal.gehgeschwindigkeit,
        sekundenProStueck: personal.sekundenProStueck,
        lager: this.content.lager,
        models: this.ctx().models,
        store: (c) => storage.store?.(c) ?? false,
      },
      abladenFahrzeuge: {
        findJob: () => findPalletJob(this.world, { arten: ['einlagern'], fahrzeuge: ['hubwagen', 'gabelstapler'] }),
        findPath: this.findPath,
        walkable: (x, z) => this.nav.isWalkable(x, z),
        gehgeschwindigkeit: personal.gehgeschwindigkeit,
        sekundenProStueck: personal.sekundenProStueck,
        lager: this.content.lager,
        models: this.ctx().models,
        store: (c) => storage.store?.(c) ?? false,
      },
      auffuellenFahrzeuge: {
        findJob: () => findPalletJob(this.world, { arten: ['auffuellen', 'kommissionieren'], fahrzeuge: ['hubwagen', 'rollwagen'], regalOk: hier }),
        findPath: this.findPath,
        walkable: (x, z) => this.nav.isWalkable(x, z),
        gehgeschwindigkeit: personal.gehgeschwindigkeit,
        sekundenProStueck: personal.sekundenProStueck,
        lager: this.content.lager,
        models: this.ctx().models,
        store: (c) => storage.store?.(c) ?? false,
      },
      bedienen: {
        findCheckout: () => [...this.world.query(CheckoutComponent)].find(([e, k]) => !k.cashier && k.def.bedienung && hier(e))?.[0] ?? null,
        findPath: this.findPath,
        serve: (checkout) => this.serve(checkout, false),
        gehgeschwindigkeit: personal.gehgeschwindigkeit,
        sekundenProArtikel: this.settings.cafe?.zubereitenSekundenProArtikel ?? 2.5,
      },
    };
  }

  // ── Kunden ──────────────────────────────────────────────────────

  private spawnCustomer(): void {
    const s = this.settings;
    const site = this.standorte?.pick(this.random) ?? null;
    const sortiment = this.sortiment(site);
    // Öffentliche Plätze (Gehweg: Wagenbox, Terrasse) gehören zum Laden direkt davor (höchstens 9 m von seiner Mitte)
    const nah = (e: Entity) => {
      if (!site || !this.standorte) return true;
      const p = e.object.position, at = this.standorte.at(p.x, p.z);
      if (at === site) return true;
      const c = this.standorte.center(site);
      return at === null && Math.hypot(p.x - c.x, p.z - c.z) < 9;
    };
    const alle = this.content.produkte.all().filter((p) => this.unlocks.ok(p));
    const wishes = planWishes(s, sortiment, alle, this.random);
    const start = this.pointNear(site);
    const names = this.content.namen;
    const name = names[Math.floor(this.random() * names.length)];
    const speed = s.gehgeschwindigkeit.min + this.random() * (s.gehgeschwindigkeit.max - s.gehgeschwindigkeit.min);
    let figur: THREE.Object3D | null = null;
    const entity = createCustomerEntity(this.nummer++, name, start, wishes, {
      denkt: (art, p) => { if (figur) this.events.emit('thought', { art, produkt: p, preis: p ? this.prices.get(p) : undefined, kunde: figur }); },
      findPath: this.findPath,
      findShelf: (p, from, exclude) => this.findShelf(p, from, exclude, false, site),
      findCheckout: () => this.findCheckout(site),
      findCounter: (p, from) => this.findShelf(p, from, undefined, true, site),
      exitPoint: () => new THREE.Vector3(...this.pointNear(site)),
      settings: s,
      speed,
      text: (k, v) => this.content.text(k, v),
      findCartStation: (from) => {
        let best: Entity | null = null, bestD = Infinity;
        for (const [e, st] of this.world.query(CartStationComponent)) {
          if (!nah(e)) continue;
          const d = e.object.position.distanceToSquared(from);
          if (st.frei > 0 && d < bestD) { best = e; bestD = d; }
        }
        return best;
      },
      findSeat: (from) => {
        let best: Entity | null = null, bestD = Infinity;
        for (const [e, st] of this.world.query(SeatComponent)) {
          if (!nah(e)) continue;
          const d = e.object.position.distanceToSquared(from);
          if (st.frei > 0 && d < bestD) { best = e; bestD = d; }
        }
        return best;
      },
      findFittingRoom: (from) => {
        let best: Entity | null = null, bestD = Infinity;
        for (const [e, fr] of this.world.query(FittingRoomComponent)) {
          if (!this.inSite(e, site)) continue;
          const d = e.object.position.distanceToSquared(from);
          if (fr.frei && d < bestD) { best = e; bestD = d; }
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
    figur = entity.object;
    this.world.add(entity);
  }

  /** Produkte, die gerade in irgendeinem Regal liegen (eines Standorts, ohne: überall). */
  private sortiment(site: string | null = null): ProductDef[] {
    const map = new Map<string, ProductDef>();
    for (const [e, s] of this.world.query(ShelfComponent)) if (this.inSite(e, site)) for (const f of s.faecher) if (f.produkt && f.menge > 0) map.set(f.produkt.id, f.produkt);
    return [...map.values()];
  }

  /** Nächstes Regal mit dem Produkt; `tresen`: nur Bedientheken (Café-Tresen), sonst nur Regale zum Selbstnehmen */
  private findShelf(p: ProductDef, from: THREE.Vector3, exclude?: Entity, tresen = false, site: string | null = null): Entity | null {
    let best: Entity | null = null, bestD = Infinity;
    for (const [e, s] of this.world.query(ShelfComponent)) {
      if (e === exclude || !this.inSite(e, site) || !s.faecher.some((f) => f.produkt?.id === p.id && f.menge > 0)) continue;
      if (!!e.get(CheckoutComponent)?.def.bedienung !== tresen) continue;
      const d = e.object.position.distanceToSquared(from);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  /** Kasse mit der kürzesten Schlange; besetzte Kassen bevorzugt. */
  private findCheckout(site: string | null = null): Entity | null {
    let best: Entity | null = null, bestScore = Infinity;
    for (const [e, c] of this.world.query(CheckoutComponent)) {
      if (c.def.bedienung || !this.inSite(e, site)) continue;
      const score = c.queue.length + (c.cashier ? 0 : 0.5);
      if (score < bestScore) { best = e; bestScore = score; }
    }
    return best;
  }
}
