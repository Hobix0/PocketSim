import { levelUnlocks } from '../src/economy/Research';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { PlayerState } from '../src/state/PlayerState';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { createCartonEntity } from '../src/factory/createProductEntity';
import { CartonStorage } from '../src/world/CartonStorage';
import { Utilities } from '../src/economy/Utilities';
import { Production } from '../src/economy/Production';
import { MachineComponent } from '../src/components/MachineComponent';
import { CartonComponent } from '../src/components/CartonComponent';
import { ShelfComponent } from '../src/components/ShelfComponent';
import { stockFromCarton } from '../src/economy/Stocking';
import { applyWorld, collectWorld } from '../src/save/SaveGame';

// Wertschöpfungskette: Versorgung, Rohstoffe, Rezepte, Maschinen.

const content = new Content();
const player = (geld = 10000, xp = 2000) => new PlayerState('t', { geld, xp }, { xpFuerLevel: [0, 100, 250, 500, 900] });

function setup() {
  const w = new World(new THREE.Group());
  const p = player();
  const utilities = new Utilities(content.versorgung, p);
  const ctx: Parameters<typeof createBuildEntity>[2] = { content };
  const storage = new CartonStorage(w, ctx);
  const production = new Production(w, content, storage, utilities, levelUnlocks(() => p.level), () => [...w.query(MachineComponent)].map(([, m]) => m));
  let starts = 0, finished = 0;
  ctx.machine = { production, minutesPerSecond: 1, started: () => { starts++; }, finished: () => { finished++; } };
  w.add(createBuildEntity(content.bau.get('europalette'), { position: [3, 0.05, 0], drehung: 0 }, ctx));
  w.add(createBuildEntity(content.bau.get('europalette'), { position: [3, 0.05, 2], drehung: 0 }, ctx));
  const backstation = w.add(createBuildEntity(content.bau.get('backstation'), { position: [0, 0.05, 0], drehung: 0 }, ctx));
  return { w, p, utilities, storage, production, backstation, ctx, counts: () => ({ starts, finished }) };
}

const teig = () => content.rohstoffe.get('teiglinge_broetchen');
const cartons = (w: World, id: string) => [...w.query(CartonComponent)].filter(([, c]) => c.produkt.id === id).map(([, c]) => c.menge);

describe('Daten', () => {
  it('Rohstoffe sind getrennt von Produkten, Rezepte verweisen auf bekannte Waren und Maschinen', () => {
    expect(content.produkte.has('teiglinge_broetchen')).toBe(false);
    expect(content.waren.has('teiglinge_broetchen')).toBe(true);
    expect(teig().rohstoff).toBe(true);
    const r = content.rezepte.get('broetchen_backen');
    expect(content.bau.all().some((b) => b.maschine?.typ === r.maschine)).toBe(true);
  });
});

describe('Versorgung', () => {
  it('zählt den Verbrauch, rechnet zum Tagesende ab und lässt sich ausbauen', () => {
    const p = player(3000, 300);
    const u = new Utilities(content.versorgung, p);
    u.run(120, { strom: 3, wasser: 30 });       // 2 Stunden
    expect(u.verbrauch('strom')).toBeCloseTo(6);
    expect(u.verbrauch('wasser')).toBeCloseTo(60);
    const bill = u.bill();
    expect(bill.strom).toBeCloseTo(6 * content.versorgung.strom.preis);
    expect(p.geld).toBeCloseTo(3000 - bill.strom - bill.wasser);
    expect(u.verbrauch('strom')).toBe(0);
    const before = u.anschluss('strom');
    expect(u.upgrade('strom')).toEqual({ ok: true });
    expect(u.anschluss('strom')).toBeGreaterThan(before);
    const again = new Utilities(content.versorgung, p);
    again.restore(u.state());
    expect(again.anschluss('strom')).toBe(u.anschluss('strom'));
  });

  it('Rechnungen werden auch bezahlt, wenn das Geld nicht reicht', () => {
    const p = player(0);
    const u = new Utilities(content.versorgung, p);
    u.run(600, { strom: 5, wasser: 0 });
    u.bill();
    expect(p.geld).toBeLessThan(0);
  });
});

describe('Produktion', () => {
  it('ohne Rohstoffe startet nichts – mit Rohstoffen läuft die Maschine und liefert ins Lager', () => {
    const { w, storage, backstation, counts } = setup();
    const m = backstation.require(MachineComponent);
    m.choose(content.rezepte.get('broetchen_backen'));
    const fail = m.start();
    expect(fail).toMatchObject({ ok: false, grund: 'rohstoffe', fehlt: [{ ware: 'teiglinge_broetchen', menge: 20 }] });
    storage.deliver(teig(), 20);
    expect(m.start().ok).toBe(true);
    expect(cartons(w, 'teiglinge_broetchen')).toEqual([]);   // leerer Karton verschwindet
    for (let i = 0; i < 39; i++) w.update(1);
    expect(m.laeuft).toBe(true);
    w.update(1.5);
    expect(cartons(w, 'broetchen')).toEqual([20]);
    expect(counts()).toEqual({ starts: 1, finished: 1 });
    expect(m.status).toBe('wartet_rohstoffe');                 // wiederholen, aber nichts mehr da
  });

  it('der Stromanschluss begrenzt, was gleichzeitig laufen darf', () => {
    const { w, storage, ctx } = setup();
    const r = content.rezepte.get('broetchen_backen');
    const machines = [0, 1, 2].map((i) => w.add(createBuildEntity(content.bau.get('backstation'), { position: [-3 + i * 2, 0.05, 4], drehung: 0 }, ctx)).require(MachineComponent));
    for (let i = 0; i < 3; i++) storage.deliver(teig(), 20);
    const results = machines.map((m) => { m.choose(r); return m.start(); });
    // 8 kW Anschluss: zwei Backstationen (je 3,5 kW) passen, die dritte nicht
    expect(results.map((x) => x.ok)).toEqual([true, true, false]);
    expect(results[2]).toMatchObject({ grund: 'strom' });
  });

  it('Rohstoffe gehören nicht ins Regal', () => {
    const w = new World(new THREE.Group());
    const shelf = w.add(createBuildEntity(content.bau.get('wandregal_weiss'), { position: [0, 0, 0], drehung: 0 }, { content }));
    const carton = w.add(createCartonEntity(teig(), 20, { content }));
    expect(stockFromCarton(carton, shelf)).toEqual({ ok: false, grund: 'rohstoff' });
    expect(shelf.require(ShelfComponent).add(teig(), 5)).toBe(0);
  });

  it('der Zustand einer laufenden Maschine überlebt Speichern und Laden', () => {
    const { w, storage, backstation, ctx } = setup();
    const m = backstation.require(MachineComponent);
    storage.deliver(teig(), 20);
    m.choose(content.rezepte.get('broetchen_backen'));
    m.start();
    for (let i = 0; i < 10; i++) w.update(1);
    const saved = JSON.parse(JSON.stringify(collectWorld(w, content)));
    const w2 = new World(new THREE.Group());
    applyWorld(saved, w2, content, ctx);
    const m2 = [...w2.query(MachineComponent)][0][1];
    expect([m2.rezept?.id, m2.laeuft, Math.round(m2.fortschritt)]).toEqual(['broetchen_backen', true, 10]);
  });

  it('Gewinn je Durchgang: Verkaufswert minus Rohstoffe', () => {
    const { production } = setup();
    const r = content.rezepte.get('broetchen_backen');
    const out = content.waren.get('broetchen');
    expect(production.margin(r)).toBeCloseTo(out.vk * 20 - teig().ek * 20);
  });
});
