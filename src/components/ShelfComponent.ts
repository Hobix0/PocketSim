import * as THREE from 'three';
import { InteractableComponent, type InteractionOption } from '../interaction/InteractableComponent';
import type { ProductDef, ShelfDef } from '../content/definitions';
import type { ModelProvider } from '../assets/ModelLibrary';
import type { GameActions } from '../factory/FactoryContext';
import type { Describable, InfoRow } from '../ui/describe';

// Regal mit Fächern. Jedes Fach nimmt genau ein Produkt auf, bis zur Kapazität.
// Gekühlte Ware passt nur in Regale mit Kühlung.
// Hat das Regal Ebenen (Höhen der Böden), steht die Ware sichtbar auf den Böden.
// Mit einem Karton in der Hand bietet das Regal "Einräumen" an, sonst "Belegen" (Fenster für feste Plätze).
// Feste Zuordnung: Ein Fach kann einem Produkt fest gehören – dann kommt nur dieses Produkt hinein,
// auch wenn das Fach gerade leer ist. Auffüller räumen so ein Produkt nur noch in seine festen Fächer.

export interface Fach {
  produkt: ProductDef | null;
  menge: number;
  /** Festes Produkt dieses Fachs (oder frei) */
  fest: ProductDef | null;
}

/** Gespeicherter Inhalt eines Fachs */
export interface FachState {
  produkt: string | null;
  menge: number;
  fest?: string | null;
}

export class ShelfComponent extends InteractableComponent implements Describable {
  override readonly kontext = 'regal';
  readonly faecher: Fach[];
  private readonly visuals: (THREE.Group | null)[];

  constructor(
    readonly def: ShelfDef,
    private readonly models?: ModelProvider,
    private readonly actions?: GameActions,
  ) {
    super();
    this.faecher = Array.from({ length: def.faecher }, () => ({ produkt: null, menge: 0, fest: null }));
    this.visuals = this.faecher.map(() => null);
  }

  get kuehlung(): boolean {
    return this.def.kuehlung;
  }

  get kapazitaet(): number {
    return this.def.kapazitaet;
  }

  /** Gesamtzahl Waren im Regal. */
  get bestand(): number {
    return this.faecher.reduce((n, f) => n + f.menge, 0);
  }

  /** Darf dieses Produkt in das Fach? (festes Produkt passt, kein anderes Produkt drin) */
  accepts(f: Fach, p: ProductDef): boolean {
    return (!f.fest || f.fest.id === p.id) && (!f.produkt || f.produkt.id === p.id);
  }

  /**
   * Wie viele Stück dieses Produkts passen gerade hinein? (0, wenn die Kühlung fehlt)
   * `nurFest`: nur Fächer zählen, die diesem Produkt fest gehören
   */
  space(p: ProductDef, nurFest = false): number {
    if (p.kuehlung && !this.def.kuehlung) return 0;
    let free = 0;
    for (const f of this.faecher) {
      if (!this.accepts(f, p) || (nurFest && f.fest?.id !== p.id)) continue;
      free += this.def.kapazitaet - f.menge;
    }
    return free;
  }

  /** Platz (Stück), der einem Produkt fest gehört */
  festPlatz(produktId: string): number {
    return this.faecher.filter((f) => f.fest?.id === produktId).length * this.def.kapazitaet;
  }

  /** Stück eines Produkts im Regal */
  menge(produktId: string): number {
    return this.faecher.reduce((n, f) => n + (f.produkt?.id === produktId ? f.menge : 0), 0);
  }

  /** Fach fest einem Produkt geben (oder mit null wieder freigeben). Ware darin bleibt, bis sie verkauft ist. */
  setFest(i: number, p: ProductDef | null): boolean {
    const f = this.faecher[i];
    if (!f || (p && (p.rohstoff || (p.kuehlung && !this.def.kuehlung)))) return false;
    f.fest = p;
    this.notifyChanged();
    return true;
  }

  /** Bis zu `menge` Stück einräumen: erst in Fächer mit demselben Produkt, dann in leere. Gibt die Anzahl zurück. */
  add(p: ProductDef, menge: number): number {
    if (p.rohstoff || (p.kuehlung && !this.def.kuehlung)) return 0;
    let rest = menge;
    // Zuerst die festen Fächer des Produkts, dann Fächer mit demselben Produkt, dann freie
    const rang = (f: Fach) => (f.fest?.id === p.id ? 2 : 0) + (f.produkt?.id === p.id ? 1 : 0);
    const order = [...this.faecher.keys()].sort((a, b) => rang(this.faecher[b]) - rang(this.faecher[a]));
    for (const i of order) {
      const f = this.faecher[i];
      if (rest === 0) break;
      if (!this.accepts(f, p)) continue;
      const take = Math.min(rest, this.def.kapazitaet - f.menge);
      if (take <= 0) continue;
      f.produkt = p;
      f.menge += take;
      rest -= take;
      this.renderFach(i);
    }
    const moved = menge - rest;
    if (moved) this.notifyChanged();
    return moved;
  }

