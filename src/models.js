// Prozedurale Low-Poly-Modelle: Einrichtung, Figuren, Katze und Texturen.
// Jedes Möbel steht mit der Mitte seiner Grundfläche im Ursprung, Vorderseite zeigt nach +z.
// Wandobjekte hängen an der Rückkante (z = -d/2), Deckenobjekte hängen von der Decke.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, FURNITURE, paintHex } from './data.js';

const CEIL = CONFIG.floorHeight - 0.22;

// Leuchtende Materialien – der Renderer dreht sie abends auf
export const glowMats = new Set();

const mats = new Map();
export function mat(color, o = {}) {
  const key = `${color}|${o.r ?? 0.75}|${o.m ?? 0}|${o.e ?? ''}|${o.o ?? 1}|${o.ei ?? 1}|${o.g ? 1 : 0}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: o.r ?? 0.75, metalness: o.m ?? 0,
      transparent: (o.o ?? 1) < 1, opacity: o.o ?? 1, depthWrite: (o.o ?? 1) >= 1,
    });
    if (o.e) { m.emissive.set(o.e); m.emissiveIntensity = o.ei ?? 1; }
    if (o.g) { m.userData.glow = o.ei ?? 1; glowMats.add(m); }
    mats.set(key, m);
  }
  return m;
}

const geoCache = new Map();
const cached = (key, make) => {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
};
const boxGeo = (w, h, d) => cached(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const cylGeo = (rt, rb, h, s = 18) => cached(`c${rt}|${rb}|${h}|${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const sphGeo = (r, w = 14, h = 10) => cached(`s${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));

function mesh(geo, material, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
const M = (c, o) => (typeof c === 'string' ? mat(c, o) : c);
// Box mit Unterkante auf y
const box = (p, w, h, d, c, x, y, z, o) => mesh(boxGeo(w, h, d), M(c, o), x, y + h / 2, z, p);
const cyl = (p, rt, rb, h, c, x, y, z, o, s) => mesh(cylGeo(rt, rb, h, s), M(c, o), x, y + h / 2, z, p);
const sph = (p, r, c, x, y, z, o) => mesh(sphGeo(r), M(c, o), x, y, z, p);

// Farbe aufhellen / abdunkeln
const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  if (k > 0) c.lerp(new THREE.Color('#ffffff'), k); else c.lerp(new THREE.Color('#000000'), -k);
  return `#${c.getHexString()}`;
};

// ───────────── Texturen ─────────────

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(...repeat);
  return t;
}

// Kleiner deterministischer Zufall für Texturen
const noise = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const texCache = new Map();
export function texture(name, repeat, color) {
  const key = `${name}|${repeat}|${color}`;
  if (texCache.has(key)) return texCache.get(key);
  const T = TEX[name];
  const t = T ? canvasTex(T.w || 256, T.h || 256, (g, w, h) => T.draw(g, w, h, color), repeat) : null;
  texCache.set(key, t);
  return t;
}

const plank = (g, x, y, w, h, base, i) => {
  const c = new THREE.Color(base).offsetHSL(0, 0, (noise(i) - 0.5) * 0.08);
  g.fillStyle = `#${c.getHexString()}`;
  g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(40,25,10,0.35)';
  g.lineWidth = 1.5;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.strokeStyle = 'rgba(60,35,15,0.12)';
  for (let k = 0; k < 4; k++) {
    const yy = y + (noise(i * 7 + k) * h);
    g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy + (noise(i + k) - 0.5) * 3); g.stroke();
  }
};

