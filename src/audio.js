// Kleine Synthesizer-Effekte über WebAudio – keine Audiodateien nötig.
let ctx = null, master = null;
export const audio = { enabled: true };

function ensure() {
  if (!audio.enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, type = 'sine', vol = 1, slide = 0, delay = 0) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.5, freq = 800) {
  const c = ensure();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

export function sound(name) {
  switch (name) {
    case 'click': tone(880, 0.06, 'triangle', 0.4); break;
    case 'place': tone(220, 0.12, 'square', 0.25, 0.6); noise(0.08, 0.4, 1200); break;
    case 'delete': noise(0.25, 0.6, 500); tone(160, 0.2, 'sawtooth', 0.15, 0.5); break;
    case 'rotate': tone(520, 0.05, 'triangle', 0.3, 1.3); break;
    case 'error': tone(180, 0.15, 'square', 0.2); tone(140, 0.2, 'square', 0.2, 1, 0.08); break;
    case 'money': tone(1320, 0.08, 'triangle', 0.35); tone(1760, 0.18, 'triangle', 0.35, 1, 0.07); break;
    case 'success': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.35, 1, i * 0.08)); break;
    case 'event': tone(440, 0.2, 'sine', 0.3); tone(660, 0.3, 'sine', 0.3, 1, 0.12); break;
    case 'warn': tone(300, 0.12, 'triangle', 0.3); break;
    case 'ui': tone(1200, 0.03, 'sine', 0.2); break;
  }
}
