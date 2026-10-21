import { it } from 'vitest';
import * as THREE from 'three';
import fs from 'node:fs';
import { Content } from '../../src/content/Content';
import { World } from '../../src/ecs/World';
import { PlayerState } from '../../src/state/PlayerState';
import { readData } from '../../src/core/Data';
import { createBuildEntity } from '../../src/factory/createBuildEntity';
import { createWorkerEntity } from '../../src/factory/createWorkerEntity';
import { StoreLoop } from '../../src/core/StoreLoop';
import { PriceBook } from '../../src/economy/Prices';
import { ShelfComponent } from '../../src/components/ShelfComponent';
import type { ProductDef } from '../../src/content/definitions';

// Balancing-Simulation ohne Grafik: ein Laden mit echten Kunden, Wegen und einem Kassierer läuft
// einige Spieltage. Regale werden stündlich aufgefüllt (wie durch Einkäufer + Auffüller), dafür werden
// Wareneinsatz, Lieferkosten und Löhne abgezogen. Ausgabe: Tabelle je Tag (Konsole und SIM_OUT-Datei).
//
// Aufruf: npm run sim   (Szenario über SIM_REGALE=4 SIM_TAGE=3 …)

const content = new Content();
const env = (k: string, d: number) => Number(process.env[k] ?? d);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

it('Balancing: ein Laden über mehrere Tage', () => {
  const regale = env('SIM_REGALE', 4), tage = env('SIM_TAGE', 3), kassen = env('SIM_KASSEN', 1);
  const random = rng(env('SIM_SEED', 7));
  const world = new World(new THREE.Group());
  const player = new PlayerState('sim', readData<{ geld: number; xp: number }>('spieler/start'), readData('spieler/level'));
  const bounds = { minX: -12, maxX: 12, minZ: -12, maxZ: 12 };
  let ctx: Record<string, unknown> = { content };
  const store = new StoreLoop(world, content, player, bounds, [[7, 0.05, 7]], () => ctx as never, new PriceBook(content.kunden.preis), random);
  ctx = { content, checkout: store.checkoutServices };
  const add = (id: string, x: number, z: number, r = 0) => world.add(createBuildEntity(content.bau.get(id), { position: [x, id.startsWith('boden') ? 0 : 0.05, z], drehung: r }, ctx as never));
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) add('boden_fliese_innen', x * 2, z * 2);

  // Sortiment: freigeschaltete, ungekühlte Produkte von Level 1 – je Fach ein anderes
  const sortiment = content.produkte.all().filter((p) => p.freischaltLevel <= 1 && !p.kuehlung && !p.rohstoff);
  const shelves: ShelfComponent[] = [];
  for (let i = 0; i < regale; i++) {
    const e = add('wandregal_weiss', -7 + (i % 6) * 2.2, -7 + Math.floor(i / 6) * 4, -90);
    shelves.push(e.require(ShelfComponent));
  }
  const belegung = new Map<ShelfComponent, ProductDef[]>();
  let k = 0;
  for (const s of shelves) belegung.set(s, s.faecher.map(() => sortiment[k++ % sortiment.length]));
  for (let i = 0; i < kassen; i++) add('kasse_schwarz', 2 + i * 2.5, 2, 0);
  // Kassierer je Kasse
  const services = store.staffServices(() => true);
  const lohn = content.rollen.kassierer.lohnProTag;
  for (let i = 0; i < kassen; i++) world.add(createWorkerEntity({ id: 100 + i, name: `K${i}`, rolle: 'kassierer', lohn, tempo: 1 }, services, ctx as never)).object.position.set(2, 0.05, 4);

  let ware = 0, kartons = 0;
  const auffuellen = () => {
    for (const [s, prods] of belegung) s.faecher.forEach((f, i) => {
      const p = prods[i];
      if (f.produkt && f.produkt !== p) return;
      const fehlt = s.kapazitaet - f.menge;
      if (fehlt <= 0) return;
      s.add(p, fehlt);
      ware += fehlt * p.ek;
      kartons += fehlt / p.gebinde;
    });
  };
  auffuellen();
  const zeilen: string[] = [];
  const lg = content.logistik.lieferkosten;
  zeilen.push(`Szenario: ${regale} Regale (${sortiment.length} Produkte im Sortiment, ${shelves.length * 4} Fächer), ${kassen} Kasse(n) mit Kassierer, Start ${player.geld} €`);
  zeilen.push('| Tag | Kunden | zufrieden | Umsatz | Wareneinsatz | Lieferung | Löhne | Gewinn | Ruf | XP | Level |');
  zeilen.push('|---|---|---|---|---|---|---|---|---|---|---|');
  let gesamt = 0;
  for (let tag = 1; tag <= tage; tag++) {
    ware = 0; kartons = 0;
    const geld0 = player.geld;
    for (let m = 0; m < 24 * 60; m++) {
      if (m % 60 === 0) auffuellen();
      store.update(1, m);
      const offen = store.kundenImLaden > 0 || store.spawner.isOpen(m);
      if (offen) for (let i = 0; i < 10; i++) world.update(0.1);
    }
    const r = store.stats.heute;
    // Lieferkosten: zwei Lieferungen am Tag; Löhne der Kassierer
    const lieferung = kartons > 0 ? 2 * lg.grund + lg.proKarton * Math.ceil(kartons) : 0;
    const loehne = lohn * kassen;
    const gewinn = r.umsatz - ware - lieferung - loehne;
    gesamt += gewinn;
    zeilen.push(`| ${tag} | ${r.kunden} | ${Math.round((r.zufrieden / Math.max(1, r.kunden)) * 100)} % | ${r.umsatz.toFixed(0)} € | ${ware.toFixed(0)} € | ${lieferung.toFixed(0)} € | ${loehne} € | **${gewinn.toFixed(0)} €** | ${store.stats.ruf.toFixed(0)} | ${player.xp} | ${player.level} |`);
    void geld0;
    store.stats.closeDay(tag + 1);
  }
  zeilen.push(`Gewinn gesamt: ${gesamt.toFixed(0)} € in ${tage} Tagen (Ø ${(gesamt / tage).toFixed(0)} € / Tag)`);
  const out = zeilen.join('\n');
  console.log(out);
  if (process.env.SIM_OUT) fs.appendFileSync(process.env.SIM_OUT, out + '\n\n');
});
