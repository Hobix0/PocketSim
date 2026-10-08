// Modelle: prozedurale Platzhalter im Stil einer Low-Poly-Fabrikhalle.
// Liegt unter models/ ein GLB (siehe models/README.md), wird stattdessen das GLB verwendet.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { ITEMS, CONFIG } from './data.js';

const BH = CONFIG.beltHeight;

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...opts }));
  return matCache.get(key);
}

export const MAT = {
  white: mat(0xe3e6e9),
  light: mat(0xc9ced4),
  gray: mat(0x8e959d),
  base: mat(0x3b4047, { roughness: 0.8 }),
  steel: mat(0xa4adb7, { metalness: 0.65, roughness: 0.35 }),
  dark: mat(0x23272c, { metalness: 0.3, roughness: 0.5 }),
  blue: mat(0x2f5fa8),
  yellow: mat(0xf2b632),
  green: mat(0x4f9a5a),
  red: mat(0xc8352b),
  orange: mat(0xee6018),
  wood: mat(0xb98a55, { roughness: 0.85 }),
  cardboard: mat(0xc9a26b, { roughness: 0.9 }),
  rubber: mat(0x1b1d20, { roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fc3dd, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 }),
  window: new THREE.MeshStandardMaterial({ color: 0x2b3440, emissive: 0xcfe3ff, emissiveIntensity: 0.15 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xf4f1e8, emissive: 0xfff2d6, emissiveIntensity: 1.2 }),
};

function add(g, geo, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
// Unterkante auf y
const box = (g, w, h, d, m, x = 0, y = 0, z = 0) => add(g, new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
const rbox = (g, w, h, d, m, x = 0, y = 0, z = 0, r = 0.05) => add(g, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), m, x, y + h / 2, z);
const cyl = (g, rt, rb, h, seg, m, x = 0, y = 0, z = 0) => add(g, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z);
const hcyl = (g, r, len, m, x, y, z, axis = 'x', seg = 16) => {
  const geo = new THREE.CylinderGeometry(r, r, len, seg);
  if (axis === 'x') geo.rotateZ(Math.PI / 2); else geo.rotateX(Math.PI / 2);
  return add(g, geo, m, x, y, z);
};

// Bodenplatte mit Warnmarkierung
function plinth(g, s, h = 0.06) {
  box(g, s - 0.08, h, s - 0.08, MAT.base);
  const t = 0.05, w = s - 0.08;
  for (const [x, z, a, b] of [[0, -w / 2 + t / 2, w, t], [0, w / 2 - t / 2, w, t], [-w / 2 + t / 2, 0, t, w], [w / 2 - t / 2, 0, t, w]]) box(g, a, 0.004, b, MAT.yellow, x, h, z);
}

// Signalsäule: zeigt den Maschinenzustand (grün = läuft, orange = blockiert)
function stackLight(g, x, z, y = 0) {
  cyl(g, 0.025, 0.025, 0.5, 8, MAT.dark, x, y, z);
  const m = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x000000, emissiveIntensity: 2, roughness: 0.3 });
  const lamp = cyl(g, 0.045, 0.045, 0.12, 12, m, x, y + 0.5, z);
  cyl(g, 0.05, 0.05, 0.02, 12, MAT.dark, x, y + 0.62, z);
  g.userData.statusLamp = lamp;
  return lamp;
}

// Bedienpult mit Bildschirm
function panel(g, x, z, rot = 0) {
  const p = new THREE.Group();
  cyl(p, 0.04, 0.04, 0.9, 8, MAT.gray, 0, 0, 0);
  const head = rbox(p, 0.3, 0.22, 0.08, MAT.light, 0, 0.9, 0, 0.02);
  head.rotation.x = -0.4;
  const screen = new THREE.MeshStandardMaterial({ color: 0x0c1218, emissive: 0x6fb2ff, emissiveIntensity: 0.4 });
  const sc = box(p, 0.22, 0.13, 0.005, screen, 0, 0.94, -0.045);
  sc.rotation.x = -0.4;
  const btn = cyl(p, 0.02, 0.02, 0.02, 8, MAT.red, 0.1, 0.86, -0.06);
  btn.rotation.x = Math.PI / 2 - 0.4;
  p.position.set(x, 0.06, z);
  p.rotation.y = rot;
  g.add(p);
  g.userData.screen = screen;
}

// Auslaufschurre an der Vorderseite (Ausgang)
function chute(g, s) {
  const c = rbox(g, 0.36, 0.06, 0.4, MAT.steel, 0, BH - 0.12, -s / 2 + 0.22, 0.02);
  c.rotation.x = -0.15;
}

function worker(g, x, z, rot = 0, vest = MAT.orange) {
  const w = new THREE.Group();
  add(w, new THREE.CapsuleGeometry(0.07, 0.42, 4, 8), MAT.dark, -0.06, 0.3, 0);
  add(w, new THREE.CapsuleGeometry(0.07, 0.42, 4, 8), MAT.dark, 0.06, 0.3, 0);
  add(w, new THREE.CapsuleGeometry(0.15, 0.32, 4, 10), vest, 0, 0.88, 0);
  add(w, new THREE.SphereGeometry(0.1, 12, 10), mat(0xd9a77f), 0, 1.24, 0);
  add(w, new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.yellow, 0, 1.27, 0);
  const armL = add(w, new THREE.CapsuleGeometry(0.045, 0.36, 4, 6), vest, -0.2, 0.86, -0.08);
  const armR = add(w, new THREE.CapsuleGeometry(0.045, 0.36, 4, 6), vest, 0.2, 0.86, -0.08);
  armL.rotation.x = armR.rotation.x = -0.6;
  w.position.set(x, 0, z);
  w.rotation.y = rot;
  g.add(w);
  return { w, armL, armR };
}

const signCache = new Map();
function signTexture(text) {
  if (signCache.has(text)) return signCache.get(text);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#101010'; x.fillRect(0, 0, 512, 96);
  x.fillStyle = '#ee6018'; x.beginPath(); x.arc(40, 48, 9, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#eeeeee'; x.font = '500 44px "Geist Mono", monospace'; x.textBaseline = 'middle';
  x.fillText(text, 70, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  signCache.set(text, t);
  return t;
}

function glowMat(color = 0xff6a1a) {
  return new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: color, emissiveIntensity: 0.1 });
}

const lerpTo = (m, target, k = 0.1) => { m.emissiveIntensity += (target - m.emissiveIntensity) * k; };