  /** Bis zu `menge` Stück eines Produkts entnehmen (für Kunden, Meilenstein 9). */
  take(produktId: string, menge: number): number {
    let rest = menge;
    this.faecher.forEach((f, i) => {
      if (rest === 0 || f.produkt?.id !== produktId) return;
      const n = Math.min(rest, f.menge);
      f.menge -= n;
      rest -= n;
      if (f.menge === 0) f.produkt = null;
      this.renderFach(i);
    });
    if (rest !== menge) this.notifyChanged();
    return menge - rest;
  }

  /** Inhalt für den Spielstand: je Fach Produkt-id und Menge */
  saveState(): FachState[] {
    return this.faecher.map((f) => ({ produkt: f.produkt?.id ?? null, menge: f.menge, fest: f.fest?.id ?? null }));
  }

  /** Inhalt aus dem Spielstand übernehmen (unbekannte Produkte fallen weg). */
  loadState(list: FachState[], produkt: (id: string) => ProductDef | undefined): void {
    list.slice(0, this.faecher.length).forEach((saved, i) => {
      const fest = saved.fest ? produkt(saved.fest) : undefined;
      if (fest && !fest.rohstoff && (!fest.kuehlung || this.def.kuehlung)) this.faecher[i].fest = fest;
      const p = saved.produkt ? produkt(saved.produkt) : undefined;
      if (!p || saved.menge <= 0 || (p.kuehlung && !this.def.kuehlung)) return;
      this.faecher[i] = { produkt: p, menge: Math.min(saved.menge, this.def.kapazitaet), fest: this.faecher[i].fest };
      this.renderFach(i);
    });
    this.notifyChanged();
  }

  options(): InteractionOption[] {
    if (!this.actions) return [];
    if (!this.actions.carriedCarton()) return [{ aktion: 'auswaehlen', text: 'regal_belegen', prioritaet: 10, run: () => this.actions?.openShelf(this.entity) }];
    return [{ aktion: 'auswaehlen', text: 'einraeumen', prioritaet: 10, run: () => this.actions?.stockInto(this.entity) }];
  }

  describe(): InfoRow[] {
    return this.faecher.map((f, i) => ({
      label: `Fach ${i + 1}${this.def.kuehlung ? ' (gekühlt)' : ''}`,
      value: (f.produkt ? `${f.produkt.name} ${f.menge}/${this.def.kapazitaet}` : 'leer') + (f.fest ? ` · fest: ${f.fest.name}` : ''),
    }));
  }

  override onDetach(): void {
    for (const g of this.visuals) if (g) this.entity.object.remove(g);
    this.visuals.fill(null);
  }

  /** Ware eines Fachs sichtbar machen: Packungen nebeneinander auf dem Regalboden, vorne zuerst. */
  private renderFach(i: number): void {
    const ebenen = this.def.ebenen;
    if (!ebenen || !this.models) return;
    const old = this.visuals[i];
    if (old) this.entity.object.remove(old);
    this.visuals[i] = null;
    const f = this.faecher[i];
    if (!f.produkt?.model || f.menge === 0) return;

    const group = new THREE.Group();
    this.visuals[i] = group;
    this.entity.object.add(group);
    const [px, , pz] = f.produkt.groesse ?? [0.1, 0.1, 0.1];
    const along = Math.max(pz, 0.05) + 0.01;
    const deep = Math.max(px, 0.05) + 0.01;
    const perRow = Math.max(1, Math.floor(this.def.laenge / along));
    const rows = Math.max(1, Math.min(3, Math.floor(0.38 / deep)));
    const count = Math.min(f.menge, perRow * rows);
    const model = f.produkt.model;
    const spots: THREE.Vector3[] = [];
    for (let k = 0; k < count; k++) {
      const row = Math.floor(k / perRow);
      const col = k % perRow;
      spots.push(new THREE.Vector3(this.def.mitte + 0.12 - row * deep, ebenen[i] + 0.01, (col - (perRow - 1) / 2) * along));
    }
    const models = this.models;
    if (models.instances) {
      // Alle Packungen eines Fachs in einem Zeichenaufruf
      models.instances(model, spots.map((p) => new THREE.Matrix4().makeTranslation(p))).then((obj) => {
        if (this.visuals[i] === group) group.add(obj); // sonst inzwischen neu aufgebaut
      });
      return;
    }
    for (const p of spots) {
      models.instance(model).then((obj) => {
        if (this.visuals[i] !== group) return;
        obj.position.copy(p);
        group.add(obj);
      });
    }
  }
}
