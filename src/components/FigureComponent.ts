import * as THREE from 'three';
import { Component } from '../ecs/Component';
import { buildFigureGrid, type FigureLook } from '../voxel/figure';
import { greedyMesh } from '../voxel/greedyMesh';

// Spielfigur aus Würfeln (Aussehen siehe voxel/figure.ts). Ursprung unten in der Mitte, Blick nach +Z.
// Figuren mit gleichem Aussehen teilen sich die Geometrie; das Material teilen sich alle.

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

export class FigureComponent extends Component {
  private mesh: THREE.Mesh | null = null;

  constructor(readonly look: FigureLook, private readonly size: number) {
    super();
  }

  override onAttach(): void {
    material ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    this.mesh = new THREE.Mesh(figureGeometry(this.look, this.size), material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.entity.object.add(this.mesh);
  }

  override onDetach(): void {
    if (this.mesh) this.entity.object.remove(this.mesh);
    this.mesh = null;
  }
}