// Jeder Builder füllt eine Group; Vorderseite (Ausgang) zeigt nach −z.
const BUILDERS = {
  saege(g) {
    plinth(g, 2);
    rbox(g, 1.5, 0.75, 0.8, MAT.blue, 0, 0.06, 0.25);
    rbox(g, 1.6, 0.06, 0.9, MAT.steel, 0, 0.8, 0.25, 0.02);
    rbox(g, 0.5, 1.4, 0.35, MAT.white, -0.45, 0.86, 0.4);
    const w1 = hcyl(g, 0.24, 0.12, MAT.gray, -0.45, 1.35, 0.4, 'z');
    rbox(g, 0.18, 0.5, 0.3, MAT.white, 0.35, 0.86, 0.4);
    box(g, 0.02, 0.5, 0.02, MAT.steel, 0.35, 0.86, 0.22);
    hcyl(g, 0.12, 1.3, MAT.steel, 0.1, 0.92, 0.25, 'x');
    stackLight(g, 0.82, 0.82, 0.06);
    panel(g, 0.75, -0.25, -0.6);
    chute(g, 2);
    g.userData.update = (t, e) => { if (e?._active) w1.rotation.z -= 0.4; };
    g.userData.sparks = [new THREE.Vector3(0.35, 0.9, 0.25)];
  },

  drehbank(g) {
    plinth(g, 2);
    for (const x of [-0.6, 0.6]) rbox(g, 0.3, 0.55, 0.5, MAT.light, x, 0.06, 0.3);
    rbox(g, 1.7, 0.18, 0.55, MAT.white, 0, 0.6, 0.3);
    box(g, 1.6, 0.04, 0.12, MAT.steel, 0, 0.78, 0.2);
    rbox(g, 0.45, 0.45, 0.5, MAT.blue, -0.6, 0.78, 0.3);
    const chuck = hcyl(g, 0.12, 0.12, MAT.steel, -0.31, 1.0, 0.3, 'x');
    const work = hcyl(g, 0.04, 0.7, MAT.steel, 0.05, 1.0, 0.3, 'x', 10);
    rbox(g, 0.25, 0.3, 0.35, MAT.blue, 0.65, 0.78, 0.3);
    const carriage = new THREE.Group();
    rbox(carriage, 0.22, 0.14, 0.4, MAT.light, 0, 0, 0);
    box(carriage, 0.05, 0.06, 0.18, MAT.dark, 0, 0.14, -0.05);
    carriage.position.set(0, 0.78, 0.3);
    g.add(carriage);
    rbox(g, 0.4, 0.6, 0.02, MAT.glass, 0.1, 0.8, 0.05, 0.01);
    stackLight(g, 0.85, 0.85, 0.06);
    panel(g, -0.75, -0.35, 0.5);
    chute(g, 2);
    g.userData.update = (t, e) => {
      if (e?._active) { chuck.rotation.x += 0.6; work.rotation.x += 0.6; carriage.position.x = Math.sin(t * 1.5) * 0.3; }
    };
    g.userData.sparks = [new THREE.Vector3(0, 1.0, 0.25)];
  },

  schmiede(g) {
    plinth(g, 2);
    rbox(g, 1.5, 0.4, 1.1, MAT.dark, 0, 0.06, 0.2);
    for (const x of [-0.55, 0.55]) rbox(g, 0.3, 1.9, 0.6, MAT.red, x, 0.46, 0.2);
    rbox(g, 1.6, 0.45, 0.7, MAT.red, 0, 2.3, 0.2);
    rbox(g, 0.5, 0.25, 0.45, MAT.steel, 0, 0.46, 0.2);
    const billet = rbox(g, 0.18, 0.08, 0.18, glowMat(0xff7a1a), 0, 0.71, 0.2, 0.02);
    const ram = new THREE.Group();
    rbox(ram, 0.55, 0.45, 0.5, MAT.dark, 0, 0, 0);
    cyl(ram, 0.07, 0.07, 0.8, 10, MAT.steel, 0, 0.45, 0);
    ram.position.set(0, 1.4, 0.2);
    g.add(ram);
    stackLight(g, 0.85, 0.85, 0.06);
    panel(g, -0.8, -0.4, 0.4);
    chute(g, 2);
    g.userData.update = (t, e) => {
      const a = e?._active;
      const ph = (t * 1.4) % 1;
      ram.position.y = a ? (ph < 0.15 ? 1.4 - ph / 0.15 * 0.6 : 0.8 + (ph - 0.15) / 0.85 * 0.6) : 1.4;
      lerpTo(billet.material, a ? 3 : 0.05);
    };
    g.userData.sparks = [new THREE.Vector3(0, 0.8, 0.2)];
  },

  haerteofen(g) {
    plinth(g, 2);
    rbox(g, 1.5, 1.3, 1.3, MAT.light, 0, 0.06, 0.25, 0.08);
    rbox(g, 1.55, 0.12, 1.35, MAT.dark, 0, 1.36, 0.25, 0.03);
    const glow = glowMat(0xff5a10);
    rbox(g, 0.9, 0.06, 0.04, glow, 0, 0.75, -0.42, 0.01);
    rbox(g, 1.0, 0.7, 0.06, MAT.gray, 0, 0.3, -0.42, 0.03);
    cyl(g, 0.12, 0.12, 1.0, 12, MAT.steel, 0.5, 1.48, 0.6);
    box(g, 0.02, 0.6, 1.0, MAT.gray, 0.76, 0.4, 0.25);
    stackLight(g, -0.82, 0.85, 0.06);
    panel(g, 0.8, -0.45, -0.4);
    g.userData.smoke = [new THREE.Vector3(0.5, 2.5, 0.6)];
    g.userData.update = (t, e) => lerpTo(glow, e?._active ? 3 + Math.sin(t * 6) * 0.5 : 0.1, 0.08);
  },

  schleifen(g) {
    plinth(g, 2);
    rbox(g, 1.1, 0.8, 0.8, MAT.green, 0, 0.06, 0.25);
    rbox(g, 1.2, 0.06, 0.9, MAT.steel, 0, 0.86, 0.25, 0.02);
    const wheel = hcyl(g, 0.22, 0.1, MAT.gray, 0, 1.15, 0.25, 'x', 20);
    rbox(g, 0.3, 0.32, 0.5, MAT.light, -0.17, 0.92, 0.25);
    rbox(g, 0.3, 0.32, 0.5, MAT.light, 0.4, 0.92, 0.25);
    stackLight(g, 0.82, 0.85, 0.06);
    worker(g, -0.55, -0.45, Math.PI * 0.85);
    chute(g, 2);
    g.userData.update = (t, e) => { if (e?._active) wheel.rotation.x -= 0.7; };
    g.userData.sparks = [new THREE.Vector3(0, 1.0, 0.0)];
  },

  stanze(g) {
    plinth(g, 2);
    rbox(g, 1.3, 0.55, 1.0, MAT.blue, 0, 0.06, 0.2);
    rbox(g, 0.5, 1.9, 0.5, MAT.blue, 0, 0.06, 0.6);
    rbox(g, 1.0, 0.4, 0.75, MAT.blue, 0, 1.6, 0.35);
    rbox(g, 0.9, 0.08, 0.6, MAT.steel, 0, 0.61, 0.15, 0.02);
    const ram = rbox(g, 0.5, 0.3, 0.4, MAT.steel, 0, 1.2, 0.15, 0.03);
    stackLight(g, 0.82, 0.85, 0.06);
    panel(g, 0.75, -0.4, -0.4);
    chute(g, 2);
    g.userData.update = (t, e) => {
      const k = e?._active ? Math.pow(Math.abs(Math.sin(t * 5)), 6) : 0;
      ram.position.y = 1.35 - k * 0.6;
    };
  },

  kantbank(g) {
    plinth(g, 2);
    for (const x of [-0.75, 0.75]) rbox(g, 0.25, 1.7, 0.7, MAT.white, x, 0.06, 0.3);
    rbox(g, 1.3, 0.3, 0.3, MAT.base, 0, 0.06, 0.3);
    rbox(g, 1.3, 0.12, 0.12, MAT.steel, 0, 0.36, 0.3);
    const beam = rbox(g, 1.3, 0.5, 0.25, MAT.yellow, 0, 1.0, 0.3);
    stackLight(g, 0.82, 0.85, 0.06);
    worker(g, 0.35, -0.5, Math.PI);
    chute(g, 2);
    g.userData.update = (t, e) => {
      const k = e?._active ? Math.pow(Math.abs(Math.sin(t * 2)), 4) : 0;
      beam.position.y = 1.25 - k * 0.38;
    };
  },

  spritzguss(g) {
    plinth(g, 2);
    rbox(g, 1.8, 0.6, 0.7, MAT.white, 0, 0.06, 0.3);
    rbox(g, 0.7, 0.55, 0.65, MAT.green, -0.5, 0.66, 0.3);
    const clamp = rbox(g, 0.25, 0.55, 0.6, MAT.steel, 0.15, 0.66, 0.3);
    rbox(g, 0.35, 0.65, 0.65, MAT.green, 0.65, 0.66, 0.3);
    for (const z of [0.1, 0.5]) hcyl(g, 0.03, 1.1, MAT.steel, 0.3, 1.12, z, 'x', 8);
    add(g, new THREE.ConeGeometry(0.2, 0.35, 12).rotateX(Math.PI), MAT.light, -0.65, 1.42, 0.3);
    cyl(g, 0.2, 0.2, 0.25, 12, MAT.light, -0.65, 1.42, 0.3);
    stackLight(g, 0.85, 0.85, 0.06);
    panel(g, -0.8, -0.4, 0.4);
    chute(g, 2);
    g.userData.update = (t, e) => { clamp.position.x = 0.15 + (e?._active ? Math.sin(t * 2.5) * 0.15 : 0); };
  },

  fraese(g) {
    plinth(g, 2);
    rbox(g, 1.6, 1.6, 1.3, MAT.white, 0, 0.06, 0.2, 0.08);
    rbox(g, 1.1, 0.75, 0.04, MAT.glass, -0.1, 0.65, -0.46, 0.02);
    rbox(g, 1.62, 0.3, 1.32, MAT.blue, 0, 0.06, 0.2, 0.05);
    const spindle = new THREE.Group();
    rbox(spindle, 0.2, 0.4, 0.2, MAT.dark, 0, 0, 0);
    cyl(spindle, 0.03, 0.03, 0.15, 8, MAT.steel, 0, -0.15, 0);
    spindle.position.set(-0.1, 0.85, 0.05);
    g.add(spindle);
    box(g, 0.7, 0.04, 0.4, MAT.steel, -0.1, 0.62, 0.05);
    const screen = new THREE.MeshStandardMaterial({ color: 0x0c1218, emissive: 0x6fb2ff, emissiveIntensity: 0.4 });
    box(g, 0.25, 0.3, 0.02, screen, 0.62, 0.9, -0.46);
    g.userData.screen = screen;
    stackLight(g, 0.6, 0.6, 1.66);
    chute(g, 2);
    g.userData.update = (t, e) => {
      if (e?._active) { spindle.position.x = -0.1 + Math.sin(t * 1.7) * 0.25; spindle.position.z = 0.05 + Math.cos(t * 2.3) * 0.12; spindle.rotation.y += 0.8; }
    };
  },

  wickel(g) {
    plinth(g, 2);
    rbox(g, 1.4, 0.6, 0.9, MAT.light, 0, 0.06, 0.25);
    for (const x of [-0.55, 0.55]) rbox(g, 0.12, 0.7, 0.4, MAT.blue, x, 0.66, 0.25);
    const drum = hcyl(g, 0.22, 0.9, mat(0xc8733a, { metalness: 0.6, roughness: 0.3 }), 0, 1.05, 0.25, 'x', 20);
    hcyl(g, 0.28, 0.04, MAT.dark, -0.45, 1.05, 0.25, 'x', 20);
    hcyl(g, 0.28, 0.04, MAT.dark, 0.45, 1.05, 0.25, 'x', 20);
    stackLight(g, 0.82, 0.85, 0.06);
    panel(g, -0.8, -0.4, 0.4);
    chute(g, 2);
    g.userData.update = (t, e) => { if (e?._active) drum.rotation.x += 0.5; };
  },

  werkbank(g) {
    plinth(g, 2);
    rbox(g, 1.7, 0.06, 0.8, MAT.wood, 0, 0.85, 0.3, 0.02);
    for (const x of [-0.78, 0.78]) for (const z of [-0.05, 0.65]) box(g, 0.05, 0.8, 0.05, MAT.gray, x, 0.06, z);
    rbox(g, 1.6, 0.04, 0.7, MAT.gray, 0, 0.3, 0.3, 0.01);
    box(g, 1.7, 0.7, 0.04, MAT.blue, 0, 0.91, 0.7);
    for (let i = 0; i < 5; i++) box(g, 0.04, 0.22, 0.02, MAT.dark, -0.6 + i * 0.3, 1.2, 0.67);
    box(g, 0.25, 0.12, 0.2, MAT.red, 0.55, 0.91, 0.35);
    const parts = rbox(g, 0.16, 0.06, 0.16, MAT.steel, -0.2, 0.91, 0.3, 0.02);
    const wk = worker(g, 0, -0.35, Math.PI);
    g.userData.update = (t, e) => {
      const a = e?._active;
      wk.armR.rotation.x = -0.6 - (a ? Math.abs(Math.sin(t * 4)) * 0.6 : 0);
      wk.armL.rotation.x = -0.6 - (a ? Math.abs(Math.sin(t * 4 + 1.5)) * 0.3 : 0);
      parts.visible = !!a;
    };
  },

  montage(g) {
    plinth(g, 3);
    const fence = mat(0xf2b632, { transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    for (const [x, z, w, d] of [[0, 1.42, 2.84, 0.02], [-1.42, 0, 0.02, 2.84], [1.42, 0, 0.02, 2.84], [-0.95, -1.42, 0.9, 0.02], [0.95, -1.42, 0.9, 0.02]]) {
      const f = box(g, w, 1.2, d, fence, x, 0.1, z);
      f.castShadow = false;
    }
    for (const [x, z] of [[-1.42, -1.42], [1.42, -1.42], [-1.42, 1.42], [1.42, 1.42], [-0.5, -1.42], [0.5, -1.42]]) box(g, 0.05, 1.3, 0.05, MAT.yellow, x, 0.06, z);
    rbox(g, 0.9, 0.45, 2.2, MAT.light, 0, 0.06, 0.2);
    for (let i = 0; i < 9; i++) hcyl(g, 0.03, 0.8, MAT.steel, 0, 0.53, -0.7 + i * 0.22, 'x', 8);
    const arms = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      cyl(arm, 0.18, 0.22, 0.25, 16, MAT.orange);
      const j1 = new THREE.Group(); j1.position.y = 0.25; arm.add(j1);
      cyl(j1, 0.12, 0.12, 0.18, 14, MAT.orange);
      const up = new THREE.Group(); up.position.y = 0.15; j1.add(up);
      rbox(up, 0.12, 0.7, 0.12, MAT.orange, 0, 0, 0, 0.04);
      const fore = new THREE.Group(); fore.position.y = 0.7; up.add(fore);
      hcyl(fore, 0.07, 0.14, MAT.dark, 0, 0, 0, 'x', 10);
      rbox(fore, 0.09, 0.55, 0.09, MAT.orange, 0, 0, 0, 0.03);
      box(fore, 0.12, 0.08, 0.08, MAT.dark, 0, 0.55, 0);
      up.rotation.z = side * 0.4;
      fore.rotation.z = side * 1.2;
      arm.position.set(side * 0.95, 0.06, 0.2);
      g.add(arm);
      arms.push({ j1, up, fore, side });
    }
    stackLight(g, 1.3, 1.3, 0.06);
    panel(g, 1.1, -1.65, 0);
    chute(g, 3);
    g.userData.update = (t, e) => {
      if (!e?._active) return;
      for (const { j1, up, fore, side } of arms) {
        j1.rotation.y = Math.sin(t * 1.3 + side) * 0.9;
        up.rotation.z = side * (0.4 + Math.sin(t * 2.1 + side) * 0.25);
        fore.rotation.z = side * (1.2 + Math.sin(t * 2.6) * 0.3);
      }
    };
    g.userData.sparks = [new THREE.Vector3(0, 0.7, 0.2)];
  },

  // Palettenregal: 3 Ebenen × 2 Plätze, zeigt die eingelagerten Paletten
  regal(g) {
    for (const x of [-0.92, 0.92]) for (const z of [-0.42, 0.42]) box(g, 0.07, 2.5, 0.07, MAT.blue, x, 0, z);
    for (const y of [0.02, 0.87, 1.72]) for (const z of [-0.42, 0.42]) box(g, 1.9, 0.08, 0.05, MAT.orange, 0, y, z);
    for (const x of [-0.92, 0.92]) for (const y of [0.5, 1.3, 2.1]) {
      const d = box(g, 0.03, 0.03, 0.84, MAT.blue, x, y, 0);
      d.rotation.x = 0.6;
    }
    const slots = [];
    for (let i = 0; i < 6; i++) {
      const p = makePallet();
      p.position.set(i % 2 ? 0.45 : -0.45, [0.1, 0.95, 1.8][Math.floor(i / 2)], 0);
      g.add(p);
      slots.push(p);
    }
    g.userData.update = (t, e) => {
      slots.forEach((p, i) => setPallet(p, e ? e.slots[i] : (i < 3 ? { item: 'rundstahl', qty: 20 } : null)));
    };
  },

  // Aufgabestation: Paletten hinten, Pickplatz mit Rollenbahn vorne (Bandseite)
  aufgabe(g) { station2(g, 'feeder'); },
  abnahme(g) { station2(g, 'collector'); },

  // Staplerstation: Parkfläche mit Ladesäule
  station(g) {
    const mark = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7 });
    for (const [x, z, w, d] of [[0, -0.95, 1.9, 0.08], [0, 0.95, 1.9, 0.08], [-0.95, 0, 0.08, 1.9], [0.95, 0, 0.08, 1.9]]) box(g, w, 0.01, d, mark, x, 0, z);
    box(g, 0.04, 0.008, 1.7, mat(0xeeeeee), 0, 0, 0);
    const post = new THREE.Group();
    rbox(post, 0.3, 1.3, 0.22, MAT.light, 0, 0, 0, 0.04);
    const screen = new THREE.MeshStandardMaterial({ color: 0x0c1218, emissive: 0x3ddc84, emissiveIntensity: 0.6 });
    box(post, 0.18, 0.12, 0.01, screen, 0, 1.0, -0.115);
    box(post, 0.05, 0.4, 0.05, MAT.dark, 0.08, 0.5, -0.13);
    post.position.set(0, 0, 0.82);
    g.add(post);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: letterTexture('P') }));
    sign.position.set(0, 1.5, 0.82); sign.rotation.y = Math.PI;
    g.add(sign);
    const back = sign.clone(); back.rotation.y = 0; back.position.z = 0.84;
    g.add(back);
  },

  // Rolltore: Rückseite (+z) liegt an der Außenwand
  eingang(g) { dock(g, 'WARENEINGANG', MAT.green); },
  versand(g) { dock(g, 'VERSAND', MAT.blue); },

  trafo(g) {
    plinth(g, 2);
    rbox(g, 1.5, 1.5, 0.8, mat(0x9aa39b), 0, 0.06, 0.45, 0.04);
    for (let i = 0; i < 4; i++) box(g, 0.02, 1.2, 0.02, MAT.dark, -0.55 + i * 0.37, 0.2, 0.04);
    const warn = add(g, new THREE.CircleGeometry(0.13, 3), MAT.yellow, 0, 1.3, 0.04);
    warn.rotation.set(0, Math.PI, Math.PI / 2);
    box(g, 1.8, 0.08, 0.3, MAT.gray, 0, 2.2, 0.75);
    for (const x of [-0.5, 0, 0.5]) cyl(g, 0.05, 0.08, 0.3, 10, mat(0xc6d7e3), x, 1.56, 0.45);
  },

  verteiler(g) {
    legs(g);
    rbox(g, 0.9, 0.12, 0.9, MAT.light, 0, BH - 0.17, 0, 0.03);
    const disc = cyl(g, 0.38, 0.38, 0.05, 24, MAT.steel, 0, BH - 0.05, 0);
    for (let d = 0; d < 4; d++) {
      const a = add(g, new THREE.ConeGeometry(0.07, 0.14, 3).rotateX(-Math.PI / 2), MAT.orange, Math.sin(d * Math.PI / 2) * 0.36, BH - 0.1, -Math.cos(d * Math.PI / 2) * 0.36);
      a.rotation.y = -d * Math.PI / 2;
    }
    g.userData.update = (t, e) => { if (e?.buf) disc.rotation.y += 0.08; };
  },

  kreuzung(g) {
    legs(g);
    rbox(g, 0.9, 0.12, 0.9, MAT.light, 0, BH - 0.17, 0, 0.03);
    for (let i = 0; i < 5; i++) hcyl(g, 0.03, 0.8, MAT.steel, 0, BH - 0.03, -0.32 + i * 0.16, 'x', 8);
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) box(g, 0.08, 0.15, 0.08, MAT.yellow, x, BH - 0.05, z);
  },

  // ── Altbestand
  altregal(g) {
    for (const x of [-0.9, 0.9]) for (const z of [-0.35, 0.35]) box(g, 0.06, 2.4, 0.06, MAT.blue, x, 0, z);
    for (const y of [0.3, 1.1, 1.9]) box(g, 1.85, 0.05, 0.75, MAT.gray, 0, y, 0);
    const cols = [MAT.cardboard, MAT.green, MAT.red, MAT.cardboard, MAT.white];
    let k = 0;
    for (const y of [0.35, 1.15, 1.95]) for (let i = 0; i < 4; i++) {
      if ((k * 7) % 5 === 1) { k++; continue; }
      const h = 0.25 + ((k * 13) % 4) * 0.08;
      rbox(g, 0.36, h, 0.5, cols[k % cols.length], -0.66 + i * 0.44, y, 0, 0.02);
      k++;
    }
  },

  altbuero(g) {
    box(g, 2.9, 0.08, 2.9, mat(0x6d737a));
    const wall = mat(0xd5d9de);
    box(g, 2.9, 2.4, 0.08, wall, 0, 0, 1.41);
    box(g, 0.08, 2.4, 2.9, wall, 1.41, 0, 0);
    box(g, 0.08, 2.4, 2.9, wall, -1.41, 0, 0);
    box(g, 2.9, 0.9, 0.08, wall, 0, 0, -1.41);
    box(g, 2.9, 0.25, 0.08, wall, 0, 2.15, -1.41);
    box(g, 2.0, 1.25, 0.03, MAT.glass, 0.3, 0.9, -1.41);
    box(g, 0.6, 2.1, 0.06, MAT.blue, -1.05, 0, -1.43);
    box(g, 1.2, 0.05, 0.6, MAT.wood, 0.4, 0.72, 0.6);
    rbox(g, 0.3, 0.2, 0.05, MAT.dark, 0.4, 0.77, 0.75, 0.01);
    box(g, 0.5, 0.05, 0.5, MAT.dark, 0.4, 0.45, 0.0);
    for (let i = 0; i < 3; i++) rbox(g, 0.45, 1.6, 0.5, MAT.light, -0.85, 0.08, 1.1 - i * 0.55, 0.02);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.26), new THREE.MeshBasicMaterial({ map: signTexture('MEISTERBÜRO') }));
    sign.position.set(0.3, 2.25, -1.46); sign.rotation.y = Math.PI;
    g.add(sign);
  },

  palette(g) {
    box(g, 0.85, 0.12, 0.85, MAT.wood);
    rbox(g, 0.8, 0.55, 0.8, MAT.cardboard, 0, 0.12, 0, 0.03);
    box(g, 0.82, 0.04, 0.82, mat(0xdde3ea, { transparent: true, opacity: 0.6 }), 0, 0.5, 0);
  },

};

