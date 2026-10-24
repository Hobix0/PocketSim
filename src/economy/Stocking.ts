import type * as THREE from 'three';
import type { Entity } from '../ecs/Entity';
import type { World } from '../ecs/World';
import { CartonComponent } from '../components/CartonComponent';
import { ShelfComponent } from '../components/ShelfComponent';
import type { StorageSurfaceComponent } from '../components/StorageSurfaceComponent';
import { cartonReachable, PalletComponent } from '../components/PalletComponent';
import { PalletPlacesComponent } from '../components/PalletPlacesComponent';
import { VehicleComponent } from '../components/VehicleComponent';

// Einräumen: Ware wandert aus einem Karton in ein Regal.
// Wird vom Spieler (per Klick) und vom Personal benutzt. Ein leerer Karton verschwindet.

export type StockResult =
  | { ok: true; menge: number; leer: boolean }
  | { ok: false; grund: 'kuehlung' | 'voll' | 'rohstoff' };

export function stockFromCarton(carton: Entity, shelf: Entity): StockResult {
  const c = carton.require(CartonComponent);
  const s = shelf.require(ShelfComponent);
  // Rohstoffe sind für Maschinen, nicht für Kunden
  if (c.produkt.rohstoff) return { ok: false, grund: 'rohstoff' };
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
 * Hat ein Produkt feste Fächer, kommt es nur dorthin.
 */
export function findStockingTask(
  world: World,
  isFree: (carton: Entity) => boolean,
  /** Schon für dieses Regal und Produkt eingeplante Stück (Rollwagen: mehrere Kartons in einer Runde) */
  geplant: (shelf: Entity, produkt: string) => number = () => 0,
  /** Nur diese Regale (z. B. Auffüller, die einem Standort zugeteilt sind) */
  regalOk: (shelf: Entity) => boolean = () => true,
): StockingTask | null {
  const shelves = [...world.query(ShelfComponent)].filter(([e]) => regalOk(e));
  // Produkte mit festen Fächern kommen nur in diese Fächer
  const fest = new Set(shelves.flatMap(([, s]) => s.faecher.map((f) => f.fest?.id).filter((id): id is string => !!id)));
  for (const [carton, c] of world.query(CartonComponent)) {
    if (c.reservedBy !== null || c.produkt.rohstoff || !isFree(carton) || !cartonReachable(c)) continue;
    const nurFest = fest.has(c.produkt.id);
    let best: Entity | null = null;
    for (const [shelf, s] of shelves) {
      if (s.space(c.produkt, nurFest) - geplant(shelf, c.produkt.id) < c.menge) continue;
      const hasProduct = s.faecher.some((f) => f.produkt?.id === c.produkt.id);
      if (hasProduct) { best = shelf; break; }
      best ??= shelf;
    }
    if (best) return { carton, shelf: best };
  }
  return null;
}

/**
 * Kann diese Palette als Ganzes vom LKW geholt werden? Dafür braucht es einen Hubwagen oder Gabelstapler,
 * der die Ladefläche erreicht (Hubwagen nur bündig an der Rampe), und einen freien Palettenplatz.
 * Sonst räumt der Lagerist die Palette Karton für Karton von Hand ab.
 */
export function palletFetchable(world: World, pallet: PalletComponent): boolean {
  const platz = pallet.platz;
  if (!platz) return false;
  const y = platz.places.slotWorld(platz.slot).y;
  let fahrzeug = false;
  for (const [e, v] of world.query(VehicleComponent)) {
    if (v.art !== 'rollwagen' && y - e.object.position.y <= v.maxHoehe + 0.05) fahrzeug = true;
  }
  if (!fahrzeug) return false;
  for (const [, p] of world.query(PalletPlacesComponent)) if (!p.temporaer && p.free > 0) return true;
  return false;
}

/** Karton auf einer Palette auf dem LKW, die niemand als Ganzes holen kann */
function onStuckTruckPallet(world: World, c: CartonComponent): boolean {
  const p = c.ablage?.palette ? c.ablage.entity.get(PalletComponent) : undefined;
  return !!p && p.aufLkw && p.reservedBy === null && !palletFetchable(world, p);
}

/** Eine Aufgabe für Lageristen: Karton vom LKW (oder lose am Boden) auf einen festen Lagerplatz. */
export interface HaulTask {
  carton: Entity;
  /** Ziel-Ablage; der Platz ist schon reserviert */
  ablage: StorageSurfaceComponent;
  /** Weltposition des reservierten Platzes */
  ziel: THREE.Vector3;
}

/** Was jemand mit einem Karton tun soll */
export type WorkTask = StockingTask | HaulTask;

export function isHaulTask(t: WorkTask): t is HaulTask {
  return 'ablage' in t;
}

/**
 * Nächsten Karton zum Einlagern suchen: zuerst vom LKW, dann lose herumstehende Kartons.
 * Reserviert gleich den freien Platz, der dem Karton am nächsten liegt.
 */
export function findHaulTask(
  world: World,
  storage: { nearestFree(near: THREE.Vector3): StorageSurfaceComponent | null },
  isFree: (carton: Entity) => boolean,
): HaulTask | null {
  const candidates = [...world.query(CartonComponent)]
    .filter(([e, c]) => c.reservedBy === null && c.menge > 0 && isFree(e) && (!c.ablage || (c.ablage.temporaer && !c.ablage.palette) || onStuckTruckPallet(world, c)))
    .sort(([, a], [, b]) => Number(!a.ablage) - Number(!b.ablage));
  for (const [carton] of candidates) {
    const ablage = storage.nearestFree(carton.object.position);
    if (!ablage) return null;
    const ziel = ablage.occupy(carton.id);
    if (ziel) return { carton, ablage, ziel };
  }
  return null;
}
