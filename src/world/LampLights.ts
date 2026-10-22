import * as THREE from 'three';
import type { World } from '../ecs/World';
import { LampComponent } from '../components/LampComponent';

// Echte Lichtquellen für Lampen. Es gibt eine feste Zahl davon (aus data/licht): Jede Lichtquelle in
// three.js kostet Rechenzeit, und eine wechselnde Zahl würde die Shader jedes Mal neu übersetzen.
//
// Lampen, die nah beieinander hängen, werden gebündelt: Eine Gruppe bekommt EINE Lichtquelle in ihrer Mitte.
// Ihre Helligkeit wächst gedämpft (stärkste Lampe + ein kleiner Anteil der übrigen, mit Obergrenze),
// die Reichweite wächst mit der Größe der Gruppe. So brennen zehn Leuchten an einer Schiene nicht
// weiß aus, und die wenigen Lichtquellen reichen für viel mehr Fläche.
// Die Lichtquellen wandern zu den Gruppen, die der Kamera am nächsten sind; ungenutzte bleiben dunkel.

export interface LampBundling {
  /** Lampen in diesem Abstand (m) teilen sich ein Licht */
  abstand: number;
  /** Anteil, den jede weitere Lampe zur Helligkeit beiträgt (0 = nur die stärkste) */
  zusatz: number;
  /** Höchstens so hell wie die stärkste Lampe × dieser Faktor */
  maxFaktor: number;
  /** So weit (m) unter den Leuchten sitzt das Licht */
  tiefer?: number;
  /** Wie schnell das Licht abfällt (2 = physikalisch, kleiner = weicher, weniger grelle Flecken nah an Wänden) */
  abfall?: number;
}

interface Group {
  /** Erste Lampe der Gruppe: Wer näher als `abstand` daran hängt, gehört dazu */
  anker: THREE.Vector3;
  /** Mitte aller Lampen der Gruppe (dort sitzt das Licht) */
  pos: THREE.Vector3;
  farbe: THREE.Color;
  staerke: number;
  summe: number;
  reichweite: number;
  radius: number;
  n: number;
}

export class LampLights {
  private readonly lights: THREE.PointLight[] = [];
  private timer = 0;
  /** Zuletzt gebildete Gruppen (für Tests und die Debug-Anzeige) */
  gruppen = 0;

  constructor(scene: THREE.Scene, private readonly world: World, anzahl: number, private readonly buendeln: LampBundling = { abstand: 2.6, zusatz: 0.2, maxFaktor: 1.8 }) {
    for (let i = 0; i < anzahl; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 5, buendeln.abfall ?? 2);
      l.castShadow = false;
      this.lights.push(l);
      scene.add(l);
    }
  }

  /** `focus`: wo die Kamera hinschaut; `staerke`: Faktor (nachts heller) */
  update(dt: number, focus: THREE.Vector3, staerke: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const groups = this.group(focus);
    this.gruppen = groups.length;
    const b = this.buendeln;
    this.lights.forEach((light, i) => {
      const g = groups[i];
      if (!g) { light.intensity = 0; return; }
      // Etwas unter die Leuchten: Sie strahlen nach unten, und direkt an der Decke gäbe es grelle Flecken
      light.position.copy(g.pos).setY(Math.max(0.5, g.pos.y - (this.buendeln.tiefer ?? 0)));
      light.color.copy(g.farbe);
      light.distance = g.reichweite + g.radius;
      const hell = Math.min(g.staerke * b.maxFaktor, g.staerke + (g.summe - g.staerke) * b.zusatz);
      light.intensity = hell * staerke;
    });
  }

  /** Lampen zu Gruppen zusammenfassen, die nächsten zur Kamera zuerst */
  private group(focus: THREE.Vector3): Group[] {
    const lamps = [...this.world.query(LampComponent)].map(([, l]) => ({ l, pos: l.worldPosition(new THREE.Vector3()) }));
    lamps.sort((a, b) => a.pos.distanceToSquared(focus) - b.pos.distanceToSquared(focus));
    const groups: Group[] = [];
    const max2 = this.buendeln.abstand ** 2;
    for (const { l, pos } of lamps) {
      const d = l.def;
      let g = groups.find((x) => x.anker.distanceToSquared(pos) <= max2);
      if (!g) {
        if (groups.length >= this.lights.length) continue; // weiter weg gibt es kein Licht mehr
        g = { anker: pos.clone(), pos: pos.clone(), farbe: new THREE.Color(0, 0, 0), staerke: 0, summe: 0, reichweite: 0, radius: 0, n: 0 };
        groups.push(g);
      }
      // Mitte als Durchschnitt, Farbe nach Stärke gemischt
      g.n++;
      g.pos.lerp(pos, 1 / g.n);
      g.farbe.add(new THREE.Color(d.farbe).multiplyScalar(d.staerke));
      g.summe += d.staerke;
      g.staerke = Math.max(g.staerke, d.staerke);
      g.reichweite = Math.max(g.reichweite, d.reichweite);
      g.radius = Math.max(g.radius, g.anker.distanceTo(pos));
    }
    for (const g of groups) g.farbe.multiplyScalar(1 / Math.max(1e-6, g.summe));
    return groups;
  }
}
