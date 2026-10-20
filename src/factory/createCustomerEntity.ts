import { Entity } from '../ecs/Entity';
import { FigureComponent } from '../components/FigureComponent';
import { SelectableComponent } from '../components/SelectableComponent';
import { CustomerComponent, type CustomerServices } from '../components/CustomerComponent';
import type { Wish } from '../economy/Customers';
import type { FactoryContext } from './FactoryContext';
import { lookFromSeed } from '../voxel/figure';

// Ein Kunde als Spielfigur: Aussehen aus der laufenden Nummer, Einkaufsliste vom Spiel.

export function createCustomerEntity(
  nummer: number,
  name: string,
  start: [number, number, number],
  wishes: Wish[],
  services: CustomerServices,
  ctx: FactoryContext,
): Entity {
  const { content } = ctx;
  const entity = new Entity('kunde');
  entity.object.position.set(...start);
  // Andere Startnummer als beim Personal, damit sich die Gesichter nicht wiederholen
  entity.add(new FigureComponent(lookFromSeed(content.figuren, 1000 + nummer), content.figuren.kantenlaenge));
  entity.add(new SelectableComponent('kunde', name, content.kontexte.kunde.name));
  entity.add(new CustomerComponent(wishes, services));
  return entity;
}
