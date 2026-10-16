import * as THREE from 'three';
import { readData } from './Data';
import { InputMap, type Bindings } from '../input/InputMap';
import { ManagementCamera, type CameraSettings } from '../camera/ManagementCamera';
import { Level, type LevelData } from '../world/Level';
import { GridCursor } from '../world/GridCursor';
import { Hud } from '../ui/Hud';

// Zentrale Spielklasse: Renderer, Szene, Spielschleife.
// Sie verbindet die Systeme, enthält aber selbst keine Spiellogik.

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly input: InputMap;
  readonly level: Level;
  readonly view: ManagementCamera;
  readonly cursor: GridCursor;
  readonly hud: Hud;

  private readonly timer = new THREE.Timer();
  private readonly sun: THREE.DirectionalLight;

  constructor(container: HTMLElement, levelId: string) {
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

    // Welt
    this.level = new Level(readData<LevelData>(`level/${levelId}`));
    this.scene.add(this.level.root);
    this.scene.background = new THREE.Color(this.level.data.himmel);

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
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5fd08a';
    this.cursor = new GridCursor(this.level.data.raster, accent);
    this.cursor.attach(surface);
    this.scene.add(this.cursor.mesh);

    // Oberfläche
    this.hud = new Hud(this.input, this.level.data.name);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start(): void {
    this.renderer.setAnimationLoop((time) => this.tick(time));
  }

  private tick(time: number): void {
    this.timer.update(time);
    // Lange Pausen (Tab im Hintergrund) nicht als einen Riesenschritt rechnen
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.view.update(dt);
    this.cursor.update(this.view.camera, this.level.bounds);
    this.hud.showCell(this.cursor.cell);
    this.renderer.render(this.scene, this.view.camera);
    this.input.endFrame();
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.view.setAspect(w / h);
  }
}
