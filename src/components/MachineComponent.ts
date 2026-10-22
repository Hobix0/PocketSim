import * as THREE from 'three';
import { InteractableComponent, type InteractionOption } from '../interaction/InteractableComponent';
import type { Content } from '../content/Content';
import type { MachineDef, RecipeDef } from '../content/definitions';
import type { GameActions } from '../factory/FactoryContext';
import type { Production, StartCheck } from '../economy/Production';
import type { Describable, InfoRow } from '../ui/describe';
import type { PersistentComponent } from '../save/SaveGame';

// Eine Maschine (Backstation, Saftpresse …): Rezept wählen, starten, nach der Dauer liegt das
// Ergebnis als Karton im Lager. Mit „Wiederholen“ startet sie von selbst neu, sobald Rohstoffe,
// Strom und Lagerplatz da sind. Eine kleine Lampe zeigt den Zustand (grün = läuft, gelb = wartet).

export type MachineStatus = 'bereit' | 'laeuft' | 'wartet_rohstoffe' | 'wartet_strom' | 'wartet_wasser' | 'wartet_lager' | 'wartet_zentrallager';

export interface MachineServices {
  production: Production;
  /** Spielminuten je Simulationssekunde */
  minutesPerSecond: number;
  /** Von Hand gestartet (bringt XP) bzw. ein Durchgang fertig */
  started(byHand: boolean): void;
  finished(r: RecipeDef): void;
}

export class MachineComponent extends InteractableComponent implements Describable, PersistentComponent {
  override readonly kontext = 'maschine';
  readonly persistKey = 'maschine';
  rezept: RecipeDef | null = null;
  laeuft = false;
  /** Spielminuten seit dem Start */
  fortschritt = 0;
  wiederholen = true;
  status: MachineStatus = 'bereit';
  /** Letzte Prüfung (was fehlt) – für die Anzeige */
  letztePruefung: StartCheck | null = null;
  durchgaenge = 0;
  private retry = 0;
  private lamp: THREE.Mesh | null = null;

  constructor(
    readonly def: MachineDef,
    private readonly height: number,
    private readonly services?: MachineServices,
    private readonly actions?: GameActions,
  ) {
    super();
  }

  get anteil(): number {
    return this.rezept && this.laeuft ? Math.min(1, this.fortschritt / this.rezept.dauer) : 0;
  }

  override onAttach(): void {
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: '#444', emissive: '#000' }));
    this.lamp.position.set(0, this.height + 0.08, 0);
    this.entity.object.add(this.lamp);
    this.renderLamp();
  }

  override onDetach(): void {
    if (!this.lamp) return;
    this.entity.object.remove(this.lamp);
    this.lamp.geometry.dispose();
    (this.lamp.material as THREE.Material).dispose();
    this.lamp = null;
  }

  /** Rezept wählen (stoppt nichts, gilt ab dem nächsten Durchgang). */
  choose(r: RecipeDef): void {
    if (this.laeuft) return;
    this.rezept = r;
    this.setStatus('bereit');
  }

  /** Von Hand starten. */
  start(): StartCheck {
    return this.tryStart(true);
  }

  override update(dt: number): void {
    if (!this.services || dt <= 0) return;
    const minutes = dt * this.services.minutesPerSecond;
    if (this.laeuft && this.rezept) {
      this.fortschritt += minutes;
      if (this.fortschritt < this.rezept.dauer) return;
      if (!this.services.production.deliver(this.rezept, this.def)) { this.setStatus('wartet_lager'); return; }
      this.laeuft = false;
      this.fortschritt = 0;
      this.durchgaenge++;
      this.services.finished(this.rezept);
      if (this.wiederholen) this.tryStart(false);
      else this.setStatus('bereit');
      return;
    }
    // Wartet: jede Spielminute neu versuchen
    if (this.rezept && this.wiederholen && this.status !== 'bereit') {
      this.retry -= minutes;
      if (this.retry <= 0) { this.retry = 1; this.tryStart(false); }
    }
  }

  options(): InteractionOption[] {
    return [{ aktion: 'auswaehlen', text: 'maschine_bedienen', prioritaet: 10, run: () => this.actions?.openMachine(this.entity) }];
  }

  describe(): InfoRow[] {
    return [
      { label: 'Rezept', value: this.rezept?.name ?? '–' },
      { label: 'Zustand', value: STATUS_TEXT[this.status] + (this.laeuft ? ` (${Math.round(this.anteil * 100)} %)` : '') },
      { label: 'Verbrauch beim Laufen', value: `${this.def.strom} kW${this.def.wasser ? ` · ${this.def.wasser} l/h` : ''}` },
      { label: 'Durchgänge', value: String(this.durchgaenge) },
    ];
  }

  saveState(): unknown {
    return { rezept: this.rezept?.id ?? null, laeuft: this.laeuft, fortschritt: this.fortschritt, wiederholen: this.wiederholen, durchgaenge: this.durchgaenge };
  }

  loadState(data: unknown, content: Content): void {
    const d = data as { rezept?: string | null; laeuft?: boolean; fortschritt?: number; wiederholen?: boolean; durchgaenge?: number };
    this.rezept = d.rezept ? content.rezepte.find(d.rezept) ?? null : null;
    this.laeuft = !!d.laeuft && !!this.rezept;
    this.fortschritt = this.laeuft ? Math.max(0, d.fortschritt ?? 0) : 0;
    this.wiederholen = d.wiederholen ?? true;
    this.durchgaenge = d.durchgaenge ?? 0;
    this.setStatus(this.laeuft ? 'laeuft' : 'bereit');
  }

  private tryStart(byHand: boolean): StartCheck {
    if (!this.services || !this.rezept || this.laeuft) return { ok: false, grund: 'gesperrt' };
    const check = this.services.production.canStart(this.rezept, this.def);
    this.letztePruefung = check;
    if (!check.ok) {
      this.setStatus(check.grund === 'rohstoffe' ? 'wartet_rohstoffe' : check.grund === 'strom' ? 'wartet_strom' : check.grund === 'wasser' ? 'wartet_wasser' : check.grund === 'zentrallager' ? 'wartet_zentrallager' : 'bereit');
      return check;
    }
    this.services.production.consume(this.rezept, this.def);
    this.laeuft = true;
    this.fortschritt = 0;
    this.setStatus('laeuft');
    this.services.started(byHand);
    return check;
  }

  private setStatus(s: MachineStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.renderLamp();
    this.notifyChanged();
  }

  private renderLamp(): void {
    if (!this.lamp) return;
    const m = this.lamp.material as THREE.MeshStandardMaterial;
    const color = this.status === 'laeuft' ? '#5fd08a' : this.status === 'bereit' ? '#444444' : '#e0b23c';
    m.color.set(color);
    m.emissive.set(this.status === 'bereit' ? '#000000' : color);
    m.emissiveIntensity = 0.8;
  }
}

export const STATUS_TEXT: Record<MachineStatus, string> = {
  bereit: 'bereit',
  laeuft: 'läuft',
  wartet_rohstoffe: 'wartet auf Rohstoffe',
  wartet_strom: 'Stromanschluss reicht nicht',
  wartet_wasser: 'Wasseranschluss reicht nicht',
  wartet_lager: 'Lager voll – wartet auf Platz',
  wartet_zentrallager: 'braucht ein Zentrallager (Immobilien → Industriegebiet)',
};