const TEX = {
  // Böden (Kachel = 2 m)
  eiche: { draw: (g, w) => { for (let r = 0; r < 8; r++) for (let i = -1; i < 3; i++) plank(g, i * 128 + (r % 2) * 64, r * 32, 128, 32, '#b8875a', r * 9 + i); } },
  nuss: { draw: (g) => { for (let r = 0; r < 8; r++) for (let i = -1; i < 3; i++) plank(g, i * 128 + (r % 3) * 42, r * 32, 128, 32, '#6e4a30', r * 5 + i); } },
  dielen: { draw: (g) => { for (let r = 0; r < 5; r++) for (let i = -1; i < 2; i++) plank(g, i * 256 + (r % 2) * 110, r * 52 - 4, 256, 52, '#a07a52', r * 3 + i); } },
  fischgrat: {
    draw: (g, w, h) => {
      g.fillStyle = '#9a6c43'; g.fillRect(0, 0, w, h);
      for (let y = -64; y < h + 64; y += 32) for (let x = 0; x < w; x += 64) {
        for (const dir of [1, -1]) {
          g.save();
          g.translate(x + (dir > 0 ? 16 : 48), y + (x / 64) * 16);
          g.rotate(dir * Math.PI / 4);
          plank(g, -32, -8, 64, 16, '#b8875a', x + y * 3 + dir);
          g.restore();
        }
      }
    },
  },
  schachbrett: { draw: (g) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#2b2b2e' : '#ece6dc'; g.fillRect(x * 64, y * 64, 64, 64); g.strokeStyle = 'rgba(0,0,0,0.15)'; g.strokeRect(x * 64, y * 64, 64, 64); } } },
  terrazzo: {
    draw: (g, w, h) => {
      g.fillStyle = '#e8e1d6'; g.fillRect(0, 0, w, h);
      const cols = ['#c97f5a', '#7d8d72', '#3a3a3d', '#d8b46a', '#b8b0a4'];
      for (let i = 0; i < 520; i++) {
        g.fillStyle = cols[i % cols.length];
        g.beginPath(); g.ellipse(noise(i) * w, noise(i + 99) * h, 1 + noise(i + 5) * 4, 1 + noise(i + 7) * 3, noise(i + 3) * 3, 0, Math.PI * 2); g.fill();
      }
    },
  },
  cotto: {
    draw: (g) => {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const c = new THREE.Color('#b8653f').offsetHSL(0, 0, (noise(x * 4 + y) - 0.5) * 0.1);
        g.fillStyle = `#${c.getHexString()}`; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      }
      g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#d9cbb4'; g.fillRect(0, 0, 256, 256);
    },
  },
  beton: { draw: (g, w, h) => { g.fillStyle = '#9b968f'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) { const v = 130 + noise(i) * 40; g.fillStyle = `rgba(${v},${v},${v - 5},0.3)`; g.fillRect(noise(i + 1) * w, noise(i + 2) * h, 2, 2); } } },

  // Wände (Kachel = 2 m, Farbe kommt als Parameter)
  glatt: { w: 64, h: 64, draw: (g, w, h, c) => { g.fillStyle = c; g.fillRect(0, 0, w, h); } },
  streifen: { draw: (g, w, h, c) => { g.fillStyle = c; g.fillRect(0, 0, w, h); g.fillStyle = shade(c, -0.1); for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 14, h); g.fillStyle = shade(c, 0.25); for (let x = 20; x < w; x += 32) g.fillRect(x, 0, 2, h); } },
  karo: { draw: (g, w, h, c) => { g.fillStyle = c; g.fillRect(0, 0, w, h); g.fillStyle = shade(c, -0.12); for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 6, h); for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 6); } },
  laub: {
    draw: (g, w, h, c) => {
      g.fillStyle = c; g.fillRect(0, 0, w, h);
      const leafCols = [shade(c, -0.25), '#c8783a', '#b8483d', '#d0a03e'];
      for (let i = 0; i < 26; i++) {
        const x = (i % 5) * 52 + ((Math.floor(i / 5) % 2) * 26) + 10, y = Math.floor(i / 5) * 52 + 14;
        g.save(); g.translate(x, y); g.rotate(noise(i) * 6);
        g.fillStyle = leafCols[i % leafCols.length];
        g.beginPath(); g.moveTo(0, -12); g.quadraticCurveTo(10, -2, 0, 12); g.quadraticCurveTo(-10, -2, 0, -12); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(0, -10); g.lineTo(0, 14); g.stroke();
        g.restore();
      }
    },
  },
  holz: {
    draw: (g, w, h, c) => {
      for (let x = 0; x < w; x += 32) plank(g, x, 0, 32, h, c, x);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h);
    },
  },
  metro: {
    draw: (g, w, h, c) => {
      g.fillStyle = shade(c, -0.25); g.fillRect(0, 0, w, h);
      for (let r = 0; r < 16; r++) for (let i = -1; i < 5; i++) {
        g.fillStyle = shade(c, (noise(r * 9 + i) - 0.5) * 0.08);
        g.fillRect(i * 64 + (r % 2) * 32 + 2, r * 16 + 2, 60, 12);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(i * 64 + (r % 2) * 32 + 4, r * 16 + 3, 56, 3);
      }
    },
  },
  ziegel: {
    draw: (g, w, h, c) => {
      g.fillStyle = '#d6cbbb'; g.fillRect(0, 0, w, h);
      const base = c || '#b5644c';
      for (let r = 0; r < 16; r++) for (let i = -1; i < 5; i++) {
        g.fillStyle = shade(base, (noise(r * 31 + i * 17) - 0.5) * 0.25);
        g.fillRect(i * 64 + (r % 2) * 32 + 2, r * 16 + 2, 60, 12);
      }
    },
  },
  putz: { draw: (g, w, h, c) => { g.fillStyle = c; g.fillRect(0, 0, w, h); for (let i = 0; i < 1800; i++) { g.fillStyle = noise(i) > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'; g.fillRect(noise(i + 1) * w, noise(i + 2) * h, 2, 2); } } },

  // Umgebung
  asphalt: { w: 128, h: 128, draw: (g, w, h) => { g.fillStyle = '#3d3f43'; g.fillRect(0, 0, w, h); for (let i = 0; i < 1400; i++) { const v = 50 + noise(i) * 40; g.fillStyle = `rgb(${v},${v},${v + 3})`; g.fillRect(noise(i + 3) * w, noise(i + 4) * h, 1.5, 1.5); } } },
  gehweg: { w: 128, h: 128, draw: (g, w, h) => { g.fillStyle = '#b9b2a8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#9d968c'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); } } },
  wiese: {
    draw: (g, w, h) => {
      g.fillStyle = '#86935f'; g.fillRect(0, 0, w, h);
      const cols = ['#c8783a', '#b8483d', '#d0a03e', '#9a5a2a', '#7a8a4f'];
      for (let i = 0; i < 260; i++) {
        g.fillStyle = cols[i % cols.length];
        g.save(); g.translate(noise(i) * w, noise(i + 50) * h); g.rotate(noise(i + 9) * 6);
        g.beginPath(); g.ellipse(0, 0, 3, 1.6, 0, 0, Math.PI * 2); g.fill(); g.restore();
      }
    },
  },
  markise: { w: 128, h: 32, draw: (g, w, h, c) => { const [a, b] = (c || '#2f5d50|#f4ece0').split('|'); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 16, 0, 16, h); } } },
  buecher: {
    w: 128, h: 64,
    draw: (g, w, h) => {
      const cols = ['#7a2e2e', '#2e4d7a', '#3c6b3c', '#c9a227', '#5b3a6b', '#d36b3c', '#2b2b2b', '#e8e1d0'];
      let x = 0;
      while (x < w) { const bw = 5 + ((x * 7) % 6); g.fillStyle = cols[(x * 3) % cols.length]; g.fillRect(x, 6 + ((x * 5) % 8), bw - 1, h); x += bw; }
    },
  },
  teppich: {
    w: 128, h: 128,
    draw: (g, w, h, c) => {
      g.fillStyle = c; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#e8c98f'; g.lineWidth = 5; g.strokeRect(10, 10, w - 20, h - 20);
      g.lineWidth = 2; g.strokeRect(20, 20, w - 40, h - 40);
      g.fillStyle = shade(c, -0.35);
      g.beginPath(); g.moveTo(w / 2, 30); g.lineTo(w - 30, h / 2); g.lineTo(w / 2, h - 30); g.lineTo(30, h / 2); g.fill();
      g.fillStyle = '#e8c98f'; g.beginPath(); g.arc(w / 2, h / 2, 10, 0, Math.PI * 2); g.fill();
    },
  },
  berber: {
    w: 128, h: 128,
    draw: (g, w, h, c) => {
      g.fillStyle = c; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#3a3330'; g.lineWidth = 2.5;
      for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x + 16, y + 2); g.lineTo(x + 30, y + 16); g.lineTo(x + 16, y + 30); g.lineTo(x + 2, y + 16); g.closePath(); g.stroke(); }
    },
  },
  streifenteppich: { w: 128, h: 32, draw: (g, w, h, c) => { g.fillStyle = c; g.fillRect(0, 0, w, h); g.fillStyle = '#efe6d4'; for (let x = 6; x < w; x += 24) g.fillRect(x, 0, 6, h); g.fillStyle = shade(c, -0.3); g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); } },
  rund: { w: 128, h: 128, draw: (g, w, h, c) => { for (let r = 64; r > 0; r -= 10) { g.fillStyle = r % 20 ? c : shade(c, 0.25); g.beginPath(); g.arc(64, 64, r, 0, Math.PI * 2); g.fill(); } } },
  tafel: {
    w: 256, h: 128,
    draw: (g, w, h) => {
      g.fillStyle = '#26302b'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f2ead8'; g.textAlign = 'center';
      g.font = '600 22px Georgia, serif'; g.fillText('~ Herbstkarte ~', w / 2, 30);
      g.font = '15px Georgia, serif'; g.textAlign = 'left';
      ['Kürbis-Latte', 'Chai Latte', 'Heiße Schokolade', 'Apfelkuchen'].forEach((t, i) => g.fillText(`• ${t}`, 30, 58 + i * 19));
      g.fillStyle = '#d27537'; g.beginPath(); g.arc(214, 92, 14, 0, Math.PI * 2); g.fill();
    },
  },
  bild: {
    w: 128, h: 160,
    draw: (g, w, h, c) => {
      g.fillStyle = '#efe6d4'; g.fillRect(0, 0, w, h);
      g.fillStyle = shade(c, 0.35); g.fillRect(0, 0, w, h * 0.55);
      g.fillStyle = c; g.beginPath(); g.arc(w * 0.62, h * 0.32, 22, 0, Math.PI * 2); g.fill();
      g.fillStyle = shade(c, -0.3);
      g.beginPath(); g.moveTo(0, h * 0.7); g.quadraticCurveTo(w * 0.35, h * 0.45, w * 0.6, h * 0.62); g.quadraticCurveTo(w * 0.8, h * 0.72, w, h * 0.58); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      g.fillStyle = shade(c, -0.55); g.fillRect(0, h * 0.85, w, h * 0.15);
    },
  },
  neon: {
    w: 256, h: 96,
    draw: (g, w, h, c) => {
      g.clearRect(0, 0, w, h);
      g.font = 'italic 600 64px "Brush Script MT", Georgia, cursive'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = c; g.shadowBlur = 18; g.fillStyle = c; g.fillText('coffee', w / 2, h / 2);
      g.shadowBlur = 0; g.fillStyle = '#fff6e8'; g.fillText('coffee', w / 2, h / 2);
    },
  },
};

// Schild/Text als Textur
export function labelTexture(text, { w = 512, h = 128, bg = '#2f5d50', fg = '#f4ece0', font = '600 64px Georgia, serif', border } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20); }
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

// Materialien für Wände und Böden der Gestaltung
const surfaceCache = new Map();
export function wallMaterial(pattern, colorId) {
  const key = `w|${pattern}|${colorId}`;
  if (!surfaceCache.has(key)) {
    const hex = pattern === 'ziegel' ? shade(paintHex(colorId), -0.05) : pattern === 'beton' ? '#9b968f' : paintHex(colorId);
    const name = pattern === 'beton' ? 'beton' : pattern;
    const t = texture(name, null, hex);
    surfaceCache.set(key, new THREE.MeshStandardMaterial({ map: t, color: pattern === 'beton' ? paintHex(colorId) : '#ffffff', roughness: pattern === 'metro' ? 0.35 : 0.9 }));
  }
  return surfaceCache.get(key);
}
export function floorMaterial(id) {
  const key = `f|${id}`;
  if (!surfaceCache.has(key)) surfaceCache.set(key, new THREE.MeshStandardMaterial({ map: texture(id), roughness: id === 'schachbrett' || id === 'terrazzo' ? 0.45 : 0.8 }));
  return surfaceCache.get(key);
}
export function facadeMaterial(id, hex) {
  const key = `fa|${id}`;
  if (!surfaceCache.has(key)) {
    const t = id.startsWith('ziegel') ? texture('ziegel', null, hex) : texture('putz', null, hex);
    surfaceCache.set(key, new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 }));
  }
  return surfaceCache.get(key);
}
const texMat = (name, color, o = {}) => cached(`tm|${name}|${color}`, () => new THREE.MeshStandardMaterial({ map: texture(name, null, color), roughness: o.r ?? 0.9 }));

// ───────────── Farben ─────────────

const C = {
  wood: '#8a5a36', woodDark: '#5c3b22', woodLight: '#c4955f', oak: '#b07a47',
  marble: '#efebe4', steel: '#c9ccd1', black: '#26262a', cream: '#f4ece0', brass: '#c9a35a',
  leaf: '#4c8a3f', leafDark: '#356b2e', pot: '#c06a43', soil: '#3d2a1c', pumpkin: '#d9773a', straw: '#d8b25e',
};