function legs(g) {
  for (const x of [-0.36, 0.36]) {
    box(g, 0.05, BH - 0.12, 0.05, MAT.gray, x, 0, 0);
    box(g, 0.14, 0.02, 0.14, MAT.dark, x, 0, 0);
  }
}

function dock(g, label, accent) {
  const stripe = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7 });
  for (const x of [-0.95, 0.95]) box(g, 0.12, 2.6, 0.2, stripe, x, 0, 0.88);
  box(g, 2.0, 0.2, 0.2, stripe, 0, 2.6, 0.88);
  const door = new THREE.Group();
  for (let i = 0; i < 9; i++) box(door, 1.78, 0.1, 0.05, mat(0xb8bec5, { metalness: 0.4, roughness: 0.4 }), 0, i * 0.105, 0);
  door.position.set(0, 1.65, 0.95);
  g.add(door);
  box(g, 1.78, 0.2, 0.3, MAT.gray, 0, 2.6, 0.95);
  box(g, 1.8, 0.05, 1.0, MAT.steel, 0, 0, 0.45);
  for (const x of [-0.85, 0.85]) box(g, 0.08, 0.051, 0.9, MAT.yellow, x, 0, 0.45);
  const pallets = [];
  for (let i = 0; i < 3; i++) {
    const p = makePallet();
    p.position.set(-0.55 + i * 0.55, 0.05, i === 1 ? -0.45 : 0.3);
    p.scale.setScalar(0.62);
    g.add(p);
    pallets.push(p);
  }
  if (label === 'VERSAND') {
    const stub = new THREE.Group();
    legs(stub);
    rbox(stub, 0.9, 0.08, 1.0, MAT.light, 0, BH - 0.13, 0, 0.02);
    for (let i = 0; i < 5; i++) hcyl(stub, 0.03, 0.8, MAT.steel, 0, BH - 0.03, -0.4 + i * 0.2, 'x', 8);
    stub.position.set(0.45, 0, -0.45);
    g.add(stub);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28), new THREE.MeshBasicMaterial({ map: signTexture(label) }));
  sign.position.set(0, 3.0, 0.77);
  g.add(sign);
  box(g, 0.3, 0.05, 0.02, accent, 0.55, 2.82, 0.77);
  g.userData.update = (t, e) => {
    const open = e?._recent > 0 || e?._active;
    door.position.y += ((open ? 2.05 : 1.6) - door.position.y) * 0.05;
    pallets.forEach((p, i) => setPallet(p, label === 'VERSAND' ? null : e ? e.dock[i] : (i === 0 ? { item: 'rundstahl', qty: 20 } : null)));
  };
}

