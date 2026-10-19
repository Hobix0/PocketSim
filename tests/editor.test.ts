import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VoxelGrid } from '../src/voxel/VoxelGrid';
import { greedyMesh } from '../src/voxel/greedyMesh';
import { raycastGrid } from '../src/editor/raycastGrid';
import {
  centeredGrid, decodeGrid, detectShelfLevels, encodeGrid, idFromName, toBuildDef, validateVoxelModel, type VoxelModelData,
} from '../src/editor/VoxelModel';
import { Content } from '../src/content/Content';
import { registerCustomModels } from '../src/editor/ModelStore';

// Voxel-Editor: Dateiformat, Regalböden, Bauelement, Strahl durchs Gitter, Teil-Meshing.

/** Regal: 4 Würfel tief (X), 20 hoch, 8 lang (Z), 10 cm-Würfel; Rückwand bei x = 0, Böden auf y = 0, 8, 16. */
function shelfGrid(): VoxelGrid {
  const g = new VoxelGrid(0.1, [0, 0, 0], [4, 20, 8]);
  for (let y = 0; y < 20; y++) for (let z = 0; z < 8; z++) g.set(0, y, z, 0xffffff);
  for (const y of [0, 8, 16]) for (let x = 0; x < 4; x++) for (let z = 0; z < 8; z++) g.set(x, y, z, 0xdddddd);
  return g;
}

function model(g: VoxelGrid, extra: Partial<VoxelModelData> = {}): VoxelModelData {
  return { id: 'eigen_test', name: 'Test', typ: 'deko', preis: 100, ebene: 'objekt', kantenlaenge: g.size, groesse: [...g.dims], ...encodeGrid(g), ...extra };
}

describe('Dateiformat', () => {
  it('Kodieren und Dekodieren ergibt dasselbe Gitter, die Palette enthält jede Farbe einmal', () => {
    const g = shelfGrid();
    g.set(3, 19, 7, 0x000000); // Schwarz ist nicht "leer"
    const m = model(g);
    expect([...m.palette].sort()).toEqual(['#000000', '#dddddd', '#ffffff']);
    expect(m.voxel.length).toBeLessThan(g.data.length); // Lauflängen sparen Platz
    const back = decodeGrid(m);
    expect([...back.data]).toEqual([...g.data]);
  });

  it('prüft Dateien mit klarer Meldung', () => {
    const m = model(shelfGrid());
    expect(validateVoxelModel(JSON.parse(JSON.stringify(m)), 'modelle/x.json').groesse).toEqual([4, 20, 8]);
    expect(() => validateVoxelModel({ ...m, groesse: [4, 0, 8] }, 'modelle/x.json')).toThrow('modelle/x.json: "groesse"');
    expect(() => validateVoxelModel({ ...m, typ: 'tisch' }, 'modelle/x.json')).toThrow('"typ"');
  });

  it('id aus dem Namen: Umlaute ersetzt, nur erlaubte Zeichen', () => {
    expect(idFromName('Großes Kühlregal Nr. 2')).toBe('eigen_grosses_kuehlregal_nr_2');
    expect(idFromName('???')).toBe('eigen_modell');
  });
});

describe('Im Spiel', () => {
  it('findet die Regalböden eines eigenen Regals', () => {
    expect(detectShelfLevels(shelfGrid())).toEqual([0.1, 0.9, 1.7]);
  });

  it('wird zum Bauelement: Maße, Kategorie „Eigene“, Fächer je Boden', () => {
    const def = toBuildDef(model(shelfGrid(), { typ: 'regal', regal: { kapazitaet: 12, kuehlung: true } }));
    expect(def.kategorie).toBe('eigene');
    expect(def.platzhalter.groesse.map((v) => Math.round(v * 100) / 100)).toEqual([0.4, 2, 0.8]);
    expect(def.regal).toMatchObject({ ebenen: [0.1, 0.9, 1.7], faecher: 3, kapazitaet: 12, kuehlung: true });
    expect(def.kontext).toBe('regal');
    expect(toBuildDef(model(shelfGrid())).regal).toBeUndefined();
  });

  it('Ursprung unten in der Mitte; Deckenmodelle hängen vom Ursprung nach unten', () => {
    expect(centeredGrid(model(shelfGrid())).min).toEqual([-2, 0, -4]);
    expect(centeredGrid(model(shelfGrid(), { ebene: 'decke' })).min).toEqual([-2, -20, -4]);
  });

  it('eigene Modelle aus data/modelle landen im Baukatalog', () => {
    const content = new Content();
    const vorher = content.bau.size;
    const n = registerCustomModels(content);
    expect(content.bau.size).toBe(vorher + n);
  });
});

