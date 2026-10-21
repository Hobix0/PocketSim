// Baut den großen Testmarkt im laufenden Spiel und speichert ihn als Spielstand:
//   data/spielstaende/testmarkt.json  (im Spiel: Hauptmenü → „Testmarkt“ oder Adresse …/#testmarkt)
// Voraussetzung: Entwicklungsserver läuft (npx vite --port 5199) und Playwright mit Chromium ist installiert.
// Aufruf: node scripts/make-testmarkt.mjs [http://localhost:5199]
//
// Aufbau (Start-Level, alle Grundstücke gekauft):
//   Laden 20 × 6 m (Ost- und Westanbau dazu), Rückwand mit allen Regaltypen, Doppelreihen in der Mitte,
//   Kühlung und Truhen, 3 Kassen mit Kassierern, Lichtschienen mit Leuchten, Hängeschilder, Bodenmarkierungen.
//   Lager dahinter 20 × 6 m mit Palettenregalen, Durchgang zum Laden und Ladetor zum Gewerbehof (Asphalt).
//   Personal: 3 Kassierer, 2 Auffüller, 1 Lagerist, 1 Einkäufer. Level 10, viel Geld, alle Fächer fest belegt.

import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5199';
const pw = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(pw);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/#start`);
await page.waitForFunction(() => window.urbanEvolution);
await page.waitForTimeout(4000);

