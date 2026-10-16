import type { Content } from '../content/Content';
import type { ProductDef } from '../content/definitions';
import type { Purchasing, OrderError } from '../economy/Purchasing';
import type { PlayerState } from '../state/PlayerState';
import type { World } from '../ecs/World';
import type { Toasts } from './Toasts';
import { iconUrl } from '../assets/icons';
import { esc } from './html';
import { formatMoney } from './format';

// Großhandel-Fenster: Produkte nach Warenkategorie (Tabs), Kartons wählen, bestellen.
// Die Produktliste kommt automatisch aus data/produkte.

export class PurchaseWindow {
  private readonly el: HTMLElement;
  private readonly tabsEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly summaryEl: HTMLElement;
  private readonly errorEl: HTMLElement;
  private readonly orderBtn: HTMLButtonElement;
  /** Produkt-id → gewählte Kartons */
  private readonly cart = new Map<string, number>();
  private kategorie: string;

  constructor(
    parent: HTMLElement,
    private readonly content: Content,
    private readonly purchasing: Purchasing,
    private readonly player: PlayerState,
    world: World,
    private readonly toasts: Toasts,
  ) {
    const t = (k: string) => esc(content.text(k));
    this.el = document.createElement('div');
    this.el.className = 'window purchase panel';
    this.el.hidden = true;
    this.el.innerHTML = `
      <header><h2>${t('einkauf_titel')}</h2><button type="button" class="close" aria-label="${t('schliessen')}">✕</button></header>
      <p class="lead">${t('einkauf_hinweis')}</p>
      <nav class="tabs" role="tablist"></nav>
      <div class="list"></div>
      <footer>
        <div class="summary"></div>
        <div class="error" role="alert"></div>
        <button type="button" class="primary order">${t('einkauf_bestellen')}</button>
      </footer>`;
    parent.append(this.el);
    const q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
    this.tabsEl = q('.tabs');
    this.listEl = q('.list');
    this.summaryEl = q('.summary');
    this.errorEl = q('.error');
    this.orderBtn = q<HTMLButtonElement>('.order');
    this.kategorie = content.kategorien.all()[0].id;

    q('.close').addEventListener('click', () => this.close());
    this.tabsEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.kategorie) return;
      b.blur();
      this.kategorie = b.dataset.kategorie;
      this.render();
    });
    this.listEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.produkt) return;
      b.blur();
      const id = b.dataset.produkt;
      const n = Math.max(0, (this.cart.get(id) ?? 0) + Number(b.dataset.delta));
      if (n) this.cart.set(id, n); else this.cart.delete(id);
      this.errorEl.textContent = '';
      this.render();
    });
    this.orderBtn.addEventListener('click', () => { this.orderBtn.blur(); this.order(); });

    // Anzeige aktuell halten, ohne jeden Frame nachzufragen
    player.events.on('changed', () => this.isOpen && this.render());
    world.events.on('added', () => this.isOpen && this.renderSummary());
    world.events.on('removed', () => this.isOpen && this.renderSummary());
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    this.errorEl.textContent = '';
    this.render();
  }

  close(): void {
    this.el.hidden = true;
  }

  private order(): void {
    const lines = [...this.cart].map(([produkt, kartons]) => ({ produkt, kartons }));
    const result = this.purchasing.order(lines);
    if (!result.ok) {
      this.errorEl.textContent = this.errorText(result.fehler);
      return;
    }
    this.cart.clear();
    this.errorEl.textContent = '';
    this.toasts.show(this.content.text('einkauf_geliefert', { kartons: result.kartons }), 'gut');
    this.render();
  }

  private errorText(f: OrderError): string {
    const c = this.content;
    switch (f.grund) {
      case 'leer': return c.text('einkauf_fehler_leer');
      case 'gesperrt': return c.text('einkauf_fehler_gesperrt', { produkt: f.produkt.name, level: f.level });
      case 'platz': return c.text('einkauf_fehler_platz', { frei: f.frei, noetig: f.noetig });
      case 'geld': return c.text('einkauf_fehler_geld');
    }
  }

  private render(): void {
    // Tabs: eine pro Warenkategorie; Punkt zeigt, wo schon etwas im Warenkorb liegt
    this.tabsEl.innerHTML = this.content.kategorien.all().map((k) => {
      const inCart = this.content.produkte.all().some((p) => p.kategorie === k.id && this.cart.has(p.id));
      const active = k.id === this.kategorie;
      return `<button type="button" role="tab" aria-selected="${active}" class="${active ? 'active' : ''}" data-kategorie="${k.id}">${esc(k.name)}${inCart ? ' •' : ''}</button>`;
    }).join('');

    const rows = this.content.produkte.all()
      .filter((p) => p.kategorie === this.kategorie)
      .map((p) => this.row(p))
      .join('');
    this.listEl.innerHTML = rows;
    this.renderSummary();
  }

  private row(p: ProductDef): string {
    const unlocked = this.purchasing.isUnlocked(p);
    const n = this.cart.get(p.id) ?? 0;
    const icon = iconUrl(p.icon);
    const control = unlocked
      ? `<div class="stepper">
           <button type="button" data-produkt="${p.id}" data-delta="-1" ${n ? '' : 'disabled'} aria-label="weniger">−</button>
           <span>${n}</span>
           <button type="button" data-produkt="${p.id}" data-delta="1" aria-label="mehr">+</button>
         </div>`
      : `<span class="badge">${esc(this.content.text('einkauf_gesperrt', { level: p.freischaltLevel }))}</span>`;
    return `
      <div class="item ${unlocked ? '' : 'locked'} ${n ? 'chosen' : ''}">
        ${icon ? `<img src="${icon}" alt="" loading="lazy" width="44" height="44">` : '<span class="noicon"></span>'}
        <div class="item-text"><b>${esc(p.name)}</b>
          <small>EK ${formatMoney(p.ek)} · VK ${formatMoney(p.vk)} · ${p.gebinde} Stück/Karton${p.preisOffen ? ' · Preis vorläufig' : ''}</small></div>
        <div class="price">${formatMoney(this.purchasing.cartonPrice(p))}<small>pro Karton</small></div>
        ${control}
      </div>`;
  }

  private renderSummary(): void {
    const lines = [...this.cart].map(([produkt, kartons]) => ({ produkt, kartons }));
    const { kosten, kartons } = this.purchasing.quote(lines);
    const frei = this.purchasing.freeSlots();
    const t = (k: string) => esc(this.content.text(k));
    this.summaryEl.innerHTML = `
      <span>${t('einkauf_summe')} <b class="${kosten > this.player.geld ? 'bad' : ''}">${formatMoney(kosten)}</b></span>
      <span>${kartons} Kartons</span>
      <span>${t('einkauf_platz')} <b class="${kartons > frei ? 'bad' : ''}">${frei}</b></span>`;
    this.orderBtn.disabled = kartons === 0;
  }
}
