// Prozedurale Low-Poly-Modelle für Gebäude, Bänder und Waren.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ITEMS } from './data.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, metalness: 0.05, ...opts }));
  return matCache.get(key);
}

export const MAT = {
  concrete: mat(0x9aa0a8),
  concreteDark: mat(0x6f757d),
  metal: mat(0x8c96a3, { metalness: 0.5, roughness: 0.4 }),
  darkMetal: mat(0x3b4048, { metalness: 0.4, roughness: 0.5 }),
  yellow: mat(0xf2b632),
  wood: mat(0x9c6a3c),
  woodDark: mat(0x6b4526),
  brick: mat(0xa6533d),
  roofRed: mat(0xb8473a),
  white: mat(0xe9edf1),
  blue: mat(0x3b6fd4),
  teal: mat(0x1fb5a0),
  green: mat(0x4f8a5b),
  black: mat(0x1d2025),
  glassPanel: mat(0x1e3a6e, { metalness: 0.6, roughness: 0.2 }),
  window: new THREE.MeshStandardMaterial({ color: 0x40505f, emissive: 0xffc46b, emissiveIntensity: 0, flatShading: true }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffd27a, emissiveIntensity: 0 }),
};

function add(g, geo, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
// Box mit Unterkante auf y
const box = (g, w, h, d, m, x = 0, y = 0, z = 0) => add(g, new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
const cyl = (g, rt, rb, h, seg, m, x = 0, y = 0, z = 0) => add(g, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z);

function slab(g, s, m = MAT.concrete) {
  box(g, s - 0.06, 0.1, s - 0.06, m);
  box(g, s - 0.02, 0.04, s - 0.02, MAT.concreteDark);
}

function roofPrism(g, w, h, d, m, x, y, z, rotY = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(-w / 2 + w * 0.15, h); shape.lineTo(-w / 2, h * 0.9);
  shape.lineTo(-w / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  const mesh = add(g, geo, m, x, y, z);
  mesh.rotation.y = rotY;
  return mesh;
}
function gable(g, w, h, d, m, x, y, z) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, h); shape.lineTo(-w / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  return add(g, geo, m, x, y, z);
}

function blade(r) {
  const g = new THREE.CylinderGeometry(r, r, 0.03, 14);
  g.rotateX(Math.PI / 2);
  return g;
}

function glowMat(color = 0xff7a1a) {
  return new THREE.MeshStandardMaterial({ color: 0x331a0a, emissive: color, emissiveIntensity: 0.2, flatShading: true });
}

// Jeder Builder liefert eine Group; userData.update(t, e, dt) animiert.
const BUILDERS = {
  bohrer(g, e) {
    slab(g, 2);
    box(g, 1.3, 0.45, 1.3, MAT.yellow, 0, 0.1, 0.1);
    box(g, 1.34, 0.08, 1.34, MAT.darkMetal, 0, 0.55, 0.1);
    for (const [x, z] of [[-0.42, -0.32], [0.42, -0.32], [-0.42, 0.52], [0.42, 0.52]]) box(g, 0.09, 1.25, 0.09, MAT.yellow, x, 0.6, z);
    box(g, 1.0, 0.14, 0.95, MAT.darkMetal, 0, 1.8, 0.1);
    const drill = new THREE.Group();
    cyl(drill, 0.11, 0.11, 1.0, 8, MAT.metal, 0, 0, 0);
    add(drill, new THREE.ConeGeometry(0.14, 0.25, 8).rotateX(Math.PI), MAT.darkMetal, 0, -0.1, 0);
    drill.position.set(0, 0.7, 0.1);
    g.add(drill);
    box(g, 0.6, 0.35, 0.45, MAT.concreteDark, 0, 0.1, -0.7);
    const oreBox = box(g, 0.5, 0.12, 0.35, mat(e?.res ? ITEMS[e.res].color : 0x888888), 0, 0.45, -0.7);
    g.userData.oreBox = oreBox;
    const light = box(g, 0.12, 0.12, 0.12, MAT.lamp, 0.4, 1.94, 0.4);
    g.userData.update = (t, e) => {
      const a = e?._active;
      drill.rotation.y += a ? 0.25 : 0;
      drill.position.y = 0.7 + (a ? Math.sin(t * 6) * 0.12 : 0.2);
      light.visible = true;
    };
  },

  holzfaeller(g) {
    slab(g, 2, MAT.concreteDark);
    box(g, 1.1, 0.7, 0.9, MAT.wood, -0.25, 0.1, 0.3);
    gable(g, 1.25, 0.45, 1.0, MAT.roofRed, -0.25, 0.8, 0.3);
    box(g, 0.25, 0.3, 0.02, MAT.window, -0.25, 0.4, -0.16);
    for (let i = 0; i < 3; i++) {
      const log = add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.8, 7).rotateZ(Math.PI / 2), MAT.woodDark, 0.15, 0.2 + i * 0.15 - (i === 2 ? 0.02 : 0), -0.6 + (i === 2 ? 0.1 : i * 0.2));
      log.position.x += i === 2 ? 0 : 0;
    }
    box(g, 0.5, 0.35, 0.4, MAT.concreteDark, 0.6, 0.1, 0.3);
    const saw = add(g, blade(0.25), MAT.metal, 0.6, 0.6, 0.3);
    saw.rotation.y = Math.PI / 2;
    g.userData.update = (t, e) => { if (e?._active) saw.rotation.x += 0.4; };
  },

  schmelzofen(g) {
    slab(g, 2);
    box(g, 1.35, 0.95, 1.3, MAT.brick, 0, 0.1, 0.05);
    box(g, 1.45, 0.12, 1.4, MAT.darkMetal, 0, 1.05, 0.05);
    cyl(g, 0.17, 0.2, 1.1, 8, MAT.darkMetal, 0.38, 1.1, 0.35);
    cyl(g, 0.21, 0.21, 0.08, 8, MAT.black, 0.38, 2.2, 0.35);
    const glow = glowMat();
    box(g, 0.55, 0.4, 0.06, glow, 0, 0.18, -0.63);
    box(g, 0.75, 0.08, 0.12, MAT.darkMetal, 0, 0.6, -0.64);
    g.userData.smoke = [new THREE.Vector3(0.38, 2.3, 0.35)];
    g.userData.update = (t, e) => {
      const target = e?._active ? 2.4 + Math.sin(t * 9) * 0.4 : 0.15;
      glow.emissiveIntensity += (target - glow.emissiveIntensity) * 0.1;
    };
  },

  saegewerk(g) {
    slab(g, 2, MAT.concreteDark);
    for (const [x, z] of [[-0.75, -0.7], [0.75, -0.7], [-0.75, 0.7], [0.75, 0.7]]) box(g, 0.1, 1.1 + (z > 0 ? 0.25 : 0), 0.1, MAT.wood, x, 0.1, z);
    const roof = box(g, 1.85, 0.07, 1.75, MAT.green, 0, 1.25, 0);
    roof.rotation.x = -0.14;
    box(g, 1.3, 0.35, 0.5, MAT.woodDark, 0, 0.1, 0);
    add(g, new THREE.CylinderGeometry(0.11, 0.11, 1.1, 7).rotateZ(Math.PI / 2), MAT.wood, -0.1, 0.58, 0.0);
    const saw = add(g, blade(0.28), MAT.metal, 0.35, 0.5, 0);
    saw.rotation.y = Math.PI / 2;
    for (let i = 0; i < 3; i++) box(g, 0.9, 0.05, 0.25, mat(0xdba468), -0.2, 0.1 + i * 0.06, 0.55);
    g.userData.update = (t, e) => { if (e?._active) saw.rotation.x -= 0.5; };
  },

  presse(g) {
    slab(g, 2);
    box(g, 1.4, 0.45, 1.1, MAT.blue, 0, 0.1, 0);
    box(g, 0.18, 1.35, 0.3, MAT.darkMetal, -0.55, 0.55, 0);
    box(g, 0.18, 1.35, 0.3, MAT.darkMetal, 0.55, 0.55, 0);
    box(g, 1.4, 0.28, 0.45, MAT.blue, 0, 1.85, 0);
    const ram = new THREE.Group();
    box(ram, 0.6, 0.35, 0.4, MAT.metal);
    cyl(ram, 0.07, 0.07, 0.8, 6, MAT.metal, 0, 0.35, 0);
    ram.position.set(0, 1.0, 0);
    g.add(ram);
    box(g, 0.35, 0.5, 0.25, MAT.concreteDark, 0.65, 0.1, -0.75);
    const led = box(g, 0.1, 0.1, 0.03, new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x33ff66, emissiveIntensity: 1 }), 0.65, 0.42, -0.885);
    g.userData.update = (t, e) => {
      const a = e?._active;
      const k = a ? Math.pow(Math.abs(Math.sin(t * 4)), 3) : 0;
      ram.position.y = 1.15 - k * 0.5;
      led.material.emissiveIntensity = a ? 1.5 : 0.2;
    };
  },

  hochofen(g) {
    slab(g, 3);
    cyl(g, 0.75, 0.85, 2.0, 10, mat(0x4d535c), 0.25, 0.1, 0.3);
    add(g, new THREE.ConeGeometry(0.75, 0.5, 10), mat(0x3a3f47), 0.25, 2.35, 0.3);
    const glow = glowMat(0xff6a00);
    cyl(g, 0.88, 0.88, 0.16, 10, glow, 0.25, 0.55, 0.3);
    cyl(g, 0.16, 0.18, 3.1, 8, MAT.darkMetal, 1.05, 0.1, 1.05);
    cyl(g, 0.2, 0.2, 0.08, 8, MAT.black, 1.05, 3.2, 1.05);
    box(g, 1.1, 0.85, 1.0, MAT.brick, -0.8, 0.1, -0.7);
    box(g, 1.2, 0.08, 1.1, MAT.darkMetal, -0.8, 0.95, -0.7);
    box(g, 0.4, 0.3, 0.05, MAT.window, -0.8, 0.45, -1.21);
    const pipe = add(g, new THREE.CylinderGeometry(0.09, 0.09, 1.5, 6).rotateZ(Math.PI / 2.6), MAT.metal, -0.45, 1.6, 0.3);
    pipe.rotation.y = 0.2;
    g.userData.smoke = [new THREE.Vector3(1.05, 3.3, 1.05), new THREE.Vector3(0.25, 2.6, 0.3)];
    g.userData.update = (t, e) => {
      const target = e?._active ? 2.2 + Math.sin(t * 5) * 0.5 : 0.1;
      glow.emissiveIntensity += (target - glow.emissiveIntensity) * 0.08;
    };
  },

  montage(g) {
    slab(g, 3);
    box(g, 2.7, 1.15, 2.5, MAT.white, 0, 0.1, 0.05);
    for (let i = 0; i < 3; i++) roofPrism(g, 0.9, 0.45, 2.5, mat(0xc9d0d8), -0.9 + i * 0.9, 1.25, 0.05);
    box(g, 2.3, 0.22, 0.03, MAT.window, 0, 0.75, -1.215);
    box(g, 0.8, 0.6, 0.04, MAT.darkMetal, 0, 0.1, -1.22);
    box(g, 2.72, 0.1, 2.52, MAT.teal, 0, 0.5, 0.05);
    const fan = new THREE.Group();
    cyl(fan, 0.25, 0.25, 0.15, 8, MAT.darkMetal);
    const fb = box(fan, 0.45, 0.02, 0.07, MAT.metal, 0, 0.16, 0);
    const fb2 = box(fan, 0.07, 0.02, 0.45, MAT.metal, 0, 0.16, 0);
    fan.position.set(0.9, 1.25, 0.8);
    g.add(fan);
    const arm = new THREE.Group();
    cyl(arm, 0.12, 0.15, 0.25, 8, MAT.yellow);
    const a1 = box(arm, 0.08, 0.6, 0.08, MAT.yellow, 0, 0.25, 0);
    a1.rotation.z = 0.5;
    arm.position.set(-1.05, 0.1, -1.3);
    arm.scale.setScalar(0.8);
    g.add(arm);
    g.userData.update = (t, e) => {
      if (e?._active) { fan.rotation.y += 0.3; arm.rotation.y = Math.sin(t * 2.5) * 1.2; }
    };
  },

  depot(g) {
    slab(g, 3);
    box(g, 2.1, 1.0, 1.4, mat(0x5d7f6a), -0.3, 0.1, 0.55);
    gable(g, 2.3, 0.5, 1.5, mat(0x3e5a49), -0.3, 1.1, 0.55);
    box(g, 0.9, 0.7, 0.04, MAT.darkMetal, -0.3, 0.1, -0.17);
    box(g, 1.6, 0.18, 0.03, MAT.window, -0.3, 0.85, -0.17);
    const cols = [0xd8483b, 0x2e6fd8, 0xf2a531, 0x2fae6c];
    [[0.85, 0.1, -0.85, 0], [0.85, 0.55, -0.85, 1], [0.85, 0.1, -0.35, 2], [-0.9, 0.1, -0.95, 3]].forEach(([x, y, z, c]) => {
      const ct = box(g, 0.95, 0.42, 0.44, mat(cols[c]), x, y, z);
      ct.rotation.y = c === 3 ? Math.PI / 2 : 0;
    });
    const crane = new THREE.Group();
    box(crane, 0.12, 1.7, 0.12, MAT.yellow);
    box(crane, 1.3, 0.1, 0.1, MAT.yellow, 0.4, 1.7, 0);
    box(crane, 0.03, 0.5, 0.03, MAT.darkMetal, 0.9, 1.2, 0);
    crane.position.set(1.15, 0.1, 0.9);
    g.add(crane);
    g.userData.update = t => { crane.rotation.y = Math.sin(t * 0.4) * 1.1 + 2.2; };
  },

  lager(g) {
    slab(g, 2);
    for (const x of [-0.8, 0, 0.8]) for (const z of [-0.6, 0.6]) box(g, 0.07, 1.2, 0.07, MAT.blue, x, 0.1, z);
    for (const y of [0.5, 1.0]) box(g, 1.7, 0.05, 1.3, MAT.darkMetal, 0, y, 0);
    const crates = [];
    for (let i = 0; i < 8; i++) {
      const lvl = Math.floor(i / 4), k = i % 4;
      crates.push(box(g, 0.34, 0.3, 0.5, mat(0xc49a5c), -0.6 + k * 0.4, 0.12 + lvl * 0.43, (k % 2 ? 0.25 : -0.25)));
    }
    g.userData.update = (t, e) => {
      const n = e ? Math.ceil(e.total / 200 * 8) : 0;
      crates.forEach((c, i) => { c.visible = i < n; });
    };
  },

  netz(g) {
    slab(g, 2, MAT.concreteDark);
    box(g, 0.8, 0.65, 0.6, mat(0x6f8f7a), -0.35, 0.1, 0.1);
    for (let i = 0; i < 3; i++) cyl(g, 0.05, 0.07, 0.3, 6, mat(0xb9d3e6), -0.6 + i * 0.25, 0.75, 0.1);
    const tower = new THREE.Group();
    cyl(tower, 0.05, 0.14, 2.3, 4, MAT.metal);
    box(tower, 0.9, 0.06, 0.06, MAT.metal, 0, 1.9, 0);
    box(tower, 0.7, 0.06, 0.06, MAT.metal, 0, 1.6, 0);
    tower.position.set(0.55, 0.1, 0.4);
    g.add(tower);
    for (const [x, z, w, d] of [[0, -0.92, 1.9, 0.03], [0, 0.92, 1.9, 0.03], [-0.92, 0, 0.03, 1.9], [0.92, 0, 0.03, 1.9]]) box(g, w, 0.3, d, mat(0xb0b6bd, { wireframe: false }), x, 0.1, z);
    box(g, 0.1, 0.1, 0.02, MAT.lamp, -0.35, 0.45, -0.21);
  },

  windrad(g) {
    box(g, 0.6, 0.1, 0.6, MAT.concrete);
    cyl(g, 0.06, 0.11, 2.6, 8, MAT.white, 0, 0.1, 0);
    box(g, 0.18, 0.18, 0.4, MAT.white, 0, 2.6, 0.05);
    const rotor = new THREE.Group();
    add(rotor, new THREE.SphereGeometry(0.09, 6, 5), MAT.white);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.0, 0.02).translate(0, 0.5, 0), MAT.white);
      b.rotation.z = i * Math.PI * 2 / 3;
      b.castShadow = true;
      rotor.add(b);
    }
    rotor.position.set(0, 2.69, -0.18);
    g.add(rotor);
    g.userData.update = (t, e, dt, game) => { rotor.rotation.z -= 0.02 + (game ? game.wind * 0.12 : 0.05); };
  },

  kraftwerk(g) {
    slab(g, 3);
    box(g, 1.15, 1.0, 2.5, mat(0x8b8f96), -0.8, 0.1, 0);
    box(g, 1.2, 0.08, 2.55, MAT.darkMetal, -0.8, 1.1, 0);
    box(g, 0.03, 0.2, 2.0, MAT.window, -0.21, 0.7, 0);
    cyl(g, 0.12, 0.14, 1.4, 8, MAT.darkMetal, -1.05, 1.1, 0.8);
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const y = i / 8 * 1.9;
      const r = 0.42 + 0.22 * Math.pow((y - 1.3) / 1.3, 2);
      pts.push(new THREE.Vector2(r, y));
    }
    const towerGeo = new THREE.LatheGeometry(pts, 14);
    const m = mat(0xc7c9cc, { side: THREE.DoubleSide });
    add(g, towerGeo, m, 0.65, 0.1, -0.7);
    add(g, towerGeo, m, 0.65, 0.1, 0.7);
    g.userData.smoke = [new THREE.Vector3(0.65, 2.0, -0.7), new THREE.Vector3(0.65, 2.0, 0.7)];
    g.userData.steam = true;
  },

  solar(g) {
    box(g, 1.9, 0.06, 1.9, MAT.concreteDark);
    for (const z of [-0.45, 0.45]) {
      for (const x of [-0.6, 0.6]) box(g, 0.05, 0.35, 0.05, MAT.metal, x, 0.06, z + 0.1);
      const p = box(g, 1.75, 0.04, 0.78, MAT.glassPanel, 0, 0.36, z);
      p.rotation.x = 0.45;
      for (let k = -2; k <= 2; k++) {
        const l = box(g, 0.012, 0.045, 0.78, MAT.metal, k * 0.35, 0.36, z);
        l.rotation.x = 0.45;
      }
    }
  },

  verteiler(g) {
    box(g, 0.86, 0.12, 0.86, MAT.darkMetal);
    box(g, 0.72, 0.18, 0.72, MAT.teal, 0, 0.12, 0);
    const top = new THREE.ConeGeometry(0.1, 0.18, 3).rotateX(Math.PI / 2);
    for (let d = 0; d < 4; d++) {
      const m = add(g, top, MAT.white, Math.sin(d * Math.PI / 2) * 0.22, 0.32, -Math.cos(d * Math.PI / 2) * 0.22);
      m.rotation.y = -d * Math.PI / 2;
      m.rotation.order = 'YXZ';
      m.scale.set(1, 0.4, 1);
    }
  },

  kreuzung(g) {
    box(g, 0.9, 0.14, 0.9, MAT.metal);
    box(g, 0.72, 0.01, 0.2, MAT.black, 0, 0.14, 0);
    box(g, 0.2, 0.01, 0.72, MAT.black, 0, 0.14, 0);
    for (const [x, z] of [[-0.33, -0.33], [0.33, -0.33], [-0.33, 0.33], [0.33, 0.33]]) box(g, 0.14, 0.2, 0.14, MAT.yellow, x, 0.14, z);
  },
};

