import * as THREE from 'three';
import { Emitter } from '../core/Emitter';
import type { InputMap } from '../input/InputMap';
import type { Pointer } from '../input/Pointer';
import type { PlayerState } from '../state/PlayerState';
import type { MarkingSettings, StampDef } from '../content/definitions';
import { drawStamp, type PaintLayer } from '../world/PaintLayer';

// Mal-Werkzeug für Bodenmarkierungen (Reiter „Markierungen“ im Baumenü):
//   pinsel   – frei malen, solange die linke Maustaste gehalten wird
//   linie    – gerade Linie: drücken, ziehen, loslassen (Enden rasten auf 25 cm ein)
//   radierer – Farbe wieder entfernen (kostenlos)
//   stempel  – Vorlage aus data/markierungen per Klick setzen, mit „Drehen“ in 45°-Schritten drehen
// Farbe kostet Geld je m², Stempel ihren Preis. Gemalt wird nur, wo `erlaubt` es zulässt
// (eigenes Grundstück, ebener Boden).

export type PaintMode = 'pinsel' | 'linie' | 'radierer' | 'stempel';

export interface PaintToolEvents extends Record<string, unknown> {
  message: { key: string; art?: 'gut' | 'warnung' };
  changed: undefined;
}

type P = { x: number; z: number };

export class PaintTool {
  readonly events = new Emitter<PaintToolEvents>();
  mode: PaintMode | null = null;
  farbe: string;
  breite: number;
  stempel: StampDef;
  skala = 1;
  drehung = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly plane: THREE.Plane;
  private readonly hit = new THREE.Vector3();
  private readonly ring: THREE.LineLoop;
  private readonly line: THREE.Line;
  private readonly stampGhost: THREE.Mesh;
  private readonly stampCanvas = document.createElement('canvas');
  private readonly stampTexture: THREE.CanvasTexture;
  private stampKey = '';
  private last: P | null = null;
  private lineStart: P | null = null;
  private schuld = 0;
  /** Höhe der Vorschau (Boden unter dem Zeiger) */
  private y = 0;

