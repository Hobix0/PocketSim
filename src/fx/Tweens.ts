// Kleine Übergänge („Tweens“) für Bewegungen: ein Wert läuft in einer Zeit von 0 nach 1,
// eine Kurve (Easing) gibt dem Verlauf Schwung – z. B. leicht über das Ziel hinaus und zurück.
// Läuft in echter Zeit (auch in der Pause), damit Bauen und Menüs immer lebendig wirken.

export type Easing = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inCubic: (t: number) => t ** 3,
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  /** Schießt etwas über das Ziel hinaus und federt zurück */
  outBack: (t: number) => { const c = 1.70158, c3 = c + 1; return 1 + c3 * (t - 1) ** 3 + c * (t - 1) ** 2; },
  /** Federt nach (wie ein Gummiball) */
  outElastic: (t: number) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
} satisfies Record<string, Easing>;

interface Tween {
  zeit: number;
  dauer: number;
  verzoegerung: number;
  easing: Easing;
  step: (v: number) => void;
  done?: () => void;
}

export class Tweens {
  private list: Tween[] = [];

  /** Startet einen Übergang; `step` bekommt den Wert nach der Kurve (meist 0 → 1) */
  add(dauer: number, step: (v: number) => void, opts: { easing?: Easing; verzoegerung?: number; done?: () => void } = {}): void {
    this.list.push({ zeit: 0, dauer: Math.max(1e-3, dauer), verzoegerung: opts.verzoegerung ?? 0, easing: opts.easing ?? ease.outCubic, step, done: opts.done });
  }

  get count(): number {
    return this.list.length;
  }

  update(dt: number): void {
    if (!this.list.length) return;
    const next: Tween[] = [];
    for (const t of this.list) {
      if (t.verzoegerung > 0) { t.verzoegerung -= dt; next.push(t); continue; }
      t.zeit += dt;
      const p = Math.min(1, t.zeit / t.dauer);
      t.step(t.easing(p));
      if (p < 1) next.push(t);
      else t.done?.();
    }
    this.list = next;
  }
}

/** Winkel weich nachführen (kürzester Weg, unabhängig von der Bildrate) */
export function dampAngle(from: number, to: number, lambda: number, dt: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + d * (1 - Math.exp(-lambda * dt));
}

/** Zahl weich nachführen (unabhängig von der Bildrate) */
export function damp(from: number, to: number, lambda: number, dt: number): number {
  return from + (to - from) * (1 - Math.exp(-lambda * dt));
}
