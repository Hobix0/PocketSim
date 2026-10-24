import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { PlayerState } from '../src/state/PlayerState';
import { Plots } from '../src/world/Plots';
import { Renovations } from '../src/world/Renovations';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { buildingDoor, buildingParts, expandObjects, type LevelData } from '../src/world/Level';
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

describe('Immobilienmarkt', () => {
  it('Angebote in klein, mittel, groß und leere Grundstücke; die Gebäude kommen aus dem Generator', () => {
    const angebote = (level.grundstuecke ?? []).filter((p) => p.angebot);
    expect(new Set(angebote.map((p) => p.angebot!.groesse))).toEqual(new Set(['klein', 'mittel', 'gross', 'grundstueck']));
    const teile = expandObjects(level.objekte);
    const imRect = (id: string, typ: string) => {
      const r = angebote.find((p) => p.id === id)!.rect;
      return teile.filter((o) => o.typ === typ && o.position[0] > r.minX && o.position[0] < r.maxX && o.position[2] > r.minZ && o.position[2] < r.maxZ).length;
    };
    expect(imRect('laden_mittel_ost', 'boden_fliese_innen')).toBe(20); // 10 × 8 m
    expect(imRect('laden_gross_ost', 'altbau_boden')).toBe(40); // 16 × 10 m, Altbau
    expect(imRect('grundstueck_gross_west', 'boden_fliese_innen')).toBe(0);
  });

  it('mieten: erste Miete sofort, dann jeden Morgen; nach drei Tagen ohne Geld endet der Vertrag', () => {
    const player = new PlayerState('t', { geld: 300, xp: 300 }, { xpFuerLevel: [0, 100, 250, 500, 900] });
    const plots = new Plots(level.grundstuecke ?? [], player);
    expect(plots.rent('bauplatz_west')).toEqual({ ok: false, grund: 'keine_miete' });
    expect(plots.rent('laden_klein_ost').ok).toBe(true);
    expect(player.geld).toBe(190);
    expect(plots.isOwned('laden_klein_ost') && plots.isRented('laden_klein_ost')).toBe(true);
    expect(plots.allows(25, 0)).toBe(true);
    plots.payRent();
    expect(player.geld).toBe(80);
    const ended: string[] = [];
    plots.events.on('ended', ({ grund }) => ended.push(grund));
    plots.payRent(); plots.payRent(); plots.payRent();
    expect(ended).toEqual(['keine_miete']);
    expect(plots.isOwned('laden_klein_ost')).toBe(false);
  });

  it('kündigen nur, wenn leer; kaufen beendet die Miete; steht im Spielstand', () => {
    const player = new PlayerState('t', { geld: 50000, xp: 900 }, { xpFuerLevel: [0, 100, 250, 500, 900] });
    const plots = new Plots(level.grundstuecke ?? [], player);
    plots.rent('laden_mittel_ost');
    expect(plots.cancel('laden_mittel_ost', () => false)).toEqual({ ok: false, grund: 'nicht_leer' });
    const b = new Plots(level.grundstuecke ?? [], player);
    b.restoreRent(JSON.parse(JSON.stringify(plots.rentState())));
    expect(b.isRented('laden_mittel_ost')).toBe(true);
    expect(plots.cancel('laden_mittel_ost').ok).toBe(true);
    expect(plots.isOwned('laden_mittel_ost')).toBe(false);
    b.buy('laden_mittel_ost');
    expect(b.isRented('laden_mittel_ost')).toBe(false);
    expect(b.isOwned('laden_mittel_ost')).toBe(true);
    expect(b.mieteProTag).toBe(0);
  });
});

