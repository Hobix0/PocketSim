import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { WallView } from '../src/world/WallView';

// Wände oben / Schnitt / unten

const content = new Content();
const settings = { sockel: 0.3, radius: 16, ueberstand: 0.6, tempo: 1000 };

function laden() {
  const w = new World(new THREE.Group());
  const vorne = w.add(createBuildEntity(content.bau.get('schaufenster_gross'), { position: [0, 0, 3.1], drehung: -90 }, { content }));
  const hinten = w.add(createBuildEntity(content.bau.get('wand_weiss'), { position: [0, 0, -3.1], drehung: 90 }, { content }));
  // Weitere Module der Vorderfront und eine Seitenwand
  const vorneRechts = w.add(createBuildEntity(content.bau.get('wand_weiss'), { position: [4, 0, 3.1], drehung: -90 }, { content }));
  const seite = w.add(createBuildEntity(content.bau.get('wand_weiss'), { position: [5, 0, 0], drehung: 0 }, { content }));
  return { w, vorne, hinten, vorneRechts, seite };
}

describe('Wände', () => {
  it('Schnitt: nur die Wand zwischen Kamera und Blickpunkt sinkt, unten: alle', () => {
    const { w, vorne, hinten, vorneRechts, seite } = laden();
    const v = new WallView(w, settings);
    const cam = new THREE.Vector3(0, 12, 14), focus = new THREE.Vector3(0, 0, 0);
    v.mode = 'schnitt';
    v.update(1, cam, focus);
    expect(vorne.object.scale.y).toBeLessThan(0.2);
    expect(vorneRechts.object.scale.y).toBeLessThan(0.2);
    expect(hinten.object.scale.y).toBe(1);
    expect(seite.object.scale.y).toBe(1);
    v.mode = 'unten';
    v.update(1, cam, focus);
    expect(hinten.object.scale.y).toBeLessThan(0.2);
    v.mode = 'oben';
    v.update(1, cam, focus);
    expect(vorne.object.scale.y).toBe(1);
  });
});
