import { InteractableComponent, type InteractionOption } from '../interaction/InteractableComponent';
import type { GameActions } from '../factory/FactoryContext';
import { CartonComponent } from './CartonComponent';
import { StorageSurfaceComponent } from './StorageSurfaceComponent';

// Umlagern von Hand: Mit einem Karton in der Hand stellt ein Klick auf eine Ablage
// (Palette, Lagerregal, Gitterbox …) ihn dort auf den nächsten freien Platz.
// So lädt man auch den LKW ab: Karton auf der Ladefläche anklicken, dann die Palette.

export class StorageDropComponent extends InteractableComponent {
  override readonly kontext = 'ablage';

  constructor(private readonly actions?: GameActions) {
    super();
  }

  options(): InteractionOption[] {
    const a = this.actions;
    const carried = a?.carriedCarton();
    const surface = this.entity.get(StorageSurfaceComponent);
    if (!a || !carried || !surface || surface.free <= 0) return [];
    if (carried.get(CartonComponent)?.ablage === surface) return [];
    return [{ aktion: 'auswaehlen', text: 'abstellen', prioritaet: 9, run: () => a.placeCarton(this.entity) }];
  }
}
