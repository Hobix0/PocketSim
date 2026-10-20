import { Emitter } from '../core/Emitter';
import type { LogisticsSettings, ProductDef } from '../content/definitions';
import type { ShippingKind, StoragePort } from './Purchasing';
import { parseTime } from './Customers';

// Lieferungen: Bestellte Ware kommt nicht sofort, sondern per LKW – zum nächsten Liefertermin
// oder per Express (teurer, dafür gleich). Bezahlt wird bei der Bestellung, Lieferkosten kommen dazu.
// Der Lagerplatz wird schon beim Bestellen eingeplant: Was unterwegs ist oder noch auf dem LKW steht,
// zählt als belegt. Wann eine Lieferung fällig ist, meldet das Ereignis "arrived";
// den LKW in der Welt steuert TruckFleet. Keine three.js-Abhängigkeit.

const DAY = 24 * 60;

/** Ein Karton einer Lieferung */
export interface ShipmentLine {
  produkt: string;
  menge: number;
}

export interface Shipment {
  id: number;
  /** Ankunft in Spielminuten seit Spielbeginn (wie GameClock.totalMinutes) */
  ankunft: number;
  art: ShippingKind;
  kartons: ShipmentLine[];
}

export interface DeliveryEvents extends Record<string, unknown> {
  booked: Shipment;
  arrived: Shipment;
}

export interface DeliveriesState {
  unterwegs: Shipment[];
  naechsteId: number;
}

export class Deliveries implements StoragePort {
  readonly events = new Emitter<DeliveryEvents>();
  private readonly pending: Shipment[] = [];
  private draft: ShipmentLine[] = [];
  private nextId = 1;
  private readonly termine: number[];

  constructor(
    readonly settings: LogisticsSettings,
    /** Das eigentliche Lager (alle festen Ablagen) */
    private readonly storage: Pick<StoragePort, 'freeSlots'>,
    /** Aktuelle Zeit in Spielminuten */
    private readonly now: () => number,
    /** Kartons, die gerade auf einem LKW stehen und noch Platz brauchen */
    private readonly onTrucks: () => number = () => 0,
  ) {
    this.termine = settings.liefertermine.map(parseTime).sort((a, b) => a - b);
    if (!this.termine.length) throw new Error('logistik/standard.json: "liefertermine" darf nicht leer sein');
  }

  /** Freie Plätze abzüglich allem, was schon unterwegs ist */
  freeSlots(): number {
    return Math.max(0, this.storage.freeSlots() - this.pendingCartons() - this.onTrucks() - this.draft.length);
  }

  fee(kartons: number, art: ShippingKind): number {
    if (kartons <= 0) return 0;
    const k = this.settings.lieferkosten;
    return k.grund + k.proKarton * kartons + (art === 'express' ? this.settings.express.aufschlag : 0);
  }

  /** Wann eine Lieferung ankäme, wenn jetzt bestellt wird */
  arrival(art: ShippingKind, now = this.now()): number {
    if (art === 'express') return now + this.settings.express.minuten;
    const day = Math.floor(now / DAY) * DAY;
    const today = this.termine.find((t) => day + t > now);
    return today !== undefined ? day + today : day + DAY + this.termine[0];
  }

  deliver(produkt: ProductDef, menge: number): void {
    this.draft.push({ produkt: produkt.id, menge });
  }

  ship(art: ShippingKind): number {
    const ankunft = this.arrival(art);
    const kartons = this.draft;
    this.draft = [];
    // Gleicher Termin, gleiche Art: kommt mit demselben LKW
    const same = this.pending.find((s) => s.ankunft === ankunft && s.art === art);
    if (same) same.kartons.push(...kartons);
    else this.pending.push({ id: this.nextId++, ankunft, art, kartons });
    this.pending.sort((a, b) => a.ankunft - b.ankunft);
    this.events.emit('booked', same ?? this.pending.find((s) => s.ankunft === ankunft && s.art === art)!);
    return ankunft;
  }

  /** Ware, die sofort kommen soll (z. B. Ladung eines LKW aus dem Spielstand) */
  addNow(kartons: ShipmentLine[]): void {
    if (!kartons.length) return;
    this.pending.unshift({ id: this.nextId++, ankunft: this.now(), art: 'express', kartons: [...kartons] });
  }

  /** Fällige Lieferungen melden (jede genau einmal) */
  update(now = this.now()): void {
    while (this.pending.length && this.pending[0].ankunft <= now) {
      const s = this.pending.shift()!;
      this.events.emit('arrived', s);
    }
  }

  get unterwegs(): readonly Shipment[] {
    return this.pending;
  }

  pendingCartons(): number {
    return this.pending.reduce((n, s) => n + s.kartons.length, 0);
  }

  state(): DeliveriesState {
    return { unterwegs: this.pending.map((s) => ({ ...s, kartons: s.kartons.map((k) => ({ ...k })) })), naechsteId: this.nextId };
  }

  /** Spielstand übernehmen; unbekannte Waren fallen weg. Löst keine Ereignisse aus. */
  restore(s: Partial<DeliveriesState>, known: (produkt: string) => boolean = () => true): void {
    this.pending.splice(0);
    for (const sh of s.unterwegs ?? []) {
      const kartons = (sh.kartons ?? []).filter((k) => known(k.produkt) && k.menge > 0);
      if (kartons.length) this.pending.push({ id: sh.id, ankunft: sh.ankunft, art: sh.art === 'express' ? 'express' : 'normal', kartons });
    }
    this.pending.sort((a, b) => a.ankunft - b.ankunft);
    this.nextId = Math.max(s.naechsteId ?? 1, ...this.pending.map((p) => p.id + 1));
  }
}
