import * as THREE from 'three';
import { Emitter } from '../core/Emitter';
import type { BuildDef } from '../content/definitions';
import type { Content } from '../content/Content';
import type { Entity } from '../ecs/Entity';
import type { World } from '../ecs/World';
import type { InputMap } from '../input/InputMap';
import type { Pointer } from '../input/Pointer';
import type { PlayerState } from '../state/PlayerState';
import type { FactoryContext } from '../factory/FactoryContext';
import { createBuildEntity } from '../factory/createBuildEntity';
import { FootprintComponent } from '../components/FootprintComponent';
import { ShelfComponent } from '../components/ShelfComponent';
import { StorageSurfaceComponent } from '../components/StorageSurfaceComponent';
import { setHighlight } from '../interaction/highlight';
import { checkPlacement, snap, type PlacementError } from './placement';

// Bauwerkzeuge des Spielers (entspricht dem BuilderComponent aus UE5):
//   bauen      – Vorschau ("Ghost") folgt dem Zeiger, grün = frei, rot = geht nicht; Klick platziert
//   abreissen  – Klick auf ein Bauelement entfernt es (Teil des Preises zurück)
//   verschieben – Klick nimmt ein Bauelement auf, danach wie bauen (kostenlos)
// Gebaut werden nur Elemente aus den Kategorien des Baumenüs (data/baumenue).

export type Tool =
  | { art: 'bauen'; def: BuildDef; moving?: Entity }
  | { art: 'abreissen' }
  | { art: 'verschieben' };

export interface BuildEvents extends Record<string, unknown> {
  toolChanged: Tool | null;
  /** Etwas wurde gebaut oder verschoben */
  placed: { entity: Entity; moved: boolean };
  /** Meldung für den Spieler (Textschlüssel + Werte) */
  message: { key: string; werte?: Record<string, string | number>; art: 'info' | 'gut' | 'warnung' };
}

export class BuildController {
  readonly events = new Emitter<BuildEvents>();
  tool: Tool | null = null;
  /** Grund, warum an der aktuellen Stelle nicht gebaut werden kann (für das Menü) */
  problem: PlacementError | null = null;

  private quarter = 0;
  private ghost: THREE.Group | null = null;
  private ghostMaterial: THREE.MeshStandardMaterial;
  private hovered: Entity | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();
  private readonly menuKategorien: Set<string>;

  constructor(
    private readonly world: World,
    private readonly content: Content,
    private readonly player: PlayerState,
    private readonly input: InputMap,
    private readonly pointer: Pointer,
    private readonly scene: THREE.Scene,
    private readonly ctx: FactoryContext,
    private readonly colors: { ok: string; fehler: string },
  ) {
    this.menuKategorien = new Set(content.baumenue.kategorien.map((k) => k.id));
    this.ghostMaterial = new THREE.MeshStandardMaterial({ color: colors.ok, transparent: true, opacity: 0.45, depthWrite: false });
  }

  get active(): boolean {
    return this.tool !== null;
  }

  /** Darf dieses Element im Baumenü gebaut, abgerissen und verschoben werden? */
  isBuildable(def: BuildDef | undefined): def is BuildDef {
    return !!def && this.menuKategorien.has(def.kategorie);
  }

  startBuilding(def: BuildDef): void {
    this.setTool({ art: 'bauen', def });
  }

  startDemolish(): void {
    this.setTool({ art: 'abreissen' });
  }

  startMove(): void {
    this.setTool({ art: 'verschieben' });
  }

  cancel(): void {
    this.setTool(null);
  }

  /** Einmal pro Frame. */
  update(camera: THREE.Camera): void {
    if (!this.tool) return;
    if (this.tool.art === 'bauen') this.updateBuilding(camera, this.tool);
    else this.updatePicking(camera, this.tool.art);
  }

  // ── Bauen / Verschieben (Ghost) ─────────────────────────────────

  private updateBuilding(camera: THREE.Camera, tool: Extract<Tool, { art: 'bauen' }>): void {
    if (this.input.wasPressed('objekt_drehen')) this.quarter = (this.quarter + 1) % 4;
    if (!this.ghost) return;
    if (!this.pointer.inside || !this.groundPoint(camera)) { this.ghost.visible = false; return; }

    const raster = this.content.baumenue.raster;
    const x = snap(this.hit.x, raster), z = snap(this.hit.z, raster);
    const rotY = this.quarter * Math.PI / 2;
    const check = checkPlacement(this.world, tool.def, x, z, rotY, this.content.baumenue, {
      moving: tool.moving, geld: this.player.geld, level: this.player.level,
    });
    this.ghost.visible = true;
    this.ghost.position.set(x, check.y, z);
    this.ghost.rotation.y = rotY;
    this.ghostMaterial.color.set(check.ok ? this.colors.ok : this.colors.fehler);
    this.problem = check.ok ? null : check.grund ?? null;

    if (!this.input.wasPressed('auswaehlen')) return;
    if (!check.ok) {
      this.events.emit('message', { key: `bauen_fehler_${check.grund}`, werte: { level: tool.def.freischaltLevel }, art: 'warnung' });
      return;
    }
    if (tool.moving) {
      tool.moving.object.position.set(x, check.y, z);
      tool.moving.object.rotation.y = rotY;
      tool.moving.object.visible = true;
      const moved = tool.moving;
      this.setTool({ art: 'verschieben' }, true);
      this.events.emit('placed', { entity: moved, moved: true });
    } else if (this.player.spend(tool.def.preis, 'bau')) {
      const entity = this.world.add(createBuildEntity(tool.def, { position: [x, check.y, z], drehung: this.quarter * 90 }, this.ctx));
      this.events.emit('placed', { entity, moved: false });
    }
  }

