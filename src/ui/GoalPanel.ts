import type { Content } from '../content/Content';
import type { Goals } from '../state/Goals';
import { esc } from './html';

// Kleine Liste der nächsten Ziele am linken Rand. Verschwindet, wenn alles erledigt ist.

export class GoalPanel {
  private readonly el: HTMLElement;

  constructor(parent: HTMLElement, private readonly content: Content, private readonly goals: Goals, private readonly sichtbar = 3) {
    this.el = document.createElement('div');
    this.el.className = 'goals panel';
    parent.append(this.el);
    goals.events.on('changed', () => this.render());
    this.render();
  }

  private render(): void {
    // Aktuelles Kapitel: das des ersten offenen Ziels; gezeigt werden dessen offene Ziele
    const first = this.goals.open[0];
    const kapitel = first?.kapitel;
    const imKapitel = this.goals.list.filter((g) => g.kapitel === kapitel);
    const nr = [...new Set(this.goals.list.map((g) => g.kapitel))].indexOf(kapitel) + 1;
    const open = this.goals.open.filter((g) => g.kapitel === kapitel).slice(0, this.sichtbar);
    this.el.hidden = open.length === 0;
    const reward = (g: (typeof open)[number]) =>
      [g.belohnung.xp ? `+${g.belohnung.xp} XP` : '', g.belohnung.geld ? `+${g.belohnung.geld} €` : ''].filter(Boolean).join(' · ');
    const kopf = kapitel
      ? `<h4>${esc(this.content.text('ziele_titel'))} · Kapitel ${nr}</h4><div class="chapter"><b>${esc(kapitel)}</b><small>${imKapitel.filter((g) => this.goals.isDone(g.id)).length} / ${imKapitel.length}</small></div>`
      : `<h4>${esc(this.content.text('ziele_titel'))}</h4>`;
    this.el.innerHTML = kopf + open.map((g, i) =>
      `<div class="goal ${i === 0 ? 'next' : ''}"><span class="box"></span><span>${esc(g.text)}<small>${esc(reward(g))}</small></span></div>`).join('');
  }
}
