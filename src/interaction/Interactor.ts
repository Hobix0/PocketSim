import * as THREE from 'three';
import { Emitter } from '../core/Emitter';
import type { Entity } from '../ecs/Entity';
import type { World } from '../ecs/World';
import type { InputMap } from '../input/InputMap';
import type { Pointer } from '../input/Pointer';
import { InteractableComponent, type InteractionOption } from './InteractableComponent';
import { setHighlight } from './highlight';
import type { Selection } from './Selection';

// Erkennt, welche Entity unter dem Mauszeiger liegt, hebt sie hervor und führt
// die angebotenen Aktionen aus, wenn der Spieler die passende Taste drückt.
// Die Entity entscheidet selbst, was passiert (über ihre InteractableComponents).

export interface InteractorEvents extends Record<string, unknown> {
  hoverChanged: Entity | null;
}

export class Interactor {
  readonly events = new Emitter<InteractorEvents>();
  hovered: Entity | null = null;
  /** Aus, solange z. B. ein Bauwerkzeug aktiv ist: dann wird nichts markiert oder angeklickt. */
  enabled = true;
  /** Zusätzlich hervorgehobene Entity (z. B. der Karton in der Hand). */
  marked: () => Entity | null = () => null;

  private readonly raycaster = new THREE.Raycaster();

  constructor(
    readonly world: World,
    readonly input: InputMap,
    readonly pointer: Pointer,
    readonly selection: Selection,
    private readonly highlightColor: THREE.ColorRepresentation,
  ) {
    selection.events.on('changed', ({ previous, current }) => {
      if (previous) this.refreshHighlight(previous);
      if (current) this.refreshHighlight(current);
    });
    // Entfernte Entities dürfen weder markiert noch ausgewählt bleiben
    world.events.on('removed', (e) => {
      if (this.hovered === e) this.setHovered(null);
      if (selection.current === e) selection.clear();
    });
  }

  /** Einmal pro Frame aufrufen. */
  update(camera: THREE.Camera): void {
    if (!this.enabled) {
      this.setHovered(null);
      return;
    }
    this.setHovered(this.pick(camera));

    if (this.hovered) {
      // Das erste Angebot, dessen Taste gedrückt wurde, wird ausgeführt
      const option = this.options().find((o) => this.input.wasPressed(o.aktion));
      option?.run(this);
    } else if (this.pointer.inside && this.input.wasPressed('auswaehlen')) {
      // Klick ins Leere hebt die Auswahl auf
      this.selection.clear();
    }
    // Esc hebt die Auswahl auf (später: erst Auswahl aufheben, dann Pausemenü)
    if (this.input.wasPressed('pause')) this.selection.clear();
  }

  /** Kontext unter dem Zeiger, z. B. "regal"; "nichts", wenn dort nichts ist. */
  getContext(): string {
    if (!this.hovered) return 'nichts';
    for (const c of this.interactables(this.hovered)) if (c.kontext) return c.kontext;
    return 'nichts';
  }

  /** Angebote der Entity unter dem Zeiger – pro Taste nur das mit der höchsten Priorität. */
  options(): InteractionOption[] {
    if (!this.hovered) return [];
    const best = new Map<string, InteractionOption>();
    for (const o of this.interactables(this.hovered).flatMap((c) => c.options(this))) {
      const current = best.get(o.aktion);
      if (!current || (o.prioritaet ?? 0) > (current.prioritaet ?? 0)) best.set(o.aktion, o);
    }
    return [...best.values()];
  }

  private interactables(entity: Entity): InteractableComponent[] {
    return entity.all().filter((c): c is InteractableComponent => c instanceof InteractableComponent);
  }

  private pick(camera: THREE.Camera): Entity | null {
    if (!this.pointer.inside) return null;
    const targets: THREE.Object3D[] = [];
    for (const e of this.world.all()) if (this.interactables(e).length) targets.push(e.object);
    if (!targets.length) return null;
    this.raycaster.setFromCamera(this.pointer.ndc, camera);
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    return hit ? this.entityOf(hit.object) : null;
  }

  /** Vom getroffenen Mesh nach oben laufen, bis die Gruppe der Entity erreicht ist. */
  private entityOf(obj: THREE.Object3D | null): Entity | null {
    while (obj) {
      const id = obj.userData.entityId as number | undefined;
      if (id !== undefined) return this.world.get(id) ?? null;
      obj = obj.parent;
    }
    return null;
  }

  private setHovered(entity: Entity | null): void {
    if (entity === this.hovered) return;
    const previous = this.hovered;
    this.hovered = entity;
    if (previous) this.refreshHighlight(previous);
    if (entity) this.refreshHighlight(entity);
    this.events.emit('hoverChanged', entity);
  }

  /** Angebote und Hervorhebung neu bestimmen, z. B. wenn sich die Hand geändert hat. */
  refresh(previouslyMarked?: Entity | null): void {
    if (previouslyMarked) this.refreshHighlight(previouslyMarked);
    const m = this.marked();
    if (m) this.refreshHighlight(m);
    this.events.emit('hoverChanged', this.hovered);
  }

  private refreshHighlight(entity: Entity): void {
    const selected = this.selection.current === entity || this.marked() === entity;
    const level = selected ? 'selected' : this.hovered === entity ? 'hover' : 'none';
    setHighlight(entity, level, this.highlightColor);
  }
}
