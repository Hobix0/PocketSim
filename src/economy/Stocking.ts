import type { Entity } from '../ecs/Entity';
import type { World } from '../ecs/World';
import { CartonComponent } from '../components/CartonComponent';
import { ShelfComponent } from '../components/ShelfComponent';

// Einräumen: Ware wandert aus einem Karton in ein Regal.
// Wird vom Spieler (per Klick) und vom Personal benutzt. Ein leerer Karton verschwindet.

export type StockResult =
  | { ok: true; menge: number; leer: boolean }
  | { ok: false; grund: 'kuehlung' | 'voll' };

export function stockFromCarton(carton: Entity, shelf: Entity): StockResult {
  const c = carton.require(CartonComponent);
  const s = shelf.require(ShelfComponent);
  if (c.produkt.kuehlung && !s.kuehlung) return { ok: false, grund: 'kuehlung' };
  const moved = s.add(c.produkt, c.menge);
  if (moved === 0) return { ok: false, grund: 'voll' };
  c.remove(moved);
  const leer = c.menge === 0;
  if (leer) carton.world?.remove(carton);
  return { ok: true, menge: moved, leer };
}

/** Eine Aufgabe fürs Personal: welcher Karton in welches Regal. */
export interface StockingTask {
  carton: Entity;
  shelf: Entity;
}

/**
 * Nächste sinnvolle Aufgabe suchen: ein freier Karton, dessen ganzer Inhalt in ein Regal passt.
 * Bevorzugt Regale, in denen das Produkt schon steht (damit Fächer nicht zersplittern).
 */
export function findStockingTask(world: World, isFree: (carton: Entity) => boolean): StockingTask | null {
  const shelves = [...world.query(ShelfComponent)];
  for (const [carton, c] of world.query(CartonComponent)) {
    if (c.reservedBy !== null || !isFree(carton)) continue;
    let best: Entity | null = null;
    for (const [shelf, s] of shelves) {
      if (s.space(c.produkt) < c.menge) continue;
      const hasProduct = s.faecher.some((f) => f.produkt?.id === c.produkt.id);
      if (hasProduct) { best = shelf; break; }
      best ??= shelf;
    }
    if (best) return { carton, shelf: best };
  }
  return null;
}