  constructor(
    private readonly layer: PaintLayer,
    scene: THREE.Scene,
    private readonly input: InputMap,
    private readonly pointer: Pointer,
    private readonly player: PlayerState,
    private readonly settings: MarkingSettings,
    private readonly erlaubt: (x: number, z: number) => boolean,
    /** Oberkante des Bodens an einer Stelle (Rasen 0, Gehweg höher …) */
    private readonly hoeheAt: (x: number, z: number) => number = () => 0,
  ) {
    this.farbe = settings.farben[0].farbe;
    this.breite = settings.breiten[1] ?? settings.breiten[0];
    this.stempel = settings.stempel[0];
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(48 * 3), 3));
    this.ring = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false }));
    this.ring.renderOrder = 20;
    this.ring.visible = false;
    scene.add(this.ring);

    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false }));
    this.line.renderOrder = 20;
    this.line.visible = false;
    scene.add(this.line);

    this.stampCanvas.width = this.stampCanvas.height = 256;
    this.stampTexture = new THREE.CanvasTexture(this.stampCanvas);
    this.stampTexture.colorSpace = THREE.SRGBColorSpace;
    const ghostGeo = new THREE.PlaneGeometry(1, 1);
    ghostGeo.rotateX(-Math.PI / 2);
    this.stampGhost = new THREE.Mesh(ghostGeo, new THREE.MeshBasicMaterial({ map: this.stampTexture, transparent: true, opacity: 0.75, depthTest: false }));
    this.stampGhost.renderOrder = 20;
    this.stampGhost.visible = false;
    scene.add(this.stampGhost);
  }

  get active(): boolean {
    return this.mode !== null;
  }

  start(mode: PaintMode): void {
    this.finishStroke();
    this.mode = mode;
    this.events.emit('changed', undefined);
  }

  cancel(): void {
    if (!this.mode) return;
    this.finishStroke();
    this.mode = null;
    this.ring.visible = this.line.visible = this.stampGhost.visible = false;
    this.events.emit('changed', undefined);
  }

  setFarbe(farbe: string): void { this.farbe = farbe; this.events.emit('changed', undefined); }
  setBreite(b: number): void { this.breite = b; this.events.emit('changed', undefined); }
  setSkala(s: number): void { this.skala = s; this.events.emit('changed', undefined); }
  setStempel(def: StampDef): void {
    this.stempel = def;
    if (this.mode !== 'stempel') this.start('stempel'); else this.events.emit('changed', undefined);
  }

  update(camera: THREE.Camera): void {
    if (!this.mode) return;
    if (this.input.wasPressed('objekt_drehen')) { this.drehung = (this.drehung + 45) % 360; this.events.emit('changed', undefined); }
    this.raycaster.setFromCamera(this.pointer.ndc, camera);
    // Erst auf Rasenhöhe treffen, dann auf der Höhe des Bodens dort noch einmal (Gehweg, Fliesen …)
    this.plane.constant = -this.y;
    if (!this.pointer.inside || !this.raycaster.ray.intersectPlane(this.plane, this.hit)) {
      this.ring.visible = this.stampGhost.visible = false;
      return;
    }
    const h = this.hoeheAt(this.hit.x, this.hit.z);
    if (Math.abs(h - this.y) > 1e-3) {
      this.y = h;
      this.plane.constant = -h;
      this.raycaster.ray.intersectPlane(this.plane, this.hit);
    }
    const p = { x: this.hit.x, z: this.hit.z };
    const held = this.input.isHeld('auswaehlen'), pressed = this.input.wasPressed('auswaehlen');
    if (this.mode === 'stempel') this.updateStamp(p, pressed);
    else if (this.mode === 'linie') this.updateLine(p, pressed, held);
    else this.updateBrush(p, held);
  }

  // ── Pinsel und Radierer ─────────────────────────────────────────

  private updateBrush(p: P, held: boolean): void {
    this.drawRing(p, Math.max(0.05, this.breite / 2), this.mode === 'radierer' ? '#ff8a7a' : this.farbe);
    if (!held) { this.finishStroke(); return; }
    const from = this.last ?? p;
    if (this.last && Math.hypot(p.x - from.x, p.z - from.z) < 0.02) return;
    this.last = p;
    if (!this.erlaubt(p.x, p.z) || !this.erlaubt(from.x, from.z)) return;
    if (this.mode === 'radierer') { this.layer.stroke(from, p, this.breite * 1.5, null); return; }
    if (!this.charge(this.area(from, p))) return;
    this.layer.stroke(from, p, this.breite, this.farbe);
  }

  // ── Linie ───────────────────────────────────────────────────────

  private updateLine(raw: P, pressed: boolean, held: boolean): void {
    const p = { x: Math.round(raw.x * 4) / 4, z: Math.round(raw.z * 4) / 4 };
    this.drawRing(p, Math.max(0.05, this.breite / 2), this.farbe);
    if (pressed) this.lineStart = p;
    const a = this.lineStart;
    if (!a) { this.line.visible = false; return; }
    const pos = this.line.geometry.attributes.position as THREE.BufferAttribute;
    const y = this.y + 0.03;
    pos.setXYZ(0, a.x, y, a.z); pos.setXYZ(1, p.x, y, p.z);
    pos.needsUpdate = true;
    this.line.geometry.computeBoundingSphere();
    (this.line.material as THREE.LineBasicMaterial).color.set(this.farbe);
    this.line.visible = true;
    if (held) return;
    this.lineStart = null;
    this.line.visible = false;
    if (Math.hypot(p.x - a.x, p.z - a.z) < 0.05) return;
    // Nur malen, wenn die ganze Linie auf erlaubtem Grund liegt (Stichproben alle 0,25 m)
    const n = Math.ceil(Math.hypot(p.x - a.x, p.z - a.z) / 0.25);
    for (let i = 0; i <= n; i++) {
      if (!this.erlaubt(a.x + ((p.x - a.x) * i) / n, a.z + ((p.z - a.z) * i) / n)) {
        this.events.emit('message', { key: 'markierung_nicht_hier', art: 'warnung' });
        return;
      }
    }
    if (!this.charge(this.area(a, p))) return;
    this.layer.stroke(a, p, this.breite, this.farbe);
    this.pay();
  }

  // ── Stempel ─────────────────────────────────────────────────────

  private updateStamp(p: P, pressed: boolean): void {
    this.ring.visible = false;
    const def = this.stempel;
    const [w, d] = [def.groesse[0] * this.skala, def.groesse[1] * this.skala];
    const key = `${def.id}|${this.farbe}`;
    if (key !== this.stampKey) {
      this.stampKey = key;
      const c = this.stampCanvas.getContext('2d')!;
      const s = this.stampCanvas.width;
      c.clearRect(0, 0, s, s);
      c.save();
      c.translate(s / 2, s / 2);
      const k = s / Math.max(def.groesse[0], def.groesse[1]);
      drawStamp(c, def, def.groesse[0] * k, def.groesse[1] * k, this.farbe);
      c.restore();
      this.stampTexture.needsUpdate = true;
    }
    // Vorschau-Ebene ist quadratisch (Seite = längere Kante), die Leinwand ist ebenso aufgeteilt
    const side = Math.max(w, d);
    this.stampGhost.scale.set(side, 1, side);
    this.stampGhost.position.set(p.x, this.y + 0.02, p.z);
    this.stampGhost.rotation.y = -THREE.MathUtils.degToRad(this.drehung);
    const ok = this.stampAllowed(p, w, d);
    (this.stampGhost.material as THREE.MeshBasicMaterial).color.set(ok ? '#ffffff' : '#ff7060');
    this.stampGhost.visible = true;
    if (!pressed) return;
    if (!ok) { this.events.emit('message', { key: 'markierung_nicht_hier', art: 'warnung' }); return; }
    const preis = Math.round(def.preis * this.skala * this.skala * 100) / 100;
    if (!this.player.spend(preis, 'markierung')) { this.events.emit('message', { key: 'markierung_kein_geld', art: 'warnung' }); return; }
    this.layer.stamp(def, p.x, p.z, this.drehung, this.skala, this.farbe);
  }

  /** Mitte und Ecken des (gedrehten) Stempels müssen auf erlaubtem Grund liegen */
  private stampAllowed(p: P, w: number, d: number): boolean {
    const r = THREE.MathUtils.degToRad(this.drehung), cos = Math.cos(r), sin = Math.sin(r);
    const pts: [number, number][] = [[0, 0], [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    return pts.every(([u, v]) => this.erlaubt(p.x + u * cos - v * sin, p.z + u * sin + v * cos));
  }

  // ── Hilfen ──────────────────────────────────────────────────────

  private area(a: P, b: P): number {
    return Math.max(0.01, Math.hypot(b.x - a.x, b.z - a.z)) * this.breite;
  }

  /** Farbe abrechnen (gesammelt, in Euro-Schritten). false = kein Geld mehr */
  private charge(m2: number): boolean {
    const kosten = m2 * this.settings.preisProQuadratmeter;
    if (this.player.geld - this.schuld - kosten < 0) {
      this.events.emit('message', { key: 'markierung_kein_geld', art: 'warnung' });
      this.finishStroke();
      return false;
    }
    this.schuld += kosten;
    if (this.schuld >= 1) this.pay();
    return true;
  }

  private pay(): void {
    const betrag = Math.round(this.schuld * 100) / 100;
    if (betrag > 0) this.player.charge(betrag, 'markierung');
    this.schuld = 0;
  }

  private finishStroke(): void {
    this.last = null;
    this.lineStart = null;
    this.line.visible = false;
    this.pay();
  }

  private drawRing(p: P, r: number, farbe: string): void {
    const pos = this.ring.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pos.setXYZ(i, p.x + Math.cos(a) * r, this.y + 0.03, p.z + Math.sin(a) * r);
    }
    pos.needsUpdate = true;
    this.ring.geometry.computeBoundingSphere();
    (this.ring.material as THREE.LineBasicMaterial).color.set(farbe);
    this.ring.visible = true;
  }
}
