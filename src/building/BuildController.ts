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
import { type Rect, FootprintComponent } from '../components/FootprintComponent';
import { ShelfComponent } from '../components/ShelfComponent';
import { StorageSurfaceComponent } from '../components/StorageSurfaceComponent';
import { setHighlight } from '../interaction/highlight';
import { checkPlacement, railAt, type PlacementError } from './placement';
import { snapPlacement } from './snapping';
import { inBuildCategory } from '../content/definitions';
import { damp, dampAngle } from '../fx/Tweens';
import type { Plots } from '../world/Plots';

// Bauwerkzeuge des Spielers (entspricht dem BuilderComponent aus UE5):
//   bauen      – Vorschau ("Ghost") folgt dem Zeiger, grün = frei, rot = geht nicht; Klick platziert
//   abreissen  – Klick auf ein Bauelement entfernt es (Teil des Preises zurück)
//   verschieben – Klick nimmt ein Bauelement auf, danach wie bauen (kostenlos)
// Böden werden flächig aufgezogen: Maustaste gedrückt halten und ein Rechteck ziehen, beim Loslassen
// entstehen alle Platten auf einmal (bereits belegte Stellen werden übersprungen).
// Gebaut werden nur Elemente aus den Kategorien des Baumenüs (data/baumenue).

export type Tool =
  | { art: 'bauen'; def: BuildDef; moving?: Entity }
  | { art: 'abreissen' }
  | { art: 'verschieben' };

export interface BuildEvents extends Record<string, unknown> {
  toolChanged: Tool | null;
  /** Etwas wurde gebaut oder verschoben */
  placed: { entity: Entity; moved: boolean };
  /** Wird gleich entfernt (Abriss) – für Effekte, die Entity ist noch in der Welt */
  removing: { entity: Entity };
  /** Zum Verschieben aufgenommen */
  picked: { entity: Entity };
  /** Vorschau gedreht */
  rotated: undefined;
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
  private readonly plotLines = new THREE.Group();
  /** Böden aufziehen: Startpunkt und Vorschau je Platte */
  private dragStart: { x: number; z: number } | null = null;
  private dragGhosts: THREE.Object3D[] = [];
  private readonly ghostBad: THREE.MeshStandardMaterial;
  /** Bewegung der Vorschau: Nachführen von Position/Drehung, Schweben (aus data/effekte) */
  motion = { folgen: 18, drehen: 14, schweben: 0.06 };
  private readonly ghostGoal = new THREE.Vector3();
  private ghostRot = 0;
  private ghostShown = false;
  private zeit = 0;

  /** Ist eine Forschung erledigt? (Game setzt den Forschungsbaum ein) */
  erforscht: (id: string) => boolean = () => true;
  /** Name einer Forschung für Meldungen */
  forschungName: (id: string) => string = (id) => id;

  /** Platzhalter für Sperr-Meldungen: Level und Name der Forschung */
  sperrWerte(def: BuildDef): Record<string, string | number> {
    return { level: def.freischaltLevel, forschung: def.forschung ? this.forschungName(def.forschung) : '' };
  }

