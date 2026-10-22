import { describe, expect, it } from 'vitest';
import { Content } from '../src/content/Content';
import { Registry } from '../src/content/Registry';
import { validateBuild, validateProduct } from '../src/content/definitions';
import { readData } from '../src/core/Data';
import { expandObjects, type LevelData } from '../src/world/Level';

describe('Spieldaten in data/', () => {
  it('lassen sich vollständig laden und prüfen', () => {
    const c = new Content();
    expect(c.kategorien.size).toBe(16); // 10 Warengruppen aus dem Großhandel, Café, Kuchen, Mode, Accessoires, Schuhe + Rohstoffe
    expect(c.rohstoffe.all().every((r) => r.rohstoff && r.kategorie === 'rohstoffe')).toBe(true);
    expect(c.produkte.size).toBeGreaterThan(0);
    expect(c.bau.size).toBeGreaterThan(0);
    for (const p of c.produkte.all()) expect(p.vk).toBeGreaterThan(p.ek);
    expect(c.rezepte.size).toBeGreaterThan(0);
  });

  it('jedes Objekt in jedem Level verweist auf ein Bauelement oder Produkt', () => {
    const c = new Content();
    for (const id of ['start', 'testgelaende', 'musterschau']) {
      const level = readData<LevelData>(`level/${id}`);
      for (const o of expandObjects(level.objekte)) {
        if (o.produkt !== undefined) expect(c.produkte.has(o.produkt), `${id}: ${o.produkt}`).toBe(true);
        else expect(c.bau.has(o.typ ?? ''), `${id}: ${o.typ}`).toBe(true);
      }
    }
  });

  it('enthält alle Modelle aus dem Blender-Export, jeweils mit vorhandener Datei', () => {
    const c = new Content();
    expect(c.produkte.size).toBe(166); // 150 aus dem Blender-Export + 2 Café + 3 Kuchen + 11 Mode
    // 61 Bauelemente aus Blender, davon eins (Markise) durch ein Voxel-Modell ersetzt; weitere haben Voxel-Modelle (eigen/…)
    const fbx = c.bau.all().filter((d) => d.model && !d.model.startsWith('eigen/'));
    expect(fbx.length).toBe(60);
    const files = new Set(Object.keys(import.meta.glob('/data/3d/**/*.{fbx,png}')));
    for (const d of [...c.produkte.all().filter((p) => !p.model?.startsWith('eigen/')), ...fbx]) {
      expect(files.has(`/data/${d.model}`), `${d.id}: Modell ${d.model}`).toBe(true);
      expect(files.has(`/data/${d.icon}`), `${d.id}: Icon ${d.icon}`).toBe(true);
    }
  });

  it('jede Warengruppe aus dem Großhandel hat 15 Produkte', () => {
    const c = new Content();
    for (const k of c.kategorien.all().filter((k) => !['rohstoffe', 'cafe', 'kuchen', 'mode', 'accessoires', 'schuhe'].includes(k.id))) {
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
  const milch = { id: 'milch_1l', name: 'Milch', kategorie: 'molkerei_eier', ek: 0.69, vk: 1.09, gebinde: 12, frisch: true, freischaltLevel: 1 };

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
    expect(() => validateBuild({ id: 'x', name: 'X', kategorie: 'k', ebene: 'objekt', preis: 1, freischaltLevel: 1, platzhalter: { groesse: [1, 2], farbe: '#fff' } }, 'bau/x.json'))
      .toThrow(/groesse.*drei Zahlen/);
  });
});

describe('Bodenmarkierungen', () => {
  const m = new Content().markierungen;
  it('hat Farben, Breiten und gültige Stempel', () => {
    expect(m.farben.length).toBeGreaterThan(3);
    for (const f of m.farben) expect(f.farbe).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.breiten.every((b) => b > 0 && b <= 1)).toBe(true);
    const ids = new Set<string>();
    for (const s of m.stempel) {
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(s.preis).toBeGreaterThanOrEqual(0);
      expect(s.groesse.every((g) => g > 0)).toBe(true);
      for (const f of s.formen) expect(!!f.pfad || !!f.text).toBe(true);
    }
  });
});
