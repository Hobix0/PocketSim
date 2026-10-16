import type { Component } from '../ecs/Component';

// Komponenten können Zeilen für das Info-Fenster beisteuern.
// So zeigt das Fenster automatisch alles an, was eine Entity kann –
// eine neue Komponente bringt ihre Zeilen einfach selbst mit.

export interface InfoRow {
  label: string;
  value: string;
}

export interface Describable {
  describe(): InfoRow[];
}

export function isDescribable(c: Component): c is Component & Describable {
  return typeof (c as Partial<Describable>).describe === 'function';
}
