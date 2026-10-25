import * as THREE from 'three';

// Tageswetter: sonnig, bewölkt oder Regen. Jeden Morgen wird das Wetter für morgen ausgewürfelt, damit der
// Tagesbericht eine Vorhersage zeigen kann. Bei Regen fallen Tropfen um die Kamera herum, das Licht wird
// gedämpfter, es rauscht leise – und es kommen etwas weniger Kunden. Werte: data/wetter/standard.json.

export interface WeatherKind {
  id: string;
  name: string;
  symbol: string;
  chance: number;
  kunden: number;
  licht: number;
  regen: number;
}

export interface WeatherSettings {
  arten: WeatherKind[];
  tropfen: { anzahl: number; bereich: number; hoehe: number; tempo: number; laenge: number; farbe: string };
}

export class Weather {
  private heuteId: string;
  private morgenId: string;
  /** Weicher Übergang der Regenstärke (0–1) */
  private regenJetzt = 0;
  private drops: THREE.InstancedMesh | null = null;

  constructor(private readonly settings: WeatherSettings, private readonly random: () => number = Math.random) {
    // Der erste Tag ist freundlich
    this.heuteId = settings.arten[0].id;
    this.morgenId = this.roll();
  }

  get heute(): WeatherKind {
    return this.kind(this.heuteId);
  }

  get morgen(): WeatherKind {
    return this.kind(this.morgenId);
  }

  /** Faktor auf den Kundenstrom */
  get kundenFaktor(): number {
    return this.heute.kunden;
  }

  /** Faktor auf Sonne und Umgebungslicht (gleitet beim Wetterwechsel) */
  get lichtFaktor(): number {
    const regen = this.settings.arten.find((a) => a.regen > 0);
    const l = this.heute.licht;
    // Während der Regen einsetzt oder aufhört, wird es allmählich dunkler bzw. heller
    return regen && this.heute.regen === 0 ? l + (regen.licht - l) * this.regenJetzt : l;
  }

  /** Aktuelle Regenstärke (für Tropfen und Rauschen) */
  get regen(): number {
    return this.regenJetzt;
  }

  /** Neuer Tag: die Vorhersage tritt ein, eine neue wird gewürfelt */
  newDay(): void {
    this.heuteId = this.morgenId;
    this.morgenId = this.roll();
  }

  private kind(id: string): WeatherKind {
    return this.settings.arten.find((a) => a.id === id) ?? this.settings.arten[0];
  }

  private roll(): string {
    const sum = this.settings.arten.reduce((s, a) => s + a.chance, 0);
    let r = this.random() * sum;
    for (const a of this.settings.arten) { r -= a.chance; if (r <= 0) return a.id; }
    return this.settings.arten[0].id;
  }

  /** Regen: Tropfen fallen in einem Bereich um den Blickpunkt (`focus`) */
  update(dt: number, scene: THREE.Object3D, focus: THREE.Vector3): void {
    const ziel = this.heute.regen;
    this.regenJetzt += (ziel - this.regenJetzt) * Math.min(1, dt * 0.25);
    if (Math.abs(ziel - this.regenJetzt) < 0.002) this.regenJetzt = ziel;
    const t = this.settings.tropfen;
    if (this.regenJetzt <= 0.01) { if (this.drops) this.drops.visible = false; return; }
    if (!this.drops) this.makeDrops(scene);
    const drops = this.drops!;
    drops.visible = true;
    drops.count = Math.round(t.anzahl * this.regenJetzt);
    const half = t.bereich / 2;
    for (let i = 0; i < drops.count; i++) {
      const p = this.pos[i];
      p.y -= t.tempo * dt;
      p.x += 0.6 * dt; // etwas Wind
      // Unten angekommen oder aus dem Bereich geraten: oben über dem Blickpunkt neu
      // (neue Tropfen verteilen sich über die ganze Höhe, damit sie nicht als Schicht fallen)
      if (p.y < 0 || Math.abs(p.x - focus.x) > half || Math.abs(p.z - focus.z) > half) {
        const neu = p.y < -10;
        p.set(focus.x + (this.random() - 0.5) * t.bereich, p.y < 0 && !neu ? t.hoehe : this.random() * t.hoehe, focus.z + (this.random() - 0.5) * t.bereich);
      }
      this.m.makeTranslation(p.x, p.y, p.z);
      drops.setMatrixAt(i, this.m);
    }
    drops.instanceMatrix.needsUpdate = true;
    (drops.material as THREE.MeshBasicMaterial).opacity = 0.55 * this.regenJetzt;
  }

  private readonly pos: THREE.Vector3[] = [];
  private readonly m = new THREE.Matrix4();

  private makeDrops(scene: THREE.Object3D): void {
    const t = this.settings.tropfen;
    // Dünne, leicht schräge Stäbchen
    const geo = new THREE.BoxGeometry(0.018, t.laenge, 0.018);
    geo.applyMatrix4(new THREE.Matrix4().makeRotationZ(-0.06));
    const mat = new THREE.MeshBasicMaterial({ color: t.farbe, transparent: true, opacity: 0.5, depthWrite: false, fog: true });
    this.drops = new THREE.InstancedMesh(geo, mat, t.anzahl);
    this.drops.frustumCulled = false;
    this.drops.renderOrder = 20;
    for (let i = 0; i < t.anzahl; i++) this.pos.push(new THREE.Vector3(0, -50, 0));
    scene.add(this.drops);
  }

  state(): { heute: string; morgen: string } {
    return { heute: this.heuteId, morgen: this.morgenId };
  }

  restore(raw: unknown): void {
    const d = raw as { heute?: unknown; morgen?: unknown } | undefined;
    const ok = (v: unknown): v is string => typeof v === 'string' && this.settings.arten.some((a) => a.id === v);
    if (ok(d?.heute)) { this.heuteId = d.heute; this.regenJetzt = this.heute.regen; }
    if (ok(d?.morgen)) this.morgenId = d.morgen;
  }
}
