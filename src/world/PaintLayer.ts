import * as THREE from 'three';
import type { Bounds } from '../navigation/NavGrid';
import type { MarkingSettings, StampDef } from '../content/definitions';

// Malschicht für Bodenmarkierungen: eine durchsichtige Leinwand (Canvas) über dem ganzen Gelände.
// Sie liegt knapp über dem Rasen und auf jeder Bodenplatte knapp über deren Oberkante (Gehweg, Fliesen,
// Asphalt haben verschiedene Höhen) – alle Flächen teilen sich dieselbe Leinwand. Pinsel, Linien und Stempel malen direkt hinein, der Radierer löscht.
// Gespeichert wird das Bild (PNG) im Spielstand. Die Stempel kommen aus data/markierungen.

export class PaintLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  readonly mesh: THREE.Mesh;
  private dirty = false;
  /** Wurde überhaupt schon etwas gemalt? (sonst wird nichts gespeichert) */
  private bemalt = false;

  constructor(scene: THREE.Scene, private readonly bounds: Bounds, private readonly settings: MarkingSettings) {
    const res = settings.aufloesung;
    const w = bounds.maxX - bounds.minX, d = bounds.maxZ - bounds.minZ;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * res);
    this.canvas.height = Math.round(d * res);
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({
      map: this.texture, transparent: true, depthWrite: false, roughness: 0.85,
      opacity: settings.deckkraft, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    }));
    this.mesh.name = 'Bodenmarkierungen';
    this.mesh.receiveShadow = true;
    this.setFloors([]);
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  /** Flächen neu legen: Rasen plus eine Fläche je Bodenplatte (Oberkante `top`) */
  setFloors(floors: { minX: number; maxX: number; minZ: number; maxZ: number; top: number }[]): void {
    const b = this.bounds, w = b.maxX - b.minX, d = b.maxZ - b.minZ, eps = this.settings.hoehe;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const quad = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, y: number) => {
      const i = pos.length / 3;
      for (const [x, z] of [[r.minX, r.minZ], [r.minX, r.maxZ], [r.maxX, r.maxZ], [r.maxX, r.minZ]]) {
        pos.push(x, y, z);
        // Leinwand-Zeile 0 liegt bei minZ; die Textur wird beim Hochladen gespiegelt (v = 1 oben)
        uv.push((x - b.minX) / w, 1 - (z - b.minZ) / d);
      }
      idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    };
    quad(b, eps);
    for (const f of floors) quad(f, f.top + eps);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }

  /** Einmal pro Frame: geänderte Leinwand hochladen */
  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.texture.needsUpdate = true;
  }

  /** Strich von a nach b (Breite in m). `farbe` null = radieren */
  stroke(a: { x: number; z: number }, b: { x: number; z: number }, breite: number, farbe: string | null): void {
    const c = this.ctx, res = this.settings.aufloesung;
    c.save();
    c.globalCompositeOperation = farbe ? 'source-over' : 'destination-out';
    c.strokeStyle = farbe ?? '#000';
    c.lineWidth = breite * res;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(...this.px(a));
    c.lineTo(...this.px(b));
    c.stroke();
    c.restore();
    this.touch(!!farbe);
  }

  /** Stempel an (x, z), gedreht (Grad, im Uhrzeigersinn von oben gesehen) und skaliert */
  stamp(def: StampDef, x: number, z: number, drehung: number, skala: number, farbe: string): void {
    const res = this.settings.aufloesung;
    const [px, py] = this.px({ x, z });
    const c = this.ctx;
    c.save();
    c.translate(px, py);
    c.rotate(THREE.MathUtils.degToRad(drehung));
    drawStamp(c, def, def.groesse[0] * skala * res, def.groesse[1] * skala * res, farbe);
    c.restore();
    this.touch(true);
  }

  /** Alles löschen */
  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.bemalt = false;
    this.dirty = true;
  }

  /** Für den Spielstand: Bild als PNG (leer, wenn nie gemalt wurde) */
  state(): string {
    return this.bemalt ? this.canvas.toDataURL('image/png') : '';
  }

  restore(data: unknown): void {
    this.clear();
    if (typeof data !== 'string' || !data.startsWith('data:image/png')) return;
    const img = new Image();
    img.onload = () => {
      this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
      this.touch(true);
    };
    img.src = data;
  }

  private touch(gemalt: boolean): void {
    this.dirty = true;
    if (gemalt) this.bemalt = true;
  }

  private px(p: { x: number; z: number }): [number, number] {
    const res = this.settings.aufloesung;
    return [(p.x - this.bounds.minX) * res, (p.z - this.bounds.minZ) * res];
  }
}

const pfadCache = new Map<string, Path2D>();

/**
 * Zeichnet einen Stempel mittig um (0, 0) in `w` × `h` Pixel. Formen sind in einem 100 × 100-Feld
 * beschrieben (oben = Blickrichtung „vorwärts“): SVG-Pfade (gefüllt oder mit `linie` als Strichstärke)
 * oder Texte.
 */
export function drawStamp(c: CanvasRenderingContext2D, def: StampDef, w: number, h: number, farbe: string): void {
  c.save();
  c.scale(w / 100, h / 100);
  c.translate(-50, -50);
  c.fillStyle = c.strokeStyle = farbe;
  for (const f of def.formen) {
    if (f.pfad) {
      let p = pfadCache.get(f.pfad);
      if (!p) { p = new Path2D(f.pfad); pfadCache.set(f.pfad, p); }
      if (f.linie) { c.lineWidth = f.linie; c.lineJoin = 'round'; c.stroke(p); } else c.fill(p);
    } else if (f.text) {
      const g = f.groesse ?? 60;
      // Text nicht verzerren: in der Breite auf das Feld stauchen, Höhe aus dem Seitenverhältnis
      c.save();
      c.translate(50, 50);
      c.scale(h / w, 1);
      c.font = (f.schrift ?? '800 {g}px system-ui, sans-serif').replace('{g}', String(g));
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(f.text, 0, 4, 100 * (w / h) * 0.94);
      c.restore();
    }
  }
  c.restore();
}

/** Kleines Vorschaubild eines Stempels (für das Menü) */
export function stampPreview(def: StampDef, farbe: string, size = 64): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  const [w, h] = def.groesse;
  const s = (size * 0.86) / Math.max(w, h);
  c.translate(size / 2, size / 2);
  drawStamp(c, def, w * s, h * s, farbe);
  return canvas.toDataURL();
}
