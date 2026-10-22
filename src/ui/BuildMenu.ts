import type { Content } from '../content/Content';
import { buildGroupOf, type BuildDef } from '../content/definitions';
import type { Plots } from '../world/Plots';
import type { Renovations } from '../world/Renovations';
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

// Baumenü für viele Bauteile:
//   - Bereiche als Leiste links (Gebäude, Laden, Café, Lager …), darin Gruppen als Chips
//   - Varianten einer Familie (z. B. Wandregal in Weiß/Holz/Schwarz/Salbei) sind eine Karte mit Farbtupfern
//   - Suche über alles, „Zuletzt benutzt“, Gesperrtes gedimmt am Ende
// Der Katalog kommt aus data/bau ("gruppe", "variante"), Bereiche und Gruppen aus data/baumenue ("bereiche").

const ZULETZT_KEY = 'urbanevolution.zuletztGebaut';
const ZULETZT_MAX = 12;

export class BuildMenu {
  private readonly el: HTMLElement;
  private readonly tabsEl: HTMLElement;
  private readonly gridEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly railEl: HTMLElement;
  private readonly searchEl: HTMLInputElement;
  private bereich: string;
  private gruppe: string;
  private suche = '';
  private plotMessage = '';
  /** Altbauten renovieren (setzt das Spiel) */
  renovations?: Pick<Renovations, 'needs' | 'cost' | 'progress' | 'start' | 'minutes'>;
  /** Zuletzt gewählte Variante je Familie */
  private readonly wahl = new Map<string, string>();
  private zuletzt: string[] = [];

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
        <input type="search" class="build-search" placeholder="Suchen …" aria-label="Bauteile suchen">
        <span class="tools">
          <button type="button" data-tool="abreissen">${t('bauen_abreissen')}</button>
          <button type="button" data-tool="verschieben">${t('bauen_verschieben')}</button>
        </span>
      </header>
      <div class="build-body">
        <nav class="build-rail"></nav>
        <div class="build-main">
          <nav class="tabs chips"></nav>
          <div class="catalog"></div>
        </div>
      </div>
      <div class="build-hint"></div>`;
    parent.append(this.el);
    this.railEl = this.el.querySelector('.build-rail')!;
    this.tabsEl = this.el.querySelector('.tabs')!;
    this.gridEl = this.el.querySelector('.catalog')!;
    this.hintEl = this.el.querySelector('.build-hint')!;
    this.searchEl = this.el.querySelector('.build-search')!;
    const b0 = content.baumenue.bereiche[0];
    this.bereich = b0.id;
    this.gruppe = b0.gruppen[0].id;
    try { this.zuletzt = JSON.parse(localStorage.getItem(ZULETZT_KEY) ?? '[]').filter((id: unknown) => typeof id === 'string' && content.bau.has(id)); } catch { this.zuletzt = []; }
    // Suche: Tasten gehören dem Eingabefeld, nicht dem Spiel
    this.searchEl.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { this.searchEl.value = ''; this.suche = ''; this.searchEl.blur(); this.renderCatalog(); } });
    this.searchEl.addEventListener('keyup', (e) => e.stopPropagation());
    this.searchEl.addEventListener('input', () => { this.suche = this.searchEl.value.trim().toLowerCase(); this.render(); });
    build.events.on('toolChanged', () => {
      const tl = build.tool;
      if (tl?.art === 'bauen' && !tl.moving) this.remember(tl.def.id);
    });

    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      if (b.dataset.bereich) {
        this.bereich = b.dataset.bereich;
        this.gruppe = this.content.baumenue.bereiche.find((x) => x.id === this.bereich)?.gruppen[0]?.id ?? '';
        this.clearSearch(); this.render();
      }
      else if (b.dataset.gruppe) { this.gruppe = b.dataset.gruppe; this.clearSearch(); this.render(); }
      else if (b.dataset.variante) {
        const def = content.bau.get(b.dataset.variante);
        if (def.variante) this.wahl.set(def.variante.familie, def.id);
        this.terrain?.cancel(); this.paint?.cancel();
        if (this.isUnlocked(def)) build.startBuilding(def); else this.render();
      }
      else if (b.dataset.renovieren && this.renovations) {
        const r = this.renovations.start(b.dataset.renovieren);
        this.plotMessage = r.ok ? '' : r.grund === 'geld' ? 'Für die Renovierung reicht das Geld nicht.' : '';
        this.render();
      }
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
    const s = this.content.baumenue;
    const bereiche = [...(this.zuletzt.length ? [{ id: 'zuletzt', name: 'Zuletzt', icon: '🕘', gruppen: [] }] : []), ...s.bereiche];
    this.railEl.innerHTML = bereiche.map((b) => `<button type="button" data-bereich="${b.id}" class="${!this.suche && b.id === this.bereich ? 'active' : ''}" title="${esc(b.name)}">
        <span class="icon">${b.icon}</span><span class="label">${esc(b.name)}</span></button>`).join('');
    const area = s.bereiche.find((b) => b.id === this.bereich);
    this.tabsEl.hidden = !!this.suche || this.bereich === 'zuletzt' || !area || area.gruppen.length < 2;
    this.tabsEl.innerHTML = (area?.gruppen ?? []).map((g) =>
      `<button type="button" data-gruppe="${g.id}" class="${g.id === this.gruppe ? 'active' : ''}" aria-selected="${g.id === this.gruppe}">${esc(g.name)} <small>${this.count(`${area!.id}/${g.id}`)}</small></button>`,
    ).join('');
    this.renderCatalog();
  }

  /** Nur den Katalog neu zeichnen (z. B. beim Tippen in der Suche) */
  private renderCatalog(): void {
    const tool = this.build.tool;
    const area = this.content.baumenue.bereiche.find((b) => b.id === this.bereich);
    const group = area?.gruppen.find((g) => g.id === this.gruppe);
    if (!this.suche && this.bereich !== 'zuletzt' && group?.spezial) {
      this.gridEl.innerHTML = group.spezial === 'grundstuecke' ? this.plotCards() : group.spezial === 'gelaende' ? this.terrainCards() : this.paintCards();
      this.hintEl.innerHTML = this.hint();
      return;
    }
    let defs: BuildDef[];
    if (this.suche) {
      const q = this.suche;
      defs = this.catalog().filter((d) => d.name.toLowerCase().includes(q) || (d.variante && (this.content.baumenue.familien[d.variante.familie] ?? '').toLowerCase().includes(q)));
    } else if (this.bereich === 'zuletzt') {
      defs = this.zuletzt.map((id) => this.content.bau.get(id)).filter((d) => !d.ausgeblendet);
    } else {
      const key = `${this.bereich}/${this.gruppe}`;
      defs = this.catalog().filter((d) => buildGroupOf(d, this.content.baumenue) === key);
    }
    // Varianten derselben Familie zu einer Karte zusammenfassen
    const cards: BuildDef[][] = [];
    const byFamily = new Map<string, BuildDef[]>();
    for (const d of defs) {
      const f = d.variante?.familie;
      if (!f) { cards.push([d]); continue; }
      let list = byFamily.get(f);
      if (!list) { list = []; byFamily.set(f, list); cards.push(list); }
      list.push(d);
    }
    // Erst was frei ist, dann nach Level und Preis; beim „Zuletzt“ die Reihenfolge behalten
    const firstOk = (l: BuildDef[]) => l.find((d) => this.isUnlocked(d)) ?? l[0];
    if (this.bereich !== 'zuletzt' || this.suche) {
      cards.sort((a, b) => {
        const da = firstOk(a), db = firstOk(b);
        return Number(!this.isUnlocked(da)) - Number(!this.isUnlocked(db)) || da.freischaltLevel - db.freischaltLevel || da.preis - db.preis;
      });
    }
    this.gridEl.innerHTML = cards.map((l) => this.card(l, tool)).join('')
      || `<p class="empty-cat">${this.suche ? 'Nichts gefunden.' : 'Hier gibt es noch nichts.'}</p>`;
    this.hintEl.innerHTML = this.hint();
    for (const img of this.gridEl.querySelectorAll<HTMLImageElement>('img[data-thumb]:not([src])')) {
      const path = img.dataset.thumb!;
      requestThumbnail(path, (url) => {
        for (const el of this.gridEl.querySelectorAll<HTMLImageElement>('img[data-thumb]')) if (el.dataset.thumb === path) el.src = url;
      });
    }
  }

  /** Alles, was im Baumenü stehen darf */
  private catalog(): BuildDef[] {
    return this.content.bau.all().filter((d) => !d.ausgeblendet && buildGroupOf(d, this.content.baumenue) !== null);
  }

  private count(key: string): number {
    const fam = new Set<string>();
    let n = 0;
    for (const d of this.catalog()) {
      if (buildGroupOf(d, this.content.baumenue) !== key) continue;
      if (d.variante) { if (fam.has(d.variante.familie)) continue; fam.add(d.variante.familie); }
      n++;
    }
    return n;
  }

  private isUnlocked(d: BuildDef): boolean {
    return d.freischaltLevel <= this.player.level && (!d.forschung || this.build.erforscht(d.forschung));
  }

  private clearSearch(): void {
    this.suche = '';
    this.searchEl.value = '';
  }

  private remember(id: string): void {
    this.zuletzt = [id, ...this.zuletzt.filter((x) => x !== id)].slice(0, ZULETZT_MAX);
    try { localStorage.setItem(ZULETZT_KEY, JSON.stringify(this.zuletzt)); } catch { /* ohne Speicher geht es auch */ }
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
      // Altbau darauf: Renovierung anbieten (oder Fortschritt zeigen)
      const rv = this.renovations, alt = rv?.needs(p.id) ?? false, fort = rv?.progress(p.id) ?? null;
      const ren = alt ? `<small>🏚️ Altbau · Renovierung ${formatMoney(rv!.cost(p.id))}, ca. ${Math.round(rv!.minutes(p.id) / 60)} h</small>` : '';
      const renBtn = !own || !alt ? '' : fort !== null
        ? `<span class="cost">🔨 wird renoviert … ${Math.round(fort * 100)} %</span>`
        : `<button type="button" class="primary" data-renovieren="${esc(p.id)}">Renovieren · ${formatMoney(rv!.cost(p.id))}</button>`;
      return `<div class="card plot ${own ? 'own' : ''} ${locked ? 'locked' : ''}">
        <span class="name">${esc(p.name)}</span><small>${w} × ${d} m</small>
        ${ren}
        ${own ? (renBtn || '<span class="cost">gehört dir</span>')
          : locked ? `<span class="cost">ab Level ${p.freischaltLevel}</span>`
            : `<button type="button" class="primary" data-plot="${esc(p.id)}">Kaufen · ${formatMoney(p.preis)}</button>`}
      </div>`;
    }).join('');
    return cards + (this.plotMessage ? `<p class="empty-cat">${esc(this.plotMessage)}</p>` : '')
      + '<p class="empty-cat">Gebaut werden kann nur auf eigenen Grundstücken (grüne Linien, beim Bauen sichtbar).</p>';
  }

  /** Karte für ein Bauteil oder eine Familie (mehrere Varianten mit Farbtupfern) */
  private card(list: BuildDef[], tool: Tool | null): string {
    const fam = list[0].variante?.familie;
    const gewaehlt = fam ? list.find((d) => d.id === this.wahl.get(fam)) : undefined;
    const d = gewaehlt ?? list.find((x) => this.isUnlocked(x)) ?? list[0];
    const ohneForschung = !!d.forschung && !this.build.erforscht(d.forschung);
    const locked = !this.isUnlocked(d);
    const active = tool?.art === 'bauen' && list.includes(tool.def) && !tool.moving;
    const icon = iconUrl(d.icon);
    // Ohne Icon: Vorschaubild aus dem Würfelmodell (wird nachgeladen)
    const thumb = !icon && hasThumbnail(d.model) ? d.model : null;
    const img = icon ? `<img src="${icon}" alt="" loading="lazy">`
      : thumb ? `<img data-thumb="${esc(thumb)}" alt="" ${cachedThumbnail(thumb) ? `src="${cachedThumbnail(thumb)}"` : ''}>`
        : '<span class="noicon"></span>';
    const name = fam && list.length > 1 ? this.content.baumenue.familien[fam] ?? d.name : d.name;
    const swatches = fam && list.length > 1 ? `<span class="swatches">${list.map((v) => `<button type="button" class="swatch ${v === d ? 'active' : ''} ${this.isUnlocked(v) ? '' : 'locked'}"
        data-variante="${v.id}" title="${esc(v.variante!.name)}${this.isUnlocked(v) ? '' : ' (gesperrt)'}" style="background:${v.variante!.farbe}"></button>`).join('')}</span>` : '';
    return `
      <div class="card ${active ? 'active' : ''} ${locked ? 'locked' : ''}" title="${esc(d.name)}">
        <button type="button" class="card-main" data-bau="${d.id}" ${locked ? 'disabled' : ''}>
          ${img}
          <span class="name">${esc(name)}</span>
          <span class="cost">${locked ? esc(this.content.text(ohneForschung ? 'bauen_fehler_forschung' : 'bauen_fehler_gesperrt', this.build.sperrWerte(d))) : formatMoney(d.preis)}</span>
        </button>
        ${swatches}
      </div>`;
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
      const problem = this.build.problem ? `<span class="problem">${esc(this.content.text(`bauen_fehler_${this.build.problem}`, this.build.sperrWerte(tool.def)))}</span>` : '';
      const flaeche = tool.def.ebene === 'boden' && !tool.def.absenkung && !tool.moving ? ` · ${t('bauen_flaeche_ziehen')}` : '';
      return `<b>${esc(tool.def.name)}</b> ${problem}<br>${k('auswaehlen')}${t('bauen_platzieren')}${flaeche} ${k('objekt_drehen')}${t('bauen_drehen')} ${k('pause')}${t('bauen_abbrechen')}`;
    }
    return `${k('auswaehlen')}${t(tool.art === 'abreissen' ? 'bauen_werkzeug_abreissen' : 'bauen_werkzeug_verschieben')} ${k('pause')}${t('bauen_abbrechen')}`;
  }
}
