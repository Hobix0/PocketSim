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
import { TerrainCutComponent } from '../components/TerrainCutComponent';
import type { TerrainCut } from './Terrain';
import { NavGrid, type Bounds } from '../navigation/NavGrid';
import { TruckComponent, type RoutePoint } from '../components/TruckComponent';
import { createCartonEntity } from '../factory/createProductEntity';
import { place, type CartonStorage } from './CartonStorage';
import { PalletPlacesComponent } from '../components/PalletPlacesComponent';
import { PalletComponent } from '../components/PalletComponent';
import { createPalletEntity, loadPallet } from '../factory/createPalletEntity';

const isPallet = (l: ShipmentLine) => (l.palette ?? 0) > 0;

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
    /** Eigene Geländeveränderung an einer Stelle (m); über Hügel und durch Gruben fährt kein LKW */
    gelaende?: (x: number, z: number) => number,
  ) {
    const l = settings.lkw;
    this.drive = new NavGrid(bounds, { zelle: l.fahrraster, radius: l.groesse[2] / 2 + 0.2 }, world, 'fahren',
      gelaende ? (x, z) => Math.abs(gelaende(x, z)) > 0.3 : undefined);
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

  /** Lose Kartons, die noch kommen oder auf einem LKW stehen (brauchen noch Lagerplatz) */
  onTrucks(): number {
    let n = this.queue.filter((l) => !isPallet(l)).length;
    for (const e of this.trucks) {
      const t = e.require(TruckComponent);
      n += t.state === 'anfahrt' ? t.ladung.filter((l) => !isPallet(l)).length : t.ladeflaeche.used;
    }
    return n;
  }

  /** Paletten, die noch kommen oder auf einem LKW stehen (brauchen noch einen Palettenplatz) */
  palletsOnTrucks(): number {
    let n = this.queue.filter(isPallet).length;
    for (const e of this.trucks) n += e.require(TruckComponent).paletten;
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
      else {
        out.push(...this.cartonsOn(t).map((c) => ({ produkt: c.produkt.id, menge: c.menge })));
        for (const p of this.palletsOn(t)) {
          const pc = p.require(PalletComponent);
          const first = pc.cartons()[0]?.get(CartonComponent);
          if (first) out.push({ produkt: first.produkt.id, menge: first.menge, palette: pc.kartons });
        }
      }
    }
    return out.map((k) => ({ ...k }));
  }

  /** Ladefläche eines LKW: die Kartons darauf */
  cartonsOn(t: TruckComponent): CartonComponent[] {
    const ids = new Set(t.ladeflaeche.entityIds);
    return [...this.world.query(CartonComponent)].filter(([e]) => ids.has(e.id)).map(([, c]) => c);
  }

  /** Paletten auf der Ladefläche eines LKW */
  palletsOn(t: TruckComponent): Entity[] {
    return t.entity.get(PalletPlacesComponent)?.pallets() ?? [];
  }

  // ── intern ──────────────────────────────────────────────────────

  /** Freie Halteplätze mit LKW besetzen, solange Ware wartet */
  private dispatch(): void {
    while (this.queue.length) {
      const dock = this.freeDock();
      if (dock === undefined) return;
      // Ein LKW fährt entweder Paletten oder lose Kartons
      const pal = isPallet(this.queue[0]);
      const cap = pal ? this.palletCapacity() : this.capacity();
      const ladung: ShipmentLine[] = [];
      for (let i = 0; i < this.queue.length && ladung.length < cap;) {
        if (isPallet(this.queue[i]) === pal) ladung.push(...this.queue.splice(i, 1)); else i++;
      }
      this.spawn(ladung, dock);
    }
  }

  private palletCapacity(): number {
    return this.makePalletPlaces().capacity;
  }

  /** Palettenplätze auf der Ladefläche: zwei nebeneinander, so viele hintereinander, wie passen; Zugang von hinten */
  private makePalletPlaces(): PalletPlacesComponent {
    const l = this.settings.lkw.ladeflaeche;
    const [pl, , pb] = this.ctx.content.lager.palette.groesse;
    const slots: THREE.Vector3[] = [];
    const reihen = Math.max(1, Math.floor((l.bis - l.von) / pl)), quer = Math.max(1, Math.floor(l.breite / pb));
    // Hinten (kleines X) zuerst, damit die ersten Paletten gleich an der Kante stehen
    for (let i = 0; i < reihen; i++) for (let j = 0; j < quer; j++) {
      slots.push(new THREE.Vector3(l.von + pl * (i + 0.5), l.hoehe, (j - (quer - 1) / 2) * (pb + 0.05)));
    }
    const places = new PalletPlacesComponent(slots, true);
    places.nurVonHinten = true;
    return places;
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
    const { anfahrt, abfahrt, abgesenkt } = way;
    const lkw = this.settings.lkw;
    const [laenge, hoehe, breite] = lkw.groesse;
    const e = new Entity('lkw');
    e.object.position.copy(anfahrt[0].p);
    e.add(new ModelComponent({ groesse: [laenge, hoehe, breite], farbe: '#d9dde0' }, lkw.model, this.ctx.models));
    e.add(new SelectableComponent('lkw', this.ctx.content.text('lkw_name'), this.ctx.content.kontexte.lkw?.name ?? 'LKW'));
    e.add(this.makeSurface());
    e.add(this.makePalletPlaces());
    // Scheinwerfer, Rück- und Begrenzungsleuchten, Blinker
    if (lkw.licht) e.add(new LampComponent(lkw.licht));
    const truck = new TruckComponent(ladung, anfahrt.slice(1), abfahrt, lkw.geschwindigkeit, dock, {
      arrived: (t) => this.unloadOntoBed(t),
      left: (t) => this.remove(t),
      text: (k, v) => this.ctx.content.text(k, v),
    }, laenge);
    truck.abgesenkt = !!abgesenkt;
    e.add(truck);
    // Erst drehen (Fahrtrichtung), dann neigen (an der Schräge)
    e.object.rotation.order = 'YZX';
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
    const places = t.entity.get(PalletPlacesComponent);
    for (const k of t.ladung) {
      const produkt = this.ctx.content.waren.find(k.produkt);
      if (!produkt) continue;
      if (isPallet(k)) {
        const slot = places ? places.slots.findIndex((_, i) => places.isFree(i)) : -1;
        if (!places || slot < 0) { this.queue.push(k); continue; }
        const pallet = this.world.add(createPalletEntity(this.ctx));
        pallet.require(PalletComponent).stand(places, slot);
        loadPallet(pallet, produkt, k.palette!, k.menge, this.ctx);
        continue;
      }
      const carton = createCartonEntity(produkt, k.menge, this.ctx);
      this.world.add(carton);
      if (!place(carton, bed)) { this.world.remove(carton); this.queue.push(k); }
    }
    t.ladung.splice(0);
    t.wartet = this.settings.wartezeitMinuten;
    this.events.emit('arrived', { truck: t.entity, kartons: bed.used + (places?.used ?? 0) });
  }

  /** Wartezeit vorbei: Fahrer stellt den Rest ins Lager (gegen Gebühr) oder nimmt ihn zurück */
  private driverUnload(t: TruckComponent): void {
    let stored = 0, back = 0, betrag = 0;
    // Paletten stellt der Fahrer mit seinem Hubwagen auf freie Palettenplätze (zählen wie Kartons)
    for (const p of this.palletsOn(t)) {
      if (this.storage.storePallet(p)) { stored++; continue; }
      back++;
      for (const c of p.require(PalletComponent).cartons()) { const k = c.require(CartonComponent); betrag += k.menge * k.produkt.ek; }
      this.world.remove(p);
    }
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
  private paths(dock: Entity | null): { anfahrt: RoutePoint[]; abfahrt: RoutePoint[]; abgesenkt?: boolean } | null {
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
    // Wegsuche nur im Gelände: vom Rand der Straße aus
    const rand = (x: number) => v(Math.min(this.bounds.maxX - 1, Math.max(this.bounds.minX + 1, x)), r.strasseZ);
    const pts = (list: { x: number; z: number }[]) => list.map((q) => ({ p: v(q.x, q.z, this.heightAt(q.z)) }));
    const wege = (vor: THREE.Vector3) => {
      const hin = this.drive.findPath(rand(r.von), vor);
      const weg = this.drive.findPath(vor, rand(r.bis));
      return hin && weg ? { hin: pts(hin), weg: pts(weg) } : null;
    };

    // Abgesenkte Rampe davor? Dann rückwärts die Schräge hinunter bis ans Tor (Ladefläche bündig mit dem Hallenboden)
    const cut = this.descentFor(dock, fwd);
    if (cut) {
      const s0 = new THREE.Vector3(cut.x, 0, cut.z);
      const stop = s0.clone().addScaledVector(fwd, 0.3 + laenge / 2).setY(-cut.tiefe);
      const unten = s0.clone().addScaledVector(fwd, cut.flach).setY(-cut.tiefe);
      const oben = s0.clone().addScaledVector(fwd, cut.flach + cut.schraege).setY(0);
      const vor = oben.clone().addScaledVector(fwd, laenge * 0.4 + 1);
      if (!this.corridorFree(dock, oben, vor, fwd)) return null;
      const w = wege(vor);
      if (!w) return null;
      return {
        anfahrt: [{ p: start }, ...w.hin, { p: vor }, { p: oben, rueckwaerts: true }, { p: unten, rueckwaerts: true }, { p: stop, rueckwaerts: true }],
        abfahrt: [{ p: unten }, { p: oben }, { p: vor }, ...w.weg, { p: ende }],
        abgesenkt: true,
      };
    }

    // Ebenerdiges Tor: davor halten, rückwärts heran, Ladebordwand herunter
    const stop = o.position.clone().setY(0).addScaledVector(fwd, tiefe / 2 + laenge / 2 + 0.05);
    const vor = stop.clone().addScaledVector(fwd, laenge * 0.4 + 1);
    if (!this.corridorFree(dock, stop, vor, fwd)) return null;
    const w = wege(vor);
    if (!w) return null;
    return {
      anfahrt: [{ p: start }, ...w.hin, { p: vor }, { p: stop, rueckwaerts: true }],
      abfahrt: [{ p: vor }, ...w.weg, { p: ende }],
    };
  }

  /** Rampenabfahrt direkt vor diesem Tor (gleiche Richtung), sonst null */
  private descentFor(dock: Entity, fwd: THREE.Vector3): TerrainCut | null {
    const tiefe = dock.require(RampComponent).tiefe;
    const p = dock.object.position.clone().addScaledVector(fwd, tiefe / 2);
    for (const [, c] of this.world.query(TerrainCutComponent)) {
      const cut = c.cut();
      if (Math.hypot(cut.x - p.x, cut.z - p.z) < 0.4 && cut.dx * fwd.x + cut.dz * fwd.z > 0.99) return cut;
    }
    return null;
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
