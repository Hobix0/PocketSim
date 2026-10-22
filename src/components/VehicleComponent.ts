import { Component } from '../ecs/Component';
import type { VehicleKind } from '../content/definitions';
import type { Describable, InfoRow } from '../ui/describe';

// Ein Fahrzeug für Paletten (Gabelstapler, Hubwagen), das als Bauteil irgendwo geparkt steht.
// Ein Staplerfahrer holt es sich, fährt damit (dann ist das geparkte Modell ausgeblendet) und stellt es
// nach getaner Arbeit wieder an seinen Parkplatz.

export class VehicleComponent extends Component implements Describable {
  /** Entity-id des Fahrers, sonst null */
  fahrer: number | null = null;

  constructor(readonly art: VehicleKind, readonly maxHoehe: number) {
    super();
  }

  get frei(): boolean {
    return this.fahrer === null;
  }

  describe(): InfoRow[] {
    return [
      { label: 'Hubhöhe', value: `bis ${this.maxHoehe.toFixed(1).replace('.', ',')} m` },
      { label: 'Gerade', value: this.fahrer === null ? 'geparkt' : 'im Einsatz' },
    ];
  }
}
