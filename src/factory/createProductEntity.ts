import * as THREE from 'three';
import { Entity } from '../ecs/Entity';
import { ModelComponent } from '../components/ModelComponent';
import { AttachedModelComponent } from '../components/AttachedModelComponent';
import { CartonComponent } from '../components/CartonComponent';
import { SelectableComponent } from '../components/SelectableComponent';
import type { ProductDef } from '../content/definitions';
import type { FactoryContext } from './FactoryContext';
import type { Placement } from './createBuildEntity';

// Entities rund um Produkte: einzelne Packungen und Kartons.

/** Eine einzelne Packung, z. B. im Regal oder in der Musterschau. */
export function createProductEntity(def: ProductDef, placement: Placement, ctx: FactoryContext): Entity {
  const entity = new Entity(def.id);
  entity.object.position.set(...placement.position);
  entity.object.rotation.y = THREE.MathUtils.degToRad(placement.drehung);
  const groesse = def.groesse ?? [0.1, 0.1, 0.1];
  entity.add(new ModelComponent({ groesse, farbe: '#d8d2c4' }, def.model, ctx.models));
  return entity;
}

/** Ein Karton mit `menge` Stück eines Produkts; oben drauf steht eine Packung als Erkennungszeichen. */
export function createCartonEntity(def: ProductDef, menge: number, ctx: FactoryContext): Entity {
  const karton = ctx.content.lager.karton;
  const [, h] = karton.groesse;
  const entity = new Entity('karton');
  entity.add(new ModelComponent(karton));
  if (def.model) entity.add(new AttachedModelComponent(def.model, ctx.models, [0, h, 0], Math.min(...karton.groesse) * 0.8));
  entity.add(new CartonComponent(def, menge));
  entity.add(new SelectableComponent('karton', def.name, `${ctx.content.kontexte.karton.name} · ${menge} Stück`));
  return entity;
}
