import * as THREE from 'three';
import { Entity } from '../ecs/Entity';
import { ModelComponent } from '../components/ModelComponent';
import type { ProductDef } from '../content/definitions';
import type { ModelProvider } from '../assets/ModelLibrary';
import type { Placement } from './createBuildEntity';

// Baut aus einer Produkt-Definition eine Entity (z. B. eine Packung im Regal).
// Weitere Fähigkeiten (Haltbarkeit, Preisschild …) kommen später als Komponenten dazu.

export function createProductEntity(def: ProductDef, placement: Placement, models?: ModelProvider): Entity {
  const entity = new Entity(def.id);
  entity.object.position.set(...placement.position);
  entity.object.rotation.y = THREE.MathUtils.degToRad(placement.drehung);
  const groesse = def.groesse ?? [0.1, 0.1, 0.1];
  entity.add(new ModelComponent({ groesse, farbe: '#d8d2c4' }, def.model, models));
  return entity;
}
