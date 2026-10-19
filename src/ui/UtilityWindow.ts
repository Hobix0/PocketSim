import type { Production } from '../economy/Production';
import { UTILITY_KINDS, type Utilities } from '../economy/Utilities';
import { esc } from './html';
import { formatMoney } from './format';

// Versorgung: Strom und Wasser – Bedarf jetzt (Grundlast + laufende Maschinen) gegenüber dem
// Hausanschluss, Verbrauch und Kosten seit Tagesbeginn, Ausbau des Anschlusses.

export class UtilityWindow {
  private readonly el: HTMLElement;
  private message = '';
  private lastKey = '';

  constructor(parent: HTMLElement, private readonly utilities: Utilities, private readonly production: Production, private readonly level: () => number) {
    this.el = document.createElement('div');
    this.el.className = 'window utilities panel';
    this.el.hidden = true;
    parent.append(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      if (b.classList.contains('close')) this.close();
      else if (b.dataset.upgrade) {
        const r = utilities.upgrade(b.dataset.upgrade as 'strom' | 'wasser');
        this.message = r.ok ? 'Anschluss ausgebaut.' : r.grund === 'geld' ? 'Dafür reicht das Geld nicht.' : r.grund === 'gesperrt' ? 'Noch nicht freigeschaltet.' : '';
        this.render();
      }
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.message = '';
    this.el.hidden = false;
    this.render();
  }

  close(): void {
    this.el.hidden = true;
  }

  toggleOpen(): void {
    if (this.isOpen) this.close(); else this.open();
  }

  update(): void {
    if (!this.isOpen) return;
    const d = this.production.demand();
    const key = UTILITY_KINDS.map((a) => `${d[a].toFixed(2)}|${this.utilities.kosten(a)}`).join('|');
    if (key !== this.lastKey) this.render();
  }

  private render(): void {
    const demand = this.production.demand();
    const base = this.production.baseDemand();
    this.lastKey = UTILITY_KINDS.map((a) => `${demand[a].toFixed(2)}|${this.utilities.kosten(a)}`).join('|');
    const fmt = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 });
    const blocks = UTILITY_KINDS.map((art) => {
      const s = this.utilities.settings[art];
      const cap = this.utilities.anschluss(art);
      const share = cap > 0 ? Math.min(1, demand[art] / cap) : 1;
      const next = this.utilities.nextStage(art);
      const locked = next && next.freischaltLevel > this.level();
      return `<section class="utility">
        <h4>${esc(s.name)}</h4>
        <div class="row"><span>Bedarf jetzt</span><b>${fmt(demand[art])} / ${fmt(cap)} ${esc(s.einheit)}</b></div>
        <span class="meter"><span class="${share > 0.9 ? 'high' : ''}" style="width:${Math.round(share * 100)}%"></span></span>
        <small>Grundlast ${fmt(base[art])} ${esc(s.einheit)} (Summe aller Bauteile), Rest: laufende Maschinen</small>
        <div class="row"><span>Verbraucht seit Tagesbeginn</span><b>${fmt(this.utilities.verbrauch(art))} ${esc(s.verbrauchEinheit)} · ${formatMoney(this.utilities.kosten(art))}</b></div>
        <small>${s.preis < 0.01 ? `${formatMoney(s.preis * 1000)} je 1.000 ${esc(s.verbrauchEinheit)}` : `${formatMoney(s.preis)} je ${esc(s.verbrauchEinheit)}`}, abgerechnet um Mitternacht</small>
        ${next ? `<button type="button" class="primary" data-upgrade="${art}" ${locked ? 'disabled' : ''}>Anschluss auf ${fmt(next.anschluss)} ${esc(s.einheit)} ausbauen · ${formatMoney(next.preis)}${locked ? ` (ab Level ${next.freischaltLevel})` : ''}</button>` : '<small>Höchste Ausbaustufe erreicht.</small>'}
      </section>`;
    }).join('');
    this.el.innerHTML = `
      <header><h2>Versorgung</h2><button type="button" class="close" aria-label="Schließen">✕</button></header>
      <p class="lead">Strom und Wasser kommen über den Hausanschluss. Reicht er nicht, starten keine Maschinen und neue Verbraucher lassen sich nicht bauen.</p>
      ${this.message ? `<p class="msg">${esc(this.message)}</p>` : ''}
      <div class="utility-grid">${blocks}</div>`;
  }
}
