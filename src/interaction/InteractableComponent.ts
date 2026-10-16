import { Component } from '../ecs/Component';
import type { Interactor } from './Interactor';

// Gemeinsame Schnittstelle für alles, womit man interagieren kann.
// Jede Komponente, die etwas anbietet (Auswählen, später Einräumen, Kassieren …),
// erbt von dieser Klasse. Eine Entity kann mehrere davon tragen; der Interactor
// sammelt die Angebote aller Komponenten ein.

/** Ein Angebot an den Spieler, z. B. "[Linksklick] Auswählen". */
export interface InteractionOption {
  /** Eingabe-Aktion, die das Angebot auslöst (aus data/eingabe). */
  aktion: string;
  /** Schlüssel für den Hinweistext (aus data/interaktion/texte.json). */
  text: string;
  /** Wird ausgeführt, wenn der Spieler die Aktion auslöst. */
  run(by: Interactor): void;
}

export abstract class InteractableComponent extends Component {
  /** Kontext für Hinweise, z. B. "regal" (aus data/interaktion/kontexte.json). Optional. */
  readonly kontext?: string;

  /** Was gerade möglich ist. Darf vom Zustand abhängen (z. B. nur mit Ware in der Hand). */
  abstract options(by: Interactor): InteractionOption[];
}
