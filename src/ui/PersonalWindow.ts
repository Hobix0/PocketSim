import type { Content } from '../content/Content';
import type { Staff, Employee } from '../economy/Staff';
import { esc } from './html';
import { formatMoney } from './format';

// Personal-Fenster: das eigene Team (mit aktuellem Status) und die heutigen Bewerbungen.

export class PersonalWindow {
  private readonly el: HTMLElement;
  private readonly teamEl: HTMLElement;
  private readonly candEl: HTMLElement;
  private lastStatus = '';

  constructor(
    parent: HTMLElement,
    private readonly content: Content,
    private readonly staff: Staff,
    /** Arbeitsverhalten zu einer angestellten Person (für den Status) */
    private readonly workerOf: (e: Employee) => { statusText(): string } | undefined,
  ) {
    const t = (k: string) => esc(content.text(k));
    this.el = document.createElement('div');
    this.el.className = 'window personal panel';
    this.el.hidden = true;
    this.el.innerHTML = `
      <header><h2>${t('personal_titel')}</h2><button type="button" class="close" aria-label="${t('schliessen')}">✕</button></header>
      <p class="lead">${t('personal_hinweis')}</p>
      <h4>${t('personal_team')}</h4>
      <div class="list team"></div>
      <h4>${t('personal_bewerber')}</h4>
      <div class="list candidates"></div>`;
    parent.append(this.el);
    this.teamEl = this.el.querySelector('.team')!;
    this.candEl = this.el.querySelector('.candidates')!;

    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      if (b.classList.contains('close')) this.close();
      else if (b.dataset.hire) staff.hire(Number(b.dataset.hire));
      else if (b.dataset.fire) staff.fire(Number(b.dataset.fire));
    });
    staff.events.on('hired', () => this.isOpen && this.render());
    staff.events.on('left', () => this.isOpen && this.render());
    staff.events.on('candidates', () => this.isOpen && this.render());
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    this.render();
  }

  close(): void {
    this.el.hidden = true;
  }

  toggleOpen(): void {
    if (this.isOpen) this.close(); else this.open();
  }

  /** Jeden Frame: Status des Teams nachführen (nur bei Änderung neu zeichnen). */
  update(): void {
    if (!this.isOpen) return;
    const status = this.staff.team.map((e) => this.workerOf(e)?.statusText() ?? '').join('|');
    if (status !== this.lastStatus) this.renderTeam();
  }

  private render(): void {
    this.renderTeam();
    const c = this.content;
    this.candEl.innerHTML = this.staff.candidates.map((e) => this.row(e, `
      <button type="button" class="primary small" data-hire="${e.id}">${esc(c.text('personal_einstellen'))}</button>`)).join('')
      || `<p class="empty">–</p>`;
  }

  private renderTeam(): void {
    this.lastStatus = this.staff.team.map((e) => this.workerOf(e)?.statusText() ?? '').join('|');
    this.teamEl.innerHTML = this.staff.team.map((e) => this.row(e, `
      <button type="button" data-fire="${e.id}">${esc(this.content.text('personal_entlassen'))}</button>`, this.workerOf(e)?.statusText()))
      .join('') || `<p class="empty">${esc(this.content.text('personal_team_leer'))}</p>`;
  }

  private row(e: Employee, action: string, status?: string): string {
    const c = this.content;
    const rolle = c.rollen[e.rolle];
    return `
      <div class="item person">
        <span class="avatar" style="background:${esc(rolle.farbe)}"></span>
        <div class="item-text"><b>${esc(e.name)}</b>
          <small>${esc(rolle.name)} · ${esc(c.text('personal_tempo', { tempo: Math.round(e.tempo * 100) }))}${status ? ` · ${esc(status)}` : ''}</small></div>
        <div class="price">${esc(c.text('personal_lohn', { betrag: formatMoney(e.lohn) }))}</div>
        ${action}
      </div>`;
  }
}
