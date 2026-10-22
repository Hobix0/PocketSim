import * as THREE from 'three';
import { Component } from '../ecs/Component';
import { Entity } from '../ecs/Entity';
import type { World } from '../ecs/World';
import type { ModelProvider } from '../assets/ModelLibrary';
import { FigureComponent } from '../components/FigureComponent';
import { lookFromSeed, type FigureSettings } from '../voxel/figure';
import type { LevelLife } from './Level';
import { turnTowards } from '../navigation/PathFollower';

// Leben in der Welt – alles reine Stimmung, ohne Einfluss auf die Wirtschaft:
//   Passanten schlendern über den Gehweg (manche mit Hund, manche bleiben am Schaufenster stehen),
//   Autos fahren auf beiden Spuren (nachts mit Scheinwerfern), Tauben picken und fliegen auf, wenn jemand
//   kommt, ab und zu zieht ein Vogelschwarm vorbei, Schmetterlinge tanzen um die Lavendelkübel,
//   und Wolkenschatten ziehen über alles hinweg.
// Wo das passiert, sagt das Level (Eintrag "leben"); wie viel, steht in data/leben/standard.json.

export interface AmbienceSettings {
  an: boolean;
  passanten: { proStunde: number[]; max: number; tempo: { min: number; max: number }; hund: number; schauen: number; schauenSekunden: { min: number; max: number } };
  autos: { proStunde: number[]; max: number; tempo: { min: number; max: number }; abstand: number; modelle: string[] };
  tauben: { anzahl: number; fluchtAbstand: number; zurueckSekunden: number };
  vogelschwarm: { alleMinuten: number; anzahl: number; hoehe: number };
  schmetterlinge: { jeKuebel: number; farben: string[] };
  wolken: { an: boolean; dichte: number; tempo: number; hoehe: number; groesse: number };
  geraeusche: { vogelAlleSekunden: number; grilleAlleSekunden: number };
  /** Gedankenblasen der Kunden: Wahrscheinlichkeit je Anlass und Textvorlagen ({produkt}, {preis}) */
  gedanken: { fehlt: number; zu_teuer: number; schnaeppchen: number; gluecklich: number; texte: Record<string, string[]> };
}

export interface AmbienceEvents {
  /** Für Geräusche: ein Auto fährt los, ein Vogel singt, Grillen zirpen, Tauben fliegen auf */
  sound(name: 'auto' | 'vogel' | 'grille' | 'tauben'): void;
}

const rand = (r: { min: number; max: number }) => r.min + Math.random() * (r.max - r.min);

// ── Passanten ───────────────────────────────────────────────────

/** Geht geradeaus über den Gehweg, bleibt vielleicht am Schaufenster stehen, verschwindet am Ende */
class PasserComponent extends Component {
  private stehen = 0;
  private geschaut = false;
  hund: THREE.Object3D | null = null;
  private hundPhase = Math.random() * 6;

  constructor(private readonly ziel: THREE.Vector3, private readonly tempo: number, private readonly fenster: THREE.Vector3 | null, private readonly schauen: number) {
    super();
  }

  private einblenden = 0;

  override update(dt: number): void {
    if (dt <= 0) return;
    const o = this.entity.object;
    // Am Gehwegende auftauchen bzw. verschwinden: kurz wachsen und schrumpfen
    this.einblenden = Math.min(1, this.einblenden + dt * 2.5);
    const rest = Math.hypot(this.ziel.x - o.position.x, this.ziel.z - o.position.z);
    const k = Math.min(this.einblenden, this.fenster && !this.geschaut ? 1 : Math.min(1, rest / 0.6));
    o.scale.setScalar(Math.max(0.01, k));
    if (this.hund) this.hund.scale.setScalar(Math.max(0.01, k));
    if (this.stehen > 0) {
      // Zum Schaufenster schauen (−Z), dann weiter
      this.stehen -= dt;
      turnTowards(o, Math.PI, dt, 4);
      this.moveDog(dt, false);
      return;
    }
    const target = this.fenster && !this.geschaut ? this.fenster : this.ziel;
    const d = new THREE.Vector3(target.x - o.position.x, 0, target.z - o.position.z);
    const len = d.length();
    if (len < 0.08) {
      if (target === this.fenster) { this.geschaut = true; this.stehen = this.schauen; return; }
      this.entity.world?.remove(this.entity);
      return;
    }
    const step = Math.min(len, this.tempo * dt);
    o.position.addScaledVector(d.divideScalar(len), step);
    turnTowards(o, Math.atan2(d.x, d.z), dt, 8);
    this.moveDog(dt, true);
  }