// Blätterbüschel aus Ikosaedern
function bush(g, x, y, z, s, cols = [C.leaf, C.leafDark]) {
  const ico = cached('ico', () => new THREE.IcosahedronGeometry(0.2, 0));
  [[0, 0, 0, 1], [0.1, 0.13, 0.05, 0.75], [-0.1, 0.1, -0.06, 0.8], [0.02, 0.26, -0.02, 0.6]].forEach(([dx, dy, dz, k], i) => {
    const m = mesh(ico, mat(cols[i % cols.length], { r: 0.85 }), x + dx * s, y + dy * s, z + dz * s, g);
    m.scale.setScalar(k * s);
    m.rotation.set(i, i * 2, 0);
  });
}
function pot(g, c, r = 0.17, h = 0.32, x = 0, z = 0) {
  cyl(g, r, r * 0.76, h, c, x, 0, z, { r: 0.85 });
  cyl(g, r * 0.94, r * 0.94, 0.02, C.soil, x, h - 0.02, z);
}
function pumpkin(g, x, y, z, s, c = C.pumpkin) {
  const p = mesh(cached('pumpkin', () => { const gg = new THREE.SphereGeometry(0.16, 12, 8); gg.scale(1, 0.72, 1); return gg; }), mat(c, { r: 0.6 }), x, y + 0.115 * s, z, g);
  p.scale.setScalar(s);
  for (let i = 0; i < 4; i++) {
    const rib = mesh(cached('rib', () => { const gg = new THREE.SphereGeometry(0.162, 10, 6, 0, 0.35); gg.scale(1, 0.74, 1); return gg; }), mat(shade(c, -0.12), { r: 0.6 }), x, y + 0.115 * s, z, g);
    rib.rotation.y = i * Math.PI / 2;
    rib.scale.setScalar(s);
  }
  cyl(g, 0.015 * s, 0.02 * s, 0.07 * s, '#5a4a2a', x, y + 0.2 * s, z);
}
const flame = (g, x, y, z, s = 1) => {
  const f = mesh(cached('flame', () => new THREE.ConeGeometry(0.02, 0.06, 8)), mat('#ffd27a', { e: '#ffb347', ei: 1.4, g: true }), x, y + 0.03 * s, z, g);
  f.scale.setScalar(s);
  f.castShadow = false;
};

