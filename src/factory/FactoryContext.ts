import type { Content } from '../content/Content';
import type { ModelProvider } from '../assets/ModelLibrary';
import type { Entity } from '../ecs/Entity';
import type { CheckoutServices } from '../components/CheckoutComponent';

// Was die Fabriken zum Bauen von Entities brauchen.
// Neue Abhängigkeiten kommen hier dazu, ohne dass sich alle Aufrufe ändern.

/** Aktionen des Spiels, die Komponenten auslösen können (z. B. per Klick). */
export interface GameActions {
  /** Einkaufsfenster öffnen (für Einkaufsterminals). */
  openPurchase(): void;
  /** Karton, den der Spieler gerade trägt (oder null). */
  carriedCarton(): Entity | null;
  /** Karton in die Hand nehmen. */
  pickUpCarton(carton: Entity): void;
  /** Hand leeren (der Karton bleibt, wo er steht). */
  dropCarton(): void;
  /** Getragenen Karton in dieses Regal räumen. */
  stockInto(shelf: Entity): void;
}

export interface FactoryContext {
  content: Content;
  /** Fehlt in Tests ohne Browser – dann bleibt es bei Platzhalter-Quadern. */
  models?: ModelProvider;
  /** Fehlt in Tests – Funktionen wie "einkauf" tun dann nichts. */
  actions?: GameActions;
  /** Abrechnen an der Kasse; fehlt in Tests (dann kann nur der Kassierer-Code kassieren). */
  checkout?: CheckoutServices;
}
