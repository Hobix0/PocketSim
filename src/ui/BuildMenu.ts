import type { Content } from '../content/Content';
import { inBuildCategory, type BuildDef } from '../content/definitions';
import type { Plots } from '../world/Plots';
import type { InputMap } from '../input/InputMap';
import type { PlayerState } from '../state/PlayerState';
import type { BuildController, Tool } from '../building/BuildController';
import { iconUrl } from '../assets/icons';
import type { TerrainMode, TerrainTool } from '../building/TerrainTool';
import type { PaintMode, PaintTool } from '../building/PaintTool';
import { stampPreview } from '../world/PaintLayer';
import { cachedThumbnail, hasThumbnail, requestThumbnail } from '../assets/thumbnail';
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
    /** Gelände-Werkzeug (Reiter „Gelände“) */
    private readonly terrain?: TerrainTool,
    /** Mal-Werkzeug (Reiter „Markierungen“) */
    private readonly paint?: PaintTool,
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
      else if (b.dataset.plot && this.plots) {
        const r = this.plots.buy(b.dataset.plot);
        this.plotMessage = r.ok ? '' : r.grund === 'geld' ? 'Dafür reicht das Geld nicht.' : r.grund === 'gesperrt' ? 'Noch nicht freigeschaltet.' : '';
        this.render();
      }
      else if (b.dataset.gelaende && this.terrain) {
        const mode = b.dataset.gelaende as TerrainMode;
        if (this.terrain.mode === mode) this.terrain.cancel();
        else { build.cancel(); this.paint?.cancel(); this.terrain.start(mode); }
      }
      else if (this.paint && (b.dataset.malen || b.dataset.farbe || b.dataset.breite || b.dataset.stempel || b.dataset.skala)) {
        const p = this.paint;
        if (!p.active) { build.cancel(); this.terrain?.cancel(); }
        if (b.dataset.malen) { const m = b.dataset.malen as PaintMode; if (p.mode === m) p.cancel(); else p.start(m); }
        else if (b.dataset.farbe) { p.setFarbe(b.dataset.farbe); if (!p.active || p.mode === 'radierer') p.start(p.mode === 'stempel' ? 'stempel' : 'pinsel'); }
        else if (b.dataset.breite) { p.setBreite(Number(b.dataset.breite)); if (!p.active) p.start('pinsel'); }
        else if (b.dataset.skala) { p.setSkala(Number(b.dataset.skala)); if (!p.active) p.start('stempel'); }
        else if (b.dataset.stempel) p.setStempel(content.markierungen.stempel.find((st) => st.id === b.dataset.stempel)!);
      } else if (b.dataset.pinsel && this.terrain) this.terrain.setRadius(Number(b.dataset.pinsel));
      else if (b.dataset.tool === 'abreissen') this.toggle({ art: 'abreissen' });
      else if (b.dataset.tool === 'verschieben') this.toggle({ art: 'verschieben' });
      else if (b.dataset.bau) {
        const def = content.bau.get(b.dataset.bau);
        this.terrain?.cancel();
        this.paint?.cancel();
        if (build.tool?.art === 'bauen' && build.tool.def === def && !build.tool.moving) build.cancel();
        else build.startBuilding(def);
      }
    });
    build.events.on('toolChanged', () => this.isOpen && this.render());
    terrain?.events.on('changed', () => this.isOpen && this.render());
    paint?.events.on('changed', () => this.isOpen && this.render());
    // Eigene Farbe aus dem Farbwähler
    this.el.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.eigenfarbe === undefined || !this.paint) return;
      if (!this.paint.active) { build.cancel(); this.terrain?.cancel(); this.paint.start('pinsel'); }
      this.paint.setFarbe(el.value);
    });
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
    this.terrain?.cancel();
    this.paint?.cancel();
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
    if (cat.spezial === 'gelaende') { this.gridEl.innerHTML = this.terrainCards(); this.hintEl.innerHTML = this.hint(); return; }
    if (cat.spezial === 'markierungen') { this.gridEl.innerHTML = this.paintCards(); this.hintEl.innerHTML = this.hint(); return; }
    const defs = this.content.bau.all().filter((d) => inBuildCategory(d, cat)).sort((a, b) => a.freischaltLevel - b.freischaltLevel || a.preis - b.preis);
    this.gridEl.innerHTML = defs.map((d) => this.card(d, tool)).join('') || '<p class="empty-cat">Hier gibt es noch nichts.</p>';
    this.hintEl.innerHTML = this.hint();
    for (const img of this.gridEl.querySelectorAll<HTMLImageElement>('img[data-thumb]:not([src])')) {
      const path = img.dataset.thumb!;
      requestThumbnail(path, (url) => {
        for (const el of this.gridEl.querySelectorAll<HTMLImageElement>('img[data-thumb]')) if (el.dataset.thumb === path) el.src = url;
      });
    }
  }

  private terrainCards(): string {
    const t = this.terrain;
    if (!t) return '<p class="empty-cat">Hier lässt sich das Gelände nicht verändern.</p>';
    const g = this.content.gelaende;
    const tools: [TerrainMode, string, string][] = [['heben', 'Anheben', '▲'], ['senken', 'Absenken', '▼'], ['ebnen', 'Ebnen', '▬']];
    const cards = tools.map(([m, name, icon]) => `<button type="button" class="card terrain ${t.mode === m ? 'active' : ''}" data-gelaende="${m}">
        <span class="terrain-icon">${icon}</span><span class="name">${name}</span><span class="cost">${formatMoney(g.preisProKubikmeter)} je m³</span></button>`).join('');
    const sizes = g.pinsel.map((r) => `<button type="button" class="${t.radius === r ? 'active' : ''}" data-pinsel="${r}">${r.toLocaleString('de-DE')} m</button>`).join('');
    return cards + `<div class="terrain-sizes"><span>Pinsel</span>${sizes}</div>
      <p class="empty-cat">Linke Maustaste gedrückt halten. Nur auf eigenem Grund und wo nichts gebaut ist. Gebaut werden kann danach nur auf ebenem Boden; LKW fahren nicht über Hügel.</p>`;
  }

  private paintCards(): string {
    const p = this.paint;
    if (!p) return '<p class="empty-cat">Hier lässt sich nichts aufmalen.</p>';
    const m = this.content.markierungen;
    const tools: [PaintMode, string, string, string][] = [
      ['pinsel', 'Pinsel', '✎', `${formatMoney(m.preisProQuadratmeter)} je m²`],
      ['linie', 'Linie', '╱', `${formatMoney(m.preisProQuadratmeter)} je m²`],
      ['radierer', 'Radierer', '⌫', 'kostenlos'],
    ];
    const toolCards = tools.map(([id, name, icon, cost]) => `<button type="button" class="card terrain ${p.mode === id ? 'active' : ''}" data-malen="${id}">
        <span class="terrain-icon">${icon}</span><span class="name">${name}</span><span class="cost">${cost}</span></button>`).join('');
    const eigen = !m.farben.some((f) => f.farbe === p.farbe);
    const farben = m.farben.map((f) => `<button type="button" class="swatch ${p.farbe === f.farbe ? 'active' : ''}" data-farbe="${f.farbe}" title="${esc(f.name)}" style="background:${f.farbe}"></button>`).join('')
      + `<label class="swatch custom ${eigen ? 'active' : ''}" title="Eigene Farbe"><input type="color" data-eigenfarbe value="${eigen ? p.farbe : '#7aa6c2'}"></label>`;
    const breiten = m.breiten.map((b) => `<button type="button" class="${p.breite === b ? 'active' : ''}" data-breite="${b}">${Math.round(b * 100)} cm</button>`).join('');
    const groessen = m.stempelGroessen.map((g) => `<button type="button" class="${p.skala === g ? 'active' : ''}" data-skala="${g}">${Math.round(g * 100)} %</button>`).join('');
    const stempel = m.stempel.map((st) => `<button type="button" class="card stamp ${p.mode === 'stempel' && p.stempel === st ? 'active' : ''}" data-stempel="${st.id}" title="${esc(st.name)}">
        <img src="${stampPreview(st, p.farbe === '#f4f1e8' ? '#e9e4d4' : p.farbe)}" alt=""><span class="name">${esc(st.name)}</span><span class="cost">${formatMoney(st.preis)}</span></button>`).join('');
    return toolCards
      + `<div class="terrain-sizes paint-colors"><span>Farbe</span>${farben}</div>`
      + `<div class="terrain-sizes"><span>Breite</span>${breiten}</div>`
      + `<div class="terrain-sizes"><span>Stempel</span>${groessen}</div>`
      + stempel
      + '<p class="empty-cat">Malen geht auf eigenem, ebenem Grund – auf Böden, Asphalt und Rasen. Stempel mit der Dreh-Taste in 45°-Schritten drehen.</p>';
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
    // Ohne Icon: Vorschaubild aus dem Würfelmodell (wird nachgeladen)
    const thumb = !icon && hasThumbnail(d.model) ? d.model : null;
    const img = icon ? `<img src="${icon}" alt="" loading="lazy">`
      : thumb ? `<img data-thumb="${esc(thumb)}" alt="" ${cachedThumbnail(thumb) ? `src="${cachedThumbnail(thumb)}"` : ''}>`
        : '<span class="noicon"></span>';
    return `
      <button type="button" class="card ${active ? 'active' : ''} ${locked ? 'locked' : ''}" data-bau="${d.id}" ${locked ? 'disabled' : ''} title="${esc(d.name)}">
        ${img}
        <span class="name">${esc(d.name)}</span>
        <span class="cost">${locked ? esc(this.content.text('bauen_fehler_gesperrt', { level: d.freischaltLevel })) : formatMoney(d.preis)}</span>
      </button>`;
  }

  private hint(): string {
    const tool = this.build.tool;
    const k = (a: string) => `<span class="key">${esc(this.input.keyLabel(a))}</span>`;
    const t = (key: string) => esc(this.content.text(key));
    if (this.paint?.mode) {
      const was = this.paint.mode === 'stempel' ? esc(this.paint.stempel.name) : t(`markierung_${this.paint.mode}`);
      const dreh = this.paint.mode === 'stempel' ? ` ${k('objekt_drehen')}${t('bauen_drehen')} (${this.paint.drehung}°)` : '';
      return `<b>${was}</b><br>${k('auswaehlen')}${t(`markierung_hilfe_${this.paint.mode}`)}${dreh} ${k('pause')}${t('bauen_abbrechen')}`;
    }
    if (this.terrain?.mode) return `<b>${esc(this.content.text(`gelaende_${this.terrain.mode}`))}</b><br>${k('auswaehlen')}${t('gelaende_halten')} ${k('pause')}${t('bauen_abbrechen')}`;
    if (!tool) return '';
    if (tool.art === 'bauen') {
      const problem = this.build.problem ? `<span class="problem">${esc(this.content.text(`bauen_fehler_${this.build.problem}`, { level: tool.def.freischaltLevel }))}</span>` : '';
      const flaeche = tool.def.ebene === 'boden' && !tool.def.absenkung && !tool.moving ? ` · ${t('bauen_flaeche_ziehen')}` : '';
      return `<b>${esc(tool.def.name)}</b> ${problem}<br>${k('auswaehlen')}${t('bauen_platzieren')}${flaeche} ${k('objekt_drehen')}${t('bauen_drehen')} ${k('pause')}${t('bauen_abbrechen')}`;
    }
    return `${k('auswaehlen')}${t(tool.art === 'abreissen' ? 'bauen_werkzeug_abreissen' : 'bauen_werkzeug_verschieben')} ${k('pause')}${t('bauen_abbrechen')}`;
  }
}
