import type { World } from '../ecs/World';
import { ShelfComponent } from '../components/ShelfComponent';
import { CheckoutComponent } from '../components/CheckoutComponent';
import { SeatComponent } from '../components/SeatComponent';
import type { Plots, PlotDef } from './Plots';

// Standorte (Stadt): Jeder eigene Laden ist ein Standort mit eigener Kundschaft, eigenen Kassen und
// eigenem Sortiment (was in seinen Regalen steht). Der Hauptladen umfasst die Ladenfläche und ihre
// Erweiterungen (Anbauten, Hof, Gewerbehof); jedes gekaufte oder gemietete Ladenlokal ist ein weiterer
// Standort. Zentrallager und Produktionshallen sind keine Läden. Gehwege gehören niemandem.

export const HAUPTLADEN = 'haupt';
/** Grundstücke, die zum Hauptladen gehören */
const HAUPT_PLOTS = ['laden', 'ost', 'west', 'hof', 'gewerbehof'];

export type SiteKind = 'supermarkt' | 'cafe' | 'mode' | 'leer';

export interface Site {
  id: string;
  name: string;
  plot?: PlotDef;
}

interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

export class Sites {
  /** Heute: Umsatz und Kunden je Standort */
  private readonly heute = new Map<string, { umsatz: number; kunden: number }>();

  constructor(private readonly plots: Plots, private readonly world: World) {}

  /** Eigene Läden: der Hauptladen und jedes eigene Ladenlokal (ohne Industrie) */
  list(): Site[] {
    const out: Site[] = [{ id: HAUPTLADEN, name: 'Hauptladen' }];
    for (const p of this.plots.list) {
      if (p.angebot && !p.angebot.art && this.plots.isOwned(p.id)) out.push({ id: p.id, name: p.name, plot: p });
    }
    return out;
  }

  private rects(id: string): Rect[] {
    if (id === HAUPTLADEN) {
      // Ohne Grundstücke im Level (Testgelände) ist alles Hauptladen
      if (!this.plots.active) return [{ minX: -1e9, maxX: 1e9, minZ: -1e9, maxZ: 1e9 }];
      return this.plots.list.filter((p) => HAUPT_PLOTS.includes(p.id) && this.plots.isOwned(p.id)).map((p) => p.rect);
    }
    const p = this.plots.list.find((x) => x.id === id);
    return p && this.plots.isOwned(id) ? [p.rect] : [];
  }

  /** Zu welchem Standort gehört dieser Punkt? null: Gehweg, Straße, fremd oder Industrie */
  at(x: number, z: number): string | null {
    const inside = (r: Rect) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
    for (const s of this.list()) if (s.id !== HAUPTLADEN && this.rects(s.id).some(inside)) return s.id;
    return this.rects(HAUPTLADEN).some(inside) ? HAUPTLADEN : null;
  }

  /** Mitte eines Standorts (Welt) */
  center(id: string): { x: number; z: number } {
    const rs = this.rects(id);
    if (!rs.length || !this.plots.active) return { x: 0, z: 0 };
    const r = rs[0];
    return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
  }

  name(id: string): string {
    return this.list().find((s) => s.id === id)?.name ?? 'Hauptladen';
  }

  /** Was für ein Laden ist das? Nach dem, was in den Regalen und an den Tresen steht */
  kind(id: string): SiteKind {
    const n: Record<string, number> = { cafe: 0, mode: 0, supermarkt: 0 };
    for (const [e, s] of this.world.query(ShelfComponent)) {
      if (this.at(e.object.position.x, e.object.position.z) !== id) continue;
      for (const f of s.faecher) {
        if (!f.produkt || f.menge <= 0) continue;
        const k = f.produkt.kategorie;
        n[k === 'cafe' || k === 'kuchen' ? 'cafe' : k === 'mode' || k === 'accessoires' || k === 'schuhe' ? 'mode' : 'supermarkt'] += f.menge;
      }
    }
    for (const [e] of this.world.query(SeatComponent)) if (this.at(e.object.position.x, e.object.position.z) === id) n.cafe += 5;
    const best = (Object.entries(n) as [SiteKind, number][]).sort((a, b) => b[1] - a[1])[0];
    return best[1] > 0 ? best[0] : 'leer';
  }

  /** Kassen und Bedientresen eines Standorts */
  checkouts(id: string): number {
    let k = 0;
    for (const [e] of this.world.query(CheckoutComponent)) if (this.at(e.object.position.x, e.object.position.z) === id) k++;
    return k;
  }

  // ── Heute ────────────────────────────────────────────────

  recordSale(id: string, betrag: number): void {
    const h = this.heute.get(id) ?? { umsatz: 0, kunden: 0 };
    h.umsatz += betrag;
    h.kunden++;
    this.heute.set(id, h);
  }

  today(id: string): { umsatz: number; kunden: number } {
    return this.heute.get(id) ?? { umsatz: 0, kunden: 0 };
  }

  newDay(): void {
    this.heute.clear();
  }
}
