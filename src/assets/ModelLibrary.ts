import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { LabelMaterial } from './LabelMaterial';
import { voxelize, type VoxelSource } from '../voxel/voxelize';
import { greedyMesh } from '../voxel/greedyMesh';
import { loadPixels, pixelAt, type Pixels } from '../voxel/pixels';
import type { VoxelGrid } from '../voxel/VoxelGrid';

/** Farben, die in selbst gebauten Voxel-Modellen Glas bedeuten (Skripte: GLAS = #cfe6ec, Kühlschranktür #bcd8df) */
const GLASFARBEN = new Set([0xcfe6ec, 0xbcd8df]);
/** Fensterscheiben der Wohnhäuser (scripts/make-wohn-models.mjs): leuchten abends warm */
const FENSTERFARBEN = new Set([0x9fb7c0, 0xc0d3d9]);

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
  /** Adresse der Palettentextur (z. B. für die Farbauswahl im Editor) */
  readonly paletteUrl: string | undefined;
  readonly hasLabels: boolean;
  private readonly loader: FBXLoader;
  private readonly templates = new Map<string, Promise<THREE.Object3D>>();
  /** Fertige Voxel-Gitter, die erst beim ersten Gebrauch zu Meshes werden (eigene Modelle) */
  private readonly lazyGrids = new Map<string, VoxelGrid>();
  /** Würfelgitter je Vorlage – bewusst nicht in userData: Object3D.clone kopiert userData per JSON,
   *  ein großes Gitter würde sonst bei jedem Exemplar komplett umgewandelt (sehr lange Ladezeiten). */
  private readonly grids = new WeakMap<THREE.Object3D, VoxelGrid>();
  private readonly paletteMaterial: THREE.MeshStandardMaterial;
  private readonly labelMaterial: THREE.MeshStandardMaterial;
  private readonly glassMaterial: THREE.MeshStandardMaterial;
  private readonly voxelMaterial = new THREE.MeshStandardMaterial({ name: 'Voxel', vertexColors: true, roughness: 0.85, metalness: 0 });
  /** Wohnungsfenster: tagsüber wie Glas, abends warmes Licht (setWindowGlow) */
  private readonly windowMaterial = new THREE.MeshStandardMaterial({ name: 'Fenster', vertexColors: true, roughness: 0.3, metalness: 0, emissive: '#ffc062', emissiveIntensity: 0 });
  private readonly palettePixels: Promise<Pixels | null>;
  private readonly labelPixels: Promise<Pixels | null>;

  constructor(private readonly voxel?: VoxelSettings) {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => (/\.(png|jpe?g|tga)$/i.test(url) ? EMPTY_IMAGE : url));
    this.loader = new FBXLoader(manager);

    const paletteUrl = Object.values(paletteUrls)[0];
    this.paletteUrl = paletteUrl;
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

  /** Wie hell die Wohnungsfenster leuchten (0 = Tag, 1 = Nacht) */
  setWindowGlow(f: number): void {
    this.windowMaterial.emissiveIntensity = Math.max(0, Math.min(1, f)) * 0.9;
  }

  get voxelStyle(): boolean {
    return !!this.voxel?.aktiv;
  }

  /** Gibt es zu diesem Pfad (relativ zu data/) ein Modell? */
  has(path: string): boolean {
    return `/data/${path}` in modelSources || this.templates.has(path) || this.lazyGrids.has(path);
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
    const lazy = t ? undefined : this.lazyGrids.get(path);
    if (lazy) {
      t = Promise.resolve(this.buildVoxelModel(lazy));
      this.templates.set(path, t);
      this.lazyGrids.delete(path);
    }
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
    const out = this.voxelObject(solid, glass, voxelStufen(this.voxel!, path));
    out.name = group.name;
    return out;
  }

  /**
   * Fertiges Voxel-Modell (z. B. aus dem Editor) unter einem Pfad bereitstellen.
   * Es lässt sich danach wie jedes andere Modell mit instance(path) verwenden.
   */
  registerVoxelModel(path: string, grid: VoxelGrid): void {
    // Erst beim ersten Gebrauch bauen: beim Start liegen über 300 Modelle bereit
    this.templates.delete(path);
    this.lazyGrids.set(path, grid);
  }

  private buildVoxelModel(grid: VoxelGrid): THREE.Object3D {
    const stufen = this.voxel?.stufen ?? [{ ab: 0, faktor: 1 }];
    // Würfel in Glasfarbe (Vitrinen, Kühlschranktüren, Truhendeckel) werden durchsichtig gezeichnet
    // (der Editor bekommt weiter das ganze Gitter)
    const Grid = grid.constructor as typeof VoxelGrid;
    let solid = grid, glass: VoxelGrid | null = null, fenster: VoxelGrid | null = null;
    const split = () => { if (solid === grid) { solid = new Grid(grid.size, grid.min, grid.dims); solid.data.set(grid.data); } };
    for (let i = 0; i < grid.data.length; i++) {
      const v = grid.data[i];
      if (!v) continue;
      const c = v & 0xffffff;
      if (GLASFARBEN.has(c)) { split(); glass ??= new Grid(grid.size, grid.min, grid.dims); glass.data[i] = v; solid.data[i] = 0; }
      else if (FENSTERFARBEN.has(c)) { split(); fenster ??= new Grid(grid.size, grid.min, grid.dims); fenster.data[i] = v; solid.data[i] = 0; }
    }
    const obj = this.voxelObject(solid, glass, stufen, fenster);
    this.grids.set(obj, grid);
    return obj;
  }

  /** Würfelgitter eines Modells (für den Editor als Vorlage); null, wenn es keins gibt. */
  async voxelGridOf(path: string): Promise<VoxelGrid | null> {
    const lazy = this.lazyGrids.get(path);
    if (lazy) return lazy;
    const t = await this.template(path);
    return this.grids.get(t) ?? null;
  }

  /** Gitter → Objekt mit Detailstufen (LOD); merkt sich das feinste Gitter für den Editor. */
  private voxelObject(solid: VoxelGrid | null, glass: VoxelGrid | null, stufen: VoxelStufe[], fenster: VoxelGrid | null = null): THREE.Object3D {
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
      if (fenster) g.add(new THREE.Mesh(greedyMesh(fenster.downsample(faktor)), this.windowMaterial));
      return g;
    };
    let out: THREE.Object3D;
    if (stufen.length <= 1) out = level(stufen[0]?.faktor ?? 1);
    else {
      const lod = new THREE.LOD();
      for (const st of stufen) lod.addLevel(level(st.faktor), st.ab);
      out = lod;
    }
    if (solid) this.grids.set(out, solid);
    return out;
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
