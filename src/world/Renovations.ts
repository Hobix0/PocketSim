import * as THREE from 'three';
import { Emitter } from '../core/Emitter';
import type { World } from '../ecs/World';
import type { Entity } from '../ecs/Entity';
import type { Content } from '../content/Content';
import type { FactoryContext } from '../factory/FactoryContext';
import type { ModelProvider } from '../assets/ModelLibrary';
import type { PlayerState } from '../state/PlayerState';
import type { Plots, PlotDef } from './Plots';
import { FootprintComponent } from '../components/FootprintComponent';
import { createBuildEntity } from '../factory/createBuildEntity';

// Altbauten renovieren (Stadt): Auf manchen Grundstücken steht ein verfallenes Gebäude (Bauteile mit
// "renovierung" in data/bau). Gehört das Grundstück dir, kannst du es renovieren lassen: Das kostet die Summe
// der Teile, an der Fassade steht so lange ein Gerüst und es staubt. Danach wird jedes Teil durch sein
// renoviertes Gegenstück ersetzt (Gerümpel kommt weg). Werte: data/stadt/standard.json → "renovierung".

export interface RenovationSettings {
  /** Spielminuten je Bauteil, mindestens `minMinuten` */
  minutenProTeil: number;
  minMinuten: number;
  /** XP, wenn ein Gebäude fertig renoviert ist */
  xp: number;
  /** Modell des Baugerüsts (vor jedes Wandteil der Straßenseite) */
  geruest: string;
}

export interface RenovationEvents extends Record<string, unknown> {
  started: { plot: PlotDef; kosten: number; minuten: number };
  done: { plot: PlotDef; teile: number; mitte: THREE.Vector3 };
}

export type RenovationResult = { ok: true } | { ok: false; grund: 'nicht_besessen' | 'nichts' | 'laeuft' | 'geld' };

interface Running {
  rest: number;
  total: number;
  gerueste: THREE.Object3D[];
}

export class Renovations {
  readonly events = new Emitter<RenovationEvents>();
  private readonly running = new Map<string, Running>();

  constructor(
    private readonly world: World,
    private readonly content: Content,
    private readonly plots: Plots,
    private readonly player: PlayerState,
    private readonly factory: FactoryContext,
    private readonly settings: RenovationSettings,
    private readonly scene?: THREE.Object3D,
    private readonly models?: ModelProvider,
    /** Staub und Funkeln während der Arbeit (fehlt in Tests) */
    private readonly fx?: { dust(p: THREE.Vector3): void },
  ) {}

