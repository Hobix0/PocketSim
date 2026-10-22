import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { PlayerState } from '../src/state/PlayerState';
import { Plots } from '../src/world/Plots';
import { Renovations } from '../src/world/Renovations';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { expandObjects, type LevelData } from '../src/world/Level';
import start from '../data/level/start.json';
import stadt from '../data/stadt/standard.json';

// Stadt: Altbau kaufen und renovieren

const content = new Content();
const level = start as unknown as LevelData;

function setup() {
  const world = new World(new THREE.Group());
  const player = new PlayerState('t', { geld: 20000, xp: 300 }, { xpFuerLevel: [0, 100, 250, 500, 900] });
  const plots = new Plots(level.grundstuecke ?? [], player);
  // Nur die Objekte des alten Ladenlokals aufbauen
  const r = plots.list.find((p) => p.id === 'altes_ladenlokal')!.rect;
  for (const o of expandObjects(level.objekte)) {
    const [x, , z] = o.position;
    const def = o.typ ? content.bau.find(o.typ) : undefined;
    if (def && x >= r.minX - 0.3 && x <= r.maxX + 0.3 && z >= r.minZ - 0.3 && z <= r.maxZ + 0.3) world.add(createBuildEntity(def, o, { content }));
  }
  const ren = new Renovations(world, content, plots, player, { content }, stadt.renovierung);
  return { world, player, plots, ren };
}

const typen = (w: World) => [...w.all()].map((e) => e.typeId);

describe('Altbau', () => {
  it('jedes verfallene Teil wird zu einem Teil derselben Ebene und Größe', () => {
    for (const def of content.bau.all().filter((d) => d.renovierung)) {
      expect(def.ausgeblendet, def.id).toBe(true);
      const zu = def.renovierung!.zu;
      if (zu === null) continue;
      const neu = content.bau.get(zu);
      expect(neu.ebene, def.id).toBe(def.ebene);
      expect(neu.platzhalter.groesse[2], def.id).toBeCloseTo(def.platzhalter.groesse[2]);
    }
  });

  it('das alte Ladenlokal steht im Level, kostet Geld und braucht Level 3', () => {
    const { plots, ren } = setup();
    const p = plots.list.find((x) => x.id === 'altes_ladenlokal')!;
    expect(p.freischaltLevel).toBe(3);
    expect(ren.needs('altes_ladenlokal')).toBe(true);
    expect(ren.parts('altes_ladenlokal').length).toBeGreaterThan(20);
    expect(ren.cost('altes_ladenlokal')).toBeGreaterThan(2000);
    expect(ren.needs('bauplatz_west')).toBe(false);
  });

  it('renovieren: erst kaufen, dann zahlen, nach der Arbeitszeit ist alles frisch', () => {
    const { world, player, plots, ren } = setup();
    expect(ren.start('altes_ladenlokal')).toEqual({ ok: false, grund: 'nicht_besessen' });
    expect(plots.buy('altes_ladenlokal').ok).toBe(true);
    const geld = player.geld, kosten = ren.cost('altes_ladenlokal'), xp = player.xp;
    expect(ren.start('altes_ladenlokal').ok).toBe(true);
    expect(player.geld).toBeCloseTo(geld - kosten);
    expect(ren.start('altes_ladenlokal')).toEqual({ ok: false, grund: 'laeuft' });
    const minuten = ren.minutes('altes_ladenlokal');
    ren.update(minuten / 2);
    expect(ren.progress('altes_ladenlokal')).toBeCloseTo(0.5);
    expect(typen(world)).toContain('altbau_wand');
    ren.update(minuten / 2 + 1);
    expect(ren.progress('altes_ladenlokal')).toBeNull();
    expect(ren.needs('altes_ladenlokal')).toBe(false);
    const t = typen(world);
    expect(t).not.toContain('geruempel');
    expect(t).toContain('wand_weiss');
    expect(t).toContain('eingang_schiebetuer');
    expect(t.filter((x) => x === 'schaufenster_gross').length).toBe(3);
    expect(t.filter((x) => x === 'boden_fliese_innen').length).toBe(12);
    expect(player.xp).toBe(xp + stadt.renovierung.xp);
  });

  it('eine laufende Renovierung steht im Spielstand', () => {
    const a = setup();
    a.plots.buy('altes_ladenlokal');
    a.ren.start('altes_ladenlokal');
    a.ren.update(30);
    const saved = JSON.parse(JSON.stringify(a.ren.state()));
    const b = setup();
    b.plots.restore(a.plots.state());
    b.ren.restore(saved);
    expect(b.ren.progress('altes_ladenlokal')).toBeCloseTo(a.ren.progress('altes_ladenlokal')!);
    b.ren.update(10000);
    expect(b.ren.needs('altes_ladenlokal')).toBe(false);
  });
});
