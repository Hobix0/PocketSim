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
// Frische Ware (data/sortiment/frische.json): Jedes Fach merkt sich Chargen (Menge + Tag des Einräumens).
// Kunden nehmen die älteste zuerst; am letzten Tag ist sie reduziert (gelbes Schild), danach läuft sie ab.

/** Ware, die am selben Spieltag eingeräumt wurde */
export interface Charge {
  tag: number;
  menge: number;
}

export interface Fach {
  produkt: ProductDef | null;
  menge: number;
  /** Festes Produkt dieses Fachs (oder frei) */
  fest: ProductDef | null;
  /** Chargen, die älteste zuerst (Summe = menge) */
  chargen: Charge[];
}

/** Gespeicherter Inhalt eines Fachs */
export interface FachState {
  produkt: string | null;
  menge: number;
  fest?: string | null;
  chargen?: Charge[];
}

/** Frische: Spieltag und Haltbarkeit je Produkt (setzt das Spiel; ohne: alles hält unbegrenzt) */
export interface FreshnessClock {
  heute(): number;
  /** Tage, die das Produkt im Regal hält – null: unbegrenzt */
  haltbar(p: ProductDef): number | null;
  /** Nachlass am letzten Tag (0,3 = 30 %) */
  rabatt: number;
}

const NIE: FreshnessClock = { heute: () => 1, haltbar: () => null, rabatt: 0 };
const SCHILD = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.6, emissive: '#5a4300', emissiveIntensity: 0.25 });
const SCHILD_STREIFEN = new THREE.MeshStandardMaterial({ color: '#d23a2f', roughness: 0.6 });

export class ShelfComponent extends InteractableComponent implements Describable {
  override readonly kontext = 'regal';
  /** Spieltag und Haltbarkeit (setzt Game einmal für alle Regale) */
  static frische: FreshnessClock = NIE;
  readonly faecher: Fach[];
  private readonly visuals: (THREE.Group | null)[];

