// Klang des Spiels – alles live erzeugt mit WebAudio, ohne Audiodateien:
//   Töne: kurze Rezepte aus data/audio (Wellenform, Tonhöhe, Gleiten, Dauer, Filter), z. B. „bauen“, „kasse“
//   Musik: gemütlicher Lo-Fi-Loop, der sich selbst schreibt – Akkordfolgen mit weichem Pad, Bass auf
//          den Schlägen 1 und 3, eine Melodie aus der Pentatonik und ein leises Hi-Hat. Nachts ruhiger.
// Ein leichter Hall macht alles weicher. Der Browser erlaubt Ton erst nach dem ersten Klick oder Tastendruck.

export interface ToneDef {
  welle: OscillatorType | 'rauschen';
  frequenz?: number;
  bis?: number;
  dauer: number;
  lautstaerke: number;
  anschlag?: number;
  verzoegerung?: number;
  filter?: number;
}

export interface AudioSettings {
  lautstaerke: { musik: number; toene: number };
  hall: { dauer: number; anteil: number };
  toene: Record<string, ToneDef[]>;
  musik: {
    tempo: number;
    tempoNacht: number;
    akkorde: number[][][];
    tonleiter: number[];
    melodieDichte: number;
    melodieDichteNacht: number;
    hihat: number;
    pad: number;
    bass: number;
    melodie: number;
  };
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

export class AudioSystem {
  private ctx: BaseAudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private wet!: GainNode;
  private noise!: AudioBuffer;
  private stumm = false;
  musik: number;
  toene: number;
  /** 0 = Tag, 1 = Nacht (Musik wird langsamer und sparsamer) */
  nacht = 0;
  // Musik-Takt
  private nextBeat = 0;
  private beat = 0;
  private folge = 0;
  private timer: number | null = null;
  private letzteMelodie = 3;
  private readonly zuletzt = new Map<string, number>();

  constructor(private readonly settings: AudioSettings, private readonly random: () => number = Math.random) {
    this.musik = settings.lautstaerke.musik;
    this.toene = settings.lautstaerke.toene;
    // Erst mit einer Geste darf der Ton starten
    const start = () => { this.unlock(); window.removeEventListener('pointerdown', start); window.removeEventListener('keydown', start); };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
  }

