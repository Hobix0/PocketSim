import type { CentralWarehouse, ShopDelivery } from '../economy/CentralWarehouse';
import type { ShippingKind } from '../economy/Purchasing';
import { esc } from './html';
import { formatMoney } from './format';

// Zentrallager (Taste Z): Was liegt im Zentrallager, wie voll ist es, was ist unterwegs –
// und Ware in den Laden bringen lassen (LKW wie eine Lieferung). Rohstoffe stehen getrennt.

export class WarehouseWindow {
  private readonly el: HTMLElement;
  private message = '';
  private suche = '';
  private versand: ShippingKind = 'normal';

  constructor(parent: HTMLElement, private readonly lager: CentralWarehouse, laden: ShopDelivery) {
    this.el = document.createElement('div');
    this.el.className = 'window warehouse panel';
    this.el.hidden = true;
    parent.append(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      if (b.classList.contains('close')) this.close();
      else if (b.dataset.versand) { this.versand = b.dataset.versand as ShippingKind; this.render(); }
      else if (b.dataset.send) {
        const item = lager.list().find((x) => x.produkt.id === b.dataset.send);
        if (!item) return;
        const n = Math.min(item.kartons, Number(b.dataset.n) || 1);
        const r = lager.send(item.produkt, n, laden, this.versand);
        const fehler: Record<string, string> = { kein_lager: 'Du hast noch kein Zentrallager.', bestand: 'So viel ist nicht da.', platz: 'Im Laden ist nicht genug Lagerplatz.', geld: 'Dafür reicht das Geld nicht.' };
        this.message = r.ok ? `${n} Karton${n === 1 ? '' : 's'} ${item.produkt.name} kommen in den Laden (${formatMoney(r.kosten)}).` : fehler[r.grund];
        this.render();
      }
    });
    this.el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.classList.contains('suche')) { this.suche = t.value.toLowerCase(); this.renderList(); }
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

  refresh(): void {
    if (this.isOpen) this.renderList();
  }

  private render(): void {
    const l = this.lager;
    if (!l.active()) {
      this.el.innerHTML = `
        <header><h2>Zentrallager</h2><button type="button" class="close" aria-label="Schließen">✕</button></header>
        <p class="lead">Du hast noch kein Zentrallager. Im <b>Industriegebiet</b> (Immobilien, Taste I) kannst du eines kaufen oder mieten.
        Dorthin lässt du Ware und Rohstoffe vom Großhandel liefern, deine Produktionshallen holen sich hier ihre Rohstoffe und liefern fertige Kartons zurück –
        und von hier lässt du in den Laden bringen, was gebraucht wird.</p>`;
      return;
    }
    const share = Math.min(1, l.belegt / l.settings.kapazitaet);
    const opt = (art: ShippingKind, name: string) => `<button type="button" data-versand="${art}" class="${this.versand === art ? 'active' : ''}">${name}</button>`;
    this.el.innerHTML = `
      <header><h2>Zentrallager</h2><button type="button" class="close" aria-label="Schließen">✕</button></header>
      <p class="lead">Belegt <b>${l.belegt} / ${l.settings.kapazitaet}</b> Kartons${l.unterwegs ? ` · unterwegs vom Großhandel: <b>${l.unterwegs}</b>` : ''}.
        In den Laden bringen: ${formatMoney(l.settings.abholung.grund)} je Fahrt + ${formatMoney(l.settings.abholung.proKarton)} je Karton.</p>
      <span class="meter"><span class="${share > 0.9 ? 'high' : ''}" style="width:${Math.round(share * 100)}%"></span></span>
      <div class="row-tools"><input class="suche" type="search" placeholder="Suchen …" value="${esc(this.suche)}">
        <span class="versand">${opt('normal', 'Zum nächsten Liefertermin')}${opt('express', 'Express')}</span></div>
      ${this.message ? `<p class="msg">${esc(this.message)}</p>` : ''}
      <div class="stock"></div>`;
    this.renderList();
  }

  private renderList(): void {
    const el = this.el.querySelector('.stock');
    if (!el) return;
    const items = this.lager.list().filter((x) => !this.suche || x.produkt.name.toLowerCase().includes(this.suche));
    const ware = items.filter((x) => !x.produkt.rohstoff), roh = items.filter((x) => x.produkt.rohstoff);
    const row = (x: (typeof items)[number]) => {
      const btn = (n: number) => `<button type="button" data-send="${esc(x.produkt.id)}" data-n="${n}" ${x.kartons >= n ? '' : 'disabled'}>${n === 99 ? 'alle' : `${n}`}</button>`;
      return `<div class="stock-row"><span class="name">${esc(x.produkt.name)}</span><span class="n">${x.kartons} Kartons</span>
        ${x.produkt.rohstoff ? `<small>${x.menge} Einheiten</small>` : `<span class="send">in den Laden: ${btn(1)}${btn(5)}${btn(99)}</span>`}</div>`;
    };
    el.innerHTML = `
      <h4>Ware</h4>${ware.map(row).join('') || '<p class="empty-cat">Noch keine Ware hier. Kaufe beim Großhandel mit Ziel „Zentrallager“ ein oder produziere selbst.</p>'}
      <h4>Rohstoffe</h4>${roh.map(row).join('') || '<p class="empty-cat">Keine Rohstoffe. Die Grundstoffe für deine Produktionslinien gibt es beim Großhandel unter „Rohstoffe“.</p>'}`;
  }
}
