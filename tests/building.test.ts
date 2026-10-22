import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { PlayerState } from '../src/state/PlayerState';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { snapPlacement } from '../src/building/snapping';
import { checkPlacement } from '../src/building/placement';
import { Plots } from '../src/world/Plots';
import { inBuildCategory } from '../src/content/definitions';

// Ausbau: Einrasten von Böden, Wänden, Ecken, Anbauteilen; Regeln für Wände; Grundstücke; Baumenü.

const content = new Content();
const ctx = { content };
const s = content.baumenue;

/** Laden wie im Start-Level: Fliesen mit Mitten bei x = -3, -1, 1, 3 und z = -2, 0, 2 (8 × 6 m). */
function shop(): World {
  const w = new World(new THREE.Group());
  for (const x of [-3, -1, 1, 3]) for (const z of [-2, 0, 2]) {
    w.add(createBuildEntity(content.bau.get('boden_fliese_innen'), { position: [x, 0, z], drehung: 0 }, ctx));
  }
  return w;
}

describe('Einrasten', () => {
  const wand = content.bau.get('wand_weiss');

  it('Böden im Raster der vorhandenen Fliesen', () => {
    const w = shop();
    expect(snapPlacement(w, content.bau.get('boden_fliese_innen'), 5.4, 0.7, 0, s)).toMatchObject({ x: 5, z: 0 });
    expect(snapPlacement(w, content.bau.get('boden_fliese_innen'), -4.6, -3.4, 0, s)).toMatchObject({ x: -5, z: -4 });
  });

  it('Wände an die Kante, Außenseite weg vom Boden – wie im Start-Level', () => {
    const w = shop();
    // Ostwand: Kante x = 4, Boden links → Außenseite +X (0°), 0,1 m nach außen
    expect(snapPlacement(w, wand, 3.8, 0.3, 0, s)).toMatchObject({ x: 4.1, z: 0, drehung: 0 });
    // Westwand: Außenseite −X (180°)
    expect(snapPlacement(w, wand, -4.2, -1.8, 0, s)).toMatchObject({ x: -4.1, z: -2, drehung: 180 });
    // Rückwand: Kante z = -3, Boden darüber (z > -3) → Außenseite −Z (90°)
    expect(snapPlacement(w, wand, -0.7, -2.9, 0, s)).toMatchObject({ x: -1, z: -3.1, drehung: 90 });
    // Front: Außenseite +Z (−90°)
    expect(snapPlacement(w, wand, 3.2, 3.1, 0, s)).toMatchObject({ x: 3, z: 3.1, drehung: -90 });
  });

  it('R dreht die Wand um (Außenseite zur anderen Seite)', () => {
    const w = shop();
    expect(snapPlacement(w, wand, 3.8, 0.3, 1, s)).toMatchObject({ x: 3.9, drehung: 180 });
  });

  it('Eckpfeiler an die Ecke, Anbauteile genau auf die Wand', () => {
    const w = shop();
    expect(snapPlacement(w, content.bau.get('eckpfeiler_schwarz'), 3.7, 2.8, 0, s)).toMatchObject({ x: 4.1, z: 3.1 });
    w.add(createBuildEntity(wand, { position: [3, 0, 3.1], drehung: -90 }, ctx));
    expect(snapPlacement(w, content.bau.get('markise_rot_weiss'), 2.5, 3.6, 0, s)).toMatchObject({ x: 3, z: 3.1, drehung: -90 });
  });
});