describe('Strahl durchs Gitter', () => {
  const dims: [number, number, number] = [4, 4, 4];
  const one = (x: number, y: number, z: number) => x === 2 && y === 1 && z === 2;

  it('trifft den ersten Würfel und meldet die getroffene Seite', () => {
    // Von oben gerade nach unten auf (2, 1, 2): trifft die Oberseite
    const hit = raycastGrid(dims, one, [2.5, 10, 2.5], [0, -1, 0])!;
    expect(hit).toEqual({ cell: [2, 1, 2], normal: [0, 1, 0], ground: false });
    // Von der Seite (+X) kommend: trifft die +X-Seite
    const side = raycastGrid(dims, one, [10, 1.5, 2.5], [-1, 0, 0])!;
    expect(side.normal).toEqual([1, 0, 0]);
  });

  it('ohne Würfel im Weg: Boden innerhalb der Grundfläche, sonst nichts', () => {
    const empty = () => false;
    expect(raycastGrid(dims, empty, [0.5, 5, 0.5], [0, -1, 0])).toEqual({ cell: [0, -1, 0], normal: [0, 1, 0], ground: true });
    expect(raycastGrid(dims, empty, [9, 5, 9], [0, -1, 0])).toBeNull();
    expect(raycastGrid(dims, empty, [0.5, 5, 0.5], [0, 1, 0])).toBeNull();
  });

  it('schräge Strahlen finden auch Würfel in der Tiefe', () => {
    const dir = new THREE.Vector3(-1, -1, -1).normalize();
    const hit = raycastGrid(dims, one, [2.5 + 5, 1.5 + 5, 2.5 + 5], [dir.x, dir.y, dir.z]);
    expect(hit?.cell).toEqual([2, 1, 2]);
  });
});

describe('Teil-Meshing (Blöcke im Editor)', () => {
  it('alle Blöcke zusammen ergeben dieselbe Oberfläche wie das ganze Gitter', () => {
    const g = new VoxelGrid(0.1, [0, 0, 0], [20, 12, 20]);
    for (let x = 0; x < 20; x++) for (let y = 0; y < 12; y++) for (let z = 0; z < 20; z++) {
      if ((x - 10) ** 2 + (y - 6) ** 2 + (z - 10) ** 2 < 36) g.set(x, y, z, x < 10 ? 0xff0000 : 0x00ff00);
    }
    const area = (geo: THREE.BufferGeometry) => {
      const p = geo.attributes.position, idx = geo.index!;
      let a = 0;
      const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      for (let i = 0; i < idx.count; i += 3) {
        for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(p, idx.getX(i + k));
        a += new THREE.Vector3().crossVectors(v[1].clone().sub(v[0]), v[2].clone().sub(v[0])).length() / 2;
      }
      return a;
    };
    const full = area(greedyMesh(g));
    let parts = 0;
    for (let x = 0; x < 20; x += 8) for (let y = 0; y < 12; y += 8) for (let z = 0; z < 20; z += 8) {
      parts += area(greedyMesh(g, { min: [x, y, z], max: [Math.min(20, x + 8), Math.min(12, y + 8), Math.min(20, z + 8)] }));
    }
    expect(parts).toBeCloseTo(full, 6);
  });
});