export function buildModel(type, e) {
  const g = new THREE.Group();
  BUILDERS[type]?.(g, e);
  g.userData.type = type;
  return g;
}

// ───────────────────────── Förderbänder
// Form 0 = gerade, 1 = Kurve von links, 2 = Kurve von rechts. Ausrichtung: Norden (−z) ist vorne.
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

function stripGeometry(shape, width, y, n) {
  const pos = [], uv = [], nor = [], idx = [];
  const a = { x: 0, z: 0 };
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    beltPathPoint(shape, p, a);
    const t = tangent(shape, p), nx = -t.z, nz = t.x;
    pos.push(a.x + nx * width / 2, y, a.z + nz * width / 2, a.x - nx * width / 2, y, a.z - nz * width / 2);
    uv.push(0, p, 1, p);
    nor.push(0, 1, 0, 0, 1, 0);
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function railGeometry(shape) {
  const parts = [];
  const n = shape === 0 ? 1 : 8;
  for (const off of [0, -0.42, 0.42]) {
    // Radius der versetzten Bahn (Kurven), damit Segmente lückenlos anschließen
    const scale = shape === 0 ? 1 : (shape === 1 ? 0.5 + off : 0.5 - off) / 0.5;
    for (let i = 0; i < n; i++) {
      const pm = (i + 0.5) / n;
      const m = beltPathPoint(shape, pm, { x: 0, z: 0 });
      const t = tangent(shape, pm), nx = -t.z, nz = t.x;
      const len = (shape === 0 ? 1 : Math.PI / 4 / n) * scale + (shape === 0 ? 0 : 0.03);
      const geo = off === 0
        ? new THREE.BoxGeometry(0.8, 0.07, Math.max(0.04, (shape === 0 ? 1 : Math.PI / 4 / n) + 0.03)).translate(0, 0.035, 0)
        : new THREE.BoxGeometry(0.07, 0.15, Math.max(0.04, len)).translate(0, 0.075, 0);
      geo.rotateY(Math.atan2(t.x, t.z));
      geo.translate(m.x + nx * off, 0, m.z + nz * off);
      parts.push(geo);
    }
  }
  return mergeGeometries(parts);
}

export function beltGeometries() {
  return [0, 1, 2].map(s => ({ surface: stripGeometry(s, 0.7, 0.075, s === 0 ? 1 : 10), frame: railGeometry(s) }));
}

export function beltTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#2b2f36'; x.fillRect(0, 0, 32, 64);
  x.strokeStyle = '#4a515c'; x.lineWidth = 5;
  for (const y of [8, 40]) { x.beginPath(); x.moveTo(4, y + 14); x.lineTo(16, y); x.lineTo(28, y + 14); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ───────────────────────── Waren
export function itemGeometry(shape) {
  let g;
  switch (shape) {
    case 'ore': g = new THREE.IcosahedronGeometry(0.12, 0); break;
    case 'log': g = new THREE.CylinderGeometry(0.075, 0.075, 0.32, 7).rotateZ(Math.PI / 2); break;
    case 'pile': g = new THREE.ConeGeometry(0.15, 0.14, 7); break;
    case 'plank': g = mergeGeometries([new THREE.BoxGeometry(0.32, 0.05, 0.14), new THREE.BoxGeometry(0.32, 0.05, 0.14).translate(0.02, 0.06, 0.01)]); break;
    case 'plate': g = new THREE.BoxGeometry(0.24, 0.06, 0.24); break;
    case 'glass': g = new THREE.BoxGeometry(0.22, 0.18, 0.06); break;
    case 'gear': g = new THREE.CylinderGeometry(0.13, 0.13, 0.07, 10); break;
    case 'coil': g = new THREE.TorusGeometry(0.09, 0.045, 6, 12).rotateX(Math.PI / 2); break;
    case 'beam': g = mergeGeometries([new THREE.BoxGeometry(0.36, 0.03, 0.14), new THREE.BoxGeometry(0.36, 0.1, 0.035).translate(0, 0.06, 0), new THREE.BoxGeometry(0.36, 0.03, 0.14).translate(0, 0.12, 0)]); break;
    case 'chip': g = mergeGeometries([new THREE.BoxGeometry(0.22, 0.04, 0.22), new THREE.BoxGeometry(0.1, 0.04, 0.1).translate(0, 0.03, 0)]); break;
    case 'motor': g = mergeGeometries([new THREE.CylinderGeometry(0.1, 0.1, 0.22, 8).rotateZ(Math.PI / 2), new THREE.BoxGeometry(0.12, 0.08, 0.16).translate(0, -0.08, 0)]); break;
    case 'crate': g = new THREE.BoxGeometry(0.26, 0.24, 0.26); break;
    default: g = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  }
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox.min.y, 0);
  return g;
}

export function itemMaterial(id) {
  const it = ITEMS[id];
  const metallic = ['plate', 'gear', 'beam', 'motor'].includes(it.shape);
  if (it.shape === 'glass') return new THREE.MeshStandardMaterial({ color: it.color, transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0.2 });
  return new THREE.MeshStandardMaterial({ color: it.color, flatShading: true, roughness: metallic ? 0.35 : 0.8, metalness: metallic ? 0.55 : 0.05 });
}
