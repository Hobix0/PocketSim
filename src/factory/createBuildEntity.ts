import * as THREE from 'three';
import { Entity } from '../ecs/Entity';
import { ModelComponent } from '../components/ModelComponent';
import { ValuesComponent } from '../components/ValuesComponent';
import { SelectableComponent } from '../components/SelectableComponent';
import { StorageSurfaceComponent } from '../components/StorageSurfaceComponent';
import { TerminalComponent } from '../components/TerminalComponent';
import { FootprintComponent } from '../components/FootprintComponent';
import { ShelfComponent } from '../components/ShelfComponent';
import type { BuildDef } from '../content/definitions';
import type { FactoryContext } from './FactoryContext';
import { formatMoney } from '../ui/format';

// Baut aus einer Bauelement-Definition eine fertige Entity.
// Welche Komponenten sie bekommt, entscheiden die Felder der Definition.
// Neue Fähigkeiten kommen als weitere Zeile hier dazu.

export interface Placement {
  position: [number, number, number];
  drehung: number; // Grad um die Hochachse
}

export function createBuildEntity(def: BuildDef, placement: Placement, ctx: FactoryContext): Entity {
  const { content } = ctx;
  const entity = new Entity(def.id);
  entity.object.position.set(...placement.position);
  entity.object.rotation.y = THREE.MathUtils.degToRad(placement.drehung);

  entity.add(new ModelComponent(def.platzhalter, def.model, ctx.models));
  entity.add(new FootprintComponent(def.ebene, def.platzhalter.groesse));
  entity.add(new ValuesComponent(def.werte, content.werte));
  if (def.regal) entity.add(new ShelfComponent(def.regal, ctx.models, ctx.actions));
  if (def.kontext) {
    const kontextName = content.kontexte[def.kontext].name;
    entity.add(new SelectableComponent(def.kontext, def.name, `${kontextName} · ${formatMoney(def.preis).replace(',00', '')}`));
  }
  if (def.ablage) {
    entity.add(new StorageSurfaceComponent(def.platzhalter.groesse, def.ablage, content.lager.karton.groesse));
  }
  for (const f of def.funktionen) {
    if (f === 'einkauf') entity.add(new TerminalComponent(() => ctx.actions?.openPurchase()));
    else console.warn(`${def.id}: unbekannte Funktion "${f}"`);
  }
  return entity;
}