const BUILDERS = {
  // ── Theke & Ausstattung ──
  theke(g, c) {
    box(g, 2.0, 0.98, 0.7, c, 0, 0, 0.48);
    for (let i = 0; i < 4; i++) box(g, 0.44, 0.78, 0.02, shade(c, 0.12), -0.72 + i * 0.48, 0.1, 0.835);
    box(g, 2.08, 0.05, 0.8, C.marble, 0, 0.98, 0.46, { r: 0.35 });
    box(g, 0.34, 0.1, 0.28, C.black, -0.5, 1.03, 0.42, { r: 0.4 });
    const screen = box(g, 0.3, 0.2, 0.03, C.black, -0.5, 1.12, 0.36, { r: 0.3 });
    screen.rotation.x = -0.35;
    box(g, 0.26, 0.16, 0.005, '#7fd4c1', -0.5, 1.14, 0.38, { e: '#3aa08a', ei: 0.6 }).rotation.x = -0.35;
    for (let i = 0; i < 3; i++) cyl(g, 0.045, 0.035, 0.07, C.cream, 0.25, 1.03 + i * 0.07, 0.5, { r: 0.4 });
    cyl(g, 0.09, 0.09, 0.2, '#dfe9ea', 0.65, 1.03, 0.55, { r: 0.1, o: 0.5 });
    pumpkin(g, 0.9, 1.03, 0.62, 0.45);
    box(g, 2.0, 0.92, 0.32, shade(c, -0.1), 0, 0, -0.84);
    box(g, 2.0, 0.04, 0.36, C.marble, 0, 0.92, -0.84, { r: 0.35 });
    box(g, 2.0, 0.04, 0.24, C.woodLight, 0, 1.55, -0.9);
    for (let i = 0; i < 6; i++) cyl(g, 0.04, 0.035, 0.08, i % 2 ? C.cream : '#d9c7a5', -0.8 + i * 0.32, 1.59, -0.9, { r: 0.4 });
    box(g, 1.2, 0.55, 0.03, '#1f2421', 0, 1.75, -0.98, { r: 0.9 });
  },
  kaffeemaschine(g, c) {
    box(g, 0.92, 0.88, 0.62, C.wood, 0, 0, -0.08);
    box(g, 0.96, 0.04, 0.66, C.marble, 0, 0.88, -0.08, { r: 0.35 });
    box(g, 0.62, 0.38, 0.4, mat(C.steel, { r: 0.25, m: 0.85 }), -0.05, 0.92, -0.12);
    box(g, 0.62, 0.05, 0.42, mat(c, { r: 0.4, m: 0.3 }), -0.05, 1.3, -0.12);
    box(g, 0.64, 0.1, 0.02, mat(c, { r: 0.4, m: 0.3 }), -0.05, 1.1, 0.09);
    for (let i = 0; i < 2; i++) {
      cyl(g, 0.04, 0.04, 0.08, C.black, -0.2 + i * 0.3, 1.0, 0.1, { r: 0.4 });
      cyl(g, 0.03, 0.025, 0.05, C.cream, -0.2 + i * 0.3, 0.92, 0.12, { r: 0.4 });
    }
    cyl(g, 0.07, 0.07, 0.22, C.black, 0.33, 0.92, -0.05, { r: 0.4 });
    cyl(g, 0.09, 0.05, 0.16, '#7a5232', 0.33, 1.14, -0.05, { o: 0.75, r: 0.2 });
    for (let i = 0; i < 4; i++) cyl(g, 0.035, 0.03, 0.05, C.cream, -0.25 + i * 0.12, 1.35, -0.12, { r: 0.4 });
  },
  vitrine(g, c) {
    box(g, 1.9, 0.82, 0.78, c, 0, 0, 0);
    box(g, 1.94, 0.04, 0.82, C.marble, 0, 0.82, 0, { r: 0.35 });
    box(g, 1.86, 0.5, 0.72, '#dbe8ea', 0, 0.86, 0, { o: 0.28, r: 0.05 });
    box(g, 1.86, 0.02, 0.72, C.steel, 0, 1.36, 0, { m: 0.7, r: 0.3 });
    box(g, 1.8, 0.02, 0.66, '#fffbe9', 0, 1.33, 0, { e: '#ffe7b0', ei: 0.7 });
    const cake = (x, col) => { cyl(g, 0.15, 0.15, 0.1, '#f2dcb0', x, 0.86, 0.02); cyl(g, 0.152, 0.152, 0.025, col, x, 0.96, 0.02, { r: 0.5 }); };
    cake(-0.65, '#6b3b23'); cake(-0.25, '#c8783a');
    for (let i = 0; i < 3; i++) {
      const cr = mesh(cached('croissant', () => new THREE.TorusGeometry(0.06, 0.03, 8, 12, Math.PI)), mat('#d9a04a', { r: 0.6 }), 0.15 + i * 0.16, 0.89, 0.12 - i * 0.05, g);
      cr.rotation.x = -Math.PI / 2;
    }
    for (let i = 0; i < 3; i++) {
      cyl(g, 0.05, 0.04, 0.06, '#c9a36a', 0.65, 0.86, -0.2 + i * 0.16);
      sph(g, 0.055, i === 1 ? '#5b3423' : '#a8743f', 0.65, 0.95, -0.2 + i * 0.16);
    }
  },

  // ── Sitzen ──
  tisch(g, c) {
    cyl(g, 0.2, 0.22, 0.03, C.black, 0, 0, 0, { r: 0.4, m: 0.5 });
    cyl(g, 0.03, 0.03, 0.7, C.black, 0, 0.03, 0, { r: 0.4, m: 0.5 });
    cyl(g, 0.36, 0.36, 0.04, c, 0, 0.72, 0, { r: 0.3 }, 28);
    cyl(g, 0.025, 0.03, 0.08, '#e8e1d0', 0.08, 0.76, -0.06, { r: 0.4 });
    flame(g, 0.08, 0.84, -0.06, 0.7);
  },
  tisch_eckig(g, c) {
    box(g, 0.8, 0.05, 0.8, c, 0, 0.71, 0);
    for (const x of [-0.34, 0.34]) for (const z of [-0.34, 0.34]) box(g, 0.06, 0.71, 0.06, shade(c, -0.2), x, 0, z);
    cyl(g, 0.05, 0.04, 0.12, '#dfe9ea', 0, 0.76, 0, { o: 0.5, r: 0.1 });
    sph(g, 0.05, '#c8783a', 0, 0.9, 0);
  },
  tisch_lang(g, c) {
    box(g, 1.84, 0.05, 0.8, c, 0, 0.71, 0);
    for (const x of [-0.82, 0.82]) for (const z of [-0.32, 0.32]) box(g, 0.06, 0.71, 0.06, shade(c, -0.2), x, 0, z);
    box(g, 1.2, 0.01, 0.3, '#e8dcc4', 0, 0.76, 0, { r: 1 });
    pumpkin(g, -0.3, 0.77, 0, 0.4); pumpkin(g, 0.2, 0.77, 0.04, 0.32, '#e9e1cf');
    cyl(g, 0.025, 0.03, 0.1, '#e8e1d0', 0.5, 0.77, 0); flame(g, 0.5, 0.87, 0, 0.7);
  },
  stehtresen(g, c) {
    box(g, 1.9, 0.06, 0.6, c, 0, 1.04, 0);
    box(g, 1.6, 1.04, 0.14, shade(c, -0.15), 0, 0, 0);
    box(g, 1.7, 0.03, 0.4, '#26262a', 0, 0.2, 0.1, { m: 0.5, r: 0.4 });
    cyl(g, 0.04, 0.04, 0.16, '#dfe9ea', 0.6, 1.1, 0, { o: 0.5 });
  },
  stuhl(g, c) {
    const d = shade(c, -0.2);
    box(g, 0.42, 0.05, 0.42, c, 0, 0.44, 0);
    for (const x of [-0.18, 0.18]) for (const z of [-0.18, 0.18]) box(g, 0.04, 0.44, 0.04, d, x, 0, z);
    box(g, 0.42, 0.04, 0.04, d, 0, 0.85, -0.19);
    for (const x of [-0.18, 0.18]) box(g, 0.04, 0.42, 0.04, d, x, 0.48, -0.19);
    box(g, 0.36, 0.14, 0.02, c, 0, 0.68, -0.19);
  },
  polsterstuhl(g, c) {
    for (const x of [-0.18, 0.18]) for (const z of [-0.18, 0.18]) cyl(g, 0.02, 0.018, 0.4, C.woodDark, x, 0, z);
    box(g, 0.46, 0.1, 0.44, mat(c, { r: 0.95 }), 0, 0.38, 0);
    const back = box(g, 0.46, 0.46, 0.08, mat(c, { r: 0.95 }), 0, 0.46, -0.2);
    back.rotation.x = -0.12;
  },
  barhocker(g, c) {
    cyl(g, 0.2, 0.22, 0.03, c, 0, 0, 0, { m: 0.6, r: 0.35 });
    cyl(g, 0.025, 0.025, 0.72, c, 0, 0.03, 0, { m: 0.6, r: 0.35 });
    const ring = mesh(cached('footring', () => new THREE.TorusGeometry(0.15, 0.012, 6, 18)), mat(c, { m: 0.6, r: 0.35 }), 0, 0.3, 0, g);
    ring.rotation.x = Math.PI / 2;
    cyl(g, 0.19, 0.17, 0.06, C.woodLight, 0, 0.72, 0);
  },
  sessel(g, c) {
    const f = mat(c, { r: 0.95 });
    box(g, 0.78, 0.4, 0.74, f, 0, 0.06, 0);
    box(g, 0.66, 0.12, 0.6, mat(shade(c, 0.12), { r: 0.95 }), 0, 0.42, 0.06);
    box(g, 0.78, 0.5, 0.16, f, 0, 0.42, -0.3);
    for (const x of [-0.34, 0.34]) box(g, 0.12, 0.26, 0.7, f, x, 0.42, 0.02);
    for (const x of [-0.3, 0.3]) for (const z of [-0.28, 0.28]) cyl(g, 0.025, 0.02, 0.06, C.woodDark, x, 0, z);
    const blanket = box(g, 0.3, 0.02, 0.5, mat('#c8783a', { r: 1 }), 0.3, 0.64, -0.05);
    blanket.rotation.z = -0.5;
  },
  sofa(g, c) {
    const f = mat(c, { r: 0.95 });
    box(g, 1.9, 0.38, 0.8, f, 0, 0.06, 0);
    for (const x of [-0.45, 0.45]) box(g, 0.86, 0.12, 0.62, mat(shade(c, 0.12), { r: 0.95 }), x, 0.44, 0.07);
    box(g, 1.9, 0.48, 0.18, f, 0, 0.44, -0.31);
    for (const x of [-0.89, 0.89]) box(g, 0.14, 0.26, 0.78, f, x, 0.44, 0);
    box(g, 0.3, 0.26, 0.1, mat('#d0a03e', { r: 0.95 }), -0.6, 0.56, -0.18).rotation.z = 0.15;
    box(g, 0.28, 0.24, 0.1, mat('#b35a3b', { r: 0.95 }), 0.62, 0.56, -0.18).rotation.z = -0.12;
    for (const x of [-0.85, 0.85]) for (const z of [-0.33, 0.33]) cyl(g, 0.025, 0.02, 0.06, C.woodDark, x, 0, z);
  },
  bank(g, c) {
    box(g, 1.86, 0.06, 0.46, c, 0, 0.42, 0.04);
    for (const x of [-0.85, 0.85]) box(g, 0.08, 0.42, 0.42, shade(c, -0.2), x, 0, 0.04);
    box(g, 1.86, 0.45, 0.06, c, 0, 0.48, -0.2);
    for (const [x, col] of [[-0.45, '#a5b596'], [0.45, '#d0a03e']]) box(g, 0.78, 0.08, 0.4, mat(col, { r: 1 }), x, 0.48, 0.05);
  },
  bodenkissen(g, c) {
    const k = mesh(cached('kissen', () => { const gg = new THREE.CylinderGeometry(0.34, 0.36, 0.16, 16); return gg; }), mat(c, { r: 1 }), 0, 0.08, 0, g);
    k.scale.set(1, 1, 0.9);
    cyl(g, 0.05, 0.05, 0.02, shade(c, -0.2), 0, 0.16, 0);
  },

  // ── Raum ──
  trennwand(g, c) {
    const fr = mat(C.woodDark, { r: 0.6 });
    for (const x of [-0.95, 0, 0.95]) box(g, 0.05, 1.6, 0.06, fr, x, 0, 0);
    box(g, 1.95, 0.05, 0.06, fr, 0, 1.6, 0);
    for (const x of [-0.47, 0.47]) box(g, 0.88, 1.45, 0.03, mat(c, { r: 1 }), x, 0.1, 0);
    for (const x of [-0.95, 0.95]) box(g, 0.2, 0.03, 0.3, fr, x, 0, 0);
  },
  glaswand(g, c) {
    const fr = mat(c, { m: 0.6, r: 0.35 });
    box(g, 1.96, 0.06, 0.08, fr, 0, 0, 0);
    box(g, 1.96, 0.05, 0.06, fr, 0, 2.0, 0);
    for (let i = 0; i <= 4; i++) box(g, 0.04, 2.0, 0.06, fr, -0.96 + i * 0.48, 0.05, 0);
    for (const y of [0.7, 1.35]) box(g, 1.96, 0.03, 0.05, fr, 0, y, 0);
    box(g, 1.9, 1.94, 0.02, '#cfe0e6', 0, 0.06, 0, { o: 0.25, r: 0.05 });
  },
  palisade(g, c) {
    box(g, 1.96, 0.06, 0.2, shade(c, -0.25), 0, 0, 0);
    box(g, 1.96, 0.06, 0.2, shade(c, -0.25), 0, 2.3, 0);
    for (let i = 0; i < 14; i++) box(g, 0.07, 2.24, 0.12, mat(shade(c, (noise(i) - 0.5) * 0.1), { r: 0.8 }), -0.91 + i * 0.14, 0.06, 0);
    pot(g, '#e7dccb', 0.12, 0.24, 0.6, 0.32); bush(g, 0.6, 0.38, 0.32, 0.6);
  },
  pflanzwand(g, c) {
    box(g, 1.9, 0.6, 0.6, c, 0, 0, 0);
    box(g, 1.8, 0.04, 0.5, C.soil, 0, 0.58, 0);
    for (let i = 0; i < 5; i++) bush(g, -0.76 + i * 0.38, 0.75 + noise(i) * 0.2, (noise(i + 4) - 0.5) * 0.2, 1.1);
    for (let i = 0; i < 4; i++) {
      const s = mesh(cached('grass', () => new THREE.ConeGeometry(0.06, 0.9, 4)), mat('#5f8a3c', { r: 0.9 }), -0.6 + i * 0.4, 1.05, 0.1, g);
      s.rotation.z = (noise(i) - 0.5) * 0.4;
    }
  },
  raumregal(g, c) {
    const w = mat(c, { r: 0.7 });
    for (const x of [-0.93, -0.31, 0.31, 0.93]) box(g, 0.04, 1.8, 0.36, w, x, 0, 0);
    for (const y of [0, 0.6, 1.2, 1.78]) box(g, 1.9, 0.04, 0.36, w, 0, y, 0);
    const books = cached('booksMat', () => new THREE.MeshStandardMaterial({ map: texture('buecher'), roughness: 0.8 }));
    box(g, 0.56, 0.36, 0.26, books, -0.62, 0.04, 0);
    box(g, 0.56, 0.32, 0.26, books, 0.62, 1.24, 0);
    pot(g, '#e7dccb', 0.1, 0.18, 0, 0); g.children.at(-2).position.y += 0.64; g.children.at(-1).position.y += 0.64;
    bush(g, 0, 0.94, 0, 0.55);
    pumpkin(g, 0.62, 0.64, 0, 0.5); pumpkin(g, -0.62, 1.24, 0, 0.42, '#e9e1cf');
  },
  regal(g, c) {
    box(g, 1.9, 1.95, 0.36, c, 0, 0, -0.28);
    const books = cached('booksMat', () => new THREE.MeshStandardMaterial({ map: texture('buecher'), roughness: 0.8 }));
    for (let i = 0; i < 4; i++) {
      box(g, 1.78, 0.03, 0.32, shade(c, 0.1), 0, 0.08 + i * 0.47, -0.26);
      box(g, 1.76, 0.38, 0.26, books, 0, 0.11 + i * 0.47, -0.24);
    }
  },
  musikbox(g, c) {
    box(g, 0.78, 1.1, 0.5, c, 0, 0, -0.1, { r: 0.4 });
    const top = mesh(cached('jukeTop', () => new THREE.CylinderGeometry(0.39, 0.39, 0.5, 24, 1, false, -Math.PI / 2, Math.PI)), mat(c, { r: 0.4 }), 0, 1.1, -0.1, g);
    top.rotation.x = Math.PI / 2; top.rotation.z = Math.PI / 2;
    box(g, 0.6, 0.5, 0.02, '#ffcf6b', 0, 0.5, 0.16, { e: '#ff9f3d', ei: 0.8, g: true });
    box(g, 0.5, 0.25, 0.02, '#8fd3ff', 0, 0.12, 0.16, { e: '#4fb8ff', ei: 0.5, g: true });
    for (const x of [-0.33, 0.33]) box(g, 0.06, 1.0, 0.03, '#ffe08a', x, 0.05, 0.16, { e: '#ffb347', ei: 0.9, g: true });
  },

  // ── Wand (Rückkante bei z = -0.5) ──
  akustik(g, c) {
    box(g, 0.9, 2.1, 0.03, '#2b2b2e', 0, 0.35, -0.48, { r: 1 });
    for (let i = 0; i < 8; i++) box(g, 0.07, 2.1, 0.04, c, -0.39 + i * 0.11, 0.35, -0.44, { r: 0.75 });
  },
  akustik_filz(g, c) {
    const hex = cached('hex', () => { const gg = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 6); gg.rotateX(Math.PI / 2); gg.rotateZ(Math.PI / 6); return gg; });
    const cells = [[-0.6, 1.5], [-0.25, 1.7], [0.1, 1.5], [0.45, 1.7], [-0.25, 1.3], [0.45, 1.3], [0.8, 1.5], [0.1, 1.9]];
    cells.forEach(([x, y], i) => mesh(hex, mat(i % 3 ? c : shade(c, i % 2 ? 0.25 : -0.2), { r: 1 }), x, y, -0.47, g));
  },
  bild(g, c) {
    box(g, 0.62, 0.78, 0.04, C.woodDark, 0, 1.25, -0.48);
    const p = mesh(boxGeo(0.52, 0.68, 0.01), texMat('bild', c), 0, 1.64, -0.455, g);
    p.castShadow = false;
  },
  bildgruppe(g, c) {
    const frames = [[-0.6, 1.5, 0.4, 0.5, '#d27537'], [-0.1, 1.65, 0.36, 0.36, '#365648'], [-0.1, 1.2, 0.36, 0.28, '#d0a03e'], [0.42, 1.45, 0.5, 0.62, '#2c3a50'], [0.82, 1.75, 0.2, 0.26, '#b35a3b']];
    for (const [x, y, w, h, col] of frames) {
      box(g, w, h, 0.03, c, x, y - h / 2, -0.48, { m: 0.3 });
      mesh(boxGeo(w - 0.06, h - 0.06, 0.01), texMat('bild', col), x, y, -0.462, g).castShadow = false;
    }
  },
  spiegel(g, c) {
    const ring = mesh(cached('mirrorRing', () => new THREE.TorusGeometry(0.34, 0.03, 8, 32)), mat(c, { m: 0.8, r: 0.25 }), 0, 1.6, -0.47, g);
    ring.rotation.set(0, 0, 0);
    const glass = mesh(cached('mirror', () => { const gg = new THREE.CircleGeometry(0.33, 32); return gg; }), mat('#cfdde3', { m: 0.9, r: 0.05 }), 0, 1.6, -0.475, g);
    glass.castShadow = false;
  },
  uhr(g, c) {
    const face = mesh(cached('clock', () => { const gg = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 28); gg.rotateX(Math.PI / 2); return gg; }), mat(C.cream), 0, 1.9, -0.47, g);
    face.castShadow = false;
    const rim = mesh(cached('clockRim', () => new THREE.TorusGeometry(0.22, 0.02, 6, 28)), mat(c, { m: 0.6, r: 0.3 }), 0, 1.9, -0.45, g);
    rim.castShadow = false;
    box(g, 0.012, 0.15, 0.01, C.black, 0, 1.88, -0.445).rotation.z = 0.6;
    box(g, 0.012, 0.11, 0.01, C.black, 0, 1.86, -0.44).rotation.z = -1.4;
  },
  wandregal(g, c) {
    for (const y of [1.2, 1.65]) {
      box(g, 1.8, 0.04, 0.24, c, 0, y, -0.38);
      for (const x of [-0.75, 0.75]) box(g, 0.03, 0.12, 0.2, '#26262a', x, y - 0.12, -0.38);
    }
    for (let i = 0; i < 5; i++) cyl(g, 0.045, 0.035, 0.09, i % 2 ? C.cream : '#c8783a', -0.6 + i * 0.22, 1.24, -0.38, { r: 0.4 });
    pot(g, '#e7dccb', 0.08, 0.14, 0.55, -0.38); g.children.at(-2).position.y += 1.69; g.children.at(-1).position.y += 1.69;
    bush(g, 0.55, 1.95, -0.38, 0.45);
    for (let i = 0; i < 3; i++) cyl(g, 0.05, 0.05, 0.16 + i * 0.03, ['#dfe9ea', '#c9a36a', '#b35a3b'][i], -0.5 + i * 0.16, 1.69, -0.38, { o: i === 0 ? 0.6 : 1 });
  },
  kreidetafel(g, c) {
    box(g, 1.5, 0.95, 0.04, c, 0, 1.15, -0.48);
    mesh(boxGeo(1.38, 0.83, 0.01), texMat('tafel'), 0, 1.625, -0.455, g).castShadow = false;
  },
  neon(g, c) {
    box(g, 1.5, 0.6, 0.02, '#1b1b1d', 0, 1.6, -0.49, { r: 0.4, o: 0.35 });
    const m = cached(`neonMat|${c}`, () => {
      const t = texture('neon', null, c);
      const mm = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 1.2, transparent: true, alphaTest: 0.05, depthWrite: false });
      mm.userData.glow = 1.2; glowMats.add(mm);
      return mm;
    });
    const s = mesh(cached('neonPlane', () => new THREE.PlaneGeometry(1.5, 0.56)), m, 0, 1.9, -0.47, g);
    s.castShadow = false;
  },
  wandlampe(g, c) {
    box(g, 0.12, 0.2, 0.03, c, 0, 1.75, -0.48, { m: 0.5, r: 0.35 });
    box(g, 0.03, 0.03, 0.22, c, 0, 1.85, -0.37, { m: 0.5, r: 0.35 });
    cyl(g, 0.07, 0.12, 0.14, '#f6e3b8', 0, 1.8, -0.26, { e: '#ffcf80', ei: 0.9, g: true });
  },
  lichterkette(g, c) {
    const bulbs = 22;
    const m = mat(c, { e: c, ei: 1.6, g: true });
    const cable = mat('#2a2a2a');
    for (let i = 0; i < bulbs; i++) {
      const t = i / (bulbs - 1);
      const x = -1.4 + t * 2.8;
      const y = 2.55 - Math.sin(t * Math.PI * 3) ** 2 * 0.28;
      const b = mesh(sphGeo(0.035, 8, 6), m, x, y, -0.44, g);
      b.castShadow = false;
      if (i < bulbs - 1) {
        const l = mesh(boxGeo(0.14, 0.006, 0.006), cable, x + 0.066, y + 0.02, -0.45, g);
        l.castShadow = false;
      }
    }
  },
  wandpflanze(g, c) {
    box(g, 0.3, 0.04, 0.2, C.woodDark, 0, 1.55, -0.4);
    pot(g, c, 0.11, 0.18, 0, -0.38); g.children.at(-2).position.y += 1.59; g.children.at(-1).position.y += 1.59;
    bush(g, 0, 1.85, -0.36, 0.55);
    for (let i = 0; i < 4; i++) {
      const vine = mesh(cached('vine', () => new THREE.CylinderGeometry(0.035, 0.02, 0.8, 5)), mat(i % 2 ? C.leaf : C.leafDark, { r: 0.9 }), -0.12 + i * 0.08, 1.35 - (i % 2) * 0.15, -0.3, g);
      vine.rotation.z = (i - 1.5) * 0.12;
    }
  },
  kranz(g, c) {
    const ring = mesh(cached('wreath', () => new THREE.TorusGeometry(0.24, 0.07, 8, 20)), mat('#7a5a3a', { r: 1 }), 0, 1.8, -0.44, g);
    ring.castShadow = false;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const l = mesh(cached('wleaf', () => { const gg = new THREE.SphereGeometry(0.07, 6, 4); gg.scale(1, 0.5, 0.3); return gg; }), mat([c, '#c8783a', '#d0a03e', '#7a8a4f'][i % 4], { r: 0.9 }), Math.cos(a) * 0.25, 1.8 + Math.sin(a) * 0.25, -0.4, g);
      l.rotation.z = a;
    }
    for (let i = 0; i < 5; i++) sph(g, 0.025, '#b8302f', Math.cos(i * 1.3) * 0.2, 1.8 + Math.sin(i * 1.3) * 0.2, -0.36);
  },

  // ── Licht ──
  lampe(g, c) {
    cyl(g, 0.16, 0.18, 0.03, C.black, 0, 0, 0, { r: 0.4, m: 0.6 });
    cyl(g, 0.015, 0.015, 1.45, C.black, 0, 0.03, 0, { r: 0.4, m: 0.6 });
    cyl(g, 0.12, 0.22, 0.26, c, 0, 1.42, 0, { e: '#ffd58a', ei: 0.7, g: true, r: 0.9 });
  },
  pendel(g, c) {
    cyl(g, 0.006, 0.006, 1.0, '#1b1b1d', 0, CEIL - 1.0, 0);
    const shadeGeo = cached('pendShade', () => { const gg = new THREE.CylinderGeometry(0.06, 0.24, 0.22, 20, 1, true); return gg; });
    const s = mesh(shadeGeo, new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3 }), 0, CEIL - 1.1, 0, g);
    s.castShadow = false;
    sph(g, 0.06, '#fff2d0', 0, CEIL - 1.18, 0, { e: '#ffd27a', ei: 1.5, g: true }).castShadow = false;
  },
  rattanlampe(g, c) {
    cyl(g, 0.006, 0.006, 0.8, '#1b1b1d', 0, CEIL - 0.8, 0);
    const b = mesh(cached('rattan', () => new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62)), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 1, wireframe: false }), 0, CEIL - 0.85, 0, g);
    b.castShadow = false;
    const w = mesh(cached('rattanW', () => new THREE.SphereGeometry(0.285, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.62)), new THREE.MeshBasicMaterial({ color: shade(c, -0.4), wireframe: true }), 0, CEIL - 0.85, 0, g);
    w.castShadow = false;
    sph(g, 0.07, '#fff2d0', 0, CEIL - 1.0, 0, { e: '#ffcf80', ei: 1.4, g: true }).castShadow = false;
  },
  laterne(g, c) {
    const m = mat(c, { m: 0.6, r: 0.35 });
    box(g, 0.3, 0.03, 0.3, m, 0, 0, 0);
    for (const x of [-0.13, 0.13]) for (const z of [-0.13, 0.13]) box(g, 0.025, 0.5, 0.025, m, x, 0.03, z);
    box(g, 0.28, 0.48, 0.28, '#f3e6c8', 0, 0.03, 0, { o: 0.25 });
    const roof = mesh(cached('lanternRoof', () => new THREE.ConeGeometry(0.22, 0.14, 4)), m, 0, 0.6, 0, g);
    roof.rotation.y = Math.PI / 4;
    cyl(g, 0.05, 0.05, 0.14, '#efe6d4', 0, 0.06, 0);
    flame(g, 0, 0.2, 0, 1.2);
    pumpkin(g, 0.28, 0, 0.18, 0.5);
  },
  kerzen(g, c) {
    const m = mat(c, { m: 0.7, r: 0.3 });
    cyl(g, 0.14, 0.16, 0.03, m, 0, 0, 0);
    cyl(g, 0.018, 0.018, 1.0, m, 0, 0.03, 0);
    box(g, 0.44, 0.02, 0.03, m, 0, 1.02, 0);
    for (const x of [-0.2, 0, 0.2]) {
      cyl(g, 0.04, 0.04, 0.03, m, x, 1.03, 0);
      cyl(g, 0.025, 0.025, 0.18 - Math.abs(x) * 0.3, '#f2ead8', x, 1.06, 0);
      flame(g, x, 1.06 + 0.18 - Math.abs(x) * 0.3, 0, 1.1);
    }
  },

  // ── Pflanzen ──
  pflanze(g, c) { pot(g, c); bush(g, 0, 0.52, 0, 1); },
  palme(g, c) {
    pot(g, c, 0.24, 0.42);
    cyl(g, 0.03, 0.05, 1.3, '#7a5a3a', 0, 0.42, 0);
    const geo = cached('palmleaf', () => { const gg = new THREE.ConeGeometry(0.12, 0.9, 4); gg.translate(0, 0.45, 0); return gg; });
    for (let i = 0; i < 8; i++) {
      const m = mesh(geo, mat('#3f8a4a', { r: 0.8 }), 0, 1.68, 0, g);
      m.rotation.set(Math.PI / 2 - 0.4 - (i % 2) * 0.35, i * Math.PI / 4, 0, 'YXZ');
      m.scale.set(1, 1, 0.25);
    }
  },
  monstera(g, c) {
    pot(g, c, 0.22, 0.38);
    const leaf = cached('monLeaf', () => { const gg = new THREE.CircleGeometry(0.24, 10); gg.translate(0, 0.24, 0); return gg; });
    for (let i = 0; i < 9; i++) {
      cyl(g, 0.012, 0.012, 0.5 + noise(i) * 0.4, '#4a7a3a', Math.cos(i * 2.4) * 0.05, 0.38, Math.sin(i * 2.4) * 0.05);
      const l = mesh(leaf, new THREE.MeshStandardMaterial({ color: i % 2 ? '#2f6a3a' : '#3b7d45', side: THREE.DoubleSide, roughness: 0.7 }), Math.cos(i * 2.4) * 0.2, 0.8 + noise(i) * 0.4, Math.sin(i * 2.4) * 0.2, g);
      l.rotation.set(-0.9 + noise(i + 3) * 0.5, i * 2.4, 0, 'YXZ');
    }
  },
  olive(g, c) {
    pot(g, c, 0.22, 0.4);
    cyl(g, 0.03, 0.04, 0.9, '#6b5a48', 0, 0.4, 0);
    bush(g, 0, 1.45, 0, 1.6, ['#8a9a72', '#7a8a62']);
    bush(g, 0.2, 1.3, 0.1, 1.1, ['#9aa87e', '#7a8a62']);
  },
  kaktus(g, c) {
    pot(g, c, 0.13, 0.22);
    cyl(g, 0.07, 0.08, 0.55, '#4f7d4a', 0, 0.22, 0, { r: 0.8 }, 10);
    sph(g, 0.07, '#4f7d4a', 0, 0.77, 0);
    const arm = cyl(g, 0.045, 0.05, 0.22, '#4f7d4a', 0.11, 0.42, 0, { r: 0.8 }, 8);
    arm.rotation.z = -0.4;
    sph(g, 0.03, '#e86a8a', 0, 0.84, 0);
  },
  haengepflanze(g, c) {
    for (const a of [0, 2.1, 4.2]) {
      const r = cyl(g, 0.004, 0.004, 0.9, '#d9c7a5', Math.cos(a) * 0.08, CEIL - 0.9, Math.sin(a) * 0.08);
      r.rotation.set(Math.sin(a) * 0.09, 0, -Math.cos(a) * 0.09);
    }
    cyl(g, 0.15, 0.11, 0.18, c, 0, CEIL - 1.1, 0, { r: 0.85 });
    bush(g, 0, CEIL - 0.92, 0, 0.75);
    for (let i = 0; i < 6; i++) {
      const v = mesh(cached('vine', () => new THREE.CylinderGeometry(0.035, 0.02, 0.8, 5)), mat(i % 2 ? C.leaf : C.leafDark, { r: 0.9 }), Math.cos(i) * 0.13, CEIL - 1.4 - noise(i) * 0.2, Math.sin(i) * 0.13, g);
      v.rotation.set(Math.sin(i) * 0.2, 0, Math.cos(i) * 0.2);
    }
  },

  // ── Herbst & Gemütlich ──
  kuerbisse(g, c) {
    pumpkin(g, -0.12, 0, 0.05, 1.1, c);
    pumpkin(g, 0.17, 0, -0.08, 0.8, c === C.pumpkin ? '#e9e1cf' : C.pumpkin);
    pumpkin(g, 0.05, 0, 0.24, 0.6, '#c99a3b');
    pumpkin(g, -0.05, 0.2, -0.02, 0.55, c);
  },
  strohballen(g, c) {
    box(g, 1.1, 0.5, 0.6, mat(C.straw, { r: 1 }), -0.35, 0, 0);
    box(g, 0.75, 0.42, 0.55, mat(shade(C.straw, -0.08), { r: 1 }), 0.55, 0, 0.05);
    for (const x of [-0.6, -0.1]) box(g, 0.03, 0.51, 0.61, '#8a6a3a', x, 0, 0);
    pumpkin(g, -0.5, 0.5, 0, 1.0, c); pumpkin(g, -0.15, 0.5, 0.05, 0.7, '#e9e1cf');
    pumpkin(g, 0.5, 0, 0.42, 0.9, c);
    pumpkin(g, 0.55, 0.42, 0, 0.6, '#7a8a5a');
  },
  kamin(g, c) {
    const st = mat(c, { r: 0.85 });
    box(g, 1.9, 1.15, 0.6, st, 0, 0, -0.2);
    box(g, 2.05, 0.08, 0.72, mat(shade(c, -0.15), { r: 0.6 }), 0, 1.15, -0.16);
    box(g, 0.9, 0.62, 0.05, '#1b1715', 0, 0.12, 0.1, { r: 1 });
    box(g, 1.1, 0.08, 0.5, '#2a2320', 0, 0, 0.2);
    for (let i = 0; i < 3; i++) {
      const log = cyl(g, 0.06, 0.06, 0.6, '#5a3b22', 0, 0.2 + i * 0.06, 0.02 + i * 0.02);
      log.rotation.set(0, 0, Math.PI / 2 + (i - 1) * 0.2);
    }
    const fireMat = mat('#ffb347', { e: '#ff7a1a', ei: 1.8, g: true });
    fireMat.userData.flicker = true;
    for (let i = 0; i < 5; i++) {
      const f = mesh(cached('fire', () => new THREE.ConeGeometry(0.08, 0.32, 6)), fireMat, -0.25 + i * 0.12, 0.42 + noise(i) * 0.08, 0.05, g);
      f.scale.setScalar(0.7 + noise(i + 2) * 0.6);
      f.castShadow = false;
    }
    for (const x of [-0.7, 0.75]) pumpkin(g, x, 1.23, -0.2, 0.55);
    cyl(g, 0.03, 0.03, 0.24, '#f2ead8', 0.15, 1.23, -0.2); flame(g, 0.15, 1.47, -0.2);
    cyl(g, 0.03, 0.03, 0.18, '#f2ead8', -0.1, 1.23, -0.2); flame(g, -0.1, 1.41, -0.2);
    for (let i = 0; i < 4; i++) cyl(g, 0.05, 0.05, 0.5, '#7a5232', 0.82, 0.05 * i + 0.05, 0.3 - i * 0.02).rotation.x = Math.PI / 2;
  },
  deckenkorb(g, c) {
    cyl(g, 0.24, 0.2, 0.4, '#b98a50', 0, 0, 0, { r: 1 }, 14);
    const b1 = cyl(g, 0.2, 0.2, 0.18, mat(c, { r: 1 }), -0.04, 0.34, 0, {}, 12); b1.rotation.z = 1.3;
    const b2 = cyl(g, 0.17, 0.17, 0.16, mat('#e5d7c0', { r: 1 }), 0.06, 0.46, 0.04, {}, 12); b2.rotation.set(0.3, 0, 1.2);
  },
  laubkorb(g, c) {
    box(g, 0.6, 0.32, 0.45, '#9a6a3c', 0, 0, 0);
    box(g, 0.54, 0.02, 0.39, '#6a4426', 0, 0.3, 0);
    for (let i = 0; i < 9; i++) sph(g, 0.07, i % 4 === 0 ? '#d0a03e' : c, -0.18 + (i % 3) * 0.18, 0.36 + Math.floor(i / 3) * 0.02, -0.12 + Math.floor(i / 3) * 0.12);
  },
  buecherstapel(g, c) {
    const cols = [c, '#e8e1d0', '#c8783a', '#2c3a50', '#7a8a5a'];
    for (let i = 0; i < 5; i++) {
      const b = box(g, 0.32 - i * 0.02, 0.06, 0.24, mat(cols[i], { r: 0.8 }), 0, i * 0.06, 0);
      b.rotation.y = (noise(i) - 0.5) * 0.5;
    }
    cyl(g, 0.045, 0.035, 0.08, C.cream, 0.02, 0.3, 0);
  },
  katzenkorb(g, c) {
    const base = mesh(cached('basket', () => new THREE.CylinderGeometry(0.36, 0.3, 0.2, 18, 1, true)), new THREE.MeshStandardMaterial({ color: c, roughness: 1, side: THREE.DoubleSide }), 0, 0.1, 0, g);
    base.castShadow = true;
    cyl(g, 0.3, 0.3, 0.04, c, 0, 0, 0);
    const pil = mesh(cached('catPillow', () => { const gg = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 18); return gg; }), mat('#e5d7c0', { r: 1 }), 0, 0.08, 0, g);
    pil.scale.set(1, 1, 1);
    sph(g, 0.04, '#d27537', 0.32, 0.03, 0.22);
  },

  // ── Teppiche ──
  teppich(g, c) { rug(g, 1.9, 1.9, texMat('teppich', c, { r: 1 })); },
  teppich_rund(g, c) {
    const t = mesh(cached('rugRound', () => new THREE.CylinderGeometry(0.95, 0.95, 0.015, 40)), texMat('rund', c, { r: 1 }), 0, 0.008, 0, g);
    t.castShadow = false;
  },
  laeufer(g, c) { rug(g, 2.85, 0.8, texMat('streifenteppich', c, { r: 1 })); },
  teppich_gross(g, c) { rug(g, 2.85, 1.85, texMat('berber', c, { r: 1 })); },
};
function rug(g, w, d, m) {
  const t = mesh(boxGeo(w, 0.015, d), m, 0, 0.008, 0, g);
  t.castShadow = false;
}