describe('Regeln für Wände', () => {
  const opts = { geld: 10000, level: 9 };
  const wand = content.bau.get('wand_weiss');

  it('brauchen Boden daneben, dürfen sich an Ecken berühren, aber nicht doppelt stehen', () => {
    const w = shop();
    const rot = (d: number) => THREE.MathUtils.degToRad(d);
    expect(checkPlacement(w, wand, 20, 20, 0, s, opts).grund).toBe('boden');
    expect(checkPlacement(w, wand, 4.1, 0, rot(0), s, opts).ok).toBe(true);
    w.add(createBuildEntity(wand, { position: [4.1, 0, 0], drehung: 0 }, ctx));
    expect(checkPlacement(w, wand, 4.1, 0, rot(0), s, opts).grund).toBe('belegt');
    // Eckpfeiler an der Ecke und die quer laufende Wand daneben sind erlaubt
    expect(checkPlacement(w, content.bau.get('eckpfeiler_schwarz'), 4.1, 3.1, 0, s, opts).ok).toBe(true);
    expect(checkPlacement(w, wand, 3, 3.1, rot(-90), s, opts).ok).toBe(true);
  });

  it('Markise und Ladenschild dürfen am selben Wandmodul hängen, dieselbe Markise nicht zweimal', () => {
    const w = shop();
    w.add(createBuildEntity(content.bau.get('markise_rot_weiss'), { position: [3, 0, 3.1], drehung: -90 }, ctx));
    expect(checkPlacement(w, content.bau.get('ladenschild_band'), 3, 3.1, 0, s, opts).ok).toBe(true);
    expect(checkPlacement(w, content.bau.get('markise_rot_weiss'), 3, 3.1, 0, s, opts).grund).toBe('belegt');
  });
});

describe('Grundstücke', () => {
  const list = [
    { id: 'laden', name: 'Laden', rect: { minX: -4, maxX: 4, minZ: -3, maxZ: 3 }, preis: 0, freischaltLevel: 1, besessen: true },
    { id: 'ost', name: 'Ost', rect: { minX: 4, maxX: 10, minZ: -3, maxZ: 3 }, preis: 3500, freischaltLevel: 2 },
  ];

  it('bauen nur auf eigenen Flächen; kaufen braucht Level und Geld', () => {
    const p = new PlayerState('t', { geld: 5000, xp: 0 }, { xpFuerLevel: [0, 100] });
    const plots = new Plots(list, p);
    expect(plots.allows(0, 0)).toBe(true);
    expect(plots.allows(6, 0)).toBe(false);
    expect(plots.allows(4.1, 0, 0.4)).toBe(true); // Wand am Rand
    expect(plots.buy('ost')).toEqual({ ok: false, grund: 'gesperrt' });
    p.addXp(100);
    expect(plots.buy('ost')).toEqual({ ok: true });
    expect(p.geld).toBe(1500);
    expect(plots.allows(6, 0)).toBe(true);
    const again = new Plots(list, p);
    again.restore(plots.state());
    expect(again.isOwned('ost')).toBe(true);
  });

  it('fremdes Grundstück wird beim Bauen gemeldet', () => {
    const w = shop();
    const plots = new Plots(list, new PlayerState('t', { geld: 0, xp: 0 }, { xpFuerLevel: [0] }));
    const r = checkPlacement(w, content.bau.get('boden_fliese_innen'), 5, 0, 0, s, { geld: 1000, level: 1, plotOk: (x, z, rand) => plots.allows(x, z, rand) });
    expect(r.grund).toBe('grundstueck');
  });
});

describe('Baumenü', () => {
  it('jedes Bauteil aus den Daten hat mindestens einen Tab, Wände und Böden ihre eigenen', () => {
    const cats = s.kategorien;
    const ohne = content.bau.all().filter((d) => !cats.some((c) => inBuildCategory(d, c)) && d.id !== 'dach');
    expect(ohne.map((d) => d.id)).toEqual([]);
    expect(inBuildCategory(content.bau.get('wand_weiss'), cats.find((c) => c.id === 'waende')!)).toBe(true);
    expect(inBuildCategory(content.bau.get('boden_gehweg'), cats.find((c) => c.id === 'boden')!)).toBe(true);
  });
});

describe('Baumenü', () => {
  it('jedes sichtbare Bauteil hat einen Platz, Varianten bilden Familien', async () => {
    const { Content } = await import('../src/content/Content');
    const { buildGroupOf } = await import('../src/content/definitions');
    const c = new Content();
    const ohne = c.bau.all().filter((d) => !d.ausgeblendet && !buildGroupOf(d, c.baumenue)).map((d) => d.id);
    expect(ohne).toEqual([]);
    const wand = c.bau.all().filter((d) => d.variante?.familie === 'vr_wand');
    expect(wand.map((d) => d.variante!.name).sort()).toEqual(['Holz', 'Salbei', 'Schwarz', 'Weiß']);
    expect(c.baumenue.familien.vr_wand).toBe('Wandregal');
  });
});
