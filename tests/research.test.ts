import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { PlayerState } from '../src/state/PlayerState';
import { Research } from '../src/economy/Research';
import { checkPlacement } from '../src/building/placement';
import { createBuildEntity } from '../src/factory/createBuildEntity';

// Forschungsbaum: Ideen aus XP, Voraussetzungen, Freischalten, Spielstand

const content = new Content();
const levels = { xpFuerLevel: [0, 100, 250, 500, 900] };
const setup = (xp = 0) => {
  const player = new PlayerState('t', { geld: 10000, xp }, levels);
  return { player, research: new Research(content.forschung, player, { ideenProXp: 0.3, startIdeen: 0 }) };
};

describe('Forschung', () => {
  it('trägt die Forschung an Bauteilen, Rezepten und Produkten ein', () => {
    expect(content.bau.get('backstation').forschung).toBe('backstube');
    expect(content.rezepte.get('broetchen_backen').forschung).toBe('backstube');
    expect(content.produkte.all().filter((p) => p.kategorie === 'molkerei_eier').every((p) => p.forschung === 'kuehlregale')).toBe(true);
    expect(content.bau.get('holzregal').forschung).toBeUndefined();
  });

  it('Ideen kommen mit der XP; erforschen braucht Level, Voraussetzung und Ideen', () => {
    const { player, research } = setup();
    const back = research.node('backstube')!;
    expect(research.isDone('laden')).toBe(true);
    expect(research.status(back)).toBe('level');
    player.addXp(100);
    expect(research.ideen).toBe(30);
    expect(research.status(research.node('saftbar')!)).toBe('voraussetzung');
    expect(research.status(research.node('roesterei')!)).toBe('bald');
    expect(research.ok(content.bau.get('backstation'))).toBe(false);
    expect(research.research('backstube')).toBe(true);
    expect(research.ideen).toBe(10);
    expect(research.ok(content.bau.get('backstation'))).toBe(true);
    expect(research.research('kuehlregale')).toBe(false); // nur noch 10 Ideen
    expect(research.sperre(content.bau.get('kuehlregal_offen'))).toBe('Forschung: Kühlregale');
  });

  it('Bauen prüft die Forschung', () => {
    const w = new World(new THREE.Group());
    for (const x of [-1, 1]) for (const z of [-1, 1]) w.add(createBuildEntity(content.bau.get('boden_fliese_innen'), { position: [x, 0, z], drehung: 0 }, { content }));
    const def = content.bau.get('backstation');
    const opts = { geld: 10000, level: 9 };
    expect(checkPlacement(w, def, 0, 0, 0, content.baumenue, { ...opts, erforscht: () => false }).grund).toBe('forschung');
    expect(checkPlacement(w, def, 0, 0, 0, content.baumenue, { ...opts, erforscht: () => true }).ok).toBe(true);
  });

  it('steht im Spielstand; alte Spielstände bekommen alles bis zum Level', () => {
    const a = setup(300);
    a.research.addIdeen(50);
    expect(a.research.research('backstube')).toBe(true);
    const saved = JSON.parse(JSON.stringify(a.research.state()));
    const b = setup(300);
    b.research.restore(saved);
    expect(b.research.isDone('backstube')).toBe(true);
    expect(b.research.isDone('feinkost')).toBe(false);
    expect(b.research.ideen).toBe(a.research.ideen);
    const alt = setup(300); // Level 3
    alt.research.restore(undefined);
    expect(alt.research.isDone('feinkost')).toBe(true);
    expect(alt.research.isDone('tiefkuehl')).toBe(false);
    expect(alt.research.isDone('roesterei')).toBe(false);
  });
});

describe('Café-Ecke', () => {
  it('ist erforschbar und schaltet Maschine, Rezepte und Kaffee frei', () => {
    const { player, research } = setup(300);
    research.addIdeen(100);
    expect(research.research('cafe')).toBe(false); // erst die Backstube
    research.research('backstube');
    expect(research.research('cafe')).toBe(true);
    expect(research.ok(content.bau.get('kaffeemaschine'))).toBe(true);
    expect(research.ok(content.rezepte.get('cappuccino_zubereiten'))).toBe(true);
    expect(research.ok(content.produkte.get('kaffee_to_go'))).toBe(true);
    expect(player.level).toBe(3);
  });

  it('Bistrotisch: zwei Plätze, jeder nur für einen Kunden', async () => {
    const { SeatComponent } = await import('../src/components/SeatComponent');
    const { Entity } = await import('../src/ecs/Entity');
    const w = new World(new THREE.Group());
    const tisch = w.add(createBuildEntity(content.bau.get('bistrotisch'), { position: [2, 0, 0], drehung: 0 }, { content }));
    const s = tisch.require(SeatComponent);
    const a = new Entity('kunde'), b = new Entity('kunde'), c = new Entity('kunde');
    expect([s.reserve(a), s.reserve(b), s.reserve(c)]).toEqual([0, 1, -1]);
    expect(s.seat(0).z).toBeCloseTo(-0.62);
    expect(Math.abs(s.approach(1).z)).toBeGreaterThan(0.75);
    s.release(a);
    expect(s.frei).toBe(1);
  });
});
