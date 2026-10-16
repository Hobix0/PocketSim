// Kurze Meldungen am oberen Rand, die nach ein paar Sekunden verschwinden.
// Teil des UI-Kits; jedes System kann darüber Bescheid geben.

export type ToastKind = 'info' | 'gut' | 'warnung';

export class Toasts {
  private readonly el: HTMLElement;

  constructor(parent: HTMLElement, private readonly dauerMs = 3200) {
    this.el = document.createElement('div');
    this.el.className = 'toasts';
    parent.append(this.el);
  }

  show(text: string, kind: ToastKind = 'info'): void {
    const t = document.createElement('div');
    t.className = `toast panel ${kind}`;
    t.textContent = text;
    this.el.append(t);
    // Höchstens drei gleichzeitig
    while (this.el.children.length > 3) this.el.firstElementChild!.remove();
    setTimeout(() => {
      t.classList.add('weg');
      setTimeout(() => t.remove(), 300);
    }, this.dauerMs);
  }
}