  /** Der Hund trottet seitlich versetzt hinterher und wackelt mit dem Schwanz */
  private moveDog(dt: number, laeuft: boolean): void {
    const h = this.hund;
    if (!h) return;
    const o = this.entity.object;
    const seit = new THREE.Vector3(Math.cos(o.rotation.y), 0, -Math.sin(o.rotation.y));
    const goal = o.position.clone().addScaledVector(seit, 0.55).addScaledVector(new THREE.Vector3(Math.sin(o.rotation.y), 0, Math.cos(o.rotation.y)), -0.2);
    h.position.lerp(goal, Math.min(1, dt * 5));
    h.rotation.y = o.rotation.y - Math.PI / 2; // Modell schaut nach +X
    this.hundPhase += dt * (laeuft ? 14 : 3);
    h.position.y = goal.y + (laeuft ? Math.abs(Math.sin(this.hundPhase)) * 0.03 : 0);
    h.rotation.z = laeuft ? 0 : Math.sin(this.hundPhase) * 0.04;
  }

  override onDetach(): void {
    if (this.hund) this.hund.parent?.remove(this.hund);
  }
}

// ── Autos ───────────────────────────────────────────────────────

interface Car {
  obj: THREE.Object3D;
  spur: number;
  richtung: 1 | -1;
  tempo: number;
  ziel: number;
  lichter: THREE.Object3D[];
}

// ── Tauben, Vögel, Schmetterlinge ───────────────────────────────

interface Pigeon {
  obj: THREE.Object3D;
  heim: THREE.Vector3;
  zustand: 'pickt' | 'fliegt' | 'weg';
  zeit: number;
  vel: THREE.Vector3;
}

interface Butterfly {
  obj: THREE.Group;
  mitte: THREE.Vector3;
  phase: number;
  tempo: number;
}

export class Ambience {
  private passanten = 0;
  private autoAcc = 0;
  private passantAcc = 0;
  private readonly cars: Car[] = [];
  private readonly pigeons: Pigeon[] = [];
  private readonly butterflies: Butterfly[] = [];
  private flock: { group: THREE.Group; vel: THREE.Vector3; zeit: number } | null = null;
  private flockTimer = 10;
  private vogelTimer = 3;
  private seed = 1000;
  private readonly clouds: THREE.Mesh | null = null;
  private readonly cloudTex: THREE.CanvasTexture | null = null;
  private readonly root = new THREE.Group();
  private kuebelZahl = -1;