// Aufgabe-/Abnahmestation (2 × 2): hinten zwei Palettenplätze, vorne Pickplatz an der Bandseite
function station2(g, kind) {
  plinth(g, 2);
  const spot = new THREE.MeshStandardMaterial({ color: kind === 'feeder' ? 0x4f9a5a : 0x2f5fa8, roughness: 0.8 });
  for (const x of [-0.45, 0.45]) box(g, 0.86, 0.004, 0.86, spot, x, 0.06, 0.45);
  const pallets = [];
  for (const x of [-0.45, 0.45]) {
    const p = makePallet();
    p.position.set(x, 0.065, 0.45);
    p.scale.setScalar(0.95);
    g.add(p);
    pallets.push(p);
  }
  // Pickplatz: kurze Rollenbahn quer zur Vorderkante
  const table = new THREE.Group();
  for (const x of [-0.7, 0.7]) box(table, 0.05, BH - 0.1, 0.05, MAT.gray, x, 0, 0);
  rbox(table, 1.7, 0.06, 0.7, MAT.light, 0, BH - 0.12, 0, 0.02);
  for (let i = 0; i < 7; i++) hcyl(table, 0.028, 0.66, MAT.steel, -0.72 + i * 0.24, BH - 0.03, 0, 'z', 8);
  table.position.set(0, 0, -0.5);
  g.add(table);
  const wk = worker(g, 0.75, 0.0, kind === 'feeder' ? -Math.PI / 2 : -Math.PI / 2, kind === 'feeder' ? MAT.green : MAT.blue);
  wk.w.scale.setScalar(0.9);
  const part = rbox(g, 0.16, 0.08, 0.14, MAT.steel, 0, BH, -0.5, 0.02);
  g.userData.update = (t, e) => {
    const list = e ? e.pallets : [{ item: 'rundstahl', qty: 14 }];
    pallets.forEach((p, i) => setPallet(p, list[i]));
    const a = e?._active;
    wk.armR.rotation.x = -0.6 - (a ? Math.abs(Math.sin(t * 3)) * 0.8 : 0);
    wk.w.rotation.y = -Math.PI / 2 + (a ? Math.sin(t * 1.5) * 0.6 : 0);
    part.visible = !!a;
    if (a && list[0]) part.material = palletLoadMat(list[0].item);
  };
}

