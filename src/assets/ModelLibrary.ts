import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { LabelMaterial } from './LabelMaterial';
import { voxelize, type VoxelSource } from '../voxel/voxelize';
import { greedyMesh } from '../voxel/greedyMesh';
import { loadPixels, pixelAt, type Pixels } from '../voxel/pixels';

// Lädt die Blender-Modelle aus data/3d und gibt fertige Exemplare heraus.
//
// - Jedes FBX wird nur einmal geladen; Exemplare teilen sich Geometrie und Material.
// - Alle Modelle nutzen EIN gemeinsames Material mit der Palettentextur
//   "2026 Palette.png" (Farbe kommt über die UVs aus der Palette).
// - Produkte haben einen zweiten UV-Satz für Etiketten aus "Produkt_Etiketten.png";
//   sie bekommen das LabelMaterial (Palette + Etikett darüber).
// - Das Blender-Material "M_Glass" wird durch ein durchsichtiges Glas ersetzt.
// - Fehlt eine Textur, erscheinen die Modelle neutral grau bzw. ohne Etikett.
// - Voxel-Stil (data/voxel/standard.json): Jedes Modell wird nach dem Laden einmal in Würfel
//   umgerechnet (Farben aus Palette und Etikett) und zu einer einzigen Geometrie zusammengefasst.
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
  /** Viele Exemplare desselben Modells in einem Zeichenaufruf (z. B. Ware im Regal). */
  instances?(path: string, matrices: THREE.Matrix4[]): Promise<THREE.Object3D>;
}

/** Detailstufe: ab diesem Kameraabstand (m) werden faktor³ Würfel zu einem zusammengefasst. */
export interface VoxelStufe {
  ab: number;
  faktor: number;
}

/** Einstellungen für den Voxel-Stil (data/voxel/standard.json). */
export interface VoxelSettings {
  aktiv: boolean;
  /** Kantenlänge in Metern */
  kantenlaenge: number;
  /** Detailstufen nach Entfernung (die erste muss ab 0 gelten) */
  stufen: VoxelStufe[];
  /** Abweichende Werte für Modelle, deren Pfad so beginnt */
  regeln: { pfad: string; kantenlaenge?: number; stufen?: VoxelStufe[] }[];
}

// 1×1 transparentes Bild: ersetzt die Texturpfade aus Blender (E:\…\2026 Palette.png),
// damit der Loader keine fehlschlagenden Anfragen stellt. Die Texturen setzen wir selbst.
const EMPTY_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';

export class ModelLibrary implements ModelProvider {
  readonly hasPalette: boolean;
  readonly hasLabels: boolean;
  private readonly loader: FBXLoader;
  private readonly templates = new Map<string, Promise<THREE.Object3D>>();
  private readonly paletteMaterial: THREE.MeshStandardMaterial;
  private readonly labelMaterial: THREE.MeshStandardMaterial;
  private readonly glassMaterial: THREE.MeshStandardMaterial;
  private readonly voxelMaterial = new THREE.MeshStandardMaterial({ name: 'Voxel', vertexColors: true, roughness: 0.85, metalness: 0 });
  private readonly palettePixels: Promise<Pixels | null>;
  private readonly labelPixels: Promise<Pixels | null>;

  constructor(private readonly voxel?: VoxelSettings) {
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

    // Für die Voxel-Farben werden die Bilder einmal als Pixel gelesen
    const useVoxel = !!voxel?.aktiv;
    this.palettePixels = useVoxel && paletteUrl ? loadPixels(paletteUrl) : Promise.resolve(null);
    this.labelPixels = useVoxel && labelUrl ? loadPixels(labelUrl) : Promise.resolve(null);
  }

