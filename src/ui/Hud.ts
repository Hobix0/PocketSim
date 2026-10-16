import type { Content } from '../content/Content';
import type { InputMap } from '../input/InputMap';
import type { PlayerState } from '../state/PlayerState';
import type { GameClock } from '../state/GameClock';
import { Toasts } from './Toasts';
import { esc } from './html';

// HUD: Top-Bar (Geld, Level, Zeit, Tempo) und Steuerungshinweise unten.
// Alles wird nur bei Ereignissen neu geschrieben, nicht jeden Frame.
// Tastennamen kommen live aus der InputMap.

export class Hud {
  readonly root: HTMLElement;
  readonly toasts: Toasts;
  private readonly moneyEl: HTMLElement;
  private readonly deltaEl: HTMLElement;
  private readonly levelEl: HTMLElement;
  private readonly xpBar: HTMLElement;
  private readonly xpEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly speedEl: HTMLElement;
  private readonly helpEl: HTMLElement;
  private deltaTimer = 0;

  constructor(
    private readonly input: InputMap,
    content: Content,
    private readonly player: PlayerState,
    private readonly clock: GameClock,
    levelName: string,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="topbar panel">
        <span class="title">Urban<b>Evolution</b><small></small></span>
        <span class="stat money"><span class="label">Kontostand</span><b></b><i class="delta"></i></span>
        <span class="stat level"><span class="label">Level</span><b></b>
          <span class="meter"><span class="fill"></span></span><small class="xp"></small></span>
        <span class="stat time"><span class="label">Zeit</span><b></b></span>
        <span class="speed"></span>
      </div>
      <div class="hud-help panel"></div>`;
    document.body.append(this.root);
    const q = (sel: string) => this.root.querySelector(sel) as HTMLElement;
    q('.title small').textContent = levelName;
    this.moneyEl = q('.money b');
    this.deltaEl = q('.money .delta');
    this.levelEl = q('.level b');
    this.xpBar = q('.level .fill');
    this.xpEl = q('.level .xp');
    this.timeEl = q('.time b');
    this.speedEl = q('.speed');
    this.helpEl = q('.hud-help');
    this.toasts = new Toasts(this.root);

    // Tempo-Knöpfe: Klick wirkt wie die Taste
    this.speedEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur(); // sonst würde die Leertaste den Knopf ein zweites Mal auslösen
      if (b.dataset.stufe === '0') clock.togglePause();
      else clock.setStufe(Number(b.dataset.stufe));
    });

    player.events.on('changed', () => this.renderPlayer());
    player.events.on('transaction', ({ betrag }) => this.showDelta(betrag));
    player.events.on('levelUp', ({ level }) => this.toasts.show(content.text('level_erreicht', { level }), 'gut'));
    clock.events.on('minute', () => this.renderTime());
    clock.events.on('newDay', ({ tag }) => this.toasts.show(content.text('neuer_tag', { tag })));
    clock.events.on('speedChanged', () => this.renderSpeed());
    input.onChange(() => { this.renderSpeed(); this.renderHelp(); });

    this.renderPlayer();
    this.renderTime();
    this.renderSpeed();
    this.renderHelp();
  }

  private renderPlayer(): void {
    const p = this.player;
    this.moneyEl.textContent = formatMoney(p.geld);
    this.levelEl.textContent = String(p.level);
    this.xpBar.style.width = `${Math.round(p.levelProgress * 100)}%`;
    this.xpEl.textContent = p.xpToNext > 0 ? `${p.xp} XP · noch ${p.xpToNext}` : `${p.xp} XP · Höchstlevel`;
  }

  /** Kurz anzeigen, wie viel Geld dazukam oder wegging. */
  private showDelta(betrag: number): void {
    this.deltaEl.textContent = `${betrag > 0 ? '+' : '−'}${formatMoney(Math.abs(betrag))}`;
    this.deltaEl.className = `delta show ${betrag > 0 ? 'plus' : 'minus'}`;
    clearTimeout(this.deltaTimer);
    this.deltaTimer = window.setTimeout(() => this.deltaEl.classList.remove('show'), 1600);
  }

  private renderTime(): void {
    const c = this.clock;
    this.timeEl.textContent = `${c.wochentag}, Tag ${c.tag} · ${c.uhrzeit}`;
  }

  private renderSpeed(): void {
    const c = this.clock;
    const btn = (stufe: number, label: string, action: string, active: boolean) =>
      `<button type="button" data-stufe="${stufe}" class="${active ? 'active' : ''}" title="${esc(this.input.keyLabel(action))}">${label}</button>`;
    const parts = [btn(0, '❚❚', 'zeit_anhalten', c.paused)];
    for (let s = 1; s <= c.stufen; s++) parts.push(btn(s, '▶'.repeat(s), `zeit_stufe_${s}`, !c.paused && c.stufe === s));
    this.speedEl.innerHTML = parts.join('');
  }

  private renderHelp(): void {
    const k = (action: string) => `<span class="key">${esc(this.input.keyLabel(action))}</span>`;
    const hints = [
      `${k('kamera_vor')}${k('kamera_links')}${k('kamera_zurueck')}${k('kamera_rechts')} schwenken`,
      `${k('kamera_drehen_links')}${k('kamera_drehen_rechts')} drehen`,
      `<span class="key">Mausrad</span> zoomen`,
      `${k('kamera_ziehen_schieben')} ziehen: schieben`,
      `${k('kamera_ziehen_drehen')} ziehen: drehen`,
      `${k('zeit_anhalten')} Pause ${k('zeit_stufe_1')}${k('zeit_stufe_2')}${k('zeit_stufe_3')} Tempo`,
      `${k('debug_anzeige')} Debug`,
    ];
    this.helpEl.innerHTML = hints.map((h) => `<span class="hint">${h}</span>`).join('');
  }
}

export function formatMoney(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
