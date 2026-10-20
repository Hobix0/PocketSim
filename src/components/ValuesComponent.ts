import { Component } from '../ecs/Component';
import type { World } from '../ecs/World';
import type { ValueInfo } from '../content/definitions';
import type { Describable, InfoRow } from '../ui/describe';

// Werte eines Bauteils (Regalplätze, Strom, Kassen …).
// Prinzip: Ein Raum oder Gebäude hat keine eigenen Werte – sie sind die Summe
// seiner Bauteile. sumValues() bildet diese Summe.

export class ValuesComponent extends Component implements Describable {
  constructor(
    readonly werte: Readonly<Record<string, number>>,
    private readonly infos: Readonly<Record<string, ValueInfo>> = {},
  ) {
    super();
  }

  describe(): InfoRow[] {
    return Object.entries(this.werte).map(([key, n]) => ({
      label: this.infos[key]?.name ?? key,
      value: formatValue(n, this.infos[key]?.einheit),
    }));
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

/** Zahl mit Einheit, deutsch formatiert: 0.8 + "kW" → "0,8 kW". */
export function formatValue(n: number, einheit = ''): string {
  const text = n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  return einheit ? `${text} ${einheit}` : text;
}
