import type { Plots, PlotDef } from '../world/Plots';
import type { Renovations } from '../world/Renovations';
import type { Locations } from '../world/Locations';
import { esc } from './html';
import { formatMoney } from './format';

// Immobilienmarkt (Taste I): Ladenlokale in klein, mittel und groß – verfallen oder bezugsfertig – zum
// Kaufen oder Mieten, dazu leere Grundstücke zum Selbstbauen. Was dir gehört, steht oben.
// Die Angebote stehen im Level (data/level → grundstuecke → "angebot").

const GROESSE: Record<string, string> = { klein: 'Klein', mittel: 'Mittel', gross: 'Groß', grundstueck: 'Grundstück' };
const ICON: Record<string, string> = { klein: '🏠', mittel: '🏬', gross: '🏛️', grundstueck: '🌱' };

export class RealEstateWindow {
  private readonly el: HTMLElement;
  private message = '';
  private filter = 'alle';

  constructor(
    parent: HTMLElement,
    private readonly plots: Plots,
    private readonly renovations: Pick<Renovations, 'needs' | 'cost' | 'progress' | 'start'>,
    private readonly level: () => number,
    /** Kamera zum Grundstück fahren */
    showPlot: (p: PlotDef) => void,
    /** Steht innen nichts mehr von dir? (dann darf gekündigt werden) */
    isEmpty: (p: PlotDef) => boolean,
    /** Lage: Laufkundschaft je Angebot */
    private readonly locations?: Locations,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'window realestate panel';
    this.el.hidden = true;
    parent.append(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      const id = b.dataset.id ?? '';
      const p = plots.list.find((x) => x.id === id);
      if (b.classList.contains('close')) this.close();
      else if (b.dataset.filter) { this.filter = b.dataset.filter; this.render(); }
      else if (b.dataset.act === 'kaufen') this.result(plots.buy(id), 'Gekauft – gehört jetzt dir.');
      else if (b.dataset.act === 'mieten') this.result(plots.rent(id), 'Gemietet. Die Miete wird jeden Morgen abgebucht.');
      else if (b.dataset.act === 'kuendigen') this.result(plots.cancel(id, isEmpty), 'Gekündigt.');
      else if (b.dataset.act === 'renovieren') this.result(renovations.start(id), 'Die Handwerker legen los.');
      else if (b.dataset.act === 'zeigen' && p) { this.close(); showPlot(p); }
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

  /** Neu zeichnen, solange offen (z. B. Fortschritt der Renovierung) */
  refresh(): void {
    if (this.isOpen) this.render();
  }

  private result(r: { ok: boolean; grund?: string }, ok: string): void {
    const fehler: Record<string, string> = {
      geld: 'Dafür reicht das Geld nicht.', gesperrt: 'Noch nicht freigeschaltet.', nicht_leer: 'Erst ausräumen: Innen steht noch etwas von dir.',
      laeuft: 'Wird schon renoviert.', keine_miete: 'Nur zum Kaufen.',
    };
    this.message = r.ok ? ok : fehler[r.grund ?? ''] ?? '';
    this.render();
  }

  private card(p: PlotDef): string {
    const a = p.angebot!;
    const w = p.rect.maxX - p.rect.minX, d = p.rect.maxZ - p.rect.minZ;
    const own = this.plots.isOwned(p.id), rented = this.plots.isRented(p.id);
    const locked = !own && p.freischaltLevel > this.level();
    const fort = this.renovations.progress(p.id);
    const alt = this.renovations.needs(p.id);
    const zustand = a.groesse === 'grundstueck' ? 'leer – selbst bauen' : fort !== null ? `wird renoviert … ${Math.round(fort * 100)} %` : alt ? 'Altbau, renovierungsbedürftig' : 'bezugsfertig';
    const knoepfe: string[] = [];
    if (!own && !locked) {
      knoepfe.push(`<button type="button" class="primary" data-act="kaufen" data-id="${esc(p.id)}">Kaufen · ${formatMoney(p.preis)}</button>`);
      if (a.miete) knoepfe.push(`<button type="button" data-act="mieten" data-id="${esc(p.id)}">Mieten · ${formatMoney(a.miete)}/Tag</button>`);
    }
    if (rented) {
      knoepfe.push(`<button type="button" class="primary" data-act="kaufen" data-id="${esc(p.id)}">Doch kaufen · ${formatMoney(p.preis)}</button>`);
      knoepfe.push(`<button type="button" data-act="kuendigen" data-id="${esc(p.id)}">Kündigen</button>`);
    }
    if (own && alt && fort === null) knoepfe.push(`<button type="button" class="primary" data-act="renovieren" data-id="${esc(p.id)}">Renovieren · ${formatMoney(this.renovations.cost(p.id))}</button>`);
    knoepfe.push(`<button type="button" data-act="zeigen" data-id="${esc(p.id)}">📍 Ansehen</button>`);
    return `<div class="estate ${own ? 'own' : ''} ${locked ? 'locked' : ''}">
      <div class="estate-head"><span class="icon">${ICON[a.groesse] ?? '🏠'}</span><div><b>${esc(p.name)}</b>
        <small>${esc(GROESSE[a.groesse] ?? '')} · ${w} × ${d} m (${w * d} m²) · ${esc(a.lage)}${a.parkplatz ? ' · 🅿️ mit Parkplatz' : ''}</small></div>
        <span class="tag">${own ? (rented ? 'gemietet' : 'gehört dir') : locked ? `ab Level ${p.freischaltLevel}` : 'zu haben'}</span></div>
      ${this.lage(p)}
      <small>${esc(zustand)}${a.miete ? ` · Miete ${formatMoney(a.miete)}/Tag` : ''} · Kauf ${formatMoney(p.preis)}</small>
      <div class="estate-actions">${knoepfe.join('')}</div>
    </div>`;
  }

  /** Laufkundschaft als Sterne und die Lage in Worten */
  private lage(p: PlotDef): string {
    const l = this.locations;
    if (!l) return '';
    const v = l.potential(p);
    const sterne = Math.max(1, Math.min(5, Math.round(v / 0.18)));
    const laeuft = l.active(p) ? ` · <b>läuft: +${Math.round(v * 100)} % Kundschaft</b>` : '';
    return `<small>Laufkundschaft ${'★'.repeat(sterne)}${'☆'.repeat(5 - sterne)} · ${esc(l.text(p))}${laeuft}</small>`;
  }

  private render(): void {
    const all = this.plots.list.filter((p) => p.angebot);
    const shown = all.filter((p) => this.filter === 'alle' || (this.filter === 'meine' ? this.plots.isOwned(p.id) : p.angebot!.groesse === this.filter));
    // Eigene zuerst, dann nach Größe
    const rang = (p: PlotDef) => (this.plots.isOwned(p.id) ? 0 : 10) + ['klein', 'mittel', 'gross', 'grundstueck'].indexOf(p.angebot!.groesse);
    shown.sort((a, b) => rang(a) - rang(b));
    const filters = [['alle', 'Alle'], ['meine', 'Meine'], ['klein', 'Klein'], ['mittel', 'Mittel'], ['gross', 'Groß'], ['grundstueck', 'Grundstücke']]
      .map(([id, name]) => `<button type="button" data-filter="${id}" class="${this.filter === id ? 'active' : ''}">${name}</button>`).join('');
    const miete = this.plots.mieteProTag;
    const plus = this.locations ? Math.round((this.locations.factor() - 1) * 100) : 0;
    this.el.innerHTML = `
      <header><h2>Immobilien</h2><button type="button" class="close" aria-label="Schließen">✕</button></header>
      <p class="lead">Ladenlokale in der Stadt kaufen oder mieten – oder ein Grundstück, auf dem du alles selbst baust.${miete ? ` Deine Miete: <b>${formatMoney(miete)}/Tag</b>.` : ''}${plus ? ` Deine weiteren Läden bringen <b>+${plus} %</b> Kundschaft.` : ''}</p>
      <div class="filters">${filters}</div>
      ${this.message ? `<p class="msg">${esc(this.message)}</p>` : ''}
      <div class="estate-list">${shown.map((p) => this.card(p)).join('') || '<p class="empty-cat">Nichts gefunden.</p>'}</div>`;
  }
}
