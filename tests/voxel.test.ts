import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VoxelGrid, cellKey, keyToCell } from '../src/voxel/VoxelGrid';
import { voxelize } from '../src/voxel/voxelize';
import { greedyMesh } from '../src/voxel/greedyMesh';
import { buildFigureGrid, lookFromSeed } from '../src/voxel/figure';
import { voxelSize, voxelStufen, type VoxelSettings } from '../src/assets/ModelLibrary';
import { readData } from '../src/core/Data';

// Voxel-System: Gitter, Umrechnung aus Dreiecken, zusammengefasste Flächen, Figuren.

const quads = (g: THREE.BufferGeometry) => g.index!.count / 6;

function cube(n: number, color: (x: number, y: number, z: number) => number): VoxelGrid {
  const cells = new Map<number, number>();
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) cells.set(cellKey(x, y, z), color(x, y, z));
  return VoxelGrid.fromCells(0.1, cells)!;
}

describe('Gitter', () => {
  it('Schlüssel funktionieren auch für negative Zellen (Leuchten hängen nach unten)', () => {
    expect(keyToCell(cellKey(-7, -120, 33))).toEqual([-7, -120, 33]);
  });

  it('baut ein passend großes Feld und unterscheidet Schwarz von leer', () => {
    const cells = new Map([[cellKey(-1, 0, 0), 0x000000], [cellKey(1, 2, 0), 0xff0000]]);
    const g = VoxelGrid.fromCells(0.1, cells)!;
    expect(g.min).toEqual([-1, 0, 0]);
    expect(g.dims).toEqual([3, 3, 1]);
    expect(g.count).toBe(2);
    expect(g.get(0, 0, 0)).not.toBe(0);
  });
});

describe('Detailstufen', () => {
  it('fasst 2×2×2 Würfel zusammen, die häufigste Farbe gewinnt', () => {
    // 4×4×4: unten (y 0–1) rot, oben blau, ein einzelner grüner Würfel unten
    const cells = new Map<number, number>();
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) cells.set(cellKey(x, y, z), y < 2 ? 0xff0000 : 0x0000ff);
    cells.set(cellKey(0, 0, 0), 0x00ff00);
    const fine = VoxelGrid.fromCells(0.1, cells)!;
    const coarse = fine.downsample(2);
    expect(coarse.size).toBeCloseTo(0.2);
    expect(coarse.dims).toEqual([2, 2, 2]);
    expect(coarse.get(0, 0, 0) & 0xffffff).toBe(0xff0000);
    expect(coarse.get(1, 1, 1) & 0xffffff).toBe(0x0000ff);
    expect(quads(greedyMesh(coarse))).toBe(10);
  });

  it('auch Teile mit negativen Zellen (unter dem Ursprung) bleiben an ihrer Stelle', () => {
    const cells = new Map([[cellKey(-3, -5, 0), 0xffffff]]);
    const coarse = VoxelGrid.fromCells(0.1, cells)!.downsample(4);
    expect(coarse.min).toEqual([-1, -2, 0]);
    expect(coarse.count).toBe(1);
  });
});

describe('Greedy Meshing', () => {
  it('ein einfarbiger Würfel aus 4×4×4 Voxeln wird zu 6 Rechtecken', () => {
    const geo = greedyMesh(cube(4, () => 0x336699));
    expect(quads(geo)).toBe(6);
    const box = geo.boundingBox!;
    expect(box.min.toArray()).toEqual([0, 0, 0]);
    expect(box.max.x).toBeCloseTo(0.4);
  });

  it('Farbwechsel teilen die Flächen, innen entstehen keine Flächen', () => {
    // Untere Hälfte rot, obere blau: je 4 Seiten doppelt, Boden und Deckel einfach
    const geo = greedyMesh(cube(4, (_x, y) => (y < 2 ? 0xff0000 : 0x0000ff)));
    expect(quads(geo)).toBe(10);
  });

  it('Flächen zeigen nach außen', () => {
    const geo = greedyMesh(cube(2, () => 0xffffff));
    const p = geo.attributes.position, n = geo.attributes.normal, idx = geo.index!;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(p, idx.getX(i)); b.fromBufferAttribute(p, idx.getX(i + 1)); c.fromBufferAttribute(p, idx.getX(i + 2));
      const face = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      normal.fromBufferAttribute(n, idx.getX(i));
      expect(face.dot(normal)).toBeCloseTo(1);
    }
  });
});

describe('Umrechnung aus Dreiecken', () => {
  it('ein Quader von 1 × 0,5 × 1 m ergibt bei 25 cm eine Hülle aus 4 × 2 × 4 Würfeln', () => {
    const geo = new THREE.BoxGeometry(1, 0.5, 1).translate(0, 0.25, 0);
    const { solid, glass } = voxelize([{ geometry: geo, matrix: new THREE.Matrix4(), glass: false, color: () => 0x808080 }], 0.25);
    expect(glass).toBeNull();
    expect(solid!.dims).toEqual([4, 2, 4]);
    expect(solid!.min).toEqual([-2, 0, -2]); // Ursprung unten in der Mitte bleibt erhalten
    expect(solid!.count).toBe(32);           // so dünn ist alles Hülle
  });

  it('Farben kommen aus den UVs, Glas bekommt ein eigenes Gitter', () => {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const { solid, glass } = voxelize([
      { geometry: geo, matrix: new THREE.Matrix4(), glass: false, color: (uv) => (uv!.x < 0.5 ? 0xff0000 : 0x00ff00) },
      { geometry: geo, matrix: new THREE.Matrix4().makeTranslation(0, 1, 0), glass: true, color: () => 0 },
    ], 0.25);
    const left = solid!.get(0, 0, 0) & 0xffffff, right = solid!.get(3, 0, 0) & 0xffffff;
    expect([left, right]).toEqual([0xff0000, 0x00ff00]);
    expect(glass!.count).toBe(16);
  });

  it('Kantenlänge je Modellgruppe aus den Daten', () => {
    const s = readData<VoxelSettings>('voxel/standard');
    const cola = '3d/Produkte/06_Getraenke/SM_Cola_0_5L.fbx', regal = '3d/Baubar/Einrichtung/x.fbx';
    expect(voxelSize(s, cola)).toBeLessThan(voxelSize(s, regal));
    for (const path of [cola, regal]) {
      const st = voxelStufen(s, path);
      expect(st[0]).toEqual({ ab: 0, faktor: 1 });
      expect(st.map((x) => x.ab)).toEqual([...st.map((x) => x.ab)].sort((a, b) => a - b));
    }
  });
});

describe('Figuren', () => {
  const settings = readData<Parameters<typeof lookFromSeed>[0]>('figuren/standard');

  it('gleiche Nummer = gleiches Aussehen; Personal trägt die Farbe der Rolle', () => {
    expect(lookFromSeed(settings, 7)).toEqual(lookFromSeed(settings, 7));
    expect(lookFromSeed(settings, 3, '#3f7cac').oberteil).toBe('#3f7cac');
    const looks = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(lookFromSeed(settings, i))));
    expect(looks.size).toBeGreaterThan(15);
  });

  it('steht auf dem Boden, ist etwa 1,70 m groß und bleibt nach dem Zusammenfassen klein', () => {
    const grid = buildFigureGrid(lookFromSeed(settings, 1), settings.kantenlaenge);
    expect(grid.min[1]).toBe(0);
    expect(grid.dims[1] * settings.kantenlaenge).toBeGreaterThan(1.6);
    expect(grid.dims[1] * settings.kantenlaenge).toBeLessThan(1.8);
    expect(quads(greedyMesh(grid))).toBeLessThan(400);
  });
});
