import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { readData } from '../core/Data';
import { Content } from '../content/Content';
import type { BuildLayer } from '../content/definitions';
import { ModelLibrary, type VoxelSettings } from '../assets/ModelLibrary';
import { VoxelGrid } from '../voxel/VoxelGrid';
import { greedyMesh } from '../voxel/greedyMesh';
import { loadPixels } from '../voxel/pixels';
import { raycastGrid, type GridHit } from './raycastGrid';
import {
  CUSTOM_PREFIX, decodeGrid, detectShelfLevels, encodeGrid, idFromName, validateVoxelModel,
  type ModelType, type VoxelModelData,
} from './VoxelModel';
import { allModels, deleteFromBrowser, deleteFromProject, saveToBrowser, saveToProject } from './ModelStore';
import { esc } from '../ui/html';

// Voxel-Editor: eigene Modelle aus Würfeln bauen, die danach im Baumenü („Eigene“) erscheinen.
//
// Bedienung: Linksklick = Werkzeug (Ziehen malt eine ganze Fläche), Rechts ziehen = drehen,
// Mitte ziehen = verschieben, Mausrad = zoomen, Alt + Klick = Farbe aufnehmen.
// Bearbeitet wird in Blöcken zu 16³ Würfeln: nach einem Klick wird nur der betroffene Block neu gebaut.

type Tool = 'setzen' | 'entfernen' | 'malen' | 'fuellen' | 'pipette';

const CHUNK = 16;
const MAX_DIM = 160;
const TOOLS: { id: Tool; name: string; taste: string }[] = [
  { id: 'setzen', name: 'Setzen', taste: '1' },
  { id: 'entfernen', name: 'Entfernen', taste: '2' },
  { id: 'malen', name: 'Malen', taste: '3' },
  { id: 'fuellen', name: 'Füllen', taste: '4' },
  { id: 'pipette', name: 'Pipette', taste: '5' },
];
const SIZES = [0.01, 0.025, 0.05, 0.1];

interface Change { i: number; before: number; after: number }

export class VoxelEditor {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
  private readonly controls: OrbitControls;
  private readonly content = new Content();
  private readonly models: ModelLibrary;
  private readonly modelGroup = new THREE.Group();
  private readonly helpers = new THREE.Group();
  private readonly chunks = new Map<string, THREE.Mesh>();
  private readonly dirty = new Set<string>();
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  private readonly hover: THREE.LineSegments;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly ui: HTMLElement;

  private grid: VoxelGrid;
  private tool: Tool = 'setzen';
  private mirror = false;
  private color = 0xc0573e;
  private palette: number[] = [];
  private undoStack: Change[][] = [];
  private redoStack: Change[][] = [];
  private stroke: { changes: Map<number, Change>; axis: number; layer: number } | null = null;
  private pointerInside = false;
  private meta: { id: string | null; name: string; typ: ModelType; preis: number; ebene: BuildLayer; kapazitaet: number; kuehlung: boolean } =
    { id: null, name: 'Mein Modell', typ: 'deko', preis: 150, ebene: 'objekt', kapazitaet: 20, kuehlung: false };

  constructor(container: HTMLElement) {
    const voxel = readData<VoxelSettings>('voxel/standard');
    this.models = new ModelLibrary({ ...voxel, aktiv: true });
    this.grid = new VoxelGrid(0.025, [0, 0, 0], [40, 64, 40]);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.append(this.renderer.domElement);
    const surface = this.renderer.domElement;
    surface.classList.add('editor-canvas');

    this.scene.background = new THREE.Color('#2a3138');
    this.scene.add(new THREE.HemisphereLight('#e9f1f5', '#5a5348', 1.5));
    const sun = new THREE.DirectionalLight('#fff1dc', 2.2);
    sun.position.set(3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.1, far: 20 });
    this.scene.add(sun);
    this.scene.add(this.modelGroup, this.helpers);

    this.controls = new OrbitControls(this.camera, surface);
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.enableDamping = true;
    surface.addEventListener('contextmenu', (e) => e.preventDefault());