// ───────────────────────── Paletten
const loadMats = new Map();
export function palletLoadMat(item) {
  if (!loadMats.has(item)) {
    const c = new THREE.Color(ITEMS[item].color).lerp(new THREE.Color(0xc9a26b), 0.35);
    loadMats.set(item, new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }));
  }
  return loadMats.get(item);
}
const itemTopCache = new Map();

export function makePallet() {
  const p = new THREE.Group();
  box(p, 0.82, 0.12, 0.82, MAT.wood);
  for (const x of [-0.3, 0, 0.3]) box(p, 0.1, 0.02, 0.82, mat(0x8f6a40), x, 0.12, 0);
  const load = rbox(p, 0.76, 0.44, 0.76, MAT.cardboard, 0, 0.14, 0, 0.03);
  const label = box(p, 0.3, 0.2, 0.005, mat(0xf4f4f0), 0, 0.26, -0.385);
  p.userData = { load, label, item: null };
  p.visible = false;
  return p;
}

export function setPallet(p, pallet) {
  if (!pallet) { p.visible = false; return; }
  p.visible = true;
  const ud = p.userData;
  const h = 0.06 + 0.4 * Math.min(1, pallet.qty / CONFIG.palletQty);
  ud.load.scale.y = h / 0.44;
  ud.load.position.y = 0.14 + h / 2;
  ud.label.position.y = 0.14 + h * 0.55;
  ud.label.visible = pallet.qty > 4;
  if (ud.item !== pallet.item) {
    ud.item = pallet.item;
    ud.load.material = palletLoadMat(pallet.item);
    if (ud.top) p.remove(ud.top);
    let src = itemTopCache.get(pallet.item);
    if (!src) { src = itemSource(pallet.item); itemTopCache.set(pallet.item, src); }
    ud.top = new THREE.Mesh(src.geometry, src.material);
    ud.top.castShadow = true;
    p.add(ud.top);
  }
  ud.top.position.y = 0.14 + h;
  ud.top.visible = pallet.qty > 0;
}

