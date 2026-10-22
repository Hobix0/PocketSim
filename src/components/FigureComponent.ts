import * as THREE from 'three';
import { Component } from '../ecs/Component';
import { buildFigureGrid, type FigureLook } from '../voxel/figure';
import { greedyMesh } from '../voxel/greedyMesh';

// Spielfigur aus Würfeln (Aussehen siehe voxel/figure.ts). Ursprung unten in der Mitte, Blick nach +Z.
// Figuren mit gleichem Aussehen teilen sich die Geometrie; das Material teilen sich alle.
// Lebendig: Beim Gehen wippt und schwankt die Figur im Schritttakt (je schneller, desto flotter),
// im Stehen atmet sie ruhig und schaut sich ab und zu kurz um. Die Bewegung erkennt sie selbst
// an der Positionsänderung – das Verhalten (Kunde, Personal, Passant) muss nichts dafür tun.

const geometries = new Map<string, THREE.BufferGeometry>();
let material: THREE.MeshStandardMaterial | null = null;

function figureGeometry(look: FigureLook, size: number): THREE.BufferGeometry {
  const key = `${size}|${look.haut}|${look.haare}|${look.oberteil}|${look.hose}|${look.schuhe}|${look.frisur}`;
  let geo = geometries.get(key);
  if (!geo) {
    geo = greedyMesh(buildFigureGrid(look, size));
    geometries.set(key, geo);
  }
  return geo;
}

/** Schrittlänge (m) und Stärke der Bewegungen */
const SCHRITT = 0.55, WIPPEN = 0.045, SCHWANKEN = 0.07, ATMEN = 0.012;

export class FigureComponent extends Component {
  private mesh: THREE.Mesh | null = null;
  private readonly last = new THREE.Vector3();
  private phase = Math.random() * 10;
  private tempo = 0;
  private zeit = Math.random() * 10;
  private umschauen = 3 + Math.random() * 6;
  private blick = 0;

  constructor(readonly look: FigureLook, private readonly size: number) {
    super();
  }

  override onAttach(): void {
    material ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    this.mesh = new THREE.Mesh(figureGeometry(this.look, this.size), material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.entity.object.add(this.mesh);
    this.last.copy(this.entity.object.position);
  }

  override update(dt: number): void {
    const m = this.mesh;
    if (!m || dt <= 0) return;
    const p = this.entity.object.position;
    const weg = Math.hypot(p.x - this.last.x, p.z - this.last.z);
    this.last.copy(p);
    // Geschwindigkeit weich nachführen (sonst zittert es bei ungleichmäßigen Bildern)
    this.tempo += (Math.min(4, weg / dt) - this.tempo) * Math.min(1, dt * 10);
    this.zeit += dt;
    const geht = Math.min(1, this.tempo / 0.6);
    this.phase += (weg / SCHRITT) * Math.PI;
    // Gehen: zwei Hüpfer je Schrittpaar, seitliches Schwanken
    m.position.y = Math.abs(Math.sin(this.phase)) * WIPPEN * geht;
    m.rotation.z = Math.sin(this.phase) * SCHWANKEN * geht;
    // Stehen: atmen und gelegentlich umschauen
    const steht = 1 - geht;
    m.scale.y = 1 + Math.sin(this.zeit * 2.2) * ATMEN * steht;
    this.umschauen -= dt * steht;
    if (this.umschauen <= 0) { this.umschauen = 4 + Math.random() * 7; this.blick = (Math.random() - 0.5) * 1.1; }
    if (this.umschauen < 3.2) this.blick *= Math.exp(-dt * 1.5); // nach einem Moment wieder geradeaus
    m.rotation.y += ((this.blick * steht) - m.rotation.y) * Math.min(1, dt * 4);
  }

  override onDetach(): void {
    if (this.mesh) this.entity.object.remove(this.mesh);
    this.mesh = null;
  }
}
