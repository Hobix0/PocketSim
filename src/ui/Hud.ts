import type { Content } from '../content/Content';
import type { InputMap } from '../input/InputMap';
import type { PlayerState } from '../state/PlayerState';
import type { GameClock } from '../state/GameClock';
import { Toasts } from './Toasts';
import { esc } from './html';
import { formatMoney } from './format';

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
  private readonly toolsEl: HTMLElement;
  private readonly handEl: HTMLElement;
  private readonly toolHandlers = new Map<string, () => void>();
  private readonly texts: (key: string) => string;
  private deltaTimer = 0;
  private storeKey = '';

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
        <span class="stat store"><span class="label"></span><b></b>
          <span class="meter ruf"><span class="fill"></span></span><small></small></span>
        <span class="speed"></span>
        <span class="tools">
          <button type="button" data-tool="bauen"></button>
          <button type="button" data-tool="personal"></button>
          <button type="button" data-tool="sortiment"></button>
          <button type="button" data-tool="bilanz"></button>
          <button type="button" data-tool="versorgung"></button>
          <button type="button" data-tool="lager"></button>
          <button type="button" data-tool="menue" aria-label="Menü">☰</button>
        </span>
      </div>
      <div class="hand panel" hidden></div>
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
    this.toolsEl = q('.tools');
    this.handEl = q('.hand');
    this.toasts = new Toasts(this.root);
    this.toolsEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.tool) return;
      b.blur();
      this.toolHandlers.get(b.dataset.tool)?.();
    });

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
    input.onChange(() => { this.renderSpeed(); this.renderHelp(); this.renderTools(); });
    this.texts = (k: string) => content.text(k);

    this.renderPlayer();
    this.renderTools();
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

  /** Ladenstatus: geöffnet/geschlossen, Kunden im Laden, Ruf (0–100). Schreibt nur bei Änderung. */
  setStore(offen: boolean, status: string, kunden: number, ruf: number): void {
    const key = `${offen}|${status}|${kunden}|${Math.round(ruf)}`;
    if (key === this.storeKey) return;
    this.storeKey = key;
    const el = this.root.querySelector('.store') as HTMLElement;
    el.classList.toggle('closed', !offen);
    (el.querySelector('.label') as HTMLElement).textContent = status;
    (el.querySelector('b') as HTMLElement).textContent = `${kunden} ${this.texts(kunden === 1 ? 'kunde' : 'kunden')}`;
    (el.querySelector('.fill') as HTMLElement).style.width = `${Math.round(ruf)}%`;
    (el.querySelector('small') as HTMLElement).textContent = `${this.texts('ruf')} ${Math.round(ruf)}`;
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

  /** Was ein Knopf der Werkzeugleiste tut ("bauen", "personal"). */
  onTool(tool: string, handler: () => void): void {
    this.toolHandlers.set(tool, handler);
  }

  /** Knopf als aktiv zeigen (z. B. Baumenü offen). */
  setToolActive(tool: string, active: boolean): void {
    this.toolsEl.querySelector(`[data-tool="${tool}"]`)?.classList.toggle('active', active);
  }

  /** Was der Spieler in der Hand hält; null blendet die Anzeige aus. */
  showHand(text: string | null, hint = ''): void {
    this.handEl.hidden = text === null;
    if (text !== null) this.handEl.innerHTML = `<b>${esc(text)}</b>${hint ? `<small>${hint}</small>` : ''}`;
  }

  private renderTools(): void {
    const key = (a: string) => `<span class="key">${esc(this.input.keyLabel(a))}</span>`;
    this.toolsEl.querySelector('[data-tool="bauen"]')!.innerHTML = `${esc(this.texts('bauen'))} ${key('bauen_menue')}`;
    this.toolsEl.querySelector('[data-tool="personal"]')!.innerHTML = `${esc(this.texts('personal'))} ${key('personal_menue')}`;
    this.toolsEl.querySelector('[data-tool="sortiment"]')!.innerHTML = `${esc(this.texts('sortiment'))} ${key('sortiment_menue')}`;
    this.toolsEl.querySelector('[data-tool="bilanz"]')!.innerHTML = `${esc(this.texts('bilanz'))} ${key('bilanz_menue')}`;
    this.toolsEl.querySelector('[data-tool="versorgung"]')!.innerHTML = `${esc(this.texts('versorgung'))} ${key('versorgung_menue')}`;
    this.toolsEl.querySelector('[data-tool="lager"]')!.innerHTML = `${esc(this.texts('lager'))} ${key('lager_menue')}`;
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
