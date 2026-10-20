// Eingabe über Aktionen statt fester Tasten.
// Die Standardbelegung kommt aus data/eingabe/standard.json, eigene Belegungen
// werden im Browser gespeichert. Das HUD fragt die Tastennamen hier ab, damit
// Hinweise nach dem Umbelegen automatisch stimmen.
// Maustasten heißen "Mouse0" (links), "Mouse1" (Mitte), "Mouse2" (rechts).

export type Bindings = Record<string, string[]>;

const STORAGE_KEY = 'urbanevolution.eingabe';

const LABELS: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Escape: 'Esc', Space: 'Leertaste', Enter: 'Enter', Tab: 'Tab',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Strg', ControlRight: 'Strg',
  Mouse0: 'Linksklick', Mouse1: 'Mittlere Maustaste', Mouse2: 'Rechtsklick',
};

export class InputMap {
  private readonly bindings = new Map<string, string[]>();
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly listeners = new Set<() => void>();

  constructor(defaults: Bindings) {
    for (const [action, codes] of Object.entries(defaults)) this.bindings.set(action, [...codes]);
    const saved = readSaved();
    for (const [action, codes] of Object.entries(saved)) {
      if (this.bindings.has(action) && Array.isArray(codes)) this.bindings.set(action, codes);
    }
  }

  /** Tastatur am Fenster und Maustasten an der Spielfläche abhören. */
  attach(surface: HTMLElement): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat || isTyping(e.target)) return;
      this.setCode(e.code, true);
    });
    window.addEventListener('keyup', (e) => this.setCode(e.code, false));
    window.addEventListener('blur', () => this.held.clear());
    surface.addEventListener('pointerdown', (e) => this.setCode(`Mouse${e.button}`, true));
    window.addEventListener('pointerup', (e) => this.setCode(`Mouse${e.button}`, false));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Wird die Aktion gerade gehalten? */
  isHeld(action: string): boolean {
    return this.codes(action).some((c) => this.held.has(c));
  }

  /** Wurde die Aktion in diesem Frame neu gedrückt? */
  wasPressed(action: string): boolean {
    return this.codes(action).some((c) => this.pressed.has(c));
  }

  /** -1, 0 oder 1 aus zwei gegensätzlichen Aktionen. */
  axis(negative: string, positive: string): number {
    return (this.isHeld(positive) ? 1 : 0) - (this.isHeld(negative) ? 1 : 0);
  }

  /** Am Ende jedes Frames aufrufen. */
  endFrame(): void {
    this.pressed.clear();
  }

  /** Aktion neu belegen und die Belegung speichern. */
  rebind(action: string, codes: string[]): void {
    if (!this.bindings.has(action)) throw new Error(`Unbekannte Aktion: ${action}`);
    this.bindings.set(action, [...codes]);
    this.save();
    for (const cb of this.listeners) cb();
  }

  /** Anzeigename der ersten Taste einer Aktion, z. B. "W" oder "Rechtsklick". */
  keyLabel(action: string): string {
    const code = this.codes(action)[0];
    if (!code) return '–';
    if (code in LABELS) return LABELS[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
  }

  /** Benachrichtigung, wenn sich die Belegung ändert. Gibt eine Abmelde-Funktion zurück. */
  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private codes(action: string): string[] {
    return this.bindings.get(action) ?? [];
  }

  /** Taste oder Maustaste drücken/loslassen. Wird von den Browser-Ereignissen und von Tests benutzt. */
  setCode(code: string, down: boolean): void {
    if (!down) {
      this.held.delete(code);
      return;
    }
    if (!this.held.has(code)) this.pressed.add(code);
    this.held.add(code);
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.bindings)));
    } catch {
      // Speichern nicht möglich (z. B. privates Fenster) – Belegung gilt dann nur bis zum Neuladen.
    }
  }
}

function readSaved(): Bindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Bindings) : {};
  } catch {
    return {};
  }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