export function buildFurniture(type, v = 0) {
  const g = new THREE.Group();
  const def = FURNITURE[type];
  const color = def.v?.[v] ?? def.v?.[0] ?? '#888';
  (BUILDERS[type] || ((gg) => box(gg, def.w * 0.9, 0.5, def.d * 0.9, '#888', 0, 0, 0)))(g, color);
  g.userData.type = type;
  return g;
}

// Fertiges Möbel: Teile je Material zu einem Mesh zusammengefasst (weniger Draw-Calls)
const furnCache = new Map();
export function furnitureMesh(type, v = 0) {
  const key = `${type}|${v}`;
  let proto = furnCache.get(key);
  if (!proto) {
    const src = buildFurniture(type, v);
    src.updateMatrixWorld(true);
    const buckets = new Map();
    src.traverse((o) => {
      if (!o.isMesh) return;
      if (!buckets.has(o.material)) buckets.set(o.material, { geos: [], cast: false });
      const b = buckets.get(o.material);
      let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (geo.index) geo = geo.toNonIndexed();
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
      b.geos.push(geo);
      b.cast ||= o.castShadow;
    });
    proto = new THREE.Group();
    for (const [m, b] of buckets) {
      const merged = new THREE.Mesh(mergeGeometries(b.geos), m);
      merged.castShadow = b.cast;
      merged.receiveShadow = true;
      proto.add(merged);
      for (const g of b.geos) g.dispose();
    }
    proto.userData.type = type;
    furnCache.set(key, proto);
  }
  return proto.clone();
}

