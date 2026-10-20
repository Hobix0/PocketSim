// Kleiner Ereignis-Verteiler. Systeme melden Änderungen, statt dass andere
// jeden Frame nachfragen müssen (z. B. HUD hört auf Änderungen der Welt).
//
// Beispiel:
//   const events = new Emitter<{ geldGeaendert: number }>();
//   const off = events.on('geldGeaendert', (betrag) => ...);
//   events.emit('geldGeaendert', 120);
//   off(); // abmelden

export class Emitter<Events extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(name: K, handler: (payload: Events[K]) => void): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(handler as (payload: never) => void);
    return () => set.delete(handler as (payload: never) => void);
  }

  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    for (const handler of this.handlers.get(name) ?? []) (handler as (p: Events[K]) => void)(payload);
  }
}