  get bereit(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get istStumm(): boolean {
    return this.stumm;
  }

  setMusik(v: number): void {
    this.musik = v;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(this.stumm ? 0 : v, this.ctx.currentTime, 0.2);
  }

  setToene(v: number): void {
    this.toene = v;
    if (this.ctx) this.sfxGain.gain.setTargetAtTime(this.stumm ? 0 : v, this.ctx.currentTime, 0.05);
  }

  toggleStumm(): boolean {
    this.stumm = !this.stumm;
    this.setMusik(this.musik);
    this.setToene(this.toene);
    return this.stumm;
  }

  /** Einen Ton aus data/audio spielen. Derselbe Ton höchstens alle 40 ms (sonst knallt es bei vielen Kunden). */
  play(name: string, opts: { lauter?: number; hoeher?: number } = {}): void {
    const ctx = this.ctx;
    const def = this.settings.toene[name];
    if (!ctx || !def || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (this.zuletzt.get(name) ?? -1) < 0.04) return;
    this.zuletzt.set(name, now);
    const hoeher = opts.hoeher ?? 1 + (this.random() - 0.5) * 0.06;
    for (const t of def) this.tone(t, now + (t.verzoegerung ?? 0), this.sfxGain, (opts.lauter ?? 1), hoeher);
  }

  // ── Aufbau ──────────────────────────────────────────────────────

  /** Regenrauschen (Rauschen in Schleife durch einen Tiefpass), 0 = aus … 1 = kräftiger Regen */
  private regen: GainNode | null = null;

  setRegen(staerke: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (!this.regen) {
      if (staerke <= 0) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const tief = ctx.createBiquadFilter();
      tief.type = 'lowpass';
      tief.frequency.value = 1300;
      const hoch = ctx.createBiquadFilter();
      hoch.type = 'highpass';
      hoch.frequency.value = 250;
      this.regen = ctx.createGain();
      this.regen.gain.value = 0;
      src.connect(tief).connect(hoch).connect(this.regen).connect(this.sfxGain);
      src.start();
    }
    this.regen.gain.setTargetAtTime(Math.max(0, Math.min(1, staerke)) * 0.16, ctx.currentTime, 1.5);
  }

  private unlock(): void {
    if (this.ctx) { if (this.ctx instanceof AudioContext) void this.ctx.resume(); return; }
    let ctx: AudioContext;
    try { ctx = new AudioContext(); } catch { return; }
    this.setup(ctx);
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  /**
   * Hörprobe: `sekunden` Musik plus alle Töne nacheinander, ohne Lautsprecher berechnet (OfflineAudioContext).
   * Gibt den Klang als WAV-Datei (Blob) zurück – zum Anhören außerhalb des Spiels.
   */
  async renderDemo(sekunden = 30): Promise<Blob> {
    const rate = 44100;
    const off = new OfflineAudioContext(2, rate * sekunden, rate);
    const saved = { ctx: this.ctx, master: this.master, musicGain: this.musicGain, sfxGain: this.sfxGain, wet: this.wet, noise: this.noise, nextBeat: this.nextBeat, beat: this.beat };
    this.setup(off);
    // Musik für die ganze Dauer vorausplanen, die Töne ab der Hälfte im Abstand von 0,9 s
    const m = this.settings.musik;
    const achtel = 60 / m.tempo / 2;
    for (this.nextBeat = 0.1; this.nextBeat < sekunden - 1; this.beat++) {
      this.step(this.nextBeat, achtel);
      this.nextBeat += achtel * (this.beat % 2 ? 0.92 : 1.08);
    }
    Object.keys(this.settings.toene).forEach((name, i) => {
      for (const t of this.settings.toene[name]) this.tone(t, sekunden / 2 + i * 0.9 + (t.verzoegerung ?? 0), this.sfxGain, 1, 1);
    });
    const buf = await off.startRendering();
    Object.assign(this, saved);
    return wav(buf);
  }

  /** Klangweg aufbauen: Musik und Töne → (trocken + Hall) → Ausgang */
  private setup(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 1.4;
    this.master.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.musicGain.gain.value = this.stumm ? 0 : this.musik;
    this.sfxGain.gain.value = this.stumm ? 0 : this.toene;
    // Hall: Faltung mit einem selbst erzeugten, abklingenden Rauschen
    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(ctx, this.settings.hall.dauer);
    this.wet = ctx.createGain();
    this.wet.gain.value = this.settings.hall.anteil;
    for (const g of [this.musicGain, this.sfxGain]) { g.connect(this.master); g.connect(conv); }
    conv.connect(this.wet);
    this.wet.connect(this.master);
    // Rauschen für Hi-Hat, Staub, Puff
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nextBeat = ctx.currentTime + 0.2;
  }

  private impulse(ctx: BaseAudioContext, dauer: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * dauer);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    return buf;
  }

  /** Ein einzelner Ton mit weicher Hüllkurve */
  private tone(t: ToneDef, at: number, out: AudioNode, lauter: number, hoeher: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const anschlag = t.anschlag ?? 0.005;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(t.lautstaerke * lauter, at + anschlag);
    g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(anschlag + 0.01, t.dauer));
    let src: AudioScheduledSourceNode;
    if (t.welle === 'rauschen') {
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      n.playbackRate.value = hoeher;
      src = n;
    } else {
      const o = ctx.createOscillator();
      o.type = t.welle;
      const f = (t.frequenz ?? 440) * hoeher;
      o.frequency.setValueAtTime(f, at);
      if (t.bis) o.frequency.exponentialRampToValueAtTime(t.bis * hoeher, at + t.dauer);
      src = o;
    }
    let node: AudioNode = src;
    if (t.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = t.filter;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(out);
    src.start(at);
    src.stop(at + t.dauer + 0.05);
  }

  // ── Musik ───────────────────────────────────────────────────────

  /** Plant die nächsten Achtel voraus (der Takt bleibt so stabil, auch wenn das Spiel kurz hängt) */
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const m = this.settings.musik;
    const tempo = m.tempo + (m.tempoNacht - m.tempo) * this.nacht;
    const achtel = 60 / tempo / 2;
    // Nach einer Pause (Tab im Hintergrund) nicht alles nachholen
    if (this.nextBeat < ctx.currentTime - 0.5) this.nextBeat = ctx.currentTime + 0.05;
    while (this.nextBeat < ctx.currentTime + 0.35) {
      this.step(this.nextBeat, achtel);
      this.nextBeat += achtel * (this.beat % 2 ? 0.92 : 1.08); // leichter Swing
      this.beat++;
    }
  }