// ───────────────────────── Gabelstapler (fahrendes Fahrzeug, kein Gebäude)
export function buildForklift() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  rbox(body, 0.55, 0.45, 0.8, MAT.yellow, 0, 0.12, 0.1, 0.06);
  rbox(body, 0.5, 0.32, 0.28, MAT.dark, 0, 0.12, 0.47, 0.04);
  for (const [x, z] of [[-0.28, -0.2], [0.28, -0.2], [-0.28, 0.35], [0.28, 0.35]]) hcyl(body, 0.12, 0.1, MAT.rubber, x, 0.12, z, 'x', 14);
  for (const x of [-0.24, 0.24]) for (const z of [-0.12, 0.3]) box(body, 0.03, 0.75, 0.03, MAT.dark, x, 0.57, z);
  box(body, 0.55, 0.03, 0.5, MAT.dark, 0, 1.3, 0.09);
  rbox(body, 0.3, 0.06, 0.3, MAT.dark, 0, 0.6, 0.12, 0.02);
  const light = cyl(body, 0.04, 0.04, 0.05, 10, new THREE.MeshStandardMaterial({ color: 0x663300, emissive: 0xee6018, emissiveIntensity: 2 }), 0, 1.33, 0.2);
  for (const x of [-0.18, 0.18]) box(body, 0.06, 1.6, 0.06, MAT.dark, x, 0.12, -0.32);
  box(body, 0.42, 0.05, 0.05, MAT.dark, 0, 1.67, -0.32);
  const drv = worker(body, 0, 0.12, 0, MAT.orange);
  drv.w.scale.setScalar(0.75);
  drv.w.position.y = 0.32;
  g.add(body);
  // Hubschlitten mit Gabeln und Palettenplatz
  const forks = new THREE.Group();
  box(forks, 0.44, 0.35, 0.04, MAT.dark, 0, 0, -0.36);
  for (const x of [-0.14, 0.14]) box(forks, 0.08, 0.03, 0.62, MAT.steel, x, 0, -0.68);
  const carried = makePallet();
  carried.position.set(0, 0.03, -0.7);
  carried.scale.setScalar(0.92);
  forks.add(carried);
  g.add(forks);
  g.userData = { forks, carried, light };
  g.scale.setScalar(1.1);
  return g;
}

