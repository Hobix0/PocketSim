// Prozedurale Low-Poly-Modelle: Einrichtung und Figuren.
// Jedes Möbel steht mit der Mitte seiner Grundfläche im Ursprung, Vorderseite zeigt nach +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FURNITURE } from './data.js';

const mats = new Map();
export function mat(color, o = {}) {
  const key = `${color}|${o.r ?? 0.75}|${o.m ?? 0}|${o.e ?? ''}|${o.o ?? 1}|${o.ei ?? 1}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: o.r ?? 0.75, metalness: o.m ?? 0,
      transparent: (o.o ?? 1) < 1, opacity: o.o ?? 1, depthWrite: (o.o ?? 1) >= 1,
    });
    if (o.e) { m.emissive.set(o.e); m.emissiveIntensity = o.ei ?? 1; }
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
// Box mit Unterkante auf y
const box = (p, w, h, d, color, x, y, z, o) => mesh(boxGeo(w, h, d), typeof color === 'string' ? mat(color, o) : color, x, y + h / 2, z, p);
const cyl = (p, rt, rb, h, color, x, y, z, o, s) => mesh(cylGeo(rt, rb, h, s), typeof color === 'string' ? mat(color, o) : color, x, y + h / 2, z, p);
const sph = (p, r, color, x, y, z, o) => mesh(sphGeo(r), typeof color === 'string' ? mat(color, o) : color, x, y, z, p);

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

const texCache = new Map();
export function texture(name, repeat) {
  const key = `${name}|${repeat}`;
  if (texCache.has(key)) return texCache.get(key);
  let t;
  if (name === 'parkett') {
    t = canvasTex(256, 256, (g, w, h) => {
      for (let row = 0; row < 8; row++) {
        const off = (row % 2) * 64;
        for (let i = -1; i < 3; i++) {
          const v = 150 + ((row * 7 + i * 13) % 5) * 9;
          g.fillStyle = `rgb(${v + 30},${v - 15},${v - 60})`;
          g.fillRect(i * 128 + off, row * 32, 128, 32);
          g.strokeStyle = 'rgba(60,35,15,0.35)';
          g.strokeRect(i * 128 + off + 0.5, row * 32 + 0.5, 128, 32);
        }
        for (let k = 0; k < 18; k++) {
          g.strokeStyle = 'rgba(90,55,25,0.12)';
          g.beginPath();
          const y = row * 32 + 4 + ((k * 37) % 26);
          g.moveTo(0, y); g.lineTo(w, y + ((k % 3) - 1));
          g.stroke();
        }
      }
    }, repeat);
  } else if (name === 'beton') {
    t = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#8f8b86'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const v = 120 + Math.random() * 40;
        g.fillStyle = `rgba(${v},${v},${v - 5},0.25)`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    }, repeat);
  } else if (name === 'asphalt') {
    t = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#3d3f43'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        const v = 50 + Math.random() * 40;
        g.fillStyle = `rgb(${v},${v},${v + 3})`;
        g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
    }, repeat);
  } else if (name === 'gehweg') {
    t = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#b9b2a8'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#9d968c'; g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke();
        g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke();
      }
    }, repeat);
  } else if (name === 'ziegel') {
    t = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#d8cfc2'; g.fillRect(0, 0, w, h);
      for (let row = 0; row < 16; row++) {
        const off = (row % 2) * 32;
        for (let i = -1; i < 5; i++) {
          const v = (row * 31 + i * 17) % 7;
          g.fillStyle = `rgb(${168 + v * 4},${92 + v * 3},${70 + v * 2})`;
          g.fillRect(i * 64 + off + 2, row * 16 + 2, 60, 12);
        }
      }
    }, repeat);
  } else if (name === 'markise') {
    t = canvasTex(128, 32, (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#f4ece0' : '#2f5d50';
        g.fillRect(i * 16, 0, 16, h);
      }
    }, repeat);
  } else if (name === 'teppich') {
    t = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#9c3f32'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#e8c98f'; g.lineWidth = 5; g.strokeRect(10, 10, w - 20, h - 20);
      g.lineWidth = 2; g.strokeRect(20, 20, w - 40, h - 40);
      g.fillStyle = '#2f4f5c';
      g.beginPath(); g.moveTo(w / 2, 30); g.lineTo(w - 30, h / 2); g.lineTo(w / 2, h - 30); g.lineTo(30, h / 2); g.fill();
      g.fillStyle = '#e8c98f'; g.beginPath(); g.arc(w / 2, h / 2, 10, 0, Math.PI * 2); g.fill();
    });
  } else if (name === 'fliesen') {
    t = canvasTex(128, 128, (g, w, h) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        g.fillStyle = (x + y) % 2 ? '#2b2b2e' : '#ece6dc';
        g.fillRect(x * 16, y * 16, 16, 16);
      }
    }, repeat);
  } else if (name === 'buecher') {
    t = canvasTex(128, 64, (g, w, h) => {
      const cols = ['#7a2e2e', '#2e4d7a', '#3c6b3c', '#c9a227', '#5b3a6b', '#d36b3c', '#2b2b2b', '#e8e1d0'];
      let x = 0;
      while (x < w) {
        const bw = 5 + ((x * 7) % 6);
        g.fillStyle = cols[(x * 3) % cols.length];
        g.fillRect(x, 6 + ((x * 5) % 8), bw - 1, h);
        x += bw;
      }
    });
  }
  texCache.set(key, t);
  return t;
}

// Schild/Text als Textur
export function labelTexture(text, { w = 512, h = 128, bg = '#2f5d50', fg = '#f4ece0', font = '600 64px Georgia, serif', border } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20); }
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

// ───────────── Farben ─────────────

const C = {
  wood: '#8a5a36', woodDark: '#5c3b22', woodLight: '#c4955f', oak: '#b07a47',
  marble: '#efebe4', steel: '#c9ccd1', black: '#26262a', cream: '#f4ece0',
  green: '#2f5d50', leaf: '#4c8a3f', leafDark: '#356b2e', pot: '#c06a43', fabric: '#3f6b78', fabricWarm: '#a65a3f',
};

// ───────────── Einrichtung ─────────────

const BUILDERS = {
  theke(g) {
    // Tresen vorne
    box(g, 2.0, 0.98, 0.7, C.woodDark, 0, 0, 0.48);
    for (let i = 0; i < 4; i++) box(g, 0.44, 0.78, 0.02, C.oak, -0.72 + i * 0.48, 0.1, 0.835);
    box(g, 2.08, 0.05, 0.8, C.marble, 0, 0.98, 0.46, { r: 0.35 });
    // Kasse
    box(g, 0.34, 0.1, 0.28, C.black, -0.5, 1.03, 0.42, { r: 0.4 });
    const screen = box(g, 0.3, 0.2, 0.03, C.black, -0.5, 1.12, 0.36, { r: 0.3 });
    screen.rotation.x = -0.35;
    box(g, 0.26, 0.16, 0.005, '#7fd4c1', -0.5, 1.14, 0.38, { e: '#3aa08a', ei: 0.6 }).rotation.x = -0.35;
    // Tassenstapel und Glas mit Keksen
    for (let i = 0; i < 3; i++) cyl(g, 0.045, 0.035, 0.07, C.cream, 0.25 + i * 0.002, 1.03 + i * 0.07, 0.5, { r: 0.4 });
    cyl(g, 0.09, 0.09, 0.2, '#dfe9ea', 0.65, 1.03, 0.55, { r: 0.1, o: 0.5 });
    // Rückbuffet
    box(g, 2.0, 0.92, 0.32, C.wood, 0, 0, -0.84);
    box(g, 2.0, 0.04, 0.36, C.marble, 0, 0.92, -0.84, { r: 0.35 });
    box(g, 2.0, 0.04, 0.24, C.woodLight, 0, 1.55, -0.9);
    for (let i = 0; i < 6; i++) cyl(g, 0.04, 0.035, 0.08, i % 2 ? C.cream : '#d9c7a5', -0.8 + i * 0.32, 1.59, -0.9, { r: 0.4 });
    // Preistafel
    box(g, 1.2, 0.55, 0.03, '#1f2421', 0, 1.75, -0.98, { r: 0.9 });
  },
  kaffeemaschine(g) {
    box(g, 0.92, 0.88, 0.62, C.wood, 0, 0, -0.08);
    box(g, 0.96, 0.04, 0.66, C.marble, 0, 0.88, -0.08, { r: 0.35 });
    const m = mat(C.steel, { r: 0.25, m: 0.85 });
    box(g, 0.62, 0.38, 0.4, m, -0.05, 0.92, -0.12);
    box(g, 0.62, 0.05, 0.42, mat('#b7382f', { r: 0.4 }), -0.05, 1.3, -0.12);
    for (let i = 0; i < 2; i++) {
      cyl(g, 0.04, 0.04, 0.08, C.black, -0.2 + i * 0.3, 1.0, 0.1, { r: 0.4 });
      cyl(g, 0.03, 0.025, 0.05, C.cream, -0.2 + i * 0.3, 0.92, 0.12, { r: 0.4 });
    }
    // Mühle
    cyl(g, 0.07, 0.07, 0.22, C.black, 0.33, 0.92, -0.05, { r: 0.4 });
    cyl(g, 0.09, 0.05, 0.16, '#7a5232', 0.33, 1.14, -0.05, { o: 0.75, r: 0.2 });
    for (let i = 0; i < 4; i++) cyl(g, 0.035, 0.03, 0.05, C.cream, -0.25 + i * 0.12, 1.35, -0.12, { r: 0.4 });
  },
  vitrine(g) {
    box(g, 1.9, 0.82, 0.78, C.woodDark, 0, 0, 0);
    box(g, 1.94, 0.04, 0.82, C.marble, 0, 0.82, 0, { r: 0.35 });
    box(g, 1.86, 0.5, 0.72, '#dbe8ea', 0, 0.86, 0, { o: 0.28, r: 0.05 });
    box(g, 1.86, 0.02, 0.72, C.steel, 0, 1.36, 0, { m: 0.7, r: 0.3 });
    box(g, 1.8, 0.02, 0.66, '#fffbe9', 0, 1.33, 0, { e: '#ffe7b0', ei: 0.7 });
    // Ware
    const cake = (x, col) => {
      cyl(g, 0.15, 0.15, 0.1, '#f2dcb0', x, 0.86, 0.02);
      cyl(g, 0.152, 0.152, 0.025, col, x, 0.96, 0.02, { r: 0.5 });
    };
    cake(-0.65, '#6b3b23'); cake(-0.25, '#e6b7c4');
    for (let i = 0; i < 3; i++) {
      const cr = mesh(cached('croissant', () => new THREE.TorusGeometry(0.06, 0.03, 8, 12, Math.PI)), mat('#d9a04a', { r: 0.6 }), 0.15 + i * 0.16, 0.89, 0.12 - i * 0.05, g);
      cr.rotation.x = -Math.PI / 2;
    }
    for (let i = 0; i < 3; i++) {
      cyl(g, 0.05, 0.04, 0.06, '#c9a36a', 0.65, 0.86, -0.2 + i * 0.16);
      sph(g, 0.055, i === 1 ? '#5b3423' : '#7c4a2a', 0.65, 0.95, -0.2 + i * 0.16);
    }
  },
  tisch(g) {
    cyl(g, 0.2, 0.22, 0.03, C.black, 0, 0, 0, { r: 0.4, m: 0.5 });
    cyl(g, 0.03, 0.03, 0.7, C.black, 0, 0.03, 0, { r: 0.4, m: 0.5 });
    cyl(g, 0.36, 0.36, 0.04, C.marble, 0, 0.72, 0, { r: 0.3 }, 28);
    // Zuckerdose
    cyl(g, 0.04, 0.04, 0.07, '#d8e2e4', 0.1, 0.76, -0.08, { o: 0.6, r: 0.1 });
  },
  tisch_lang(g) {
    box(g, 1.84, 0.05, 0.8, C.oak, 0, 0.71, 0);
    for (const x of [-0.82, 0.82]) for (const z of [-0.32, 0.32]) box(g, 0.06, 0.71, 0.06, C.woodDark, x, 0, z);
    cyl(g, 0.05, 0.04, 0.12, '#dfe9ea', 0, 0.76, 0, { o: 0.5, r: 0.1 });
    cyl(g, 0.015, 0.015, 0.16, C.leaf, 0, 0.8, 0);
  },
  stuhl(g) {
    box(g, 0.42, 0.05, 0.42, C.oak, 0, 0.44, 0);
    for (const x of [-0.18, 0.18]) for (const z of [-0.18, 0.18]) box(g, 0.04, 0.44, 0.04, C.woodDark, x, 0, z);
    box(g, 0.42, 0.04, 0.04, C.woodDark, 0, 0.85, -0.19);
    for (const x of [-0.18, 0.18]) box(g, 0.04, 0.42, 0.04, C.woodDark, x, 0.48, -0.19);
    box(g, 0.36, 0.14, 0.02, C.oak, 0, 0.68, -0.19);
  },
  sessel(g) {
    const f = mat(C.fabricWarm, { r: 0.95 });
    box(g, 0.78, 0.4, 0.74, f, 0, 0.06, 0);
    box(g, 0.66, 0.12, 0.6, mat('#b9694c', { r: 0.95 }), 0, 0.42, 0.06);
    box(g, 0.78, 0.5, 0.16, f, 0, 0.42, -0.3);
    for (const x of [-0.34, 0.34]) box(g, 0.12, 0.26, 0.7, f, x, 0.42, 0.02);
    for (const x of [-0.3, 0.3]) for (const z of [-0.28, 0.28]) cyl(g, 0.025, 0.02, 0.06, C.woodDark, x, 0, z);
  },
  sofa(g) {
    const f = mat(C.fabric, { r: 0.95 });
    box(g, 1.9, 0.38, 0.8, f, 0, 0.06, 0);
    for (const x of [-0.45, 0.45]) box(g, 0.86, 0.12, 0.62, mat('#4d7f8c', { r: 0.95 }), x, 0.44, 0.07);
    box(g, 1.9, 0.48, 0.18, f, 0, 0.44, -0.31);
    for (const x of [-0.89, 0.89]) box(g, 0.14, 0.26, 0.78, f, x, 0.44, 0);
    box(g, 0.3, 0.26, 0.1, mat('#e3c27a', { r: 0.95 }), -0.6, 0.56, -0.18).rotation.z = 0.15;
    for (const x of [-0.85, 0.85]) for (const z of [-0.33, 0.33]) cyl(g, 0.025, 0.02, 0.06, C.woodDark, x, 0, z);
  },
  pflanze(g) {
    cyl(g, 0.17, 0.13, 0.32, C.pot, 0, 0, 0, { r: 0.85 });
    cyl(g, 0.16, 0.16, 0.02, '#3d2a1c', 0, 0.3, 0);
    const leaf = mat(C.leaf, { r: 0.8 }), leaf2 = mat(C.leafDark, { r: 0.8 });
    const ico = cached('ico', () => new THREE.IcosahedronGeometry(0.2, 0));
    [[0, 0.52, 0, 1], [0.1, 0.65, 0.05, 0.75], [-0.1, 0.62, -0.06, 0.8], [0.02, 0.78, -0.02, 0.6]].forEach(([x, y, z, s], i) => {
      const m = mesh(ico, i % 2 ? leaf2 : leaf, x, y, z, g);
      m.scale.setScalar(s);
      m.rotation.set(i, i * 2, 0);
    });
  },
  palme(g) {
    cyl(g, 0.24, 0.18, 0.42, '#d8cfc2', 0, 0, 0, { r: 0.6 });
    cyl(g, 0.22, 0.22, 0.02, '#3d2a1c', 0, 0.4, 0);
    cyl(g, 0.03, 0.05, 1.3, '#7a5a3a', 0, 0.42, 0);
    const leaf = mat('#3f8a4a', { r: 0.8 });
    const geo = cached('palmleaf', () => { const gg = new THREE.ConeGeometry(0.12, 0.9, 4); gg.translate(0, 0.45, 0); return gg; });
    for (let i = 0; i < 8; i++) {
      const m = mesh(geo, leaf, 0, 1.68, 0, g);
      m.rotation.set(Math.PI / 2 - 0.4 - (i % 2) * 0.35, i * Math.PI / 4, 0, 'YXZ');
      m.scale.set(1, 1, 0.25);
    }
  },
  lampe(g) {
    cyl(g, 0.16, 0.18, 0.03, C.black, 0, 0, 0, { r: 0.4, m: 0.6 });
    cyl(g, 0.015, 0.015, 1.45, C.black, 0, 0.03, 0, { r: 0.4, m: 0.6 });
    cyl(g, 0.12, 0.22, 0.26, '#f3e3c3', 0, 1.42, 0, { e: '#ffd58a', ei: 0.9, r: 0.9 });
  },
  regal(g) {
    box(g, 1.9, 1.95, 0.36, C.woodDark, 0, 0, -0.28);
    const books = cached('booksMat', () => new THREE.MeshStandardMaterial({ map: texture('buecher'), roughness: 0.8 }));
    for (let i = 0; i < 4; i++) {
      box(g, 1.78, 0.03, 0.32, C.wood, 0, 0.08 + i * 0.47, -0.26);
      box(g, 1.76, 0.38, 0.26, books, 0, 0.11 + i * 0.47, -0.24);
    }
  },
  teppich(g) {
    const m = cached('rugMat', () => new THREE.MeshStandardMaterial({ map: texture('teppich'), roughness: 1 }));
    const t = mesh(boxGeo(1.9, 0.015, 1.9), m, 0, 0.008, 0, g);
    t.castShadow = false;
  },
  musikbox(g) {
    box(g, 0.78, 1.1, 0.5, '#7a2a24', 0, 0, -0.1, { r: 0.4 });
    const top = mesh(cached('jukeTop', () => new THREE.CylinderGeometry(0.39, 0.39, 0.5, 24, 1, false, -Math.PI / 2, Math.PI)), mat('#7a2a24', { r: 0.4 }), 0, 1.1, -0.1, g);
    top.rotation.x = Math.PI / 2;
    top.rotation.z = Math.PI / 2;
    box(g, 0.6, 0.5, 0.02, '#ffcf6b', 0, 0.5, 0.16, { e: '#ff9f3d', ei: 0.8 });
    box(g, 0.5, 0.25, 0.02, '#8fd3ff', 0, 0.12, 0.16, { e: '#4fb8ff', ei: 0.5 });
    for (const x of [-0.33, 0.33]) box(g, 0.06, 1.0, 0.03, '#ffe08a', x, 0.05, 0.16, { e: '#ffb347', ei: 0.9 });
  },
};

export function buildFurniture(type) {
  const g = new THREE.Group();
  (BUILDERS[type] || ((gg) => box(gg, FURNITURE[type].w * 0.9, 0.5, FURNITURE[type].d * 0.9, '#888', 0, 0, 0)))(g);
  g.userData.type = type;
  return g;
}

// Fertiges Möbel: Teile je Material zu einem Mesh zusammengefasst (weniger Draw-Calls)
const furnCache = new Map();
export function furnitureMesh(type) {
  let proto = furnCache.get(type);
  if (!proto) {
    const src = buildFurniture(type);
    src.updateMatrixWorld(true);
    const buckets = new Map();
    src.traverse((o) => {
      if (!o.isMesh) return;
      if (!buckets.has(o.material)) buckets.set(o.material, { geos: [], cast: false });
      const b = buckets.get(o.material);
      b.geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
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
    furnCache.set(type, proto);
  }
  return proto.clone();
}

// Halbtransparente Kopie für die Bauvorschau
export function ghostOf(group, ok) {
  const g = group.clone(true);
  const m = new THREE.MeshBasicMaterial({ color: ok ? '#5fd38a' : '#e5534b', transparent: true, opacity: 0.45, depthWrite: false });
  g.traverse((o) => { if (o.isMesh) { o.material = m; o.castShadow = false; o.receiveShadow = false; } });
  g.userData.ghostMat = m;
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
  const shirt = mat(staff ? '#2a2a2e' : look.shirt, { r: 0.85 });
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
  if (staff) {
    mesh(boxGeo(0.36, 0.62, 0.02), mat(look.apron || '#2f5d50', { r: 0.9 }), 0, 0.17, 0.13, torso);
  }
  mesh(cylGeo(0.06, 0.07, 0.08, 10), skin, 0, 0.62, 0, torso);
  const head = mesh(sphGeo(0.13), skin, 0, 0.77, 0, torso);
  head.scale.set(1, 1.08, 1);
  const hair = mat(look.hair, { r: 0.9 });
  if (look.hairStyle === 0) {
    const h = mesh(cached('hairCap', () => new THREE.SphereGeometry(0.137, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), hair, 0, 0.79, -0.005, torso);
    h.rotation.x = -0.25;
  } else if (look.hairStyle === 1) {
    mesh(cached('hairCap', () => new THREE.SphereGeometry(0.137, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), hair, 0, 0.79, -0.01, torso).rotation.x = -0.3;
    mesh(boxGeo(0.26, 0.24, 0.08), hair, 0, 0.6, -0.1, torso);
  } else {
    mesh(cached('hairCap', () => new THREE.SphereGeometry(0.137, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), hair, 0, 0.79, 0, torso).rotation.x = -0.15;
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
    mesh(limbGeo(0.09, 0.26, 0.1), skin, 0, 0, 0, fore);
    arms.push({ arm, fore });
  }
  // Becher bzw. Tüte in der rechten Hand
  const cup = new THREE.Group();
  cup.position.set(0, -0.27, 0.05);
  arms[1].fore.add(cup);
  mesh(cylGeo(0.04, 0.032, 0.11, 10), mat('#f4ece0', { r: 0.6 }), 0, 0, 0, cup);
  mesh(cylGeo(0.042, 0.042, 0.02, 10), mat('#2f5d50', { r: 0.6 }), 0, 0.06, 0, cup);
  cup.visible = false;
  const bag = mesh(boxGeo(0.14, 0.16, 0.08), mat('#c9a77a', { r: 0.9 }), 0, -0.36, 0.02, arms[1].fore);
  bag.visible = false;

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.userData.rig = { body, hips, torso, legs, arms, cup, bag };
  return root;
}

// Pose setzen: walk = Gangphase (rad), amount = Schrittweite 0..1, sit, work
export function posePerson(person, { walk = 0, amount = 0, sit = false, work = 0, carry = null, t = 0 }) {
  const r = person.userData.rig;
  r.cup.visible = carry === 'cup';
  r.bag.visible = carry === 'bag';
  if (sit) {
    r.hips.position.y = 0.48; r.torso.position.y = 0.48;
    for (const l of r.legs) { l.thigh.rotation.x = -Math.PI / 2; l.shin.rotation.x = Math.PI / 2; }
    r.arms[0].arm.rotation.x = -0.5; r.arms[0].fore.rotation.x = -0.6;
    r.arms[1].arm.rotation.x = -0.5 - (carry === 'cup' ? 0.4 + Math.max(0, Math.sin(t * 0.8)) * 0.6 : 0);
    r.arms[1].fore.rotation.x = -0.9 - (carry === 'cup' ? Math.max(0, Math.sin(t * 0.8)) * 0.7 : 0);
    r.torso.rotation.x = -0.05;
    return;
  }
  r.hips.position.y = 0.84; r.torso.position.y = 0.84 + Math.abs(Math.sin(walk)) * 0.03 * amount;
  r.torso.rotation.x = 0;
  const s = Math.sin(walk) * 0.55 * amount;
  r.legs[0].thigh.rotation.x = s; r.legs[1].thigh.rotation.x = -s;
  r.legs[0].shin.rotation.x = Math.max(0, -Math.cos(walk)) * 0.7 * amount;
  r.legs[1].shin.rotation.x = Math.max(0, Math.cos(walk)) * 0.7 * amount;
  r.arms[0].arm.rotation.x = -s * 0.8; r.arms[0].fore.rotation.x = -0.15;
  if (carry) { r.arms[1].arm.rotation.x = carry === 'cup' ? -0.35 : 0; r.arms[1].fore.rotation.x = carry === 'cup' ? -1.1 : 0; }
  else { r.arms[1].arm.rotation.x = s * 0.8; r.arms[1].fore.rotation.x = -0.15; }
  if (work) {
    const w = Math.sin(t * 6) * 0.25;
    r.arms[0].arm.rotation.x = -0.9 + w; r.arms[0].fore.rotation.x = -0.7;
    r.arms[1].arm.rotation.x = -0.9 - w; r.arms[1].fore.rotation.x = -0.7;
  }
}
