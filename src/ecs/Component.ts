import type { Entity } from './Entity';

// Basisklasse für alle Komponenten. Eine Komponente ist ein Stück Verhalten
// oder ein Satz Werte, den man an beliebige Entities hängen kann.
//
// Lebenszyklus:
//   onAttach()  – die Entity ist jetzt in der Welt (Szene, andere Komponenten verfügbar)
//   update(dt)  – einmal pro Frame, dt in Sekunden
//   onDetach()  – die Entity verlässt die Welt oder die Komponente wird entfernt

export abstract class Component {
  /** Die Entity, an der diese Komponente hängt. Wird von Entity.add gesetzt. */
  entity!: Entity;

  onAttach(): void {}
  update(_dt: number): void {}
  onDetach(): void {}
}

/** Eine Komponenten-Klasse, z. B. ModelComponent. Abstrakte Klassen sind erlaubt. */
export type ComponentClass<T extends Component> = abstract new (...args: any[]) => T;
