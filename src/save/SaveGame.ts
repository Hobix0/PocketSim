import * as THREE from 'three';
import type { Content } from '../content/Content';
import type { World } from '../ecs/World';
import type { Entity } from '../ecs/Entity';
import type { FactoryContext } from '../factory/FactoryContext';
import { createBuildEntity } from '../factory/createBuildEntity';
import { createCartonEntity, createProductEntity } from '../factory/createProductEntity';
import { FootprintComponent } from '../components/FootprintComponent';
import { ShelfComponent } from '../components/ShelfComponent';
import { CartonComponent } from '../components/CartonComponent';
import { StorageSurfaceComponent } from '../components/StorageSurfaceComponent';
import { CustomerComponent } from '../components/CustomerComponent';
import type { Employee } from '../economy/Staff';
import type { StoreStatsState } from '../economy/StoreStats';

// Spielstand: alles, was ein Spiel ausmacht, als einfaches JSON.
//  - Gebautes (Typ, Lage, Inhalt der Regale), Kartons (auf welcher Ablage, welcher Platz), lose Ware
//  - Spieler, Uhr, Personal, Ruf und Verlauf, Ziele, Preise und was spätere Systeme ergänzen
// Kunden werden nicht gespeichert: Was sie im Korb haben, kommt zurück ins Regal.
// Neue Systeme ergänzen eigene, optionale Felder – alte Spielstände bleiben ladbar.

export const SAVE_VERSION = 1;

export interface SavedBuild {
  typ: string;
  pos: [number, number, number];
  /** Drehung in Grad */
  rot: number;
  regal?: { produkt: string | null; menge: number }[];
  /** Zustand weiterer Komponenten (z. B. Maschinen), nach Schlüssel */
  extra?: Record<string, unknown>;
}

export interface SavedCarton {
  produkt: string;
  menge: number;
  pos: [number, number, number];
  rot: number;
  /** Ablage: Nummer in `bauten` und Platz darauf */
  ablage?: { bau: number; platz: number };
}

export interface SaveData {
  version: number;
  level: string;
  gespeichert: string;
  spieler: { geld: number; xp: number };
  uhr: { total: number; stufe: number };
  bauten: SavedBuild[];
  kartons: SavedCarton[];
  waren: { produkt: string; pos: [number, number, number]; rot: number }[];
  personal: { team: Employee[]; bewerber: Employee[]; naechsteId: number };
  laden: StoreStatsState;
  ziele: string[];
  preise: Record<string, number>;
  /** Spätere Systeme (Grundstücke, Produktion …) legen ihre Daten hier ab */
  systeme?: Record<string, unknown>;
}

/** Komponenten, die zusätzlich etwas speichern wollen (z. B. Maschinen) */
export interface PersistentComponent {
  readonly persistKey: string;
  saveState(): unknown;
  loadState(data: unknown, content: Content): void;
}

function isPersistent(c: unknown): c is PersistentComponent {
  return typeof c === 'object' && c !== null && typeof (c as PersistentComponent).persistKey === 'string';
}

const round = (v: number) => Math.round(v * 1000) / 1000;
const vec = (v: THREE.Vector3): [number, number, number] => [round(v.x), round(v.y), round(v.z)];
const deg = (rad: number) => Math.round(THREE.MathUtils.radToDeg(rad) * 100) / 100;

/** Welt einsammeln (Gebautes, Kartons, Ware). */
export function collectWorld(world: World, content: Content): Pick<SaveData, 'bauten' | 'kartons' | 'waren'> {
  const bauten: SavedBuild[] = [];
  const index = new Map<Entity, number>();
  // Ware aus Körben zurück ins Regal, aus dem sie kam
  const zurueck = new Map<Entity, { produkt: string; menge: number }[]>();
  for (const [, c] of world.query(CustomerComponent)) {
    for (const l of c.basket) {
      const list = zurueck.get(l.regal) ?? [];
      list.push({ produkt: l.produkt.id, menge: l.menge });
      zurueck.set(l.regal, list);
    }
  }

  for (const e of world.all()) {
    if (!e.get(FootprintComponent) || !content.bau.has(e.typeId)) continue;
    const b: SavedBuild = { typ: e.typeId, pos: vec(e.object.position), rot: deg(e.object.rotation.y) };
    const shelf = e.get(ShelfComponent);
    if (shelf) b.regal = mergeBack(shelf, zurueck.get(e) ?? []);
    for (const c of e.all()) {
      if (isPersistent(c)) (b.extra ??= {})[c.persistKey] = c.saveState();
    }
    index.set(e, bauten.length);
    bauten.push(b);
  }

  const kartons: SavedCarton[] = [];
  const waren: SaveData['waren'] = [];
  for (const e of world.all()) {
    const carton = e.get(CartonComponent);
    if (carton) {
      // Kartons auf einem LKW speichert die Logistik (sie kommen beim Laden wieder per LKW)
      if (carton.menge <= 0 || carton.ablage?.temporaer) continue;
      const pos = vec(e.object.position);
      // Getragene Kartons schweben – beim Laden stehen sie auf dem Boden
      if (!carton.ablage && carton.reservedBy !== null) pos[1] = round(Math.max(0, pos[1] - 0.75));
      const k: SavedCarton = { produkt: carton.produkt.id, menge: carton.menge, pos, rot: deg(e.object.rotation.y) };
      if (carton.ablage) {
        const bau = index.get(carton.ablage.entity);
        const platz = carton.ablage.slotOf(e.id);
        if (bau !== undefined && platz >= 0) k.ablage = { bau, platz };
      }
      kartons.push(k);
    } else if (content.produkte.has(e.typeId) && !e.get(FootprintComponent)) {
      waren.push({ produkt: e.typeId, pos: vec(e.object.position), rot: deg(e.object.rotation.y) });
    }
  }
  return { bauten, kartons, waren };
}

