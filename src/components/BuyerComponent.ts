import * as THREE from 'three';
import { Component } from '../ecs/Component';
import type { Entity } from '../ecs/Entity';
import type { Employee } from '../economy/Staff';
import type { Describable, InfoRow } from '../ui/describe';
import { PathFollower, turnTowards, type PathFinder } from '../navigation/PathFollower';
import { formatMoney } from '../ui/format';

// Arbeitsverhalten eines Einkäufers:
//   sucht_terminal → geht_zum_terminal → am_terminal
// Am Terminal prüft er regelmäßig die Bestände und bestellt nach (das erledigt das Spiel über
// `ready` – siehe Game: Einkäufer). Ohne Einkaufsterminal kann er nicht bestellen.

export type BuyerState = 'sucht_terminal' | 'geht_zum_terminal' | 'am_terminal';

export interface BuyerServices {
  /** Ein Einkaufsterminal (oder null) */
  findTerminal(): Entity | null;
  findPath?: PathFinder;
  gehgeschwindigkeit: number;
  rollenName: string;
  text(key: string, werte?: Record<string, string | number>): string;
}

export class BuyerComponent extends Component implements Describable {
  state: BuyerState = 'sucht_terminal';
  /** Letzte Bestellung (für Anzeigen) */
  letzte: { kartons: number; kosten: number } | null = null;
  private terminal: Entity | null = null;
  private wait = 0;
  private readonly path = new PathFollower();

  constructor(readonly employee: Employee, private readonly services: BuyerServices) {
    super();
  }

  /** Steht am Terminal und kann bestellen */
  get ready(): boolean {
    return this.state === 'am_terminal' && !!this.terminal?.world;
  }

  override update(dt: number): void {
    if (dt <= 0) return;
    if (this.state !== 'sucht_terminal' && !this.terminal?.world) { this.terminal = null; this.setState('sucht_terminal'); return; }
    switch (this.state) {
      case 'sucht_terminal':
        this.wait -= dt;
        if (this.wait > 0) break;
        this.wait = 2;
        this.terminal = this.services.findTerminal();
        if (!this.terminal) break;
        this.path.goTo(this.entity.object, standPoint(this.terminal, this.entity.object.position.y), this.services.findPath);
        this.setState('geht_zum_terminal');
        break;
      case 'geht_zum_terminal':
        if (this.path.step(this.entity.object, this.services.gehgeschwindigkeit * this.employee.tempo, dt)) this.setState('am_terminal');
        break;
      case 'am_terminal': {
        // Zum Terminal schauen (vorwärts ist +Z, gedreht um rotation.y)
        const o = this.entity.object.position, t = this.terminal!.object.position;
        turnTowards(this.entity.object, Math.atan2(t.x - o.x, t.z - o.z), dt);
        break;
      }
    }
  }

  /** Bestellung merken (Anzeige im Personal-Fenster) */
  ordered(kartons: number, kosten: number): void {
    this.letzte = { kartons, kosten };
    this.notifyChanged();
  }

  statusText(): string {
    if (this.state === 'sucht_terminal') return this.services.text(this.terminal ? 'status_sucht_terminal' : 'status_kein_terminal');
    if (this.state === 'am_terminal' && this.letzte) return this.services.text('status_bestellt', { kartons: this.letzte.kartons, betrag: formatMoney(this.letzte.kosten) });
    return this.services.text(`status_${this.state}`);
  }

  describe(): InfoRow[] {
    return [
      { label: 'Rolle', value: this.services.rollenName },
      { label: 'Lohn', value: `${formatMoney(this.employee.lohn)} / Tag` },
      { label: 'Tempo', value: `${Math.round(this.employee.tempo * 100)} %` },
      { label: 'Gerade', value: this.statusText() },
    ];
  }

  private setState(s: BuyerState): void {
    this.state = s;
    this.notifyChanged();
  }
}

/** Platz vor dem Terminal (lokales +Z ist bei den Bauteilen vorne), auf Bodenhöhe der Figur */
function standPoint(terminal: Entity, y: number): THREE.Vector3 {
  const o = terminal.object;
  const dir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotation.y);
  return new THREE.Vector3(o.position.x, y, o.position.z).addScaledVector(dir, 0.8);
}
