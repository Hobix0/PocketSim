import type { Content } from '../content/Content';
import type { MachineDef, RecipeDef } from '../content/definitions';
import type { World } from '../ecs/World';
import type { Entity } from '../ecs/Entity';
import type { StoragePort } from './Purchasing';
import type { Utilities, UtilityKind } from './Utilities';
import { CartonComponent } from '../components/CartonComponent';
import { FootprintComponent } from '../components/FootprintComponent';

// Produktion: Maschinen holen ihre Rohstoffe selbst aus dem Lager (Kartons) und
// stellen das Ergebnis als Karton zurück ins Lager – von dort wird es eingeräumt wie gekaufte Ware.
// Strom und Wasser kommen aus der Versorgung; reicht der Anschluss nicht, startet nichts.

export type StartCheck =
  | { ok: true }
  | { ok: false; grund: 'gesperrt' }
  | { ok: false; grund: 'rohstoffe'; fehlt: { ware: string; menge: number }[] }
  | { ok: false; grund: UtilityKind };

/** Laufende Maschine (für den Bedarf) */
export interface RunningMachine {
  readonly laeuft: boolean;
  readonly def: MachineDef;
}

export class Production {
  constructor(
    private readonly world: World,
    private readonly content: Content,
    private readonly storage: StoragePort,
    private readonly utilities: Utilities,
    private readonly level: () => number,
    /** Alle Maschinen in der Welt (für den Bedarf) */
    private readonly machines: () => Iterable<RunningMachine>,
  ) {}

  /** Grundlast aller Bauteile (werte.strom, werte.wasser) */
  baseDemand(): Record<UtilityKind, number> {
    const out = { strom: 0, wasser: 0 };
    for (const [e] of this.world.query(FootprintComponent)) {
      const w = this.content.bau.find(e.typeId)?.werte;
      if (!w) continue;
      out.strom += w.strom ?? 0;
      out.wasser += w.wasser ?? 0;
    }
    return out;
  }

  /** Bedarf jetzt: Grundlast plus laufende Maschinen */
  demand(): Record<UtilityKind, number> {
    const out = this.baseDemand();
    for (const m of this.machines()) {
      if (!m.laeuft) continue;
      out.strom += m.def.strom;
      out.wasser += m.def.wasser;
    }
    return out;
  }

  recipesFor(typ: string): RecipeDef[] {
    return this.content.rezepte.all().filter((r) => r.maschine === typ);
  }

  /** Stück einer Ware im Lager (Kartons, die gerade niemand trägt) */
  available(ware: string): number {
    let n = 0;
    for (const [, c] of this.world.query(CartonComponent)) if (c.produkt.id === ware && c.reservedBy === null) n += c.menge;
    return n;
  }

  canStart(r: RecipeDef, m: MachineDef): StartCheck {
    if (r.freischaltLevel > this.level()) return { ok: false, grund: 'gesperrt' };
    const fehlt = r.eingang.filter((l) => this.available(l.ware) < l.menge).map((l) => ({ ware: l.ware, menge: l.menge - this.available(l.ware) }));
    if (fehlt.length) return { ok: false, grund: 'rohstoffe', fehlt };
    const d = this.demand();
    if (d.strom + m.strom > this.utilities.anschluss('strom') + 1e-9) return { ok: false, grund: 'strom' };
    if (d.wasser + m.wasser > this.utilities.anschluss('wasser') + 1e-9) return { ok: false, grund: 'wasser' };
    return { ok: true };
  }

  /** Rohstoffe aus dem Lager nehmen (kleinste Kartons zuerst; leere verschwinden). */
  consume(r: RecipeDef): void {
    for (const l of r.eingang) {
      let rest = l.menge;
      const cartons = [...this.world.query(CartonComponent)]
        .filter(([, c]) => c.produkt.id === l.ware && c.reservedBy === null)
        .sort(([, a], [, b]) => a.menge - b.menge);
      for (const [e, c] of cartons) {
        if (rest === 0) break;
        const take = Math.min(rest, c.menge);
        c.remove(take);
        rest -= take;
        if (c.menge === 0) this.world.remove(e as Entity);
      }
    }
  }

  /** Ergebnis ins Lager stellen; false, wenn kein Platz frei ist. */
  deliver(r: RecipeDef): boolean {
    if (this.storage.freeSlots() < 1) return false;
    this.storage.deliver(this.content.waren.get(r.ausgang.ware), r.ausgang.menge);
    return true;
  }

  /** Grober Gewinn je Durchgang: Verkaufswert des Ergebnisses minus Einkaufswert der Rohstoffe */
  margin(r: RecipeDef): number {
    const out = this.content.waren.get(r.ausgang.ware);
    const cost = r.eingang.reduce((s, l) => s + this.content.waren.get(l.ware).ek * l.menge, 0);
    return Math.round((out.vk * r.ausgang.menge - cost) * 100) / 100;
  }
}