describe('Wohnhäuser', () => {
  it('Laden unten, Wohnetagen darüber, Satteldach mit einem Schornstein', () => {
    const teile = buildingParts({ rect: { minX: 0, maxX: 6, minZ: -3, maxZ: 3 }, zustand: 'neu', etagen: 2, farbe: 'rosa', dach: 'rot' });
    const t = teile.map((o) => o.typ!);
    expect(t.filter((x) => x === 'schaufenster_gross').length).toBe(2);
    expect(t.filter((x) => x.startsWith('wohn_') && x.endsWith('_rosa') && !x.includes('ecke')).length).toBe(2 * (3 + 3 + 3 + 3)); // je Etage vorne, hinten, zwei Seiten
    expect(t.filter((x) => x.startsWith('satteldach_6_rot')).length).toBe(3);
    expect(t.filter((x) => x.endsWith('_kamin')).length).toBe(1);
    expect(teile.find((o) => o.typ!.startsWith('satteldach'))!.position[1]).toBe(10); // 4 m Laden + 2 × 3 m
    for (const id of new Set(t)) {
      const def = content.bau.get(id);
      if (id.startsWith('wohn_') && !id.includes('_eg_') && !id.includes('tuer')) expect(def.obergeschoss, id).toBe(true);
    }
  });

  it('Südseite: das Wohnhaus dreht sich zur Straße, aus der Haustür kommen Kunden', () => {
    const spec = { rect: { minX: 0, maxX: 8, minZ: 14, maxZ: 22 }, zustand: 'neu' as const, wohnhaus: true, etagen: 1, blick: 'nord' as const, tuer: 0 };
    const teile = buildingParts(spec);
    const tuer = teile.find((o) => o.typ!.startsWith('wohn_tuer'))!;
    expect(tuer.position[2]).toBeCloseTo(13.9);
    expect(tuer.position[0]).toBe(7); // links von der Straße aus gesehen
    expect(tuer.drehung).toBe(90);
    expect(teile.some((o) => o.typ === 'boden_fliese_innen')).toBe(false);
    expect(buildingDoor(spec)).toEqual([7, 0.14, 13.3]);
    const tueren = expandObjects(level.objekte).filter((o) => o.typ?.startsWith('wohn_tuer'));
    expect(tueren.length).toBeGreaterThanOrEqual(8);
  });
});

describe('Lage', () => {
  it('ein weiterer Laden mit Ware bringt Kundschaft – je nach Größe, Lage und Parkplatz', async () => {
    const { Locations } = await import('../src/world/Locations');
    const { ShelfComponent } = await import('../src/components/ShelfComponent');
    const world = new World(new THREE.Group());
    const player = new PlayerState('t', { geld: 100000, xp: 900 }, { xpFuerLevel: [0, 100, 250, 500, 900] });
    const plots = new Plots(level.grundstuecke ?? [], player);
    const loc = new Locations(world, plots, stadt.lage);
    const p = (id: string) => plots.list.find((x) => x.id === id)!;
    expect(loc.potential(p('laden_mittel_ost'))).toBeGreaterThan(loc.potential(p('laden_sued_ost'))); // Einkaufsstraße schlägt Wohnstraße
    expect(loc.potential(p('fachmarkt_west'))).toBeCloseTo(0.8 * 0.8 * 1.25); // groß · Stadtrand · Parkplatz
    expect(loc.factor()).toBe(1);
    plots.rent('laden_mittel_ost');
    const regal = world.add(createBuildEntity(content.bau.get('vr_wand_holz'), { position: [33, 0.05, -1], drehung: 0 }, { content }));
    expect(loc.factor()).toBe(1); // leeres Regal zählt nicht
    regal.require(ShelfComponent).add(content.produkte.all().find((x) => !x.kuehlung && !x.rohstoff)!, 5);
    expect(loc.factor()).toBe(1); // ohne Kasse kommt niemand
    world.add(createBuildEntity(content.bau.get('boutique_tresen'), { position: [30, 0.05, -3], drehung: 0 }, { content }));
    expect(loc.factor()).toBeCloseTo(1 + 0.55 * 1.3);
  });

  it('mehr Kundschaft heißt mehr Kunden je Stunde', async () => {
    const { CustomerSpawner } = await import('../src/economy/Customers');
    const zaehle = (lage: number) => { const s = new CustomerSpawner(content.kunden, () => 0.5); let n = 0; for (let i = 0; i < 600; i++) n += s.spawns(1, 12 * 60, 50, 0, undefined, 4, lage); return n; };
    expect(zaehle(1.7)).toBeGreaterThan(zaehle(1) * 1.5);
  });
});

