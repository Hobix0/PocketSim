import * as THREE from 'three';
import { Emitter } from '../core/Emitter';
import { Entity } from '../ecs/Entity';
import type { World } from '../ecs/World';
import type { LogisticsSettings } from '../content/definitions';
import type { FactoryContext } from '../factory/FactoryContext';
import type { PlayerState } from '../state/PlayerState';
import type { Shipment, ShipmentLine } from '../economy/Deliveries';
import { ModelComponent } from '../components/ModelComponent';
import { SelectableComponent } from '../components/SelectableComponent';
import { StorageSurfaceComponent } from '../components/StorageSurfaceComponent';
import { CartonComponent } from '../components/CartonComponent';
import { RampComponent } from '../components/RampComponent';
import { LampComponent } from '../components/LampComponent';
import { FootprintComponent } from '../components/FootprintComponent';
import { NavGrid, type Bounds } from '../navigation/NavGrid';
import { TruckComponent, type RoutePoint } from '../components/TruckComponent';
import { createCartonEntity } from '../factory/createProductEntity';
import { place, type CartonStorage } from './CartonStorage';

// Die Liefer-LKW in der Welt. Fällige Lieferungen (Deliveries → "arrived") kommen in eine Warteschlange;
// sobald ein Halteplatz frei ist, fährt ein LKW los: an eine freie Laderampe oder sonst auf die Straße vor dem Laden.
// Dort stehen die Kartons auf der Ladefläche – abladen von Hand (XP), durch Lageristen oder nach der Wartezeit
// durch den Fahrer (kostet je Karton). Ist dann kein Platz mehr frei, nimmt er die Ware zurück und erstattet den EK.

/** Strecke aus dem Level (data/level/*.json → "anlieferung") */
export interface DeliveryRoute {
  /** Mitte der Fahrspur (z) auf der Straße */
  strasseZ: number;
  /** Höhe der Straße */
  hoehe: number;
  /** x, an dem der LKW auftaucht bzw. verschwindet */
  von: number;
  bis: number;
  /** Halteplatz auf der Straße (Mitte des LKW), Fahrtrichtung +X */
  halt: number;
}

export interface FleetEvents extends Record<string, unknown> {
  /** Ein LKW steht zum Abladen bereit */
  arrived: { truck: Entity; kartons: number };
  /** Der Fahrer hat selbst abgeladen */
  driverUnloaded: { kartons: number; kosten: number };
  /** Kein Platz: Ware zurückgenommen, EK erstattet */
  returned: { kartons: number; betrag: number };
  /** An dieses Ladetor kommt kein LKW heran (zugebaut) – er hält auf der Straße */
  unreachable: { dock: Entity };
}

export class TruckFleet {
  readonly events = new Emitter<FleetEvents>();
  private readonly queue: ShipmentLine[] = [];
  private readonly trucks = new Set<Entity>();

  constructor(
    private readonly world: World,
    private readonly ctx: FactoryContext,
    private readonly settings: LogisticsSettings,
    private readonly route: DeliveryRoute,
    private readonly storage: CartonStorage,
    private readonly player: PlayerState,
    /** Gelände, auf dem LKW fahren (für das Fahrraster) */
    private readonly bounds: Bounds,
  ) {
    const l = settings.lkw;
    this.drive = new NavGrid(bounds, { zelle: l.fahrraster, radius: l.groesse[2] / 2 + 0.2 }, world, 'fahren');
    // Nach dem Bauen neu berechnen
    world.events.on('added', (e) => { if (e.get(FootprintComponent)) this.drive.invalidate(); });
    world.events.on('removed', (e) => { if (e.get(FootprintComponent)) this.drive.invalidate(); });
  }

  /** Fahrraster für LKW (befahrbar: Gelände und Außenflächen) */
  private readonly drive: NavGrid;
  /** Tore, für die schon gemeldet wurde, dass kein LKW hinkommt */
  private readonly unreachable = new WeakSet<Entity>();

  /** Fällige Lieferung übernehmen */
  receive(s: Shipment): void {
    this.queue.push(...s.kartons);
    this.dispatch();
  }

  /** Spielminuten vergehen lassen: Wartezeiten, Abfahrt, neue LKW */
  update(minutes: number): void {
    for (const e of this.trucks) {
      const t = e.require(TruckComponent);
      if (t.state !== 'steht') continue;
      t.wartet -= minutes;
      if (t.kartons === 0) t.depart();
      else if (t.wartet <= 0) { this.driverUnload(t); t.depart(); }
    }
    if (this.queue.length) this.dispatch();
  }

  /** Kartons, die noch kommen oder auf einem LKW stehen (brauchen noch Lagerplatz) */
  onTrucks(): number {
    let n = this.queue.length;
    for (const e of this.trucks) n += e.require(TruckComponent).kartons;
    return n;
  }

