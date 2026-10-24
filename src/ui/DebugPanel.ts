import type * as THREE from 'three';
import type { Content } from '../content/Content';
import type { World } from '../ecs/World';
import type { Entity } from '../ecs/Entity';
import type { PlayerState } from '../state/PlayerState';
import type { Cell } from '../world/GridCursor';
import { formatValue, sumValues } from '../components/ValuesComponent';
import { projectModels } from '../editor/ModelStore';
import { objectCatalog } from '../editor/VoxelModel';
import { esc } from './html';

// Entwickler-Anzeige (F3): Leistung (Bilder pro Sekunde, Zeichenaufrufe, Ladezeit), was unter dem Zeiger liegt,
// Licht-Vorschau (Tag/Abend/Nacht nur für die Darstellung – zum Prüfen von Leuchten), Testknöpfe für Geld und XP,
// geladene Daten (auch eigene Modelle mit Funktionsteilen) und was in der Welt steht.

/** Was die Anzeige vom Spiel braucht */
export interface DebugHooks {
  renderer: THREE.WebGLRenderer;
  /** Objekt unter dem Zeiger */
  hovered(): Entity | null;
  /** Kunden gerade im Laden */
  kunden(): number;
  /** Licht-Vorschau: Uhrzeit (Minute des Tages) nur für die Darstellung, null = echte Uhrzeit */
  setLicht(minute: number | null): void;
  /** Millisekunden vom Seitenaufruf bis zum ersten Bild */
  ladezeit(): number | null;
}

const LICHT: { id: string; name: string; minute: number | null }[] = [
  { id: 'echt', name: 'Echt', minute: null },
  { id: 'tag', name: 'Mittag', minute: 12 * 60 },
  { id: 'abend', name: 'Abend', minute: 19 * 60 + 30 },
  { id: 'nacht', name: 'Nacht', minute: 23 * 60 },
];

export class DebugPanel {
  private readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly perfEl: HTMLElement;
  private readonly cellEl: HTMLElement;
  private readonly hoverEl: HTMLElement;
  private lastCell = '';
  private lastHover: Entity | null | undefined;
  private dirty = true;
  /** Bilder und Zeit seit der letzten Leistungsanzeige */
  private frames = 0;
  private seconds = 0;

