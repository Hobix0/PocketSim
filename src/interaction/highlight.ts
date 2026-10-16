import * as THREE from 'three';
import type { Entity } from '../ecs/Entity';

// Hebt eine Entity farbig hervor, indem ihre Meshes leicht leuchten.
// Jedes Mesh bekommt dafür eine eigene Kopie seines Materials. So bleiben
// Materialien, die sich mehrere Modelle teilen (z. B. die Palette aus Blender), unberührt.

export type HighlightLevel = 'none' | 'hover' | 'selected';

const STRENGTH: Record<HighlightLevel, number> = { none: 0, hover: 0.22, selected: 0.45 };

export function setHighlight(entity: Entity, level: HighlightLevel, color: THREE.ColorRepresentation): void {
  entity.object.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const data = obj.userData as { baseMaterial?: THREE.Material; glowMaterial?: THREE.MeshStandardMaterial };
    if (level === 'none') {
      if (data.baseMaterial) obj.material = data.baseMaterial;
      return;
    }
    if (!data.baseMaterial) {
      if (!(obj.material instanceof THREE.MeshStandardMaterial)) return;
      data.baseMaterial = obj.material;
      data.glowMaterial = obj.material.clone();
    }
    const glow = data.glowMaterial!;
    glow.emissive.set(color);
    glow.emissiveIntensity = STRENGTH[level];
    obj.material = glow;
  });
}
