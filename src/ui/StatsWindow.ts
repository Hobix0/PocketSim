import type { StoreStats, DayReport } from '../economy/StoreStats';
import { esc } from './html';
import { formatMoney } from './format';

// Bilanz: die letzten Tage auf einen Blick.
//  - Kennzahlen der letzten 7 Tage (Umsatz, Ergebnis, Kunden, Ruf)
//  - Umsatz und Ausgaben je Tag als Säulen (beides €, eine Achse)
//  - Ruf je Tag als eigene Linie (0–100) – bewusst ein zweites Diagramm statt einer zweiten Achse
// Überfahren zeigt die Werte des Tages; „Als Tabelle“ zeigt alles in Zahlen.

const COLORS = { umsatz: '#3987e5', ausgaben: '#d95926', ruf: '#c98500' };
const DAYS = 14;

interface Day {
  label: string;
  umsatz: number;
  ausgaben: number;
  ergebnis: number;
  kunden: number;
  zufrieden: number;
  ruf: number;
  heute: boolean;
}

export class StatsWindow {
  private readonly el: HTMLElement;
  private table = false;
  private tip: HTMLElement | null = null;

  constructor(parent: HTMLElement, private readonly stats: StoreStats) {
    this.el = document.createElement('div');
    this.el.className = 'window stats panel';
    this.el.hidden = true;
    parent.append(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      if (b.classList.contains('close')) this.close();
      else if (b.dataset.view) { this.table = b.dataset.view === 'tabelle'; this.render(); }
    });
    this.el.addEventListener('pointermove', (e) => this.hover(e));
    this.el.addEventListener('pointerleave', () => this.hideTip());
    stats.events.on('report', () => this.isOpen && this.render());
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

  private days(): Day[] {
    const toDay = (r: Readonly<DayReport>, heute: boolean): Day => {
      const ausgaben = Object.values(r.kosten).reduce((s, v) => s + v, 0);
      return {
        label: heute ? 'heute' : `Tag ${r.tag}`, umsatz: r.umsatz, ausgaben, ergebnis: r.umsatz - ausgaben,
        kunden: r.kunden, zufrieden: r.zufrieden, ruf: heute ? this.stats.ruf : r.rufNachher, heute,
      };
    };
    return [...this.stats.verlauf.slice(-(DAYS - 1)).map((r) => toDay(r, false)), toDay(this.stats.heute, true)];
  }

