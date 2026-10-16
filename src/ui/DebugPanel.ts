import type { Content } from '../content/Content';
import type { World } from '../ecs/World';
import type { PlayerState } from '../state/PlayerState';
import type { Cell } from '../world/GridCursor';
import { formatValue, sumValues } from '../components/ValuesComponent';

// Entwickler-Anzeige: was aus den Daten geladen wurde, was in der Welt steht,
// das Feld unter der Maus – und Testknöpfe für Geld und XP, solange es noch
// kein Gameplay gibt, das beides verdient.

export class DebugPanel {
  private readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly cellEl: HTMLElement;
  private lastCell = '';

  constructor(
    parent: HTMLElement,
    private readonly content: Content,
    private readonly world: World,
    player: PlayerState,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'debug panel';
    this.el.innerHTML = `
      <div class="debug-body"></div>
      <h4>Zeiger</h4>
      <div class="row"><span>Feld</span><b class="cell">–</b></div>
      <h4>Testen</h4>
      <div class="buttons">
        <button type="button" data-geld="100">+100 €</button>
        <button type="button" data-geld="-100">−100 €</button>
        <button type="button" data-xp="50">+50 XP</button>
      </div>`;
    parent.append(this.el);
    this.body = this.el.querySelector('.debug-body')!;
    this.cellEl = this.el.querySelector('.cell')!;

    this.el.querySelector('.buttons')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      const geld = Number(b.dataset.geld ?? 0);
      if (geld > 0) player.earn(geld, 'debug');
      if (geld < 0) player.spend(-geld, 'debug');
      if (b.dataset.xp) player.addXp(Number(b.dataset.xp));
    });

    world.events.on('added', () => this.render());
    world.events.on('removed', () => this.render());
    this.render();
  }

  toggle(): void {
    this.el.hidden = !this.el.hidden;
  }

  /** Feld unter der Maus anzeigen (nur bei Änderung ins DOM schreiben). */
  showCell(cell: Cell | null): void {
    const text = cell ? `${Math.floor(cell.x)} | ${Math.floor(cell.z)}` : '–';
    if (text === this.lastCell) return;
    this.lastCell = text;
    this.cellEl.textContent = text;
  }

  private render(): void {
    const c = this.content;
    const row = (label: string, value: string) => `<div class="row"><span>${label}</span><b>${value}</b></div>`;

    // Wie viele Entities je Typ stehen in der Welt?
    const counts = new Map<string, number>();
    for (const e of this.world.all()) counts.set(e.typeId, (counts.get(e.typeId) ?? 0) + 1);
    const placed = [...counts].map(([id, n]) => row(c.bau.find(id)?.name ?? id, `${n}×`)).join('');

    // Summe der Bauteil-Werte (Prinzip: Werte summieren sich von unten nach oben)
    const sums = Object.entries(sumValues(this.world))
      .map(([key, n]) => {
        const info = c.werte[key];
        return row(info.name, formatValue(n, info.einheit));
      })
      .join('');

    this.body.innerHTML = `
      <h4>Daten geladen</h4>
      ${row('Warenkategorien', String(c.kategorien.size))}
      ${row('Produkte', String(c.produkte.size))}
      ${row('Bauelemente', String(c.bau.size))}
      <h4>In der Welt</h4>
      ${placed || row('Entities', '0')}
      <h4>Summe der Bauteile</h4>
      ${sums || row('–', '')}`;
  }
}