    this.hover = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: '#5fd08a', depthTest: false }));
    this.hover.renderOrder = 10;
    this.hover.visible = false;
    this.scene.add(this.hover);

    this.ui = document.createElement('div');
    this.ui.className = 'editor';
    document.body.append(this.ui);
    this.buildUi();

    surface.addEventListener('pointermove', (e) => this.onPointer(e, 'move'));
    surface.addEventListener('pointerdown', (e) => this.onPointer(e, 'down'));
    window.addEventListener('pointerup', () => this.endStroke());
    surface.addEventListener('pointerleave', () => { this.pointerInside = false; this.hover.visible = false; });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());

    this.loadPalette();
    this.resetGrid(this.grid);
    this.resize();
    // Nach dem Neuladen (z. B. durch Speichern im Entwicklungsmodus) das zuletzt bearbeitete Modell öffnen
    const last = sessionStorage.getItem('urbanevolution.editor.zuletzt');
    const found = last ? allModels().find((m) => m.id === last) : undefined;
    if (found) this.openModel(found);
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      this.rebuildDirty();
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  // ── Gitter und Darstellung ──────────────────────────────────────

  private resetGrid(grid: VoxelGrid): void {
    this.grid = grid;
    for (const m of this.chunks.values()) { this.modelGroup.remove(m); m.geometry.dispose(); }
    this.chunks.clear();
    const [nx, ny, nz] = grid.dims;
    for (let x = 0; x < nx; x += CHUNK) for (let y = 0; y < ny; y += CHUNK) for (let z = 0; z < nz; z += CHUNK) this.dirty.add(`${x / CHUNK},${y / CHUNK},${z / CHUNK}`);
    this.undoStack = [];
    this.redoStack = [];
    this.layoutHelpers();
    this.frameCamera();
    this.renderStatus();
  }

  /** Lage im Raum: Ursprung unten in der Mitte, wie später im Spiel. */
  private get offset(): THREE.Vector3 {
    const s = this.grid.size, [nx, , nz] = this.grid.dims;
    return new THREE.Vector3(-Math.floor(nx / 2) * s, 0, -Math.floor(nz / 2) * s);
  }

  private layoutHelpers(): void {
    this.helpers.clear();
    const s = this.grid.size, [nx, ny, nz] = this.grid.dims;
    const o = this.offset;
    this.modelGroup.position.copy(o);
    // Boden mit Raster (Linie alle 4 Würfel) und Umriss des Bauraums
    const lines: number[] = [];
    for (let x = 0; x <= nx; x += 4) lines.push(x * s, 0, 0, x * s, 0, nz * s);
    for (let z = 0; z <= nz; z += 4) lines.push(0, 0, z * s, nx * s, 0, z * s);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const raster = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#56616b' }));
    raster.position.copy(o);
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(nx * s, ny * s, nz * s)), new THREE.LineBasicMaterial({ color: '#3d4750' }));
    box.position.set(o.x + (nx * s) / 2, (ny * s) / 2, o.z + (nz * s) / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(nx * s, nz * s), new THREE.MeshStandardMaterial({ color: '#39424a', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(o.x + (nx * s) / 2, -0.001, o.z + (nz * s) / 2);
    floor.receiveShadow = true;
    // Pfeil: vorne ist +X (dort steht bei Regalen die Ware)
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(o.x + nx * s + 0.05, 0.01, 0), 0.3, '#5fd08a', 0.1, 0.07);
    this.helpers.add(floor, raster, box, arrow);
    this.hover.scale.setScalar(s * 1.02);
  }

  private frameCamera(): void {
    const s = this.grid.size, [nx, ny, nz] = this.grid.dims;
    const r = Math.max(nx, ny, nz) * s;
    this.controls.target.set(0, (ny * s) / 3, 0);
    this.camera.position.set(r * 1.4, r * 1.1, r * 1.6);
    this.camera.near = r / 200;
    this.camera.far = r * 50;
    this.camera.updateProjectionMatrix();
  }

  private markDirty(x: number, y: number, z: number): void {
    // Auch die Nachbarblöcke, wenn der Würfel am Rand liegt (deren Flächen hängen davon ab)
    for (const [dx, dy, dz] of [[0, 0, 0], [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]]) {
      const cx = Math.floor((x + dx) / CHUNK), cy = Math.floor((y + dy) / CHUNK), cz = Math.floor((z + dz) / CHUNK);
      if (cx < 0 || cy < 0 || cz < 0) continue;
      this.dirty.add(`${cx},${cy},${cz}`);
    }
  }

  private rebuildDirty(): void {
    if (!this.dirty.size) return;
    const [nx, ny, nz] = this.grid.dims;
    for (const key of this.dirty) {
      const [cx, cy, cz] = key.split(',').map(Number);
      const min: [number, number, number] = [cx * CHUNK, cy * CHUNK, cz * CHUNK];
      if (min[0] >= nx || min[1] >= ny || min[2] >= nz) continue;
      const max: [number, number, number] = [Math.min(nx, min[0] + CHUNK), Math.min(ny, min[1] + CHUNK), Math.min(nz, min[2] + CHUNK)];
      const old = this.chunks.get(key);
      if (old) { this.modelGroup.remove(old); old.geometry.dispose(); this.chunks.delete(key); }
      // Gitter mit Ecke 0: Geometrie in Modellkoordinaten
      const geo = greedyMesh(this.grid, { min, max });
      if (!geo.index?.count) { geo.dispose(); continue; }
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.chunks.set(key, mesh);
      this.modelGroup.add(mesh);
    }
    this.dirty.clear();
    this.renderStatus();
  }

  // ── Bearbeiten ──────────────────────────────────────────────────

  private onPointer(e: PointerEvent, kind: 'move' | 'down'): void {
    this.pointerInside = true;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const hit = this.pick();
    this.showHover(hit);
    if (kind === 'down' && e.button === 0) {
      const tool = e.altKey ? 'pipette' : this.tool;
      if (!hit) return;
      if (tool === 'pipette') { if (!hit.ground) this.setColor(this.grid.get(...hit.cell) & 0xffffff); return; }
      if (tool === 'fuellen') { if (!hit.ground) this.flood(hit.cell); return; }
      const target = this.targetCell(hit, tool);
      if (!target) return;
      const axis = hit.normal.findIndex((v) => v !== 0);
      this.stroke = { changes: new Map(), axis, layer: target[axis] };
      this.apply(target, tool);
    } else if (kind === 'move' && this.stroke && (e.buttons & 1)) {
      // Ziehen: in derselben Schicht weitermachen (sonst würde man sich selbst entgegenbauen)
      const cell = this.cellOnLayer(this.stroke.axis, this.stroke.layer);
      if (cell) this.apply(cell, this.tool);
    }
  }

  private pick(): GridHit | null {
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const s = this.grid.size, o = this.offset;
    const ray = this.raycaster.ray;
    const origin: [number, number, number] = [(ray.origin.x - o.x) / s, ray.origin.y / s, (ray.origin.z - o.z) / s];
    const dir: [number, number, number] = [ray.direction.x, ray.direction.y, ray.direction.z];
    return raycastGrid(this.grid.dims, (x, y, z) => this.grid.get(x, y, z) !== 0, origin, dir);
  }

  /** Zelle auf einer festen Schicht unter dem Zeiger (für Ziehen). */
  private cellOnLayer(axis: number, layer: number): [number, number, number] | null {
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const s = this.grid.size, o = this.offset;
    const ray = this.raycaster.ray;
    const origin = [(ray.origin.x - o.x) / s, ray.origin.y / s, (ray.origin.z - o.z) / s];
    const dir = [ray.direction.x, ray.direction.y, ray.direction.z];
    if (Math.abs(dir[axis]) < 1e-9) return null;
    const t = (layer + 0.5 - origin[axis]) / dir[axis];
    if (t < 0) return null;
    const cell = [0, 1, 2].map((i) => (i === axis ? layer : Math.floor(origin[i] + dir[i] * t))) as [number, number, number];
    return cell.every((v, i) => v >= 0 && v < this.grid.dims[i]) ? cell : null;
  }

  private targetCell(hit: GridHit, tool: Tool): [number, number, number] | null {
    if (tool === 'setzen') {
      const c = hit.cell.map((v, i) => v + hit.normal[i]) as [number, number, number];
      return c.every((v, i) => v >= 0 && v < this.grid.dims[i]) ? c : null;
    }
    return hit.ground ? null : hit.cell;
  }

  private showHover(hit: GridHit | null): void {
    const target = hit ? (this.tool === 'setzen' ? this.targetCell(hit, 'setzen') : hit.ground ? null : hit.cell) : null;
    this.hover.visible = !!target && this.pointerInside;
    if (!target) return;
    const s = this.grid.size, o = this.offset;
    this.hover.position.set(o.x + (target[0] + 0.5) * s, (target[1] + 0.5) * s, o.z + (target[2] + 0.5) * s);
    (this.hover.material as THREE.LineBasicMaterial).color.set(this.tool === 'entfernen' ? '#f08a7a' : '#5fd08a');
  }

  /** Werkzeug auf eine Zelle anwenden (mit Spiegelung). */
  private apply(cell: [number, number, number], tool: Tool): void {
    const cells = [cell];
    if (this.mirror) {
      const mx = this.grid.dims[0] - 1 - cell[0];
      if (mx !== cell[0]) cells.push([mx, cell[1], cell[2]]);
    }
    for (const [x, y, z] of cells) {
      const before = this.grid.get(x, y, z);
      let after = before;
      if (tool === 'setzen' && before === 0) after = this.color | (1 << 24);
      if (tool === 'entfernen') after = 0;
      if (tool === 'malen' && before !== 0) after = this.color | (1 << 24);
      if (after === before) continue;
      this.write(x, y, z, before, after);
    }
  }

  /** Zusammenhängende Würfel gleicher Farbe umfärben. */
  private flood(start: [number, number, number]): void {
    const from = this.grid.get(...start);
    const to = this.color | (1 << 24);
    if (!from || from === to) return;
    this.stroke = { changes: new Map(), axis: 0, layer: 0 };
    const stack = [start];
    const seen = new Set<number>();
    while (stack.length) {
      const [x, y, z] = stack.pop()!;
      const i = this.grid.index(x, y, z);
      if (seen.has(i) || this.grid.get(x, y, z) !== from) continue;
      seen.add(i);
      this.write(x, y, z, from, to);
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const n: [number, number, number] = [x + dx, y + dy, z + dz];
        if (n.every((v, k) => v >= 0 && v < this.grid.dims[k])) stack.push(n);
      }
    }
    this.endStroke();
  }

  private write(x: number, y: number, z: number, before: number, after: number): void {
    const i = this.grid.index(x, y, z);
    this.grid.data[i] = after;
    const ch = this.stroke?.changes.get(i);
    if (ch) ch.after = after;
    else this.stroke?.changes.set(i, { i, before, after });
    this.markDirty(x, y, z);
  }

  private endStroke(): void {
    if (!this.stroke) return;
    const changes = [...this.stroke.changes.values()].filter((c) => c.before !== c.after);
    this.stroke = null;
    if (!changes.length) return;
    this.undoStack.push(changes);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }

  private undo(redo = false): void {
    const from = redo ? this.redoStack : this.undoStack;
    const to = redo ? this.undoStack : this.redoStack;
    const changes = from.pop();
    if (!changes) return;
    const [, ny, nz] = this.grid.dims;
    for (const c of changes) {
      this.grid.data[c.i] = redo ? c.after : c.before;
      const x = Math.floor(c.i / (ny * nz)), y = Math.floor(c.i / nz) % ny, z = c.i % nz;
      this.markDirty(x, y, z);
    }
    to.push(changes);
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); this.undo(e.shiftKey); return; }
    if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); this.undo(true); return; }
    const t = TOOLS.find((x) => x.taste === e.key);
    if (t) this.setTool(t.id);
    if (e.key.toLowerCase() === 'm') this.setMirror(!this.mirror);
  }

  // ── Größe, Vorlagen, Speichern ──────────────────────────────────

  /** Bauraum ändern; der Inhalt bleibt unten in der Mitte stehen. */
  private resize3d(dims: [number, number, number], size: number): void {
    const old = this.grid;
    const g = new VoxelGrid(size, [0, 0, 0], dims);
    const dx = Math.floor(dims[0] / 2) - Math.floor(old.dims[0] / 2);
    const dz = Math.floor(dims[2] / 2) - Math.floor(old.dims[2] / 2);
    for (let x = 0; x < old.dims[0]; x++) for (let y = 0; y < old.dims[1]; y++) for (let z = 0; z < old.dims[2]; z++) {
      const v = old.get(x, y, z);
      if (v) { const nx = x + dx, nz = z + dz; if (nx >= 0 && nz >= 0 && nx < dims[0] && y < dims[1] && nz < dims[2]) g.data[g.index(nx, y, nz)] = v; }
    }
    this.resetGrid(g);
  }

  /** Ein Modell aus dem Spiel als Ausgangspunkt nehmen. */
  private async loadTemplate(path: string, name: string): Promise<void> {
    this.status(`Lade ${name} …`);
    const src = await this.models.voxelGridOf(path).catch(() => null);
    if (!src) { this.status('Dieses Modell hat keine Würfel-Fassung.'); return; }
    let g = src;
    while (Math.max(...g.dims) > MAX_DIM) g = g.downsample(2);
    const out = new VoxelGrid(g.size, [0, 0, 0], [...g.dims]);
    out.data.set(g.data);
    this.meta = { ...this.meta, id: null, name: `${name} (eigen)` };
    this.resetGrid(out);
    this.renderForm();
    this.status(`${name} geladen – ${g.dims.join(' × ')} Würfel zu ${(g.size * 100).toLocaleString('de-DE')} cm.`);
  }

  private openModel(m: VoxelModelData): void {
    this.meta = { id: m.id, name: m.name, typ: m.typ, preis: m.preis, ebene: m.ebene, kapazitaet: m.regal?.kapazitaet ?? 20, kuehlung: m.regal?.kuehlung ?? false };
    this.resetGrid(decodeGrid(m));
    this.renderForm();
    this.status(`„${m.name}“ geöffnet.`);
  }

  /** Auf den Inhalt zuschneiden: leere Ränder fallen weg (die Grundfläche im Spiel passt dann). */
  private cropped(): VoxelGrid | null {
    const [nx, ny, nz] = this.grid.dims;
    const lo = [Infinity, Infinity, Infinity], hi = [-1, -1, -1];
    for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
      if (!this.grid.get(x, y, z)) continue;
      const c = [x, y, z];
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c[i]); hi[i] = Math.max(hi[i], c[i]); }
    }
    if (hi[0] < 0) return null;
    // Stehende Modelle behalten ihren Boden bei y = 0
    if (this.meta.ebene !== 'decke') lo[1] = 0;
    const dims: [number, number, number] = [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1];
    const g = new VoxelGrid(this.grid.size, [0, 0, 0], dims);
    for (let x = 0; x < dims[0]; x++) for (let y = 0; y < dims[1]; y++) for (let z = 0; z < dims[2]; z++) {
      g.data[g.index(x, y, z)] = this.grid.get(x + lo[0], y + lo[1], z + lo[2]);
    }
    return g;
  }

  private async save(): Promise<void> {
    const g = this.cropped();
    if (!g) { this.status('Das Modell ist leer.'); return; }
    const id = this.meta.id ?? idFromName(this.meta.name);
    const { palette, voxel } = encodeGrid(g);
    const m: VoxelModelData = {
      id, name: this.meta.name.trim() || 'Modell', typ: this.meta.typ, preis: this.meta.preis, ebene: this.meta.ebene,
      kantenlaenge: g.size, groesse: [...g.dims], palette, voxel,
      regal: this.meta.typ === 'regal' ? { kapazitaet: this.meta.kapazitaet, kuehlung: this.meta.kuehlung } : undefined,
      vorschau: this.thumbnail(),
    };
    this.meta.id = id;
    sessionStorage.setItem('urbanevolution.editor.zuletzt', id);
    const browser = saveToBrowser(m);
    const datei = await saveToProject(m);
    this.status(datei ? `Gespeichert in ${datei} – erscheint im Baumenü unter „Eigene“.`
      : browser ? 'Im Browser gespeichert – erscheint im Baumenü unter „Eigene“. Mit „Exportieren“ als Datei sichern.'
        : 'Speichern nicht möglich (Browser-Speicher gesperrt). Bitte „Exportieren“ benutzen.');
    this.renderLibrary();
  }

  private exportFile(): void {
    const g = this.cropped();
    if (!g) return;
    const { palette, voxel } = encodeGrid(g);
    const id = this.meta.id ?? idFromName(this.meta.name);
    const m: VoxelModelData = { id, name: this.meta.name, typ: this.meta.typ, preis: this.meta.preis, ebene: this.meta.ebene, kantenlaenge: g.size, groesse: [...g.dims], palette, voxel, regal: this.meta.typ === 'regal' ? { kapazitaet: this.meta.kapazitaet, kuehlung: this.meta.kuehlung } : undefined, vorschau: this.thumbnail() };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' }));
    a.download = `${id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.status(`${id}.json exportiert – in data/modelle/ legen, dann gehört das Modell zum Projekt.`);
  }

  private async importFile(file: File): Promise<void> {
    try {
      const m = validateVoxelModel(JSON.parse(await file.text()), file.name);
      this.openModel(m);
    } catch (err) {
      this.status(`Import fehlgeschlagen: ${String(err)}`);
    }
  }

  /** Vorschaubild für das Baumenü: das Modell schräg von vorne. */
  private thumbnail(): string {
    const size = 160;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(size, size, false);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#7a7468', 1.8));
    const light = new THREE.DirectionalLight('#fff4e6', 1.8);
    light.position.set(3, 5, 2);
    scene.add(light);
    const group = new THREE.Group();
    for (const m of this.chunks.values()) group.add(new THREE.Mesh(m.geometry, this.material));
    group.position.copy(this.offset);
    scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2 || 0.5;
    const cam = new THREE.PerspectiveCamera(30, 1, radius / 50, radius * 20);
    cam.position.copy(center).add(new THREE.Vector3(1.3, 0.9, 1.0).normalize().multiplyScalar(radius / Math.sin(THREE.MathUtils.degToRad(15))));
    cam.lookAt(center);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    r.dispose();
    return url;
  }

  private async loadPalette(): Promise<void> {
    const url = this.models.paletteUrl;
    const px = url ? await loadPixels(url) : null;
    // Ähnliche Farben zusammenfassen (je Kanal 16 Stufen) und die häufigsten aus der ganzen Textur nehmen
    const bins = new Map<number, { n: number; rgb: number }>();
    if (px) for (let i = 0; i < px.data.length; i += 4) {
      if (px.data[i + 3] < 200) continue;
      const r = px.data[i], g = px.data[i + 1], b = px.data[i + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bin = bins.get(key);
      if (bin) bin.n++;
      else bins.set(key, { n: 1, rgb: (r << 16) | (g << 8) | b });
    }
    const common = [...bins.values()].sort((a, b) => b.n - a.n).slice(0, 96).map((b) => b.rgb);
    const hsl = (c: number) => new THREE.Color().setHex(c).getHSL({ h: 0, s: 0, l: 0 });
    this.palette = common.sort((a, b) => {
      const A = hsl(a), B = hsl(b);
      const grayA = A.s < 0.12, grayB = B.s < 0.12;
      if (grayA !== grayB) return grayA ? 1 : -1;
      return grayA ? A.l - B.l : Math.round(A.h * 12) - Math.round(B.h * 12) || A.l - B.l;
    });
    this.renderPalette();
  }

  // ── Oberfläche ──────────────────────────────────────────────────

  private buildUi(): void {
    const tools = TOOLS.map((t) => `<button type="button" data-tool="${t.id}" title="Taste ${t.taste}">${t.name} <span class="key">${t.taste}</span></button>`).join('');
    const templates = [
      ...this.content.bau.all().filter((d) => d.model && !d.model.startsWith(CUSTOM_PREFIX)).map((d) => ({ path: d.model!, name: d.name, gruppe: 'Bauteile' })),
      ...this.content.produkte.all().filter((p) => p.model).map((p) => ({ path: p.model!, name: p.name, gruppe: 'Produkte' })),
    ];
    const options = (g: string) => templates.filter((t) => t.gruppe === g).sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map((t) => `<option value="${esc(t.path)}">${esc(t.name)}</option>`).join('');
    this.ui.innerHTML = `
      <header class="editor-top panel">
        <b>Voxel-Editor</b>
        <input class="name" type="text" maxlength="40" aria-label="Name des Modells">
        <span class="spacer"></span>
        <button type="button" class="primary save">Speichern</button>
        <button type="button" class="back">Zurück zum Spiel</button>
      </header>
      <aside class="editor-left panel">
        <h4>Werkzeug</h4>
        <div class="tools">${tools}</div>
        <label class="check"><input type="checkbox" class="mirror"> Spiegeln (links/rechts) <span class="key">M</span></label>
        <div class="row"><button type="button" class="undo">↶ Rückgängig</button><button type="button" class="redo">↷ Wiederholen</button></div>
        <h4>Farbe</h4>
        <div class="current"><input type="color" class="picker" aria-label="Farbe wählen"><span class="hex"></span></div>
        <div class="palette"></div>
      </aside>
      <aside class="editor-right panel">
        <h4>Bauraum</h4>
        <div class="dims">
          <label>Breite (X)<input type="number" class="nx" min="1" max="${MAX_DIM}"></label>
          <label>Höhe (Y)<input type="number" class="ny" min="1" max="${MAX_DIM}"></label>
          <label>Tiefe (Z)<input type="number" class="nz" min="1" max="${MAX_DIM}"></label>
          <label>Würfel<select class="size">${SIZES.map((s) => `<option value="${s}">${(s * 100).toLocaleString('de-DE')} cm</option>`).join('')}</select></label>
        </div>
        <div class="row"><button type="button" class="apply-size">Übernehmen</button><button type="button" class="clear">Leeren</button></div>
        <h4>Vorlage aus dem Spiel</h4>
        <div class="row"><select class="template"><optgroup label="Bauteile">${options('Bauteile')}</optgroup><optgroup label="Produkte">${options('Produkte')}</optgroup></select>
          <button type="button" class="load-template">Laden</button></div>
        <h4>Im Spiel</h4>
        <div class="dims">
          <label>Art<select class="typ"><option value="deko">Dekoration</option><option value="regal">Regal (mit Ware)</option></select></label>
          <label>Preis (€)<input type="number" class="preis" min="0" step="10"></label>
          <label>Platz<select class="ebene"><option value="objekt">auf dem Boden</option><option value="decke">an der Decke</option><option value="anbau">an der Wand</option></select></label>
          <label class="regal-only">Stück pro Fach<input type="number" class="kapazitaet" min="1" max="200"></label>
        </div>
        <label class="check regal-only"><input type="checkbox" class="kuehlung"> gekühlt</label>
        <p class="hint regal-only shelf-info"></p>
        <div class="row"><button type="button" class="export">Exportieren</button><label class="button import">Importieren<input type="file" accept=".json,application/json" hidden></label></div>
        <h4>Meine Modelle</h4>
        <div class="library"></div>
      </aside>
      <footer class="editor-status panel"><span class="info"></span><span class="msg"></span>
        <span class="help"><span class="key">Linksklick</span>Werkzeug · Ziehen = Fläche <span class="key">Rechts ziehen</span>drehen <span class="key">Mitte</span>verschieben <span class="key">Rad</span>zoomen <span class="key">Alt</span>+Klick Farbe aufnehmen <span class="key">Strg+Z</span>zurück</span>
      </footer>`;
    const q = <T extends HTMLElement>(sel: string) => this.ui.querySelector(sel) as T;
    this.ui.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      if (b.dataset.tool) this.setTool(b.dataset.tool as Tool);
      else if (b.dataset.color) this.setColor(parseInt(b.dataset.color, 16));
      else if (b.dataset.open) { const m = allModels().find((x) => x.id === b.dataset.open); if (m) this.openModel(m); }
      else if (b.dataset.delete) this.deleteModel(b.dataset.delete);
      else if (b.classList.contains('undo')) this.undo();
      else if (b.classList.contains('redo')) this.undo(true);
      else if (b.classList.contains('save')) void this.save();
      else if (b.classList.contains('back')) { location.hash = ''; location.reload(); }
      else if (b.classList.contains('export')) this.exportFile();
      else if (b.classList.contains('clear')) this.resetGrid(new VoxelGrid(this.grid.size, [0, 0, 0], [...this.grid.dims]));
      else if (b.classList.contains('apply-size')) {
        const n = (c: string) => Math.max(1, Math.min(MAX_DIM, Math.round(Number(q<HTMLInputElement>(c).value) || 1)));
        this.resize3d([n('.nx'), n('.ny'), n('.nz')], Number(q<HTMLSelectElement>('.size').value));
      } else if (b.classList.contains('load-template')) {
        const sel = q<HTMLSelectElement>('.template');
        void this.loadTemplate(sel.value, sel.selectedOptions[0]?.textContent ?? '');
      }
    });
    this.ui.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.classList.contains('picker')) this.setColor(parseInt(t.value.slice(1), 16));
      if (t.classList.contains('name')) this.meta.name = t.value;
      if (t.classList.contains('preis')) this.meta.preis = Math.max(0, Number(t.value) || 0);
      if (t.classList.contains('kapazitaet')) this.meta.kapazitaet = Math.max(1, Math.round(Number(t.value) || 1));
    });
    this.ui.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.classList.contains('mirror')) this.setMirror(t.checked);
      if (t.classList.contains('typ')) { this.meta.typ = t.value as ModelType; this.renderForm(); }
      if (t.classList.contains('ebene')) this.meta.ebene = t.value as BuildLayer;
      if (t.classList.contains('kuehlung')) this.meta.kuehlung = t.checked;
      if (t.type === 'file' && t.files?.[0]) { void this.importFile(t.files[0]); t.value = ''; }
    });
    this.setTool('setzen');
    this.setColor(this.color);
    this.renderForm();
    this.renderLibrary();
  }

  private setTool(t: Tool): void {
    this.tool = t;
    this.ui.querySelectorAll<HTMLElement>('.tools button').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  }

  private setMirror(on: boolean): void {
    this.mirror = on;
    (this.ui.querySelector('.mirror') as HTMLInputElement).checked = on;
  }

  private setColor(rgb: number): void {
    this.color = rgb & 0xffffff;
    const hex = `#${this.color.toString(16).padStart(6, '0')}`;
    (this.ui.querySelector('.picker') as HTMLInputElement).value = hex;
    (this.ui.querySelector('.hex') as HTMLElement).textContent = hex;
    this.ui.querySelectorAll<HTMLElement>('.palette button').forEach((b) => b.classList.toggle('active', parseInt(b.dataset.color!, 16) === this.color));
  }

  private renderPalette(): void {
    (this.ui.querySelector('.palette') as HTMLElement).innerHTML = this.palette
      .map((c) => { const h = c.toString(16).padStart(6, '0'); return `<button type="button" data-color="${h}" style="background:#${h}" title="#${h}"></button>`; }).join('');
    this.setColor(this.color);
  }

  private renderForm(): void {
    const q = <T extends HTMLElement>(sel: string) => this.ui.querySelector(sel) as T;
    q<HTMLInputElement>('.name').value = this.meta.name;
    q<HTMLSelectElement>('.typ').value = this.meta.typ;
    q<HTMLInputElement>('.preis').value = String(this.meta.preis);
    q<HTMLSelectElement>('.ebene').value = this.meta.ebene;
    q<HTMLInputElement>('.kapazitaet').value = String(this.meta.kapazitaet);
    q<HTMLInputElement>('.kuehlung').checked = this.meta.kuehlung;
    q<HTMLInputElement>('.nx').value = String(this.grid.dims[0]);
    q<HTMLInputElement>('.ny').value = String(this.grid.dims[1]);
    q<HTMLInputElement>('.nz').value = String(this.grid.dims[2]);
    const size = q<HTMLSelectElement>('.size');
    if (![...size.options].some((o) => Number(o.value) === this.grid.size)) {
      size.insertAdjacentHTML('beforeend', `<option value="${this.grid.size}">${(this.grid.size * 100).toLocaleString('de-DE')} cm</option>`);
    }
    size.value = String(this.grid.size);
    this.ui.querySelectorAll<HTMLElement>('.regal-only').forEach((el) => { el.hidden = this.meta.typ !== 'regal'; });
    this.renderStatus();
  }

  private renderLibrary(): void {
    const list = allModels();
    (this.ui.querySelector('.library') as HTMLElement).innerHTML = list.length ? list.map((m) => `
      <div class="lib-item">${m.vorschau ? `<img src="${m.vorschau}" alt="">` : '<span class="noicon"></span>'}
        <span>${esc(m.name)}<small>${m.typ === 'regal' ? 'Regal' : 'Deko'} · ${m.groesse.join('×')}</small></span>
        <button type="button" data-open="${esc(m.id)}">Öffnen</button>
        <button type="button" data-delete="${esc(m.id)}" title="Löschen">✕</button></div>`).join('')
      : '<p class="hint">Noch keine eigenen Modelle.</p>';
  }

  private async deleteModel(id: string): Promise<void> {
    deleteFromBrowser(id);
    await deleteFromProject(id);
    if (this.meta.id === id) this.meta.id = null;
    this.renderLibrary();
    this.status('Modell gelöscht.');
  }

  private renderStatus(): void {
    const [nx, ny, nz] = this.grid.dims, s = this.grid.size;
    let flaechen = 0;
    for (const m of this.chunks.values()) flaechen += (m.geometry.index?.count ?? 0) / 6;
    const m = (v: number) => (v * s).toLocaleString('de-DE', { maximumFractionDigits: 2 });
    (this.ui.querySelector('.info') as HTMLElement).textContent =
      `${nx} × ${ny} × ${nz} Würfel · ${m(nx)} × ${m(ny)} × ${m(nz)} m · ${this.grid.count.toLocaleString('de-DE')} Würfel · ${flaechen.toLocaleString('de-DE')} Flächen`;
    if (this.meta.typ === 'regal') {
      const levels = detectShelfLevels(this.grid);
      (this.ui.querySelector('.shelf-info') as HTMLElement).textContent = levels.length
        ? `Erkannte Regalböden: ${levels.length} (Höhen ${levels.map((h) => h.toLocaleString('de-DE')).join(' / ')} m). Die Ware steht vorne (+X, grüner Pfeil).`
        : 'Noch keine Regalböden erkannt: Böden sind waagerechte Flächen mit Platz darüber.';
    }
  }

  private status(text: string): void {
    (this.ui.querySelector('.msg') as HTMLElement).textContent = text;
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
