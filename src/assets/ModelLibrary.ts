import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { LabelMaterial } from './LabelMaterial';

// Lädt die Blender-Modelle aus data/3d und gibt fertige Exemplare heraus.
//
// - Jedes FBX wird nur einmal geladen; Exemplare teilen sich Geometrie und Material.
// - Alle Modelle nutzen EIN gemeinsames Material mit der Palettentextur
//   "2026 Palette.png" (Farbe kommt über die UVs aus der Palette).
// - Produkte haben einen zweiten UV-Satz für Etiketten aus "Produkt_Etiketten.png";
//   sie bekommen das LabelMaterial (Palette + Etikett darüber).
// - Das Blender-Material "M_Glass" wird durch ein durchsichtiges Glas ersetzt.
// - Fehlt eine Textur, erscheinen die Modelle neutral grau bzw. ohne Etikett.
//
// Vite sammelt alle Dateien beim Bauen ein (import.meta.glob) und kopiert sie mit.

/** Pfad (/data/3d/…fbx) → Funktion, die die Lade-Adresse liefert. */
type ModelSources = Record<string, () => Promise<string>>;

// Normal: Modelle als eigene Dateien. Für Umgebungen, die keine .fbx-Dateien ausliefern
// (z. B. claude.ai-Artifacts), baut `npm run build:artifact` sie stattdessen als Daten-URL
// in kleine JS-Dateien ein, die erst bei Bedarf geladen werden.
const modelSources: ModelSources = import.meta.env.VITE_INLINE_MODELS
  ? (import.meta.glob('/data/3d/**/*.fbx', { query: '?inline', import: 'default' }) as ModelSources)
  : Object.fromEntries(
      Object.entries(import.meta.glob('/data/3d/**/*.fbx', { query: '?url', import: 'default', eager: true }) as Record<string, string>)
        .map(([path, url]) => [path, () => Promise.resolve(url)]),
    );
const paletteUrls = import.meta.glob('/data/3d/**/2026 Palette.png', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const labelUrls = import.meta.glob('/data/3d/**/Produkt_Etiketten.png', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

/** Liefert Modell-Exemplare; ModelComponent kennt nur diese Schnittstelle (in Tests ohne Browser fehlt sie). */
export interface ModelProvider {
  instance(path: string): Promise<THREE.Object3D>;
}

// 1×1 transparentes Bild: ersetzt die Texturpfade aus Blender (E:\…\2026 Palette.png),
// damit der Loader keine fehlschlagenden Anfragen stellt. Die Texturen setzen wir selbst.
const EMPTY_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';

export class ModelLibrary implements ModelProvider {
  readonly hasPalette: boolean;
  readonly hasLabels: boolean;
  private readonly loader: FBXLoader;
  private readonly templates = new Map<string, Promise<THREE.Group>>();
  private readonly paletteMaterial: THREE.MeshStandardMaterial;
  private readonly labelMaterial: THREE.MeshStandardMaterial;
  private readonly glassMaterial: THREE.MeshStandardMaterial;

  constructor() {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => (/\.(png|jpe?g|tga)$/i.test(url) ? EMPTY_IMAGE : url));
    this.loader = new FBXLoader(manager);

    const paletteUrl = Object.values(paletteUrls)[0];
    const labelUrl = Object.values(labelUrls)[0];
    this.hasPalette = paletteUrl !== undefined;
    this.hasLabels = labelUrl !== undefined;

    // Palette: flache Farbfelder, keine Weichzeichnung zwischen benachbarten Feldern
    const palette = paletteUrl ? loadTexture(paletteUrl, THREE.NearestFilter, THREE.LinearFilter, false) : null;
    const base = { roughness: 0.85, metalness: 0, map: palette, color: palette ? '#ffffff' : '#c9ced3' };
    this.paletteMaterial = new THREE.MeshStandardMaterial({ name: 'Palette', ...base });

    // Etiketten: Bildmotive, hier darf weich gefiltert werden
    const labels = labelUrl ? loadTexture(labelUrl, THREE.LinearFilter, THREE.LinearMipmapLinearFilter, true) : null;
    this.labelMaterial = labels ? new LabelMaterial({ name: 'Produkt', ...base, labelMap: labels }) : this.paletteMaterial;

    this.glassMaterial = new THREE.MeshStandardMaterial({
      name: 'Glas', color: '#8cc7db', transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0, depthWrite: false,
    });
  }

  /** Gibt es zu diesem Pfad (relativ zu data/) ein Modell? */
  has(path: string): boolean {
    return `/data/${path}` in modelSources;
  }

  /** Neues Exemplar eines Modells, z. B. instance('3d/Baubar/…/SM_Build_Wand_Weiss.fbx'). */
  async instance(path: string): Promise<THREE.Object3D> {
    const template = await this.template(path);
    return template.clone(true);
  }

  private template(path: string): Promise<THREE.Group> {
    let t = this.templates.get(path);
    if (!t) {
      const source = modelSources[`/data/${path}`];
      if (!source) return Promise.reject(new Error(`Modell fehlt: data/${path}`));
      t = source().then((url) => this.load(url)).then((group) => this.prepare(group));
      this.templates.set(path, t);
    }
    return t;
  }

  /**
   * Datei laden. Eingebettete Modelle (data:-Adressen) werden direkt im Speicher
   * dekodiert statt per fetch geholt – Seiten mit strenger Sicherheitsrichtlinie
   * (z. B. claude.ai-Artifacts) verbieten fetch auf data:-Adressen.
   */
  private async load(url: string): Promise<THREE.Group> {
    if (url.startsWith('data:')) return this.loader.parse(dataUrlToBuffer(url), '');
    return this.loader.loadAsync(url);
  }

  /** Materialien ersetzen und Schatten einschalten. */
  private prepare(group: THREE.Group): THREE.Group {
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      // Zweiter UV-Satz = Etiketten (nur Produkte haben ihn)
      const solid = obj.geometry.attributes.uv1 ? this.labelMaterial : this.paletteMaterial;
      const replace = (m: THREE.Material) => (/glass/i.test(m.name) ? this.glassMaterial : solid);
      const old = obj.material as THREE.Material | THREE.Material[];
      if (Array.isArray(old) && obj.geometry.groups.length === 0) {
        // Mehrere Material-Plätze, aber keine Flächengruppen: alle Flächen gehören zum ersten Platz.
        // (Sonst zeichnet three.js das Mesh gar nicht – z. B. bei den Bodenplatten.)
        obj.material = replace(old[0]);
      } else {
        obj.material = Array.isArray(old) ? old.map(replace) : replace(old);
      }
      for (const m of Array.isArray(old) ? old : [old]) disposeMaterial(m);
      const glassOnly = [obj.material].flat().every((m) => m === this.glassMaterial);
      obj.castShadow = !glassOnly;
      obj.receiveShadow = true;
    });
    return group;
  }
}

/** "data:…;base64,AAAA" → Bytes */
function dataUrlToBuffer(url: string): ArrayBuffer {
  const binary = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function loadTexture(url: string, mag: THREE.MagnificationTextureFilter, min: THREE.MinificationTextureFilter, mipmaps: boolean): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = mag;
  tex.minFilter = min;
  tex.generateMipmaps = mipmaps;
  return tex;
}

function disposeMaterial(m: THREE.Material): void {
  for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
  m.dispose();
}
