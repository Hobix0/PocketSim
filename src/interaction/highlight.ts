import * as THREE from 'three';
import type { Entity } from '../ecs/Entity';

// Hebt eine Entity farbig hervor, indem ihre Meshes leicht leuchten.
// Jedes Mesh bekommt dafür eigene Kopien seiner Materialien. So bleiben
// Materialien, die sich viele Modelle teilen (die Palette aus Blender), unberührt.
// Die Stufe wird an der Entity gemerkt, damit später geladene Modelle sie übernehmen können.

export type HighlightLevel = 'none' | 'hover' | 'selected';

const STRENGTH: Record<HighlightLevel, number> = { none: 0, hover: 0.22, selected: 0.45 };

type MeshData = { baseMaterial?: THREE.Material | THREE.Material[]; glowMaterial?: THREE.Material | THREE.Material[] };

export function setHighlight(entity: Entity, level: HighlightLevel, color: THREE.ColorRepresentation): void {
  entity.object.userData.highlight = { level, color };
  entity.object.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const data = obj.userData as MeshData;
    if (level === 'none') {
      if (data.baseMaterial) obj.material = data.baseMaterial;
      return;
    }
    if (!data.baseMaterial) {
      data.baseMaterial = obj.material;
      data.glowMaterial = Array.isArray(obj.material) ? obj.material.map((m) => m.clone()) : obj.material.clone();
    }
    for (const m of [data.glowMaterial!].flat()) {
      if (m instanceof THREE.MeshStandardMaterial) {
        m.emissive.set(color);
        m.emissiveIntensity = STRENGTH[level];
      }
    }
    obj.material = data.glowMaterial!;
  });
}

/** Zuletzt gesetzte Hervorhebung erneut anwenden (z. B. nachdem ein Modell fertig geladen ist). */
export function reapplyHighlight(entity: Entity): void {
  const h = entity.object.userData.highlight as { level: HighlightLevel; color: THREE.ColorRepresentation } | undefined;
  if (h && h.level !== 'none') setHighlight(entity, h.level, h.color);
}