  private step(at: number, achtel: number): void {
    const m = this.settings.musik;
    const folge = m.akkorde[this.folge % m.akkorde.length];
    const takt = Math.floor(this.beat / 8) % folge.length;
    const imTakt = this.beat % 8;
    const akkord = folge[takt];
    const dunkel = 1 - this.nacht * 0.45;
    // Neuer Takt: weicher Akkord (Pad), Bass auf 1 und 3
    if (imTakt === 0) {
      for (const n of akkord) this.voice(midi(n), at, achtel * 8.5, m.pad, 'triangle', 900 * dunkel, 0.25);
      if (takt === folge.length - 1 && this.random() < 0.5) this.folge++;
    }
    if (imTakt === 0 || imTakt === 4) this.voice(midi(akkord[0] - 12), at, achtel * 3.5, m.bass, 'sine', 400, 0.02);
    // Hi-Hat leise auf den Achteln dazwischen
    if (imTakt % 2 === 1 && m.hihat > 0 && this.nacht < 0.7) this.hat(at, m.hihat * (imTakt === 3 || imTakt === 7 ? 1 : 0.6));
    // Melodie: kleine Schritte in der Tonleiter, mal Pause
    const dichte = m.melodieDichte + (m.melodieDichteNacht - m.melodieDichte) * this.nacht;
    if (this.random() < dichte) {
      const schritt = Math.round((this.random() - 0.5) * 4);
      this.letzteMelodie = Math.max(0, Math.min(m.tonleiter.length - 1, this.letzteMelodie + schritt));
      this.keys(midi(m.tonleiter[this.letzteMelodie]), at, achtel * (this.random() < 0.3 ? 3 : 1.6), m.melodie * dunkel);
    }
  }

  private voice(f: number, at: number, dauer: number, laut: number, welle: OscillatorType, filter: number, anschlag: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = welle;
    o.frequency.value = f;
    o.detune.value = (this.random() - 0.5) * 8;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = filter;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(laut, at + anschlag);
    g.gain.setTargetAtTime(0, at + dauer * 0.7, dauer * 0.15);
    o.connect(fl); fl.connect(g); g.connect(this.musicGain);
    o.start(at);
    o.stop(at + dauer + 0.5);
  }

  /** E-Piano-artig: Grundton plus leiser Oberton, schnell abklingend */
  private keys(f: number, at: number, dauer: number, laut: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(laut, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dauer + 0.4);
    for (const [mult, amp] of [[1, 1], [2, 0.25], [3, 0.08]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const a = ctx.createGain();
      a.gain.value = amp;
      o.connect(a); a.connect(g);
      o.start(at);
      o.stop(at + dauer + 0.5);
    }
    g.connect(this.musicGain);
  }

  private hat(at: number, laut: number): void {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(laut, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    n.connect(f); f.connect(g); g.connect(this.musicGain);
    n.start(at, this.random() * 0.5);
    n.stop(at + 0.06);
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    if (this.ctx instanceof AudioContext) void this.ctx.close();
  }
}

/** AudioBuffer → WAV (16 Bit) */
function wav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels, len = buf.length;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) data.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, buf.sampleRate, true); data.setUint32(28, buf.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); str(36, 'data'); data.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, chans[c][i]));
    data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    o += 2;
  }
  return new Blob([data.buffer], { type: 'audio/wav' });
}
