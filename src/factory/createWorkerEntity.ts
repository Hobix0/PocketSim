import { Entity } from '../ecs/Entity';
import { FigureComponent } from '../components/FigureComponent';
import { SelectableComponent } from '../components/SelectableComponent';
import { WorkerComponent, type WorkerServices } from '../components/WorkerComponent';
import type { Employee } from '../economy/Staff';
import type { FactoryContext } from './FactoryContext';

// Eine angestellte Person als Spielfigur mit Arbeitsverhalten.

export function createWorkerEntity(employee: Employee, services: Omit<WorkerServices, 'rollenName' | 'text'>, ctx: FactoryContext): Entity {
  const { content } = ctx;
  const rolle = content.rollen[employee.rolle];
  const entity = new Entity('personal');
  entity.object.position.set(...content.personal.startPunkt);
  entity.add(new FigureComponent(rolle.farbe));
  entity.add(new SelectableComponent('personal', employee.name, rolle.name));
  entity.add(new WorkerComponent(employee, { ...services, rollenName: rolle.name, text: (k, v) => content.text(k, v) }));
  return entity;
}