  /** LKW, die gerade unterwegs sind oder stehen */
  get list(): TruckComponent[] {
    return [...this.trucks].map((e) => e.require(TruckComponent));
  }

  /** Alles, was noch nicht im Lager ist – für den Spielstand */
  cargo(): ShipmentLine[] {
    const out = [...this.queue];
    for (const e of this.trucks) {
      const t = e.require(TruckComponent);
      if (t.state === 'anfahrt') out.push(...t.ladung);
      else out.push(...this.cartonsOn(t).map((c) => ({ produkt: c.produkt.id, menge: c.menge })));
    }
    return out.map((k) => ({ ...k }));
  }

  /** Ladefläche eines LKW: die Kartons darauf */
  cartonsOn(t: TruckComponent): CartonComponent[] {
    const ids = new Set(t.ladeflaeche.entityIds);
    return [...this.world.query(CartonComponent)].filter(([e]) => ids.has(e.id)).map(([, c]) => c);
  }

  // ── intern ──────────────────────────────────────────────────────

  /** Freie Halteplätze mit LKW besetzen, solange Ware wartet */
  private dispatch(): void {
    const cap = this.capacity();
    while (this.queue.length) {
      const dock = this.freeDock();
      if (dock === undefined) return;
      const ladung = this.queue.splice(0, cap);
      this.spawn(ladung, dock);
    }
  }

  /** Freie Rampe, sonst die Straße (null), sonst nichts frei (undefined) */
  /** Bauteil wurde verschoben: Wege neu berechnen */
  invalidate(): void {
    this.drive.invalidate();
  }

  private freeDock(): Entity | null | undefined {
    for (const [e, r] of this.world.query(RampComponent)) {
      if (r.belegt) continue;
      if (this.paths(e)) return e;
      if (!this.unreachable.has(e)) { this.unreachable.add(e); this.events.emit('unreachable', { dock: e }); }
    }
    const streetBusy = [...this.trucks].some((e) => e.require(TruckComponent).dock === null);
    return streetBusy ? undefined : null;
  }

  private capacity(): number {
    return this.makeSurface().capacity;
  }

  private makeSurface(): StorageSurfaceComponent {
    const l = this.settings.lkw.ladeflaeche;
    const karton = this.ctx.content.lager.karton.groesse;
    const boeden = Array.from({ length: l.ebenen }, (_, i) => l.hoehe + i * karton[1]);
    return new StorageSurfaceComponent([l.bis - l.von, 0, l.breite], { boeden }, karton, { temporaer: true, versatz: [(l.von + l.bis) / 2, 0, 0], vonHinten: true });
  }

  private spawn(ladung: ShipmentLine[], dock: Entity | null): void {
    const way = this.paths(dock);
    if (!way) { this.queue.unshift(...ladung); return; }
    const { anfahrt, abfahrt } = way;
    const lkw = this.settings.lkw;
    const [laenge, hoehe, breite] = lkw.groesse;
    const e = new Entity('lkw');
    e.object.position.copy(anfahrt[0].p);
    e.add(new ModelComponent({ groesse: [laenge, hoehe, breite], farbe: '#d9dde0' }, lkw.model, this.ctx.models));
    e.add(new SelectableComponent('lkw', this.ctx.content.text('lkw_name'), this.ctx.content.kontexte.lkw?.name ?? 'LKW'));
    e.add(this.makeSurface());
    // Scheinwerfer, Rück- und Begrenzungsleuchten, Blinker
    if (lkw.licht) e.add(new LampComponent(lkw.licht));
    const truck = new TruckComponent(ladung, anfahrt.slice(1), abfahrt, lkw.geschwindigkeit, dock, {
      arrived: (t) => this.unloadOntoBed(t),
      left: (t) => this.remove(t),
      text: (k, v) => this.ctx.content.text(k, v),
    }, laenge);
    e.add(truck);
    if (dock) dock.require(RampComponent).belegt = true;
    // Startrichtung: zum ersten Wegpunkt
    const first = anfahrt[1]?.p ?? anfahrt[0].p;
    e.object.rotation.y = Math.atan2(-(first.z - anfahrt[0].p.z), first.x - anfahrt[0].p.x);
    this.trucks.add(e);
    this.world.add(e);
  }

  /** Bei Ankunft: Kartons auf die Ladefläche stellen */
  private unloadOntoBed(t: TruckComponent): void {
    const bed = t.ladeflaeche;
    for (const k of t.ladung) {
      const produkt = this.ctx.content.waren.find(k.produkt);
      if (!produkt) continue;
      const carton = createCartonEntity(produkt, k.menge, this.ctx);
      this.world.add(carton);
      if (!place(carton, bed)) { this.world.remove(carton); this.queue.push(k); }
    }
    t.ladung.splice(0);
    t.wartet = this.settings.wartezeitMinuten;
    this.events.emit('arrived', { truck: t.entity, kartons: bed.used });
  }