  constructor(
    parent: HTMLElement,
    private readonly content: Content,
    private readonly world: World,
    player: PlayerState,
    private readonly hooks: DebugHooks,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'debug panel';
    this.el.hidden = true; // F3 blendet die Anzeige ein
    this.el.innerHTML = `
      <h4>Leistung</h4>
      <div class="perf"></div>
      <h4>Zeiger</h4>
      <div class="row"><span>Feld</span><b class="cell">–</b></div>
      <div class="row"><span>Objekt</span><b class="hover">–</b></div>
      <h4>Licht-Vorschau</h4>
      <div class="buttons seg licht">${LICHT.map((l) => `<button type="button" data-licht="${l.id}">${l.name}</button>`).join('')}</div>
      <h4>Testen</h4>
      <div class="buttons">
        <button type="button" data-geld="1000">+1.000 €</button>
        <button type="button" data-geld="10000">+10.000 €</button>
        <button type="button" data-geld="-1000">−1.000 €</button>
        <button type="button" data-xp="100">+100 XP</button>
        <button type="button" data-level="1">+1 Level</button>
      </div>
      <div class="debug-body"></div>
      ${import.meta.env.DEV ? `<h4>Entwicklung</h4>
      <div class="buttons"><button type="button" data-editor="1">Voxel-Editor öffnen</button></div>` : ''}`;
    parent.append(this.el);
    this.body = this.el.querySelector('.debug-body')!;
    this.perfEl = this.el.querySelector('.perf')!;
    this.cellEl = this.el.querySelector('.cell')!;
    this.hoverEl = this.el.querySelector('.hover')!;

    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      const d = b.dataset;
      // Der Editor ist ein Werkzeug zum Erstellen des Spiels – nur hier (mit npm run dev) und über …/#editor erreichbar
      if (d.editor) { location.hash = 'editor'; location.reload(); return; }
      if (d.licht) { this.setLicht(d.licht); return; }
      const geld = Number(d.geld ?? 0);
      if (geld > 0) player.earn(geld, 'debug');
      if (geld < 0) player.spend(-geld, 'debug');
      if (d.xp) player.addXp(Number(d.xp));
      if (d.level) player.addXp(Math.max(1, player.xpToNext));
    });

    // Die Welt ändert sich oft (Kunden kommen und gehen): nur merken und neu zeichnen, wenn die Anzeige offen ist
    world.events.on('added', () => { this.dirty = true; });
    world.events.on('removed', () => { this.dirty = true; });
    this.setLicht('echt');
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  toggle(): void {
    this.el.hidden = !this.el.hidden;
    // Die Ziele-Liste steht in derselben Ecke – solange die Anzeige offen ist, macht sie Platz
    document.body.classList.toggle('debug-offen', !this.el.hidden);
    // Zeichenaufrufe über alle Durchgänge eines Bildes zählen (Nachbearbeitung rendert mehrmals)
    this.hooks.renderer.info.autoReset = this.el.hidden;
    this.frames = 0;
    this.seconds = 0;
    if (this.isOpen) { this.dirty = true; this.renderPerf(0); }
  }

  /** Einmal pro Bild (nach dem Zeichnen) */
  update(realDt: number): void {
    if (this.el.hidden) return;
    this.frames++;
    this.seconds += realDt;
    if (this.seconds >= 0.5) { this.renderPerf(this.frames / this.seconds); this.frames = 0; this.seconds = 0; }
    this.hooks.renderer.info.reset();
    const h = this.hooks.hovered();
    if (h !== this.lastHover) {
      this.lastHover = h;
      this.hoverEl.textContent = h ? `${this.nameOf(h.typeId)}` : '–';
      this.hoverEl.title = h ? h.typeId : '';
    }
    if (this.dirty) this.render();
  }

  /** Feld unter der Maus anzeigen (nur bei Änderung ins DOM schreiben). */
  showCell(cell: Cell | null): void {
    const text = cell ? `${Math.floor(cell.x)} | ${Math.floor(cell.z)}` : '–';
    if (text === this.lastCell) return;
    this.lastCell = text;
    this.cellEl.textContent = text;
  }

  private setLicht(id: string): void {
    this.hooks.setLicht(LICHT.find((l) => l.id === id)?.minute ?? null);
    this.el.querySelectorAll<HTMLElement>('[data-licht]').forEach((b) => b.classList.toggle('active', b.dataset.licht === id));
  }

  private nameOf(id: string): string {
    return this.content.bau.find(id)?.name ?? this.content.produkte.find(id)?.name ?? (id === 'karton' ? 'Karton (Ware)' : id);
  }

  private renderPerf(fps: number): void {
    const info = this.hooks.renderer.info;
    const row = (label: string, value: string, warn = false) => `<div class="row"><span>${label}</span><b${warn ? ' class="warn"' : ''}>${value}</b></div>`;
    const n = (v: number) => v.toLocaleString('de-DE');
    const lade = this.hooks.ladezeit();
    this.perfEl.innerHTML = `
      ${row('Bilder pro Sekunde', fps ? `${Math.round(fps)} (${(1000 / fps).toFixed(1)} ms)` : '…', fps > 0 && fps < 30)}
      ${row('Zeichenaufrufe', n(info.render.calls), info.render.calls > 1500)}
      ${row('Dreiecke', n(info.render.triangles))}
      ${row('Geometrien · Texturen', `${n(info.memory.geometries)} · ${n(info.memory.textures)}`)}
      ${row('Shader-Programme', n(info.programs?.length ?? 0))}
      ${row('Ladezeit', lade === null ? '…' : `${(lade / 1000).toFixed(1)} s`, lade !== null && lade > 15000)}`;
  }

  private render(): void {
    this.dirty = false;
    const c = this.content;
    const row = (label: string, value: string) => `<div class="row"><span>${esc(label)}</span><b>${value}</b></div>`;

    // Wie viele Entities je Typ stehen in der Welt? (die häufigsten zuerst)
    const counts = new Map<string, number>();
    let total = 0;
    for (const e of this.world.all()) { counts.set(e.typeId, (counts.get(e.typeId) ?? 0) + 1); total++; }
    const placed = [...counts].sort((a, b) => b[1] - a[1]).map(([id, n]) => row(this.nameOf(id), `${n}×`)).join('');

    // Summe der Bauteil-Werte (Prinzip: Werte summieren sich von unten nach oben)
    const sums = Object.entries(sumValues(this.world))
      .map(([key, n]) => { const info = c.werte[key]; return row(info.name, formatValue(n, info.einheit)); })
      .join('');

    // Eigene Modelle aus dem Editor (data/modelle) und ihre Funktionsteile
    const modelle = projectModels();
    const mitTeilen = modelle.filter((m) => m.teile?.length);
    const teile = new Map<string, number>();
    for (const m of mitTeilen) for (const t of m.teile!) teile.set(t.rolle, (teile.get(t.rolle) ?? 0) + 1);
    const rollen = objectCatalog().rollen;
    const teileRows = [...teile].map(([r, n]) => row(`· ${rollen.find((x) => x.id === r)?.name ?? r}`, `${n}`)).join('');

    this.body.innerHTML = `
      <h4>Daten geladen</h4>
      ${row('Produkte', String(c.produkte.size))}
      ${row('… davon Preis offen', String(c.produkte.all().filter((p) => p.preisOffen).length))}
      ${row('Bauelemente', String(c.bau.size))}
      ${row('Eigene Modelle (data/modelle)', String(modelle.length))}
      ${row('… mit Funktionsteilen', String(mitTeilen.length))}
      ${teileRows}
      <h4>In der Welt</h4>
      ${row('Objekte gesamt', String(total))}
      ${row('Kunden im Laden', String(this.hooks.kunden()))}
      <details><summary>Nach Art (${counts.size})</summary>${placed || row('–', '')}</details>
      <details><summary>Summe der Bauteile</summary>${sums || row('–', '')}</details>`;
  }
}