  private render(): void {
    const days = this.days();
    const last7 = days.filter((d) => !d.heute).slice(-7);
    const sum = (k: keyof Day) => last7.reduce((s, d) => s + (d[k] as number), 0);
    const kunden = sum('kunden');
    const tile = (label: string, value: string, sub = '') => `<div class="tile"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const ergebnis = sum('ergebnis');
    this.el.innerHTML = `
      <header><h2>Bilanz</h2>
        <span class="views"><button type="button" data-view="diagramm" class="${this.table ? '' : 'active'}">Diagramm</button><button type="button" data-view="tabelle" class="${this.table ? 'active' : ''}">Als Tabelle</button></span>
        <button type="button" class="close" aria-label="Schließen">✕</button></header>
      <div class="tiles">
        ${tile('Umsatz', formatMoney(sum('umsatz')), last7.length ? `letzte ${last7.length} Tage` : 'noch kein Tag abgeschlossen')}
        ${tile('Ergebnis', `${ergebnis < 0 ? '−' : ''}${formatMoney(Math.abs(ergebnis))}`, 'Umsatz minus Ausgaben')}
        ${tile('Kunden', String(kunden), kunden ? `${Math.round((sum('zufrieden') / kunden) * 100)} % zufrieden` : '')}
        ${tile('Ruf', String(Math.round(this.stats.ruf)), 'von 100')}
      </div>
      ${this.table ? this.tableView(days) : this.charts(days)}`;
    this.tip = null;
  }

  private charts(days: Day[]): string {
    return `
      <section class="chart">
        <h4>Umsatz und Ausgaben je Tag</h4>
        <div class="legend"><span><i style="background:${COLORS.umsatz}"></i>Umsatz</span><span><i style="background:${COLORS.ausgaben}"></i>Ausgaben</span></div>
        ${this.barChart(days)}
      </section>
      <section class="chart">
        <h4>Ruf (0–100)</h4>
        ${this.lineChart(days)}
      </section>`;
  }

  private barChart(days: Day[]): string {
    const W = 680, H = 190, padL = 52, padB = 22, padT = 8;
    const max = niceMax(Math.max(10, ...days.map((d) => Math.max(d.umsatz, d.ausgaben))));
    const band = (W - padL) / days.length;
    const bw = Math.min(18, (band - 10) / 2);
    const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
    const ticks = [0, max / 2, max];
    const grid = ticks.map((t) => `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 8}" y="${y(t) + 4}" class="tick" text-anchor="end">${compactEuro(t)}</text>`).join('');
    const bars = days.map((d, i) => {
      const cx = padL + band * i + band / 2;
      const col = (v: number, x: number, color: string) => v > 0 ? `<path d="${roundedBar(x, y(v), bw, y(0) - y(v))}" fill="${color}"/>` : '';
      return `<g>${col(d.umsatz, cx - bw - 1, COLORS.umsatz)}${col(d.ausgaben, cx + 1, COLORS.ausgaben)}
        <text x="${cx}" y="${H - 6}" class="tick" text-anchor="middle">${esc(d.heute ? 'heute' : d.label.replace('Tag ', 'T'))}</text>
        <rect x="${padL + band * i}" y="0" width="${band}" height="${H - padB}" class="hit" data-day="${i}"/></g>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Umsatz und Ausgaben der letzten ${days.length} Tage">${grid}${bars}</svg>`;
  }

  private lineChart(days: Day[]): string {
    const W = 680, H = 120, padL = 52, padB = 22, padT = 10;
    const band = (W - padL) / days.length;
    const x = (i: number) => padL + band * i + band / 2;
    const y = (v: number) => padT + (H - padT - padB) * (1 - v / 100);
    const grid = [0, 50, 100].map((t) => `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 8}" y="${y(t) + 4}" class="tick" text-anchor="end">${t}</text>`).join('');
    const pts = days.map((d, i) => `${x(i)},${y(d.ruf)}`).join(' ');
    const lastI = days.length - 1;
    const hits = days.map((_, i) => `<rect x="${padL + band * i}" y="0" width="${band}" height="${H - padB}" class="hit" data-day="${i}"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ruf der letzten ${days.length} Tage">${grid}
      <polyline points="${pts}" fill="none" stroke="${COLORS.ruf}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(lastI)}" cy="${y(days[lastI].ruf)}" r="4.5" fill="${COLORS.ruf}" class="end"/>
      <text x="${x(lastI) - 8}" y="${days[lastI].ruf > 80 ? y(days[lastI].ruf) + 16 : y(days[lastI].ruf) - 8}" class="value" text-anchor="end">${Math.round(days[lastI].ruf)}</text>
      ${hits}</svg>`;
  }

  private tableView(days: Day[]): string {
    const money = (v: number) => `${v < 0 ? '−' : ''}${formatMoney(Math.abs(v))}`;
    return `<table class="stats-table"><thead><tr><th>Tag</th><th>Umsatz</th><th>Ausgaben</th><th>Ergebnis</th><th>Kunden</th><th>zufrieden</th><th>Ruf</th></tr></thead>
      <tbody>${[...days].reverse().map((d) => `<tr><td>${esc(d.label)}</td><td>${money(d.umsatz)}</td><td>${money(d.ausgaben)}</td><td class="${d.ergebnis < 0 ? 'minus' : ''}">${money(d.ergebnis)}</td><td>${d.kunden}</td><td>${d.zufrieden}</td><td>${Math.round(d.ruf)}</td></tr>`).join('')}</tbody></table>`;
  }

  private hover(e: PointerEvent): void {
    const hit = (e.target as Element).closest?.('.hit') as SVGElement | null;
    if (!hit) { this.hideTip(); return; }
    const d = this.days()[Number(hit.dataset.day)];
    if (!d) return;
    if (!this.tip) {
      this.tip = document.createElement('div');
      this.tip.className = 'chart-tip';
      this.el.append(this.tip);
    }
    const money = (v: number) => `${v < 0 ? '−' : ''}${formatMoney(Math.abs(v))}`;
    this.tip.innerHTML = `<b>${esc(d.label)}</b>
      <span><i style="background:${COLORS.umsatz}"></i>Umsatz ${money(d.umsatz)}</span>
      <span><i style="background:${COLORS.ausgaben}"></i>Ausgaben ${money(d.ausgaben)}</span>
      <span>Ergebnis ${money(d.ergebnis)}</span>
      <span><i style="background:${COLORS.ruf}"></i>Ruf ${Math.round(d.ruf)} · ${d.kunden} Kunden</span>`;
    const box = this.el.getBoundingClientRect();
    const r = hit.getBoundingClientRect();
    this.tip.hidden = false;
    const left = Math.min(box.width - 200, Math.max(8, r.left - box.left + r.width / 2 - 90));
    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${Math.max(8, e.clientY - box.top - 120)}px`;
    this.el.querySelectorAll('.hit.on').forEach((n) => n.classList.remove('on'));
    this.el.querySelectorAll(`.hit[data-day="${hit.dataset.day}"]`).forEach((n) => n.classList.add('on'));
  }

  private hideTip(): void {
    if (this.tip) this.tip.hidden = true;
    this.el.querySelectorAll('.hit.on').forEach((n) => n.classList.remove('on'));
  }
}

/** Säule mit 4 px abgerundetem Kopf, unten gerade */
function roundedBar(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function niceMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function compactEuro(v: number): string {
  return v >= 1000 ? `${(v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} T€` : `${Math.round(v)} €`;
}
