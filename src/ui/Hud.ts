import type { InputMap } from '../input/InputMap';
import type { Cell } from '../world/GridCursor';

// Einfaches HUD: Titelleiste mit Feldanzeige und Steuerungshinweise.
// Die Tastennamen kommen aus der InputMap und werden bei jeder Umbelegung neu geschrieben.

export class Hud {
  private readonly root: HTMLElement;
  private readonly cellEl: HTMLElement;
  private readonly helpEl: HTMLElement;
  private lastCell = '';

  constructor(private readonly input: InputMap, levelName: string) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top panel">
        <span class="title">Urban<b>Evolution</b></span>
        <span class="level"></span>
        <span class="cell"></span>
      </div>
      <div class="hud-help panel"></div>`;
    this.root.querySelector('.level')!.textContent = levelName;
    this.cellEl = this.root.querySelector('.cell')!;
    this.helpEl = this.root.querySelector('.hud-help')!;
    document.body.append(this.root);

    this.renderHelp();
    input.onChange(() => this.renderHelp());
  }

  /** Feld unter der Maus anzeigen (nur bei Änderung ins DOM schreiben). */
  showCell(cell: Cell | null): void {
    const text = cell ? `Feld ${Math.floor(cell.x)} | ${Math.floor(cell.z)}` : '';
    if (text === this.lastCell) return;
    this.lastCell = text;
    this.cellEl.textContent = text;
  }

  private renderHelp(): void {
    const k = (action: string) => `<span class="key">${escapeHtml(this.input.keyLabel(action))}</span>`;
    const hints = [
      `${k('kamera_vor')}${k('kamera_links')}${k('kamera_zurueck')}${k('kamera_rechts')} schwenken`,
      `${k('kamera_drehen_links')}${k('kamera_drehen_rechts')} drehen`,
      `<span class="key">Mausrad</span> zoomen`,
      `${k('kamera_ziehen_schieben')} ziehen: schieben`,
      `${k('kamera_ziehen_drehen')} ziehen: drehen`,
      `${k('debug_anzeige')} Debug-Anzeige`,
    ];
    this.helpEl.innerHTML = hints.map((h) => `<span class="hint">${h}</span>`).join('');
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
