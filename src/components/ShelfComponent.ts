import * as THREE from 'three';
import { InteractableComponent, type InteractionOption } from '../interaction/InteractableComponent';
import type { ProductDef, ShelfDef } from '../content/definitions';
import type { ModelProvider } from '../assets/ModelLibrary';
import type { GameActions } from '../factory/FactoryContext';
import type { Describable, InfoRow } from '../ui/describe';

// Regal mit Fächern. Jedes Fach nimmt genau ein Produkt auf, bis zur Kapazität.
// Gekühlte Ware passt nur in Regale mit Kühlung.
// Hat das Regal Ebenen (Höhen der Böden), steht die Ware sichtbar auf den Böden.
// Mit einem Karton in der Hand bietet das Regal "Einräumen" an.

export interface Fach {
  produkt: ProductDef | null;
  menge: number;
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
    this.faecher = Array.from({ length: def.faecher }, () => ({ produkt: null, menge: 0 }));
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

  /** Wie viele Stück dieses Produkts passen gerade hinein? (0, wenn die Kühlung fehlt) */
  space(p: ProductDef): number {
    if (p.kuehlung && !this.def.kuehlung) return 0;
    let free = 0;
    for (const f of this.faecher) {
      if (f.produkt?.id === p.id) free += this.def.kapazitaet - f.menge;
      else if (!f.produkt) free += this.def.kapazitaet;
    }
    return free;
  }

  /** Bis zu `menge` Stück einräumen: erst in Fächer mit demselben Produkt, dann in leere. Gibt die Anzahl zurück. */
  add(p: ProductDef, menge: number): number {
    if (p.kuehlung && !this.def.kuehlung) return 0;
    let rest = menge;
    const order = [...this.faecher.keys()].sort((a, b) => Number(this.faecher[b].produkt?.id === p.id) - Number(this.faecher[a].produkt?.id === p.id));
    for (const i of order) {
      const f = this.faecher[i];
      if (rest === 0) break;
      if (f.produkt && f.produkt.id !== p.id) continue;
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
  saveState(): { produkt: string | null; menge: number }[] {
    return this.faecher.map((f) => ({ produkt: f.produkt?.id ?? null, menge: f.menge }));
  }

  /** Inhalt aus dem Spielstand übernehmen (unbekannte Produkte fallen weg). */
  loadState(list: { produkt: string | null; menge: number }[], produkt: (id: string) => ProductDef | undefined): void {
    list.slice(0, this.faecher.length).forEach((saved, i) => {
      const p = saved.produkt ? produkt(saved.produkt) : undefined;
      if (!p || saved.menge <= 0 || (p.kuehlung && !this.def.kuehlung)) return;
      this.faecher[i] = { produkt: p, menge: Math.min(saved.menge, this.def.kapazitaet) };
      this.renderFach(i);
    });
    this.notifyChanged();
  }

  options(): InteractionOption[] {
    if (!this.actions?.carriedCarton()) return [];
    return [{ aktion: 'auswaehlen', text: 'einraeumen', prioritaet: 10, run: () => this.actions?.stockInto(this.entity) }];
  }

  describe(): InfoRow[] {
    return this.faecher.map((f, i) => ({
      label: `Fach ${i + 1}${this.def.kuehlung ? ' (gekühlt)' : ''}`,
      value: f.produkt ? `${f.produkt.name} ${f.menge}/${this.def.kapazitaet}` : 'leer',
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