  get voxelStyle(): boolean {
    return !!this.voxel?.aktiv;
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

  /** Viele Exemplare als InstancedMesh: ein Zeichenaufruf pro Teil statt einer pro Exemplar. */
  async instances(path: string, matrices: THREE.Matrix4[]): Promise<THREE.Object3D> {
    const template = await this.template(path);
    template.updateMatrixWorld(true);
    const m = new THREE.Matrix4();
    const instanced = (part: THREE.Object3D) => {
      const group = new THREE.Group();
      part.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const im = new THREE.InstancedMesh(obj.geometry, obj.material, matrices.length);
        matrices.forEach((mat, i) => im.setMatrixAt(i, m.multiplyMatrices(mat, obj.matrixWorld)));
        im.castShadow = obj.castShadow;
        im.receiveShadow = obj.receiveShadow;
        im.computeBoundingSphere();
        group.add(im);
      });
      return group;
    };
    if (!(template instanceof THREE.LOD)) return instanced(template);
    // Detailstufen bleiben erhalten: je Stufe ein Satz InstancedMeshes
    const lod = new THREE.LOD();
    for (const l of template.levels) lod.addLevel(instanced(l.object), l.distance);
    return lod;
  }

  private template(path: string): Promise<THREE.Object3D> {
    let t = this.templates.get(path);
    if (!t) {
      const source = modelSources[`/data/${path}`];
      if (!source) return Promise.reject(new Error(`Modell fehlt: data/${path}`));
      t = source().then((url) => this.load(url)).then((group) => this.prepare(group))
        .then((group) => (this.voxel?.aktiv ? this.toVoxel(group, path) : group));
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

  /** Modell in Würfel umrechnen: eine Geometrie für alles Feste, eine für Glas. */
  private async toVoxel(group: THREE.Group, path: string): Promise<THREE.Object3D> {
    const size = voxelSize(this.voxel!, path);
    const [palette, labels] = await Promise.all([this.palettePixels, this.labelPixels]);
    const grey = 0xc9ced3;
    const paletteColor = (uv: THREE.Vector2 | null): number => {
      if (!palette || !uv) return grey;
      const k = pixelAt(palette, uv.x, uv.y);
      return (palette.data[k] << 16) | (palette.data[k + 1] << 8) | palette.data[k + 2];
    };
    // Etikett wie im LabelMaterial über die Palettenfarbe legen (Deckkraft = Alpha)
    const labelColor = (uv: THREE.Vector2 | null, uv1: THREE.Vector2 | null): number => {
      const base = paletteColor(uv);
      if (!labels || !uv1) return base;
      const k = pixelAt(labels, uv1.x, uv1.y);
      const a = labels.data[k + 3] / 255;
      if (a < 0.02) return base;
      const mix = (shift: number, i: number) => Math.round(((base >> shift) & 255) * (1 - a) + labels.data[k + i] * a);
      return (mix(16, 0) << 16) | (mix(8, 1) << 8) | mix(0, 2);
    };

    group.updateMatrixWorld(true);
    const sources: VoxelSource[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      geometries.push(obj.geometry);
      const mats = [obj.material as THREE.Material | THREE.Material[]].flat();
      const parts = obj.geometry.groups.length ? obj.geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
      for (const part of parts) {
        const m = mats[part.materialIndex ?? 0] ?? mats[0];
        sources.push({
          geometry: obj.geometry, matrix: obj.matrixWorld, start: part.start, count: part.count,
          glass: m === this.glassMaterial,
          color: m === this.labelMaterial && m !== this.paletteMaterial ? labelColor : paletteColor,
        });
      }
    });

    const { solid, glass } = voxelize(sources, size);
    // Die Original-Dreiecke werden nicht mehr gebraucht
    for (const g of geometries) g.dispose();

    // Eine Gruppe je Detailstufe; three.js wählt beim Zeichnen die passende (LOD)
    const level = (faktor: number) => {
      const g = new THREE.Group();
      if (solid) {
        const mesh = new THREE.Mesh(greedyMesh(solid.downsample(faktor)), this.voxelMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        g.add(mesh);
      }
      if (glass) {
        const mesh = new THREE.Mesh(greedyMesh(glass.downsample(faktor)), this.glassMaterial);
        mesh.receiveShadow = true;
        g.add(mesh);
      }
      return g;
    };
    const stufen = voxelStufen(this.voxel!, path);
    if (stufen.length <= 1) {
      const out = level(stufen[0]?.faktor ?? 1);
      out.name = group.name;
      return out;
    }
    const lod = new THREE.LOD();
    lod.name = group.name;
    for (const st of stufen) lod.addLevel(level(st.faktor), st.ab);
    return lod;
  }
}

/** Kantenlänge für ein Modell: erste passende Regel, sonst der Standard. */
export function voxelSize(settings: VoxelSettings, path: string): number {
  return settings.regeln.find((r) => path.startsWith(r.pfad))?.kantenlaenge ?? settings.kantenlaenge;
}

/** Detailstufen für ein Modell: erste passende Regel, sonst der Standard. */
export function voxelStufen(settings: VoxelSettings, path: string): VoxelStufe[] {
  return settings.regeln.find((r) => path.startsWith(r.pfad) && r.stufen)?.stufen ?? settings.stufen;
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
