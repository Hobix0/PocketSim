import type { Content } from '../content/Content';
import type { ModelProvider } from '../assets/ModelLibrary';

// Was die Fabriken zum Bauen von Entities brauchen.
// Neue Abhängigkeiten kommen hier dazu, ohne dass sich alle Aufrufe ändern.

export interface GameActions {
  /** Einkaufsfenster öffnen (für Einkaufsterminals). */
  openPurchase(): void;
}

export interface FactoryContext {
  content: Content;
  /** Fehlt in Tests ohne Browser – dann bleibt es bei Platzhalter-Quadern. */
  models?: ModelProvider;
  /** Fehlt in Tests – Funktionen wie "einkauf" tun dann nichts. */
  actions?: GameActions;
}
