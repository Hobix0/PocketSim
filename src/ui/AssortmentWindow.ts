import type { Content } from '../content/Content';
import type { ProductDef } from '../content/definitions';
import type { World } from '../ecs/World';
import type { PriceBook } from '../economy/Prices';
import type { StoreStats } from '../economy/StoreStats';
import { buyChance } from '../economy/Prices';
import { ShelfComponent } from '../components/ShelfComponent';
import { CartonComponent } from '../components/CartonComponent';
import { iconUrl } from '../assets/icons';
import { esc } from './html';
import { formatMoney } from './format';

// Sortiment und Preise: was im Laden ist, was es kostet, was du verlangst – und wie Kunden darauf reagieren.
// Kaufchance = wie wahrscheinlich ein Kunde zugreift (aus dem Preisempfinden in data/kunden).

type Filter = 'laden' | 'alle';

export class AssortmentWindow {
  private readonly el: HTMLElement;
  private readonly listEl: HTMLElement;
  private filter: Filter = 'laden';

  constructor(
    parent: HTMLElement,
    private readonly content: Content,
    private readonly prices: PriceBook,
    private readonly stats: StoreStats,
    private readonly world: World,
    private readonly level: () => number,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'window assortment panel';
    this.el.hidden = true;
    this.el.innerHTML = `
      <header><h2>Sortiment und Preise</h2><button type="button" class="close" aria-label="Schließen">✕</button></header>
      <p class="lead">Bis etwa 10 % über dem empfohlenen Preis kauft jeder; darüber greifen immer weniger Kunden zu (und der Ruf leidet).
        Wer günstig ist, wird weiterempfohlen.</p>
      <div class="toolbar">
        <nav class="tabs"><button type="button" data-filter="laden">Im Laden</button><button type="button" data-filter="alle">Alle freigeschalteten</button></nav>
        <span class="spacer"></span>
        <button type="button" data-bulk="-5">Alle −5 %</button><button type="button" data-bulk="5">Alle +5 %</button><button type="button" data-bulk="0">Empfohlene Preise</button>
      </div>
      <div class="list prices"></div>`;
    parent.append(this.el);
    this.listEl = this.el.querySelector('.prices')!;

    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      if (b.classList.contains('close')) this.close();
      else if (b.dataset.filter) { this.filter = b.dataset.filter as Filter; this.render(); }
      else if (b.dataset.step) {
        const p = content.produkte.get(b.dataset.produkt!);
        this.prices.set(p, this.prices.get(p) + Number(b.dataset.step));
      } else if (b.dataset.bulk !== undefined) {
        const f = Number(b.dataset.bulk);
        for (const p of this.products()) f === 0 ? this.prices.reset(p) : this.prices.set(p, this.prices.get(p) * (1 + f / 100));
      } else if (b.dataset.reset) this.prices.reset(content.produkte.get(b.dataset.reset));
    });
    this.el.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (!input.dataset.preis) return;
      const v = Number(input.value.replace(',', '.'));
      if (Number.isFinite(v)) this.prices.set(content.produkte.get(input.dataset.preis), v);
      else this.render();
    });
    prices.events.on('changed', () => this.isOpen && this.render());
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

  /** Bestand je Produkt: im Regal und im Lager (Kartons) */
  private stock(): Map<string, { regal: number; lager: number; produkt: ProductDef }> {
    const map = new Map<string, { regal: number; lager: number; produkt: ProductDef }>();
    const get = (p: ProductDef) => { let m = map.get(p.id); if (!m) { m = { regal: 0, lager: 0, produkt: p }; map.set(p.id, m); } return m; };
    for (const [, s] of this.world.query(ShelfComponent)) for (const f of s.faecher) if (f.produkt && f.menge) get(f.produkt).regal += f.menge;
    for (const [, c] of this.world.query(CartonComponent)) if (!c.produkt.rohstoff) get(c.produkt).lager += c.menge;
    return map;
  }

  private products(): ProductDef[] {
    if (this.filter === 'laden') return [...this.stock().values()].map((s) => s.produkt);
    return this.content.produkte.all().filter((p) => p.freischaltLevel <= this.level());
  }

  private render(): void {
    this.el.querySelectorAll<HTMLElement>('[data-filter]').forEach((b) => b.classList.toggle('active', b.dataset.filter === this.filter));
    const stock = this.stock();
    const gestern = this.stats.verlauf[this.stats.verlauf.length - 1];
    const count = (list: { produkt: ProductDef; anzahl: number }[] | undefined, p: ProductDef) => list?.find((c) => c.produkt.id === p.id)?.anzahl ?? 0;
    const products = this.products().sort((a, b) => a.kategorie.localeCompare(b.kategorie) || a.name.localeCompare(b.name, 'de'));
    const s = this.content.kunden.preis;
    this.listEl.innerHTML = products.length ? `
      <div class="price-head"><span></span><span>Produkt</span><span>EK</span><span>Empfohlen</span><span>Dein Preis</span><span>Marge</span><span>Kaufchance</span><span>Bestand</span><span>Gestern</span></div>
      ${products.map((p) => {
        const preis = this.prices.get(p);
        const marge = preis > 0 ? Math.round(((preis - p.ek) / preis) * 100) : 0;
        const chance = Math.round(buyChance(s, this.prices.ratio(p)) * 100);
        const st = stock.get(p.id);
        const icon = iconUrl(p.icon);
        const own = this.prices.isOwn(p);
        return `<div class="price-row ${own ? 'own' : ''}">
          ${icon ? `<img src="${icon}" alt="">` : '<span class="noicon"></span>'}
          <span class="name"><b>${esc(p.name)}</b><small>${esc(this.content.kategorien.find(p.kategorie)?.name ?? p.kategorie)}</small></span>
          <span class="num">${formatMoney(p.ek)}</span>
          <span class="num">${formatMoney(p.vk)}</span>
          <span class="edit">
            <button type="button" data-step="-0.05" data-produkt="${p.id}" aria-label="5 Cent billiger">−</button>
            <input type="text" inputmode="decimal" data-preis="${p.id}" value="${preis.toFixed(2).replace('.', ',')}" aria-label="Preis ${esc(p.name)}">
            <button type="button" data-step="0.05" data-produkt="${p.id}" aria-label="5 Cent teurer">+</button>
            ${own ? `<button type="button" class="reset" data-reset="${p.id}" title="Empfohlenen Preis nehmen">↺</button>` : ''}
          </span>
          <span class="num ${marge < 0 ? 'minus' : ''}">${marge} %</span>
          <span class="chance"><span class="bar"><span style="width:${chance}%"></span></span>${chance} %</span>
          <span class="num">${st ? `${st.regal} · ${st.lager}` : '–'}</span>
          <span class="num">${count(gestern?.verkauft, p)} verkauft${count(gestern?.zuTeuer, p) ? ` · ${count(gestern?.zuTeuer, p)}× zu teuer` : ''}</span>
        </div>`;
      }).join('')}
      <p class="hint">Bestand: im Regal · im Lager (Stück)</p>`
      : '<p class="empty">Noch keine Ware im Laden – kauf am Einkaufsterminal ein.</p>';
  }
}
