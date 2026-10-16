import { InteractableComponent, type InteractionOption } from '../interaction/InteractableComponent';
import type { GameActions } from '../factory/FactoryContext';
import { CartonComponent } from './CartonComponent';

// Macht einen Karton tragbar: Klick nimmt ihn in die Hand, ein zweiter Klick stellt ihn wieder ab.
// Kartons, die gerade eine Angestellte trägt, lassen sich nicht nehmen.

export class CarryableComponent extends InteractableComponent {
  override readonly kontext = 'karton';

  constructor(private readonly actions?: GameActions) {
    super();
  }

  options(): InteractionOption[] {
    const a = this.actions;
    if (!a || this.entity.get(CartonComponent)?.reservedBy) return [];
    if (a.carriedCarton() === this.entity) {
      return [{ aktion: 'auswaehlen', text: 'ablegen', prioritaet: 10, run: () => a.dropCarton() }];
    }
    return [{ aktion: 'auswaehlen', text: 'aufnehmen', prioritaet: 10, run: () => a.pickUpCarton(this.entity) }];
  }
}
