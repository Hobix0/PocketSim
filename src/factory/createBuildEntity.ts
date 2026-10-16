import * as THREE from 'three';
import { Entity } from '../ecs/Entity';
import { ModelComponent } from '../components/ModelComponent';
import { ValuesComponent } from '../components/ValuesComponent';
import type { BuildDef } from '../content/definitions';

// Baut aus einer Bauelement-Definition eine fertige Entity.
// Neue Fähigkeiten (z. B. Regal-Slots, Interaktion) kommen später als weitere
// Komponenten hier dazu, gesteuert über Felder in der Definition.

export interface Placement {
  position: [number, number, number];
  drehung: number; // Grad um die Hochachse
}

export function createBuildEntity(def: BuildDef, placement: Placement): Entity {
  const entity = new Entity(def.id);
  entity.object.position.set(...placement.position);
  entity.object.rotation.y = THREE.MathUtils.degToRad(placement.drehung);
  entity.add(new ModelComponent(def.platzhalter));
  entity.add(new ValuesComponent(def.werte));
  return entity;
}
