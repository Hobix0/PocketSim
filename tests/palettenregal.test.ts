import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { checkPlacement, rackBays } from '../src/building/placement';
import { snapPlacement } from '../src/building/snapping';
import { StorageSurfaceComponent } from '../src/components/StorageSurfaceComponent';

// Palettenregal-System: Stützrahmen einzeln, Traversen-Ebenen dazwischen auf freien Höhen

const content = new Content();
const ctx = { content };
const s = content.baumenue;
const opts = { geld: 1e6, level: 99 };
const rahmen = content.bau.get('pal_rahmen_klassik_300');
const traverse = content.bau.get('pal_traverse_klassik_270_offen');

function halle() {
  const w = new World(new THREE.Group());
  for (let x = -4; x <= 4; x += 2) for (let z = -4; z <= 4; z += 2) w.add(createBuildEntity(content.bau.get('betonboden'), { position: [x, 0, z], drehung: 0 }, ctx));
  return w;
}
const place = (w: World, def = rahmen, x = 0, z = 0, drehung = 0) => {
  const r = checkPlacement(w, def, x, z, THREE.MathUtils.degToRad(drehung), s, opts);
  expect(r.ok, r.grund).toBe(true);
  return w.add(createBuildEntity(def, { position: [x, r.y, z], drehung }, ctx));
};

describe('Palettenregal', () => {
  it('der zweite Rahmen rastet im Feldabstand ein, auch Rücken an Rücken', () => {
    const w = halle();
    place(w, rahmen, 0, -1.4);
    const p = snapPlacement(w, rahmen, 0.1, 1.2, 0, s); // nahe 2,7 m + 10 cm
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-1.4 + 2.8);
    const back = snapPlacement(w, rahmen, 1.25, -1.4, 0, s);
    expect(back.x).toBeCloseTo(1.3);
  });

  it('Traversen hängen nur zwischen zwei Rahmen und stapeln sich bis zur Rahmenhöhe', () => {
    const w = halle();
    expect(checkPlacement(w, traverse, 0, 0, 0, s, opts).grund).toBe('rahmen');
    place(w, rahmen, 0, -1.4); place(w, rahmen, 0, 1.4);
    expect(rackBays(w, 2.7)).toHaveLength(1);
    const p = snapPlacement(w, traverse, 0.4, 0.3, 0, s);
    expect([p.x, p.z]).toEqual([0, 0]);
    const ys = [0, 1, 2].map(() => place(w, traverse, 0, 0).object.position.y);
    expect(ys.map((y) => +y.toFixed(2))).toEqual([0.15, 1.15, 2.15].map((v) => +(v + 0.05).toFixed(2)));
    // 3-m-Rahmen: 3,15 + 0,35 passt nicht mehr
    expect(checkPlacement(w, traverse, 0, 0, 0, s, opts).grund).toBe('regal_voll');
    // Falsche Feldbreite passt nicht
    expect(checkPlacement(w, content.bau.get('pal_traverse_klassik_180_offen'), 0, 0, 0, s, opts).grund).toBe('rahmen');
  });

  it('jede Ebene ist eine Lagerfläche für Kartons', () => {
    const w = halle();
    place(w, rahmen, 0, -1.4); place(w, rahmen, 0, 1.4);
    const t = place(w, traverse, 0, 0);
    const a = t.require(StorageSurfaceComponent);
    expect(a.capacity).toBe(content.bau.get('pal_traverse_klassik_270_offen').werte.lagerplaetze);
  });
});
