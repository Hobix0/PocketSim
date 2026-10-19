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
    goals.events.on('completed', () => this.render());
    this.render();
  }

  private render(): void {
    const open = this.goals.open.slice(0, this.sichtbar);
    this.el.hidden = open.length === 0;
    const reward = (g: (typeof open)[number]) =>
      [g.belohnung.xp ? `+${g.belohnung.xp} XP` : '', g.belohnung.geld ? `+${g.belohnung.geld} €` : ''].filter(Boolean).join(' · ');
    this.el.innerHTML = `<h4>${esc(this.content.text('ziele_titel'))}</h4>` + open.map((g, i) =>
      `<div class="goal ${i === 0 ? 'next' : ''}"><span class="box"></span><span>${esc(g.text)}<small>${esc(reward(g))}</small></span></div>`).join('');
  }
}
