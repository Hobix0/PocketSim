import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Entity } from '../ecs/Entity';
import type { Employee } from '../economy/Staff';
import type { StorageSettings, VehicleKind } from '../content/definitions';
import type { ModelProvider } from '../assets/ModelLibrary';
import type { Describable, InfoRow } from '../ui/describe';
import type { PalletJob, PalletTarget } from '../economy/PalletLogistics';
import { PathFollower, turnTowards, type PathFinder } from '../navigation/PathFollower';
import { PalletComponent } from './PalletComponent';
import type { PalletPlacesComponent } from './PalletPlacesComponent';
import { VehicleComponent } from './VehicleComponent';
import { CartonComponent } from './CartonComponent';
import { ShelfComponent } from './ShelfComponent';
import { FootprintComponent } from './FootprintComponent';
import { stockFromCarton } from '../economy/Stocking';
import { formatMoney } from '../ui/format';

// Staplerfahrer: holt sich ein Fahrzeug (Gabelstapler oder Hubwagen), fährt Paletten und stellt das Fahrzeug
// danach wieder an seinen Parkplatz. Eine Aufgabe ist eine Folge von Schritten:
//   zum Fahrzeug gehen → aufsitzen → an die Palette fahren → Gabel heben → aufnehmen → Gabel senken
//   → zum Ziel fahren → Gabel heben → absetzen (oder am Verkaufsregal Karton für Karton einräumen)
//   → Gabel senken → zurück zum Parkplatz → absteigen.
// Die Palette hängt währenddessen an der Gabel; ihre Kartons wandern mit (PalletComponent).

export type PalletDriverState = 'wartet' | 'zum_fahrzeug' | 'faehrt' | 'hebt' | 'nimmt' | 'setzt' | 'raeumt' | 'parkt';

export interface PalletDriverServices {
  findJob(): PalletJob | null;
  findPath?: PathFinder;
  /** Ist diese Stelle begehbar? (für die Wahl der Seite, von der aus eine Palette angefahren wird) */
  walkable?(x: number, z: number): boolean;
  gehgeschwindigkeit: number;
  lager: StorageSettings;
  models?: ModelProvider;
  /** Palette ist leer geräumt und kommt weg */
  palletEmptied?(pallet: Entity): void;
  rollenName: string;
  text(key: string, werte?: Record<string, string | number>): string;
}

type Step =
  | { kind: 'gehen'; ziel: THREE.Vector3 }
  | { kind: 'aufsitzen' }
  | { kind: 'fahren'; ziel: THREE.Vector3; blick: THREE.Vector3 }
  | { kind: 'heben'; hoehe: number }
  | { kind: 'aufnehmen' }
  | { kind: 'absetzen'; ziel: PalletTarget }
  | { kind: 'einraeumen'; regal: Entity }
  | { kind: 'zurueck' }
  | { kind: 'absteigen' };

const FAHRHOEHE = 0.1;

export class PalletDriverComponent extends Component implements Describable {
  state: PalletDriverState = 'wartet';
  private job: PalletJob | null = null;
  private steps: Step[] = [];
  private timer = 0;
  private wait = 1;
  private readonly path = new PathFollower();
  private pathSet = false;
  /** Fahrzeug, auf dem die Figur gerade sitzt, mit Modell und Gabel */
  private vehicle: { entity: Entity; art: VehicleKind; group: THREE.Group; gabel: THREE.Object3D | null; park: THREE.Vector3; parkRot: number } | null = null;
  private carried: Entity | null = null;
  /** Gabelhöhe über dem Boden (m) */
  private lift = FAHRHOEHE;
  /** Platz, auf den die Palette nach dem Auffüllen zurückkommt */
  private zurueck: PalletTarget | null = null;

  constructor(readonly employee: Employee, private readonly services: PalletDriverServices) {
    super();
  }

  override update(dt: number): void {
    if (dt <= 0) return;
    this.carry();
    if (this.state === 'wartet' && !this.steps.length) {
      this.wait -= dt;
      if (this.wait <= 0) this.start();
      return;
    }
    if (this.job && !this.valid()) { this.abort(); return; }
    const step = this.steps[0];
    if (!step) { this.done(); return; }
    if (this.run(step, dt)) { this.steps.shift(); this.pathSet = false; }
  }

