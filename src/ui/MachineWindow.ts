import type { Content } from '../content/Content';
import type { RecipeDef } from '../content/definitions';
import type { Entity } from '../ecs/Entity';
import type { Production, StartCheck } from '../economy/Production';
import { MachineComponent, STATUS_TEXT } from '../components/MachineComponent';
import { SelectableComponent } from '../components/SelectableComponent';
import { esc } from './html';
import { formatMoney } from './format';

// Bedienfenster einer Maschine: Rezepte mit Rohstoffen (was im Lager liegt), Ergebnis, Dauer, Gewinn;
// Rezept wählen und starten, automatisch wiederholen, Fortschritt.

export class MachineWindow {
  private readonly el: HTMLElement;
  private machine: Entity | null = null;
  private message = '';
  private lastKey = '';

  constructor(parent: HTMLElement, private readonly content: Content, private readonly production: Production, private readonly level: () => number) {
    this.el = document.createElement('div');
    this.el.className = 'window machine panel';
    this.el.hidden = true;
    parent.append(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      const m = this.component;
      if (!b || !m) return;
      b.blur();
      if (b.classList.contains('close')) this.close();
      else if (b.dataset.rezept) {
        const r = content.rezepte.get(b.dataset.rezept);
        m.choose(r);
        const check = m.start();
        this.message = check.ok ? `${r.name} läuft.` : this.explain(check);
        this.render();
      }
    });
    this.el.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const m = this.component;
      if (m && input.classList.contains('repeat')) { m.wiederholen = input.checked; this.render(); }
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  private get component(): MachineComponent | undefined {
    return this.machine?.world ? this.machine.get(MachineComponent) : undefined;
  }

  open(machine: Entity): void {
    this.machine = machine;
    this.message = '';
    this.el.hidden = false;
    this.render();
  }

  close(): void {
    this.el.hidden = true;
    this.machine = null;
  }

  /** Jeden Frame: Fortschritt und Zustand nachführen (neu zeichnen nur bei Änderung). */
  update(): void {
    if (!this.isOpen) return;
    const m = this.component;
    if (!m) { this.close(); return; }
    const key = `${m.status}|${m.rezept?.id}|${m.wiederholen}|${m.durchgaenge}`;
    if (key !== this.lastKey) this.render();
    const bar = this.el.querySelector<HTMLElement>('.progress span');
    if (bar) bar.style.width = `${Math.round(m.anteil * 100)}%`;
  }

  private explain(c: StartCheck): string {
    if (c.ok) return '';
    if (c.grund === 'rohstoffe') return `Es fehlen: ${c.fehlt.map((f) => `${f.menge}× ${this.content.waren.get(f.ware).name}`).join(', ')} – im Großhandel unter „Rohstoffe“ kaufen.`;
    if (c.grund === 'strom') return 'Der Stromanschluss reicht nicht – unter „Versorgung“ ausbauen oder andere Maschinen laufen lassen.';
    if (c.grund === 'wasser') return 'Der Wasseranschluss reicht nicht – unter „Versorgung“ ausbauen.';
    return 'Dieses Rezept ist noch gesperrt.';
  }

  private render(): void {
    const m = this.component;
    if (!m) return;
    this.lastKey = `${m.status}|${m.rezept?.id}|${m.wiederholen}|${m.durchgaenge}`;
    const name = this.machine!.get(SelectableComponent)?.titel ?? 'Maschine';
    const recipes = this.production.recipesFor(m.def.typ);
    const ware = (id: string) => this.content.waren.get(id);
    const cards = recipes.map((r) => this.card(r, m)).join('');
    this.el.innerHTML = `
      <header><h2>${esc(name)}</h2><button type="button" class="close" aria-label="Schließen">✕</button></header>
      <div class="machine-state">
        <span class="lamp ${m.status === 'laeuft' ? 'on' : m.status === 'bereit' ? '' : 'wait'}"></span>
        <b>${esc(STATUS_TEXT[m.status])}</b>
        ${m.rezept ? `<span>· ${esc(m.rezept.name)} → ${m.rezept.ausgang.menge}× ${esc(ware(m.rezept.ausgang.ware).name)}</span>` : ''}
        <span class="progress"><span style="width:${Math.round(m.anteil * 100)}%"></span></span>
      </div>
      <label class="check"><input type="checkbox" class="repeat" ${m.wiederholen ? 'checked' : ''}> Automatisch wiederholen, sobald Rohstoffe und Platz da sind</label>
      <p class="lead">Verbraucht beim Laufen ${m.def.strom} kW${m.def.wasser ? ` und ${m.def.wasser} l/h Wasser` : ''}. Rohstoffe kommen aus dem Lager, das Ergebnis wird als Karton ins Lager gestellt.</p>
      ${this.message ? `<p class="msg">${esc(this.message)}</p>` : ''}
      <div class="recipes">${cards || '<p class="empty">Für diese Maschine gibt es keine Rezepte.</p>'}</div>`;
  }

  private card(r: RecipeDef, m: MachineComponent): string {
    const ware = (id: string) => this.content.waren.get(id);
    const locked = r.freischaltLevel > this.level();
    const active = m.rezept?.id === r.id;
    const inputs = r.eingang.map((l) => {
      const have = this.production.available(l.ware);
      return `<li class="${have < l.menge ? 'missing' : ''}">${l.menge}× ${esc(ware(l.ware).name)} <small>im Lager ${have}</small></li>`;
    }).join('');
    const margin = this.production.margin(r);
    return `<div class="recipe ${active ? 'active' : ''} ${locked ? 'locked' : ''}">
      <b>${esc(r.name)}</b>
      <ul>${inputs}</ul>
      <span class="out">→ ${r.ausgang.menge}× ${esc(ware(r.ausgang.ware).name)} · ${r.dauer} min</span>
      <small>Verkaufswert minus Rohstoffe: ${margin < 0 ? '−' : ''}${formatMoney(Math.abs(margin))}</small>
      ${locked ? `<span class="cost">ab Level ${r.freischaltLevel}</span>`
        : active && m.laeuft ? '<span class="cost">läuft</span>'
          : `<button type="button" class="primary" data-rezept="${r.id}">${active ? 'Starten' : 'Wählen & starten'}</button>`}
    </div>`;
  }
}
