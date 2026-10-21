import { Emitter } from '../core/Emitter';
import type { BuyerSettings, ProductDef } from '../content/definitions';
import type { Registry } from '../content/Registry';
import type { Entity } from '../ecs/Entity';
import type { World } from '../ecs/World';
import type { PlayerState } from '../state/PlayerState';
import type { Purchasing } from '../economy/Purchasing';
import type { Deliveries } from '../economy/Deliveries';
import { Listing, planReorder, type StockInfo } from '../economy/Buyer';
import { ShelfComponent } from '../components/ShelfComponent';
import { CartonComponent } from '../components/CartonComponent';
import { BuyerComponent } from '../components/BuyerComponent';

// Einkäufer im Spiel: merkt sich, was je in einem Regal stand (Listing), und lässt einen
// Einkäufer am Terminal regelmäßig nachbestellen. Bestand = Regale + Kartons (Lager, LKW) + unterwegs.

export interface BuyerSystemEvents extends Record<string, unknown> {
  ordered: { name: string; kartons: number; kosten: number };
  /** Hätte bestellt, aber Geld oder Lagerplatz fehlen */
  blocked: { name: string; grund: 'geld' | 'platz' };
}

export class BuyerSystem {
  readonly events = new Emitter<BuyerSystemEvents>();
  readonly listing = new Listing();
  private next = 0;
  private blockedTold = false;

  constructor(
    private readonly world: World,
    private readonly produkte: Registry<ProductDef>,
    private readonly purchasing: Purchasing,
    private readonly player: PlayerState,
    private readonly settings: BuyerSettings,
    private readonly deliveries?: Deliveries,
  ) {
    // Jede Ware, die in ein Regal kommt oder einem Fach fest gehört, wird gelistet
    const note = (e: Entity) => {
      const s = e.get(ShelfComponent);
      if (!s) return;
      for (const f of s.faecher) {
        if (f.produkt) this.listing.add(f.produkt.id);
        if (f.fest) this.listing.add(f.fest.id);
      }
    };
    world.events.on('changed', note);
    world.events.on('added', note);
    this.note = note;
  }

  private readonly note: (e: Entity) => void;

  /** Spielstand: gelistete Produkte übernehmen, dann die Regale noch einmal ansehen */
  restore(state: unknown): void {
    this.listing.restore(state, (id) => !!this.produkte.find(id));
    for (const [e] of this.world.query(ShelfComponent)) this.note(e);
  }

  /** Bestand und Regalplatz je gelistetem Produkt */
  stock(): StockInfo[] {
    const shelves = [...this.world.query(ShelfComponent)].map(([, s]) => s);
    const cartons = new Map<string, number>();
    for (const [, c] of this.world.query(CartonComponent)) cartons.set(c.produkt.id, (cartons.get(c.produkt.id) ?? 0) + c.menge);
    for (const s of this.deliveries?.unterwegs ?? []) for (const k of s.kartons) cartons.set(k.produkt, (cartons.get(k.produkt) ?? 0) + k.menge);
    const out: StockInfo[] = [];
    for (const id of this.listing.gelistet) {
      const p = this.produkte.find(id);
      if (!p || !this.listing.aktiv(id) || !this.purchasing.isUnlocked(p)) continue;
      let regalPlatz = 0, regal = 0;
      for (const s of shelves) {
        regal += s.menge(id);
        // Feste Fächer zählen ganz; freie Fächer, in denen es gerade steht, auch
        regalPlatz += s.festPlatz(id) + s.faecher.filter((f) => !f.fest && f.produkt?.id === id).length * s.kapazitaet;
      }
      out.push({ produkt: p, regalPlatz, bestand: regal + (cartons.get(id) ?? 0) });
    }
    return out;
  }

  /** Jeden Frame mit der Spielzeit (Minuten seit Spielbeginn) */
  update(now: number): void {
    if (now < this.next) return;
    this.next = now + this.settings.pruefenAlleMinuten;
    const buyer = [...this.world.query(BuyerComponent)].find(([, b]) => b.ready)?.[1];
    if (buyer) this.run(buyer);
  }

  /** Jetzt prüfen und bestellen (auch zum Testen) */
  run(buyer: BuyerComponent): void {
    const art = this.settings.versand;
    const items = this.stock();
    const lines = planReorder(items, this.settings, {
      budget: this.player.geld - this.settings.mindestGuthaben,
      freiePlaetze: this.purchasing.freeSlots(),
      kosten: (l) => this.purchasing.quote(l, art).kosten,
    });
    if (!lines.length) {
      // Etwas fehlt, aber es ging nichts: einmal Bescheid geben
      const fehlt = items.some((s) => s.bestand < s.produkt.gebinde);
      if (fehlt && !this.blockedTold) {
        this.blockedTold = true;
        this.events.emit('blocked', { name: buyer.employee.name, grund: this.purchasing.freeSlots() <= 0 ? 'platz' : 'geld' });
      }
      return;
    }
    const r = this.purchasing.order(lines, art);
    if (!r.ok) return;
    this.blockedTold = false;
    buyer.ordered(r.kartons, r.kosten);
    this.events.emit('ordered', { name: buyer.employee.name, kartons: r.kartons, kosten: r.kosten });
  }
}
