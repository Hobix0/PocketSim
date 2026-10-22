import * as THREE from 'three';
import { Tweens, ease } from './Tweens';
import type { EffectSettings } from '../content/definitions';

// Effekte im Voxel-Stil: kleine Würfel als Partikel (Staub beim Bauen, Münzen an der Kasse,
// Funkeln beim Level-Aufstieg, Auspuffwölkchen), schwebende Texte („+12,40 €“), Herzen –
// und Bewegungen für Objekte: Plopp beim Hinstellen, Verpuffen beim Abreißen.
// Alle Partikel teilen sich ein InstancedMesh (ein Zeichenaufruf). Farben und Mengen: data/effekte.

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  leben: number;
  dauer: number;
  groesse: number;
  /** >0: wird größer (Rauch), <0: wird kleiner */
  wachsen: number;
  schwerkraft: number;
  bremse: number;
  drehung: THREE.Euler;
  spin: THREE.Vector3;
  farbe: THREE.Color;
}

export interface BurstOptions {
  anzahl: number;
  farben: string[];
  tempo?: number;
  /** Zusätzlich nach oben */
  hoch?: number;
  schwerkraft?: number;
  groesse?: number;
  dauer?: number;
  wachsen?: number;
  bremse?: number;
  /** Startpunkte so weit verstreut (m) */
  streuung?: number;
}

interface FloatSprite {
  sprite: THREE.Sprite;
  leben: number;
  dauer: number;
  hoch: number;
  /** Folgt dieser Figur (Gedankenblasen) statt aufzusteigen */
  folgt?: THREE.Object3D;
}

/** Farbe und Zeichen je Art der Gedankenblase */
const GEDANKEN: Record<string, { zeichen: string; farbe: string }> = {
  fehlt: { zeichen: '?', farbe: '#6f8fb3' },
  zu_teuer: { zeichen: '€', farbe: '#c8483c' },
  schnaeppchen: { zeichen: '%', farbe: '#4f9a5c' },
  gluecklich: { zeichen: '♥', farbe: '#e46b7b' },
};

const MAX = 700;