/** Regalinhalt plus zurückgelegte Ware (passt nur, was Platz hat). */
function mergeBack(shelf: ShelfComponent, back: { produkt: string; menge: number }[]): SavedBuild['regal'] {
  const faecher = shelf.saveState();
  for (const b of back) {
    let rest = b.menge;
    for (const f of faecher) {
      if (rest === 0) break;
      if (f.produkt !== null && f.produkt !== b.produkt) continue;
      const take = Math.min(rest, shelf.kapazitaet - f.menge);
      if (take <= 0) continue;
      f.produkt = b.produkt;
      f.menge += take;
      rest -= take;
    }
  }
  return faecher;
}

/** Welt aus dem Spielstand aufbauen. Unbekannte Typen und Produkte werden übersprungen (mit Warnung). */
export function applyWorld(data: Pick<SaveData, 'bauten' | 'kartons' | 'waren'>, world: World, content: Content, ctx: FactoryContext): void {
  const built: (Entity | null)[] = [];
  const produkt = (id: string) => content.waren.find(id);
  for (const b of data.bauten) {
    const def = content.bau.find(b.typ);
    if (!def) { console.warn(`Spielstand: Bauteil "${b.typ}" gibt es nicht mehr`); built.push(null); continue; }
    const e = world.add(createBuildEntity(def, { position: b.pos, drehung: b.rot }, ctx));
    if (b.regal) e.get(ShelfComponent)?.loadState(b.regal, produkt);
    for (const c of e.all()) {
      if (isPersistent(c) && b.extra && c.persistKey in b.extra) c.loadState(b.extra[c.persistKey], content);
    }
    built.push(e);
  }
  for (const k of data.kartons) {
    const p = produkt(k.produkt);
    if (!p) continue;
    const e = world.add(createCartonEntity(p, k.menge, ctx));
    const carton = e.require(CartonComponent);
    const surface = k.ablage ? built[k.ablage.bau]?.get(StorageSurfaceComponent) : undefined;
    const pos = surface ? surface.occupyAt(k.ablage!.platz, e.id) ?? surface.occupy(e.id) : null;
    if (surface && pos) {
      carton.ablage = surface;
      e.object.position.copy(pos);
      e.object.rotation.y = surface.entity.object.rotation.y;
    } else {
      e.object.position.set(...k.pos);
      e.object.rotation.y = THREE.MathUtils.degToRad(k.rot);
    }
  }
  for (const w of data.waren) {
    const p = produkt(w.produkt);
    if (p) world.add(createProductEntity(p, { position: w.pos, drehung: w.rot }, ctx));
  }
}

/** Grobe Prüfung einer Datei/eines Eintrags; wirft mit verständlicher Meldung. */
export function validateSave(raw: unknown): SaveData {
  const o = raw as Partial<SaveData> | null;
  if (!o || typeof o !== 'object') throw new Error('Kein Spielstand');
  if (typeof o.version !== 'number' || o.version > SAVE_VERSION) throw new Error('Spielstand aus einer neueren Version');
  for (const key of ['level', 'spieler', 'uhr', 'bauten', 'kartons', 'personal', 'laden'] as const) {
    if (o[key] === undefined) throw new Error(`Spielstand unvollständig: "${key}" fehlt`);
  }
  return { waren: [], ziele: [], preise: {}, systeme: {}, ...o } as SaveData;
}
