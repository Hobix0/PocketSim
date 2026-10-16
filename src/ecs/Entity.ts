import * as THREE from 'three';
import type { Component, ComponentClass } from './Component';
import type { World } from './World';

// Ein Objekt im Spiel (Regal, Kasse, später Kunde, Fahrzeug …).
// Die Entity selbst kann nichts – alles Verhalten kommt aus ihren Komponenten.
// `object` ist ihr Platz in der three.js-Szene; Komponenten hängen Meshes daran.

let nextId = 1;

export class Entity {
  readonly id = nextId++;
  readonly object = new THREE.Group();
  /** Die Welt, in der die Entity gerade ist (null, solange sie noch nicht hinzugefügt wurde). */
  world: World | null = null;

  private readonly components: Component[] = [];

  /** typeId verweist auf die Datendefinition, z. B. "regal_standard". */
  constructor(readonly typeId: string) {
    this.object.name = `${typeId}#${this.id}`;
    this.object.userData.entityId = this.id;
  }

  /** Komponente anhängen. Pro Klasse ist nur eine Komponente erlaubt. */
  add<T extends Component>(component: T): T {
    const cls = component.constructor as ComponentClass<T>;
    if (this.components.some((c) => c.constructor === cls)) {
      throw new Error(`${this.object.name} hat schon eine ${cls.name}`);
    }
    component.entity = this;
    this.components.push(component);
    if (this.world) component.onAttach();
    return component;
  }

  /** Komponente einer Klasse (oder einer Unterklasse davon) holen. */
  get<T extends Component>(cls: ComponentClass<T>): T | undefined {
    return this.components.find((c): c is T => c instanceof cls);
  }

  /** Wie get, aber mit Fehler, wenn die Komponente fehlt. */
  require<T extends Component>(cls: ComponentClass<T>): T {
    const c = this.get(cls);
    if (!c) throw new Error(`${this.object.name} hat keine ${cls.name}`);
    return c;
  }

  has(cls: ComponentClass<Component>): boolean {
    return this.get(cls) !== undefined;
  }

  /** Komponente entfernen; gibt true zurück, wenn es eine gab. */
  remove(cls: ComponentClass<Component>): boolean {
    const c = this.get(cls);
    if (!c) return false;
    if (this.world) c.onDetach();
    this.components.splice(this.components.indexOf(c), 1);
    return true;
  }

  /** Alle Komponenten (nur lesen). */
  all(): readonly Component[] {
    return this.components;
  }
}