// Halbtransparente Kopie für die Bauvorschau
export function ghostOf(group, ok) {
  const g = group.clone(true);
  const m = new THREE.MeshBasicMaterial({ color: ok ? '#5fd38a' : '#e5534b', transparent: true, opacity: 0.45, depthWrite: false });
  g.traverse((o) => { if (o.isMesh) { o.material = m; o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

// ───────────── Figuren ─────────────

const limbGeo = (w, h, d) => cached(`limb${w}|${h}|${d}`, () => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, -h / 2, 0); return g; });

export function buildPerson(look, staff = false) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.scale.setScalar(look.height || 1);
  const skin = mat(look.skin, { r: 0.7 });
  const shirt = mat(staff ? '#f1ebe0' : look.shirt, { r: 0.85 });
  const pants = mat(look.pants, { r: 0.85 });
  const shoes = mat('#2a211c', { r: 0.6 });

  const hips = new THREE.Group();
  hips.position.y = 0.84;
  body.add(hips);
  const legs = [];
  for (const side of [-1, 1]) {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.1, 0, 0);
    hips.add(thigh);
    mesh(limbGeo(0.14, 0.43, 0.16), pants, 0, 0, 0, thigh);
    const shin = new THREE.Group();
    shin.position.y = -0.42;
    thigh.add(shin);
    mesh(limbGeo(0.12, 0.38, 0.14), pants, 0, 0, 0, shin);
    mesh(boxGeo(0.13, 0.07, 0.24), shoes, 0, -0.39, 0.04, shin);
    legs.push({ thigh, shin });
  }
  const torso = new THREE.Group();
  torso.position.y = 0.84;
  body.add(torso);
  mesh(boxGeo(0.4, 0.56, 0.24), shirt, 0, 0.3, 0, torso);
  // Mantelschoß (verdeckt die Hüfte, wackelt beim Laufen nicht mit)
  if (look.coat && !staff) mesh(boxGeo(0.42, 0.3, 0.26), shirt, 0, -0.1, 0, torso);
  if (staff) {
    const apron = mat(look.apron || '#2f5d50', { r: 0.9 });
    mesh(boxGeo(0.36, 0.7, 0.02), apron, 0, 0.12, 0.13, torso);
    mesh(boxGeo(0.42, 0.04, 0.26), apron, 0, 0.35, 0, torso);
  }
  mesh(cylGeo(0.06, 0.07, 0.08, 10), skin, 0, 0.62, 0, torso);
  const head = mesh(sphGeo(0.13), skin, 0, 0.77, 0, torso);
  head.scale.set(1, 1.08, 1);
  if (look.scarf && !staff) {
    const sc = mat(look.scarf, { r: 1 });
    const ring = mesh(cached('scarf', () => new THREE.TorusGeometry(0.1, 0.045, 6, 14)), sc, 0, 0.6, 0, torso);
    ring.rotation.x = Math.PI / 2;
    mesh(boxGeo(0.08, 0.26, 0.04), sc, 0.07, 0.46, 0.13, torso).rotation.z = 0.1;
  }
  const hair = mat(look.hair, { r: 0.9 });
  const cap = cached('hairCap', () => new THREE.SphereGeometry(0.137, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55));
  if (look.hat && !staff) {
    mesh(cached('beanie', () => new THREE.SphereGeometry(0.145, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52)), mat(look.hat, { r: 1 }), 0, 0.8, -0.005, torso);
    sph(torso, 0.045, look.hat, 0, 0.95, 0);
    mesh(cylGeo(0.147, 0.147, 0.05, 16), mat(shade(look.hat, -0.15), { r: 1 }), 0, 0.79, 0, torso);
  } else if (look.hairStyle === 0) {
    mesh(cap, hair, 0, 0.79, -0.005, torso).rotation.x = -0.25;
  } else if (look.hairStyle === 1) {
    mesh(cap, hair, 0, 0.79, -0.01, torso).rotation.x = -0.3;
    mesh(boxGeo(0.26, 0.24, 0.08), hair, 0, 0.6, -0.1, torso);
  } else {
    mesh(cap, hair, 0, 0.79, 0, torso).rotation.x = -0.15;
    mesh(sphGeo(0.07), hair, 0, 0.84, -0.12, torso);
  }
  if (staff) mesh(cylGeo(0.14, 0.14, 0.06, 14), mat(look.apron || '#2f5d50', { r: 0.9 }), 0, 0.88, 0, torso);

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.26, 0.54, 0);
    torso.add(arm);
    mesh(limbGeo(0.1, 0.32, 0.12), shirt, 0, 0, 0, arm);
    const fore = new THREE.Group();
    fore.position.y = -0.3;
    arm.add(fore);
    mesh(limbGeo(0.09, 0.26, 0.1), staff ? skin : shirt, 0, 0, 0, fore);
    arms.push({ arm, fore });
  }
  // Becher bzw. Tüte in der rechten Hand
  const cup = new THREE.Group();
  cup.position.set(0, -0.27, 0.05);
  arms[1].fore.add(cup);
  mesh(cylGeo(0.04, 0.032, 0.11, 10), mat('#f4ece0', { r: 0.6 }), 0, 0, 0, cup);
  mesh(cylGeo(0.042, 0.042, 0.02, 10), mat('#c8783a', { r: 0.6 }), 0, 0.06, 0, cup);
  cup.visible = false;
  const bag = mesh(boxGeo(0.14, 0.16, 0.08), mat('#c9a77a', { r: 0.9 }), 0, -0.36, 0.02, arms[1].fore);
  bag.visible = false;
  // Regenschirm in der linken Hand
  const umbrella = new THREE.Group();
  umbrella.position.set(0, -0.26, 0.04);
  arms[0].fore.add(umbrella);
  mesh(cylGeo(0.01, 0.01, 1.0, 6), mat('#2a2a2a'), 0, 0.45, 0, umbrella);
  const canopy = mesh(cached('umbrella', () => new THREE.ConeGeometry(0.55, 0.25, 8, 1, true)), new THREE.MeshStandardMaterial({ color: look.umbrella || '#2f5d50', side: THREE.DoubleSide, roughness: 0.6 }), 0, 0.98, 0, umbrella);
  canopy.castShadow = true;
  umbrella.visible = false;

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.userData.rig = { body, hips, torso, legs, arms, cup, bag, umbrella };
  return root;
}

