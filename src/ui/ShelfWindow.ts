import type { Content } from '../content/Content';
import type { Unlocks } from '../economy/Research';
import type { ProductDef } from '../content/definitions';
import type { Entity } from '../ecs/Entity';
import { ShelfComponent } from '../components/ShelfComponent';
import { SelectableComponent } from '../components/SelectableComponent';
import { esc } from './html';

// Regal belegen: je Fach ein festes Produkt wählen (oder frei lassen).
// Feste Fächer füllt der Auffüller nur mit diesem Produkt, und der Einkäufer kauft es nach.

export class ShelfWindow {
  private readonly el: HTMLElement;
  private shelf: Entity | null = null;
  private lastKey = '';

  constructor(parent: HTMLElement, private readonly content: Content, private readonly unlocks: Unlocks) {
    this.el = document.createElement('div');
    this.el.className = 'window shelf-window panel';
    this.el.hidden = true;
    parent.append(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      const s = this.component;
      if (!b || !s) return;
      b.blur();
      if (b.classList.contains('close')) this.close();
      else if (b.dataset.alle === 'festlegen') s.faecher.forEach((f, i) => { if (f.produkt) s.setFest(i, f.produkt); });
      else if (b.dataset.alle === 'freigeben') s.faecher.forEach((_, i) => s.setFest(i, null));
      else if (b.dataset.kopieren !== undefined) {
        const p = s.faecher[Number(b.dataset.kopieren)].fest;
        s.faecher.forEach((f, i) => { if (!f.produkt || f.produkt === p) s.setFest(i, p); });
      }
      this.render();
    });
    this.el.addEventListener('change', (e) => {
      const sel = e.target as HTMLSelectElement;
      const s = this.component;
      if (!s || sel.dataset.fach === undefined) return;
      s.setFest(Number(sel.dataset.fach), sel.value ? this.content.produkte.get(sel.value) : null);
      this.render();
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  private get component(): ShelfComponent | undefined {
    return this.shelf?.world ? this.shelf.get(ShelfComponent) : undefined;
  }

  open(shelf: Entity): void {
    this.shelf = shelf;
    this.el.hidden = false;
    this.render();
  }

  close(): void {
    this.el.hidden = true;
    this.shelf = null;
  }

  /** Jeden Frame: neu zeichnen, wenn sich der Inhalt geändert hat (Kunden, Auffüller) */
  update(): void {
    if (!this.isOpen) return;
    const s = this.component;
    if (!s) { this.close(); return; }
    if (this.key(s) !== this.lastKey) this.render();
  }

  private key(s: ShelfComponent): string {
    return s.faecher.map((f) => `${f.produkt?.id}:${f.menge}:${f.fest?.id}`).join('|');
  }

  private render(): void {
    const s = this.component;
    if (!s) return;
    this.lastKey = this.key(s);
    const name = this.shelf!.get(SelectableComponent)?.titel ?? 'Regal';
    const passend = this.content.produkte.all()
      .filter((p) => !p.rohstoff && this.unlocks.ok(p) && (!p.kuehlung || s.kuehlung));
    const rows = s.faecher.map((f, i) => {
      const anteil = Math.round((f.menge / s.kapazitaet) * 100);
      return `<div class="fach-row ${f.fest ? 'fest' : ''}">
        <b>Fach ${i + 1}</b>
        <span class="fach-inhalt">${f.produkt ? `${esc(f.produkt.name)} <small>${f.menge}/${s.kapazitaet}</small>` : '<small>leer</small>'}
          <span class="fuellung"><span style="width:${anteil}%"></span></span></span>
        <select data-fach="${i}" aria-label="Festes Produkt für Fach ${i + 1}">${this.options(passend, f.fest)}</select>
        ${f.fest ? `<button type="button" data-kopieren="${i}" title="Alle freien Fächer genauso belegen">auf alle</button>` : '<span></span>'}
      </div>`;
    }).join('');
    this.el.innerHTML = `
      <header><h2>${esc(name)}${s.kuehlung ? ' <small>gekühlt</small>' : ''}</h2><button type="button" class="close" aria-label="Schließen">✕</button></header>
      <p class="lead">Feste Fächer füllt der Auffüller nur mit dem gewählten Produkt – auch wenn das Fach gerade leer ist.
        Ein Einkäufer bestellt alles nach, was einmal im Regal stand.</p>
      <div class="toolbar">
        <button type="button" data-alle="festlegen">Aktuelle Ware festlegen</button>
        <button type="button" data-alle="freigeben">Alle Fächer freigeben</button>
      </div>
      <div class="list faecher">${rows}</div>`;
  }

  private options(produkte: ProductDef[], fest: ProductDef | null): string {
    const kategorien = new Map<string, ProductDef[]>();
    for (const p of produkte) {
      const k = this.content.kategorien.find(p.kategorie)?.name ?? p.kategorie;
      if (!kategorien.has(k)) kategorien.set(k, []);
      kategorien.get(k)!.push(p);
    }
    const groups = [...kategorien].map(([k, list]) => `<optgroup label="${esc(k)}">${list
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map((p) => `<option value="${p.id}" ${fest?.id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`).join('');
    return `<option value="" ${fest ? '' : 'selected'}>– frei –</option>${groups}`;
  }
}
