import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { PlayerState } from '../src/state/PlayerState';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { createCartonEntity } from '../src/factory/createProductEntity';
import { createWorkerEntity } from '../src/factory/createWorkerEntity';
import { checkPlacement } from '../src/building/placement';
import { ShelfComponent } from '../src/components/ShelfComponent';
import { CartonComponent } from '../src/components/CartonComponent';
import { WorkerComponent } from '../src/components/WorkerComponent';
import { stockFromCarton, findStockingTask } from '../src/economy/Stocking';
import { Staff } from '../src/economy/Staff';

// Regeln des Ladens: Bauen, Regale, Einräumen, Personal – ohne Grafik getestet.

const content = new Content();
const ctx = { content };

function world(): World {
  return new World(new THREE.Group());
}

/** Ein Raum aus 2 × 2 Fliesen (4 × 4 m) um den Ursprung. */
function floor(w: World): void {
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    w.add(createBuildEntity(content.bau.get('boden_fliese_innen'), { position: [x, 0, z], drehung: 0 }, ctx));
  }
}

describe('Platzieren beim Bauen', () => {
  const regal = content.bau.get('wandregal_weiss');
  const s = content.baumenue;
  const opts = { geld: 1000, level: 1 };

  it('braucht Boden unter Objekten', () => {
    const w = world();
    expect(checkPlacement(w, regal, 0, 0, 0, s, opts)).toMatchObject({ ok: false, grund: 'boden' });
    floor(w);
    const r = checkPlacement(w, regal, 0, 0, 0, s, opts);
    expect(r.ok).toBe(true);
    expect(r.y).toBeCloseTo(0.05); // steht auf der Oberkante der Fliese
  });

  it('erkennt belegte Stellen, fehlendes Geld und gesperrte Elemente', () => {
    const w = world();
    floor(w);
    w.add(createBuildEntity(regal, { position: [0, 0.05, 0], drehung: 0 }, ctx));
    expect(checkPlacement(w, regal, 0.25, 0, 0, s, opts).grund).toBe('belegt');
    expect(checkPlacement(w, regal, -1.5, 1.5, 0, s, { geld: 10, level: 1 }).grund).toBe('geld');
    expect(checkPlacement(w, content.bau.get('kuehlregal_offen'), -1.5, 1.5, 0, s, opts).grund).toBe('gesperrt');
  });

  it('das verschobene Objekt steht sich selbst nicht im Weg und kostet nichts', () => {
    const w = world();
    floor(w);
    const e = w.add(createBuildEntity(regal, { position: [0, 0.05, 0], drehung: 0 }, ctx));
    expect(checkPlacement(w, regal, 0.25, 0, 0, s, { geld: 0, level: 1, moving: e }).ok).toBe(true);
  });
});

describe('Regal und Einräumen', () => {
  const cola = content.produkte.get('cola_0_5l');
  const gekuehlt = content.produkte.all().find((p) => p.kuehlung)!;

  it('füllt erst Fächer mit demselben Produkt, dann leere – bis zur Kapazität', () => {
    const shelf = new ShelfComponent({ faecher: 2, kapazitaet: 10, kuehlung: false, mitte: 0, laenge: 1 });
    expect(shelf.add(cola, 6)).toBe(6);
    expect(shelf.add(cola, 6)).toBe(6);
    expect(shelf.faecher.map((f) => f.menge)).toEqual([10, 2]);
    expect(shelf.space(cola)).toBe(8);
    expect(shelf.add(gekuehlt, 1)).toBe(0); // keine Kühlung
  });

  it('räumt einen Karton ein und entfernt ihn, wenn er leer ist', () => {
    const w = world();
    const shelf = w.add(createBuildEntity(content.bau.get('wandregal_weiss'), { position: [0, 0, 0], drehung: 0 }, ctx));
    const carton = w.add(createCartonEntity(cola, cola.gebinde, ctx));
    expect(stockFromCarton(carton, shelf)).toEqual({ ok: true, menge: cola.gebinde, leer: true });
    expect(w.get(carton.id)).toBeUndefined();
    expect(shelf.require(ShelfComponent).bestand).toBe(cola.gebinde);
  });

  it('gekühlte Ware gehört ins Kühlregal', () => {
    const w = world();
    const shelf = w.add(createBuildEntity(content.bau.get('wandregal_weiss'), { position: [0, 0, 0], drehung: 0 }, ctx));
    const carton = w.add(createCartonEntity(gekuehlt, gekuehlt.gebinde, ctx));
    expect(stockFromCarton(carton, shelf)).toEqual({ ok: false, grund: 'kuehlung' });
    expect(carton.require(CartonComponent).menge).toBe(gekuehlt.gebinde);
  });
});

describe('Personal', () => {
  const player = () => new PlayerState('test', { geld: 100, xp: 0 }, { xpFuerLevel: [0, 100] });
  const rnd = () => 0.5;

  it('stellt ein, zahlt Löhne und verliert Leute, wenn das Geld fehlt', () => {
    const p = player();
    const staff = new Staff(content.rollen, content.personal, content.namen, p, rnd);
    expect(staff.candidates).toHaveLength(content.personal.bewerberAnzahl);
    const a = staff.hire(staff.candidates[0].id)!;
    const b = staff.hire(staff.candidates[0].id)!;
    expect(staff.team).toEqual([a, b]);
    expect(a.name).not.toBe(b.name);

    const left: string[] = [];
    staff.events.on('left', ({ employee, grund }) => left.push(`${employee.name}:${grund}`));
    staff.payDay(); // 100 € reichen nur für einen Lohn
    expect(p.geld).toBe(100 - a.lohn);
    expect(left).toEqual([`${b.name}:kein_lohn`]);
    expect(staff.team).toEqual([a]);
  });

  it('ein Auffüller holt einen Karton und räumt ihn ins Regal', () => {
    const w = world();
    const cola = content.produkte.get('cola_0_5l');
    const shelf = w.add(createBuildEntity(content.bau.get('wandregal_weiss'), { position: [2, 0, 0], drehung: 0 }, ctx));
    const carton = w.add(createCartonEntity(cola, cola.gebinde, ctx));
    carton.object.position.set(-2, 0, 0);
    const staff = new Staff(content.rollen, content.personal, content.namen, player(), rnd);
    const employee = staff.hire(staff.candidates[0].id)!;
    const worker = w.add(createWorkerEntity(employee, {
      findTask: () => findStockingTask(w, () => true),
      gehgeschwindigkeit: 1.4,
      sekundenProStueck: 0.1,
    }, ctx));
    const states = new Set<string>();
    for (let i = 0; i < 600 && shelf.require(ShelfComponent).bestand === 0; i++) {
      w.update(0.1);
      states.add(worker.require(WorkerComponent).state);
    }
    expect(shelf.require(ShelfComponent).bestand).toBe(cola.gebinde);
    expect(w.get(carton.id)).toBeUndefined();
    expect([...states]).toEqual(expect.arrayContaining(['holt', 'bringt', 'raeumt']));
  });
});