let _letters = new Map();
function letterTexture(ch) {
  if (_letters.has(ch)) return _letters.get(ch);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#2f5fa8'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#ffffff'; x.font = '500 96px "Geist", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(ch, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _letters.set(ch, t);
  return t;
}

let _hazard = null;
function hazardTexture() {
  if (_hazard) return _hazard;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#f2b632'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#1b1d20';
  for (let i = -64; i < 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 0); x.lineTo(i + 80, 64); x.lineTo(i + 64, 64); x.fill(); }
  _hazard = new THREE.CanvasTexture(c);
  _hazard.wrapS = _hazard.wrapT = THREE.RepeatWrapping;
  _hazard.repeat.set(1, 4);
  _hazard.colorSpace = THREE.SRGBColorSpace;
  return _hazard;
}
export { hazardTexture };

// ───────────────────────── Externe Modelle (Blender → GLB), siehe models/README.md
export const library = { buildings: {}, items: {} };

export async function loadLibrary(base = 'models/') {
  let manifest;
  try {
    const res = await fetch(base + 'manifest.json', { cache: 'no-cache' });
    if (!res.ok) return library;
    manifest = await res.json();
  } catch { return library; }
  const loader = new GLTFLoader();
  const jobs = [];
  for (const kind of ['buildings', 'items']) {
    for (const [id, file] of Object.entries(manifest[kind] || {})) {
      jobs.push(loader.loadAsync(base + file).then(gltf => {
        gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        library[kind][id] = gltf;
      }).catch(err => console.warn(`Modell ${file} konnte nicht geladen werden`, err)));
    }
  }
  await Promise.all(jobs);
  return library;
}

// Animationen für GLB-Modelle per Namenskonvention (siehe models/README.md)
function rigGltf(g, gltf) {
  const root = skeletonClone(gltf.scene);
  g.add(root);
  const spin = [], spinx = [], bob = [], glow = [];
  root.traverse(o => {
    const n = o.name.toLowerCase();
    if (n.startsWith('spin_')) spin.push(o);
    else if (n.startsWith('spinx_')) spinx.push(o);
    else if (n.startsWith('bob_')) bob.push({ o, y: o.position.y });
    if (n.startsWith('glow_') && o.isMesh) { o.material = o.material.clone(); glow.push(o.material); }
    if (n.startsWith('status_') && o.isMesh) { o.material = o.material.clone(); g.userData.statusLamp = o; }
  });
  let mixer = null;
  if (gltf.animations.length) {
    mixer = new THREE.AnimationMixer(root);
    gltf.animations.forEach(a => mixer.clipAction(a).play());
  }
  g.userData.update = (t, e, dt) => {
    const a = e?._active;
    if (a) {
      spin.forEach(o => { o.rotation.y += 0.3; });
      spinx.forEach(o => { o.rotation.x += 0.3; });
      bob.forEach(b => { b.o.position.y = b.y + Math.sin(t * 6) * 0.1; });
      mixer?.update(dt);
    }
    glow.forEach(m => lerpTo(m, a ? 2.5 : 0.1));
  };
}

export function buildModel(type, e) {
  const g = new THREE.Group();
  const gltf = library.buildings[type];
  if (gltf) rigGltf(g, gltf);
  else BUILDERS[type]?.(g, e);
  g.userData.type = type;
  return g;
}

// ───────────────────────── Rollenbahn
// Form 0 = gerade, 1 = Kurve von links, 2 = Kurve von rechts. Vorne ist −z.
export function beltPathPoint(shape, p, out) {
  if (shape === 0) { out.x = 0; out.z = 0.5 - p; return out; }
  const phi = p * Math.PI / 2;
  const sx = shape === 1 ? 1 : -1;
  out.x = sx * (-0.5 + 0.5 * Math.sin(phi));
  out.z = -0.5 + 0.5 * Math.cos(phi);
  return out;
}

function tangent(shape, p) {
  const a = beltPathPoint(shape, Math.max(0, p - 0.002), { x: 0, z: 0 });
  const b = beltPathPoint(shape, Math.min(1, p + 0.002), { x: 0, z: 0 });
  const l = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
}

