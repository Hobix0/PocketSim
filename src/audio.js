// Kleine Klangkulisse mit WebAudio: Kassenklingeln, Schnurren, Regen, Erfolgsglöckchen.
// Startet erst nach der ersten Nutzereingabe (Browser-Regel) und lässt sich abschalten.
let ctx = null, master = null, rainGain = null, lastDing = 0;
export const audio = { on: true };

function ensure() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}

function tone(freq, start, dur, type = 'sine', vol = 0.3) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  o.connect(g); g.connect(master);
  o.start(start); o.stop(start + dur + 0.05);
}

function noiseBuffer(seconds) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export const sound = {
  unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
  ding() {
    if (!audio.on || !ensure()) return;
    const t = ctx.currentTime;
    if (t - lastDing < 0.35) return;
    lastDing = t;
    tone(1318, t, 0.35, 'triangle', 0.12);
    tone(1760, t + 0.07, 0.4, 'triangle', 0.09);
  },
  chime() {
    if (!audio.on || !ensure()) return;
    const t = ctx.currentTime;
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.09, 0.6, 'sine', 0.14));
  },
  purr() {
    if (!audio.on || !ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(1.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 220;
    const g = ctx.createGain();
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 24; lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    g.gain.setValueAtTime(0.3, t);
    g.gain.linearRampToValueAtTime(0, t + 1.1);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t); lfo.start(t); src.stop(t + 1.2); lfo.stop(t + 1.2);
  },
  click() {
    if (!audio.on || !ensure()) return;
    tone(520, ctx.currentTime, 0.08, 'triangle', 0.08);
  },
  // Regenrauschen ein- oder ausblenden
  rain(on) {
    if (!ensure()) return;
    if (!rainGain) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(2);
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass'; hp.frequency.value = 1400; hp.Q.value = 0.4;
      rainGain = ctx.createGain();
      rainGain.gain.value = 0;
      src.connect(hp); hp.connect(rainGain); rainGain.connect(master);
      src.start();
    }
    rainGain.gain.setTargetAtTime(on && audio.on ? 0.12 : 0, ctx.currentTime, 0.8);
  },
};