// Pose setzen: walk = Gangphase (rad), amount = Schrittweite 0..1, sit (Sitzhöhe), work
export function posePerson(person, { walk = 0, amount = 0, sit = 0, work = 0, carry = null, umbrella = false, t = 0 }) {
  const r = person.userData.rig;
  r.cup.visible = carry === 'cup';
  r.bag.visible = carry === 'bag';
  r.umbrella.visible = umbrella;
  if (sit) {
    const low = sit < 0.3;
    r.hips.position.y = sit + 0.01; r.torso.position.y = sit + 0.01;
    for (const l of r.legs) {
      l.thigh.rotation.x = -Math.PI / 2;
      l.shin.rotation.x = low ? 0.2 : Math.PI / 2 - (sit > 0.6 ? 0.5 : 0);
    }
    if (low) { r.legs[0].thigh.rotation.y = 0.5; r.legs[1].thigh.rotation.y = -0.5; }
    r.arms[0].arm.rotation.x = -0.5; r.arms[0].fore.rotation.x = -0.6;
    const sip = Math.max(0, Math.sin(t * 0.8));
    r.arms[1].arm.rotation.x = -0.5 - (carry === 'cup' ? 0.4 + sip * 0.6 : 0);
    r.arms[1].fore.rotation.x = -0.9 - (carry === 'cup' ? sip * 0.7 : 0);
    r.torso.rotation.x = -0.05;
    return;
  }
  for (const l of r.legs) l.thigh.rotation.y = 0;
  r.hips.position.y = 0.84; r.torso.position.y = 0.84 + Math.abs(Math.sin(walk)) * 0.03 * amount;
  r.torso.rotation.x = 0;
  const s = Math.sin(walk) * 0.55 * amount;
  r.legs[0].thigh.rotation.x = s; r.legs[1].thigh.rotation.x = -s;
  r.legs[0].shin.rotation.x = Math.max(0, -Math.cos(walk)) * 0.7 * amount;
  r.legs[1].shin.rotation.x = Math.max(0, Math.cos(walk)) * 0.7 * amount;
  if (umbrella) { r.arms[0].arm.rotation.x = -0.75; r.arms[0].fore.rotation.x = -0.85; r.umbrella.rotation.x = 1.6; }
  else { r.arms[0].arm.rotation.x = -s * 0.8; r.arms[0].fore.rotation.x = -0.15; }
  if (carry) { r.arms[1].arm.rotation.x = carry === 'cup' ? -0.35 : 0; r.arms[1].fore.rotation.x = carry === 'cup' ? -1.1 : 0; }
  else { r.arms[1].arm.rotation.x = s * 0.8; r.arms[1].fore.rotation.x = -0.15; }
  if (work) {
    const w = Math.sin(t * 6) * 0.25;
    r.arms[0].arm.rotation.x = -0.9 + w; r.arms[0].fore.rotation.x = -0.7;
    r.arms[1].arm.rotation.x = -0.9 - w; r.arms[1].fore.rotation.x = -0.7;
  }
}

