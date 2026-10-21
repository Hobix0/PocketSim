import { describe, expect, it } from 'vitest';
import { Content } from '../src/content/Content';
import { readData, hasData } from '../src/core/Data';
import { validateSave, type SaveData } from '../src/save/SaveGame';

// Der mitgelieferte Testmarkt (data/spielstaende/testmarkt.json, erzeugt mit scripts/make-testmarkt.mjs)
// muss zu den aktuellen Daten passen – sonst fehlen nach Umbenennungen Bauteile.

describe('Testmarkt-Spielstand', () => {
  const content = new Content();
  it('ist gültig und kennt alle Bauteile und Produkte', () => {
    expect(hasData('spielstaende/testmarkt')).toBe(true);
    const save = validateSave(readData<SaveData>('spielstaende/testmarkt'));
    expect(save.bauten.length).toBeGreaterThan(200);
    const unbekannt = save.bauten.map((b) => b.typ).filter((t) => !content.bau.find(t));
    expect(unbekannt).toEqual([]);
    const ware = save.kartons.map((k) => k.produkt).filter((p) => !content.waren.has(p));
    expect(ware).toEqual([]);
    expect(save.personal.team.map((e) => e.rolle).sort()).toEqual(['auffueller', 'auffueller', 'einkaeufer', 'kassierer', 'kassierer', 'kassierer', 'lagerist']);
  });
});
