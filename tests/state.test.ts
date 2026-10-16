import { describe, expect, it } from 'vitest';
import { PlayerState, levelFor } from '../src/state/PlayerState';
import { GameClock } from '../src/state/GameClock';

const LEVELS = { xpFuerLevel: [0, 100, 250, 500] };

describe('PlayerState', () => {
  it('bucht Geld und meldet jede Buchung', () => {
    const p = new PlayerState('test', { geld: 100, xp: 0 }, LEVELS);
    const log: string[] = [];
    p.events.on('transaction', (t) => log.push(`${t.betrag} ${t.grund}`));
    p.earn(1.09, 'verkauf');
    expect(p.spend(50, 'einkauf')).toBe(true);
    expect(p.geld).toBe(51.09);
    expect(log).toEqual(['1.09 verkauf', '-50 einkauf']);
  });

  it('lehnt Ausgaben ab, die das Konto übersteigen', () => {
    const p = new PlayerState('test', { geld: 10, xp: 0 }, LEVELS);
    let changed = 0;
    p.events.on('changed', () => changed++);
    expect(p.spend(10.01, 'einkauf')).toBe(false);
    expect(p.geld).toBe(10);
    expect(changed).toBe(0);
  });

  it('rundet auf Cent', () => {
    const p = new PlayerState('test', { geld: 0, xp: 0 }, LEVELS);
    for (let i = 0; i < 10; i++) p.earn(0.1, 'verkauf');
    expect(p.geld).toBe(1);
  });

  it('berechnet Level und Fortschritt aus der XP und meldet jedes neue Level', () => {
    const p = new PlayerState('test', { geld: 0, xp: 0 }, LEVELS);
    const ups: number[] = [];
    p.events.on('levelUp', ({ level }) => ups.push(level));
    p.addXp(50);
    expect(p.level).toBe(1);
    expect(p.levelProgress).toBe(0.5);
    p.addXp(300); // 350 XP: über Level 2 hinweg direkt auf Level 3
    expect(p.level).toBe(3);
    expect(ups).toEqual([2, 3]);
    expect(p.xpToNext).toBe(150);
    p.addXp(1000);
    expect(p.level).toBe(4);
    expect(p.levelProgress).toBe(1);
    expect(p.xpToNext).toBe(0);
  });

  it('levelFor stimmt an den Grenzen', () => {
    expect(levelFor(99, LEVELS)).toBe(1);
    expect(levelFor(100, LEVELS)).toBe(2);
    expect(levelFor(500, LEVELS)).toBe(4);
  });
});

describe('GameClock', () => {
  const settings = { startTag: 1, startUhrzeit: '23:58', spielminutenProSekunde: 1, geschwindigkeiten: [1, 3, 8], wochentage: ['Mo', 'Di'] };

  it('zählt Spielminuten und gibt Spielsekunden für die Simulation zurück', () => {
    const c = new GameClock(settings);
    expect(c.uhrzeit).toBe('23:58');
    expect(c.update(1)).toBe(60);
    expect(c.uhrzeit).toBe('23:59');
  });

  it('meldet einen neuen Tag', () => {
    const c = new GameClock(settings);
    const days: number[] = [];
    c.events.on('newDay', ({ tag }) => days.push(tag));
    c.update(3);
    expect(days).toEqual([2]);
    expect(c.tag).toBe(2);
    expect(c.wochentag).toBe('Di');
    expect(c.uhrzeit).toBe('00:01');
  });

  it('steht in der Pause still und läuft in höheren Stufen schneller', () => {
    const c = new GameClock(settings);
    c.togglePause();
    expect(c.update(10)).toBe(0);
    expect(c.uhrzeit).toBe('23:58');
    c.setStufe(3); // hebt die Pause auf
    expect(c.paused).toBe(false);
    expect(c.update(1)).toBe(8 * 60);
    c.setStufe(99);
    expect(c.stufe).toBe(3);
  });
});
