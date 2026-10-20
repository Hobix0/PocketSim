import { Component } from '../ecs/Component';
import type { Describable, InfoRow } from '../ui/describe';

// Laderampe: Hier hält der Liefer-LKW (rückwärts, Ladefläche an der Rampe) statt auf der Straße.
// Vorne (+X) ist die Seite, an der der LKW andockt. Die Flotte (TruckFleet) sucht sich freie Rampen.

export class RampComponent extends Component implements Describable {
  /** Steht gerade ein LKW hier? (setzt die Flotte) */
  belegt = false;

  /** Tiefe der Rampe in Fahrtrichtung des LKW (m) */
  constructor(readonly tiefe: number) {
    super();
  }

  describe(): InfoRow[] {
    return [{ label: 'Laderampe', value: this.belegt ? 'LKW wird entladen' : 'frei' }];
  }
}
