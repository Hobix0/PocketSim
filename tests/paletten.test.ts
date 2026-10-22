import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { Entity } from '../src/ecs/Entity';
import { PlayerState } from '../src/state/PlayerState';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { createPalletEntity, loadPallet, cartonsPerPallet } from '../src/factory/createPalletEntity';
import { checkPlacement } from '../src/building/placement';
import { PalletComponent } from '../src/components/PalletComponent';
import { PalletPlacesComponent } from '../src/components/PalletPlacesComponent';
import { PalletDriverComponent } from '../src/components/PalletDriverComponent';
import { ShelfComponent } from '../src/components/ShelfComponent';
import { CartonComponent } from '../src/components/CartonComponent';
import { VehicleComponent } from '../src/components/VehicleComponent';
import { CartonStorage } from '../src/world/CartonStorage';
import { Purchasing } from '../src/economy/Purchasing';
import { findPalletJob } from '../src/economy/PalletLogistics';
import { findStockingTask } from '../src/economy/Stocking';
import { collectWorld, applyWorld } from '../src/save/SaveGame';

// Paletten: Einkauf, Einlagern mit dem Stapler, Auffüllen mit dem Hubwagen, Spielstand

const content = new Content();
const ctx = { content };
const cola = content.produkte.get('cola_0_5l');
const s = content.baumenue;
const n = cartonsPerPallet(ctx);

function halle() {
  const w = new World(new THREE.Group());
  for (let x = -8; x <= 8; x += 2) for (let z = -8; z <= 8; z += 2) w.add(createBuildEntity(content.bau.get('betonboden'), { position: [x, 0, z], drehung: 0 }, ctx));
  return w;
}
const build = (w: World, id: string, x: number, z: number, drehung = 0) => {
  const def = content.bau.get(id);
  const r = checkPlacement(w, def, x, z, THREE.MathUtils.degToRad(drehung), s, { geld: 1e6, level: 99 });
  expect(r.ok, `${id}: ${r.grund}`).toBe(true);
  return w.add(createBuildEntity(def, { position: [x, r.y, z], drehung }, ctx));
};
/** Wie ein LKW an der Rampe: Ladefläche bündig mit dem Boden, eine Palette Cola darauf */
function lkw(w: World, x: number, z: number) {
  const e = w.add(new Entity('lkw'));
  e.object.position.set(x, 0.05, z);
  const places = e.add(new PalletPlacesComponent([new THREE.Vector3(0, 0, 0)], true)) as PalletPlacesComponent;
  const p = w.add(createPalletEntity(ctx));
  p.require(PalletComponent).stand(places, 0);
  loadPallet(p, cola, n, cola.gebinde, ctx);
  return p;
}
function fahrer(w: World) {
  const e = w.add(new Entity('personal'));
  e.object.position.set(0, 0.05, 6);
  const d = e.add(new PalletDriverComponent({ id: 7, name: 'Pia', rolle: 'staplerfahrer', lohn: 100, tempo: 1 },
    { findJob: () => findPalletJob(w), gehgeschwindigkeit: 3, lager: content.lager, rollenName: 'Staplerfahrer', text: (k) => k })) as PalletDriverComponent;
  return d;
}
const run = (w: World, sekunden: number) => { for (let t = 0; t < sekunden; t += 0.1) w.update(0.1); };

