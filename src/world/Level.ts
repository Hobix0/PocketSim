import * as THREE from 'three';
import type { Bounds } from '../camera/ManagementCamera';

// Baut ein Testgelände aus einer Level-Datei (data/level/*.json).
// Bis die Blender-Modelle angebunden sind, besteht alles aus einfachen Quadern.

export interface BlockData {
  name: string;
  position: [number, number, number];
  groesse: [number, number, number];
  farbe: string;
  rotation?: [number, number, number]; // Grad
}

export interface LevelData {
  name: string;
  himmel: string;
  raster: number;
  boden: { groesse: [number, number]; farbe: string };
  kameraStart: [number, number, number];
  bloecke: BlockData[];
}

export class Level {
  readonly root = new THREE.Group();
  readonly ground: THREE.Mesh;
  readonly bounds: Bounds;

  constructor(readonly data: LevelData) {
    const [w, d] = data.boden.groesse;
    this.bounds = { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 };

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: data.boden.farbe, roughness: 1 }),
    );
    this.ground.name = 'Boden';
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.root.add(this.ground);

    for (const b of data.bloecke) this.root.add(makeBlock(b));
  }
}

function makeBlock(b: BlockData): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...b.groesse),
    new THREE.MeshStandardMaterial({ color: b.farbe, roughness: 0.85 }),
  );
  mesh.name = b.name;
  mesh.position.set(...b.position);
  if (b.rotation) {
    const [x, y, z] = b.rotation.map(THREE.MathUtils.degToRad);
    mesh.rotation.set(x, y, z);
  }
  // Flache Teile (Boden, Gehweg) werfen keine Schatten
  mesh.castShadow = b.groesse[1] > 0.2;
  mesh.receiveShadow = true;
  return mesh;
}
