import { Emitter } from '../core/Emitter';
import type { RoleDef, StaffSettings } from '../content/definitions';
import type { PlayerState } from '../state/PlayerState';

// Personalverwaltung: Bewerbungen, Einstellen, Entlassen, Löhne.
// Der Lohn wird zu Beginn jedes Tages fällig. Reicht das Geld nicht, kündigt die Person.
// Keine three.js-Abhängigkeit; die Spielfiguren erzeugt das Spiel über das Ereignis "hired".

export interface Employee {
  id: number;
  name: string;
  rolle: string;
  /** Lohn pro Tag in € */
  lohn: number;
  /** Arbeitstempo, 1 = normal */
  tempo: number;
}

export interface StaffEvents extends Record<string, unknown> {
  hired: Employee;
  left: { employee: Employee; grund: 'entlassen' | 'kein_lohn' };
  candidates: Employee[];
}

export class Staff {
  readonly events = new Emitter<StaffEvents>();
  readonly team: Employee[] = [];
  candidates: Employee[] = [];
  private nextId = 1;

  constructor(
    private readonly rollen: Record<string, RoleDef>,
    private readonly settings: StaffSettings,
    private readonly namen: string[],
    private readonly player: PlayerState,
    private readonly random: () => number = Math.random,
  ) {
    this.refreshCandidates();
  }

  /** Neue Bewerbungen (z. B. jeden Morgen). Namen im Team kommen nicht doppelt vor. */
  refreshCandidates(): void {
    const used = new Set(this.team.map((e) => e.name));
    const free = this.namen.filter((n) => !used.has(n));
    const rollen = Object.keys(this.rollen);
    this.candidates = [];
    for (let i = 0; i < this.settings.bewerberAnzahl && free.length; i++) {
      const name = free.splice(Math.floor(this.random() * free.length), 1)[0];
      const rolle = rollen[Math.floor(this.random() * rollen.length)];
      const { min, max } = this.settings.tempo;
      const tempo = Math.round((min + this.random() * (max - min)) * 100) / 100;
      // Wer schneller arbeitet, verlangt etwas mehr
      const lohn = Math.round(this.rollen[rolle].lohnProTag * (0.6 + 0.4 * tempo));
      this.candidates.push({ id: this.nextId++, name, rolle, lohn, tempo });
    }
    this.events.emit('candidates', this.candidates);
  }

  hire(candidateId: number): Employee | null {
    const i = this.candidates.findIndex((c) => c.id === candidateId);
    if (i < 0) return null;
    const [employee] = this.candidates.splice(i, 1);
    this.team.push(employee);
    this.events.emit('hired', employee);
    this.events.emit('candidates', this.candidates);
    return employee;
  }

  fire(employeeId: number): void {
    this.leave(employeeId, 'entlassen');
  }

  /** Tageswechsel: Löhne zahlen (wer nicht bezahlt werden kann, kündigt), neue Bewerbungen. */
  payDay(): void {
    for (const e of [...this.team]) {
      if (!this.player.spend(e.lohn, 'lohn')) this.leave(e.id, 'kein_lohn');
    }
    this.refreshCandidates();
  }

  /** Summe aller Tageslöhne. */
  get dailyWages(): number {
    return this.team.reduce((s, e) => s + e.lohn, 0);
  }

  private leave(id: number, grund: 'entlassen' | 'kein_lohn'): void {
    const i = this.team.findIndex((e) => e.id === id);
    if (i < 0) return;
    const [employee] = this.team.splice(i, 1);
    this.events.emit('left', { employee, grund });
  }
}
