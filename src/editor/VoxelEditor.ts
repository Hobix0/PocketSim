import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { readData } from '../core/Data';
import { Content } from '../content/Content';
import { ModelLibrary, type VoxelSettings } from '../assets/ModelLibrary';
import { VoxelGrid, FILLED } from '../voxel/VoxelGrid';
import { greedyMesh } from '../voxel/greedyMesh';
import { loadPixels } from '../voxel/pixels';
import { buildFigureGrid, lookFromSeed } from '../voxel/figure';
import { raycastGrid, type GridHit } from './raycastGrid';
import {
  CUSTOM_PREFIX, decodeGrid, defaultMenu, detectShelfLevels, encodeGrid, idFromName, placeInMenu, validateVoxelModel,
  type ModelType, type VoxelModelData,
} from './VoxelModel';
import { deleteFromProject, loadDraft, projectModels, saveDraft, saveToProject } from './ModelStore';
import {
  PRESETS, cellsBrush, cellsLine, cellsOfColor, cellsRect, crop, floodCells, mirror, mirrored, presetDims, resize, rotateY, shift,
  type Cell,
} from './gridOps';
import { esc } from '../ui/html';
import { renderThumbnail } from '../assets/thumbnail';

// Voxel-Editor – das Entwicklerwerkzeug zum Erstellen von Spielinhalten (nicht Teil des Spielens).
// Modelle werden ins Projekt gespeichert (data/modelle/<id>.json) und erscheinen im gewählten
// Reiter des Baumenüs. Bedienung: Linksklick = Werkzeug, Rechts ziehen = drehen, Mitte = verschieben,
// Mausrad = zoomen. Bearbeitet wird in Blöcken zu 16³ Würfeln (nur betroffene Blöcke werden neu gebaut).
// Die Bearbeitungs-Operationen selbst stehen ohne Grafik in gridOps.ts.

type Tool = 'setzen' | 'entfernen' | 'malen' | 'fuellen' | 'ersetzen' | 'pipette';
type Form = 'punkt' | 'linie' | 'rechteck';
type Change = { i: number; before: number; after: number };
type Step = { kind: 'zellen'; changes: Change[] } | { kind: 'gitter'; before: VoxelGrid; after: VoxelGrid };

const CHUNK = 16;
const MAX_DIM = 160;
const SIZES = [0.004, 0.01, 0.025, 0.05, 0.1];
const LAST_KEY = 'urbanevolution.editor.zuletzt';
const HELP_KEY = 'urbanevolution.editor.hilfe';
const TOOLS: { id: Tool; name: string; taste: string; hilfe: string }[] = [
  { id: 'setzen', name: 'Setzen', taste: '1', hilfe: 'Würfel auf die angeklickte Fläche setzen' },
  { id: 'entfernen', name: 'Entfernen', taste: '2', hilfe: 'Würfel entfernen' },
  { id: 'malen', name: 'Malen', taste: '3', hilfe: 'Vorhandene Würfel umfärben' },
  { id: 'fuellen', name: 'Füllen', taste: '4', hilfe: 'Zusammenhängende gleiche Farbe umfärben' },
  { id: 'ersetzen', name: 'Farbe ersetzen', taste: '5', hilfe: 'Diese Farbe überall im Modell ersetzen' },
  { id: 'pipette', name: 'Pipette', taste: '6', hilfe: 'Farbe aufnehmen (auch Alt + Klick)' },
];
const FORMS: { id: Form; name: string; taste: string }[] = [
  { id: 'punkt', name: 'Punkt', taste: 'P' },
  { id: 'linie', name: 'Linie', taste: 'L' },
  { id: 'rechteck', name: 'Rechteck', taste: 'R' },
];
const SHAPE_TOOLS: Tool[] = ['setzen', 'entfernen', 'malen'];
const MOVE_FAIL = 'Verschieben geht nicht: Würfel würden aus dem Bauraum fallen.';

