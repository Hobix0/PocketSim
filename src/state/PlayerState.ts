import { Emitter } from '../core/Emitter';

// Spielerbezogene Werte: Geld, XP, Level.
// Bewusst getrennt von jeder Darstellung und jeder Spielfigur, damit später
// ein Server im Koop-Modus diesen Zustand führen kann. Keine three.js-Abhängigkeit.

export interface PlayerStart {
  geld: number;
  xp: number;
}

export interface LevelTable {
  /** XP, ab der ein Level erreicht ist. Eintrag 0 = Level 1, Eintrag 1 = Level 2 … */
  xpFuerLevel: number[];
}

export interface PlayerSnapshot {
  geld: number;
  xp: number;
  level: number;
}

export interface PlayerEvents extends Record<string, unknown> {
  /** Jede Änderung an Geld oder XP. */
  changed: PlayerSnapshot;
  /** Geld kam dazu oder ging weg; `grund` ist ein Textschlüssel, z. B. "verkauf". */
  transaction: { betrag: number; grund: string };
  levelUp: { level: number };
}

export class PlayerState {
  readonly events = new Emitter<PlayerEvents>();
  private geldWert: number;
  private xpWert: number;

  constructor(readonly id: string, start: PlayerStart, private readonly levels: LevelTable) {
    this.geldWert = start.geld;
    this.xpWert = start.xp;
  }

  get geld(): number { return this.geldWert; }
  get xp(): number { return this.xpWert; }

  /** Aktuelles Level, berechnet aus der XP. */
  get level(): number {
    return levelFor(this.xpWert, this.levels);
  }

  /** Fortschritt im aktuellen Level von 0 bis 1 (1 beim Höchstlevel). */
  get levelProgress(): number {
    const t = this.levels.xpFuerLevel;
    const lvl = this.level;
    if (lvl >= t.length) return 1;
    const from = t[lvl - 1], to = t[lvl];
    return (this.xpWert - from) / (to - from);
  }

  /** XP bis zum nächsten Level (0 beim Höchstlevel). */
  get xpToNext(): number {
    const t = this.levels.xpFuerLevel;
    return this.level >= t.length ? 0 : t[this.level] - this.xpWert;
  }

  /** Geld gutschreiben. */
  earn(betrag: number, grund: string): void {
    if (betrag <= 0) return;
    this.geldWert = round2(this.geldWert + betrag);
    this.events.emit('transaction', { betrag, grund });
    this.emitChanged();
  }

  /** Geld ausgeben. Gibt false zurück (und ändert nichts), wenn es nicht reicht. */
  spend(betrag: number, grund: string): boolean {
    if (betrag <= 0) return true;
    if (betrag > this.geldWert) return false;
    this.geldWert = round2(this.geldWert - betrag);
    this.events.emit('transaction', { betrag: -betrag, grund });
    this.emitChanged();
    return true;
  }

  /** Rechnung bezahlen (Strom, Wasser): wird immer abgebucht, auch wenn das Konto ins Minus geht. */
  charge(betrag: number, grund: string): void {
    if (betrag <= 0) return;
    this.geldWert = round2(this.geldWert - betrag);
    this.events.emit('transaction', { betrag: -betrag, grund });
    this.emitChanged();
  }

  canAfford(betrag: number): boolean {
    return betrag <= this.geldWert;
  }

  /** XP gutschreiben; meldet jedes neu erreichte Level einzeln. */
  addXp(menge: number): void {
    if (menge <= 0) return;
    const before = this.level;
    this.xpWert += menge;
    for (let l = before + 1; l <= this.level; l++) this.events.emit('levelUp', { level: l });
    this.emitChanged();
  }

  snapshot(): PlayerSnapshot {
    return { geld: this.geldWert, xp: this.xpWert, level: this.level };
  }

  /** Zustand aus einem Spielstand übernehmen (Level wird aus der XP berechnet). */
  restore(s: Pick<PlayerSnapshot, 'geld' | 'xp'>): void {
    this.geldWert = s.geld;
    this.xpWert = s.xp;
    this.emitChanged();
  }

  private emitChanged(): void {
    this.events.emit('changed', this.snapshot());
  }
}

export function levelFor(xp: number, levels: LevelTable): number {
  let level = 1;
  levels.xpFuerLevel.forEach((need, i) => { if (xp >= need) level = i + 1; });
  return level;
}

/** Auf Cent runden, damit sich keine Rundungsfehler aufsummieren. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
