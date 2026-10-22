import type { World } from '../ecs/World';
import { ShelfComponent } from '../components/ShelfComponent';
import type { Plots, PlotDef } from './Plots';

// Lage (Stadt): Jeder weitere eigene Laden – gekauft oder gemietet, mit Ware im Regal – bringt mehr Kundschaft.
// Wie viel, hängt von der Größe, der Lage (belebte Einkaufsstraße, ruhige Wohnstraße, Stadtrand) und einem
// Parkplatz ab. Der Hauptladen zählt 1. Werte: data/stadt/standard.json → "lage".

export interface LocationSettings {
  groesse: Record<string, number>;
  parkplatz: number;
  lagen: Record<string, { kunden: number; text: string }>;
}

export class Locations {
  constructor(private readonly world: World, private readonly plots: Plots, readonly settings: LocationSettings) {}

  /** Wie viel Kundschaft dieser Laden bringen kann (unabhängig davon, ob er dir gehört) */
  potential(p: PlotDef): number {
    const a = p.angebot;
    if (!a) return 0;
    const s = this.settings;
    return (s.groesse[a.groesse] ?? 0.4) * (s.lagen[a.lage]?.kunden ?? 1) * (a.parkplatz ? s.parkplatz : 1);
  }

  /** Beschreibung der Lage */
  text(p: PlotDef): string {
    return p.angebot ? this.settings.lagen[p.angebot.lage]?.text ?? '' : '';
  }

  /** Läuft dort ein Laden? (dir gehört es und ein Regal mit Ware steht darin) */
  active(p: PlotDef): boolean {
    if (!p.angebot || !this.plots.isOwned(p.id)) return false;
    const r = p.rect;
    for (const [e, s] of this.world.query(ShelfComponent)) {
      const q = e.object.position;
      if (s.bestand > 0 && q.x > r.minX && q.x < r.maxX && q.z > r.minZ && q.z < r.maxZ) return true;
    }
    return false;
  }

  /** Faktor für den Kundenstrom: 1 + alle laufenden weiteren Läden */
  factor(): number {
    return 1 + this.plots.list.reduce((n, p) => n + (this.active(p) ? this.potential(p) : 0), 0);
  }
}
