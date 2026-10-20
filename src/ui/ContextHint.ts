import type { Content } from '../content/Content';
import type { InputMap } from '../input/InputMap';
import type { Pointer } from '../input/Pointer';
import type { Interactor } from '../interaction/Interactor';
import { SelectableComponent } from '../components/SelectableComponent';
import { esc } from './html';

// Kleiner Hinweis am Mauszeiger: was liegt darunter, was kann ich tun?
// Beispiel: "Standardregal · Regal  [Linksklick] Auswählen".
// Die Taste wird live aus der Belegung gelesen.

export class ContextHint {
  private readonly el: HTMLElement;

  constructor(
    private readonly interactor: Interactor,
    private readonly input: InputMap,
    private readonly pointer: Pointer,
    private readonly content: Content,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'context-hint panel';
    this.el.hidden = true;
    document.querySelector('.hud')!.append(this.el);
    interactor.events.on('hoverChanged', () => this.render());
    interactor.selection.events.on('changed', () => this.render());
    input.onChange(() => this.render());
  }

  /** Jeden Frame: dem Zeiger folgen (nur Position, kein Neuaufbau). */
  update(): void {
    if (this.el.hidden) return;
    this.el.style.transform = `translate(${this.pointer.screen.x + 18}px, ${this.pointer.screen.y + 18}px)`;
  }

  private render(): void {
    const entity = this.interactor.hovered;
    if (!entity) {
      this.el.hidden = true;
      return;
    }
    const sel = entity.get(SelectableComponent);
    const titel = sel?.titel ?? this.content.bau.find(entity.typeId)?.name ?? entity.typeId;
    // Kontext nur zeigen, wenn er etwas Neues sagt ("Kühlregal · Regal", aber nicht "Kasse · Kasse")
    const name = this.content.kontexte[this.interactor.getContext()]?.name ?? '';
    const kontext = name !== titel ? name : '';
    const hints = this.interactor.options()
      .map((o) => `<div class="hint"><span class="key">${esc(this.input.keyLabel(o.aktion))}</span>${esc(this.content.text(o.text))}</div>`)
      .join('');
    this.el.innerHTML = `
      <div class="ctx-title">${esc(titel)}${kontext ? `<span>${esc(kontext)}</span>` : ''}</div>
      ${hints}`;
    this.el.hidden = false;
    this.update();
  }
}
