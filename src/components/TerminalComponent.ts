import { InteractableComponent, type InteractionOption } from '../interaction/InteractableComponent';

// Einkaufsterminal: Ein Klick öffnet den Großhandel.
// Was dann passiert (Fenster, Bestellung), liegt außerhalb – die Komponente
// bekommt nur gesagt, wie sie das Fenster öffnet.

export class TerminalComponent extends InteractableComponent {
  override readonly kontext = 'terminal';

  constructor(private readonly open: () => void) {
    super();
  }

  options(): InteractionOption[] {
    // Höhere Priorität als "Auswählen": Klick auf das Terminal öffnet den Einkauf
    return [{ aktion: 'auswaehlen', text: 'einkaufen', prioritaet: 10, run: () => this.open() }];
  }
}
