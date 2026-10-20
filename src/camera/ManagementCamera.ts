import * as THREE from 'three';
import type { InputMap } from '../input/InputMap';

// Schräg von oben blickende Kamera für die Management-Ansicht.
// Sie kreist um einen Zielpunkt am Boden: schwenken verschiebt den Zielpunkt,
// drehen ändert den Blickwinkel, zoomen den Abstand. Alle Werte kommen aus data/kamera.

export interface CameraSettings {
  sichtfeld: number;              // Öffnungswinkel in Grad
  neigung: number;                // Blickwinkel nach unten in Grad (90 = senkrecht)
  abstand: { min: number; max: number; start: number };
  startDrehung: number;           // Grad
  schwenkGeschwindigkeit: number; // Anteil des Abstands pro Sekunde
  drehGeschwindigkeit: number;    // Grad pro Sekunde (Tasten)
  mausDrehung: number;            // Grad pro Pixel (Maus ziehen)
  zoomFaktor: number;             // pro Mausrad-Raste
  glaettung: number;              // je größer, desto schneller folgt die Kamera
}

export interface Bounds {
  minX: number; maxX: number; minZ: number; maxZ: number;
}

export class ManagementCamera {
  readonly camera: THREE.PerspectiveCamera;

  // Zielwerte (wohin die Kamera will) und aktuelle Werte (geglättet)
  private readonly goalTarget = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  /** Punkt, auf den die Kamera gerade schaut (am Boden) */
  get focus(): THREE.Vector3 {
    return this.target;
  }
  private goalYaw: number;
  private yaw: number;
  private goalDistance: number;
  private distance: number;
  private readonly pitch: number;

  private dragX = 0;
  private dragY = 0;

  constructor(
    private readonly settings: CameraSettings,
    private readonly input: InputMap,
    private readonly bounds: Bounds,
    start: THREE.Vector3,
  ) {
    this.camera = new THREE.PerspectiveCamera(settings.sichtfeld, 1, 0.5, 500);
    this.pitch = THREE.MathUtils.degToRad(settings.neigung);
    this.goalYaw = this.yaw = THREE.MathUtils.degToRad(settings.startDrehung);
    this.goalDistance = this.distance = settings.abstand.start;
    this.goalTarget.copy(start);
    this.target.copy(start);
    this.place();
  }

  /** Mausrad und Ziehen an der Spielfläche abhören. */
  attach(surface: HTMLElement): void {
    surface.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    surface.addEventListener('pointermove', (e) => {
      this.dragX += e.movementX;
      this.dragY += e.movementY;
    });
  }

  /** Eine Mausrad-Raste zoomen: positiv = weiter weg. */
  zoom(steps: number): void {
    const { min, max } = this.settings.abstand;
    this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * this.settings.zoomFaktor ** steps, min, max);
  }

  /** Abstand sofort setzen (z. B. aus der Level-Datei). */
  setDistance(d: number): void {
    const { min, max } = this.settings.abstand;
    this.goalDistance = this.distance = THREE.MathUtils.clamp(d, min, max);
    this.place();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    const s = this.settings;

    // Schwenken mit Tasten, relativ zur Blickrichtung
    const right = this.input.axis('kamera_links', 'kamera_rechts');
    const forward = this.input.axis('kamera_zurueck', 'kamera_vor');
    if (right || forward) {
      const speed = s.schwenkGeschwindigkeit * this.goalDistance * dt;
      this.pan(right * speed, forward * speed);
    }

    // Drehen mit Tasten
    const turn = this.input.axis('kamera_drehen_links', 'kamera_drehen_rechts');
    this.goalYaw += turn * THREE.MathUtils.degToRad(s.drehGeschwindigkeit) * dt;

    // Ziehen mit der Maus
    if (this.input.isHeld('kamera_ziehen_schieben')) {
      // Faktor so gewählt, dass der Boden ungefähr unter dem Zeiger bleibt
      const perPixel = (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(s.sichtfeld) / 2)) / window.innerHeight;
      this.pan(-this.dragX * perPixel, this.dragY * perPixel / Math.sin(this.pitch));
    } else if (this.input.isHeld('kamera_ziehen_drehen')) {
      this.goalYaw -= THREE.MathUtils.degToRad(this.dragX * s.mausDrehung);
    }
    this.dragX = this.dragY = 0;

    // Weich nachführen (bildratenunabhängig)
    const k = 1 - Math.exp(-s.glaettung * dt);
    this.target.lerp(this.goalTarget, k);
    this.yaw += (this.goalYaw - this.yaw) * k;
    this.distance += (this.goalDistance - this.distance) * k;
    this.place();
  }

  /** Zielpunkt seitlich (x) und nach vorne (z) verschieben, bezogen auf die Blickrichtung. */
  private pan(sideways: number, ahead: number): void {
    const sin = Math.sin(this.goalYaw), cos = Math.cos(this.goalYaw);
    this.goalTarget.x += sideways * cos - ahead * sin;
    this.goalTarget.z += -sideways * sin - ahead * cos;
    const b = this.bounds;
    this.goalTarget.x = THREE.MathUtils.clamp(this.goalTarget.x, b.minX, b.maxX);
    this.goalTarget.z = THREE.MathUtils.clamp(this.goalTarget.z, b.minZ, b.maxZ);
  }

  private place(): void {
    const flat = this.distance * Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * flat,
      this.target.y + this.distance * Math.sin(this.pitch),
      this.target.z + Math.cos(this.yaw) * flat,
    );
    this.camera.lookAt(this.target);
  }
}
