import type { Content } from '../content/Content';
import type { World } from '../ecs/World';
import type { Deliveries } from '../economy/Deliveries';
import type { TruckFleet } from '../world/TruckFleet';
import type { CartonStorage } from '../world/CartonStorage';
import { CartonComponent } from '../components/CartonComponent';
import { esc } from './html';
import { formatClock } from './format';

// Lager und Lieferungen: Belegung der Lagerplätze, LKW am Laden, was unterwegs ist,
// und der Bestand im Lager nach Ware. Wird nur neu gezeichnet, wenn sich etwas ändert.

export class LogisticsWindow {
  private readonly el: HTMLElement;
  private lastKey = '';

  constructor(
    parent: HTMLElement,
    private readonly content: Content,
    private readonly world: World,
    private readonly storage: CartonStorage,
    private readonly deliveries: Deliveries | null,
    private readonly fleet: TruckFleet | null,
    private readonly now: () => number,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'window logistics panel';
    this.el.hidden = true;
    parent.append(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.classList.contains('close')) { b.blur(); this.close(); }
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    this.lastKey = '';
    this.update();
  }

  close(): void {
    this.el.hidden = true;
  }

  toggleOpen(): void {
    if (this.isOpen) this.close(); else this.open();
  }

  update(): void {
    if (!this.isOpen) return;
    const trucks = this.fleet?.list ?? [];
    const key = [
      this.storage.freeSlots(), this.storage.capacity(), this.deliveries?.pendingCartons() ?? 0,
      trucks.map((t) => `${t.state}${t.kartons}${Math.ceil(t.wartet)}`).join(), [...this.world.query(CartonComponent)].length,
    ].join('|');
    if (key !== this.lastKey) { this.lastKey = key; this.render(); }
  }

  private render(): void {
    const t = (k: string, v?: Record<string, string | number>) => esc(this.content.text(k, v));
    const cap = this.storage.capacity();
    const used = cap - this.storage.freeSlots();
    const geplant = (this.deliveries?.pendingCartons() ?? 0) + (this.fleet?.onTrucks() ?? 0);
    const share = (n: number) => (cap ? Math.min(100, Math.round((n / cap) * 100)) : 0);

    const trucks = (this.fleet?.list ?? []).map((tr) => {
      const wo = tr.dock ? t('lager_an_rampe') : t('lager_auf_strasse');
      const status = tr.state === 'steht' ? t('lager_lkw_steht', { min: Math.max(0, Math.ceil(tr.wartet)) }) : t(tr.state === 'anfahrt' ? 'lkw_kommt' : 'lkw_faehrt');
      return `<div class="row"><span><b>${t('lkw_name')}</b> · ${wo}<small>${status}</small></span><b>${tr.kartons} Kartons</b></div>`;
    }).join('');
    const now = this.now();
    const unterwegs = (this.deliveries?.unterwegs ?? []).map((s) => `
      <div class="row"><span>${esc(formatClock(s.ankunft, now))}${s.art === 'express' ? ` <span class="badge">${t('lager_express')}</span>` : ''}
        <small>${esc(this.summary(s.kartons.map((k) => k.produkt)))}</small></span><b>${s.kartons.length} Kartons</b></div>`).join('');

    // Bestand: Kartons auf festen Ablagen und lose Kartons, nach Ware
    const bestand = new Map<string, { name: string; kartons: number; stueck: number; rohstoff: boolean }>();
    for (const [, c] of this.world.query(CartonComponent)) {
      if (c.ablage?.temporaer) continue;
      const b = bestand.get(c.produkt.id) ?? { name: c.produkt.name, kartons: 0, stueck: 0, rohstoff: !!c.produkt.rohstoff };
      b.kartons++;
      b.stueck += c.menge;
      bestand.set(c.produkt.id, b);
    }
    const rows = [...bestand.values()].sort((a, b) => b.kartons - a.kartons || a.name.localeCompare(b.name, 'de')).map((b) => `
      <div class="row"><span>${esc(b.name)}${b.rohstoff ? ` <small>${t('lager_rohstoff')}</small>` : ''}</span><b>${b.kartons} · ${b.stueck} Stück</b></div>`).join('');

    this.el.innerHTML = `
      <header><h2>${t('lager_titel')}</h2><button type="button" class="close" aria-label="${t('schliessen')}">✕</button></header>
      <p class="lead">${t(this.deliveries ? 'lager_hinweis' : 'lager_hinweis_sofort')}</p>
      <div class="logistics-grid">
        <section>
          <h4>${t('lager_plaetze')}</h4>
          <div class="row"><span>${t('lager_belegt')}</span><b>${used} / ${cap}</b></div>
          <span class="meter stack"><span style="width:${share(used)}%"></span><span class="planned" style="width:${share(Math.min(geplant, cap - used))}%"></span></span>
          <small>${t('lager_eingeplant', { n: geplant })}</small>
          <h4>${t('lager_lieferungen')}</h4>
          ${trucks || unterwegs ? trucks + unterwegs : `<p class="empty">${t('lager_keine_lieferung')}</p>`}
        </section>
        <section>
          <h4>${t('lager_bestand')}</h4>
          <div class="stock-list">${rows || `<p class="empty">${t('lager_leer')}</p>`}</div>
        </section>
      </div>
      <p class="tip">${t('lager_tipp')}</p>`;
  }

  /** "Cola 0,5 L ×4, Wasser ×2 …" */
  private summary(ids: string[]): string {
    const n = new Map<string, number>();
    for (const id of ids) n.set(id, (n.get(id) ?? 0) + 1);
    const parts = [...n].map(([id, k]) => `${this.content.waren.find(id)?.name ?? id} ×${k}`);
    return parts.length > 3 ? `${parts.slice(0, 3).join(', ')} …` : parts.join(', ');
  }
}
