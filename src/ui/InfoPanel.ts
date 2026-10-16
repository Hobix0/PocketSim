import type { Content } from '../content/Content';
import type { InputMap } from '../input/InputMap';
import type { Selection } from '../interaction/Selection';
import type { World } from '../ecs/World';
import { SelectableComponent } from '../components/SelectableComponent';
import { isDescribable } from './describe';
import { esc } from './html';

// Info-Fenster zur ausgewählten Entity.
// Die Zeilen kommen aus den Komponenten selbst (Describable) – eine neue
// Komponente erscheint hier also ohne Änderung an diesem Fenster.

export class InfoPanel {
  private readonly el: HTMLElement;

  constructor(
    private readonly selection: Selection,
    private readonly input: InputMap,
    private readonly content: Content,
    world?: World,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'info panel';
    this.el.hidden = true;
    document.querySelector('.hud')!.append(this.el);
    selection.events.on('changed', () => this.render());
    // Zustand der Auswahl hat sich geändert (z. B. Regal befüllt) → neu zeichnen
    world?.events.on('changed', (e) => { if (e === selection.current) this.render(); });
    input.onChange(() => this.render());
  }

  private render(): void {
    const entity = this.selection.current;
    if (!entity) {
      this.el.hidden = true;
      return;
    }
    const sel = entity.get(SelectableComponent);
    const rows = entity.all()
      .filter(isDescribable)
      .flatMap((c) => c.describe())
      .map((r) => `<div class="row"><span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`)
      .join('');
    this.el.innerHTML = `
      <h3>${esc(sel?.titel ?? entity.typeId)}</h3>
      ${sel ? `<div class="sub">${esc(sel.untertitel)}</div>` : ''}
      <div class="rows">${rows}</div>
      <div class="foot"><span class="key">${esc(this.input.keyLabel('pause'))}</span>${esc(this.content.text('auswahl_aufheben'))}</div>`;
    this.el.hidden = false;
  }
}
