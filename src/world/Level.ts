import * as THREE from 'three';
import type { DeliveryRoute } from './TruckFleet';
import type { PlotDef } from './Plots';
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
  typ?: string;                         // id in data/bau …
  produkt?: string;                     // … oder id in data/produkte
  position: [number, number, number];
  drehung: number;                      // Grad um die Hochachse
  /** Optional: als Reihe oder Fläche wiederholen, z. B. Bodenplatten oder Wandstücke. */
  wiederholen?: { anzahl: [number, number]; abstand: [number, number] }; // [x, z]
  /** Optional: ein ganzes Ladengebäude auf dieser Fläche (dann zählen typ/position nicht), siehe buildingParts */
  gebaeude?: BuildingSpec;
}

/**
 * Ein Ladengebäude aus 2-m-Modulen: Boden, Wände ringsum, die Front (Straßenseite +Z) mit Schaufenstern und Tür,
 * Eckpfeiler und Dachkante. `alt`: verfallener Altbau (zum Renovieren), `neu`: bezugsfertig.
 * Breite und Tiefe der Fläche müssen Vielfache von 2 m sein.
 */
export interface BuildingSpec {
  rect: { minX: number; maxX: number; minZ: number; maxZ: number };
  zustand: 'alt' | 'neu';
  /** Welches Frontmodul die Tür ist (von links, 0 = ganz links); Standard: Mitte */
  tuer?: number;
}

/** Alle Bauteile eines Ladengebäudes */
export function buildingParts(b: BuildingSpec): PlacedObject[] {
  const { minX, maxX, minZ, maxZ } = b.rect;
  const nx = Math.round((maxX - minX) / 2), nz = Math.round((maxZ - minZ) / 2);
  const alt = b.zustand === 'alt';
  const out: PlacedObject[] = [];
  const put = (typ: string, x: number, y: number, z: number, drehung: number) => out.push({ typ, position: [round(x), y, round(z)], drehung });
  const wand = alt ? 'altbau_wand' : 'wand_weiss';
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) put(alt ? 'altbau_boden' : 'boden_fliese_innen', minX + 1 + 2 * i, 0, minZ + 1 + 2 * k, 0);
  const tuer = Math.min(nx - 1, b.tuer ?? Math.floor(nx / 2));
  for (let i = 0; i < nx; i++) {
    const x = minX + 1 + 2 * i;
    put(wand, x, 0, minZ - 0.1, 90);
    const front = i === tuer ? (alt ? 'altbau_tuer' : 'eingang_schiebetuer') : alt ? (i === 0 ? 'altbau_fenster_schild' : 'altbau_fenster') : 'schaufenster_gross';
    put(front, x, 0, maxZ + 0.1, -90);
    if (i === tuer && !alt) put('eingangsstufe', x, 0, maxZ + 0.1, -90);
    put('attika_dachkante', x, 4, maxZ + 0.1, -90);
    put('attika_dachkante', x, 4, minZ - 0.1, 90);
  }
  for (let k = 0; k < nz; k++) {
    const z = minZ + 1 + 2 * k;
    put(wand, minX - 0.1, 0, z, 180);
    put(wand, maxX + 0.1, 0, z, 0);
    put('attika_dachkante', minX - 0.1, 4, z, 180);
    put('attika_dachkante', maxX + 0.1, 4, z, 0);
  }
  for (const x of [minX - 0.1, maxX + 0.1]) for (const z of [minZ - 0.1, maxZ + 0.1]) put('eckpfeiler_schwarz', x, 0, z, 0);
  if (alt) {
    put('geruempel', minX + 1.6, 0.05, minZ + 0.8, 20);
    put('geruempel', maxX - 1.8, 0.05, (minZ + maxZ) / 2 + 0.6, -70);
  }
  return out;
}

/** Ein einzelnes, fertig ausgerechnetes Objekt (nach dem Auflösen von "wiederholen"). */
export interface PlacedObject {
  typ?: string;
  produkt?: string;
  position: [number, number, number];
  drehung: number;
}

/** Wiederholungen auflösen: aus einer Zeile mit anzahl [3, 2] werden sechs Objekte. */
export function expandObjects(list: LevelObject[]): PlacedObject[] {
  const out: PlacedObject[] = [];
  for (const o of list) {
    if (o.gebaeude) { out.push(...buildingParts(o.gebaeude)); continue; }
    const [nx, nz] = o.wiederholen?.anzahl ?? [1, 1];
    const [dx, dz] = o.wiederholen?.abstand ?? [0, 0];
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        const [x, y, z] = o.position;
        const ref = o.produkt !== undefined ? { produkt: o.produkt } : { typ: o.typ };
        out.push({ ...ref, position: [round(x + i * dx), y, round(z + k * dz)], drehung: o.drehung });
      }
    }
  }
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export interface LevelLife {
  gehweg: { x: [number, number]; z: [number, number]; y: number };
  spuren: { z: number; richtung: 1 | -1 }[];
  strasse: { x: [number, number]; y: number };
  /** Punkte vor den Schaufenstern (x, z), an denen Passanten stehen bleiben */
  schaufenster: [number, number][];
  tauben: [number, number, number][];
}

export interface LevelData {
  name: string;
  himmel: string;
  raster: number;
  boden: { groesse: [number, number]; farbe: string };
  /** Frühere Bodengröße (für Gelände-Änderungen aus älteren Spielständen, die die Größe noch nicht mitspeichern) */
  bodenFrueher?: [number, number];
  kameraStart: [number, number, number];
  /** Optionaler Kameraabstand zu Beginn (sonst aus data/kamera) */
  kameraAbstand?: number;
  /** Wo Kunden auftauchen und wieder verschwinden (z. B. die Enden des Gehwegs). Ohne Angabe: keine Kunden. */
  kundenPunkte?: [number, number, number][];
  /** Leben in der Welt: wo Passanten gehen, Autos fahren, Tauben picken (src/world/Ambience.ts) */
  leben?: LevelLife;
  /** Ziele für dieses Level (Datei unter data/ziele/), z. B. "start" */
  ziele?: string;
  /** Strecke der Liefer-LKW (siehe world/TruckFleet.ts); ohne Angabe wird sofort ins Lager geliefert */
  anlieferung?: DeliveryRoute;
  /** Wo gebaut werden darf; ohne Angabe überall (siehe world/Plots.ts) */
  grundstuecke?: PlotDef[];
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