  override onDetach(): void {
    this.abort(true);
  }

  statusText(): string {
    const p = this.job?.pallet.get(PalletComponent)?.produkt?.name ?? '';
    const key = this.job && this.state === 'faehrt' ? `palette_${this.job.art}` : `palette_status_${this.state}`;
    return this.services.text(key, { produkt: p });
  }

  describe(): InfoRow[] {
    return [
      { label: 'Rolle', value: this.services.rollenName },
      { label: 'Lohn', value: `${formatMoney(this.employee.lohn)} / Tag` },
      { label: 'Tempo', value: `${Math.round(this.employee.tempo * 100)} %` },
      { label: 'Fährt', value: this.vehicle ? this.services.text(`fahrzeug_${this.vehicle.art}`) : '–' },
      { label: 'Gerade', value: this.statusText() },
    ];
  }

  // ── Ablauf ──────────────────────────────────────────────────────

  private start(): void {
    const job = this.services.findJob();
    if (!job) { this.wait = 1.5; return; }
    this.job = job;
    const pc = job.pallet.require(PalletComponent);
    pc.reservedBy = this.entity.id;
    job.fahrzeug.require(VehicleComponent).fahrer = this.entity.id;
    const kind = job.fahrzeug.require(VehicleComponent).art;
    const f = this.services.lager.fahrzeuge[kind];
    const von = pc.platz;
    const pick = von ? this.approach(von.places, von.slot, f.vorn) : this.approachPoint(job.pallet.object.position, f.vorn);
    this.steps = [
      { kind: 'gehen', ziel: job.fahrzeug.object.position.clone() },
      { kind: 'aufsitzen' },
      { kind: 'fahren', ziel: pick, blick: job.pallet.object.position.clone() },
      { kind: 'heben', hoehe: von ? von.places.slotWorld(von.slot).y - this.floor() : 0 },
      { kind: 'aufnehmen' },
      { kind: 'heben', hoehe: FAHRHOEHE },
    ];
    if (job.art === 'auffuellen') {
      const r = job.regal;
      const n = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), r.object.rotation.y);
      const tiefe = r.get(FootprintComponent)?.groesse[0] ?? 0.6;
      const vorRegal = r.object.position.clone().addScaledVector(n, tiefe / 2 + 0.75 + f.vorn).setY(0);
      this.steps.push({ kind: 'fahren', ziel: vorRegal, blick: r.object.position.clone() }, { kind: 'einraeumen', regal: r });
      // Zurück an den alten Platz (wird beim Aufnehmen reserviert)
      if (von) this.zurueck = { places: von.places, slot: von.slot };
    } else {
      this.pushDrop(job.ziel, f.vorn);
    }
    this.steps.push({ kind: 'zurueck' }, { kind: 'absteigen' });
    this.state = 'zum_fahrzeug';
    this.notifyChanged();
  }

  private pushDrop(ziel: PalletTarget, vorn: number): void {
    const hoehe = ziel.places.slotWorld(ziel.slot).y - this.floor();
    this.steps.push(
      { kind: 'fahren', ziel: this.approach(ziel.places, ziel.slot, vorn), blick: ziel.places.slotWorld(ziel.slot) },
      { kind: 'heben', hoehe: Math.max(hoehe + 0.08, FAHRHOEHE) },
      { kind: 'absetzen', ziel },
      { kind: 'heben', hoehe: FAHRHOEHE },
    );
  }

  /** Einen Schritt ausführen; true, wenn er fertig ist */
  private run(step: Step, dt: number): boolean {
    const o = this.entity.object;
    const f = this.vehicle ? this.services.lager.fahrzeuge[this.vehicle.art] : null;
    switch (step.kind) {
      case 'gehen': {
        if (!this.pathSet) { this.goTo(step.ziel, 1.2); this.state = 'zum_fahrzeug'; this.notifyChanged(); }
        return this.path.step(o, this.services.gehgeschwindigkeit * this.employee.tempo, dt);
      }
      case 'aufsitzen':
        this.mount();
        return true;
      case 'fahren': {
        if (!this.pathSet) { this.goTo(step.ziel, 0); this.state = 'faehrt'; this.notifyChanged(); }
        if (!this.path.step(o, (f?.tempo ?? 1.5) * this.employee.tempo, dt)) return false;
        // Am Ziel: genau ausrichten (zur Palette bzw. zum Regal schauen)
        const want = Math.atan2(step.blick.x - o.position.x, step.blick.z - o.position.z);
        turnTowards(o, want, dt, 6);
        return Math.abs(Math.atan2(Math.sin(want - o.rotation.y), Math.cos(want - o.rotation.y))) < 0.05;
      }
      case 'heben': {
        if (this.state !== 'hebt') { this.state = 'hebt'; this.notifyChanged(); }
        const ziel = Math.min(step.hoehe, f?.maxHoehe ?? 0);
        const d = ziel - this.lift, v = (f?.hub ?? 0.4) * dt;
        this.lift += Math.sign(d) * Math.min(Math.abs(d), v);
        this.updateFork();
        return Math.abs(ziel - this.lift) < 1e-3;
      }
      case 'aufnehmen': {
        if (this.state !== 'nimmt') { this.state = 'nimmt'; this.timer = this.services.lager.sekundenAufnehmen / this.employee.tempo; this.notifyChanged(); }
        this.timer -= dt;
        if (this.timer > 0) return false;
        const pc = this.job!.pallet.require(PalletComponent);
        const von = pc.platz;
        pc.leave();
        if (von && this.zurueck) von.places.reserveAt(von.slot, this.job!.pallet.id);
        this.carried = this.job!.pallet;
        return true;
      }
      case 'absetzen': {
        if (this.state !== 'setzt') { this.state = 'setzt'; this.timer = this.services.lager.sekundenAufnehmen / this.employee.tempo; this.notifyChanged(); }
        this.timer -= dt;
        if (this.timer > 0) return false;
        const pallet = this.carried;
        if (pallet) {
          const pc = pallet.require(PalletComponent);
          if (!pc.stand(step.ziel.places, step.ziel.slot)) this.dropOnFloor();
          pc.reservedBy = null;
        }
        this.carried = null;
        return true;
      }
      case 'einraeumen': {
        if (this.state !== 'raeumt') { this.state = 'raeumt'; this.timer = this.perCarton(); this.notifyChanged(); }
        const r = step.regal;
        turnTowards(o, Math.atan2(r.object.position.x - o.position.x, r.object.position.z - o.position.z), dt, 6);
        this.timer -= dt;
        if (this.timer > 0) return false;
        const pallet = this.carried;
        const pc = pallet?.get(PalletComponent);
        const carton = pc?.cartons()[0];
        if (!pallet || !pc || !carton || !r.world) return this.afterRestock();
        const result = stockFromCarton(carton, r);
        if (!result.ok || !result.leer) return this.afterRestock();
        if (!pc.kartons) return this.afterRestock();
        // Passt noch ein Karton? Sonst fertig
        const next = pc.cartons()[0]?.get(CartonComponent);
        if (!next || r.require(ShelfComponent).space(next.produkt) <= 0) return this.afterRestock();
        this.timer = this.perCarton();
        return false;
      }
      case 'zurueck': {
        if (!this.vehicle) return true;
        if (!this.pathSet) { this.goTo(this.vehicle.park, 0); this.state = 'parkt'; this.notifyChanged(); }
        if (!this.path.step(o, (f?.tempo ?? 1.5) * this.employee.tempo, dt)) return false;
        const want = this.vehicle.parkRot + Math.PI / 2;
        turnTowards(o, want, dt, 6);
        return Math.abs(Math.atan2(Math.sin(want - o.rotation.y), Math.cos(want - o.rotation.y))) < 0.08;
      }
      case 'absteigen':
        this.dismount();
        return true;
    }
  }

  /** Nach dem Einräumen: leere Palette weg, sonst zurück an ihren Platz (oder einen anderen freien) */
  private afterRestock(): boolean {
    const pallet = this.carried;
    const f = this.vehicle ? this.services.lager.fahrzeuge[this.vehicle.art] : null;
    const pc = pallet?.get(PalletComponent);
    if (pallet && pc && pc.kartons === 0) {
      this.zurueck?.places.unreserve(pallet.id);
      this.zurueck = null;
      this.carried = null;
      this.services.palletEmptied?.(pallet);
      pallet.world?.remove(pallet);
      return true;
    }
    if (pallet && this.zurueck && f) {
      // Der eigene Platz ist reserviert: dorthin zurück
      const ziel = this.zurueck;
      this.zurueck = null;
      const rest: Step[] = [];
      const hoehe = ziel.places.slotWorld(ziel.slot).y - this.floor();
      rest.push(
        { kind: 'heben', hoehe: FAHRHOEHE },
        { kind: 'fahren', ziel: this.approach(ziel.places, ziel.slot, f.vorn), blick: ziel.places.slotWorld(ziel.slot) },
        { kind: 'heben', hoehe: Math.max(hoehe + 0.08, FAHRHOEHE) },
        { kind: 'absetzen', ziel },
        { kind: 'heben', hoehe: FAHRHOEHE },
      );
      this.steps.splice(1, 0, ...rest);
      return true;
    }
    // Kein Platz bekannt: dort abstellen, wo sie ist
    if (pallet) { this.dropOnFloor(); pc!.reservedBy = null; this.carried = null; }
    return true;
  }

  private perCarton(): number {
    return this.services.lager.palettenEinraeumenSekundenProKarton / this.employee.tempo;
  }

  private done(): void {
    if (this.job) {
      const pc = this.job.pallet.get(PalletComponent);
      if (pc && pc.reservedBy === this.entity.id) pc.reservedBy = null;
    }
    this.job = null;
    this.state = 'wartet';
    this.wait = 0.5;
    this.notifyChanged();
  }

  /** Gibt es noch alles, was die restlichen Schritte brauchen? */
  private valid(): boolean {
    const j = this.job!;
    if (!j.fahrzeug.world) return false;
    const offen = (k: Step['kind']) => this.steps.some((s) => s.kind === k);
    // Palette weg (abgerissenes Regal, Spielstand …), obwohl sie noch gebraucht wird
    if (!j.pallet.world && (offen('aufnehmen') || offen('absetzen') || offen('einraeumen'))) return false;
    for (const s of this.steps) {
      if (s.kind === 'einraeumen' && !s.regal.world) return false;
      if (s.kind === 'absetzen' && !s.ziel.places.entity.world) return false;
    }
    // Noch nicht aufgenommen, aber jemand anderes hat die Palette bewegt
    if (offen('aufnehmen') && j.pallet.get(PalletComponent)?.reservedBy !== this.entity.id) return false;
    return true;
  }

  /** Aufgabe abbrechen: Palette abstellen, Reservierungen lösen, Fahrzeug zurück an den Parkplatz */
  private abort(entlassen = false): void {
    const j = this.job;
    if (j) {
      if (j.art !== 'auffuellen') j.ziel.places.unreserve(j.pallet.id);
      this.zurueck?.places.unreserve(j.pallet.id);
      const pc = j.pallet.get(PalletComponent);
      if (pc && pc.reservedBy === this.entity.id) pc.reservedBy = null;
    }
    if (this.carried?.world) this.dropOnFloor();
    this.carried = null;
    this.zurueck = null;
    this.dismount();
    const v = j?.fahrzeug.get(VehicleComponent);
    if (v && v.fahrer === this.entity.id) v.fahrer = null;
    this.job = null;
    this.steps = [];
    this.state = 'wartet';
    this.wait = entlassen ? 0 : 2;
    this.notifyChanged();
  }

  // ── Fahrzeug und Palette ────────────────────────────────────────

  private mount(): void {
    const e = this.job!.fahrzeug;
    const art = e.require(VehicleComponent).art;
    const f = this.services.lager.fahrzeuge[art];
    const group = new THREE.Group();
    // Modell-Vorderseite ist +X, die Figur schaut nach +Z
    group.rotation.y = -Math.PI / 2;
    group.position.set(0, 0, f.modellVersatz);
    this.entity.object.add(group);
    let gabel: THREE.Object3D | null = null;
    const models = this.services.models;
    if (models) {
      models.instance(f.model).then((m) => group.add(m), () => {});
      if (f.gabel) {
        const g = new THREE.Group();
        gabel = g;
        models.instance(f.gabel).then((m) => g.add(m), () => {});
        group.add(g);
      }
    }
    this.vehicle = { entity: e, art, group, gabel, park: e.object.position.clone(), parkRot: e.object.rotation.y };
    e.object.visible = false;
    // Auf den Fahrersitz
    this.entity.object.position.set(e.object.position.x, this.entity.object.position.y, e.object.position.z);
    this.entity.object.rotation.y = e.object.rotation.y + Math.PI / 2;
    this.lift = FAHRHOEHE;
    this.updateFork();
  }

  private dismount(): void {
    const v = this.vehicle;
    if (!v) return;
    this.entity.object.remove(v.group);
    v.entity.object.visible = true;
    const vc = v.entity.get(VehicleComponent);
    if (vc) vc.fahrer = null;
    // Neben das Fahrzeug treten
    const side = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), v.parkRot).multiplyScalar(0.9);
    this.entity.object.position.set(v.park.x + side.x, this.entity.object.position.y, v.park.z + side.z);
    this.vehicle = null;
  }

  /** Gabelträger auf die aktuelle Hubhöhe */
  private updateFork(): void {
    const v = this.vehicle;
    if (!v?.gabel) return;
    const f = this.services.lager.fahrzeuge[v.art];
    // Gabelträger-Modell: Mitte 0,95 m vor der Fahrzeugmitte, Unterkante 3 Würfel über dem Boden
    v.gabel.position.set(0.95, Math.max(0, this.lift - f.gabelY), 0);
  }

  /** Getragene Palette an die Gabel hängen */
  private carry(): void {
    const p = this.carried;
    const v = this.vehicle;
    if (!p || !v) return;
    const f = this.services.lager.fahrzeuge[v.art];
    const o = this.entity.object;
    const fwd = new THREE.Vector3(Math.sin(o.rotation.y), 0, Math.cos(o.rotation.y));
    p.object.position.set(o.position.x + fwd.x * f.vorn, this.floor() + Math.max(this.lift, f.gabelY), o.position.z + fwd.z * f.vorn);
    p.object.rotation.y = o.rotation.y - Math.PI / 2;
  }

  /** Getragene Palette dort abstellen, wo sie gerade ist (auf dem Boden) */
  private dropOnFloor(): void {
    const p = this.carried;
    if (!p?.world) return;
    const pc = p.require(PalletComponent);
    pc.leave();
    p.object.position.y = this.floor();
    pc.reservedBy = null;
  }

  private floor(): number {
    return this.entity.object.position.y;
  }

  // ── Wege ────────────────────────────────────────────────────────

  /** Anfahrpunkt vor einem Palettenplatz: die begehbare Seite, die näher liegt */
  private approach(places: PalletPlacesComponent, slot: number, vorn: number): THREE.Vector3 {
    const cands = places.zugang(slot, vorn);
    const me = this.entity.object.position;
    const ok = cands.filter((c) => this.services.walkable?.(c.x, c.z) ?? true);
    const list = ok.length ? ok : cands;
    return list.sort((a, b) => a.distanceToSquared(me) - b.distanceToSquared(me))[0];
  }

  /** Anfahrpunkt für eine lose abgestellte Palette: von der Seite, auf der man gerade ist */
  private approachPoint(p: THREE.Vector3, vorn: number): THREE.Vector3 {
    const me = this.entity.object.position;
    const dir = new THREE.Vector3(me.x - p.x, 0, me.z - p.z);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    return p.clone().addScaledVector(dir.normalize(), vorn).setY(0);
  }

  private goTo(p: THREE.Vector3, keep: number): void {
    const pos = this.entity.object.position;
    const target = new THREE.Vector3(p.x, pos.y, p.z);
    if (keep > 0) {
      const dir = new THREE.Vector3().subVectors(pos, target).setY(0);
      if (dir.lengthSq() > 1e-6) target.addScaledVector(dir.normalize(), keep);
    }
    this.path.goTo(this.entity.object, target, this.services.findPath);
    this.pathSet = true;
  }
}