  /** Wartezeit vorbei: Fahrer stellt den Rest ins Lager (gegen Gebühr) oder nimmt ihn zurück */
  private driverUnload(t: TruckComponent): void {
    let stored = 0, back = 0, betrag = 0;
    for (const c of this.cartonsOn(t)) {
      if (this.storage.store(c.entity)) stored++;
      else {
        back++;
        betrag += c.menge * c.produkt.ek;
        this.world.remove(c.entity);
      }
    }
    if (stored) {
      const kosten = Math.round(stored * this.settings.fahrerAbladenProKarton * 100) / 100;
      this.player.charge(kosten, 'lieferung');
      this.events.emit('driverUnloaded', { kartons: stored, kosten });
    }
    if (back) {
      betrag = Math.round(betrag * 100) / 100;
      this.player.earn(betrag, 'rueckgabe');
      this.events.emit('returned', { kartons: back, betrag });
    }
  }

  private remove(t: TruckComponent): void {
    if (t.dock?.get(RampComponent)) t.dock.require(RampComponent).belegt = false;
    this.trucks.delete(t.entity);
    this.world.remove(t.entity);
    if (this.queue.length) this.dispatch();
  }

  /** Strecken hin und zurück: auf der Straße oder über die Zufahrt rückwärts an eine Rampe */
  /**
   * Strecken hin und zurück. Straße: vorbeifahren bis zum Halteplatz. Ladetor/Rampe: über das Fahrraster
   * bis vor das Tor, dann rückwärts heran (Heck am Tor, Front nach außen). null, wenn kein Weg frei ist.
   */
  private paths(dock: Entity | null): { anfahrt: RoutePoint[]; abfahrt: RoutePoint[] } | null {
    const r = this.route;
    const v = (x: number, z: number, y = r.hoehe) => new THREE.Vector3(x, y, z);
    const start = v(r.von, r.strasseZ), ende = v(r.bis, r.strasseZ);
    if (!dock) {
      return { anfahrt: [{ p: start }, { p: v(r.halt, r.strasseZ) }], abfahrt: [{ p: ende }] };
    }
    // Vorne (+X) ist die Andockseite: bei Wänden die Außenseite
    const o = dock.object;
    const fwd = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotation.y);
    const tiefe = dock.require(RampComponent).tiefe;
    const laenge = this.settings.lkw.groesse[0];
    const stop = o.position.clone().setY(0).addScaledVector(fwd, tiefe / 2 + laenge / 2 + 0.05);
    const vor = stop.clone().addScaledVector(fwd, laenge * 0.4 + 1);
    // Wegsuche nur im Gelände: vom Rand der Straße aus
    const rand = (x: number) => v(Math.min(this.bounds.maxX - 1, Math.max(this.bounds.minX + 1, x)), r.strasseZ);
    if (!this.corridorFree(dock, stop, vor, fwd)) return null;
    const hin = this.drive.findPath(rand(r.von), vor);
    const weg = this.drive.findPath(vor, rand(r.bis));
    if (!hin || !weg) return null;
    const pts = (list: { x: number; z: number }[]) => list.map((q) => ({ p: v(q.x, q.z, this.heightAt(q.z)) }));
    return {
      anfahrt: [{ p: start }, ...pts(hin), { p: vor }, { p: stop, rueckwaerts: true }],
      abfahrt: [{ p: vor }, ...pts(weg), { p: ende }],
    };
  }

  /** Ist die Fläche frei, auf der der LKW vor dem Tor steht und rangiert? (Stichproben alle 0,5 m) */
  private corridorFree(dock: Entity, stop: THREE.Vector3, vor: THREE.Vector3, fwd: THREE.Vector3): boolean {
    const [laenge, , breite] = this.settings.lkw.groesse;
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const back = stop.clone().addScaledVector(fwd, -laenge / 2 + 0.3);
    const lang = back.distanceTo(vor) + laenge / 2;
    const blockers = [...this.world.query(FootprintComponent)]
      .filter(([e, f]) => e !== dock && (f.ebene === 'objekt' || f.ebene === 'wand' || (f.ebene === 'boden' && !f.aussen)))
      .map(([, f]) => f.rect());
    const p = new THREE.Vector3();
    for (let a = 0; a <= lang; a += 0.5) for (let b = -(breite / 2 - 0.2); b <= breite / 2 - 0.2; b += 0.5) {
      p.copy(back).addScaledVector(fwd, a).addScaledVector(side, b);
      if (blockers.some((r) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ)) return false;
    }
    return true;
  }

  /** Auf der Straße etwas höher (Straßenbelag), sonst auf dem Gelände */
  private heightAt(z: number): number {
    return Math.abs(z - this.route.strasseZ) < 2.6 ? this.route.hoehe : 0;
  }
}