// Rahmen (Seitenwangen, Beine) und Rollen getrennt, damit sie eigene Materialien bekommen
export function beltGeometries() {
  return [0, 1, 2].map(shape => {
    const frame = [], rollers = [];
    const n = shape === 0 ? 1 : 8;
    for (const off of [-0.44, 0.44]) {
      const scale = shape === 0 ? 1 : (shape === 1 ? 0.5 + off : 0.5 - off) / 0.5;
      for (let i = 0; i < n; i++) {
        const pm = (i + 0.5) / n;
        const m = beltPathPoint(shape, pm, { x: 0, z: 0 });
        const t = tangent(shape, pm), nx = -t.z, nz = t.x;
        const len = (shape === 0 ? 1 : Math.PI / 4 / n) * scale + (shape === 0 ? 0 : 0.03);
        const geo = new THREE.BoxGeometry(0.04, 0.12, Math.max(0.04, len)).translate(0, BH - 0.07, 0);
        geo.rotateY(Math.atan2(t.x, t.z));
        geo.translate(m.x + nx * off, 0, m.z + nz * off);
        frame.push(geo);
      }
    }
    const mid = beltPathPoint(shape, 0.5, { x: 0, z: 0 }), tm = tangent(shape, 0.5);
    for (const off of [-0.4, 0.4]) {
      const lx = mid.x - tm.z * off, lz = mid.z + tm.x * off;
      frame.push(new THREE.BoxGeometry(0.04, BH - 0.12, 0.04).translate(lx, (BH - 0.12) / 2, lz));
      frame.push(new THREE.BoxGeometry(0.12, 0.015, 0.12).translate(lx, 0.0075, lz));
    }
    const cross = new THREE.BoxGeometry(0.8, 0.03, 0.03);
    cross.rotateY(Math.atan2(tm.x, tm.z));
    cross.translate(mid.x, 0.12, mid.z);
    frame.push(cross);
    const count = shape === 0 ? 6 : 7;
    for (let i = 0; i < count; i++) {
      const p = (i + 0.5) / count;
      const c = beltPathPoint(shape, p, { x: 0, z: 0 }), t = tangent(shape, p);
      const r = new THREE.CylinderGeometry(0.032, 0.032, 0.84, 10).rotateZ(Math.PI / 2);
      r.rotateY(Math.atan2(t.x, t.z));
      r.translate(c.x, BH - 0.032, c.z);
      rollers.push(r);
    }
    return { frame: mergeGeometries(frame), rollers: mergeGeometries(rollers) };
  });
}

// ───────────────────────── Teile
export function itemGeometry(shape) {
  const M = (...g) => mergeGeometries(g.map(x => (x.index ? x.toNonIndexed() : x)));
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const C = (r, h, s = 12) => new THREE.CylinderGeometry(r, r, h, s);
  const R = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r);
  let g;
  switch (shape) {
    case 'bar': g = C(0.04, 0.4).rotateZ(Math.PI / 2); break;
    case 'sheet': g = B(0.34, 0.02, 0.3); break;
    case 'plank': g = B(0.36, 0.08, 0.1); break;
    case 'sack': g = R(0.28, 0.14, 0.2, 0.05); break;
    case 'coil': g = new THREE.TorusGeometry(0.09, 0.04, 8, 16).rotateX(Math.PI / 2); break;
    case 'billet': g = C(0.05, 0.16).rotateZ(Math.PI / 2); break;
    case 'shaft': g = M(C(0.03, 0.34).rotateZ(Math.PI / 2), C(0.045, 0.1).rotateZ(Math.PI / 2)); break;
    case 'stick': g = C(0.022, 0.3, 8).rotateZ(Math.PI / 2); break;
    case 'forged': g = M(B(0.24, 0.05, 0.08), B(0.08, 0.06, 0.12).translate(0.1, 0, 0)); break;
    case 'plate': g = B(0.22, 0.03, 0.18); break;
    case 'box': g = R(0.24, 0.16, 0.18, 0.015); break;
    case 'grip': g = R(0.18, 0.05, 0.05, 0.02); break;
    case 'gear': g = M(C(0.11, 0.05, 16), ...Array.from({ length: 8 }, (_, i) => B(0.05, 0.05, 0.05).translate(0.12, 0, 0).rotateY(i * Math.PI / 4))); break;
    case 'spool': g = M(C(0.06, 0.12), C(0.09, 0.015).translate(0, 0.06, 0), C(0.09, 0.015).translate(0, -0.06, 0)); break;
    case 'hammer': g = M(C(0.018, 0.3, 8).rotateZ(Math.PI / 2), B(0.06, 0.06, 0.14).translate(0.15, 0, 0)); break;
    case 'wrench': g = M(B(0.26, 0.02, 0.04), new THREE.TorusGeometry(0.04, 0.015, 6, 10, Math.PI * 1.5).rotateX(Math.PI / 2).translate(0.15, 0, 0)); break;
    case 'pliers': g = M(B(0.2, 0.025, 0.03).rotateY(0.15), B(0.2, 0.025, 0.03).rotateY(-0.15)); break;
    case 'gearbox': g = M(R(0.22, 0.16, 0.18, 0.02), C(0.025, 0.1).rotateZ(Math.PI / 2).translate(0.15, 0.02, 0)); break;
    case 'motor': g = M(C(0.07, 0.2, 16).rotateZ(Math.PI / 2), C(0.015, 0.08).rotateZ(Math.PI / 2).translate(0.14, 0, 0), B(0.12, 0.03, 0.14).translate(0, -0.07, 0)); break;
    case 'case': g = M(R(0.34, 0.16, 0.22, 0.02), B(0.12, 0.03, 0.03).translate(0, 0.1, 0)); break;
    case 'drill': g = M(R(0.2, 0.08, 0.07, 0.02), R(0.06, 0.16, 0.06, 0.02).translate(-0.04, -0.1, 0), C(0.01, 0.08, 6).rotateZ(Math.PI / 2).translate(0.14, 0, 0)); break;
    default: g = B(0.2, 0.2, 0.2);
  }
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox.min.y, 0);
  g.computeVertexNormals();
  return g;
}

export function itemMaterial(id) {
  const it = ITEMS[id];
  const metallic = ['bar', 'sheet', 'billet', 'shaft', 'plate', 'gear', 'wrench', 'forged'].includes(it.shape);
  return new THREE.MeshStandardMaterial({ color: it.color, roughness: metallic ? 0.35 : 0.7, metalness: metallic ? 0.6 : 0.05 });
}

// Teil für Instancing: GLB, falls vorhanden (erste Mesh-Geometrie), sonst prozedural
export function itemSource(id) {
  const gltf = library.items[id];
  if (gltf) {
    let mesh = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
    if (mesh) {
      const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      geo.computeBoundingBox();
      geo.translate(0, -geo.boundingBox.min.y, 0);
      return { geometry: geo, material: mesh.material };
    }
  }
  return { geometry: itemGeometry(ITEMS[id].shape), material: itemMaterial(id) };
}
