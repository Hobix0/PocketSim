import * as THREE from 'three';
import type { World } from '../ecs/World';
import type { Entity } from '../ecs/Entity';
import { FootprintComponent } from '../components/FootprintComponent';

// Dach über allen Innenräumen: Über jeder Innenfliese (Laden, Lager …) liegt eine Dachplatte auf Deckenhöhe,
// etwas größer als die Fliese, damit sie über die Wände reicht. Herausgezoomt ist das Dach zu sehen,
// hereingezoomt oder beim Bauen verschwindet es (sanft ausgeblendet). Mit der Taste „Dach“ lässt es sich
// jederzeit ausblenden. Das Dach ist reine Darstellung – es gehört zu keiner Entity und ist nicht anklickbar.

export interface RoofSettings {
  hoehe: number;
  abAbstand: number;
  dicke: number;
  ueberstand: number;
  farbe: string;
  kante: string;
}

export class RoofLayer {
  /** Vom Spieler ausgeblendet (Taste „Dach“) */
  hidden = false;
  private readonly group = new THREE.Group();
  private readonly base: THREE.MeshStandardMaterial;
  private readonly cap: THREE.MeshStandardMaterial;
  private meshes: THREE.InstancedMesh[] = [];
  private dirty = true;
  private opacity = 0;
  private shown = false;

  constructor(scene: THREE.Scene, private readonly world: World, private readonly settings: RoofSettings) {
    this.group.name = 'Dach';
    scene.add(this.group);
    this.base = new THREE.MeshStandardMaterial({ color: settings.farbe, roughness: 0.95, transparent: true, opacity: 0 });
    this.cap = new THREE.MeshStandardMaterial({ color: settings.kante, roughness: 1, transparent: true, opacity: 0 });
    const changed = (e: Entity) => { if (e.get(FootprintComponent)?.ebene === 'boden') this.dirty = true; };
    world.events.on('added', changed);
    world.events.on('removed', changed);
  }

  /** Ist das Dach gerade (wenigstens teilweise) zu sehen? */
  get visible(): boolean {
    return this.opacity > 0.01;
  }

  /** Nach dem Verschieben eines Bodens neu aufbauen */
  invalidate(): void {
    this.dirty = true;
  }

  /** `abstand`: Kameraabstand; `bauen`: ein Bauwerkzeug ist aktiv (dann kein Dach) */
  update(dt: number, abstand: number, bauen: boolean): void {
    if (this.dirty) this.rebuild();
    // Etwas Spielraum, damit es an der Grenze nicht flackert
    const s = this.settings;
    if (this.shown && abstand < s.abAbstand - 1.5) this.shown = false;
    else if (!this.shown && abstand > s.abAbstand + 1.5) this.shown = true;
    const target = this.shown && !this.hidden && !bauen ? 1 : 0;
    this.opacity += (target - this.opacity) * Math.min(1, dt * 6);
    if (Math.abs(target - this.opacity) < 0.01) this.opacity = target;
    this.base.opacity = this.opacity;
    this.cap.opacity = this.opacity;
    // Undurchsichtig ist schneller und sauberer; durchsichtig nur während des Überblendens
    const solid = this.opacity >= 1;
    this.base.transparent = this.cap.transparent = !solid;
    this.base.depthWrite = this.cap.depthWrite = solid;
    this.group.visible = this.opacity > 0;
    for (const m of this.meshes) m.castShadow = solid;
  }

  private rebuild(): void {
    this.dirty = false;
    for (const m of this.meshes) { this.group.remove(m); m.dispose(); }
    this.meshes = [];
    const rects = [...this.world.query(FootprintComponent)].filter(([, f]) => f.ebene === 'boden' && !f.aussen).map(([, f]) => f.rect());
    if (!rects.length) return;
    const s = this.settings;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const base = new THREE.InstancedMesh(box, this.base, rects.length);
    const cap = new THREE.InstancedMesh(box, this.cap, rects.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), color = new THREE.Color();
    rects.forEach((r, i) => {
      const w = r.maxX - r.minX + 2 * s.ueberstand, d = r.maxZ - r.minZ + 2 * s.ueberstand;
      const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
      m.compose(new THREE.Vector3(cx, s.hoehe + s.dicke / 2, cz), q, new THREE.Vector3(w, s.dicke, d));
      base.setMatrixAt(i, m);
      // Leicht unterschiedliche Platten wirken wie ein echtes Dach
      base.setColorAt(i, color.set(s.farbe).multiplyScalar(0.94 + ((i * 37) % 11) / 90));
      // Kiesauflage: etwas kleiner, so bleiben Fugen zwischen den Platten sichtbar
      m.compose(new THREE.Vector3(cx, s.hoehe + s.dicke + 0.02, cz), q, new THREE.Vector3(r.maxX - r.minX - 0.12, 0.04, r.maxZ - r.minZ - 0.12));
      cap.setMatrixAt(i, m);
    });
    for (const mesh of [base, cap]) {
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    }
    this.meshes = [base, cap];
  }
}
