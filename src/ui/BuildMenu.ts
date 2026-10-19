import type { Content } from '../content/Content';
import { inBuildCategory, type BuildDef } from '../content/definitions';
import type { Plots } from '../world/Plots';
import type { InputMap } from '../input/InputMap';
import type { PlayerState } from '../state/PlayerState';
import type { BuildController, Tool } from '../building/BuildController';
import { iconUrl } from '../assets/icons';
import { esc } from './html';
import { formatMoney } from './format';

// Baumenü: Werkzeuge (Abreißen, Verschieben), Kategorien als Tabs, Katalog mit Icon und Preis.
// Der Katalog kommt automatisch aus data/bau – angezeigt werden die Kategorien aus data/baumenue.

export class BuildMenu {
  private readonly el: HTMLElement;
  private readonly tabsEl: HTMLElement;
  private readonly gridEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private kategorie: string;
  private plotMessage = '';

  constructor(
    parent: HTMLElement,
    private readonly content: Content,
    private readonly build: BuildController,
    private readonly player: PlayerState,
    private readonly input: InputMap,
    private readonly plots?: Plots,
  ) {
    const t = (k: string) => esc(content.text(k));
    this.el = document.createElement('div');
    this.el.className = 'buildmenu panel';
    this.el.hidden = true;
    this.el.innerHTML = `
      <header><h3>${t('bauen_titel')}</h3>
        <span class="tools">
          <button type="button" data-tool="abreissen">${t('bauen_abreissen')}</button>
          <button type="button" data-tool="verschieben">${t('bauen_verschieben')}</button>
        </span>
      </header>
      <nav class="tabs"></nav>
      <div class="catalog"></div>
      <div class="build-hint"></div>`;
    parent.append(this.el);
    this.tabsEl = this.el.querySelector('.tabs')!;
    this.gridEl = this.el.querySelector('.catalog')!;
    this.hintEl = this.el.querySelector('.build-hint')!;
    this.kategorie = content.baumenue.kategorien[0].id;

    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      if (b.dataset.kategorie) { this.kategorie = b.dataset.kategorie; this.render(); }
      else if (b.dataset.editor) { location.hash = 'editor'; location.reload(); }
      else if (b.dataset.plot && this.plots) {
        const r = this.plots.buy(b.dataset.plot);
        this.plotMessage = r.ok ? '' : r.grund === 'geld' ? 'Dafür reicht das Geld nicht.' : r.grund === 'gesperrt' ? 'Noch nicht freigeschaltet.' : '';
        this.render();
      }
      else if (b.dataset.tool === 'abreissen') this.toggle({ art: 'abreissen' });
      else if (b.dataset.tool === 'verschieben') this.toggle({ art: 'verschieben' });
      else if (b.dataset.bau) {
        const def = content.bau.get(b.dataset.bau);
        if (build.tool?.art === 'bauen' && build.tool.def === def && !build.tool.moving) build.cancel();
        else build.startBuilding(def);
      }
    });
    build.events.on('toolChanged', () => this.isOpen && this.render());
    player.events.on('changed', () => this.isOpen && this.render());
    input.onChange(() => this.isOpen && this.render());
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
    this.build.cancel();
  }

  toggleOpen(): void {
    if (this.isOpen) this.close(); else this.open();
  }

  /** Jeden Frame: Hinweis aktualisieren (ändert sich mit der Zeigerposition). */
  update(): void {
    if (!this.isOpen) return;
    const html = this.hint();
    if (this.hintEl.innerHTML !== html) this.hintEl.innerHTML = html;
  }

  private toggle(tool: Tool): void {
    if (this.build.tool?.art === tool.art) this.build.cancel();
    else if (tool.art === 'abreissen') this.build.startDemolish();
    else this.build.startMove();
  }

  private render(): void {
    const tool = this.build.tool;
    this.el.querySelectorAll<HTMLElement>('.tools button').forEach((b) => {
      b.classList.toggle('active', tool?.art === b.dataset.tool || (tool?.art === 'bauen' && !!tool.moving && b.dataset.tool === 'verschieben'));
    });
    this.tabsEl.innerHTML = this.content.baumenue.kategorien.map((k) =>
      `<button type="button" data-kategorie="${k.id}" class="${k.id === this.kategorie ? 'active' : ''}" aria-selected="${k.id === this.kategorie}">${esc(k.name)}</button>`,
    ).join('');
    const cat = this.content.baumenue.kategorien.find((k) => k.id === this.kategorie)!;
    if (cat.spezial === 'grundstuecke') { this.gridEl.innerHTML = this.plotCards(); this.hintEl.innerHTML = this.hint(); return; }
    const defs = this.content.bau.all().filter((d) => inBuildCategory(d, cat)).sort((a, b) => a.freischaltLevel - b.freischaltLevel || a.preis - b.preis);
    this.gridEl.innerHTML = defs.map((d) => this.card(d, tool)).join('')
      || `<p class="empty-cat">${esc(this.content.text('eigene_leer'))} <button type="button" data-editor="1">${esc(this.content.text('editor_oeffnen'))}</button></p>`;
    this.hintEl.innerHTML = this.hint();
  }

  private plotCards(): string {
    if (!this.plots?.active) return '<p class="empty-cat">Auf diesem Gelände gibt es keine Grundstücke.</p>';
    const cards = this.plots.list.map((p) => {
      const own = this.plots!.isOwned(p.id);
      const locked = p.freischaltLevel > this.player.level;
      const w = p.rect.maxX - p.rect.minX, d = p.rect.maxZ - p.rect.minZ;
      return `<div class="card plot ${own ? 'own' : ''} ${locked ? 'locked' : ''}">
        <span class="name">${esc(p.name)}</span><small>${w} × ${d} m</small>
        ${own ? '<span class="cost">gehört dir</span>'
          : locked ? `<span class="cost">ab Level ${p.freischaltLevel}</span>`
            : `<button type="button" class="primary" data-plot="${esc(p.id)}">Kaufen · ${formatMoney(p.preis)}</button>`}
      </div>`;
    }).join('');
    return cards + (this.plotMessage ? `<p class="empty-cat">${esc(this.plotMessage)}</p>` : '')
      + '<p class="empty-cat">Gebaut werden kann nur auf eigenen Grundstücken (grüne Linien, beim Bauen sichtbar).</p>';
  }

  private card(d: BuildDef, tool: Tool | null): string {
    const locked = d.freischaltLevel > this.player.level;
    const active = tool?.art === 'bauen' && tool.def === d && !tool.moving;
    const icon = iconUrl(d.icon);
    return `
      <button type="button" class="card ${active ? 'active' : ''} ${locked ? 'locked' : ''}" data-bau="${d.id}" ${locked ? 'disabled' : ''} title="${esc(d.name)}">
        ${icon ? `<img src="${icon}" alt="" loading="lazy">` : '<span class="noicon"></span>'}
        <span class="name">${esc(d.name)}</span>
        <span class="cost">${locked ? esc(this.content.text('bauen_fehler_gesperrt', { level: d.freischaltLevel })) : formatMoney(d.preis)}</span>
      </button>`;
  }

  private hint(): string {
    const tool = this.build.tool;
    const k = (a: string) => `<span class="key">${esc(this.input.keyLabel(a))}</span>`;
    const t = (key: string) => esc(this.content.text(key));
    if (!tool) return '';
    if (tool.art === 'bauen') {
      const problem = this.build.problem ? `<span class="problem">${esc(this.content.text(`bauen_fehler_${this.build.problem}`, { level: tool.def.freischaltLevel }))}</span>` : '';
      return `<b>${esc(tool.def.name)}</b> ${problem}<br>${k('auswaehlen')}${t('bauen_platzieren')} ${k('objekt_drehen')}${t('bauen_drehen')} ${k('pause')}${t('bauen_abbrechen')}`;
    }
    return `${k('auswaehlen')}${t(tool.art === 'abreissen' ? 'bauen_werkzeug_abreissen' : 'bauen_werkzeug_verschieben')} ${k('pause')}${t('bauen_abbrechen')}`;
  }
}