  constructor(
    readonly def: ShelfDef,
    private readonly models?: ModelProvider,
    private readonly actions?: GameActions,
  ) {
    super();
    this.faecher = Array.from({ length: def.faecher }, () => ({ produkt: null, menge: 0, fest: null, chargen: [] }));
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
      addCharge(f, ShelfComponent.frische.heute(), take);
      rest -= take;
      this.renderFach(i);
    }
    const moved = menge - rest;
    if (moved) this.notifyChanged();
    return moved;
  }

  /** Bis zu `menge` Stück eines Produkts entnehmen (für Kunden, Meilenstein 9). */
  take(produktId: string, menge: number): number {
    return this.takeFresh(produktId, menge).n;
  }

  /**
   * Entnehmen, die älteste Ware zuerst (aus dem Fach mit der ältesten Charge). `reduziert`: wie viele davon am
   * letzten Tag waren (die kosten an der Kasse weniger).
   */
  takeFresh(produktId: string, menge: number): { n: number; reduziert: number } {
    let rest = menge, reduziert = 0;
    const order = [...this.faecher.keys()].filter((i) => this.faecher[i].produkt?.id === produktId)
      .sort((a, b) => (this.faecher[a].chargen[0]?.tag ?? 0) - (this.faecher[b].chargen[0]?.tag ?? 0));
    for (const i of order) {
      const f = this.faecher[i];
      if (rest === 0) break;
      const n = Math.min(rest, f.menge);
      // Älteste Chargen zuerst
      let k = n;
      while (k > 0 && f.chargen.length) {
        const c = f.chargen[0];
        const m = Math.min(k, c.menge);
        if (this.lastDay(f.produkt!, c)) reduziert += m;
        c.menge -= m;
        k -= m;
        if (c.menge === 0) f.chargen.shift();
      }
      f.menge -= n;
      rest -= n;
      if (f.menge === 0) { f.produkt = null; f.chargen = []; }
      this.renderFach(i);
    }
    if (rest !== menge) this.notifyChanged();
    return { n: menge - rest, reduziert };
  }

  /** Ist diese Charge am letzten Verkaufstag (reduziert)? */
  private lastDay(p: ProductDef, c: Charge): boolean {
    const h = ShelfComponent.frische.haltbar(p);
    return h !== null && ShelfComponent.frische.heute() - c.tag >= h - 1;
  }

  /** Liegt in diesem Fach reduzierte Ware (die älteste Charge ist am letzten Tag)? */
  reduziert(i: number): boolean {
    const f = this.faecher[i];
    return !!f.produkt && !!f.chargen[0] && this.lastDay(f.produkt, f.chargen[0]);
  }

  /** Gibt es reduzierte Ware dieses Produkts? */
  hatReduziert(produktId: string): boolean {
    return this.faecher.some((f, i) => f.produkt?.id === produktId && this.reduziert(i));
  }

  /** Neuer Tag: abgelaufene Ware herausnehmen (geht an die Tafel). Gibt zurück, was abgelaufen ist. */
  expire(): { produkt: ProductDef; menge: number }[] {
    const out: { produkt: ProductDef; menge: number }[] = [];
    const heute = ShelfComponent.frische.heute();
    this.faecher.forEach((f, i) => {
      if (!f.produkt) return;
      const h = ShelfComponent.frische.haltbar(f.produkt);
      if (h === null) return;
      const ab = f.chargen.filter((c) => heute - c.tag >= h);
      if (ab.length) {
        const menge = ab.reduce((n, c) => n + c.menge, 0);
        out.push({ produkt: f.produkt, menge });
        f.chargen = f.chargen.filter((c) => heute - c.tag < h);
        f.menge -= menge;
        if (f.menge <= 0) { f.menge = 0; f.produkt = null; f.chargen = []; }
      }
      this.renderFach(i);
    });
    if (out.length) this.notifyChanged();
    return out;
  }

  /** Inhalt für den Spielstand: je Fach Produkt-id und Menge */
  saveState(): FachState[] {
    return this.faecher.map((f) => ({ produkt: f.produkt?.id ?? null, menge: f.menge, fest: f.fest?.id ?? null, chargen: f.chargen.map((c) => ({ ...c })) }));
  }

  /** Inhalt aus dem Spielstand übernehmen (unbekannte Produkte fallen weg). */
  loadState(list: FachState[], produkt: (id: string) => ProductDef | undefined): void {
    list.slice(0, this.faecher.length).forEach((saved, i) => {
      const fest = saved.fest ? produkt(saved.fest) : undefined;
      if (fest && !fest.rohstoff && (!fest.kuehlung || this.def.kuehlung)) this.faecher[i].fest = fest;
      const p = saved.produkt ? produkt(saved.produkt) : undefined;
      if (!p || saved.menge <= 0 || (p.kuehlung && !this.def.kuehlung)) return;
      const menge = Math.min(saved.menge, this.def.kapazitaet);
      // Chargen übernehmen und an die Menge anpassen (ältere Spielstände: alles von heute)
      const chargen: Charge[] = [];
      let rest = menge;
      for (const c of saved.chargen ?? []) {
        if (rest <= 0 || !(c.menge > 0) || !Number.isFinite(c.tag)) continue;
        const m = Math.min(rest, c.menge);
        chargen.push({ tag: c.tag, menge: m });
        rest -= m;
      }
      if (rest > 0) addCharge({ chargen } as Fach, ShelfComponent.frische.heute(), rest);
      this.faecher[i] = { produkt: p, menge, fest: this.faecher[i].fest, chargen };
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
      value: (f.produkt ? `${f.produkt.name} ${f.menge}/${this.def.kapazitaet}${this.frischText(i)}` : 'leer') + (f.fest ? ` · fest: ${f.fest.name}` : ''),
    }));
  }

  /** „ · reduziert“ oder „ · frisch noch 2 Tage“ */
  private frischText(i: number): string {
    const f = this.faecher[i];
    const h = f.produkt ? ShelfComponent.frische.haltbar(f.produkt) : null;
    if (h === null || !f.chargen[0] || h > 14) return '';
    if (this.reduziert(i)) return ' · heute reduziert';
    const rest = h - (ShelfComponent.frische.heute() - f.chargen[0].tag);
    return ` · frisch noch ${rest} Tage`;
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
    // Reduziert: gelbes Preisschild mit rotem Streifen vorne am Fach
    if (this.reduziert(i)) {
      const schild = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.09), SCHILD);
      schild.position.set(this.def.mitte + 0.2, ebenen[i] - 0.015, -this.def.laenge / 2 + 0.12);
      const streifen = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.09), SCHILD_STREIFEN);
      streifen.position.copy(schild.position).setY(schild.position.y + 0.012);
      group.add(schild, streifen);
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

/** Menge als Charge eines Tages anhängen (gleicher Tag: zusammenlegen) */
function addCharge(f: Pick<Fach, 'chargen'>, tag: number, menge: number): void {
  const last = f.chargen[f.chargen.length - 1];
  if (last && last.tag === tag) last.menge += menge;
  else f.chargen.push({ tag, menge });
}
