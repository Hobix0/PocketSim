import type { Content } from '../content/Content';
import type { World } from '../ecs/World';
import { formatValue, sumValues } from '../components/ValuesComponent';

// Entwickler-Anzeige: was aus den Daten geladen wurde und was in der Welt steht.
// Aktualisiert sich über die Ereignisse der Welt, nicht jeden Frame.

export class DebugPanel {
  private readonly el: HTMLElement;

  constructor(private readonly content: Content, private readonly world: World) {
    this.el = document.createElement('div');
    this.el.className = 'debug panel';
    document.querySelector('.hud')!.append(this.el);
    world.events.on('added', () => this.render());
    world.events.on('removed', () => this.render());
    this.render();
  }

  toggle(): void {
    this.el.hidden = !this.el.hidden;
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

    this.el.innerHTML = `
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
