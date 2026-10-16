import * as THREE from 'three';
import { Entity } from '../ecs/Entity';
import { ModelComponent } from '../components/ModelComponent';
import { ValuesComponent } from '../components/ValuesComponent';
import { SelectableComponent } from '../components/SelectableComponent';
import type { BuildDef } from '../content/definitions';
import type { Content } from '../content/Content';

// Baut aus einer Bauelement-Definition eine fertige Entity.
// Welche Komponenten sie bekommt, entscheiden die Felder der Definition.
// Neue Fähigkeiten (z. B. Regal-Slots) kommen als weitere Zeile hier dazu.

export interface Placement {
  position: [number, number, number];
  drehung: number; // Grad um die Hochachse
}

export function createBuildEntity(def: BuildDef, placement: Placement, content: Content): Entity {
  const entity = new Entity(def.id);
  entity.object.position.set(...placement.position);
  entity.object.rotation.y = THREE.MathUtils.degToRad(placement.drehung);

  entity.add(new ModelComponent(def.platzhalter));
  entity.add(new ValuesComponent(def.werte, content.werte));
  if (def.kontext) {
    const kontextName = content.kontexte[def.kontext].name;
    entity.add(new SelectableComponent(def.kontext, def.name, `${kontextName} · ${formatEuro(def.preis)}`));
  }
  return entity;
}

function formatEuro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