  constructor(
    private readonly world: World,
    private readonly content: Content,
    private readonly player: PlayerState,
    private readonly input: InputMap,
    private readonly pointer: Pointer,
    private readonly scene: THREE.Scene,
    private readonly ctx: FactoryContext,
    private readonly colors: { ok: string; fehler: string },
    private readonly plots?: Plots,
    /** Freier Stromanschluss für neue Verbraucher (kW) */
    private readonly stromFrei?: () => number,
    /** Größte Geländeveränderung in einem Rechteck (zum Bauen muss es eben sein) */
    private readonly gelaende?: (r: Rect) => number,
  ) {
    this.plotLines.visible = false;
    scene.add(this.plotLines);
    plots?.events.on('bought', () => this.drawPlots());
    this.drawPlots();
    this.ghostMaterial = new THREE.MeshStandardMaterial({ color: colors.ok, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghostBad = new THREE.MeshStandardMaterial({ color: colors.fehler, transparent: true, opacity: 0.45, depthWrite: false });
  }

  /** Wird gerade eine Bodenfläche aufgezogen? */
  get dragging(): boolean {
    return this.dragStart !== null;
  }

  get active(): boolean {
    return this.tool !== null;
  }

  /** Darf dieses Element im Baumenü gebaut, abgerissen und verschoben werden? */
  isBuildable(def: BuildDef | undefined): def is BuildDef {
    return !!def && this.content.baumenue.kategorien.some((k) => inBuildCategory(def, k));
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

  /** Einmal pro Frame (dt: echte Sekunden, für die weiche Vorschau). */
  update(camera: THREE.Camera, dt = 1 / 60): void {
    if (!this.tool) return;
    this.zeit += dt;
    if (this.tool.art === 'bauen') { this.updateBuilding(camera, this.tool); this.moveGhost(dt); }
    else this.updatePicking(camera, this.tool.art);
  }

  /** Vorschau gleitet zum Ziel, dreht sich weich und schwebt ein wenig */
  private moveGhost(dt: number): void {
    const g = this.ghost;
    if (!g || !g.visible || this.dragStart) { this.ghostShown = false; return; }
    const m = this.motion;
    const hover = m.schweben + Math.sin(this.zeit * 3) * m.schweben * 0.3;
    if (!this.ghostShown) {
      // Erstes Bild: direkt hin, nicht von irgendwo hereinfliegen
      this.ghostShown = true;
      g.position.copy(this.ghostGoal).setY(this.ghostGoal.y + hover);
      g.rotation.y = this.ghostRot;
      return;
    }
    g.position.x = damp(g.position.x, this.ghostGoal.x, m.folgen, dt);
    g.position.z = damp(g.position.z, this.ghostGoal.z, m.folgen, dt);
    g.position.y = damp(g.position.y, this.ghostGoal.y + hover, m.folgen, dt);
    g.rotation.y = dampAngle(g.rotation.y, this.ghostRot, m.drehen, dt);
  }

  // ── Bauen / Verschieben (Ghost) ─────────────────────────────────

  private updateBuilding(camera: THREE.Camera, tool: Extract<Tool, { art: 'bauen' }>): void {
    if (this.input.wasPressed('objekt_drehen')) { this.quarter = (this.quarter + 1) % 4; this.events.emit('rotated', undefined); }
    if (!this.ghost) return;
    if (!this.pointer.inside || !this.groundPoint(camera)) { this.ghost.visible = false; return; }

    const snapped = snapPlacement(this.world, tool.def, this.hit.x, this.hit.z, this.quarter, this.content.baumenue);
    const { x, z } = snapped;
    const rotY = THREE.MathUtils.degToRad(snapped.drehung);
    const check = checkPlacement(this.world, tool.def, x, z, rotY, this.content.baumenue, {
      moving: tool.moving, geld: this.player.geld, level: this.player.level, erforscht: this.erforscht,
      plotOk: this.plots ? (px, pz, rand) => this.plots!.allows(px, pz, rand) : undefined,
      stromFrei: this.stromFrei?.(),
      gelaendeOk: this.gelaende ? (r) => this.gelaende!(r) <= 0.05 : undefined,
    });
    this.ghost.visible = true;
    // Ziel der Vorschau (moveGhost gleitet weich dorthin)
    this.ghostGoal.set(x, check.y, z);
    this.ghostRot = rotY;
    this.ghostMaterial.color.set(check.ok ? this.colors.ok : this.colors.fehler);
    this.problem = check.ok ? null : check.grund ?? null;

    if (isAreaPiece(tool)) { this.updateArea(tool.def, x, z, snapped.drehung); return; }
    if (!this.input.wasPressed('auswaehlen')) return;
    if (!check.ok) {
      this.events.emit('message', { key: `bauen_fehler_${check.grund}`, werte: this.sperrWerte(tool.def), art: 'warnung' });
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
      const entity = this.world.add(createBuildEntity(tool.def, { position: [x, check.y, z], drehung: snapped.drehung }, this.ctx));
      this.events.emit('placed', { entity, moved: false });
    }
  }

  // ── Böden flächig aufziehen ─────────────────────────────────────

  private updateArea(def: BuildDef, x: number, z: number, drehung: number): void {
    if (this.input.wasPressed('auswaehlen')) this.dragStart = { x, z };
    if (!this.dragStart) return;
    this.ghostMaterial.color.set(this.colors.ok);
    const tiles = this.areaTiles(def, this.dragStart, { x, z }, drehung);
    this.ghost!.visible = false;
    this.showAreaGhosts(tiles, drehung);
    const ok = tiles.filter((t) => t.ok);
    this.problem = ok.length ? null : tiles[0]?.grund ?? null;
    if (this.input.isHeld('auswaehlen')) return;

    // Losgelassen: alle freien Platten bauen
    this.clearAreaGhosts();
    this.dragStart = null;
    if (!ok.length) {
      this.events.emit('message', { key: `bauen_fehler_${tiles[0]?.grund ?? 'belegt'}`, werte: this.sperrWerte(def), art: 'warnung' });
      return;
    }
    if (!this.player.spend(def.preis * ok.length, 'bau')) return;
    for (const t of ok) {
      const entity = this.world.add(createBuildEntity(def, { position: [t.x, t.y, t.z], drehung }, this.ctx));
      this.events.emit('placed', { entity, moved: false });
    }
    if (ok.length > 1) this.events.emit('message', { key: 'bauen_flaeche', werte: { anzahl: ok.length, betrag: `${(def.preis * ok.length).toLocaleString('de-DE')} €` }, art: 'gut' });
  }

  /** Alle Platten im aufgezogenen Rechteck (höchstens 20 × 20), jede mit Prüfung; Geld reicht für die ersten */
  private areaTiles(def: BuildDef, a: { x: number; z: number }, b: { x: number; z: number }, drehung: number) {
    const [w, , d] = def.platzhalter.groesse;
    const quer = Math.abs(drehung) % 180 === 90;
    const sx = quer ? d : w, sz = quer ? w : d;
    const nx = Math.min(20, Math.round(Math.abs(b.x - a.x) / sx) + 1), nz = Math.min(20, Math.round(Math.abs(b.z - a.z) / sz) + 1);
    const dx = Math.sign(b.x - a.x) * sx, dz = Math.sign(b.z - a.z) * sz;
    const rotY = THREE.MathUtils.degToRad(drehung);
    const tiles: { x: number; z: number; y: number; ok: boolean; grund?: PlacementError }[] = [];
    let geld = this.player.geld;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = a.x + i * dx, z = a.z + j * dz;
      const check = checkPlacement(this.world, def, x, z, rotY, this.content.baumenue, {
        geld, level: this.player.level, erforscht: this.erforscht,
        plotOk: this.plots ? (px, pz, rand) => this.plots!.allows(px, pz, rand) : undefined,
        gelaendeOk: this.gelaende ? (r) => this.gelaende!(r) <= 0.05 : undefined,
      });
      if (check.ok) geld -= def.preis;
      tiles.push({ x, z, y: check.y, ok: check.ok, grund: check.grund });
    }
    return tiles;
  }

  private showAreaGhosts(tiles: { x: number; z: number; y: number; ok: boolean }[], drehung: number): void {
    const source = this.ghost!;
    while (this.dragGhosts.length < tiles.length) {
      const g = source.clone(true);
      this.scene.add(g);
      this.dragGhosts.push(g);
    }
    this.dragGhosts.forEach((g, i) => {
      const t = tiles[i];
      g.visible = !!t;
      if (!t) return;
      g.position.set(t.x, t.y, t.z);
      g.rotation.y = THREE.MathUtils.degToRad(drehung);
      const mat = t.ok ? this.ghostMaterial : this.ghostBad;
      g.traverse((o) => { if (o instanceof THREE.Mesh) o.material = mat; });
    });
  }

  private clearAreaGhosts(): void {
    for (const g of this.dragGhosts) this.scene.remove(g);
    this.dragGhosts = [];
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
    // Stützrahmen, an denen noch Traversen hängen, bleiben stehen (erst die Ebenen abbauen)
    if (target.get(FootprintComponent)?.regalteil === 'rahmen' && this.hasBeams(target)) {
      this.events.emit('message', { key: 'bauen_fehler_traversen', art: 'warnung' });
      return;
    }
    const def = this.content.bau.get(target.typeId);
    setHighlight(target, 'none', this.colors.fehler);
    this.hovered = null;
    if (art === 'abreissen') {
      // Anbauteile (Markise, Dachkante …) hängen am Wandmodul und gehen mit
      let preis = def.preis;
      if (def.ebene === 'wand') {
        for (const [e, f] of [...this.world.query(FootprintComponent)]) {
          const p = e.object.position, t = target.object.position;
          if (f.ebene !== 'anbau' || Math.hypot(p.x - t.x, p.z - t.z) > 0.05) continue;
          preis += this.content.bau.find(e.typeId)?.preis ?? 0;
          this.events.emit('removing', { entity: e });
          this.world.remove(e);
        }
      }
      // Schienenleuchten hängen an der Lichtschiene und gehen mit
      if (def.schiene) {
        const r = target.require(FootprintComponent).rect(), t = 0.06;
        for (const [e, f] of [...this.world.query(FootprintComponent)]) {
          const p = e.object.position;
          if (!f.anSchiene || p.x < r.minX - t || p.x > r.maxX + t || p.z < r.minZ - t || p.z > r.maxZ + t) continue;
          // Hängt sie noch an einer anderen Schiene, bleibt sie
          if (railAt(this.world, p.x, p.z, target)) continue;
          preis += this.content.bau.find(e.typeId)?.preis ?? 0;
          this.events.emit('removing', { entity: e });
          this.world.remove(e);
        }
      }
      this.events.emit('removing', { entity: target });
      this.world.remove(target);
      const betrag = Math.round(preis * this.content.baumenue.rueckerstattung * 100) / 100;
      this.player.earn(betrag, 'abriss');
      this.events.emit('message', { key: 'bauen_abgerissen', werte: { name: def.name, betrag: `${betrag.toLocaleString('de-DE')} €` }, art: 'info' });
    } else {
      this.quarter = Math.round(target.object.rotation.y / (Math.PI / 2)) & 3;
      target.object.visible = false;
      this.events.emit('picked', { entity: target });
      this.setTool({ art: 'bauen', def, moving: target }, true);
    }
  }

  /** Hängt an diesem Stützrahmen noch eine Traversen-Ebene? */
  private hasBeams(rahmen: Entity): boolean {
    const r = rahmen.object.position, dicke = rahmen.require(FootprintComponent).groesse[2];
    for (const [e, f] of this.world.query(FootprintComponent)) {
      if (f.regalteil !== 'traverse') continue;
      const breite = this.content.bau.find(e.typeId)?.palettenregal?.breite ?? f.groesse[2];
      const rot = e.object.rotation.y, ax = Math.sin(rot), az = Math.cos(rot), half = (breite + dicke) / 2;
      for (const s of [-1, 1]) {
        if (Math.hypot(e.object.position.x + ax * s * half - r.x, e.object.position.z + az * s * half - r.z) < 0.08) return true;
      }
    }
    return false;
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
    this.ghostShown = false;
    this.clearAreaGhosts();
    this.dragStart = null;
    if (!keepRotation) this.quarter = 0;
    this.tool = tool;
    this.problem = null;
    // Grundstücksgrenzen zeigen, solange gebaut wird
    this.plotLines.visible = tool !== null && !!this.plots?.active;
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

  /** Umrisse der Grundstücke: eigene grün, kaufbare gestrichelt gelb. */
  private drawPlots(): void {
    this.plotLines.clear();
    if (!this.plots?.active) return;
    for (const p of this.plots.list) {
      const own = this.plots.isOwned(p.id);
      const { minX, maxX, minZ, maxZ } = p.rect;
      const y = 0.2;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(minX, y, minZ), new THREE.Vector3(maxX, y, minZ), new THREE.Vector3(maxX, y, maxZ),
        new THREE.Vector3(minX, y, maxZ), new THREE.Vector3(minX, y, minZ),
      ]);
      const mat = own
        ? new THREE.LineBasicMaterial({ color: this.colors.ok, depthTest: false, transparent: true, opacity: 0.7 })
        : new THREE.LineDashedMaterial({ color: '#e0b23c', dashSize: 0.4, gapSize: 0.25, depthTest: false, transparent: true, opacity: 0.8 });
      const line = new THREE.Line(geo, mat);
      if (!own) line.computeLineDistances();
      line.renderOrder = 5;
      this.plotLines.add(line);
    }
  }

  /**
   * Wohin zeigt der Zeiger? Für Bodenteile und Objekte auf den Boden, für Deckenteile (Schienen, Leuchten,
   * Hängeschilder) auf die Höhe, in der sie hängen – sonst landet man wegen der Schrägsicht meterweit daneben.
   */
  private groundPoint(camera: THREE.Camera): boolean {
    this.raycaster.setFromCamera(this.pointer.ndc, camera);
    const tool = this.tool;
    const decke = tool?.art === 'bauen' && tool.def.ebene === 'decke';
    this.plane.constant = decke ? -(this.content.baumenue.deckenhoehe - 0.5) : 0;
    return this.raycaster.ray.intersectPlane(this.plane, this.hit) !== null;
  }
}

/** Bodenteile (außer der Rampenabfahrt) werden flächig aufgezogen – nicht beim Verschieben */
function isAreaPiece(tool: Extract<Tool, { art: 'bauen' }>): boolean {
  return tool.def.ebene === 'boden' && !tool.def.absenkung && !tool.moving;
}

/** Abreißen nur ohne Ware; Verschieben von Lagerflächen nur ohne Kartons (Regale dürfen voll umziehen). */
function isEmpty(e: Entity, art: 'abreissen' | 'verschieben'): boolean {
  const shelf = e.get(ShelfComponent);
  const storage = e.get(StorageSurfaceComponent);
  if (storage && storage.used > 0) return false;
  if (art === 'abreissen' && shelf && shelf.bestand > 0) return false;
  return true;
}
