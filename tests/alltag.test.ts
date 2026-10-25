import { afterEach, describe, expect, it } from 'vitest';
import { Content } from '../src/content/Content';
import { ShelfComponent } from '../src/components/ShelfComponent';
import { Deliveries } from '../src/economy/Deliveries';
import { CustomerSpawner } from '../src/economy/Customers';
import { dayFactor, isRestDay, nextWorkday, weekday } from '../src/state/Week';
import { Weather, type WeatherSettings } from '../src/world/Weather';
import wetter from '../data/wetter/standard.json';
import frische from '../data/sortiment/frische.json';

// Alltag im kleinen Laden: Wochenrhythmus (Sonntag Ruhetag), frische Ware mit Haltbarkeit, Wetter.

const content = new Content();
const DAY = 24 * 60;
const woche = content.kunden.woche!;

describe('Wochenrhythmus', () => {
  it('Tag 1 ist Montag, Tag 7 Sonntag – Ruhetag; samstags ist am meisten los', () => {
    expect(weekday(0)).toBe(0);
    expect(isRestDay(woche, 6 * DAY + 600)).toBe(true);
    expect(isRestDay(woche, 5 * DAY + 600)).toBe(false);
    expect(dayFactor(woche, 5 * DAY)).toBeGreaterThan(dayFactor(woche, 0));
    expect(nextWorkday(woche, 6 * DAY + 100)).toBe(7 * DAY);
  });

  it('sonntags kommt kein LKW: Bestellungen kommen Montag zum ersten Termin', () => {
    let now = 6 * DAY + 10 * 60; // Sonntag 10:00
    const d = new Deliveries(content.logistik, { freeSlots: () => 99 }, () => now);
    d.woche = woche;
    const erster = Number(content.logistik.liefertermine[0].split(':')[0]) * 60;
    expect(d.arrival('normal')).toBe(7 * DAY + erster);
    expect(d.arrival('express')).toBe(7 * DAY + erster);
    // Samstagabend nach dem letzten Termin: auch Montag
    now = 5 * DAY + 23 * 60;
    expect(d.arrival('normal')).toBe(7 * DAY + erster);
    // Werktags wie bisher
    now = 2 * DAY + 60;
    expect(d.arrival('normal')).toBe(2 * DAY + erster);
  });

  it('der Spawner bringt mit Faktor 0 niemanden', () => {
    const s = new CustomerSpawner(content.kunden, () => 0.9);
    expect(s.spawns(60, 12 * 60, 50, 0, 20, 1, 0)).toBe(0);
    expect(s.spawns(60, 12 * 60, 50, 0, 20, 1, 1)).toBeGreaterThan(0);
  });
});

describe('Frische Ware', () => {
  let heute = 1;
  ShelfComponent.frische = { heute: () => heute, haltbar: (p) => (p.frisch ? (frische.haltbarTage as Record<string, number>)[p.kategorie] ?? null : null), rabatt: frische.rabatt };
  afterEach(() => { heute = 1; });
  const brot = content.produkte.all().find((p) => p.kategorie === 'backwaren' && p.frisch && !p.kuehlung)!;
  const nudeln = content.produkte.all().find((p) => p.kategorie === 'grundnahrung' && !p.kuehlung)!;
  const regal = () => new ShelfComponent({ faecher: 2, kapazitaet: 20, kuehlung: false, mitte: 0, laenge: 1 });

  it('die älteste Ware geht zuerst; am letzten Tag ist sie reduziert', () => {
    const s = regal();
    s.add(brot, 4);
    heute = 2;
    s.add(brot, 4); // gleiches Fach, neue Charge
    expect(s.faecher[0].chargen).toEqual([{ tag: 1, menge: 4 }, { tag: 2, menge: 4 }]);
    // Brot hält 2 Tage: die Charge von Tag 1 ist an Tag 2 reduziert
    expect(s.hatReduziert(brot.id)).toBe(true);
    expect(s.takeFresh(brot.id, 5)).toEqual({ n: 5, reduziert: 4 });
    expect(s.hatReduziert(brot.id)).toBe(false);
  });

  it('abgelaufene Ware kommt am nächsten Morgen heraus; haltbare Ware bleibt', () => {
    const s = regal();
    s.add(brot, 6);
    s.add(nudeln, 6);
    heute = 3;
    const ab = s.expire();
    expect(ab).toEqual([{ produkt: brot, menge: 6 }]);
    expect(s.menge(brot.id)).toBe(0);
    expect(s.menge(nudeln.id)).toBe(6);
  });

  it('Chargen stehen im Spielstand; alte Spielstände bekommen „heute“', () => {
    const s = regal();
    s.add(brot, 3);
    heute = 2;
    const b = regal();
    b.loadState(JSON.parse(JSON.stringify(s.saveState())), (id) => content.produkte.find(id));
    expect(b.faecher[0].chargen).toEqual([{ tag: 1, menge: 3 }]);
    const c = regal();
    c.loadState([{ produkt: brot.id, menge: 5 }], (id) => content.produkte.find(id));
    expect(c.faecher[0].chargen).toEqual([{ tag: 2, menge: 5 }]);
  });

  it('was an die Tafel geht, zählt in den Bericht und bringt etwas Ruf', async () => {
    const { StoreStats } = await import('../src/economy/StoreStats');
    const { PlayerState } = await import('../src/state/PlayerState');
    const stats = new StoreStats(content.kunden, new PlayerState('t', { geld: 0, xp: 0 }, { xpFuerLevel: [0] }));
    const ruf = stats.ruf;
    stats.recordDonation([{ produkt: brot, menge: 10 }], frische.tafel.rufJeStueck, frische.tafel.rufMax);
    expect(stats.ruf).toBeGreaterThan(ruf);
    expect(stats.closeDay(2).tafel).toEqual({ stueck: 10, wert: Math.round(brot.ek * 10 * 100) / 100 });
  });
});

describe('Wetter', () => {
  it('der erste Tag ist freundlich; die Vorhersage tritt am nächsten Tag ein; steht im Spielstand', () => {
    let r = 0.99;
    const w = new Weather(wetter as WeatherSettings, () => r);
    expect(w.heute.id).toBe('sonnig');
    expect(w.morgen.id).toBe('regen');
    w.newDay();
    expect(w.heute.id).toBe('regen');
    expect(w.kundenFaktor).toBeLessThan(1);
    r = 0.1;
    const b = new Weather(wetter as WeatherSettings, () => r);
    b.restore(JSON.parse(JSON.stringify(w.state())));
    expect(b.heute.id).toBe('regen');
    expect(b.regen).toBe(1);
  });

  it('über viele Tage kommt jede Wetterart vor, Sonne am häufigsten', () => {
    const w = new Weather(wetter as WeatherSettings);
    const n: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) { w.newDay(); n[w.heute.id] = (n[w.heute.id] ?? 0) + 1; }
    expect(Object.keys(n).sort()).toEqual(['bewoelkt', 'regen', 'sonnig']);
    expect(n.sonnig).toBeGreaterThan(n.regen);
  });
});
