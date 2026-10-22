import type * as THREE from 'three';
import type { Entity } from '../ecs/Entity';
import type { World } from '../ecs/World';
import type { ProductDef } from '../content/definitions';
import { PalletComponent, GREIFHOEHE, cartonReachable } from '../components/PalletComponent';
import { PalletPlacesComponent } from '../components/PalletPlacesComponent';
import { VehicleComponent } from '../components/VehicleComponent';
import { CartonComponent } from '../components/CartonComponent';
import { ShelfComponent } from '../components/ShelfComponent';

// Aufgaben für Staplerfahrer – wie im echten Lager:
//   1. Einlagern: Palette vom LKW (oder lose abgestellt) auf einen freien Palettenplatz.
//      Mit dem Gabelstapler bevorzugt oben ins Regal (Reserve), sonst wie mit dem Hubwagen auf den Boden
//      (Bodenstellplatz oder unterste Traverse – dort wird entnommen).
//   2. Auffüllen: Palette vom Boden mit dem Hubwagen (oder Stapler) zum Verkaufsregal fahren,
//      Kartons direkt von der Palette einräumen, Rest zurück an ihren Platz (leere Paletten kommen weg).
//   3. Nachschub: Palette oben aus dem Regal mit dem Stapler auf einen Bodenstellplatz holen,
//      wenn im Laden etwas fehlt, das sonst niemand erreicht.
// Fahrzeuge können nur bis zu ihrer Hubhöhe heben (Hubwagen: Boden und bündige LKW an der Rampe).

export interface PalletTarget {
  places: PalletPlacesComponent;
  slot: number;
}

export type PalletJob =
  | { art: 'einlagern'; pallet: Entity; fahrzeug: Entity; ziel: PalletTarget }
  | { art: 'nachschub'; pallet: Entity; fahrzeug: Entity; ziel: PalletTarget }
  | { art: 'auffuellen'; pallet: Entity; fahrzeug: Entity; regal: Entity };

/** Höhe eines Platzes über dem Boden, auf dem das Fahrzeug steht */
function hoeheUeber(places: PalletPlacesComponent, slot: number, boden: number): number {
  return places.slotWorld(slot).y - boden;
}

function reicht(v: Entity, places: PalletPlacesComponent, slot: number): boolean {
  return hoeheUeber(places, slot, v.object.position.y) <= v.require(VehicleComponent).maxHoehe + 0.05;
}

/** Freie Fahrzeuge, Gabelstapler zuerst (oder Hubwagen zuerst) */
function freeVehicles(world: World, hubwagenZuerst = false): Entity[] {
  const list = [...world.query(VehicleComponent)].filter(([, v]) => v.frei).map(([e]) => e);
  return list.sort((a, b) => {
    const ra = a.require(VehicleComponent).art === 'hubwagen' ? 0 : 1, rb = b.require(VehicleComponent).art === 'hubwagen' ? 0 : 1;
    return hubwagenZuerst ? ra - rb : rb - ra;
  });
}

/** Freien Palettenplatz suchen (nächster zuerst), den das Fahrzeug erreicht; `boden`: nur am Boden, `regal`: nur oben */
function freeSlot(world: World, v: Entity, near: THREE.Vector3, art: 'boden' | 'regal', palletId: number): PalletTarget | null {
  let best: PalletTarget | null = null, bestD = Infinity;
  for (const [, places] of world.query(PalletPlacesComponent)) {
    if (places.temporaer || places.free <= 0) continue;
    const h = hoeheUeber(places, 0, v.object.position.y);
    if (art === 'boden' && h >= GREIFHOEHE) continue;
    if (art === 'regal' && h < GREIFHOEHE) continue;
    for (let slot = 0; slot < places.capacity; slot++) {
      if (!places.isFree(slot)) continue;
      if (!reicht(v, places, slot)) continue;
      const d = places.slotWorld(slot).distanceToSquared(near);
      if (d < bestD) { best = { places, slot }; bestD = d; }
    }
  }
  // Gleich reservieren, damit kein anderer Fahrer denselben Platz ansteuert
  if (best && !best.places.reserveAt(best.slot, palletId)) return null;
  return best;
}

