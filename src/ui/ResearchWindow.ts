import type { Content } from '../content/Content';
import type { Research, ResearchNode, NodeStatus } from '../economy/Research';
import { esc } from './html';

// Forschungsbaum: ein Reiter je Baum (Supermarkt, Café …), darin Karten in Spalten (Stufen) und Zeilen (Zweige),
// Linien zu den Voraussetzungen. Voraussetzungen aus einem anderen Baum stehen als Hinweis auf der Karte.
// Ein Klick auf eine Karte zeigt unten, was sie freischaltet, und den Knopf zum Erforschen.
// Lage und Inhalt der Knoten: data/forschung/baum.json

const BREITE = 168;
const HOEHE = 84;
const ABSTAND_X = 30;
const ABSTAND_Y = 18;

export class ResearchWindow {
  private readonly el: HTMLElement;
  private lastKey = '';
  private selected: string | null = null;
  private tab: string;

  constructor(parent: HTMLElement, private readonly content: Content, private readonly research: Research) {
    this.el = document.createElement('div');
    this.tab = research.settings.baeume[0]?.id ?? 'laden';
    this.el.className = 'window research panel';
    this.el.hidden = true;
    parent.append(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.classList.contains('close')) { b.blur(); this.close(); return; }
      if (b.dataset.node) { this.selected = b.dataset.node; this.redraw(); return; }
      if (b.dataset.baum) { this.tab = b.dataset.baum; this.selected = null; this.redraw(); return; }
      if (b.dataset.erforschen) { this.research.research(b.dataset.erforschen); this.redraw(); }
    });
    research.events.on('changed', () => this.update());
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    // Zuerst etwas zeigen, das man gerade erforschen kann
    if (!this.selected) {
      const n = this.research.nodes.find((x) => x.baum === this.tab && this.research.status(x) === 'bereit') ?? this.research.nodes.find((x) => this.research.status(x) === 'bereit');
      if (n) { this.selected = n.id; this.tab = n.baum; }
    }
    this.redraw();
  }

  close(): void {
    this.el.hidden = true;
  }

  toggleOpen(): void {
    if (this.isOpen) this.close(); else this.open();
  }

  /** Neu zeichnen, wenn sich Ideen, Level oder Erforschtes geändert haben */
  update(): void {
    if (!this.isOpen) return;
    const key = this.research.ideen + '|' + this.research.nodes.map((n) => this.research.status(n)).join();
    if (key !== this.lastKey) this.redraw();
  }

  private redraw(): void {
    const r = this.research;
    this.lastKey = r.ideen + '|' + r.nodes.map((n) => r.status(n)).join();
    const nodes = r.nodes.filter((n) => n.baum === this.tab);
    const cols = Math.max(...nodes.map((n) => n.spalte)) + 1;
    const rows = Math.max(...nodes.map((n) => n.zeile)) + 1;
    const w = cols * BREITE + (cols - 1) * ABSTAND_X, h = rows * HOEHE + (rows - 1) * ABSTAND_Y;
    const pos = (n: ResearchNode) => ({ x: n.spalte * (BREITE + ABSTAND_X), y: n.zeile * (HOEHE + ABSTAND_Y) });

    // Linien: vom rechten Rand der Voraussetzung zum linken Rand des Knotens, weich geschwungen
    const lines = nodes.flatMap((n) => n.voraussetzungen.filter((v) => r.node(v)?.baum === this.tab).map((v) => {
      const a = pos(r.node(v)!), b = pos(n);
      const x1 = a.x + BREITE, y1 = a.y + HOEHE / 2, x2 = b.x, y2 = b.y + HOEHE / 2, mx = (x1 + x2) / 2;
      const cls = r.isDone(n.id) ? 'done' : r.isDone(v) && !n.bald ? 'open' : 'later';
      return `<path class="${cls}" d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`;
    })).join('');

    const cards = nodes.map((n) => {
      const p = pos(n), st = r.status(n);
      const fremd = n.voraussetzungen.map((v) => r.node(v)!).filter((v) => v.baum !== this.tab);
      return `<button type="button" class="node ${st} ${this.selected === n.id ? 'sel' : ''}" data-node="${esc(n.id)}"
        style="left:${p.x}px;top:${p.y}px;width:${BREITE}px;height:${HOEHE}px">
        <span class="icon">${n.icon}</span>
        <span class="name">${esc(n.name)}</span>
        <small>${esc(this.label(n, st))}</small>
        ${fremd.length ? `<span class="fremd" title="Voraussetzung aus einem anderen Baum">↖ ${esc(fremd.map((v) => v.name).join(', '))}</span>` : ''}
      </button>`;
    }).join('');

    this.el.innerHTML = `
      <header><h2>Forschung</h2><span class="ideen" title="Ideen sammeln sich mit jeder XP an">💡 ${r.ideen} Ideen</span>
        <button type="button" class="close" aria-label="${esc(this.content.text('schliessen'))}">✕</button></header>
      <div class="tabs" role="tablist">${r.settings.baeume.map((b) => {
        const bereit = r.nodes.filter((n) => n.baum === b.id && r.status(n) === 'bereit').length;
        return `<button type="button" role="tab" data-baum="${esc(b.id)}" aria-selected="${b.id === this.tab}">${b.icon} ${esc(b.name)}${bereit ? ` <span class="badge">${bereit}</span>` : ''}</button>`;
      }).join('')}</div>
      <p class="lead">Mit jeder Erfahrung kommen dir neue Ideen. Damit schaltest du Produktlinien, Maschinen und Bauteile frei – ganz in deinem Tempo.</p>
      <div class="tree-scroll"><div class="tree" style="width:${w}px;height:${h}px">
        <svg width="${w}" height="${h}" aria-hidden="true">${lines}</svg>${cards}
      </div></div>
      ${this.detail()}`;
  }

  private label(n: ResearchNode, st: NodeStatus): string {
    switch (st) {
      case 'erforscht': return '✓ erforscht';
      case 'bald': return 'kommt bald';
      case 'voraussetzung': return `🔒 ${n.kosten} 💡`;
      case 'level': return `ab Level ${n.level} · ${n.kosten} 💡`;
      default: return `${n.kosten} 💡`;
    }
  }

  private detail(): string {
    const n = this.selected ? this.research.node(this.selected) : undefined;
    if (!n) return '<div class="detail empty">Wähle eine Karte aus, um zu sehen, was sie freischaltet.</div>';
    const st = this.research.status(n);
    const c = this.content;
    const frei = [
      ...n.schaltetFrei.bau.filter((id) => !c.bau.get(id).ausgeblendet).map((id) => c.bau.get(id).name),
      ...n.schaltetFrei.rezepte.map((id) => `Rezept: ${c.rezepte.get(id).name}`),
      ...n.schaltetFrei.kategorien.map((id) => `Sortiment: ${c.kategorien.get(id).name}`),
    ];
    const fehlt = n.voraussetzungen.filter((v) => !this.research.isDone(v)).map((v) => this.research.node(v)!.name);
    const action = st === 'erforscht' ? '<span class="badge good">Erforscht</span>'
      : st === 'bald' ? '<span class="badge">Kommt in einer der nächsten Versionen</span>'
        : st === 'voraussetzung' ? `<span class="badge">Erst erforschen: ${esc(fehlt.join(', '))}</span>`
          : st === 'level' ? `<span class="badge">Ab Level ${n.level}</span>`
            : `<button type="button" class="primary" data-erforschen="${esc(n.id)}" ${st === 'ideen' ? 'disabled' : ''}>Erforschen · ${n.kosten} 💡</button>`
              + (st === 'ideen' ? ` <small>Noch ${n.kosten - this.research.ideen} Ideen</small>` : '');
    return `<div class="detail">
      <span class="icon">${n.icon}</span>
      <div><b>${esc(n.name)}</b><p>${esc(n.beschreibung)}</p>
        ${frei.length ? `<ul>${frei.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</div>
      <div class="action">${action}</div>
    </div>`;
  }
}
