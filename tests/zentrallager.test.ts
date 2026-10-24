import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { PlayerState } from '../src/state/PlayerState';
import { levelUnlocks } from '../src/economy/Research';
import { Production } from '../src/economy/Production';
import { Purchasing } from '../src/economy/Purchasing';
import { CentralWarehouse, type WarehouseSettings } from '../src/economy/CentralWarehouse';
import { MachineComponent } from '../src/components/MachineComponent';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import type { Utilities } from '../src/economy/Utilities';
import type { ProductDef } from '../src/content/definitions';
import settings from '../data/produktion/zentrallager.json';

// Produktion im Industriegebiet und das Zentrallager

const content = new Content();

function setup(besessen = true) {
  const w = new World(new THREE.Group());
  const p = new PlayerState('t', { geld: 50000, xp: 3000 }, { xpFuerLevel: [0, 100, 250, 500, 900, 1400, 2000] });
  let now = 0;
  let aktiv = besessen;
  const lager = new CentralWarehouse(settings as WarehouseSettings, content.waren, p, () => aktiv, () => now);
  const kaufen = new Purchasing(content.waren, p, lager, levelUnlocks(() => p.level));
  const strom = { anschluss: () => 999 } as unknown as Utilities;
  const production = new Production(w, content, { freeSlots: () => 0, deliver: () => {} }, strom, levelUnlocks(() => p.level),
    () => [...w.query(MachineComponent)].map(([, m]) => m), () => (lager.active() ? lager : null));
  const ctx: Parameters<typeof createBuildEntity>[2] = { content, machine: { production, minutesPerSecond: 1, started: () => {}, finished: () => {} } };
  return { w, p, lager, kaufen, production, ctx, zeit: (m: number) => { now += m; lager.update(); }, setAktiv: (a: boolean) => { aktiv = a; } };
}

describe('Produktionslinien', () => {
  it('jede Ware (außer Café-Getränken, die frisch im Laden entstehen) lässt sich auf einer Linie herstellen', () => {
    for (const p of content.produkte.all().filter((x) => x.kategorie !== 'cafe')) {
      const r = content.rezepte.find(`herstellen_${p.id}`);
      expect(r, p.id).toBeDefined();
      expect(content.bau.all().some((b) => b.maschine?.typ === r!.maschine && b.maschine.lager === 'zentral'), p.id).toBe(true);
    }
  });

  it('die Linien stehen im Forschungs-Tab Produktion; ihre Rezepte schalten mit frei', () => {
    expect(content.bau.get('linie_abfuellanlage').forschung).toBe('p_fabrik');
    expect(content.rezepte.get('herstellen_cola_0_5l').forschung).toBe('p_fabrik');
    expect(content.rezepte.get('herstellen_tshirt').forschung).toBe('p_textil');
    expect(content.forschung.filter((n) => n.baum === 'produktion').length).toBeGreaterThanOrEqual(6);
  });

  it('Rohstoffe kosten etwa 45 % des Einkaufspreises', () => {
    const p = content.produkte.get('sneaker');
    const r = content.rezepte.get('herstellen_sneaker');
    const kosten = r.eingang.reduce((n, l) => n + content.waren.get(l.ware).ek * l.menge, 0);
    expect(kosten / (p.ek * p.gebinde)).toBeCloseTo(0.45, 1);
  });
});

