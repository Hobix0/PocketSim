import type { World } from '../ecs/World';
import { ShelfComponent } from '../components/ShelfComponent';
import { CheckoutComponent } from '../components/CheckoutComponent';
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

  /** Läuft dort ein Laden? (dir gehört es, ein Regal mit Ware und eine Kasse oder ein Bedientresen stehen darin) */
  active(p: PlotDef): boolean {
    if (!p.angebot || p.angebot.art || !this.plots.isOwned(p.id)) return false;
    const r = p.rect;
    const drin = (x: number, z: number) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
    let ware = false;
    for (const [e, s] of this.world.query(ShelfComponent)) if (s.bestand > 0 && drin(e.object.position.x, e.object.position.z)) { ware = true; break; }
    if (!ware) return false;
    for (const [e] of this.world.query(CheckoutComponent)) if (drin(e.object.position.x, e.object.position.z)) return true;
    return false;
  }

  /** Faktor für den Kundenstrom: 1 + alle laufenden weiteren Läden */
  factor(): number {
    return 1 + this.plots.list.reduce((n, p) => n + (this.active(p) ? this.potential(p) : 0), 0);
  }
}
