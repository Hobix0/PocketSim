import { Component } from '../ecs/Component';
import type { Entity } from '../ecs/Entity';
import type { Describable, InfoRow } from '../ui/describe';
import { StorageSurfaceComponent } from './StorageSurfaceComponent';
import { CartonComponent } from './CartonComponent';
import type { PalletPlacesComponent } from './PalletPlacesComponent';

// Eine Europalette mit Kartons darauf. Die Kartons stehen auf der Ablage der Palette (StorageSurface mit `palette`)
// und wandern mit, wenn die Palette bewegt wird. Eine Palette steht auf einem Palettenplatz (Regal, Boden, LKW)
// oder hängt gerade an einem Fahrzeug (`platz` = null, `reservedBy` = Fahrer).
// Kartons auf Paletten oben im Regal erreicht niemand von Hand – erst, wenn der Stapler die Palette herunterholt.

/** Bis zu dieser Höhe über dem Boden kommt man von Hand an die Kartons */
export const GREIFHOEHE = 0.6;

export class PalletComponent extends Component implements Describable {
  platz: { places: PalletPlacesComponent; slot: number } | null = null;
  /** Entity-id des Fahrers, der die Palette gerade holt oder fährt */
  reservedBy: number | null = null;
  private lastKey = '';

  get surface(): StorageSurfaceComponent {
    return this.entity.require(StorageSurfaceComponent);
  }

  /** Kartons auf der Palette */
  cartons(): Entity[] {
    const w = this.entity.world;
    if (!w) return [];
    return this.surface.entityIds.map((id) => w.get(id)).filter((e): e is Entity => !!e?.get(CartonComponent));
  }

  get kartons(): number {
    return this.surface.used;
  }

  /** Ware darauf (erstes Produkt; Paletten aus dem Einkauf sind sortenrein) */
  get produkt(): CartonComponent['produkt'] | null {
    return this.cartons()[0]?.get(CartonComponent)?.produkt ?? null;
  }

  /** Steht die Palette so tief, dass man von Hand an die Kartons kommt? */
  get greifbar(): boolean {
    if (this.reservedBy !== null || !this.platz) return false;
    return this.platz.places.hoehe < GREIFHOEHE;
  }

  /** Auf einen Palettenplatz stellen */
  stand(places: PalletPlacesComponent, slot: number): boolean {
    if (!places.put(slot, this.entity)) return false;
    this.platz = { places, slot };
    const o = this.entity.object;
    o.position.copy(places.slotWorld(slot));
    o.rotation.y = places.entity.object.rotation.y;
    this.sync();
    return true;
  }

  /** Vom Platz nehmen (z. B. aufs Fahrzeug) */
  leave(): void {
    this.platz?.places.take(this.entity);
    this.platz = null;
  }

  override update(): void {
    this.sync();
  }

  override onDetach(): void {
    this.leave();
    // Kartons gehen mit der Palette (z. B. Rückgabe an den LKW)
    for (const c of this.cartons()) c.world?.remove(c);
  }

  /** Kartons auf ihre Plätze nachziehen, wenn die Palette bewegt wurde */
  sync(force = false): void {
    const o = this.entity.object;
    const key = `${o.position.x.toFixed(3)},${o.position.y.toFixed(3)},${o.position.z.toFixed(3)},${o.rotation.y.toFixed(3)}`;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    const s = this.surface;
    const w = this.entity.world;
    if (!w) return;
    for (const id of s.entityIds) {
      const e = w.get(id);
      if (!e) continue;
      e.object.position.copy(s.slotPosition(s.slotOf(id)));
      e.object.rotation.y = o.rotation.y;
    }
  }

  describe(): InfoRow[] {
    const p = this.produkt;
    const stueck = this.cartons().reduce((n, e) => n + (e.get(CartonComponent)?.menge ?? 0), 0);
    return [
      { label: 'Ware', value: p ? p.name : 'leer' },
      { label: 'Kartons', value: `${this.kartons} (${stueck} Stück)` },
      { label: 'Steht', value: this.reservedBy !== null ? 'wird gefahren' : !this.platz ? '–' : this.platz.places.temporaer ? 'auf dem LKW' : this.platz.places.hoehe >= GREIFHOEHE ? `im Regal (${this.platz.places.hoehe.toFixed(1).replace('.', ',')} m)` : 'am Boden' },
    ];
  }
}

/** Ist ein Karton für Auffüller und Spieler greifbar? (auf hohen oder fahrenden Paletten nicht) */
export function cartonReachable(c: CartonComponent): boolean {
  if (!c.ablage?.palette) return true;
  return c.ablage.entity.get(PalletComponent)?.greifbar ?? false;
}
