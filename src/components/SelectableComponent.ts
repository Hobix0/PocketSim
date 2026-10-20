import { InteractableComponent, type InteractionOption } from '../interaction/InteractableComponent';
import type { Interactor } from '../interaction/Interactor';

// Macht eine Entity anklickbar und auswählbar.
// Titel und Untertitel erscheinen im Tooltip und im Info-Fenster.

export class SelectableComponent extends InteractableComponent {
  constructor(
    override readonly kontext: string,
    readonly titel: string,
    readonly untertitel: string,
  ) {
    super();
  }

  options(by: Interactor): InteractionOption[] {
    if (by.selection.current === this.entity) return [];
    return [{ aktion: 'auswaehlen', text: 'auswaehlen', run: () => by.selection.set(this.entity) }];
  }
}
