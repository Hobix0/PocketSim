import { listSlots, storageAvailable, type SlotId, type SlotInfo } from '../save/SaveSlots';
import { esc } from './html';
import { formatMoney } from './format';

// Hauptmenü (beim Start, über dem pausierten Laden) und Pausemenü (Esc im Spiel).
// Das Menü kennt nur Aktionen; was sie tun, entscheidet das Spiel.

export interface MenuActions {
  weiter(): void;
  neu(): void;
  laden(slot: SlotId): void;
  speichern(slot: SlotId): boolean;
  exportieren(): void;
  importieren(file: File): void;
  editor(): void;
  hauptmenue(): void;
  stil(): 'voxel' | 'lowpoly';
  setStil(s: 'voxel' | 'lowpoly'): void;
}

type Mode = 'haupt' | 'pause';
type View = 'start' | 'laden' | 'speichern';

const SLOT_NAMES: Record<SlotId, string> = { auto: 'Automatisch (Tagesende)', 1: 'Platz 1', 2: 'Platz 2', 3: 'Platz 3' };

export class GameMenu {
  private readonly el: HTMLElement;
  private mode: Mode = 'haupt';
  private view: View = 'start';
  private message = '';

  constructor(parent: HTMLElement, private readonly actions: MenuActions) {
    this.el = document.createElement('div');
    this.el.className = 'game-menu';
    this.el.hidden = true;
    parent.append(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      b.blur();
      const a = b.dataset.action;
      const slot = b.dataset.slot as SlotId | undefined;
      if (a === 'weiter') this.actions.weiter();
      else if (a === 'neu') this.actions.neu();
      else if (a === 'view') { this.view = b.dataset.view as View; this.message = ''; this.render(); }
      else if (a === 'laden' && slot) this.actions.laden(slot);
      else if (a === 'speichern' && slot) {
        this.message = this.actions.speichern(slot) ? `Gespeichert: ${SLOT_NAMES[slot]}` : 'Speichern im Browser nicht möglich – bitte „Als Datei sichern“.';
        this.render();
      } else if (a === 'export') this.actions.exportieren();
      else if (a === 'editor') this.actions.editor();
      else if (a === 'hauptmenue') this.actions.hauptmenue();
      else if (a === 'stil') { this.actions.setStil(this.actions.stil() === 'voxel' ? 'lowpoly' : 'voxel'); }
    });
    this.el.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (input.type === 'file' && input.files?.[0]) this.actions.importieren(input.files[0]);
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(mode: Mode): void {
    this.mode = mode;
    this.view = 'start';
    this.message = '';
    this.el.hidden = false;
    this.render();
  }

  close(): void {
    this.el.hidden = true;
  }

  /** Esc im Menü: Unterseite → zurück, sonst Pausemenü schließen. true, wenn das Menü etwas getan hat. */
  back(): boolean {
    if (!this.isOpen) return false;
    if (this.view !== 'start') { this.view = 'start'; this.render(); return true; }
    if (this.mode === 'pause') { this.actions.weiter(); return true; }
    return true;
  }

  private render(): void {
    const slots = listSlots();
    const hasSave = slots.some(Boolean);
    const btn = (action: string, label: string, extra = '', cls = '') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
    const stil = this.actions.stil() === 'voxel' ? 'Voxel' : 'Low-Poly';
    let body = '';
    if (this.view === 'start') {
      body = this.mode === 'haupt'
        ? `${btn('weiter', hasSave ? 'Weiterspielen' : 'Spielen', '', 'primary')}
           <small class="sub">${hasSave ? 'Fortsetzen lädt den zuletzt gespeicherten Stand' : 'Ein kleiner, leerer Laden wartet'}</small>
           ${hasSave ? btn('neu', 'Neues Spiel') : ''}
           ${btn('view', 'Spielstand laden', 'data-view="laden"')}
           <label class="button">Datei laden<input type="file" accept=".json,application/json" hidden></label>
           ${btn('stil', `Darstellung: ${stil}`)}
           ${import.meta.env.DEV ? btn('editor', 'Voxel-Editor (Entwicklung)') : ''}`
        : `${btn('weiter', 'Weiterspielen', '', 'primary')}
           ${btn('view', 'Speichern', 'data-view="speichern"')}
           ${btn('view', 'Laden', 'data-view="laden"')}
           ${btn('export', 'Als Datei sichern')}
           <label class="button">Datei laden<input type="file" accept=".json,application/json" hidden></label>
           ${btn('hauptmenue', 'Hauptmenü')}`;
    } else {
      const saving = this.view === 'speichern';
      const rows = slots.map((s, i) => {
        const id = (['auto', '1', '2', '3'] as SlotId[])[i];
        if (saving && id === 'auto') return '';
        return `<div class="slot ${s ? '' : 'empty'}">
          <span><b>${SLOT_NAMES[id]}</b><small>${s ? describe(s) : 'leer'}</small></span>
          ${saving ? btn('speichern', s ? 'Überschreiben' : 'Speichern', `data-slot="${id}"`, 'primary')
            : s ? btn('laden', 'Laden', `data-slot="${id}"`, 'primary') : ''}
        </div>`;
      }).join('');
      body = `<h3>${saving ? 'Speichern' : 'Spielstand laden'}</h3>${rows}
        ${storageAvailable() ? '' : '<p class="warn">Der Browser erlaubt hier keinen Speicher. Nutze „Als Datei sichern“ und „Datei laden“.</p>'}
        ${btn('view', 'Zurück', 'data-view="start"')}`;
    }
    this.el.innerHTML = `
      <div class="menu-card panel">
        <h1>Urban<b>Evolution</b></h1>
        <p class="tag">${this.mode === 'haupt' ? 'Vom kleinen Laden zur Wertschöpfungskette' : 'Pause'}</p>
        <div class="menu-body">${body}</div>
        ${this.message ? `<p class="msg">${esc(this.message)}</p>` : ''}
      </div>`;
  }
}

function describe(s: SlotInfo): string {
  const when = new Date(s.gespeichert);
  const date = Number.isNaN(when.getTime()) ? '' : ` · gespeichert ${when.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`;
  return `Tag ${s.tag}, ${s.uhrzeit} · ${formatMoney(s.geld)}${date}`;
}
