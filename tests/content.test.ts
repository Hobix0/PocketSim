import { describe, expect, it } from 'vitest';
import { Content } from '../src/content/Content';
import { Registry } from '../src/content/Registry';
import { validateBuild, validateProduct } from '../src/content/definitions';
import { readData } from '../src/core/Data';
import { expandObjects, type LevelData } from '../src/world/Level';

describe('Spieldaten in data/', () => {
  it('lassen sich vollständig laden und prüfen', () => {
    const c = new Content();
    expect(c.kategorien.size).toBe(10);
    expect(c.produkte.size).toBeGreaterThan(0);
    expect(c.bau.size).toBeGreaterThan(0);
    for (const p of c.produkte.all()) expect(p.vk).toBeGreaterThan(p.ek);
  });

  it('jedes Objekt in jedem Level verweist auf ein Bauelement oder Produkt', () => {
    const c = new Content();
    for (const id of ['testgelaende', 'musterschau']) {
      const level = readData<LevelData>(`level/${id}`);
      for (const o of level.objekte) {
        if (o.produkt !== undefined) expect(c.produkte.has(o.produkt), `${id}: ${o.produkt}`).toBe(true);
        else expect(c.bau.has(o.typ ?? ''), `${id}: ${o.typ}`).toBe(true);
      }
    }
  });

  it('enthält alle Modelle aus dem Blender-Export, jeweils mit vorhandener Datei', () => {
    const c = new Content();
    expect(c.produkte.size).toBe(150);
    expect(c.bau.size).toBe(61);
    const files = new Set(Object.keys(import.meta.glob('/data/3d/**/*.{fbx,png}')));
    for (const d of [...c.produkte.all(), ...c.bau.all()]) {
      expect(files.has(`/data/${d.model}`), `${d.id}: Modell ${d.model}`).toBe(true);
      expect(files.has(`/data/${d.icon}`), `${d.id}: Icon ${d.icon}`).toBe(true);
    }
  });

  it('jede Warenkategorie hat 15 Produkte', () => {
    const c = new Content();
    for (const k of c.kategorien.all()) {
      expect(c.produkte.all().filter((p) => p.kategorie === k.id).length, k.id).toBe(15);
    }
  });
});

describe('Level', () => {
  it('löst Wiederholungen zu einzelnen Objekten auf', () => {
    const list = expandObjects([
      { typ: 'boden_fliese_innen', position: [-6, 0, -4], drehung: 0, wiederholen: { anzahl: [3, 2], abstand: [2, 2] } },
      { typ: 'kasse_schwarz', position: [1, 0.05, 2], drehung: 90 },
    ]);
    expect(list).toHaveLength(7);
    expect(list.map((o) => o.position)).toContainEqual([-2, 0, -2]);
    expect(list[6]).toEqual({ typ: 'kasse_schwarz', position: [1, 0.05, 2], drehung: 90 });
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
