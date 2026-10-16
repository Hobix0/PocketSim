import * as THREE from 'three';
import type { Bounds } from '../camera/ManagementCamera';

// Baut die feste Kulisse eines Levels aus seiner Datei (data/level/*.json).
// Bis die Blender-Modelle angebunden sind, besteht alles aus einfachen Quadern.
// Die Objekte unter "objekte" setzt Game als Entities in die Welt.

export interface BlockData {
  name: string;
  position: [number, number, number];
  groesse: [number, number, number];
  farbe: string;
  rotation?: [number, number, number]; // Grad
}

/** Ein Objekt aus einem Datenkatalog, das beim Laden des Levels platziert wird. */
export interface LevelObject {
  typ: string;                          // id in data/bau
  position: [number, number, number];
  drehung: number;                      // Grad um die Hochachse
  /** Optional: als Reihe oder Fläche wiederholen, z. B. Bodenplatten oder Wandstücke. */
  wiederholen?: { anzahl: [number, number]; abstand: [number, number] }; // [x, z]
}

/** Ein einzelnes, fertig ausgerechnetes Objekt (nach dem Auflösen von "wiederholen"). */
export interface PlacedObject {
  typ: string;
  position: [number, number, number];
  drehung: number;
}

/** Wiederholungen auflösen: aus einer Zeile mit anzahl [3, 2] werden sechs Objekte. */
export function expandObjects(list: LevelObject[]): PlacedObject[] {
  const out: PlacedObject[] = [];
  for (const o of list) {
    const [nx, nz] = o.wiederholen?.anzahl ?? [1, 1];
    const [dx, dz] = o.wiederholen?.abstand ?? [0, 0];
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        const [x, y, z] = o.position;
        out.push({ typ: o.typ, position: [round(x + i * dx), y, round(z + k * dz)], drehung: o.drehung });
      }
    }
  }
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export interface LevelData {
  name: string;
  himmel: string;
  raster: number;
  boden: { groesse: [number, number]; farbe: string };
  kameraStart: [number, number, number];
  bloecke: BlockData[];                 // feste Kulisse (Wände, Straße …)
  objekte: LevelObject[];               // Entities aus dem Bau-Katalog
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
