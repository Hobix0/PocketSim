import type { Content } from '../content/Content';
import type { DayReport } from '../economy/StoreStats';
import { esc } from './html';
import { formatMoney } from './format';

// Tagesbericht: erscheint um Mitternacht. Kunden, Umsatz, Ausgaben, Ergebnis, Ruf
// und welche Produkte am meisten vermisst wurden (= was man als Nächstes einkaufen sollte).

export class ReportWindow {
  private readonly el: HTMLElement;
  private onClose: (() => void) | null = null;

  constructor(parent: HTMLElement, private readonly content: Content) {
    this.el = document.createElement('div');
    this.el.className = 'window report panel';
    this.el.hidden = true;
    parent.append(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) { b.blur(); this.close(); }
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(r: DayReport, onClose?: () => void): void {
    const t = (k: string, v?: Record<string, string | number>) => esc(this.content.text(k, v));
    const kosten = (g: string) => r.kosten[g] ?? 0;
    const sonstige = Object.entries(r.kosten).filter(([g]) => !['einkauf', 'lieferung', 'lohn', 'bau', 'strom', 'wasser'].includes(g)).reduce((s, [, v]) => s + v, 0);
    const ergebnis = r.umsatz - Object.values(r.kosten).reduce((s, v) => s + v, 0);
    const ruf = r.rufNachher - r.rufVorher;
    const row = (label: string, value: string, cls = '') => `<div class="row ${cls}"><span>${label}</span><b>${value}</b></div>`;
    this.el.innerHTML = `
      <header><h2>${t('bericht_titel', { tag: r.tag })}</h2></header>
      <div class="report-grid">
        <section>
          ${row(t('bericht_kunden'), String(r.kunden))}
          ${row(t('bericht_zufrieden'), String(r.zufrieden))}
          ${row(t('bericht_ohne_einkauf'), String(r.ohneEinkauf), r.ohneEinkauf ? 'minus' : '')}
          ${row(t('bericht_ruf'), `${Math.round(r.rufNachher)} (${ruf >= 0 ? '+' : ''}${ruf.toFixed(1)})`, ruf < 0 ? 'minus' : 'plus')}
        </section>
        <section>
          ${row(t('bericht_umsatz'), formatMoney(r.umsatz), 'plus')}
          ${row(t('bericht_einkauf'), `−${formatMoney(kosten('einkauf'))}`)}
          ${kosten('lieferung') ? row(t('bericht_lieferung'), `−${formatMoney(kosten('lieferung'))}`) : ''}
          ${row(t('bericht_loehne'), `−${formatMoney(kosten('lohn'))}`)}
          ${row(t('bericht_versorgung'), `−${formatMoney(kosten('strom') + kosten('wasser'))}`)}
          ${row(t('bericht_bau'), `−${formatMoney(kosten('bau') + sonstige)}`)}
          ${row(t('bericht_ergebnis'), formatMoney(ergebnis), ergebnis < 0 ? 'minus total' : 'plus total')}
        </section>
      </div>
      ${r.wetter ? `<p class="report-weather">${t('bericht_wetter', { heute: r.wetter.heute, morgen: r.wetter.morgen })}</p>` : ''}
      ${r.tafel?.stueck ? `<p class="report-tafel">${t('bericht_tafel', { stueck: r.tafel.stueck, wert: formatMoney(r.tafel.wert) })}</p>` : ''}
      <h4>${t('bericht_fehlt')}</h4>
      <p class="missing">${r.fehlt.length ? r.fehlt.map((f) => `${esc(f.produkt.name)} <small>${f.anzahl}×</small>`).join(' · ') : t('bericht_nichts_fehlt')}</p>
      ${r.zuTeuer.length ? `<h4>Zu teuer (im Sortiment ändern)</h4><p class="missing">${r.zuTeuer.map((f) => `${esc(f.produkt.name)} <small>${f.anzahl}×</small>`).join(' · ')}</p>` : ''}
      <div class="actions"><button type="button" class="primary">${t('bericht_weiter')}</button></div>`;
    this.el.hidden = false;
    this.onClose = onClose ?? null;
  }

  close(): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }
}
