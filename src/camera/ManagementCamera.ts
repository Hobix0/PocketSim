import * as THREE from 'three';
import type { InputMap } from '../input/InputMap';

// Schräg von oben blickende Kamera für die Management-Ansicht.
// Sie kreist um einen Zielpunkt am Boden: schwenken verschiebt den Zielpunkt,
// drehen ändert den Blickwinkel, zoomen den Abstand. Alle Werte kommen aus data/kamera.
// Cozy-Kamera: nah heran wird der Blick flacher (wie bei einer Miniatur), gezoomt wird zum Mauszeiger hin,
// Schwenken mit der Maus läuft mit Schwung aus, und ohne Eingabe „atmet“ die Kamera ganz leicht.

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
  /** Blickwinkel ganz nah (Grad); dazwischen wird übergeblendet. Fehlt er, bleibt die Neigung fest. */
  neigungNah?: number;
  /** Eigenes Nachführen für den Zoom (weicher als das Schwenken) */
  zoomGlaettung?: number;
  /** Zum Mauszeiger hin zoomen (0 = zur Bildmitte, 1 = ganz zum Zeiger) */
  zoomZumZeiger?: number;
  /** Wie lange Schwung nach dem Ziehen anhält (je größer, desto kürzer) */
  schwungBremse?: number;
  /** Leichtes Atmen ohne Eingabe: Drehung (Grad) und Dauer eines Atemzugs (s) */
  atmen?: { grad: number; sekunden: number; nachSekunden: number };
}

export interface Bounds {
  minX: number; maxX: number; minZ: number; maxZ: number;
}

export class ManagementCamera {
  readonly camera: THREE.PerspectiveCamera;

  // Zielwerte (wohin die Kamera will) und aktuelle Werte (geglättet)
  private readonly goalTarget = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  /** Aktueller Abstand der Kamera zum Blickpunkt (m) */
  get abstand(): number {
    return this.distance;
  }

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
  /** Schwung nach dem Ziehen (m pro Sekunde) */
  private readonly velocity = new THREE.Vector3();
  private ruhe = 0;
  private atem = 0;
  private readonly ndc = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(
    readonly settings: CameraSettings,
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
      const r = surface.getBoundingClientRect();
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.zoom(e.deltaY > 0 ? 1 : -1, this.ndc);
    }, { passive: false });
    surface.addEventListener('pointermove', (e) => {
      this.dragX += e.movementX;
      this.dragY += e.movementY;
    });
  }

  /** Eine Mausrad-Raste zoomen: positiv = weiter weg. Mit `zeiger` (Bildschirm −1..1) zum Zeiger hin. */
  zoom(steps: number, zeiger?: THREE.Vector2): void {
    const { min, max } = this.settings.abstand;
    const before = this.goalDistance;
    this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * this.settings.zoomFaktor ** steps, min, max);
    this.ruhe = 0;
    const anteil = this.settings.zoomZumZeiger ?? 0;
    if (!zeiger || anteil <= 0 || this.goalDistance >= before) return;
    // Punkt unter dem Zeiger: der Zielpunkt rückt anteilig darauf zu (nur beim Hineinzoomen)
    this.raycaster.setFromCamera(zeiger, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return;
    const k = (1 - this.goalDistance / before) * anteil;
    this.goalTarget.x += (hit.x - this.goalTarget.x) * k;
    this.goalTarget.z += (hit.z - this.goalTarget.z) * k;
    this.clampGoal();
  }

  /** Aktuelle Neigung (rad): nah flacher, weit steiler */
  private get pitchNow(): number {
    const nah = this.settings.neigungNah;
    if (nah === undefined) return this.pitch;
    const { min, max } = this.settings.abstand;
    const t = THREE.MathUtils.smoothstep(this.distance, min, min + (max - min) * 0.45);
    return THREE.MathUtils.degToRad(nah) + (this.pitch - THREE.MathUtils.degToRad(nah)) * t;
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
    const ziehen = this.input.isHeld('kamera_ziehen_schieben');
    if (ziehen) {
      // Faktor so gewählt, dass der Boden ungefähr unter dem Zeiger bleibt
      const perPixel = (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(s.sichtfeld) / 2)) / window.innerHeight;
      const before = this.goalTarget.clone();
      this.pan(-this.dragX * perPixel, this.dragY * perPixel / Math.sin(this.pitchNow));
      // Geschwindigkeit merken, damit es nach dem Loslassen weitergleitet
      if (dt > 0) this.velocity.lerp(this.goalTarget.clone().sub(before).divideScalar(dt), 0.5);
    } else if (this.input.isHeld('kamera_ziehen_drehen')) {
      this.goalYaw -= THREE.MathUtils.degToRad(this.dragX * s.mausDrehung);
    }
    // Schwung: läuft nach dem Ziehen weich aus
    if (!ziehen && this.velocity.lengthSq() > 1e-4) {
      this.goalTarget.addScaledVector(this.velocity, dt);
      this.clampGoal();
      this.velocity.multiplyScalar(Math.exp(-(s.schwungBremse ?? 6) * dt));
    } else if (!ziehen) this.velocity.set(0, 0, 0);
    const bewegt = right || forward || turn || ziehen || this.dragX || this.dragY;
    this.dragX = this.dragY = 0;

    // Atmen: nach einer Weile ohne Eingabe pendelt der Blick ganz leicht
    this.ruhe = bewegt ? 0 : this.ruhe + dt;
    const atmen = s.atmen;
    let sway = 0;
    if (atmen && atmen.grad > 0) {
      const stark = THREE.MathUtils.smoothstep(this.ruhe, atmen.nachSekunden, atmen.nachSekunden + 3);
      this.atem += dt * (Math.PI * 2) / atmen.sekunden;
      sway = Math.sin(this.atem) * THREE.MathUtils.degToRad(atmen.grad) * stark;
    }

    // Weich nachführen (bildratenunabhängig); der Zoom darf weicher sein
    const k = 1 - Math.exp(-s.glaettung * dt);
    const kz = 1 - Math.exp(-(s.zoomGlaettung ?? s.glaettung) * dt);
    this.target.lerp(this.goalTarget, k);
    this.yaw += (this.goalYaw - this.yaw) * k;
    this.distance += (this.goalDistance - this.distance) * kz;
    this.place(sway);
  }

  /** Zielpunkt seitlich (x) und nach vorne (z) verschieben, bezogen auf die Blickrichtung. */
  private pan(sideways: number, ahead: number): void {
    const sin = Math.sin(this.goalYaw), cos = Math.cos(this.goalYaw);
    this.goalTarget.x += sideways * cos - ahead * sin;
    this.goalTarget.z += -sideways * sin - ahead * cos;
    this.clampGoal();
  }

  private clampGoal(): void {
    const b = this.bounds;
    this.goalTarget.x = THREE.MathUtils.clamp(this.goalTarget.x, b.minX, b.maxX);
    this.goalTarget.z = THREE.MathUtils.clamp(this.goalTarget.z, b.minZ, b.maxZ);
  }

  private place(sway = 0): void {
    const pitch = this.pitchNow, yaw = this.yaw + sway;
    const flat = this.distance * Math.cos(pitch);
    this.camera.position.set(
      this.target.x + Math.sin(yaw) * flat,
      this.target.y + this.distance * Math.sin(pitch),
      this.target.z + Math.cos(yaw) * flat,
    );
    this.camera.lookAt(this.target);
  }
}