describe('Paletten', () => {
  it('Einkauf: ganze Paletten sind günstiger und brauchen einen Palettenplatz', () => {
    const w = halle();
    const player = new PlayerState('t', { geld: 5000, xp: 0 }, { xpFuerLevel: [0] });
    const storage = new CartonStorage(w, ctx);
    const buy = new Purchasing(content.waren, player, storage, undefined, { kartons: n, rabatt: 0.1 });
    expect(buy.palletPrice(cola)).toBeCloseTo(buy.cartonPrice(cola) * n * 0.9, 2);
    expect(buy.order([{ produkt: cola.id, kartons: 0, paletten: 1 }])).toMatchObject({ ok: false, fehler: { grund: 'palettenplatz' } });
    build(w, 'palettenplatz', 2, 2);
    expect(buy.order([{ produkt: cola.id, kartons: 0, paletten: 1 }]).ok).toBe(true);
    const [[, pc]] = [...w.query(PalletComponent)];
    expect(pc.kartons).toBe(n);
    expect(pc.produkt).toBe(cola);
    // Kartons auf einer Palette am Boden nimmt der Auffüller ganz normal
    build(w, 'vr_wand_weiss', -4, -7.5, -90);
    expect(findStockingTask(w, () => true)?.carton.get(CartonComponent)?.ablage?.palette).toBe(true);
  });

  it('der Staplerfahrer lagert eine Palette vom LKW oben ins Regal ein und parkt den Stapler', () => {
    const w = halle();
    for (const z of [-1.4, 1.4]) build(w, 'pal_rahmen_klassik_450', 0, z);
    build(w, 'pal_traverse_klassik_270_offen', 0, 0); // unten
    const oben = build(w, 'pal_traverse_klassik_270_offen', 0, 0); // 1,45 m
    const stapler = build(w, 'gabelstapler', 5, 5);
    const pallet = lkw(w, -5, 4);
    const d = fahrer(w);
    run(w, 3);
    expect(stapler.require(VehicleComponent).fahrer).toBe(d.entity.id);
    run(w, 120);
    const pc = pallet.require(PalletComponent);
    expect(pc.platz?.places).toBe(oben.require(PalletPlacesComponent));
    expect(pallet.object.position.y).toBeGreaterThan(1.4);
    expect(pc.kartons).toBe(n);
    // Kartons wandern mit und sind oben im Regal für Auffüller tabu
    expect(Math.min(...pc.cartons().map((c) => c.object.position.y))).toBeGreaterThan(1.4);
    expect(findStockingTask(w, () => true)).toBeNull();
    expect(stapler.require(VehicleComponent).frei).toBe(true);
    expect(stapler.object.visible).toBe(true);
  });

  it('mit dem Hubwagen fährt er eine Palette zum Verkaufsregal und füllt direkt auf', () => {
    const w = halle();
    const platz = build(w, 'palettenplatz', -4, 4);
    build(w, 'hubwagen', 5, 5);
    const regal = build(w, 'vr_wand_weiss', 3, -4, -90);
    const pallet = w.add(createPalletEntity(ctx));
    pallet.require(PalletComponent).stand(platz.require(PalletPlacesComponent), 0);
    loadPallet(pallet, cola, 3, cola.gebinde, ctx);
    fahrer(w);
    run(w, 200);
    const shelf = regal.require(ShelfComponent);
    expect(shelf.bestand).toBe(3 * cola.gebinde);
    // Leer geräumte Palette ist weg
    expect(pallet.world).toBeNull();
  });

  it('Nachschub: fehlt im Laden etwas, holt der Stapler die Palette von oben herunter und füllt auf', () => {
    const w = halle();
    for (const z of [-1.4, 1.4]) build(w, 'pal_rahmen_klassik_450', 0, z);
    build(w, 'pal_traverse_klassik_270_offen', 0, 0);
    const oben = build(w, 'pal_traverse_klassik_270_offen', 0, 0);
    build(w, 'palettenplatz', -4, 4);
    build(w, 'gabelstapler', 5, 5);
    const regal = build(w, 'vr_wand_weiss', 4, -5, -90);
    const pallet = w.add(createPalletEntity(ctx));
    pallet.require(PalletComponent).stand(oben.require(PalletPlacesComponent), 1);
    loadPallet(pallet, cola, 2, cola.gebinde, ctx);
    expect(findPalletJob(w)?.art).toBe('nachschub');
    fahrer(w);
    run(w, 240);
    expect(regal.require(ShelfComponent).bestand).toBe(2 * cola.gebinde);
  });

  it('Paletten stehen im Spielstand – mit Kartons und Platz im Regal', () => {
    const w = halle();
    for (const z of [-1.4, 1.4]) build(w, 'pal_rahmen_klassik_300', 0, z);
    const t = build(w, 'pal_traverse_klassik_270_offen', 0, 0);
    const pallet = w.add(createPalletEntity(ctx));
    pallet.require(PalletComponent).stand(t.require(PalletPlacesComponent), 2);
    loadPallet(pallet, cola, 5, 12, ctx);
    const saved = JSON.parse(JSON.stringify(collectWorld(w, content)));
    expect(saved.kartons).toHaveLength(0);
    expect(saved.paletten).toHaveLength(1);
    const w2 = new World(new THREE.Group());
    applyWorld(saved, w2, content, ctx);
    const [[e2, pc2]] = [...w2.query(PalletComponent)];
    expect(pc2.kartons).toBe(5);
    expect(pc2.platz?.slot).toBe(2);
    expect(pc2.cartons()[0].require(CartonComponent).menge).toBe(12);
    expect(e2.object.position.distanceTo(pallet.object.position)).toBeLessThan(1e-6);
  });
});
