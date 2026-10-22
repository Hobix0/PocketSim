import type { Content } from '../content/Content';
import type { ProductDef } from '../content/definitions';
import type { Purchasing, OrderError, ShippingKind } from '../economy/Purchasing';
import type { PlayerState } from '../state/PlayerState';
import type { World } from '../ecs/World';
import type { Toasts } from './Toasts';
import { iconUrl } from '../assets/icons';
import { esc } from './html';
import { formatClock, formatMoney } from './format';

/** Für die Anzeige der Lieferung: wann sie käme und wie spät es ist */
export interface ShippingInfo {
  arrival(art: ShippingKind): number;
  now(): number;
}

// Großhandel-Fenster: Produkte nach Warenkategorie (Tabs), einzelne Kartons oder ganze Paletten wählen, bestellen.
// Paletten sind günstiger je Karton, brauchen aber einen Palettenplatz (Bodenstellplatz oder Palettenregal).
// Die Produktliste kommt automatisch aus data/produkte.

export class PurchaseWindow {
  private readonly el: HTMLElement;
  private readonly tabsEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly summaryEl: HTMLElement;
  private readonly errorEl: HTMLElement;
  private readonly orderBtn: HTMLButtonElement;
  /** Produkt-id → gewählte Kartons und Paletten */
  private readonly cart = new Map<string, { kartons: number; paletten: number }>();
  private kategorie: string;
  private versand: ShippingKind = 'normal';
  private readonly shippingEl: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly content: Content,
    private readonly ladenEinkauf: Purchasing,
    private readonly player: PlayerState,
    world: World,
    private readonly toasts: Toasts,
    private readonly shipping?: ShippingInfo,
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
        <div class="ziel" role="radiogroup" aria-label="Ziel"></div>
        <div class="shipping" role="radiogroup" aria-label="${t('einkauf_versand')}"></div>
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
    this.shippingEl = q('.shipping');
    this.shippingEl.hidden = !ladenEinkauf.shipping;
    this.el.querySelector('.ziel')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.ziel) return;
      b.blur();
      this.ziel = b.dataset.ziel as 'laden' | 'zentral';
      this.render();
    });
    this.shippingEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b?.dataset.versand) return;
      b.blur();
      this.versand = b.dataset.versand as ShippingKind;
      this.renderSummary();
    });
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
      const c = { ...(this.cart.get(id) ?? { kartons: 0, paletten: 0 }) };
      const key = b.dataset.art === 'palette' ? 'paletten' : 'kartons';
      c[key] = Math.max(0, c[key] + Number(b.dataset.delta));
      if (c.kartons || c.paletten) this.cart.set(id, c); else this.cart.delete(id);
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

  private lines(): { produkt: string; kartons: number; paletten: number }[] {
    return [...this.cart].map(([produkt, c]) => ({ produkt, ...c }));
  }

  /** Einkauf ins Zentrallager (setzt das Spiel): eigener Einkauf mit dem Zentrallager als Ziel */
  zentral?: { purchasing: Purchasing; active: () => boolean; arrival: (art: ShippingKind) => number };
  private ziel: 'laden' | 'zentral' = 'laden';

  /** Einkauf zum gewählten Ziel */
  private purchasing(): Purchasing {
    return this.ziel === 'zentral' && this.zentral?.active() ? this.zentral.purchasing : this.ladenEinkauf;
  }

  private order(): void {
    const lines = this.lines();
    const result = this.purchasing().order(lines, this.versand);
    if (!result.ok) {
      this.errorEl.textContent = this.errorText(result.fehler);
      return;
    }
    this.cart.clear();
    this.errorEl.textContent = '';
    if (result.ankunft !== undefined && this.shipping) {
      this.toasts.show(this.content.text('einkauf_bestellt', { kartons: this.wasText(lines), zeit: formatClock(result.ankunft, this.shipping.now()) }), 'gut');
    } else this.toasts.show(this.content.text('einkauf_geliefert', { kartons: this.wasText(lines) }), 'gut');
    this.render();
  }

  private errorText(f: OrderError): string {
    const c = this.content;
    switch (f.grund) {
      case 'leer': return c.text('einkauf_fehler_leer');
      case 'gesperrt': return c.text('einkauf_fehler_gesperrt', { produkt: f.produkt.name, sperre: f.sperre });
      case 'platz': return c.text('einkauf_fehler_platz', { frei: f.frei, noetig: f.noetig });
      case 'palettenplatz': return c.text('einkauf_fehler_palettenplatz', { frei: f.frei, noetig: f.noetig });
      case 'geld': return c.text('einkauf_fehler_geld');
    }
  }

  private render(): void {
    // Tabs: eine pro Warenkategorie; Punkt zeigt, wo schon etwas im Warenkorb liegt
    this.tabsEl.innerHTML = this.content.kategorien.all().map((k) => {
      const inCart = this.content.waren.all().some((p) => p.kategorie === k.id && this.cart.has(p.id));
      const active = k.id === this.kategorie;
      return `<button type="button" role="tab" aria-selected="${active}" class="${active ? 'active' : ''}" data-kategorie="${k.id}">${esc(k.name)}${inCart ? ' •' : ''}</button>`;
    }).join('');

    const rows = this.content.waren.all()
      .filter((p) => p.kategorie === this.kategorie)
      .map((p) => this.row(p))
      .join('');
    this.listEl.innerHTML = rows;
    this.renderSummary();
  }

  private row(p: ProductDef): string {
    const unlocked = this.purchasing().isUnlocked(p);
    const c = this.cart.get(p.id) ?? { kartons: 0, paletten: 0 };
    const icon = iconUrl(p.icon);
    const stepper = (art: 'karton' | 'palette', n: number) => `<div class="stepper">
           <button type="button" data-produkt="${p.id}" data-art="${art}" data-delta="-1" ${n ? '' : 'disabled'} aria-label="weniger">−</button>
           <span>${n}</span>
           <button type="button" data-produkt="${p.id}" data-art="${art}" data-delta="1" aria-label="mehr">+</button>
         </div>`;
    const pal = this.purchasing().pallets && this.purchasing().palette;
    const control = !unlocked ? `<span class="badge">${esc(this.purchasing().unlocks.sperre(p) ?? '')}</span>`
      : `<div class="buy-options">
          <div class="buy"><div class="price">${formatMoney(this.purchasing().cartonPrice(p))}<small>Karton</small></div>${stepper('karton', c.kartons)}</div>
          ${pal ? `<div class="buy pallet"><div class="price">${formatMoney(this.purchasing().palletPrice(p))}<small>Palette · ${pal.kartons} Kartons · −${Math.round(pal.rabatt * 100)} %</small></div>${stepper('palette', c.paletten)}</div>` : ''}
        </div>`;
    return `
      <div class="item ${unlocked ? '' : 'locked'} ${c.kartons || c.paletten ? 'chosen' : ''}">
        ${icon ? `<img src="${icon}" alt="" loading="lazy" width="44" height="44">` : '<span class="noicon"></span>'}
        <div class="item-text"><b>${esc(p.name)}</b>
          <small>EK ${formatMoney(p.ek)} · VK ${formatMoney(p.vk)} · ${p.gebinde} Stück/Karton${p.preisOffen ? ' · Preis vorläufig' : ''}</small></div>
        ${control}
      </div>`;
  }

  /** „3 Kartons und 2 Paletten“ */
  private wasText(lines: { kartons: number; paletten: number }[]): string {
    const k = lines.reduce((n, l) => n + l.kartons, 0), p = lines.reduce((n, l) => n + l.paletten, 0);
    const parts = [k ? `${k} Karton${k === 1 ? '' : 's'}` : '', p ? `${p} Palette${p === 1 ? '' : 'n'}` : ''].filter(Boolean);
    return parts.join(' und ');
  }

  private renderSummary(): void {
    const lines = this.lines();
    const { kosten, kartons, paletten, versand } = this.purchasing().quote(lines, this.versand);
    const frei = this.purchasing().freeSlots();
    const palFrei = this.purchasing().freePalletSlots();
    const t = (k: string, v?: Record<string, string | number>) => esc(this.content.text(k, v));
    if (this.shipping) {
      const option = (art: ShippingKind) => {
        const fee = this.purchasing().quote(lines, art).versand;
        const zeit = formatClock(this.purchasing() === this.ladenEinkauf ? this.shipping!.arrival(art) : this.zentral!.arrival(art), this.shipping!.now());
        return `<button type="button" role="radio" data-versand="${art}" aria-checked="${this.versand === art}" class="${this.versand === art ? 'active' : ''}">
          <b>${t(`einkauf_versand_${art}`)}</b><small>${t('einkauf_ankunft', { zeit })}${kartons || paletten ? ` · ${formatMoney(fee)}` : ''}</small></button>`;
      };
      this.shippingEl.innerHTML = option('normal') + option('express');
    }
    const zielEl = this.el.querySelector('.ziel') as HTMLElement;
    const zOk = !!this.zentral?.active();
    zielEl.hidden = !zOk;
    if (zOk) {
      const z = this.purchasing() === this.ladenEinkauf ? 'laden' : 'zentral';
      zielEl.innerHTML = (['laden', 'zentral'] as const).map((id) => `<button type="button" role="radio" data-ziel="${id}" aria-checked="${z === id}" class="${z === id ? 'active' : ''}">
        <b>${id === 'laden' ? '🏪 In den Laden' : '🏭 Ins Zentrallager'}</b><small>${id === 'laden' ? 'Ladenlager' : 'Rohstoffe und Vorrat'}</small></button>`).join('');
    }
    this.summaryEl.innerHTML = `
      ${versand ? `<span>${t('einkauf_lieferkosten')} <b>${formatMoney(versand)}</b></span>` : ''}
      <span>${t('einkauf_summe')} <b class="${kosten > this.player.geld ? 'bad' : ''}">${formatMoney(kosten)}</b></span>
      <span>${kartons} Kartons${paletten ? ` · ${paletten} Paletten` : ''}</span>
      <span>${t('einkauf_platz')} <b class="${kartons > frei ? 'bad' : ''}">${frei}</b></span>
      ${this.purchasing().pallets ? `<span>${t('einkauf_palettenplatz')} <b class="${paletten > palFrei ? 'bad' : ''}">${palFrei}</b></span>` : ''}`;
    this.orderBtn.disabled = kartons === 0 && paletten === 0;
  }
}
