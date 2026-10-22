import { Entity } from '../ecs/Entity';
import { ModelComponent } from '../components/ModelComponent';
import { StorageSurfaceComponent } from '../components/StorageSurfaceComponent';
import { SelectableComponent } from '../components/SelectableComponent';
import { PalletComponent } from '../components/PalletComponent';
import type { ProductDef } from '../content/definitions';
import type { FactoryContext } from './FactoryContext';
import { createCartonEntity } from './createProductEntity';
import { place } from '../world/CartonStorage';

// Eine Palette mit Kartons (data/lager/standard.json → "palette"): Kartons stehen in Lagen auf der Palette.

export function createPalletEntity(ctx: FactoryContext): Entity {
  const p = ctx.content.lager.palette;
  const e = new Entity('palette');
  e.add(new ModelComponent({ groesse: p.groesse, farbe: '#d2b27c' }, p.model, ctx.models));
  e.add(new StorageSurfaceComponent(p.groesse, { ebenen: p.lagen }, ctx.content.lager.karton.groesse, { palette: true }));
  e.add(new SelectableComponent('palette', 'Palette', ctx.content.kontexte.palette?.name ?? 'Palette'));
  e.add(new PalletComponent());
  return e;
}

/** Kartons pro voller Palette */
export function cartonsPerPallet(ctx: FactoryContext): number {
  const p = ctx.content.lager.palette, k = ctx.content.lager.karton.groesse;
  return Math.floor(p.groesse[0] / k[0]) * Math.floor(p.groesse[2] / k[2]) * p.lagen;
}

/** Palette in die Welt stellen und mit Kartons beladen (die Palette muss schon in der Welt sein, damit die Kartons mitwandern) */
export function loadPallet(pallet: Entity, produkt: ProductDef, kartons: number, menge: number, ctx: FactoryContext): number {
  const world = pallet.world!;
  const surface = pallet.require(StorageSurfaceComponent);
  let n = 0;
  for (let i = 0; i < kartons; i++) {
    const c = world.add(createCartonEntity(produkt, menge, ctx));
    if (!place(c, surface)) { world.remove(c); break; }
    n++;
  }
  pallet.require(PalletComponent).sync(true);
  return n;
}
