import type { Sites, SiteKind } from '../world/Sites';
import type { Locations } from '../world/Locations';
import type { Staff } from '../economy/Staff';
import type { Content } from '../content/Content';
import { HAUPTLADEN } from '../world/Sites';
import { esc } from './html';
import { formatMoney } from './format';

// Meine Läden (Taste H): alle Standorte auf einen Blick – was für ein Laden, heute Kunden und Umsatz,
// Kassen, zugeteiltes Personal und was noch fehlt, damit Kundschaft kommt.

const ART: Record<SiteKind, [string, string]> = {
  supermarkt: ['🛒', 'Supermarkt'], cafe: ['☕', 'Café'], mode: ['👗', 'Modeladen'], leer: ['📦', 'noch leer'],
};

export class SitesWindow {
  private readonly el: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly content: Content,
    private readonly sites: Sites,
    private readonly locations: Locations,
    private readonly staff: Staff,
    showSite: (id: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'window sites panel';
    this.el.hidden = true;
    parent.append(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      if (b.classList.contains('close')) this.close();
      else if (b.dataset.zeigen) { this.close(); showSite(b.dataset.zeigen); }
    });
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

  refresh(): void {
    if (this.isOpen) this.render();
  }

  private render(): void {
    const cards = this.sites.list().map((s) => {
      const [icon, art] = ART[this.sites.kind(s.id)];
      const h = this.sites.today(s.id);
      const kassen = this.sites.checkouts(s.id);
      const leute = this.staff.team.filter((e) => e.standort === s.id).map((e) => `${esc(e.name)} (${esc(this.content.rollen[e.rolle].name)})`);
      const hinweise: string[] = [];
      if (s.plot) {
        if (this.sites.kind(s.id) === 'leer') hinweise.push('Stell Regale mit Ware hinein – erst dann kommt Kundschaft.');
        if (!kassen) hinweise.push('Noch keine Kasse: Kunden kommen erst, wenn sie hier bezahlen können.');
        else if (!leute.some((x) => x.includes('Kassierer') || x.includes('Barista'))) hinweise.push('Niemand fest an der Kasse – teile im Personal jemanden zu (📍).');
        if (this.locations.active(s.plot)) hinweise.unshift(`Läuft: bringt +${Math.round(this.locations.potential(s.plot) * 100)} % Kundschaft in die Stadt.`);
      }
      return `<div class="site">
        <div class="site-head"><span class="icon">${icon}</span><div><b>${esc(s.name)}</b><small>${art}${s.plot?.angebot ? ` · ${esc(s.plot.angebot.lage)}` : ''}</small></div>
          <button type="button" data-zeigen="${esc(s.id)}">📍 Ansehen</button></div>
        <div class="site-stats"><span>Heute <b>${h.kunden}</b> Kunden</span><span><b>${formatMoney(h.umsatz)}</b> Umsatz</span><span><b>${kassen}</b> ${kassen === 1 ? 'Kasse' : 'Kassen'}</span></div>
        <small>Personal fest hier: ${leute.length ? leute.join(', ') : s.id === HAUPTLADEN ? 'alle ohne festen Laden' : 'niemand'}</small>
        ${hinweise.map((x) => `<small class="hint-line">${esc(x)}</small>`).join('')}
      </div>`;
    }).join('');
    this.el.innerHTML = `
      <header><h2>Meine Läden</h2><button type="button" class="close" aria-label="Schließen">✕</button></header>
      <p class="lead">Jeder Laden hat seine eigene Kundschaft, seine Kassen und sein Sortiment – was in seinen Regalen steht. Personal teilst du im Personal-Fenster einem Laden zu (📍); wer keinen festen Laden hat, hilft überall.</p>
      <div class="site-list">${cards}</div>`;
  }
}
