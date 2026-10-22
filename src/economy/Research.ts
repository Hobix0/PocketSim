import { Emitter } from '../core/Emitter';
import type { PlayerState } from '../state/PlayerState';

// Forschungsbaum: Mit Ideen (💡) schaltet man neue Produktlinien, Maschinen und Bauteile frei.
// Ideen sammeln sich nebenbei an: Ein Teil jeder verdienten XP wird zu Ideen, ganz ohne Zeitdruck.
// Ein Knoten ist erforschbar, wenn das Level reicht, alle Voraussetzungen erforscht sind und die Ideen reichen.
// Was ein Knoten freischaltet, steht in data/forschung/baum.json; Content trägt den Knoten an den
// Bauteilen, Rezepten und Produkten ein (Feld `forschung`). Knoten mit `bald` sind Vorschau auf später.

export interface ResearchNode {
  id: string;
  name: string;
  icon: string;
  beschreibung: string;
  /** Lage im Baum: Spalte (Stufe) und Zeile (Zweig) */
  spalte: number;
  zeile: number;
  /** Mindestlevel */
  level: number;
  /** Kosten in Ideen */
  kosten: number;
  voraussetzungen: string[];
  schaltetFrei: { bau: string[]; rezepte: string[]; kategorien: string[] };
  /** Von Anfang an erforscht */
  start: boolean;
  /** Kommt in einer späteren Version (nur Vorschau) */
  bald: boolean;
}

export interface ResearchSettings {
  /** Ideen je verdienter XP */
  ideenProXp: number;
  startIdeen: number;
}

/** Was freigeschaltet werden kann: Bauteil, Rezept oder Produkt */
export interface Unlockable {
  freischaltLevel: number;
  forschung?: string;
}

export type NodeStatus = 'erforscht' | 'bereit' | 'ideen' | 'level' | 'voraussetzung' | 'bald';

export interface ResearchState {
  erforscht: string[];
  ideen: number;
}

export interface ResearchEvents extends Record<string, unknown> {
  changed: undefined;
  researched: { node: ResearchNode };
}

export class Research {
  readonly events = new Emitter<ResearchEvents>();
  private readonly done = new Set<string>();
  private ideenWert: number;
  private lastXp: number;

  constructor(readonly nodes: ResearchNode[], private readonly player: PlayerState, private readonly settings: ResearchSettings) {
    this.ideenWert = settings.startIdeen;
    for (const n of nodes) if (n.start) this.done.add(n.id);
    this.lastXp = player.xp;
    player.events.on('changed', ({ xp }) => {
      const d = xp - this.lastXp;
      this.lastXp = xp;
      if (d > 0) this.addIdeen(d * this.settings.ideenProXp);
    });
  }

  get ideen(): number {
    return Math.floor(this.ideenWert + 1e-9);
  }

  addIdeen(menge: number): void {
    if (menge <= 0) return;
    this.ideenWert += menge;
    this.events.emit('changed', undefined);
  }

  node(id: string): ResearchNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }

  isDone(id: string): boolean {
    return this.done.has(id);
  }

  status(n: ResearchNode): NodeStatus {
    if (this.done.has(n.id)) return 'erforscht';
    if (n.bald) return 'bald';
    if (n.voraussetzungen.some((v) => !this.done.has(v))) return 'voraussetzung';
    if (n.level > this.player.level) return 'level';
    if (n.kosten > this.ideen) return 'ideen';
    return 'bereit';
  }

  /** Wie viele Knoten gerade erforscht werden könnten (für den Hinweis am Knopf) */
  get bereit(): number {
    return this.nodes.filter((n) => this.status(n) === 'bereit').length;
  }

  research(id: string): boolean {
    const n = this.node(id);
    if (!n || this.status(n) !== 'bereit') return false;
    this.ideenWert -= n.kosten;
    this.done.add(n.id);
    this.events.emit('researched', { node: n });
    this.events.emit('changed', undefined);
    return true;
  }

  /** Freigeschaltet: Level reicht und (falls nötig) die Forschung ist erledigt */
  ok = (d: Unlockable): boolean => d.freischaltLevel <= this.player.level && (!d.forschung || this.done.has(d.forschung));

  /** Warum gesperrt (Text für die Anzeige), oder null */
  sperre(d: Unlockable): string | null {
    if (d.forschung && !this.done.has(d.forschung)) return `Forschung: ${this.node(d.forschung)?.name ?? d.forschung}`;
    if (d.freischaltLevel > this.player.level) return `ab Level ${d.freischaltLevel}`;
    return null;
  }

  state(): ResearchState {
    return { erforscht: [...this.done], ideen: Math.round(this.ideenWert * 100) / 100 };
  }

  /** Spielstand übernehmen. Alte Spielstände ohne Forschung: alles bis zum aktuellen Level gilt als erforscht. */
  restore(s: Partial<ResearchState> | undefined): void {
    this.lastXp = this.player.xp;
    this.done.clear();
    for (const n of this.nodes) if (n.start) this.done.add(n.id);
    if (!s || !Array.isArray(s.erforscht)) {
      for (const n of this.nodes) if (!n.bald && n.level <= this.player.level) this.done.add(n.id);
      this.ideenWert = this.settings.startIdeen;
    } else {
      for (const id of s.erforscht) if (this.node(id)) this.done.add(id);
      this.ideenWert = typeof s.ideen === 'number' ? s.ideen : 0;
    }
    this.events.emit('changed', undefined);
  }
}

/** Prüft, ob etwas freigeschaltet ist, und sagt warum nicht (Research erfüllt das) */
export interface Unlocks {
  ok(d: Unlockable): boolean;
  sperre(d: Unlockable): string | null;
}

/** Nur nach Level (ohne Forschung, z. B. in Tests) */
export function levelUnlocks(level: () => number): Unlocks {
  return {
    ok: (d) => d.freischaltLevel <= level(),
    sperre: (d) => (d.freischaltLevel > level() ? `ab Level ${d.freischaltLevel}` : null),
  };
}