// ───────────── Café-Katze ─────────────

export function buildCat(color) {
  const root = new THREE.Group();
  const fur = mat(color, { r: 1 });
  const light = mat(shade(color, 0.35), { r: 1 });
  const body = mesh(cached('catBody', () => { const g = new THREE.SphereGeometry(0.13, 12, 8); g.scale(1, 0.85, 1.7); return g; }), fur, 0, 0.2, 0, root);
  const head = new THREE.Group();
  head.position.set(0, 0.3, 0.22);
  root.add(head);
  mesh(sphGeo(0.095), fur, 0, 0, 0, head);
  mesh(cached('catMuzzle', () => { const g = new THREE.SphereGeometry(0.05, 8, 6); g.scale(1.2, 0.8, 0.8); return g; }), light, 0, -0.03, 0.07, head);
  for (const s of [-1, 1]) {
    const ear = mesh(cached('catEar', () => new THREE.ConeGeometry(0.035, 0.07, 4)), fur, s * 0.055, 0.085, 0, head);
    ear.rotation.z = -s * 0.25;
    sph(head, 0.012, '#1b1b1d', s * 0.035, 0.015, 0.085);
  }
  sph(head, 0.01, '#d97a8a', 0, -0.01, 0.105);
  const legs = [];
  for (const [x, z] of [[-0.06, 0.13], [0.06, 0.13], [-0.06, -0.13], [0.06, -0.13]]) {
    const l = new THREE.Group();
    l.position.set(x, 0.14, z);
    root.add(l);
    mesh(limbGeo(0.035, 0.14, 0.035), fur, 0, 0, 0, l);
    legs.push(l);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.24, -0.2);
  root.add(tail);
  const tm = mesh(cached('catTail', () => { const g = new THREE.CylinderGeometry(0.018, 0.025, 0.28, 6); g.translate(0, 0.14, 0); return g; }), fur, 0, 0, 0, tail);
  tm.rotation.x = -0.6;
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.userData.rig = { body, head, legs, tail };
  return root;
}

export function poseCat(cat, { walk = 0, amount = 0, sleep = false, t = 0 }) {
  const r = cat.userData.rig;
  if (sleep) {
    r.body.position.y = 0.11; r.body.scale.set(1.15, 0.8, 0.8);
    r.head.position.set(0.12, 0.13, 0.08); r.head.rotation.set(0.3, 0.9, 0.2);
    for (const l of r.legs) l.visible = false;
    r.tail.position.set(-0.05, 0.08, -0.05); r.tail.rotation.set(Math.PI / 2, 0, 1.6);
    r.body.scale.y = 0.8 + Math.sin(t * 1.5) * 0.03;
    return;
  }
  r.body.position.y = 0.2; r.body.scale.set(1, 1, 1);
  r.head.position.set(0, 0.3, 0.22); r.head.rotation.set(0, Math.sin(t * 0.7) * 0.3 * (1 - amount), 0);
  r.legs.forEach((l, i) => { l.visible = true; l.rotation.x = Math.sin(walk + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 * amount; });
  r.tail.position.set(0, 0.24, -0.2); r.tail.rotation.set(-0.6 + Math.sin(t * 2) * 0.15, 0, Math.sin(t * 1.3) * 0.4);
}