/** Wer was braucht: Regale mit Platz für einen Karton dieses Produkts (bevorzugt, wo es schon steht) */
function shelfFor(world: World, produkt: ProductDef, menge: number): Entity | null {
  const shelves = [...world.query(ShelfComponent)];
  const nurFest = shelves.some(([, s]) => s.faecher.some((f) => f.fest?.id === produkt.id));
  let best: Entity | null = null;
  for (const [e, s] of shelves) {
    if (produkt.kuehlung && !s.kuehlung) continue;
    if (s.space(produkt, nurFest) < menge) continue;
    if (s.faecher.some((f) => f.produkt?.id === produkt.id)) return e;
    best ??= e;
  }
  return best;
}

/** Gibt es dieses Produkt irgendwo greifbar (loser Karton oder Palette am Boden), das noch niemand holt? */
function reachableStock(world: World, produkt: ProductDef): boolean {
  for (const [, c] of world.query(CartonComponent)) {
    if (c.produkt.id === produkt.id && c.reservedBy === null && c.menge > 0 && !c.ablage?.temporaer && cartonReachable(c)) return true;
  }
  return false;
}

/** Palette ist frei verfügbar (niemand fährt sie, kein Karton darauf ist von einem Auffüller reserviert) */
function available(p: Entity): boolean {
  const pc = p.require(PalletComponent);
  return pc.reservedBy === null && pc.kartons > 0 && pc.cartons().every((c) => c.require(CartonComponent).reservedBy === null);
}

export function findPalletJob(world: World): PalletJob | null {
  const pallets = [...world.query(PalletComponent)].map(([e]) => e).filter(available);

  // 1. Einlagern: vom LKW oder lose abgestellt
  for (const p of pallets) {
    const pc = p.require(PalletComponent);
    if (pc.platz && !pc.platz.places.temporaer) continue;
    for (const v of freeVehicles(world)) {
      if (pc.platz && !reicht(v, pc.platz.places, pc.platz.slot)) continue;
      const stapler = v.require(VehicleComponent).art === 'gabelstapler';
      const ziel = (stapler ? freeSlot(world, v, p.object.position, 'regal', p.id) : null) ?? freeSlot(world, v, p.object.position, 'boden', p.id);
      if (ziel) return { art: 'einlagern', pallet: p, fahrzeug: v, ziel };
    }
  }
  // 2. Auffüllen direkt von der Palette (Palette am Boden)
  for (const p of pallets) {
    const pc = p.require(PalletComponent);
    if (!pc.platz || pc.platz.places.temporaer || pc.platz.places.hoehe >= GREIFHOEHE) continue;
    const produkt = pc.produkt;
    const menge = pc.cartons()[0]?.require(CartonComponent).menge ?? 0;
    if (!produkt || produkt.rohstoff) continue;
    const regal = shelfFor(world, produkt, menge);
    if (!regal) continue;
    const v = freeVehicles(world, true).find((x) => reicht(x, pc.platz!.places, pc.platz!.slot));
    if (v) return { art: 'auffuellen', pallet: p, fahrzeug: v, regal };
  }
  // 3. Nachschub: Palette oben aus dem Regal herunterholen, wenn sonst nichts greifbar ist
  for (const p of pallets) {
    const pc = p.require(PalletComponent);
    if (!pc.platz || pc.platz.places.temporaer || pc.platz.places.hoehe < GREIFHOEHE) continue;
    const produkt = pc.produkt;
    const menge = pc.cartons()[0]?.require(CartonComponent).menge ?? 0;
    if (!produkt || produkt.rohstoff) continue;
    const regal = shelfFor(world, produkt, menge);
    if (!regal || reachableStock(world, produkt)) continue;
    const v = freeVehicles(world).find((x) => x.require(VehicleComponent).art === 'gabelstapler' && reicht(x, pc.platz!.places, pc.platz!.slot));
    if (!v) continue;
    const ziel = freeSlot(world, v, regal.object.position, 'boden', p.id);
    if (ziel) return { art: 'nachschub', pallet: p, fahrzeug: v, ziel };
  }
  return null;
}