const save = await page.evaluate(async () => {
  const g = window.urbanEvolution;
  g.clock.setPaused(true);
  const { createBuildEntity } = await import('/src/factory/createBuildEntity.ts');
  const P = (id) => g.content.produkte.get(id);
  const add = (typ, x, y, z, r = 0) => g.world.add(createBuildEntity(g.content.bau.get(typ), { position: [x, y, z], drehung: r }, g.factory));
  const comp = (e, name) => [...e.components.values()].find((c) => c.constructor.name === name);
  const rm = (typ, x, z) => { for (const e of [...g.world.all()]) { const p = e.object.position; if (e.typeId === typ && Math.abs(p.x - x) < 0.05 && Math.abs(p.z - z) < 0.05) g.world.remove(e); } };

  // Spielerstand: alles freigeschaltet, alle Grundstücke
  g.player.addXp(6000);
  g.player.earn(150000, 'test');
  g.plots.restore(g.plots.list.map((p) => p.id));

  // ── Altes Innenleben und Zwischenwände weg ──
  for (const z of [-2, 0, 2]) { rm('ziegelwand', -4.1, z); rm('wand_weiss', 4.1, z); rm('attika_dachkante', -4.1, z); rm('attika_dachkante', 4.1, z); }
  for (const x of [-4.1, 4.1]) for (const z of [-3.1, 3.1]) rm('eckpfeiler_schwarz', x, z);
  for (const x of [-3, -1, 1, 3]) rm('attika_dachkante', x, -3.1);
  rm('pendelleuchte', -1, 0); rm('pendelleuchte', 1, 0);
  rm('einkaufsterminal', -3.45, -2.6); rm('europalette', 2.9, -2.55); rm('europalette', 2.9, -1.45);

  // ── Verkaufsraum 20 × 6 m ──
  for (const x of [-9, -7, -5, 5, 7, 9]) for (const z of [-2, 0, 2]) add('boden_fliese_innen', x, 0, z);
  for (const x of [-9, -5, 5, 7, 9]) add('wand_weiss', x, 0, -3.1, 90);
  add('wand_innen_durchgang', -7, 0, -3.1, 90);
  for (const z of [-2, 0, 2]) { add('ziegelwand', -10.1, 0, z, 180); add('wand_weiss', 10.1, 0, z, 0); add('attika_dachkante', -10.1, 4, z, 180); add('attika_dachkante', 10.1, 4, z, 0); }
  for (const x of [-9, -7, -5, 5, 7, 9]) { add('schaufenster_gross', x, 0, 3.1, -90); add('attika_dachkante', x, 4, 3.1, -90); }
  for (const x of [-7, 7]) add('markise_rot_weiss', x, 0, 3.1, -90);
  add('lichterkette', -9, 0, 3.1, -90); add('lichterkette', 9, 0, 3.1, -90);
  add('leuchtschild_offen', 5, 0, 3.1, -90); add('nasenschild_laden', -5, 0, 3.1, -90);
  for (const x of [-10.1, 10.1]) for (const z of [-9.1, -3.1, 3.1]) add('eckpfeiler_schwarz', x, 0, z);

  // Rückwand: Regale mit der Front zum Raum (drehung −90 → vorne ist +Z)
  const shelf = (typ, x, z, r) => add(typ, x, 0.05, z, r);
  const back = (typ, x, tiefe) => shelf(typ, x, -2.95 + tiefe / 2, -90);
  back('wandregal_schmal', -9.4, 0.5);
  add('einkaufsterminal', -8.45, 0.05, -2.65, 0);
  back('getraenkeregal', -5, 0.6); back('regal_landhaus', -3, 0.5); back('regal_landhaus', -1, 0.5);
  back('store_shelf_wall_01', 1, 0.54); back('wandregal_weiss', 3, 0.5);
  back('kuehlregal_offen', 5, 0.6); back('kuehlregal_offen', 7, 0.6); back('store_fridge_upright_01', 9.2, 0.793);
  // Doppelreihen in der Mitte (Rücken an Rücken), Tiefkühltruhen
  for (const x of [-4, -2, 1.5, 3.5]) { shelf('mittelregal_holz', x, -1.0, 90); shelf('mittelregal_holz', x, -0.4, -90); }
  shelf('kuehltruhe', 6.5, -0.7, -90); shelf('kuehltruhe', 8.6, -0.7, -90);
  // Vorne: Kassen (Kunden auf der Raumseite, Kassierer zum Fenster), Obst, Brot, Kassenregal
  for (const x of [-6.5, -2.5, 6.5]) add('kasse_schwarz', x, 0.05, 1.9, 90);
  shelf('obststand_kisten', 9.1, 2.2, 90); shelf('store_producestand_01', -8.8, 1.9, 0);
  shelf('brotregal', 3.2, 2.35, 90); shelf('kassenregal', -0.6, 2.4, 90);
  // Licht: Schienen über den Gängen, Leuchten darunter
  for (const x of [-9, -7, -5, -3, -1, 1, 3, 5, 7, 9]) { add('lichtschiene_gerade_200', x, 4, -1.8, 0); add('lichtschiene_gerade_200', x, 4, 1.0, 0); }
  for (const x of [-9, -7, -5, -3, -1, 1, 3, 5, 7, 9]) { add('schienenleuchte_lichtleiste', x, 3.4, -1.8, 0); add('schienenleuchte_pendel_kegel', x - 0.5, 3.4, 1.0, 0); add('schienenleuchte_pendel_kugel', x + 0.5, 3.4, 1.0, 0); }
  // Hängeschilder über den Abteilungen
  for (const [typ, x, z] of [['schild_getraenke', -5, -1.5], ['schild_drogerie', 1, -1.5], ['schild_kuehlung', 6.5, -1.5], ['schild_obst', 8.6, 1.5], ['schild_backwaren', 3.2, 1.6], ['schild_kasse', -4.5, 1.6], ['schild_angebote', -8.6, 1.5]]) add(typ, x, 4, z, -90);
  // Draußen
  add('aufsteller_angebot', -1.3, 0.14, 4.5, -90); add('infotafel_oeffnungszeiten', 5.5, 0.14, 4.3, -90);
  add('holzbank', 7.8, 0.14, 3.95, -90); add('lavendelkuebel', -4, 0.14, 3.7, 0); add('lavendelkuebel', 4.2, 0.14, 3.7, 0);
  add('fahrradstaender', -8, 0.14, 5.2, -90);

  // ── Lager dahinter 20 × 6 m ──
  for (let x = -9; x <= 9; x += 2) for (const z of [-8, -6, -4]) add('betonboden', x, 0, z);
  for (let x = -9; x <= 9; x += 2) { add('trapezblech_wand', x, 0, -9.1, 90); add('attika_dachkante', x, 4, -9.1, 90); }
  for (const z of [-8, -6, -4]) { add('trapezblech_wand', -10.1, 0, z, 180); add('attika_dachkante', -10.1, 4, z, 180); add('attika_dachkante', 10.1, 4, z, 0); }
  add('trapezblech_wand', 10.1, 0, -8, 0); add('ladetor', 10.1, 0, -6, 0); add('trapezblech_lichtband', 10.1, 0, -4, 0);
  for (const x of [-8, -5, -2, 1, 4]) add('palettenregal', x, 0.05, -8.3, -90);
  add('holzregal', -9.55, 0.05, -5.2, 0); add('packtisch', 7.6, 0.05, -8.3, -90); add('gabelstapler', 5.5, 0.05, -5.2, 180);
  add('kartonstapel', -3.5, 0.05, -4.2, 0); add('feuerloescher', 9.6, 0.05, -3.6, 0);
  for (const x of [-6, 0, 6]) add('hallenstrahler', x, 4, -6);
  // Gewerbehof: Asphalt für den LKW
  for (let x = 11; x <= 19; x += 2) for (let z = -9; z <= 5; z += 2) add('asphalt_hof', x, 0, z);

  g.store.nav.invalidate(); g.fleet?.invalidate(); g.roof?.invalidate();

  // ── Ware: jedes Fach fest belegen und füllen ──
  const alle = g.content.produkte.all().filter((p) => !p.rohstoff);
  const kalt = alle.filter((p) => p.kuehlung), warm = alle.filter((p) => !p.kuehlung);
  const nachKategorie = (list, kat) => list.filter((p) => kat.some((k) => p.kategorie.includes(k)));
  const gruppen = {
    wandregal_schmal: nachKategorie(warm, ['drogerie']), getraenkeregal: nachKategorie(warm, ['getraenke']),
    regal_landhaus: nachKategorie(warm, ['grundnahrung']), store_shelf_wall_01: nachKategorie(warm, ['haushalt']),
    wandregal_weiss: nachKategorie(warm, ['suesswaren']), mittelregal_holz: nachKategorie(warm, ['grundnahrung', 'suesswaren', 'getraenke']),
    brotregal: nachKategorie(warm, ['backwaren']), obststand_kisten: nachKategorie(warm, ['obst']), store_producestand_01: nachKategorie(warm, ['obst']),
    kassenregal: nachKategorie(warm, ['suesswaren']),
    kuehltruhe: nachKategorie(kalt, ['tiefkuehl']), kuehlregal_offen: nachKategorie(kalt, ['molkerei', 'fleisch']), store_fridge_upright_01: nachKategorie(kalt, ['getraenke', 'molkerei']),
  };
  const zaehler = new Map();
  const naechstes = (list) => { const k = list.length ? list : warm; const i = zaehler.get(k) ?? 0; zaehler.set(k, i + 1); return k[i % k.length]; };
  for (const e of g.world.all()) {
    const s = comp(e, 'ShelfComponent');
    if (!s) continue;
    const list = gruppen[e.typeId]?.length ? gruppen[e.typeId] : s.kuehlung ? kalt : warm;
    s.faecher.forEach((_, i) => { const p = naechstes(list); s.setFest(i, p); s.add(p, s.kapazitaet); });
  }
  // Lager: Kartons der Ware auf die Palettenregale
  const listed = [...g.buyers.listing.gelistet].map(P);
  for (let i = 0; i < 70 && g.storage.freeSlots() > 6; i++) { const p = listed[i % listed.length]; g.storage.deliver(p, p.gebinde); }

  // ── Bodenmarkierungen ──
  const st = (id) => g.content.markierungen.stempel.find((s) => s.id === id);
  g.paint.stamp(st('willkommen'), 1, 4.6, 0, 1, '#3b3f44');
  for (const x of [-6.5, -2.5, 6.5]) g.paint.stamp(st('kasse'), x + 0.2, 1.0, 0, 0.6, '#c0673f');
  for (const x of [-7, 0, 5]) g.paint.stamp(st('pfeil'), x, -1.65, 90, 0.5, '#8fae8b');
  g.paint.stamp(st('fuesse'), 1.4, 2.4, 180, 0.8, '#e8883a');
  g.paint.stamp(st('gefahr'), 10.9, -6, 90, 1, '#f2c230');
  for (const z of [-8.3, -6, -3.7]) g.paint.stamp(st('stellflaeche'), 15, z, 0, 1.6, '#f4f1e8');
  g.paint.stamp(st('herz'), -1.6, 2.5, 0, 0.6, '#c8483c');

  // ── Personal ──
  const hire = (rolle) => { g.staff.refreshCandidates(); const c = g.staff.candidates[0]; c.rolle = rolle; c.tempo = 1.2; g.staff.hire(c.id); };
  for (const r of ['kassierer', 'kassierer', 'kassierer', 'auffueller', 'auffueller', 'lagerist', 'einkaeufer']) hire(r);

  // Strom und Wasser auf die höchste Stufe
  for (const art of ['strom', 'wasser']) for (let i = 0; i < 10 && g.utilities.nextStage(art); i++) g.utilities.upgrade(art);
  // Einstiegsziele sind im Testmarkt schon erledigt
  g.goals.restore(g.goals.list.map((z) => z.id));
  // Guter Ruf, Vormittag am dritten Tag
  g.store.stats.setRuf?.(80);
  g.clock.total = 2 * 24 * 60 + 9 * 60;
  return g.toSave();
});
console.log(errors.length ? errors.join('\n') : 'keine Fehler');
const file = path.resolve('data/spielstaende/testmarkt.json');
fs.writeFileSync(file, JSON.stringify(save) + '\n');
console.log(`Gespeichert: ${file} (${Math.round(fs.statSync(file).size / 1024)} kB, ${save.bauten.length} Bauteile, ${save.kartons.length} Kartons)`);
await browser.close();
