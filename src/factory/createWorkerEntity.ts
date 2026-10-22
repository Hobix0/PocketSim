import { Entity } from '../ecs/Entity';
import { FigureComponent } from '../components/FigureComponent';
import { SelectableComponent } from '../components/SelectableComponent';
import { WorkerComponent, type WorkerServices } from '../components/WorkerComponent';
import { CashierComponent, type CashierServices } from '../components/CashierComponent';
import { BuyerComponent, type BuyerServices } from '../components/BuyerComponent';
import { PalletDriverComponent, type PalletDriverServices } from '../components/PalletDriverComponent';
import type { Employee } from '../economy/Staff';
import type { FactoryContext } from './FactoryContext';
import { lookFromSeed } from '../voxel/figure';

// Eine angestellte Person als Spielfigur. Das Verhalten kommt aus der Rolle
// (data/personal/rollen.json → "verhalten"); je Verhalten gibt es eine Komponente.

type Common = 'rollenName' | 'text';

export interface StaffServices {
  auffuellen: Omit<WorkerServices, Common>;
  /** Lageristen: LKW abladen, lose Kartons einlagern */
  abladen: Omit<WorkerServices, Common>;
  kassieren: Omit<CashierServices, Common>;
  /** Barista: Café-Tresen besetzen, Bestellungen zubereiten und kassieren */
  bedienen?: Omit<CashierServices, Common>;
  /** Staplerfahrer: Paletten mit Gabelstapler und Hubwagen */
  paletten?: Omit<PalletDriverServices, Common>;
  /** Auffüller: Paletten mit dem Hubwagen ans Regal, Kartons mit dem Rollwagen */
  auffuellenFahrzeuge?: Omit<PalletDriverServices, Common>;
  /** Einkäufer: zum Einkaufsterminal gehen, dort nachbestellen */
  einkaufen: Omit<BuyerServices, Common>;
}

export function createWorkerEntity(employee: Employee, services: StaffServices, ctx: FactoryContext): Entity {
  const { content } = ctx;
  const rolle = content.rollen[employee.rolle];
  const entity = new Entity('personal');
  entity.object.position.set(...content.personal.startPunkt);
  // Oberteil in der Farbe der Rolle, der Rest ergibt sich aus der Personalnummer
  entity.add(new FigureComponent(lookFromSeed(content.figuren, employee.id, rolle.farbe), content.figuren.kantenlaenge));
  entity.add(new SelectableComponent('personal', employee.name, rolle.name));
  const common = { rollenName: rolle.name, text: (k: string, v?: Record<string, string | number>) => content.text(k, v) };
  if (rolle.verhalten === 'kassieren') entity.add(new CashierComponent(employee, { ...services.kassieren, ...common }));
  else if (rolle.verhalten === 'bedienen') entity.add(new CashierComponent(employee, { ...(services.bedienen ?? services.kassieren), ...common }));
  else if (rolle.verhalten === 'einkaufen') entity.add(new BuyerComponent(employee, { ...services.einkaufen, ...common }));
  else if (rolle.verhalten === 'paletten' && services.paletten) entity.add(new PalletDriverComponent(employee, { ...services.paletten, ...common }));
  else if (rolle.verhalten === 'abladen') entity.add(new WorkerComponent(employee, { ...services.abladen, ...common }));
  else {
    // Auffüller: trägt einzelne Kartons oder nimmt Hubwagen bzw. Rollwagen – immer nur eins zur Zeit
    let fahrer: PalletDriverComponent | null = null;
    const worker = new WorkerComponent(employee, { ...services.auffuellen, ...common, busyElsewhere: () => !!fahrer?.busy });
    entity.add(worker);
    if (services.auffuellenFahrzeuge) {
      fahrer = new PalletDriverComponent(employee, { ...services.auffuellenFahrzeuge, ...common, busyElsewhere: () => worker.state !== 'wartet' });
      entity.add(fahrer);
    }
  }
  return entity;
}

/** Status-Text der Person (für das Personal-Fenster), egal welches Verhalten sie hat. */
export function staffStatus(entity: Entity | undefined): string | undefined {
  const fahrer = entity?.get(PalletDriverComponent);
  if (fahrer?.busy) return fahrer.statusText();
  return (entity?.get(WorkerComponent) ?? entity?.get(CashierComponent) ?? entity?.get(BuyerComponent) ?? fahrer)?.statusText();
}
