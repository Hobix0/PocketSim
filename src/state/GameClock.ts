import { Emitter } from '../core/Emitter';

// Spielzeit: Tag, Uhrzeit, Geschwindigkeit, Pause.
// update() bekommt die echte Zeit und gibt die Simulationszeit zurück: echte Sekunden × Tempo.
// Figuren laufen dadurch bei Tempo 1 in natürlicher Geschwindigkeit, während die Uhr schneller läuft
// (1 echte Sekunde = spielminutenProSekunde Spielminuten). Die Kamera läuft immer in Echtzeit.
// Mit `boost` (z. B. nachts im leeren Laden) läuft alles zusätzlich schneller.
// Keine three.js-Abhängigkeit, damit der Zustand später auch auf einem Server laufen kann.

export interface ClockSettings {
  startTag: number;
  startUhrzeit: string;           // "HH:MM"
  spielminutenProSekunde: number; // bei Geschwindigkeit 1
  geschwindigkeiten: number[];    // Faktoren der Stufen 1, 2, 3 …
  wochentage: string[];
}

export interface ClockEvents extends Record<string, unknown> {
  /** Die angezeigte Minute hat sich geändert. */
  minute: { tag: number; stunde: number; minute: number };
  newDay: { tag: number };
  /** Pause oder Geschwindigkeit hat sich geändert. */
  speedChanged: { paused: boolean; stufe: number };
}

const MINUTES_PER_DAY = 24 * 60;

export class GameClock {
  readonly events = new Emitter<ClockEvents>();
  /** Spielminuten seit Tag 1, 00:00. */
  private total: number;
  private stufeWert = 1;
  private pausedWert = false;

  constructor(private readonly settings: ClockSettings) {
    const [h, m] = settings.startUhrzeit.split(':').map(Number);
    this.total = (settings.startTag - 1) * MINUTES_PER_DAY + h * 60 + m;
  }

  get tag(): number { return Math.floor(this.total / MINUTES_PER_DAY) + 1; }
  get stunde(): number { return Math.floor((this.total % MINUTES_PER_DAY) / 60); }
  get minute(): number { return Math.floor(this.total % 60); }
  get wochentag(): string { return this.settings.wochentage[(this.tag - 1) % this.settings.wochentage.length]; }
  /** Uhrzeit als "07:05". */
  get uhrzeit(): string { return `${pad(this.stunde)}:${pad(this.minute)}`; }
  get paused(): boolean { return this.pausedWert; }
  /** Aktuelle Geschwindigkeitsstufe, beginnend bei 1. */
  get stufe(): number { return this.stufeWert; }
  get stufen(): number { return this.settings.geschwindigkeiten.length; }
  /** Spielminuten seit Spielbeginn (für Speichern und Berechnungen). */
  get totalMinutes(): number { return this.total; }

  /** Zusätzlicher Zeitfaktor, z. B. nachts, wenn nichts passiert (1 = aus). */
  boost = 1;

  /** Echte Sekunden einrechnen; gibt die Simulationssekunden zurück (echte Sekunden × Tempo, 0 in der Pause). */
  update(realSeconds: number): number {
    if (this.pausedWert) return 0;
    const factor = this.settings.geschwindigkeiten[this.stufeWert - 1] * this.boost;
    const minutes = realSeconds * this.settings.spielminutenProSekunde * factor;
    const before = this.total;
    this.total += minutes;
    if (Math.floor(this.total) !== Math.floor(before)) {
      const dayBefore = Math.floor(before / MINUTES_PER_DAY);
      if (Math.floor(this.total / MINUTES_PER_DAY) !== dayBefore) this.events.emit('newDay', { tag: this.tag });
      this.events.emit('minute', { tag: this.tag, stunde: this.stunde, minute: this.minute });
    }
    return realSeconds * factor;
  }

  /** Stand für den Spielstand */
  state(): { total: number; stufe: number } {
    return { total: this.total, stufe: this.stufeWert };
  }

  /** Spielstand übernehmen (ohne Ereignisse für Tageswechsel o. Ä.) */
  restore(s: { total: number; stufe: number }): void {
    this.total = s.total;
    this.stufeWert = Math.min(Math.max(1, Math.round(s.stufe)), this.stufen);
    this.events.emit('minute', { tag: this.tag, stunde: this.stunde, minute: this.minute });
    this.emitSpeed();
  }

  setPaused(paused: boolean): void {
    if (paused === this.pausedWert) return;
    this.pausedWert = paused;
    this.emitSpeed();
  }

  togglePause(): void {
    this.setPaused(!this.pausedWert);
  }

  /** Geschwindigkeitsstufe wählen (1 … stufen); hebt eine Pause auf. */
  setStufe(stufe: number): void {
    const s = Math.min(Math.max(1, Math.round(stufe)), this.stufen);
    if (s === this.stufeWert && !this.pausedWert) return;
    this.stufeWert = s;
    this.pausedWert = false;
    this.emitSpeed();
  }

  private emitSpeed(): void {
    this.events.emit('speedChanged', { paused: this.pausedWert, stufe: this.stufeWert });
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