describe('Zentrallager', () => {
  it('ohne eigenes Zentrallager kann man nichts dorthin bestellen', () => {
    const { kaufen } = setup(false);
    const r = kaufen.order([{ produkt: 'grundstoff_getraenke', kartons: 1 }]);
    expect(r.ok).toBe(false);
  });

  it('Großhandel → Zentrallager → Produktionslinie → Zentrallager → Laden', () => {
    const { w, p, lager, kaufen, ctx, zeit } = setup();
    // 1. Rohstoffe ins Zentrallager bestellen; sie kommen nach der Lieferzeit
    const geld = p.geld;
    expect(kaufen.order([{ produkt: 'grundstoff_getraenke', kartons: 4 }]).ok).toBe(true);
    expect(p.geld).toBeLessThan(geld);
    expect(lager.available('grundstoff_getraenke')).toBe(0);
    zeit(settings.anlieferung.minuten);
    expect(lager.available('grundstoff_getraenke')).toBe(200);
    // 2. Die Abfüllanlage holt Rohstoffe aus dem Zentrallager und liefert dorthin
    const linie = w.add(createBuildEntity(content.bau.get('linie_abfuellanlage'), { position: [0, 0, 0], drehung: 0 }, ctx));
    const m = linie.require(MachineComponent);
    const cola = content.produkte.get('cola_0_5l');
    const r = content.rezepte.get('herstellen_cola_0_5l');
    m.choose(r);
    expect(m.start().ok).toBe(true);
    expect(lager.available('grundstoff_getraenke')).toBe(200 - r.eingang[0].menge);
    for (let i = 0; i <= r.dauer; i++) w.update(1);
    expect(lager.available('cola_0_5l')).toBeGreaterThanOrEqual(cola.gebinde);
    // 3. In den Laden bringen lassen: Kartons gehen auf den LKW (hier: eine Liste)
    const geliefert: ProductDef[] = [];
    const laden = { freeSlots: () => 10, deliver: (x: ProductDef) => geliefert.push(x), ship: () => 600 };
    const vorher = lager.available('cola_0_5l');
    const t = lager.send(cola, 1, laden);
    expect(t.ok).toBe(true);
    expect(geliefert).toEqual([cola]);
    expect(lager.available('cola_0_5l')).toBe(vorher - cola.gebinde);
    expect(lager.send(cola, 999, laden)).toEqual({ ok: false, grund: 'bestand' });
  });

  it('Linien ohne Zentrallager warten; der Bestand steht im Spielstand', () => {
    const a = setup();
    a.lager.put('grundstoff_textil', 120);
    a.kaufen.order([{ produkt: 'grundstoff_schuhe', kartons: 1 }]);
    const saved = JSON.parse(JSON.stringify(a.lager.state()));
    const b = setup();
    b.lager.restore(saved);
    expect(b.lager.available('grundstoff_textil')).toBe(120);
    b.zeit(settings.anlieferung.minuten);
    expect(b.lager.available('grundstoff_schuhe')).toBe(50);
    b.setAktiv(false);
    const linie = b.w.add(createBuildEntity(content.bau.get('linie_naehstrasse'), { position: [0, 0, 0], drehung: 0 }, b.ctx));
    const m = linie.require(MachineComponent);
    m.choose(content.rezepte.get('herstellen_tshirt'));
    expect(m.start()).toEqual({ ok: false, grund: 'zentrallager' });
  });
});

describe('Automatischer Nachschub', () => {
  it('schickt nach, was im Laden unter „im Laden halten“ fällt – höchstens so viel, wie da ist; steht im Spielstand', () => {
    const { lager } = setup();
    const cola = content.produkte.get('cola_0_5l');
    lager.put('cola_0_5l', cola.gebinde * 3);
    lager.setKeep('cola_0_5l', 5);
    const geliefert: ProductDef[] = [];
    const laden = { freeSlots: () => 20, deliver: (x: ProductDef) => geliefert.push(x), ship: () => 600 };
    // Im Laden ist 1 Karton: es fehlen 4, da sind nur 3
    expect(lager.restock(() => cola.gebinde, laden)).toBe(3);
    expect(geliefert.length).toBe(3);
    expect(lager.available('cola_0_5l')).toBe(0);
    // Schon genug im Laden: nichts
    lager.put('cola_0_5l', cola.gebinde * 2);
    expect(lager.restock(() => cola.gebinde * 5, laden)).toBe(0);
    const b = setup();
    b.lager.restore(JSON.parse(JSON.stringify(lager.state())));
    expect(b.lager.keep('cola_0_5l')).toBe(5);
  });
});