  constructor(
    scene: THREE.Scene,
    private readonly world: World,
    private readonly models: ModelProvider | undefined,
    private readonly figuren: FigureSettings,
    private readonly wege: LevelLife | undefined,
    readonly settings: AmbienceSettings,
    private readonly events: AmbienceEvents,
  ) {
    this.root.name = 'Leben';
    scene.add(this.root);
    if (settings.wolken.an) {
      // Wolkenschatten: eine unsichtbare Fläche hoch oben, die nur Schatten wirft (Textur mit weichen Löchern)
      const tex = this.cloudTexture();
      this.cloudTex = tex;
      const w = settings.wolken;
      // Beidseitig: Im Schattendurchgang zeichnet three.js sonst nur die Rückseite (und die zeigt nach unten)
      const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0, side: THREE.DoubleSide });
      this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(w.groesse, w.groesse).rotateX(-Math.PI / 2), mat);
      this.clouds.position.y = w.hoehe;
      this.clouds.castShadow = true;
      this.clouds.receiveShadow = false;
      this.clouds.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
      this.clouds.name = 'Wolkenschatten';
      this.root.add(this.clouds);
    }
    if (wege && models) for (let i = 0; i < Math.min(settings.tauben.anzahl, wege.tauben.length); i++) this.addPigeon(new THREE.Vector3(...wege.tauben[i]));
  }

  /**
   * @param dt Simulationszeit (s), 0 in der Pause
   * @param minuteOfDay Uhrzeit für die Tageskurven
   * @param nacht 0 = Tag, 1 = Nacht (Scheinwerfer, Grillen statt Vögel)
   */
  update(dt: number, minuteOfDay: number, nacht: number, realDt: number): void {
    if (!this.settings.an) { this.root.visible = false; return; }
    this.root.visible = true;
    this.updateClouds(realDt, nacht);
    if (dt <= 0 || !this.wege || !this.models) return;
    const stunde = Math.floor(minuteOfDay / 60) % 24;
    const minuten = dt / 60; // 1 Simulationssekunde = 1 Spielminute
    this.spawnPassers(stunde, dt);
    this.spawnCars(stunde, dt, nacht);
    this.moveCars(dt, nacht);
    this.updatePigeons(dt);
    this.updateFlock(dt, minuten, nacht);
    this.updateButterflies(dt, nacht);
    // Geräusche: tagsüber Vögel, nachts Grillen
    this.vogelTimer -= realDt;
    if (this.vogelTimer <= 0) {
      const g = this.settings.geraeusche;
      if (nacht > 0.6) { this.events.sound('grille'); this.vogelTimer = g.grilleAlleSekunden * (0.6 + Math.random() * 0.8); }
      else { if (Math.random() < 1 - nacht) this.events.sound('vogel'); this.vogelTimer = g.vogelAlleSekunden * (0.5 + Math.random()); }
    }
  }

  // ── Passanten ───────────────────────────────────────────────────

  private spawnPassers(stunde: number, dt: number): void {
    const p = this.settings.passanten, w = this.wege!;
    this.passanten = [...this.world.query(PasserComponent)].length;
    this.passantAcc += (p.proStunde[stunde] ?? 0) * (dt / 60) * (0.5 + Math.random());
    while (this.passantAcc >= 1) {
      this.passantAcc -= 1;
      if (this.passanten >= p.max) { this.passantAcc = 0; break; }
      const links = Math.random() < 0.5;
      const z = w.gehweg.z[0] + Math.random() * (w.gehweg.z[1] - w.gehweg.z[0]);
      const start = new THREE.Vector3(links ? w.gehweg.x[0] : w.gehweg.x[1], w.gehweg.y, z);
      const ziel = new THREE.Vector3(links ? w.gehweg.x[1] : w.gehweg.x[0], w.gehweg.y, z);
      const schaut = Math.random() < p.schauen && w.schaufenster.length;
      const f = schaut ? w.schaufenster[Math.floor(Math.random() * w.schaufenster.length)] : null;
      const fenster = f ? new THREE.Vector3(f[0] + (Math.random() - 0.5) * 0.8, w.gehweg.y, f[1] + Math.random() * 0.3) : null;
      const e = new Entity('passant');
      e.object.position.copy(start);
      e.object.rotation.y = links ? Math.PI / 2 : -Math.PI / 2;
      e.add(new FigureComponent(lookFromSeed(this.figuren, this.seed++), this.figuren.kantenlaenge));
      const passer = e.add(new PasserComponent(ziel, rand(p.tempo), fenster, rand(p.schauenSekunden)));
      this.world.add(e);
      this.passanten++;
      if (Math.random() < p.hund) {
        void this.models!.instance('eigen/hund').then((h) => {
          if (!e.world) return;
          h.position.copy(start);
          this.root.add(h);
          passer.hund = h;
        });
      }
    }
  }

  // ── Autos ───────────────────────────────────────────────────────

  private spawnCars(stunde: number, dt: number, nacht: number): void {
    const a = this.settings.autos, w = this.wege!;
    this.autoAcc += (a.proStunde[stunde] ?? 0) * (dt / 60) * (0.5 + Math.random());
    if (this.autoAcc < 1) return;
    this.autoAcc -= 1;
    if (this.cars.length >= a.max || !w.spuren.length) return;
    const spur = w.spuren[Math.floor(Math.random() * w.spuren.length)];
    const startX = spur.richtung > 0 ? w.strasse.x[0] : w.strasse.x[1];
    // Nicht direkt auf ein anderes Auto setzen
    if (this.cars.some((c) => c.spur === spur.z && Math.abs(c.obj.position.x - startX) < a.abstand * 1.5)) return;
    const pfad = a.modelle[Math.floor(Math.random() * a.modelle.length)];
    const car: Car = { obj: new THREE.Group(), spur: spur.z, richtung: spur.richtung, tempo: rand(a.tempo), ziel: spur.richtung > 0 ? w.strasse.x[1] : w.strasse.x[0], lichter: [] };
    car.obj.position.set(startX, w.strasse.y, spur.z);
    car.obj.rotation.y = spur.richtung > 0 ? 0 : Math.PI;
    this.root.add(car.obj);
    this.cars.push(car);
    void this.models!.instance(pfad).then((m) => {
      car.obj.add(m);
      // Scheinwerfer und Rücklichter als leuchtende Flächen (glühen nachts im Bloom)
      const box = new THREE.Box3().setFromObject(m);
      const vorn = box.max.x - car.obj.position.x, hinten = box.min.x - car.obj.position.x;
      const mk = (x: number, z: number, farbe: string) => {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.28), new THREE.MeshBasicMaterial({ color: farbe }));
        l.position.set(x, 0.48, z);
        car.obj.add(l);
        car.lichter.push(l);
      };
      for (const z of [-0.6, 0.6]) { mk(Math.abs(vorn) + 0.01, z, '#fff6d0'); mk(-Math.abs(hinten) - 0.01, z, '#ff4a3a'); }
      for (const l of car.lichter) l.visible = nacht > 0.4;
    });
    this.events.sound('auto');
  }

  private moveCars(dt: number, nacht: number): void {
    const a = this.settings.autos;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      // Vorausfahrendes Auto auf derselben Spur: abbremsen
      let tempo = c.tempo;
      for (const o of this.cars) {
        if (o === c || o.spur !== c.spur) continue;
        const vor = (o.obj.position.x - c.obj.position.x) * c.richtung;
        if (vor > 0 && vor < a.abstand) tempo = Math.min(tempo, o.tempo * (vor / a.abstand));
      }
      c.obj.position.x += c.richtung * tempo * dt;
      for (const l of c.lichter) l.visible = nacht > 0.4;
      if ((c.ziel - c.obj.position.x) * c.richtung <= 0) {
        this.root.remove(c.obj);
        this.cars.splice(i, 1);
      }
    }
  }

  // ── Tauben ──────────────────────────────────────────────────────

  private addPigeon(heim: THREE.Vector3): void {
    const p: Pigeon = { obj: new THREE.Group(), heim, zustand: 'pickt', zeit: Math.random() * 5, vel: new THREE.Vector3() };
    p.obj.position.copy(heim);
    p.obj.rotation.y = Math.random() * Math.PI * 2;
    this.root.add(p.obj);
    this.pigeons.push(p);
    void this.models!.instance('eigen/taube').then((m) => p.obj.add(m));
  }

  private updatePigeons(dt: number): void {
    const t = this.settings.tauben;
    const leute = [...this.world.query(FigureComponent)].map(([e]) => e.object.position);
    for (const p of this.pigeons) {
      p.zeit += dt;
      if (p.zustand === 'pickt') {
        // Kopf nicken (ganze Taube kippt kurz), ab und zu ein Trippelschritt
        p.obj.rotation.x = 0;
        p.obj.rotation.z = Math.max(0, Math.sin(p.zeit * 5)) * 0.35;
        if (Math.random() < dt * 0.3) { p.obj.rotation.y += (Math.random() - 0.5) * 1.5; p.obj.position.x += (Math.random() - 0.5) * 0.1; p.obj.position.z += (Math.random() - 0.5) * 0.1; }
        const nah = leute.some((q) => Math.hypot(q.x - p.obj.position.x, q.z - p.obj.position.z) < t.fluchtAbstand);
        if (nah) {
          p.zustand = 'fliegt';
          p.zeit = 0;
          p.vel.set((Math.random() - 0.5) * 3, 3.2, 1.5 + Math.random() * 2);
          this.events.sound('tauben');
        }
      } else if (p.zustand === 'fliegt') {
        p.vel.y -= 0.6 * dt;
        p.obj.position.addScaledVector(p.vel, dt);
        p.obj.rotation.y = Math.atan2(p.vel.z, p.vel.x) * -1;
        p.obj.scale.y = 1 + Math.sin(p.zeit * 30) * 0.4; // Flügelschlag
        if (p.zeit > 4) { p.zustand = 'weg'; p.zeit = 0; p.obj.visible = false; }
      } else if (p.zeit > t.zurueckSekunden) {
        // Wieder da, als wäre nichts gewesen
        p.zustand = 'pickt';
        p.zeit = 0;
        p.obj.visible = true;
        p.obj.scale.y = 1;
        p.obj.position.copy(p.heim).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6));
      }
    }
  }

  // ── Vogelschwarm ────────────────────────────────────────────────

  private updateFlock(dt: number, minuten: number, nacht: number): void {
    const v = this.settings.vogelschwarm;
    if (!this.flock) {
      this.flockTimer -= minuten;
      if (this.flockTimer > 0 || nacht > 0.5) return;
      this.flockTimer = v.alleMinuten * (0.6 + Math.random() * 0.8);
      const group = new THREE.Group();
      const geo = new THREE.BoxGeometry(0.18, 0.04, 0.5);
      const mat = new THREE.MeshStandardMaterial({ color: '#3a3f46' });
      for (let i = 0; i < v.anzahl; i++) {
        const b = new THREE.Mesh(geo, mat);
        // V-Formation
        const reihe = Math.ceil(i / 2), seite = i % 2 ? 1 : -1;
        b.position.set(-reihe * 0.9, Math.random() * 0.3, seite * reihe * 0.8);
        group.add(b);
      }
      const links = Math.random() < 0.5;
      group.position.set(links ? -35 : 35, v.hoehe, (Math.random() - 0.5) * 20);
      const vel = new THREE.Vector3(links ? 5 : -5, 0, (Math.random() - 0.5) * 1.5);
      group.rotation.y = Math.atan2(-vel.z, vel.x);
      this.root.add(group);
      this.flock = { group, vel, zeit: 0 };
      return;
    }
    const f = this.flock;
    f.zeit += dt;
    f.group.position.addScaledVector(f.vel, dt);
    f.group.children.forEach((b, i) => { b.scale.z = 0.6 + Math.abs(Math.sin(f.zeit * 9 + i)) * 0.6; });
    if (Math.abs(f.group.position.x) > 40) { this.root.remove(f.group); this.flock = null; }
  }

  // ── Schmetterlinge ──────────────────────────────────────────────

  private updateButterflies(dt: number, nacht: number): void {
    const s = this.settings.schmetterlinge;
    const kuebel = [...this.world.all()].filter((e) => e.typeId === 'lavendelkuebel');
    if (kuebel.length !== this.kuebelZahl) {
      // Neu verteilen, wenn Kübel gebaut oder abgerissen wurden
      this.kuebelZahl = kuebel.length;
      for (const b of this.butterflies) this.root.remove(b.obj);
      this.butterflies.length = 0;
      for (const k of kuebel) for (let i = 0; i < s.jeKuebel; i++) {
        const farbe = s.farben[Math.floor(Math.random() * s.farben.length)];
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: farbe, side: THREE.DoubleSide, emissive: farbe, emissiveIntensity: 0.15 });
        for (const seite of [-1, 1]) {
          const w = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.06), mat);
          w.position.x = seite * 0.035;
          w.rotation.x = -Math.PI / 2;
          g.add(w);
        }
        this.root.add(g);
        this.butterflies.push({ obj: g, mitte: k.object.position.clone().setY(k.object.position.y + 0.9), phase: Math.random() * 10, tempo: 0.6 + Math.random() * 0.5 });
      }
    }
    for (const b of this.butterflies) {
      b.obj.visible = nacht < 0.5;
      b.phase += dt * b.tempo;
      const t = b.phase;
      // Verschlungene Bahn um den Kübel, mal höher, mal tiefer
      b.obj.position.set(b.mitte.x + Math.sin(t * 1.3) * 0.45 + Math.sin(t * 3.1) * 0.08, b.mitte.y + Math.sin(t * 2.2) * 0.25, b.mitte.z + Math.cos(t * 0.9) * 0.4);
      b.obj.rotation.y = Math.atan2(Math.cos(t * 1.3), -Math.sin(t * 0.9));
      // Flügel schlagen
      const flap = Math.sin(t * 40) * 0.9;
      b.obj.children[0].rotation.z = flap;
      b.obj.children[1].rotation.z = -flap;
    }
  }

  // ── Wolkenschatten ──────────────────────────────────────────────

  private updateClouds(realDt: number, nacht: number): void {
    const c = this.clouds, tex = this.cloudTex;
    if (!c || !tex) return;
    // Nachts gibt es keine Sonne – dann auch keine Wolkenschatten
    c.castShadow = nacht < 0.6;
    tex.offset.x = (tex.offset.x + realDt * this.settings.wolken.tempo * 0.002) % 1;
    tex.offset.y = (tex.offset.y + realDt * this.settings.wolken.tempo * 0.0007) % 1;
  }

  /** Weiche Wolkenflecken: Alpha aus überlagertem Rauschen, Schwelle = Dichte */
  private cloudTexture(): THREE.CanvasTexture {
    const n = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(n, n);
    const blobs = Array.from({ length: 26 }, () => ({ x: Math.random() * n, y: Math.random() * n, r: 8 + Math.random() * 18 }));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let v = 0;
      for (const b of blobs) {
        // Nahtlos kachelbar: Abstand über den Rand hinweg
        const dx = Math.min(Math.abs(x - b.x), n - Math.abs(x - b.x)), dy = Math.min(Math.abs(y - b.y), n - Math.abs(y - b.y));
        v = Math.max(v, 1 - Math.hypot(dx, dy) / b.r);
      }
      const a = v > 1 - this.settings.wolken.dichte ? 255 : 0;
      const i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }
}
