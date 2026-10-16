import { describe, expect, it } from 'vitest';
import { Content } from '../src/content/Content';
import { Registry } from '../src/content/Registry';
import { validateBuild, validateProduct } from '../src/content/definitions';
import { readData } from '../src/core/Data';
import type { LevelData } from '../src/world/Level';

describe('Spieldaten in data/', () => {
  it('lassen sich vollständig laden und prüfen', () => {
    const c = new Content();
    expect(c.kategorien.size).toBe(10);
    expect(c.produkte.size).toBeGreaterThan(0);
    expect(c.bau.size).toBeGreaterThan(0);
    for (const p of c.produkte.all()) expect(p.vk).toBeGreaterThan(p.ek);
  });

  it('jedes Objekt im Testgelände verweist auf ein Bauelement', () => {
    const c = new Content();
    const level = readData<LevelData>('level/testgelaende');
    for (const o of level.objekte) expect(c.bau.has(o.typ), o.typ).toBe(true);
  });
});

describe('Registry', () => {
  const milch = { id: 'milch_1l', name: 'Milch', kategorie: 'molkerei_eier', ek: 0.69, vk: 1.09, frisch: true, freischaltLevel: 1 };

  it('liest Einträge und findet sie per id', () => {
    const r = new Registry('produkte', [{ file: 'milch_1l', data: milch }], validateProduct);
    expect(r.get('milch_1l').vk).toBe(1.09);
    expect(r.find('gibts_nicht')).toBeUndefined();
    expect(() => r.get('gibts_nicht')).toThrow(/unbekannte id/);
  });

  it('meldet, wenn id und Dateiname nicht passen', () => {
    expect(() => new Registry('produkte', [{ file: 'milch', data: milch }], validateProduct)).toThrow(/passt nicht zum Dateinamen/);
  });

  it('meldet fehlende oder falsche Felder mit Datei und Feld', () => {
    const { vk: _vk, ...ohneVk } = milch;
    expect(() => new Registry('produkte', [{ file: 'milch_1l', data: ohneVk }], validateProduct))
      .toThrow('produkte/milch_1l.json: "vk" muss eine Zahl sein');
    expect(() => validateBuild({ id: 'x', name: 'X', kategorie: 'k', preis: 1, freischaltLevel: 1, platzhalter: { groesse: [1, 2], farbe: '#fff' } }, 'bau/x.json'))
      .toThrow(/groesse.*drei Zahlen/);
  });
});