export class Effects {
  readonly tweens = new Tweens();
  private readonly mesh: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly sprites: FloatSprite[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene, readonly settings: EffectSettings) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, emissive: '#000000' });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.name = 'Effekte';
    scene.add(this.mesh);
  }

  get aktiv(): boolean {
    return this.settings.an;
  }

  // ── Partikel ────────────────────────────────────────────────────

  burst(pos: THREE.Vector3, o: BurstOptions): void {
    if (!this.aktiv) return;
    const n = Math.round(o.anzahl * this.settings.menge);
    for (let i = 0; i < n && this.particles.length < MAX; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize();
      const streu = o.streuung ?? 0;
      this.particles.push({
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * streu, 0, (Math.random() - 0.5) * streu)),
        vel: dir.multiplyScalar((o.tempo ?? 1.5) * (0.5 + Math.random() * 0.7)).add(new THREE.Vector3(0, o.hoch ?? 0, 0)),
        leben: 0,
        dauer: (o.dauer ?? 0.8) * (0.7 + Math.random() * 0.6),
        groesse: (o.groesse ?? 0.06) * (0.7 + Math.random() * 0.6),
        wachsen: o.wachsen ?? -1,
        schwerkraft: o.schwerkraft ?? 6,
        bremse: o.bremse ?? 1.5,
        drehung: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(8),
        farbe: new THREE.Color(o.farben[Math.floor(Math.random() * o.farben.length)]),
      });
    }
  }

  /** Staubwölkchen am Boden (Bauen, Abreißen) */
  dust(pos: THREE.Vector3, breite = 1): void {
    const s = this.settings;
    this.burst(pos.clone().setY(pos.y + 0.05), { anzahl: Math.round(10 + breite * 6), farben: s.staub, tempo: 1.2 + breite * 0.4, hoch: 0.3, schwerkraft: -0.4, groesse: 0.09, dauer: 0.9, wachsen: 0.6, bremse: 3.5, streuung: breite * 0.6 });
  }

  /** Münzen springen hoch (Kasse) */
  coins(pos: THREE.Vector3, anzahl = 6): void {
    this.burst(pos, { anzahl, farben: this.settings.muenzen, tempo: 1.1, hoch: 3, schwerkraft: 9, groesse: 0.07, dauer: 0.9, wachsen: -0.4, bremse: 0.5 });
  }

  /** Funkeln (Level-Aufstieg, Ziel erreicht) */
  sparkle(pos: THREE.Vector3, anzahl = 30): void {
    this.burst(pos, { anzahl, farben: this.settings.funkeln, tempo: 2.6, hoch: 1.5, schwerkraft: 1.2, groesse: 0.06, dauer: 1.3, wachsen: -1, bremse: 1.2, streuung: 0.5 });
  }

  /** Kleines Rauchwölkchen (Auspuff) */
  smoke(pos: THREE.Vector3): void {
    this.burst(pos, { anzahl: 1, farben: this.settings.rauch, tempo: 0.3, hoch: 0.5, schwerkraft: -0.3, groesse: 0.08, dauer: 1.4, wachsen: 1.4, bremse: 1.5 });
  }

  // ── Schwebende Texte und Symbole ────────────────────────────────

  floatText(pos: THREE.Vector3, text: string, farbe = '#ffe08a', groesse = 1): void {
    if (!this.aktiv || !this.settings.texte) return;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    const font = '800 56px system-ui, sans-serif';
    ctx.font = font;
    c.width = Math.ceil(ctx.measureText(text).width) + 24;
    c.height = 80;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(40, 30, 20, 0.85)';
    ctx.lineJoin = 'round';
    ctx.strokeText(text, c.width / 2, 42);
    ctx.fillStyle = farbe;
    ctx.fillText(text, c.width / 2, 42);
    this.addSprite(c, pos, 0.26 * groesse, 1.4);
  }

  /** Gedankenblase über einer Figur (folgt ihr), z. B. „Kein Cola 0,5 L?“ */
  thought(figur: THREE.Object3D, text: string, art: string): void {
    if (!this.aktiv || !this.settings.texte) return;
    const g = GEDANKEN[art] ?? GEDANKEN.fehlt;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    const font = '700 30px system-ui, sans-serif';
    ctx.font = font;
    const tw = Math.ceil(ctx.measureText(text).width);
    c.width = tw + 86;
    c.height = 84;
    // Blase: helle, runde Fläche mit kleinen Denk-Kreisen nach unten
    ctx.fillStyle = 'rgba(40, 30, 20, 0.25)';
    const blase = (dx: number, dy: number) => { ctx.beginPath(); ctx.roundRect(4 + dx, 4 + dy, c.width - 10, 56, 26); ctx.fill(); };
    blase(2, 3);
    ctx.fillStyle = '#fffaf0';
    blase(0, 0);
    for (const [x, y, r] of [[30, 66, 6], [20, 77, 4]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    // Zeichen im farbigen Kreis, dann der Text
    ctx.fillStyle = g.farbe;
    ctx.beginPath(); ctx.arc(34, 32, 19, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.zeichen, 34, 33);
    ctx.fillStyle = '#3b3f44';
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.fillText(text, 62, 33);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const h = 0.42;
    sprite.scale.set(h * (c.width / c.height), h, 1);
    sprite.center.set(0.15, 0); // links unten an der Figur
    sprite.position.copy(figur.position).setY(figur.position.y + 1.95);
    sprite.renderOrder = 31;
    this.scene.add(sprite);
    this.sprites.push({ sprite, leben: 0, dauer: 2.6, hoch: 0, folgt: figur });
  }

  /** Herz über einem zufriedenen Kunden */
  heart(pos: THREE.Vector3): void {
    if (!this.aktiv) return;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    // Pixel-Herz (passt zum Voxel-Stil)
    const rows = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
    const px = 8;
    ctx.fillStyle = 'rgba(60, 20, 20, 0.6)';
    rows.forEach((r, y) => [...r].forEach((b, x) => { if (b === '1') ctx.fillRect(4 + x * px + 2, 8 + y * px + 2, px, px); }));
    ctx.fillStyle = '#ff6f7d';
    rows.forEach((r, y) => [...r].forEach((b, x) => { if (b === '1') ctx.fillRect(4 + x * px, 8 + y * px, px, px); }));
    this.addSprite(c, pos, 0.28, 1.1);
  }

  private addSprite(c: HTMLCanvasElement, pos: THREE.Vector3, hoehe: number, dauer: number): void {
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(hoehe * (c.width / c.height), hoehe, 1);
    sprite.position.copy(pos);
    sprite.renderOrder = 30;
    this.scene.add(sprite);
    this.sprites.push({ sprite, leben: 0, dauer, hoch: 0.9 });
  }

  // ── Bewegungen von Objekten ─────────────────────────────────────

  /** Plopp: wächst mit leichtem Überschwingen auf seine Größe (beim Hinstellen) */
  pop(obj: THREE.Object3D, verzoegerung = 0): void {
    if (!this.aktiv) return;
    const base = obj.scale.clone();
    obj.scale.set(base.x * 0.6, base.y * 0.35, base.z * 0.6);
    this.tweens.add(0.42, (v) => {
      // Erst in die Höhe gezogen, dann gestaucht – wie ein kleiner Hüpfer
      const sy = 0.35 + 0.65 * v + Math.sin(v * Math.PI) * 0.12;
      const sxz = 0.6 + 0.4 * v - Math.sin(v * Math.PI) * 0.05;
      obj.scale.set(base.x * sxz, base.y * sy, base.z * sxz);
    }, { easing: ease.outBack, verzoegerung, done: () => obj.scale.copy(base) });
  }

  /** Verpuffen: eine Kopie schrumpft und dreht sich weg (das Original ist schon entfernt) */
  vanish(obj: THREE.Object3D): void {
    if (!this.aktiv) return;
    obj.updateMatrixWorld(true);
    const ghost = obj.clone(true);
    obj.matrixWorld.decompose(ghost.position, ghost.quaternion, ghost.scale);
    this.scene.add(ghost);
    const base = ghost.scale.clone(), y0 = ghost.position.y, rot0 = ghost.rotation.y;
    this.tweens.add(0.35, (v) => {
      const k = Math.max(0.001, 1 - v);
      ghost.scale.set(base.x * k, base.y * k * (1 + v * 0.4), base.z * k);
      ghost.position.y = y0 + v * 0.3;
      ghost.rotation.y = rot0 + v * 1.4;
    }, { easing: ease.inCubic, done: () => this.scene.remove(ghost) });
  }

  /** Kleines Anheben und Wackeln (z. B. Objekt aufnehmen) */
  wiggle(obj: THREE.Object3D): void {
    if (!this.aktiv) return;
    const r0 = obj.rotation.z;
    this.tweens.add(0.5, (v) => { obj.rotation.z = r0 + Math.sin(v * Math.PI * 4) * 0.08 * (1 - v); }, { easing: ease.linear, done: () => { obj.rotation.z = r0; } });
  }

  // ── Takt ────────────────────────────────────────────────────────

  update(dt: number): void {
    this.tweens.update(dt);
    // Partikel bewegen; abgelaufene fallen heraus
    let n = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.leben += dt;
      if (p.leben >= p.dauer) continue;
      p.vel.y -= p.schwerkraft * dt;
      p.vel.multiplyScalar(Math.exp(-p.bremse * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.01 && p.vel.y < 0) { p.pos.y = 0.01; p.vel.y *= -0.3; p.vel.x *= 0.6; p.vel.z *= 0.6; }
      p.drehung.x += p.spin.x * dt; p.drehung.y += p.spin.y * dt; p.drehung.z += p.spin.z * dt;
      const t = p.leben / p.dauer;
      const k = p.wachsen >= 0 ? 1 + p.wachsen * t : 1 + p.wachsen * t * t;
      // Zum Ende hin ausblenden (über die Größe, Würfel haben keine Durchsichtigkeit je Instanz)
      const fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      const size = Math.max(0.001, p.groesse * k * fade);
      this.m.compose(p.pos, this.q.setFromEuler(p.drehung), this.s.set(size, size, size));
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, p.farbe);
      this.particles[n++] = p;
    }
    this.particles.length = n;
    this.mesh.count = n;
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
    }
    // Schwebende Texte steigen auf und verblassen
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const f = this.sprites[i];
      f.leben += dt;
      const t = f.leben / f.dauer;
      if (f.folgt) f.sprite.position.copy(f.folgt.position).setY(f.folgt.position.y + 1.95 + Math.sin(f.leben * 3) * 0.02);
      else f.sprite.position.y += (f.hoch * dt) * (1 - t * 0.7);
      (f.sprite.material as THREE.SpriteMaterial).opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      // Kurz nach dem Erscheinen leicht schwingend aufrichten
      if (t < 0.15) f.sprite.material.rotation = (1 - ease.outBack(t / 0.15)) * 0.2;
      if (t >= 1) {
        this.scene.remove(f.sprite);
        f.sprite.material.map?.dispose();
        f.sprite.material.dispose();
        this.sprites.splice(i, 1);
      }
    }
  }
}
