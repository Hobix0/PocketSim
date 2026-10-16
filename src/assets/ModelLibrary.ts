import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// Lädt die Blender-Modelle aus data/3d und gibt fertige Exemplare heraus.
//
// - Jedes FBX wird nur einmal geladen; Exemplare teilen sich Geometrie und Material.
// - Alle Modelle nutzen EIN gemeinsames Material mit der Palettentextur
//   "2026 Palette.png" (Farbe kommt über die UVs aus der Palette).
// - Das Blender-Material "M_Glass" wird durch ein durchsichtiges Glas ersetzt.
// - Fehlt die Palette, erscheinen die Modelle neutral grau. Sobald die Datei
//   irgendwo unter data/3d liegt, wird sie ohne Code-Änderung benutzt.
//
// Vite sammelt alle Dateien beim Bauen ein (import.meta.glob) und kopiert sie mit.

const modelUrls = import.meta.glob('/data/3d/**/*.fbx', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const paletteUrls = import.meta.glob('/data/3d/**/2026 Palette.png', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

/** Liefert Modell-Exemplare; ModelComponent kennt nur diese Schnittstelle (in Tests ohne Browser fehlt sie). */
export interface ModelProvider {
  instance(path: string): Promise<THREE.Object3D>;
}

// 1×1 transparentes Bild: ersetzt die Texturpfade aus Blender (E:\…\2026 Palette.png),
// damit der Loader keine fehlschlagenden Anfragen stellt. Die Palette setzen wir selbst.
const EMPTY_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';

export class ModelLibrary implements ModelProvider {
  readonly hasPalette: boolean;
  private readonly loader: FBXLoader;
  private readonly templates = new Map<string, Promise<THREE.Group>>();
  private readonly paletteMaterial: THREE.MeshStandardMaterial;
  private readonly glassMaterial: THREE.MeshStandardMaterial;

  constructor() {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => (/\.(png|jpe?g|tga)$/i.test(url) ? EMPTY_IMAGE : url));
    this.loader = new FBXLoader(manager);

    const paletteUrl = Object.values(paletteUrls)[0];
    this.hasPalette = paletteUrl !== undefined;
    this.paletteMaterial = new THREE.MeshStandardMaterial({ name: 'Palette', roughness: 0.85, metalness: 0 });
    if (paletteUrl) {
      const tex = new THREE.TextureLoader().load(paletteUrl);
      tex.colorSpace = THREE.SRGBColorSpace;
      // Flache Farbfelder: keine Weichzeichnung zwischen benachbarten Feldern
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      this.paletteMaterial.map = tex;
    } else {
      this.paletteMaterial.color.set('#c9ced3');
    }
    this.glassMaterial = new THREE.MeshStandardMaterial({
      name: 'Glas', color: '#8cc7db', transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0, depthWrite: false,
    });
  }

  /** Gibt es zu diesem Pfad (relativ zu data/) ein Modell? */
  has(path: string): boolean {
    return `/data/${path}` in modelUrls;
  }

  /** Neues Exemplar eines Modells, z. B. instance('3d/Baubar/…/SM_Build_Wand_Weiss.fbx'). */
  async instance(path: string): Promise<THREE.Object3D> {
    const template = await this.template(path);
    return template.clone(true);
  }

  private template(path: string): Promise<THREE.Group> {
    let t = this.templates.get(path);
    if (!t) {
      const url = modelUrls[`/data/${path}`];
      if (!url) return Promise.reject(new Error(`Modell fehlt: data/${path}`));
      t = this.loader.loadAsync(url).then((group) => this.prepare(group));
      this.templates.set(path, t);
    }
    return t;
  }

  /** Materialien ersetzen und Schatten einschalten. */
  private prepare(group: THREE.Group): THREE.Group {
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const replace = (m: THREE.Material) => (/glass/i.test(m.name) ? this.glassMaterial : this.paletteMaterial);
      const old = obj.material as THREE.Material | THREE.Material[];
      if (Array.isArray(old) && obj.geometry.groups.length === 0) {
        // Mehrere Material-Plätze, aber keine Flächengruppen: alle Flächen gehören zum ersten Platz.
        // (Sonst zeichnet three.js das Mesh gar nicht – z. B. bei den Bodenplatten.)
        obj.material = replace(old[0]);
      } else {
        obj.material = Array.isArray(old) ? old.map(replace) : replace(old);
      }
      for (const m of Array.isArray(old) ? old : [old]) disposeMaterial(m);
      const glassOnly = [].concat(obj.material as never).every((m) => m === this.glassMaterial);
      obj.castShadow = !glassOnly;
      obj.receiveShadow = true;
    });
    return group;
  }
}

function disposeMaterial(m: THREE.Material): void {
  for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
  m.dispose();
}