  // ── Abreißen / Verschieben (Objekt auswählen) ───────────────────

  private updatePicking(camera: THREE.Camera, art: 'abreissen' | 'verschieben'): void {
    const target = this.pick(camera);
    if (target !== this.hovered) {
      if (this.hovered) setHighlight(this.hovered, 'none', this.colors.fehler);
      this.hovered = target;
      if (target) setHighlight(target, 'selected', art === 'abreissen' ? this.colors.fehler : this.colors.ok);
    }
    if (!target || !this.input.wasPressed('auswaehlen')) return;
    if (!isEmpty(target, art)) {
      this.events.emit('message', { key: 'bauen_fehler_nicht_leer', art: 'warnung' });
      return;
    }
    const def = this.content.bau.get(target.typeId);
    setHighlight(target, 'none', this.colors.fehler);
    this.hovered = null;
    if (art === 'abreissen') {
      this.world.remove(target);
      const betrag = Math.round(def.preis * this.content.baumenue.rueckerstattung * 100) / 100;
      this.player.earn(betrag, 'abriss');
      this.events.emit('message', { key: 'bauen_abgerissen', werte: { name: def.name, betrag: `${betrag.toLocaleString('de-DE')} €` }, art: 'info' });
    } else {
      this.quarter = Math.round(target.object.rotation.y / (Math.PI / 2)) & 3;
      target.object.visible = false;
      this.setTool({ art: 'bauen', def, moving: target }, true);
    }
  }

  private pick(camera: THREE.Camera): Entity | null {
    if (!this.pointer.inside) return null;
    const targets: THREE.Object3D[] = [];
    for (const [e] of this.world.query(FootprintComponent)) {
      if (this.isBuildable(this.content.bau.find(e.typeId))) targets.push(e.object);
    }
    this.raycaster.setFromCamera(this.pointer.ndc, camera);
    let obj: THREE.Object3D | null = this.raycaster.intersectObjects(targets, true)[0]?.object ?? null;
    while (obj) {
      const id = obj.userData.entityId as number | undefined;
      if (id !== undefined) return this.world.get(id) ?? null;
      obj = obj.parent;
    }
    return null;
  }

  // ── Hilfen ──────────────────────────────────────────────────────

  private setTool(tool: Tool | null, keepRotation = false): void {
    // Ein unterbrochenes Verschieben stellt das Objekt wieder hin
    if (this.tool?.art === 'bauen' && this.tool.moving && this.tool !== tool) this.tool.moving.object.visible = true;
    if (this.hovered) { setHighlight(this.hovered, 'none', this.colors.fehler); this.hovered = null; }
    this.removeGhost();
    if (!keepRotation) this.quarter = 0;
    this.tool = tool;
    this.problem = null;
    if (tool?.art === 'bauen') this.createGhost(tool.def);
    this.events.emit('toolChanged', tool);
  }

  private createGhost(def: BuildDef): void {
    const g = new THREE.Group();
    const [w, h, d] = def.platzhalter.groesse;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.ghostMaterial);
    box.position.y = h / 2;
    g.add(box);
    g.visible = false;
    this.ghost = g;
    this.scene.add(g);
    if (def.model && this.ctx.models) {
      this.ctx.models.instance(def.model).then((obj) => {
        if (this.ghost !== g) return;
        obj.traverse((o) => { if (o instanceof THREE.Mesh) { o.material = this.ghostMaterial; o.castShadow = false; } });
        g.remove(box);
        box.geometry.dispose();
        g.add(obj);
      });
    }
  }

  private removeGhost(): void {
    if (!this.ghost) return;
    this.scene.remove(this.ghost);
    this.ghost.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') o.geometry.dispose(); });
    this.ghost = null;
  }

  private groundPoint(camera: THREE.Camera): boolean {
    this.raycaster.setFromCamera(this.pointer.ndc, camera);
    return this.raycaster.ray.intersectPlane(this.plane, this.hit) !== null;
  }
}

/** Abreißen nur ohne Ware; Verschieben von Lagerflächen nur ohne Kartons (Regale dürfen voll umziehen). */
function isEmpty(e: Entity, art: 'abreissen' | 'verschieben'): boolean {
  const shelf = e.get(ShelfComponent);
  const storage = e.get(StorageSurfaceComponent);
  if (storage && storage.used > 0) return false;
  if (art === 'abreissen' && shelf && shelf.bestand > 0) return false;
  return true;
}
