import * as THREE from 'three';
import { readData } from './Data';
import { InputMap, type Bindings } from '../input/InputMap';
import { Pointer } from '../input/Pointer';
import { ManagementCamera, type CameraSettings } from '../camera/ManagementCamera';
import { Level, type LevelData } from '../world/Level';
import { GridCursor } from '../world/GridCursor';
import { Content } from '../content/Content';
import { World } from '../ecs/World';
import { createBuildEntity } from '../factory/createBuildEntity';
import { Selection } from '../interaction/Selection';
import { Interactor } from '../interaction/Interactor';
import { PlayerState, type LevelTable, type PlayerStart } from '../state/PlayerState';
import { GameClock, type ClockSettings } from '../state/GameClock';
import { Hud } from '../ui/Hud';
import { DebugPanel } from '../ui/DebugPanel';
import { ContextHint } from '../ui/ContextHint';
import { InfoPanel } from '../ui/InfoPanel';

// Zentrale Spielklasse: Renderer, Szene, Spielschleife.
// Sie verbindet die Systeme, enthält aber selbst keine Spiellogik.

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly content: Content;
  readonly world: World;
  readonly input: InputMap;
  readonly pointer = new Pointer();
  readonly level: Level;
  readonly view: ManagementCamera;
  readonly cursor: GridCursor;
  readonly selection = new Selection();
  readonly interactor: Interactor;
  /** Spielerwerte (Geld, XP, Level) – getrennt von jeder Darstellung. */
  readonly player: PlayerState;
  readonly clock: GameClock;
  readonly hud: Hud;
  readonly debug: DebugPanel;
  readonly contextHint: ContextHint;
  readonly info: InfoPanel;

  private readonly timer = new THREE.Timer();
  private readonly sun: THREE.DirectionalLight;

  constructor(container: HTMLElement, levelId: string) {
    // Inhalte zuerst: Fehler in den Daten sollen sofort auffallen
    this.content = new Content();

    // Spielzustand ohne Darstellung (Koop-tauglich)
    this.player = new PlayerState('lokal', readData<PlayerStart>('spieler/start'), readData<LevelTable>('spieler/level'));
    this.clock = new GameClock(readData<ClockSettings>('zeit/standard'));
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5fd08a';

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.append(this.renderer.domElement);
    const surface = this.renderer.domElement;

    // Eingabe
    this.input = new InputMap(readData<Bindings>('eingabe/standard'));
    this.input.attach(surface);
    this.pointer.attach(surface);

    // Kulisse
    this.level = new Level(readData<LevelData>(`level/${levelId}`));
    this.scene.add(this.level.root);
    this.scene.background = new THREE.Color(this.level.data.himmel);

    // Welt mit allen Entities, gefüllt aus den Objekten des Levels
    const entities = new THREE.Group();
    entities.name = 'Entities';
    this.scene.add(entities);
    this.world = new World(entities);

    // Licht: Himmel/Boden-Licht plus Sonne mit Schatten über das ganze Gelände
    this.scene.add(new THREE.HemisphereLight('#e9f1f5', '#6b6355', 1.4));
    this.sun = new THREE.DirectionalLight('#fff1dc', 2.4);
    this.sun.position.set(18, 30, 14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const b = this.level.bounds;
    const half = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 100 });
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);

    // Kamera
    const start = new THREE.Vector3(...this.level.data.kameraStart);
    this.view = new ManagementCamera(readData<CameraSettings>('kamera/standard'), this.input, this.level.bounds, start);
    this.view.attach(surface);

    // Feld unter der Maus
    this.cursor = new GridCursor(this.level.data.raster, accent, this.pointer);
    this.scene.add(this.cursor.mesh);

    // Interaktion: was liegt unter dem Zeiger, was passiert beim Klick
    this.interactor = new Interactor(this.world, this.input, this.pointer, this.selection, accent);

    // Oberfläche
    this.hud = new Hud(this.input, this.content, this.player, this.clock, this.level.data.name);
    this.debug = new DebugPanel(this.hud.root, this.content, this.world, this.player);
    this.contextHint = new ContextHint(this.interactor, this.input, this.pointer, this.content);
    this.info = new InfoPanel(this.selection, this.input, this.content);

    // Erst jetzt Objekte setzen, damit die Anzeigen sie mitzählen
    for (const o of this.level.data.objekte) {
      this.world.add(createBuildEntity(this.content.bau.get(o.typ), o, this.content));
    }

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start(): void {
    this.renderer.setAnimationLoop((time) => this.tick(time));
  }

  private tick(time: number): void {
    this.timer.update(time);
    // Echte Zeit seit dem letzten Bild. Höchstens 1 s, damit ein Tab im Hintergrund
    // keinen Riesensprung erzeugt – aber auch auf langsamen Rechnern geht keine Spielzeit verloren.
    const realDt = Math.min(this.timer.getDelta(), 1);
    this.handleGlobalKeys();

    // Kamera in Echtzeit (gegen Ruckeln enger begrenzt), Simulation im Spieltempo (steht in der Pause)
    this.view.update(Math.min(realDt, 0.1));
    const simDt = this.clock.update(realDt);
    this.world.update(simDt);
    this.interactor.update(this.view.camera);
    // Über einem Objekt zeigt der Hinweis am Zeiger, worum es geht – dann keine Feld-Markierung
    this.cursor.update(this.view.camera, this.level.bounds, this.interactor.hovered !== null);
    this.debug.showCell(this.cursor.cell);
    this.contextHint.update();

    this.renderer.render(this.scene, this.view.camera);
    this.input.endFrame();
  }

  /** Tasten, die überall gelten (Zeit, Debug). */
  private handleGlobalKeys(): void {
    const i = this.input;
    if (i.wasPressed('debug_anzeige')) this.debug.toggle();
    if (i.wasPressed('zeit_anhalten')) this.clock.togglePause();
    for (let s = 1; s <= this.clock.stufen; s++) if (i.wasPressed(`zeit_stufe_${s}`)) this.clock.setStufe(s);
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.view.setAspect(w / h);
  }
}
