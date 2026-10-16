import { Component } from '../ecs/Component';
import type { World } from '../ecs/World';

// Werte eines Bauteils (Regalplätze, Strom, Kassen …).
// Prinzip: Ein Raum oder Gebäude hat keine eigenen Werte – sie sind die Summe
// seiner Bauteile. sumValues() bildet diese Summe.

export class ValuesComponent extends Component {
  constructor(readonly werte: Readonly<Record<string, number>>) {
    super();
  }
}

/** Werte aller Entities aufsummieren. Optional nur die, für die `filter` true liefert. */
export function sumValues(world: World, filter: (entityId: number) => boolean = () => true): Record<string, number> {
  const sum: Record<string, number> = {};
  for (const [entity, values] of world.query(ValuesComponent)) {
    if (!filter(entity.id)) continue;
    for (const [key, n] of Object.entries(values.werte)) sum[key] = (sum[key] ?? 0) + n;
  }
  return sum;
}