describe('Wand an Wand', () => {
  it('die Wand der alten Markthalle gehört nicht zum neuen Nachbarladen', () => {
    const world = new World(new THREE.Group());
    const player = new PlayerState('t', { geld: 100000, xp: 900 }, { xpFuerLevel: [0, 100, 250, 500, 900] });
    const plots = new Plots(level.grundstuecke ?? [], player);
    for (const o of expandObjects(level.objekte)) {
      const def = o.typ ? content.bau.find(o.typ) : undefined;
      if (def && o.position[0] > 20 && o.position[2] < 8) world.add(createBuildEntity(def, o, { content }));
    }
    const ren = new Renovations(world, content, plots, player, { content }, stadt.renovierung);
    expect(ren.needs('laden_mittel_ost')).toBe(false);
    expect(ren.needs('laden_gross_ost')).toBe(true);
    expect(ren.parts('laden_gross_ost').filter((e) => e.typeId === 'altbau_wand').length).toBe(8 + 2 * 5); // hinten 8, Seiten je 5
  });
});

describe('Standorte', () => {
  it('Hauptladen mit Anbauten, jedes eigene Ladenlokal ein eigener Laden; die Art ergibt sich aus der Ware', async () => {
    const { Sites, HAUPTLADEN } = await import('../src/world/Sites');
    const { ShelfComponent } = await import('../src/components/ShelfComponent');
    const world = new World(new THREE.Group());
    const player = new PlayerState('t', { geld: 100000, xp: 900 }, { xpFuerLevel: [0, 100, 250, 500, 900] });
    const plots = new Plots(level.grundstuecke ?? [], player);
    const sites = new Sites(plots, world);
    expect(sites.list().map((s) => s.id)).toEqual([HAUPTLADEN]);
    expect(sites.at(0, 0)).toBe(HAUPTLADEN);
    expect(sites.at(6, 0)).toBeNull(); // Anbau Ost gehört noch nicht dazu
    plots.buy('ost');
    expect(sites.at(6, 0)).toBe(HAUPTLADEN);
    expect(sites.at(25, 0)).toBeNull();
    plots.rent('laden_klein_ost');
    expect(sites.at(25, 0)).toBe('laden_klein_ost');
    expect(sites.at(0, 5)).toBeNull(); // Gehweg
    expect(sites.at(-40, -30)).toBeNull(); // Industrie
    expect(sites.kind('laden_klein_ost')).toBe('leer');
    const staender = world.add(createBuildEntity(content.bau.get('kleiderstaender'), { position: [25, 0.05, 0], drehung: 0 }, { content }));
    staender.require(ShelfComponent).add(content.produkte.get('tshirt'), 6);
    expect(sites.kind('laden_klein_ost')).toBe('mode');
    sites.recordSale('laden_klein_ost', 29.8);
    expect(sites.today('laden_klein_ost')).toEqual({ umsatz: 29.8, kunden: 1 });
    sites.newDay();
    expect(sites.today('laden_klein_ost').kunden).toBe(0);
  });

  it('ein Auffüller mit festem Laden füllt nur dort Regale auf', async () => {
    const { findStockingTask } = await import('../src/economy/Stocking');
    const { createCartonEntity } = await import('../src/factory/createProductEntity');
    const world = new World(new THREE.Group());
    const hier = world.add(createBuildEntity(content.bau.get('vr_wand_holz'), { position: [0, 0.05, 0], drehung: 0 }, { content }));
    const dort = world.add(createBuildEntity(content.bau.get('vr_wand_holz'), { position: [25, 0.05, 0], drehung: 0 }, { content }));
    const p = content.produkte.all().find((x) => !x.kuehlung && !x.rohstoff)!;
    world.add(createCartonEntity(p, p.gebinde, { content })).object.position.set(1, 0, 3);
    expect(findStockingTask(world, () => true, undefined, (s) => s === dort)?.shelf).toBe(dort);
    expect(findStockingTask(world, () => true, undefined, (s) => s === hier)?.shelf).toBe(hier);
  });
});
