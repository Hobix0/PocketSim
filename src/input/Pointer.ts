import * as THREE from 'three';

// Wo steht der Mauszeiger über der Spielfläche?
// Wird von allen geteilt, die unter den Zeiger schauen (Feld-Markierung, Interaktion, Tooltip).

export class Pointer {
  /** Position in Gerätekoordinaten (-1 … 1), so wie der Raycaster sie braucht. */
  readonly ndc = new THREE.Vector2();
  /** Position in Pixeln relativ zum Fenster, z. B. für Tooltips. */
  readonly screen = new THREE.Vector2();
  /** Ist der Zeiger gerade über der Spielfläche (und nicht über einem Fenster)? */
  inside = false;

  attach(surface: HTMLElement): void {
    surface.addEventListener('pointermove', (e) => {
      const r = surface.getBoundingClientRect();
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.screen.set(e.clientX, e.clientY);
      this.inside = true;
    });
    surface.addEventListener('pointerleave', () => { this.inside = false; });
  }
}
