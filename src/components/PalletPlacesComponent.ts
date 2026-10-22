import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Entity } from '../ecs/Entity';
import type { Describable, InfoRow } from '../ui/describe';
import { FootprintComponent } from './FootprintComponent';

// Palettenplätze: Stellen, an denen ganze Paletten stehen – nebeneinander auf einer Traverse (offenes Fach),
// ein Bodenstellplatz oder die Ladefläche eines LKW (`temporaer`). Paletten liegen mit der langen Seite
// entlang lokal X (Regaltiefe), nebeneinander entlang lokal Z. Ein Platz kann für eine Palette reserviert sein,
// die gerade gebracht wird.

export class PalletPlacesComponent extends Component implements Describable {
  /** Mitte der Unterkante jeder Palette, lokal */
  readonly slots: THREE.Vector3[];
  private readonly belegt = new Map<number, Entity>();
  private readonly reserviert = new Map<number, number>();

  /** LKW: nur von hinten (lokal −X) anfahren */
  nurVonHinten = false;

  constructor(slots: THREE.Vector3[], readonly temporaer = false) {
    super();
    this.slots = slots;
  }

  /** Einen bestimmten Platz reservieren (z. B. für die Rückkehr einer Palette); false, wenn er belegt ist */
  reserveAt(slot: number, palletId: number): boolean {
    if (this.belegt.has(slot) || this.reserviert.has(slot)) return false;
    this.reserviert.set(slot, palletId);
    return true;
  }

  /** Gleichmäßig verteilte Plätze entlang lokal Z auf einer Höhe */
  static row(anzahl: number, laenge: number, hoehe: number): THREE.Vector3[] {
    const w = laenge / anzahl;
    return Array.from({ length: anzahl }, (_, i) => new THREE.Vector3(0, hoehe, -laenge / 2 + w * (i + 0.5)));
  }

  get capacity(): number {
    return this.slots.length;
  }

  get used(): number {
    return this.belegt.size;
  }

  /** Freie, nicht reservierte Plätze */
  get free(): number {
    let n = 0;
    for (let i = 0; i < this.slots.length; i++) if (!this.belegt.has(i) && !this.reserviert.has(i)) n++;
    return n;
  }

  /** Höhe der Plätze über dem Boden darunter (m) */
  get hoehe(): number {
    if (!this.slots.length) return 0;
    return this.slotWorld(0).y - this.bodenY();
  }

  private boden: number | null = null;

  /** Oberkante des Bodens unter dem Bauteil (einmal gesucht, dann gemerkt); ohne Boden 0 */
  private bodenY(): number {
    if (this.boden !== null) return this.boden;
    const p = this.entity.object.position;
    let y: number | null = null;
    for (const [e, f] of this.entity.world?.query(FootprintComponent) ?? []) {
      if (e === this.entity || f.ebene !== 'boden') continue;
      const r = f.rect();
      if (p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ) y = Math.max(y ?? -Infinity, f.top());
    }
    // Nur merken, wenn ein Boden gefunden wurde (beim Laden kommt er evtl. erst später)
    if (y !== null) this.boden = y;
    return y ?? 0;
  }

  /** Platz weder belegt noch reserviert? */
  isFree(slot: number): boolean {
    return !this.belegt.has(slot) && !this.reserviert.has(slot);
  }

  pallets(): Entity[] {
    return [...this.belegt.values()];
  }

  /** Einen freien Platz für eine Palette reservieren; -1, wenn keiner frei ist */
  reserve(palletId: number): number {
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.belegt.has(i) && !this.reserviert.has(i)) { this.reserviert.set(i, palletId); return i; }
    }
    return -1;
  }

  unreserve(palletId: number): void {
    for (const [i, id] of this.reserviert) if (id === palletId) this.reserviert.delete(i);
  }

  /** Palette auf einen Platz stellen (reserviert oder frei); false, wenn er belegt ist */
  put(slot: number, pallet: Entity): boolean {
    if (slot < 0 || slot >= this.slots.length || this.belegt.has(slot)) return false;
    const r = this.reserviert.get(slot);
    if (r !== undefined && r !== pallet.id) return false;
    this.reserviert.delete(slot);
    this.belegt.set(slot, pallet);
    this.notifyChanged();
    return true;
  }

  /** Palette wegnehmen (Platz wird frei) */
  take(pallet: Entity): void {
    for (const [i, e] of this.belegt) if (e === pallet) this.belegt.delete(i);
    this.notifyChanged();
  }

  slotOf(pallet: Entity): number {
    for (const [i, e] of this.belegt) if (e === pallet) return i;
    return -1;
  }

  /** Weltposition eines Platzes */
  slotWorld(slot: number): THREE.Vector3 {
    this.entity.object.updateWorldMatrix(true, false);
    return this.entity.object.localToWorld(this.slots[slot].clone());
  }

  /** Wo das Fahrzeug steht, um eine Palette auf diesem Platz aufzunehmen: `reichweite` vor dem Platz (lokal ±X).
   *  Die LKW-Ladefläche wird nur von hinten (lokal −X) angefahren. */
  zugang(slot: number, reichweite: number): THREE.Vector3[] {
    const o = this.entity.object;
    const out: THREE.Vector3[] = [];
    for (const s of this.nurVonHinten ? [-1] : [1, -1]) {
      const p = this.slots[slot].clone();
      p.x += s * reichweite;
      // Höhe zählt nicht: der Weg läuft auf dem Boden, auf dem die Figur steht
      out.push(o.localToWorld(p).setY(0));
    }
    return out;
  }

  describe(): InfoRow[] {
    return [{ label: 'Palettenplätze', value: `${this.belegt.size} / ${this.slots.length} belegt` }];
  }
}