interface Meta {
  id: string | null;
  name: string;
  typ: ModelType;
  menue: string;
  preis: number;
  kapazitaet: number;
  kuehlung: boolean;
}

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
  private readonly preview: THREE.InstancedMesh;
  private readonly previewMat = new THREE.MeshBasicMaterial({ color: '#5fd08a', transparent: true, opacity: 0.35, depthWrite: false });
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly ui: HTMLElement;
  private figure: THREE.Mesh | null = null;

  private grid: VoxelGrid;
  /** Gitter für Anzeige und Zeiger: bei aktivem Schnitt ohne die Schichten darüber */
  private view: VoxelGrid;
  private clip = Infinity;
  private tool: Tool = 'setzen';
  private form: Form = 'punkt';
  private brush = 1;
  private mirrorX = false;
  private mirrorZ = false;
  private color = 0xc0573e;
  private recent: number[] = [];
  private palette: number[] = [];
  private undoStack: Step[] = [];
  private redoStack: Step[] = [];
  private stroke: { start: Cell; axis: number; layer: number; tool: Tool; changes: Map<number, Change>; shape: Cell[] } | null = null;
  private pointerInside = false;
  private hoverCell: Cell | null = null;
  private draftTimer = 0;
  private meta: Meta = { id: null, name: 'Neues Modell', typ: 'deko', menue: 'deko', preis: 150, kapazitaet: 20, kuehlung: false };

  constructor(container: HTMLElement) {
    const voxel = readData<VoxelSettings>('voxel/standard');
    this.models = new ModelLibrary({ ...voxel, aktiv: true });
    this.grid = new VoxelGrid(0.025, [0, 0, 0], [40, 64, 40]);
    this.view = this.grid;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
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

    this.preview = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.previewMat, MAX_DIM * MAX_DIM);
    this.preview.count = 0;
    this.preview.renderOrder = 10;
    this.preview.frustumCulled = false;
    this.scene.add(this.preview);

    this.controls = new OrbitControls(this.camera, surface);
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.enableDamping = true;
    surface.addEventListener('contextmenu', (e) => e.preventDefault());

    this.ui = document.createElement('div');
    this.ui.className = 'editor';
    document.body.append(this.ui);
    this.buildUi();

    surface.addEventListener('pointermove', (e) => this.onPointer(e, 'move'));
    surface.addEventListener('pointerdown', (e) => this.onPointer(e, 'down'));
    window.addEventListener('pointerup', () => this.finishStroke());
    surface.addEventListener('pointerleave', () => { this.pointerInside = false; this.hoverCell = null; this.showPreview([]); this.renderStatus(); });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());

    void this.loadPalette();
    this.setGrid(this.grid, true);
    this.resize();

    // Nach dem Speichern lädt Vite die Seite neu (neue Datei in data/modelle): das Modell wieder öffnen
    const last = sessionGet(LAST_KEY);
    const found = last ? projectModels().find((m) => m.id === last) : undefined;
    const draft = loadDraft();
    if (found) this.openModel(found, `„${found.name}“ gespeichert in data/modelle/${found.id}.json.`);
    else if (draft) this.openModel(draft, 'Entwurf wiederhergestellt.');
    if (!storageFlag(HELP_KEY)) this.toggleHelp(true);
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      this.rebuildDirty();
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  // ── Gitter und Darstellung ──────────────────────────────────────

  /** Neues Gitter übernehmen (alles neu bauen). `fresh`: Verlauf leeren und Kamera einpassen. */
  private setGrid(grid: VoxelGrid, fresh: boolean): void {
    this.grid = grid;
    if (this.clip >= grid.dims[1]) this.clip = Infinity;
    this.rebuildView();
    if (fresh) { this.undoStack = []; this.redoStack = []; this.frameCamera(); }
    this.layoutHelpers();
    this.renderForm();
    this.renderUndo();
  }

  /** Anzeige-Gitter (mit Schnitt) neu aufbauen und alle Blöcke neu zeichnen. */
  private rebuildView(): void {
    if (Number.isFinite(this.clip)) {
      const v = new VoxelGrid(this.grid.size, [0, 0, 0], [...this.grid.dims]);
      const [, ny, nz] = this.grid.dims;
      for (let i = 0; i < v.data.length; i++) if (Math.floor(i / nz) % ny < this.clip) v.data[i] = this.grid.data[i];
      this.view = v;
    } else this.view = this.grid;
    for (const m of this.chunks.values()) { this.modelGroup.remove(m); m.geometry.dispose(); }
    this.chunks.clear();
    const [nx, ny, nz] = this.grid.dims;
    for (let x = 0; x < nx; x += CHUNK) for (let y = 0; y < ny; y += CHUNK) for (let z = 0; z < nz; z += CHUNK) this.dirty.add(`${x / CHUNK},${y / CHUNK},${z / CHUNK}`);
  }

  /** Lage im Raum: Ursprung unten in der Mitte, wie später im Spiel. */
  private get offset(): THREE.Vector3 {
    const s = this.grid.size, [nx, , nz] = this.grid.dims;
    return new THREE.Vector3(-Math.floor(nx / 2) * s, 0, -Math.floor(nz / 2) * s);
  }

  private layoutHelpers(): void {
    for (const c of this.helpers.children) disposeObject(c);
    this.helpers.clear();
    const s = this.grid.size, [nx, ny, nz] = this.grid.dims;
    const o = this.offset;
    this.modelGroup.position.copy(o);
    // Boden mit Raster (alle 4 Würfel eine Linie, alle 40 cm kräftiger) und Umriss des Bauraums
    const fine: number[] = [], strong: number[] = [];
    const step = Math.max(1, Math.round(0.4 / s));
    const every = Math.max(1, Math.round(0.1 / s / 4) * 4) || 4;
    for (let x = 0; x <= nx; x += every) (x % step === 0 ? strong : fine).push(x * s, 0, 0, x * s, 0, nz * s);
    for (let z = 0; z <= nz; z += every) (z % step === 0 ? strong : fine).push(0, 0, z * s, nx * s, 0, z * s);
    for (const [pts, color] of [[fine, '#47515a'], [strong, '#5f6b75']] as const) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
      lines.position.copy(o).setY(0.0005);
      this.helpers.add(lines);
    }
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(nx * s, ny * s, nz * s)), new THREE.LineBasicMaterial({ color: '#3d4750' }));
    box.position.set(o.x + (nx * s) / 2, (ny * s) / 2, o.z + (nz * s) / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(nx * s, nz * s), new THREE.MeshStandardMaterial({ color: '#39424a', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(o.x + (nx * s) / 2, -0.001, o.z + (nz * s) / 2);
    floor.receiveShadow = true;
    // Pfeil: vorne ist +X (dort ist bei Regalen die Ware, dorthin schauen Maschinen)
    const len = Math.max(0.15, nx * s * 0.4);
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(o.x + nx * s + 0.03, 0.01, 0), len, '#5fd08a', len * 0.3, len * 0.2);
    this.helpers.add(floor, box, arrow);
    // Schnitt-Ebene sichtbar machen
    if (Number.isFinite(this.clip)) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(nx * s, nz * s), new THREE.MeshBasicMaterial({ color: '#e0b23c', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(o.x + (nx * s) / 2, this.clip * s, o.z + (nz * s) / 2);
      this.helpers.add(plane);
    }
    this.updateFigure();
  }

  /** Figur als Maßstab: steht hinter dem Bauraum (von der Kamera aus), damit die Größe vergleichbar bleibt. */
  private updateFigure(): void {
    const show = (this.ui.querySelector('.figure') as HTMLInputElement | null)?.checked;
    if (!show) { if (this.figure) this.scene.remove(this.figure); return; }
    if (!this.figure) {
      const f = this.content.figuren;
      this.figure = new THREE.Mesh(greedyMesh(buildFigureGrid(lookFromSeed(f, 4), f.kantenlaenge)), this.material);
      this.figure.castShadow = true;
    }
    this.figure.position.set(0, 0, this.offset.z - 0.35);
    this.scene.add(this.figure);
  }

  private frameCamera(): void {
    const s = this.grid.size, [nx, ny, nz] = this.grid.dims;
    const r = Math.max(nx, ny, nz) * s;
    this.controls.target.set(0, (ny * s) / 3, 0);
    this.camera.position.set(r * 1.5, r * 1.1, r * 1.3);
    this.camera.near = r / 200;
    this.camera.far = r * 60;
    this.camera.updateProjectionMatrix();
    // Sofort übernehmen, damit Klicks vor dem nächsten Bild schon zur neuen Ansicht passen
    this.controls.update();
    this.camera.updateMatrixWorld();
  }

  private markDirty(x: number, y: number, z: number): void {
    for (const [dx, dy, dz] of [[0, 0, 0], [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]]) {
      const cx = Math.floor((x + dx) / CHUNK), cy = Math.floor((y + dy) / CHUNK), cz = Math.floor((z + dz) / CHUNK);
      if (cx >= 0 && cy >= 0 && cz >= 0) this.dirty.add(`${cx},${cy},${cz}`);
    }
  }

  private rebuildDirty(): void {
    if (!this.dirty.size) return;
    const [nx, ny, nz] = this.grid.dims;
    for (const key of this.dirty) {
      const [cx, cy, cz] = key.split(',').map(Number);
      const min: Cell = [cx * CHUNK, cy * CHUNK, cz * CHUNK];
      const old = this.chunks.get(key);
      if (old) { this.modelGroup.remove(old); old.geometry.dispose(); this.chunks.delete(key); }
      if (min[0] >= nx || min[1] >= ny || min[2] >= nz) continue;
      const max: Cell = [Math.min(nx, min[0] + CHUNK), Math.min(ny, min[1] + CHUNK), Math.min(nz, min[2] + CHUNK)];
      const geo = greedyMesh(this.view, { min, max });
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

  // ── Zeiger und Werkzeuge ────────────────────────────────────────

  private onPointer(e: PointerEvent, kind: 'move' | 'down'): void {
    this.pointerInside = true;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);

    // Ziehen bleibt in der Schicht, in der der Strich begonnen hat
    if (kind === 'move' && this.stroke) {
      if (!(e.buttons & 1)) { this.finishStroke(); return; }
      const cell = this.cellOnLayer(this.stroke.axis, this.stroke.layer);
      if (!cell) return;
      this.hoverCell = cell;
      if (this.form === 'punkt') {
        const cells = this.brushCells(cell, this.stroke.axis);
        this.paint(cells, this.stroke.tool);
        this.showPreview(cells);
      } else {
        this.stroke.shape = this.shapeCells(this.stroke.start, cell, this.stroke.axis);
        this.showPreview(this.stroke.shape);
      }
      this.renderStatus();
      return;
    }

    const hit = this.pick();
    const tool: Tool = e.altKey ? 'pipette' : this.tool;
    const target = hit ? this.targetCell(hit, tool) : null;
    this.hoverCell = hit && !hit.ground ? hit.cell : target;
    const axis = hit ? Math.max(0, hit.normal.findIndex((v) => v !== 0)) : 1;
    if (kind === 'move') {
      this.showPreview(!target ? [] : SHAPE_TOOLS.includes(tool) ? this.brushCells(target, axis) : [target], tool);
      this.renderStatus();
      return;
    }
    if (e.button !== 0 || !hit) return;
    if (tool === 'pipette') { if (!hit.ground) this.setColor(this.grid.get(...hit.cell), true); return; }
    if (tool === 'fuellen' || tool === 'ersetzen') {
      if (hit.ground) return;
      const cells = tool === 'fuellen' ? floodCells(this.grid, hit.cell) : cellsOfColor(this.grid, this.grid.get(...hit.cell));
      this.stroke = { start: hit.cell, axis, layer: 0, tool: 'malen', changes: new Map(), shape: [] };
      this.paint(cells, 'malen');
      this.finishStroke();
      return;
    }
    if (!target) return;
    this.stroke = { start: target, axis, layer: target[axis], tool, changes: new Map(), shape: [target] };
    if (this.form === 'punkt') this.paint(this.brushCells(target, axis), tool);
    else this.stroke.shape = this.shapeCells(target, target, axis);
  }

  private rayInGrid(): { origin: Cell; dir: Cell } {
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const s = this.grid.size, o = this.offset, ray = this.raycaster.ray;
    return {
      origin: [(ray.origin.x - o.x) / s, ray.origin.y / s, (ray.origin.z - o.z) / s],
      dir: [ray.direction.x, ray.direction.y, ray.direction.z],
    };
  }

  private pick(): GridHit | null {
    const { origin, dir } = this.rayInGrid();
    return raycastGrid(this.grid.dims, (x, y, z) => this.view.get(x, y, z) !== 0, origin, dir);
  }

  /** Zelle unter dem Zeiger in einer festen Schicht (Achse `axis` = `layer`) */
  private cellOnLayer(axis: number, layer: number): Cell | null {
    const { origin, dir } = this.rayInGrid();
    if (Math.abs(dir[axis]) < 1e-9) return null;
    const t = (layer + 0.5 - origin[axis]) / dir[axis];
    if (t < 0) return null;
    const cell = [0, 1, 2].map((i) => (i === axis ? layer : Math.floor(origin[i] + dir[i] * t))) as Cell;
    return cell.map((v, i) => Math.max(0, Math.min(this.grid.dims[i] - 1, v))) as Cell;
  }

  private targetCell(hit: GridHit, tool: Tool): Cell | null {
    if (tool === 'setzen') {
      const c = hit.cell.map((v, i) => v + hit.normal[i]) as Cell;
      return this.inside(c) ? c : null;
    }
    return hit.ground ? null : hit.cell;
  }

  private inside(c: Cell): boolean {
    return c.every((v, i) => v >= 0 && v < this.grid.dims[i]);
  }

  private brushCells(c: Cell, axis: number): Cell[] {
    return mirrored(cellsBrush(c, this.brush, axis), this.grid.dims, this.mirrorX, this.mirrorZ);
  }

  private shapeCells(a: Cell, b: Cell, axis: number): Cell[] {
    const cells = this.form === 'linie' ? cellsLine(a, b).flatMap((c) => cellsBrush(c, this.brush, axis)) : cellsRect(a, b, axis);
    return mirrored(cells, this.grid.dims, this.mirrorX, this.mirrorZ);
  }

  private showPreview(cells: Cell[], tool: Tool = this.stroke?.tool ?? this.tool): void {
    const s = this.grid.size, o = this.offset, m = new THREE.Matrix4();
    const shown = cells.filter((c) => this.inside(c));
    const n = Math.min(shown.length, MAX_DIM * MAX_DIM);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = shown[i];
      m.makeScale(s * 1.04, s * 1.04, s * 1.04).setPosition(o.x + (x + 0.5) * s, (y + 0.5) * s, o.z + (z + 0.5) * s);
      this.preview.setMatrixAt(i, m);
    }
    this.preview.count = this.pointerInside ? n : 0;
    this.preview.instanceMatrix.needsUpdate = true;
    this.previewMat.color.set(tool === 'entfernen' ? '#f08a7a' : tool === 'pipette' ? '#ffffff' : hex(this.color));
  }

  /** Werkzeug auf Zellen anwenden (Spiegelung ist schon enthalten). */
  private paint(cells: Cell[], tool: Tool): void {
    const value = this.color | FILLED;
    for (const c of cells) {
      if (!this.inside(c)) continue;
      const i = this.grid.index(...c);
      const before = this.grid.data[i];
      let after = before;
      if (tool === 'setzen' && before === 0) after = value;
      else if (tool === 'entfernen') after = 0;
      else if (tool === 'malen' && before !== 0) after = value;
      if (after !== before) this.write(c, i, before, after);
    }
  }

  private write(c: Cell, i: number, before: number, after: number): void {
    this.grid.data[i] = after;
    if (this.view !== this.grid && c[1] < this.clip) this.view.data[i] = after;
    const ch = this.stroke?.changes.get(i);
    if (ch) ch.after = after;
    else this.stroke?.changes.set(i, { i, before, after });
    this.markDirty(...c);
  }

  private finishStroke(): void {
    const st = this.stroke;
    if (!st) return;
    if (this.form !== 'punkt' && SHAPE_TOOLS.includes(st.tool)) this.paint(st.shape, st.tool);
    this.stroke = null;
    this.showPreview([]);
    const changes = [...st.changes.values()].filter((c) => c.before !== c.after);
    if (!changes.length) return;
    if (st.tool !== 'entfernen') this.useColor(this.color);
    this.pushStep({ kind: 'zellen', changes });
  }

  private pushStep(step: Step): void {
    this.undoStack.push(step);
    if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack = [];
    this.changed();
  }

  /** Ganzes Gitter ersetzen (Drehen, Spiegeln, Zuschneiden …) – rückgängig machbar. */
  private replaceGrid(next: VoxelGrid | null, label: string, failMsg?: string): void {
    if (!next) { if (failMsg) this.status(failMsg); return; }
    const before = this.grid;
    this.setGrid(next, false);
    this.pushStep({ kind: 'gitter', before, after: next });
    this.status(label);
  }

  private undo(redo = false): void {
    const step = (redo ? this.redoStack : this.undoStack).pop();
    if (!step) return;
    (redo ? this.undoStack : this.redoStack).push(step);
    if (step.kind === 'gitter') this.setGrid(redo ? step.after : step.before, false);
    else {
      const [, ny, nz] = this.grid.dims;
      for (const c of step.changes) {
        const v = redo ? c.after : c.before;
        this.grid.data[c.i] = v;
        const x = Math.floor(c.i / (ny * nz)), y = Math.floor(c.i / nz) % ny, z = c.i % nz;
        if (this.view !== this.grid && y < this.clip) this.view.data[c.i] = v;
        this.markDirty(x, y, z);
      }
    }
    this.changed();
  }

  /** Nach jeder Änderung: Anzeige aktualisieren und den Entwurf (verzögert) im Browser sichern. */
  private changed(): void {
    this.renderStatus();
    this.renderUndo();
    clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => { if (this.grid.count) saveDraft(this.modelData(false)); }, 1500);
  }

  private onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === 'z') { e.preventDefault(); this.undo(e.shiftKey); return; }
    if (ctrl && k === 'y') { e.preventDefault(); this.undo(true); return; }
    if (ctrl && k === 's') { e.preventDefault(); void this.save(); return; }
    if (ctrl || e.altKey) return;
    if (e.key === 'Escape') { this.toggleHelp(false); this.closeDialog(); return; }
    const t = TOOLS.find((x) => x.taste === e.key);
    if (t) this.setTool(t.id);
    const f = FORMS.find((x) => x.taste.toLowerCase() === k);
    if (f) this.setForm(f.id);
    if (e.key === '[') this.setBrush(this.brush - 1);
    if (e.key === ']') this.setBrush(this.brush + 1);
    if (k === 'm') this.setMirror(this.mirrorX, !this.mirrorZ);
    if (k === 'n') this.setMirror(!this.mirrorX, this.mirrorZ);
    if (k === 'd') this.replaceGrid(rotateY(this.grid), 'Modell gedreht (90°)');
    if (k === 'f') this.frameCamera();
    if (k === 'h' || e.key === '?') this.toggleHelp();
    const move: Record<string, Cell> = { arrowup: [1, 0, 0], arrowdown: [-1, 0, 0], arrowleft: [0, 0, -1], arrowright: [0, 0, 1], pageup: [0, 1, 0], pagedown: [0, -1, 0] };
    if (move[k]) { e.preventDefault(); this.replaceGrid(shift(this.grid, move[k]), 'Modell verschoben', MOVE_FAIL); }
  }

  // ── Modelle: neu, öffnen, Vorlage, speichern ────────────────────

  private newModel(dims: [number, number, number], size: number): void {
    this.meta = { ...this.meta, id: null, name: 'Neues Modell' };
    this.clip = Infinity;
    this.setGrid(new VoxelGrid(size, [0, 0, 0], dims), true);
    this.status(`Neues Modell: ${dims.join(' × ')} Würfel zu ${cm(size)}.`);
    this.changed();
  }

  private async loadTemplate(path: string, name: string): Promise<void> {
    this.status(`Lade ${name} …`);
    const src = await this.models.voxelGridOf(path).catch(() => null);
    if (!src) { this.status('Dieses Modell hat keine Würfel-Fassung.'); return; }
    let g = src;
    while (Math.max(...g.dims) > MAX_DIM) g = g.downsample(2);
    const out = new VoxelGrid(g.size, [0, 0, 0], [...g.dims]);
    out.data.set(g.data);
    this.meta = { ...this.meta, id: null, name: `${name} (Variante)` };
    this.clip = Infinity;
    this.setGrid(out, true);
    this.status(`${name} als Vorlage geladen – ${g.dims.join(' × ')} Würfel zu ${cm(g.size)}.`);
    this.changed();
  }

  private openModel(m: VoxelModelData, msg?: string): void {
    this.meta = { id: m.id, name: m.name, typ: m.typ, menue: m.menue, preis: m.preis, kapazitaet: m.regal?.kapazitaet ?? 20, kuehlung: m.regal?.kuehlung ?? false };
    this.clip = Infinity;
    this.setGrid(decodeGrid(m), true);
    this.status(msg ?? `„${m.name}“ geöffnet.`);
  }

  /** Datei-Inhalt aus dem aktuellen Stand (zugeschnitten auf den Inhalt). */
  private modelData(withPreview: boolean): VoxelModelData {
    const ebene = this.meta.typ === 'modell' ? 'objekt' : placeInMenu(this.meta.menue, this.content.baumenue.kategorien, 'objekt').ebene;
    // Stehende Modelle bleiben auf dem Boden; Deckenmodelle werden auch unten zugeschnitten
    const g = crop(this.grid, ebene !== 'decke') ?? this.grid;
    const { palette, voxel } = encodeGrid(g);
    return {
      id: this.meta.id ?? this.uniqueId(), name: this.meta.name.trim() || 'Modell', typ: this.meta.typ, menue: this.meta.menue,
      preis: this.meta.preis, ebene, kantenlaenge: g.size, groesse: [...g.dims], palette, voxel,
      regal: this.meta.typ === 'regal' ? { kapazitaet: this.meta.kapazitaet, kuehlung: this.meta.kuehlung } : undefined,
      vorschau: withPreview ? this.thumbnail() : undefined,
    };
  }

  /** id aus dem Namen, die weder ein Bauteil noch ein anderes Modell schon hat */
  private uniqueId(): string {
    const base = idFromName(this.meta.name);
    const taken = new Set([...this.content.bau.all().map((d) => d.id), ...projectModels().map((m) => m.id)]);
    let id = base, n = 2;
    while (taken.has(id)) id = `${base}_${n++}`;
    return id;
  }

  private async save(): Promise<void> {
    if (!this.grid.count) { this.status('Das Modell ist leer.'); return; }
    const m = this.modelData(true);
    this.meta.id = m.id;
    saveDraft(m);
    // Vor dem Speichern merken: Vite lädt die Seite neu, sobald die Datei in data/modelle liegt
    sessionSet(LAST_KEY, m.id);
    const datei = await saveToProject(m);
    if (datei) this.status(`Gespeichert in ${datei}.`);
    else {
      sessionSet(LAST_KEY, null);
      this.status('Speichern ins Projekt geht nur mit dem Entwicklungsserver (npm run dev). Hier: „Exportieren“ und die Datei nach data/modelle legen.');
    }
    this.renderLibrary();
  }

  private exportFile(): void {
    if (!this.grid.count) { this.status('Das Modell ist leer.'); return; }
    const m = this.modelData(true);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' }));
    a.download = `${m.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.status(`${m.id}.json exportiert – nach data/modelle/ legen, dann gehört das Modell zum Spiel.`);
  }

  private async importFile(file: File): Promise<void> {
    try {
      this.openModel(validateVoxelModel(JSON.parse(await file.text()), file.name), `${file.name} importiert.`);
      this.changed();
    } catch (err) {
      this.status(`Import fehlgeschlagen: ${String(err)}`);
    }
  }

  private async deleteModel(id: string): Promise<void> {
    const m = projectModels().find((x) => x.id === id);
    if (!m || !confirm(`„${m.name}“ aus dem Projekt löschen (data/modelle/${id}.json)?`)) return;
    if (await deleteFromProject(id)) {
      if (this.meta.id === id) this.meta.id = null;
      this.status('Gelöscht.');
    } else this.status('Löschen geht nur mit dem Entwicklungsserver.');
    this.renderLibrary();
  }

  /** Vorschaubild für das Baumenü: das ganze Modell (ohne Schnitt) schräg von vorne. */
  private thumbnail(): string {
    return renderThumbnail(this.grid);
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
      if (bin) bin.n++; else bins.set(key, { n: 1, rgb: (r << 16) | (g << 8) | b });
    }
    const hsl = (c: number) => new THREE.Color().setHex(c).getHSL({ h: 0, s: 0, l: 0 });
    this.palette = [...bins.values()].sort((a, b) => b.n - a.n).slice(0, 96).map((b) => b.rgb).sort((a, b) => {
      const A = hsl(a), B = hsl(b);
      const grayA = A.s < 0.12, grayB = B.s < 0.12;
      if (grayA !== grayB) return grayA ? 1 : -1;
      return grayA ? A.l - B.l : Math.round(A.h * 12) - Math.round(B.h * 12) || A.l - B.l;
    });
    this.renderPalette();
  }

  // ── Oberfläche ──────────────────────────────────────────────────

  private q<T extends HTMLElement>(sel: string): T {
    return this.ui.querySelector(sel) as T;
  }

  private buildUi(): void {
    const tools = TOOLS.map((t) => `<button type="button" data-tool="${t.id}" title="${esc(t.hilfe)} (Taste ${t.taste})">${t.name}<span class="key">${t.taste}</span></button>`).join('');
    const forms = FORMS.map((f) => `<button type="button" data-form="${f.id}" title="Taste ${f.taste}">${f.name}</button>`).join('');
    const templates = [
      ...this.content.bau.all().filter((d) => d.model && !d.model.startsWith(CUSTOM_PREFIX)).map((d) => ({ path: d.model!, name: d.name, gruppe: 'Bauteile' })),
      ...this.content.produkte.all().filter((p) => p.model).map((p) => ({ path: p.model!, name: p.name, gruppe: 'Produkte' })),
    ];
    const options = (g: string) => templates.filter((t) => t.gruppe === g).sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map((t) => `<option value="${esc(t.path)}">${esc(t.name)}</option>`).join('');
    const menus = this.content.baumenue.kategorien.filter((k) => !k.spezial).map((k) => `<option value="${esc(k.id)}">${esc(k.name)}</option>`).join('');
    this.ui.innerHTML = `
      <header class="editor-top panel">
        <b>Voxel-Editor</b><small class="dev">Entwicklerwerkzeug</small>
        <input class="name" type="text" maxlength="40" aria-label="Name des Modells">
        <button type="button" data-action="neu">Neu …</button>
        <span class="spacer"></span>
        <button type="button" data-action="hilfe" title="Taste H">? Hilfe</button>
        <button type="button" class="primary" data-action="speichern" title="Strg+S">Speichern</button>
        <button type="button" data-action="zurueck">Zum Spiel</button>
      </header>
      <aside class="editor-left panel">
        <h4>Werkzeug</h4>
        <div class="tools">${tools}</div>
        <h4>Form</h4>
        <div class="forms seg">${forms}</div>
        <div class="row brush"><span>Pinsel</span><button type="button" data-brush="-1" aria-label="kleiner" title="Taste [">−</button><b class="brush-size">1</b><button type="button" data-brush="1" aria-label="größer" title="Taste ]">+</button></div>
        <h4>Spiegeln beim Zeichnen</h4>
        <div class="seg"><button type="button" data-mirror="z" title="Taste M">links/rechts</button><button type="button" data-mirror="x" title="Taste N">vorne/hinten</button></div>
        <div class="row"><button type="button" class="undo" title="Strg+Z">↶ Rückgängig</button><button type="button" class="redo" title="Strg+Y">↷ Wiederholen</button></div>
        <h4>Farbe</h4>
        <div class="current"><input type="color" class="picker" aria-label="Farbe wählen"><span class="hex"></span></div>
        <small class="sub">Zuletzt benutzt</small>
        <div class="recent"></div>
        <small class="sub">Palette der Spielmodelle</small>
        <div class="palette"></div>
      </aside>
      <aside class="editor-right panel">
        <details open><summary>Im Spiel</summary>
          <div class="dims">
            <label>Art<select class="typ"><option value="deko">Dekoration</option><option value="regal">Regal (mit Ware)</option><option value="modell">Nur Modell (für data/bau)</option></select></label>
            <label class="not-model">Reiter im Baumenü<select class="menue">${menus}</select></label>
            <label class="not-model">Preis (€)<input type="number" class="preis" min="0" step="10"></label>
            <label class="regal-only">Stück pro Fach<input type="number" class="kapazitaet" min="1" max="200"></label>
          </div>
          <label class="check regal-only"><input type="checkbox" class="kuehlung"> gekühlt</label>
          <p class="hint place-info"></p>
          <p class="hint regal-only shelf-info"></p>
        </details>
        <details open><summary>Modell</summary>
          <div class="dims">
            <label>Breite X<input type="number" class="nx" min="1" max="${MAX_DIM}"></label>
            <label>Höhe Y<input type="number" class="ny" min="1" max="${MAX_DIM}"></label>
            <label>Tiefe Z<input type="number" class="nz" min="1" max="${MAX_DIM}"></label>
            <label>Würfel<select class="size">${SIZES.map((s) => `<option value="${s}">${cm(s)}</option>`).join('')}</select></label>
          </div>
          <p class="hint meters"></p>
          <div class="row"><button type="button" data-action="groesse">Bauraum übernehmen</button><button type="button" data-action="zuschneiden" title="Leere Ränder entfernen">Zuschneiden</button></div>
          <div class="row"><button type="button" data-action="drehen" title="Taste D">⟳ Drehen</button><button type="button" data-action="spiegeln-x">⇅ Spiegeln X</button><button type="button" data-action="spiegeln-z">⇋ Spiegeln Z</button></div>
          <div class="row move"><span>Verschieben</span>
            <button type="button" data-move="1,0,0" title="Pfeil hoch">+X</button><button type="button" data-move="-1,0,0" title="Pfeil runter">−X</button>
            <button type="button" data-move="0,0,1" title="Pfeil rechts">+Z</button><button type="button" data-move="0,0,-1" title="Pfeil links">−Z</button>
            <button type="button" data-move="0,1,0" title="Bild hoch">+Y</button><button type="button" data-move="0,-1,0" title="Bild runter">−Y</button></div>
        </details>
        <details open><summary>Ansicht</summary>
          <label class="slider">Schnitt bis Höhe <b class="clip-value">alles</b><input type="range" class="clip" min="1" step="1"></label>
          <label class="check"><input type="checkbox" class="figure"> Figur als Maßstab zeigen</label>
          <button type="button" data-action="einpassen" title="Taste F">Kamera einpassen</button>
        </details>
        <details><summary>Vorlage aus dem Spiel</summary>
          <div class="row"><select class="template"><optgroup label="Bauteile">${options('Bauteile')}</optgroup><optgroup label="Produkte">${options('Produkte')}</optgroup></select>
            <button type="button" data-action="vorlage">Laden</button></div>
        </details>
        <details open><summary>Modelle im Projekt</summary>
          <div class="row"><button type="button" data-action="export">Exportieren</button><label class="button">Importieren<input type="file" accept=".json,application/json" hidden></label></div>
          <div class="library"></div>
        </details>
      </aside>
      <footer class="editor-status panel"><span class="stats"></span><span class="cursor"></span><span class="msg"></span></footer>
      <div class="editor-help panel" hidden></div>
      <div class="editor-dialog" hidden></div>`;
    this.ui.addEventListener('click', (e) => this.onClick(e));
    this.ui.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.classList.contains('picker')) this.setColor(parseInt(t.value.slice(1), 16));
      else if (t.classList.contains('name')) { this.meta.name = t.value; this.changed(); }
      else if (t.classList.contains('preis')) this.meta.preis = Math.max(0, Number(t.value) || 0);
      else if (t.classList.contains('kapazitaet')) this.meta.kapazitaet = Math.max(1, Math.round(Number(t.value) || 1));
      else if (t.classList.contains('clip')) this.setClip(Number(t.value));
      else if (['nx', 'ny', 'nz'].some((c) => t.classList.contains(c))) this.renderMeters();
    });
    this.ui.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.classList.contains('typ')) {
        this.meta.typ = t.value as ModelType;
        if (this.meta.typ === 'regal' && this.meta.menue === defaultMenu('deko')) this.meta.menue = defaultMenu('regal');
        this.renderForm();
      } else if (t.classList.contains('menue')) { this.meta.menue = t.value; this.renderForm(); }
      else if (t.classList.contains('kuehlung')) this.meta.kuehlung = t.checked;
      else if (t.classList.contains('figure')) this.updateFigure();
      else if (t.classList.contains('size')) this.renderMeters();
      else if (t.type === 'file' && t.files?.[0]) { void this.importFile(t.files[0]); t.value = ''; }
    });
    this.ui.querySelector('.editor-dialog')!.addEventListener('click', (e) => { if (e.target === e.currentTarget) this.closeDialog(); });
    this.setTool('setzen');
    this.setForm('punkt');
    this.setColor(this.color);
    this.renderLibrary();
  }

  private onClick(e: MouseEvent): void {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    b.blur();
    const d = b.dataset, a = d.action;
    if (d.tool) this.setTool(d.tool as Tool);
    else if (d.form) this.setForm(d.form as Form);
    else if (d.brush) this.setBrush(this.brush + Number(d.brush));
    else if (d.mirror) this.setMirror(d.mirror === 'x' ? !this.mirrorX : this.mirrorX, d.mirror === 'z' ? !this.mirrorZ : this.mirrorZ);
    else if (d.color) this.setColor(parseInt(d.color, 16));
    else if (d.open) { const m = projectModels().find((x) => x.id === d.open); if (m) this.openModel(m); }
    else if (d.delete) void this.deleteModel(d.delete);
    else if (d.move) this.replaceGrid(shift(this.grid, d.move.split(',').map(Number) as Cell), 'Modell verschoben', MOVE_FAIL);
    else if (d.preset) { const p = PRESETS[Number(d.preset)]; this.closeDialog(); this.newModel(presetDims(p), p.size); }
    else if (b.classList.contains('undo')) this.undo();
    else if (b.classList.contains('redo')) this.undo(true);
    else if (a === 'neu') this.openNewDialog();
    else if (a === 'neu-leer') { this.closeDialog(); this.newModel([...this.grid.dims], this.grid.size); }
    else if (a === 'dialog-zu') this.closeDialog();
    else if (a === 'hilfe') this.toggleHelp();
    else if (a === 'hilfe-zu') this.toggleHelp(false);
    else if (a === 'speichern') void this.save();
    else if (a === 'zurueck') { location.hash = ''; location.reload(); }
    else if (a === 'export') this.exportFile();
    else if (a === 'einpassen') this.frameCamera();
    else if (a === 'drehen') this.replaceGrid(rotateY(this.grid), 'Modell gedreht (90°)');
    else if (a === 'spiegeln-x') this.replaceGrid(mirror(this.grid, 0), 'Modell gespiegelt (vorne/hinten)');
    else if (a === 'spiegeln-z') this.replaceGrid(mirror(this.grid, 2), 'Modell gespiegelt (links/rechts)');
    else if (a === 'zuschneiden') this.replaceGrid(crop(this.grid), 'Auf den Inhalt zugeschnitten', 'Das Modell ist leer.');
    else if (a === 'groesse') {
      const n = (c: string) => Math.max(1, Math.min(MAX_DIM, Math.round(Number(this.q<HTMLInputElement>(c).value) || 1)));
      this.replaceGrid(resize(this.grid, [n('.nx'), n('.ny'), n('.nz')], Number(this.q<HTMLSelectElement>('.size').value)), 'Bauraum geändert');
    } else if (a === 'vorlage') {
      const sel = this.q<HTMLSelectElement>('.template');
      void this.loadTemplate(sel.value, sel.selectedOptions[0]?.textContent ?? '');
    }
  }

  private setTool(t: Tool): void {
    this.tool = t;
    this.ui.querySelectorAll<HTMLElement>('.tools button').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    const shapes = SHAPE_TOOLS.includes(t);
    this.ui.querySelectorAll<HTMLButtonElement>('.forms button, .brush button').forEach((b) => { b.disabled = !shapes; });
  }

  private setForm(f: Form): void {
    this.form = f;
    this.ui.querySelectorAll<HTMLElement>('.forms button').forEach((b) => b.classList.toggle('active', b.dataset.form === f));
  }

  private setBrush(n: number): void {
    this.brush = Math.max(1, Math.min(5, n));
    this.q('.brush-size').textContent = String(this.brush);
  }

  private setMirror(x: boolean, z: boolean): void {
    this.mirrorX = x;
    this.mirrorZ = z;
    this.ui.querySelectorAll<HTMLElement>('[data-mirror]').forEach((b) => b.classList.toggle('active', b.dataset.mirror === 'x' ? x : z));
  }

  private setClip(v: number): void {
    const ny = this.grid.dims[1];
    this.clip = v >= ny ? Infinity : Math.max(1, v);
    this.q('.clip-value').textContent = Number.isFinite(this.clip) ? `${this.clip} von ${ny}` : 'alles';
    this.rebuildView();
    this.layoutHelpers();
  }

  private setColor(rgb: number, picked = false): void {
    this.color = rgb & 0xffffff;
    this.q<HTMLInputElement>('.picker').value = hex(this.color);
    this.q('.hex').textContent = hex(this.color);
    this.ui.querySelectorAll<HTMLElement>('.palette button, .recent button').forEach((b) => b.classList.toggle('active', parseInt(b.dataset.color!, 16) === this.color));
    if (picked) { this.useColor(this.color); this.status(`Farbe ${hex(this.color)} aufgenommen.`); }
  }

  /** Zuletzt benutzte Farben (vorne die neueste) */
  private useColor(rgb: number): void {
    this.recent = [rgb, ...this.recent.filter((c) => c !== rgb)].slice(0, 10);
    this.q('.recent').innerHTML = swatches(this.recent);
    this.setColor(this.color);
  }

  private renderPalette(): void {
    this.q('.palette').innerHTML = swatches(this.palette);
    this.setColor(this.color);
  }

  private renderForm(): void {
    const q = this.q.bind(this);
    q<HTMLInputElement>('.name').value = this.meta.name;
    q<HTMLSelectElement>('.typ').value = this.meta.typ;
    q<HTMLSelectElement>('.menue').value = this.meta.menue;
    q<HTMLInputElement>('.preis').value = String(this.meta.preis);
    q<HTMLInputElement>('.kapazitaet').value = String(this.meta.kapazitaet);
    q<HTMLInputElement>('.kuehlung').checked = this.meta.kuehlung;
    q<HTMLInputElement>('.nx').value = String(this.grid.dims[0]);
    q<HTMLInputElement>('.ny').value = String(this.grid.dims[1]);
    q<HTMLInputElement>('.nz').value = String(this.grid.dims[2]);
    const size = q<HTMLSelectElement>('.size');
    if (![...size.options].some((o) => Number(o.value) === this.grid.size)) size.insertAdjacentHTML('beforeend', `<option value="${this.grid.size}">${cm(this.grid.size)}</option>`);
    size.value = String(this.grid.size);
    const clip = q<HTMLInputElement>('.clip');
    clip.max = String(this.grid.dims[1]);
    clip.value = String(Number.isFinite(this.clip) ? this.clip : this.grid.dims[1]);
    q('.clip-value').textContent = Number.isFinite(this.clip) ? `${this.clip} von ${this.grid.dims[1]}` : 'alles';
    this.ui.querySelectorAll<HTMLElement>('.regal-only').forEach((el) => { el.hidden = this.meta.typ !== 'regal'; });
    this.ui.querySelectorAll<HTMLElement>('.not-model').forEach((el) => { el.hidden = this.meta.typ === 'modell'; });
    const ebene = placeInMenu(this.meta.menue, this.content.baumenue.kategorien, 'objekt').ebene;
    const wie: Record<string, string> = { objekt: 'steht auf dem Boden', decke: 'hängt von der Decke (Ursprung oben)', wand: 'ist ein Wandmodul', anbau: 'hängt an einer Wand', boden: 'ist ein Bodenbelag' };
    const tab = this.content.baumenue.kategorien.find((k) => k.id === this.meta.menue)?.name ?? this.meta.menue;
    q('.place-info').textContent = this.meta.typ === 'modell'
      ? `Erscheint nicht selbst im Baumenü. In data/bau als "model": "${CUSTOM_PREFIX}${this.meta.id ?? '<id>'}" verwenden.`
      : `Erscheint im Reiter „${tab}“ und ${wie[ebene] ?? ebene}. Vorne ist +X (grüner Pfeil).`;
    this.renderMeters();
    this.renderStatus();
  }

  private renderMeters(): void {
    const s = Number(this.q<HTMLSelectElement>('.size').value) || this.grid.size;
    const m = (c: string) => meters((Number(this.q<HTMLInputElement>(c).value) || 0) * s);
    this.q('.meters').textContent = `= ${m('.nx')} × ${m('.ny')} × ${m('.nz')} m`;
  }

  private renderLibrary(): void {
    const list = projectModels();
    const label: Record<ModelType, string> = { deko: 'Deko', regal: 'Regal', modell: 'Modell' };
    const tabName = (id: string) => this.content.baumenue.kategorien.find((k) => k.id === id)?.name ?? id;
    this.q('.library').innerHTML = list.length ? list.map((m) => `
      <div class="lib-item${m.id === this.meta.id ? ' current' : ''}">${m.vorschau ? `<img src="${m.vorschau}" alt="">` : '<span class="noicon"></span>'}
        <span>${esc(m.name)}<small>${label[m.typ]}${m.typ === 'modell' ? '' : ` · ${esc(tabName(m.menue))}`} · ${m.groesse.join('×')}</small></span>
        <button type="button" data-open="${esc(m.id)}">Öffnen</button>
        ${import.meta.env.DEV ? `<button type="button" data-delete="${esc(m.id)}" title="Aus dem Projekt löschen" aria-label="Löschen">✕</button>` : ''}</div>`).join('')
      : '<p class="hint">Noch keine Modelle in data/modelle.</p>';
  }

  private renderUndo(): void {
    this.q<HTMLButtonElement>('.undo').disabled = !this.undoStack.length;
    this.q<HTMLButtonElement>('.redo').disabled = !this.redoStack.length;
  }

  private renderStatus(): void {
    const [nx, ny, nz] = this.grid.dims, s = this.grid.size;
    let flaechen = 0;
    for (const m of this.chunks.values()) flaechen += (m.geometry.index?.count ?? 0) / 6;
    this.q('.stats').textContent =
      `${nx} × ${ny} × ${nz} Würfel (${meters(nx * s)} × ${meters(ny * s)} × ${meters(nz * s)} m) · ${this.grid.count.toLocaleString('de-DE')} Würfel · ${flaechen.toLocaleString('de-DE')} Flächen`;
    const c = this.hoverCell;
    const v = c && this.inside(c) ? this.grid.get(...c) : 0;
    this.q('.cursor').innerHTML = c
      ? `x ${c[0]} · y ${c[1]} · z ${c[2]}${v ? ` · <i style="background:${hex(v)}"></i>${hex(v)}` : ''}` : '';
    if (this.meta.typ === 'regal') {
      const levels = detectShelfLevels(this.grid);
      this.q('.shelf-info').textContent = levels.length
        ? `Erkannte Regalböden: ${levels.length} (Höhen ${levels.map(meters).join(' / ')} m) – dort steht später die Ware.`
        : 'Noch keine Regalböden erkannt: Böden sind waagerechte Flächen mit mindestens 12 cm Platz darüber.';
    }
  }

  private openNewDialog(): void {
    const d = this.q('.editor-dialog');
    d.innerHTML = `<div class="panel dialog-card">
      <h3>Neues Modell</h3>
      <p class="hint">Größe wählen – sie lässt sich später unter „Modell“ ändern. Das offene Modell bleibt im Projekt, wenn es gespeichert ist.</p>
      <div class="presets">${PRESETS.map((p, i) => `<button type="button" data-preset="${i}"><b>${esc(p.name)}</b><small>${presetDims(p).join(' × ')} Würfel zu ${cm(p.size)}</small></button>`).join('')}</div>
      <div class="row"><button type="button" data-action="neu-leer">Leer mit aktueller Größe</button><span class="spacer"></span><button type="button" data-action="dialog-zu">Abbrechen</button></div>
    </div>`;
    d.hidden = false;
  }

  private closeDialog(): void {
    this.q('.editor-dialog').hidden = true;
  }

  private toggleHelp(force?: boolean): void {
    const h = this.q('.editor-help');
    const show = force ?? h.hidden;
    if (show) {
      const key = (k: string) => `<span class="key">${k}</span>`;
      const row = (k: string, t: string) => `<div><span class="keys">${k}</span><span>${t}</span></div>`;
      h.innerHTML = `<header><h3>So funktioniert der Editor</h3><button type="button" data-action="hilfe-zu" aria-label="Schließen">✕</button></header>
        <p class="hint">Der Editor ist ein Entwicklerwerkzeug: Modelle landen im Projekt (data/modelle) und erscheinen im gewählten Reiter des Baumenüs.</p>
        <div class="help-grid">
          ${row(key('Linksklick'), 'Werkzeug anwenden – gedrückt halten und ziehen bleibt in derselben Schicht')}
          ${row(key('Rechts ziehen'), 'Ansicht drehen')}
          ${row(`${key('Mitte ziehen')} ${key('Rad')}`, 'verschieben · zoomen')}
          ${row(TOOLS.map((t) => key(t.taste)).join(''), TOOLS.map((t) => t.name).join(' · '))}
          ${row(FORMS.map((f) => key(f.taste)).join(''), 'Form: Punkt · Linie · Rechteck (mit Vorschau beim Ziehen)')}
          ${row(key('[') + key(']'), 'Pinsel kleiner · größer (1–5)')}
          ${row(key('M') + key('N'), 'Beim Zeichnen spiegeln: links/rechts · vorne/hinten')}
          ${row(`${key('Alt')} + Klick`, 'Farbe aufnehmen')}
          ${row(key('D'), 'Modell um 90° drehen')}
          ${row(`${key('Pfeile')} ${key('Bild ↑↓')}`, 'Modell verschieben (X/Z · Y)')}
          ${row(key('F'), 'Kamera einpassen')}
          ${row(key('Strg+Z') + key('Strg+Y'), 'Rückgängig · Wiederholen')}
          ${row(key('Strg+S'), 'Speichern ins Projekt')}
          ${row(key('H'), 'Diese Hilfe')}
        </div>
        <p class="hint">Tipp: Mit „Schnitt bis Höhe“ blendest du obere Schichten aus und baust im Inneren weiter. Die Figur zeigt, wie groß das Modell im Spiel ist.</p>`;
      try { localStorage.setItem(HELP_KEY, '1'); } catch { /* egal */ }
    }
    h.hidden = !show;
  }

  private status(text: string): void {
    this.q('.msg').textContent = text;
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

function hex(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;
}

function swatches(colors: number[]): string {
  return colors.map((c) => { const h = hex(c); return `<button type="button" data-color="${h.slice(1)}" style="background:${h}" title="${h}"></button>`; }).join('');
}

function cm(size: number): string {
  return `${(size * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} cm`;
}

function meters(v: number): string {
  return v.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

function disposeObject(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
  });
}

function storageFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1'; } catch { return true; }
}

function sessionGet(key: string): string | null {
  try { const v = sessionStorage.getItem(key); sessionStorage.removeItem(key); return v; } catch { return null; }
}

function sessionSet(key: string, value: string | null): void {
  try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch { /* egal */ }
}