  /** Verfallene Teile auf diesem Grundstück */
  parts(plotId: string): Entity[] {
    const p = this.plots.list.find((x) => x.id === plotId);
    if (!p) return [];
    const r = p.rect, out: Entity[] = [];
    const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
    for (const [e, f] of this.world.query(FootprintComponent)) {
      const def = this.content.bau.find(e.typeId);
      const q = e.object.position;
      if (!def?.renovierung || q.x < r.minX - 0.3 || q.x > r.maxX + 0.3 || q.z < r.minZ - 0.3 || q.z > r.maxZ + 0.3) continue;
      // Wände am Rand: Bei Häusern Wand an Wand gehört eine Wand dem Haus, von dessen Mitte ihre Außenseite wegzeigt
      if (f.ebene === 'wand') {
        const aussen = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), e.object.rotation.y);
        if (aussen.x * (q.x - cx) + aussen.z * (q.z - cz) < 0) continue;
      }
      out.push(e);
    }
    return out;
  }

  cost(plotId: string): number {
    return this.parts(plotId).reduce((n, e) => n + (this.content.bau.find(e.typeId)?.renovierung?.kosten ?? 0), 0);
  }

  minutes(plotId: string): number {
    return Math.max(this.settings.minMinuten, this.parts(plotId).length * this.settings.minutenProTeil);
  }

  /** Läuft die Renovierung? Anteil fertig (0…1), sonst null */
  progress(plotId: string): number | null {
    const r = this.running.get(plotId);
    return r ? 1 - r.rest / r.total : null;
  }

  /** Braucht dieses Grundstück eine Renovierung? */
  needs(plotId: string): boolean {
    return this.parts(plotId).length > 0;
  }

  start(plotId: string): RenovationResult {
    const plot = this.plots.list.find((x) => x.id === plotId);
    if (!plot || !this.plots.isOwned(plotId)) return { ok: false, grund: 'nicht_besessen' };
    if (this.running.has(plotId)) return { ok: false, grund: 'laeuft' };
    const parts = this.parts(plotId);
    if (!parts.length) return { ok: false, grund: 'nichts' };
    const kosten = this.cost(plotId);
    if (!this.player.spend(kosten, 'renovierung')) return { ok: false, grund: 'geld' };
    const minuten = this.minutes(plotId);
    this.begin(plotId, minuten, minuten);
    this.events.emit('started', { plot, kosten, minuten });
    return { ok: true };
  }

  update(minutes: number): void {
    for (const [id, r] of this.running) {
      r.rest -= minutes;
      // Hier und da staubt es am Gerüst
      if (this.fx && r.gerueste.length && Math.random() < Math.min(1, minutes * 0.4)) {
        const g = r.gerueste[Math.floor(Math.random() * r.gerueste.length)];
        this.fx.dust(g.position.clone().setY(0.5 + Math.random() * 3));
      }
      if (r.rest <= 0) this.finish(id);
    }
  }

  /** Laufende Renovierungen für den Spielstand */
  state(): { plot: string; rest: number; total: number }[] {
    return [...this.running].map(([plot, r]) => ({ plot, rest: Math.round(r.rest * 10) / 10, total: r.total }));
  }

  restore(list: unknown): void {
    for (const id of [...this.running.keys()]) this.clear(id);
    if (!Array.isArray(list)) return;
    for (const x of list as { plot?: unknown; rest?: unknown; total?: unknown }[]) {
      if (typeof x?.plot !== 'string' || typeof x.rest !== 'number' || typeof x.total !== 'number') continue;
      if (!this.plots.list.some((p) => p.id === x.plot)) continue;
      this.begin(x.plot, Math.max(0, x.rest), Math.max(1, x.total));
    }
  }

  private begin(plotId: string, rest: number, total: number): void {
    this.running.set(plotId, { rest, total, gerueste: this.scaffold(plotId) });
  }

  /** Gerüst vor jedes Wandteil der Front (die Seite mit der Tür, sonst +Z) */
  private scaffold(plotId: string): THREE.Object3D[] {
    if (!this.scene || !this.models) return [];
    const out: THREE.Object3D[] = [];
    const parts = this.parts(plotId);
    const achse = new THREE.Vector3(0, 1, 0);
    const tuer = parts.find((e) => e.typeId.includes('tuer'));
    const front = tuer ? new THREE.Vector3(1, 0, 0).applyAxisAngle(achse, tuer.object.rotation.y) : new THREE.Vector3(0, 0, 1);
    for (const e of parts) {
      if (e.get(FootprintComponent)?.ebene !== 'wand') continue;
      const out3 = new THREE.Vector3(1, 0, 0).applyAxisAngle(achse, e.object.rotation.y);
      if (out3.dot(front) < 0.7) continue;
      const g = new THREE.Group();
      g.position.copy(e.object.position).addScaledVector(out3, 0.45);
      g.rotation.y = e.object.rotation.y;
      this.scene.add(g);
      out.push(g);
      this.models.instance(this.settings.geruest).then((obj) => g.add(obj));
    }
    return out;
  }

  private clear(plotId: string): void {
    const r = this.running.get(plotId);
    for (const g of r?.gerueste ?? []) g.parent?.remove(g);
    this.running.delete(plotId);
  }

  private finish(plotId: string): void {
    const plot = this.plots.list.find((x) => x.id === plotId)!;
    this.clear(plotId);
    const parts = this.parts(plotId);
    for (const e of parts) {
      const ren = this.content.bau.find(e.typeId)?.renovierung;
      const pos = e.object.position.clone(), rot = THREE.MathUtils.radToDeg(e.object.rotation.y);
      this.world.remove(e);
      const neu = ren?.zu ? this.content.bau.find(ren.zu) : undefined;
      if (neu) this.world.add(createBuildEntity(neu, { position: [pos.x, pos.y, pos.z], drehung: Math.round(rot) }, this.factory));
    }
    this.player.addXp(this.settings.xp);
    const r = plot.rect;
    this.events.emit('done', { plot, teile: parts.length, mitte: new THREE.Vector3((r.minX + r.maxX) / 2, 1, (r.minZ + r.maxZ) / 2) });
  }
}
