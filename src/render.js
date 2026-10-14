// Three.js-Darstellung: Herbststraße, Gebäude mit Treppenhaus und Etagen, Einrichtung,
// Gäste, Katzen, Wetter und Effekte. Liest den Zustand aus Game, verändert ihn aber nie.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  CONFIG, FLOORS, FURNITURE, SHOP_TYPES, WEATHER, PAINT, FACADES, AWNINGS, FRAMES, paintHex,
} from './data.js';
import { footprint, isReserved, wallSideOf } from './sim.js';
import {
  mat, texture, labelTexture, furnitureMesh, ghostOf, buildPerson, posePerson, buildCat, poseCat,
  glowMats, wallMaterial, floorMaterial, facadeMaterial,
} from './models.js';

const { W, D, floorHeight: H } = CONFIG;
const CX0 = CONFIG.core.x0;                 // linke Innenkante des Treppenhauses (-3.2)
const WALL = 0.2;
const OX = -(W + CX0) / 2, OZ = -D / 2;     // Etagenkoordinate → Welt (Gebäude mittig)
const toWorld = (x, z) => [x + OX, z + OZ];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// UVs der Vorder-/Rückseite einer Box an Weltmaße anpassen (durchgehende Muster)
function wallUV(geo, x0, y0, w, h, scale = 2) {
  const uv = geo.attributes.uv;
  for (let face = 4; face < 6; face++) {
    for (let i = 0; i < 4; i++) {
      const k = face * 4 + i;
      const u = uv.getX(k), v = uv.getY(k);
      uv.setXY(k, (x0 + (face === 4 ? u : 1 - u) * w) / scale, (y0 + v * h) / scale);
    }
  }
  uv.needsUpdate = true;
}

export class Renderer {
  constructor(canvas, game) {
    this.game = game;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#cfd6d6');
    this.scene.fog = new THREE.Fog('#cfd6d6', 55, 130);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
    this.camera.position.set(3, 17, 25);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 55;
    this.controls.maxPolarAngle = 1.38;
    this.controls.minPolarAngle = 0.15;
    this.controls.target.set(0, 1, 0.5);
    this.controls.screenSpacePanning = false;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.targetY = 1;

    this.hemi = new THREE.HemisphereLight('#e6ecf2', '#8a7258', 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffe6c4', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.inner = new THREE.PointLight('#ffcf96', 0, 22, 1.4);
    this.inner2 = new THREE.PointLight('#ffcf96', 0, 22, 1.4);
    this.scene.add(this.inner, this.inner2);

    this.view = 0;                 // aktive Etage oder 'out' für Außenansicht
    this.floorGroups = [];
    this.wallGroups = [];
    this.frontDeco = [];
    this.itemMeshes = new Map();
    this.people = new Map();
    this.cats = new Map();
    this.staff = new Map();
    this.sprites = [];
    this.lampMats = [];
    this.layoutSeen = -1;
    this.buildingSig = '';
    this.buildMode = false;
    this.time = 0;
    this.dark = 0;
    this.cutSides = new Set();

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.buildEnvironment();
    this.buildParticles();
    this.buildingRoot = new THREE.Group();
    this.scene.add(this.buildingRoot);
    this.itemRoot = new THREE.Group();
    this.scene.add(this.itemRoot);
    this.peopleRoot = new THREE.Group();
    this.scene.add(this.peopleRoot);

    this.buildOverlays();
    this.raycaster = new THREE.Raycaster();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 52 : 38;
    this.camera.updateProjectionMatrix();
  }

  // ───────────── Herbstliche Umgebung ─────────────

  buildEnvironment() {
    const w = this.world;
    const plane = (sx, sz, material, x, y, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), material);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      w.add(m);
      return m;
    };
    const tex = (name, rx, ry) => new THREE.MeshStandardMaterial({ map: texture(name, [rx, ry]), roughness: 0.95 });
    const front = D / 2;
    this.groundMats = [];
    const ground = tex('wiese', 40, 40);
    plane(240, 240, ground, 0, -0.14, 0);
    const walk = tex('gehweg', 40, 1.7);
    plane(80, 3.4, walk, 0, 0.001, front + 1.7);
    const road = tex('asphalt', 20, 2);
    plane(80, 7, road, 0, -0.12, front + 6.9);
    const walk2 = tex('gehweg', 40, 1.5);
    plane(80, 3, walk2, 0, 0.001, front + 11.9);
    plane(80, 9, tex('gehweg', 30, 3), 0, 0.0, -D / 2 - 4.5);
    this.groundMats.push(walk, road, walk2);
    for (const z of [front + 3.4, front + 10.4]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(80, 0.14, 0.18), mat('#cfc8bd'));
      c.position.set(0, -0.06, z);
      c.receiveShadow = true;
      w.add(c);
    }
    for (let x = -38; x < 40; x += 4) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.14), mat('#e8e4d8'));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, -0.115, front + 6.9);
      w.add(m);
    }
    // Nachbarhäuser links und rechts
    const bx0 = OX + CX0 - WALL - 0.15, bx1 = OX + W + WALL + 0.15;
    const facade = (floors, color, x0, x1) => {
      const h = floors * H + 0.6;
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = color; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#e9e3d6'; g.fillRect(28, 26, 72, 86);
      g.fillStyle = '#4b5a66'; g.fillRect(34, 32, 60, 74);
      g.fillStyle = '#6f8394'; g.fillRect(34, 32, 60, 30);
      g.fillStyle = '#e9e3d6'; g.fillRect(62, 32, 4, 74);
      g.fillStyle = '#b84a2f'; g.fillRect(30, 104, 68, 10);   // Blumenkasten
      g.fillStyle = '#d9772f'; for (let i = 0; i < 6; i++) g.fillRect(34 + i * 11, 98, 7, 7);
      const tx = new THREE.CanvasTexture(c);
      tx.colorSpace = THREE.SRGBColorSpace;
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
      tx.repeat.set(Math.round((x1 - x0) / 2.6), floors);
      const sideMat = mat(color, { r: 0.9 });
      const frontMat = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.85 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, D + 0.4), [sideMat, sideMat, mat('#6e6a66'), sideMat, frontMat, sideMat]);
      b.position.set((x0 + x1) / 2, h / 2, 0);
      b.castShadow = true; b.receiveShadow = true;
      w.add(b);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.3, 0.3, D + 0.7), mat('#d8d2c6'));
      cap.position.set((x0 + x1) / 2, h, 0);
      w.add(cap);
    };
    facade(4, '#c9b48f', bx0 - 11, bx0);
    facade(5, '#b98f7a', bx0 - 22.2, bx0 - 11.2);
    facade(3, '#9fb3b0', bx1, bx1 + 12);
    facade(4, '#8fa3b9', bx1 + 12.2, bx1 + 24);
    // Park gegenüber
    plane(80, 16, new THREE.MeshStandardMaterial({ map: texture('wiese', [20, 4]), roughness: 1 }), 0, -0.13, front + 21.4);
    for (const [x, z, sx] of [[-8, front + 17, 10], [9, front + 18.5, 7]]) {
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.8, 0.9), mat('#6d7d3f', { r: 0.95 }));
      hedge.position.set(x, 0.3, z);
      hedge.castShadow = true;
      w.add(hedge);
    }
    // Herbstbäume
    const crownCols = ['#d9772f', '#c8452f', '#e0a530', '#b8562a', '#9a8a3a', '#e3893a'];
    let ti = 0;
    const tree = (x, z, s = 1) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 2.2, 8), mat('#5e4532'));
      trunk.position.y = 1.1; trunk.castShadow = true;
      g.add(trunk);
      for (const [a, b, c2] of [[0.6, 2.6, 0.5], [-0.5, 2.8, -0.3]]) {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.0, 5), mat('#5e4532'));
        br.position.set(a * 0.5, b, c2 * 0.5);
        br.rotation.z = -a;
        g.add(br);
      }
      const n = 3 + (ti % 3);
      for (let k = 0; k < n; k++) {
        const r = 0.65 + ((ti * 7 + k * 3) % 5) * 0.12;
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(crownCols[(ti + k * 2) % crownCols.length], { r: 0.9 }));
        const a = k * 2.3 + ti;
        c.position.set(Math.cos(a) * 0.5, 2.6 + (k % 3) * 0.4, Math.sin(a) * 0.5);
        c.castShadow = true;
        g.add(c);
      }
      const grate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 1.1), mat('#5b4a3a'));
      grate.position.y = 0.01;
      g.add(grate);
      g.position.set(x, 0, z);
      g.scale.setScalar(s);
      g.rotation.y = ti;
      w.add(g);
      ti++;
    };
    tree(-13, front + 2.8); tree(-20, front + 2.8, 0.9); tree(12, front + 2.8, 1.05); tree(19, front + 2.8);
    tree(-14, front + 11.8, 0.9); tree(4, front + 11.8); tree(20, front + 11.8, 0.95);
    tree(-18, front + 18, 1.3); tree(-1, front + 20, 1.2); tree(15, front + 17.5, 1.25); tree(26, front + 21, 1.1);
    tree(-4, -D / 2 - 5, 1.2); tree(5, -D / 2 - 6.5, 1.1);
    // Laub auf Boden und Gehweg
    const leafGeo = new THREE.PlaneGeometry(0.2, 0.13);
    leafGeo.rotateX(-Math.PI / 2);
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
    const N = 900;
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    const lc = ['#d9772f', '#c8452f', '#e0a530', '#a8562a', '#8a5a2a'];
    for (let i = 0; i < N; i++) {
      const r1 = Math.sin(i * 12.9898) * 43758.5453, r2 = Math.sin(i * 78.233) * 43758.5453, r3 = Math.sin(i * 39.425) * 43758.5453;
      const a = r1 - Math.floor(r1), b = r2 - Math.floor(r2), c = r3 - Math.floor(r3);
      let x, z;
      if (i < 450) { x = -30 + a * 60; z = front + 0.2 + b * (b < 0.5 ? 3.2 : 3.2); } // Gehweg (dichter an Bäumen)
      else if (i < 520) { x = -30 + a * 60; z = front + 3.6 + b * 0.5; }           // Rinnstein
      else { x = -30 + a * 60; z = front + 10.5 + b * 16; }
      const y = (z > front + 3.4 && z < front + 4.2) ? -0.11 : z > front + 13.4 ? -0.12 : 0.006;
      e.set(0, c * 6.28, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, y + 0.004, z), q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + c * 0.6));
      leaves.setMatrixAt(i, m4);
      leaves.setColorAt(i, col.set(lc[i % lc.length]));
    }
    leaves.receiveShadow = true;
    w.add(leaves);
    // Laubhaufen im Park
    for (const [x, z] of [[-6, front + 19.5], [7, front + 21], [18, front + 16.5]]) {
      const heap = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#c8652f', { r: 1 }));
      heap.scale.set(1.4, 0.45, 1);
      heap.position.set(x, -0.13, z);
      w.add(heap);
    }
    // Laternen
    for (const x of [-16.5, -10.5, 13.5, 21]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 8), mat('#2c3035', { m: 0.6, r: 0.5 }));
      pole.position.set(x, 2.1, front + 3.05);
      pole.castShadow = true;
      w.add(pole);
      const lampMat = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffcf7a', emissiveIntensity: 0 });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), lampMat);
      head.position.set(x, 4.25, front + 3.05);
      w.add(head);
      this.lampMats.push(lampMat);
    }
    // Bänke mit Kürbissen
    const bench = (x, z) => {
      const g = new THREE.Group();
      const wood = mat('#8a5a36');
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.45), wood); seat.position.y = 0.45;
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.05), wood); back.position.set(0, 0.7, -0.2);
      for (const m of [seat, back]) { m.castShadow = true; g.add(m); }
      for (const lx of [-0.7, 0.7]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), mat('#2c3035')); l.position.set(lx, 0.22, 0); g.add(l); }
      const p = furnitureMesh('kuerbisse', 0);
      p.position.set(1.15, 0, 0.1);
      g.add(p);
      g.position.set(x, 0, z);
      g.rotation.y = Math.PI;
      w.add(g);
    };
    bench(-15, front + 3.0); bench(16, front + 3.0);
    // Autos
    this.cars = [];
    const carColors = ['#8a3b32', '#2f6b9a', '#e5e1d8', '#3b3f45', '#c08a3e'];
    for (let i = 0; i < 4; i++) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.7, 1.7), mat(carColors[i % carColors.length], { r: 0.35, m: 0.3 }));
      body.position.y = 0.55; body.castShadow = true;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 1.5), mat('#2b3640', { r: 0.2, m: 0.4 }));
      cabin.position.set(-0.2, 1.15, 0); cabin.castShadow = true;
      car.add(body, cabin);
      for (const hx of [1.9, -1.9]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 1.3), new THREE.MeshStandardMaterial({ color: hx > 0 ? '#fff6d8' : '#c03030', emissive: hx > 0 ? '#ffe6a0' : '#ff3020', emissiveIntensity: 0 }));
        hl.position.set(hx, 0.6, 0);
        car.add(hl);
        this.lampMats.push(hl.material);
      }
      for (const wx of [-1.2, 1.2]) for (const wz of [-0.8, 0.8]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14), mat('#1b1b1d'));
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.2, wz);
        car.add(wheel);
      }
      const dir = i % 2 ? -1 : 1;
      car.position.set(-40 + i * 23, -0.12, front + (dir > 0 ? 5.3 : 8.5));
      car.rotation.y = dir > 0 ? 0 : Math.PI;
      car.userData = { dir, speed: 6 + i * 1.3 };
      w.add(car);
      this.cars.push(car);
    }
  }

  // ───────────── Fallendes Laub und Regen ─────────────

  buildParticles() {
    const geo = new THREE.PlaneGeometry(0.16, 0.11);
    const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 });
    this.fallN = 140;
    this.falling = new THREE.InstancedMesh(geo, m, this.fallN);
    this.fallData = [];
    const lc = ['#d9772f', '#c8452f', '#e0a530', '#b8562a'];
    const col = new THREE.Color();
    for (let i = 0; i < this.fallN; i++) {
      this.fallData.push(this.newLeaf(true));
      this.falling.setColorAt(i, col.set(lc[i % lc.length]));
    }
    this.falling.frustumCulled = false;
    this.scene.add(this.falling);

    const n = 1400;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 60, y = Math.random() * 22, z = (Math.random() - 0.5) * 40 + 4;
      pos.set([x, y, z, x + 0.03, y - 0.45, z], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#c9d6e2', transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  newLeaf(initial) {
    const trees = [-13, -20, 12, 19, -14, 4, 20, -1, 15];
    const tx = trees[Math.floor(Math.random() * trees.length)];
    return {
      x: tx + (Math.random() - 0.5) * 3, z: D / 2 + (Math.random() < 0.6 ? 2.8 : 11.8) + (Math.random() - 0.5) * 3,
      y: initial ? Math.random() * 5 : 3.5 + Math.random() * 1.5, rx: Math.random() * 6, ry: Math.random() * 6, phase: Math.random() * 6,
      speed: 0.35 + Math.random() * 0.4,
    };
  }

  updateParticles(dt) {
    const wx = this.game.weather?.type;
    const wind = wx === 'wind' ? 2.2 : wx === 'regen' ? 0.6 : 1;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < this.fallN; i++) {
      const l = this.fallData[i];
      l.y -= l.speed * dt * (wx === 'regen' ? 1.6 : 1);
      l.phase += dt * 2;
      l.x += (Math.sin(l.phase) * 0.6 + wind * 0.5) * dt;
      l.z += Math.cos(l.phase * 0.7) * 0.3 * dt;
      l.rx += dt * 2.5; l.ry += dt * 1.7;
      if (l.y < 0.02) { if (Math.random() < 0.02 * (dt * 60)) Object.assign(l, this.newLeaf(false)); l.y = Math.max(l.y, 0.02); }
      e.set(l.y > 0.03 ? l.rx : -Math.PI / 2, l.ry, 0);
      q.setFromEuler(e);
      p.set(l.x, l.y, l.z);
      m4.compose(p, q, s);
      this.falling.setMatrixAt(i, m4);
    }
    this.falling.instanceMatrix.needsUpdate = true;
    if (this.rain.visible) {
      this.rain.position.y -= dt * 16;
      if (this.rain.position.y < -10) this.rain.position.y += 10;
    }
  }

  // ───────────── Gebäude ─────────────

  signature() {
    const g = this.game;
    return `${g.designVersion}|` + g.floors.map((f) => {
      const s = g.shops.get(f.shop);
      return `${f.unlocked ? 1 : 0}:${s ? s.type + '/' + s.name : ''}`;
    }).join('|');
  }

  buildBuilding() {
    const root = this.buildingRoot;
    for (const c of [...root.children]) root.remove(c);
    this.floorGroups = [];
    this.wallGroups = [];
    this.frontDeco = FLOORS.map(() => []);
    const g = this.game;
    const ext = g.exterior;
    const fac = FACADES.find((f) => f.id === ext.facade) || FACADES[0];
    const facadeMat = facadeMaterial(fac.id, fac.hex);
    const edgeMat = mat(new THREE.Color(fac.hex).multiplyScalar(0.92).getStyle(), { r: 0.9 });
    const frameHex = (FRAMES.find((f) => f.id === ext.frames) || FRAMES[0]).hex;
    const frameMat = mat(frameHex, { r: 0.5, m: 0.2 });
    this.glassLit = new THREE.MeshStandardMaterial({ color: '#b9cfd6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false, emissive: '#ffb866', emissiveIntensity: 0 });
    const glassDark = new THREE.MeshStandardMaterial({ color: '#56707f', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 });
    const coreWall = wallMaterial('glatt', 'leinen');
    const coreDado = mat('#8a6a52', { r: 0.8 });

    for (let f = 0; f < FLOORS.length; f++) {
      const fl = g.floors[f];
      const shop = g.shops.get(fl.shop);
      const ds = fl.design;
      const group = new THREE.Group();
      group.position.y = f * H;
      root.add(group);
      this.floorGroups[f] = group;
      const active = fl.unlocked;
      const wallH = H - 0.22;

      // ── Boden: Laden und Treppenhaus-Podest ──
      const floorMat = active ? floorMaterial(ds.floor) : floorMaterial('beton');
      const ceilMat = mat(paintHex(ds.ceiling), { r: 0.95 });
      const slab = (x0, z0, x1, z1, top, under) => {
        const geo = new THREE.BoxGeometry(x1 - x0, 0.22, z1 - z0);
        const uv = geo.attributes.uv;
        for (let k = 8; k < 12; k++) uv.setXY(k, (x0 + uv.getX(k) * (x1 - x0)) / 2, (D - z1 + uv.getY(k) * (z1 - z0)) / 2);
        uv.needsUpdate = true;
        const m = new THREE.Mesh(geo, [edgeMat, edgeMat, top, under, edgeMat, edgeMat]);
        m.position.set(OX + (x0 + x1) / 2, -0.11, OZ + (z0 + z1) / 2);
        m.receiveShadow = true;
        group.add(m);
        return m;
      };
      slab(0, 0, W, D, floorMat, f > 0 ? mat(paintHex(g.floors[f - 1].design.ceiling), { r: 0.95 }) : edgeMat);
      const coreFloor = floorMaterial('terrazzo');
      if (f === 0) slab(CX0, 0, -WALL, D, coreFloor, edgeMat);
      else slab(CX0, 5.5, -WALL, D, coreFloor, mat('#e9e1d3'));
      // Fußmatte
      if (f === 0) {
        const mt = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.6), mat('#6a4a2e', { r: 1 }));
        mt.position.set(OX + CONFIG.core.door, 0.01, OZ + D - 0.5);
        group.add(mt);
      }

      // ── Wände ──
      const makeWall = (side, len, openings, opts) => {
        const { ext: extM, int: intM, dado, region, x0 = 0, cornice } = opts;
        const wg = new THREE.Group();
        const inner = new THREE.Group();
        wg.add(inner);
        const piece = (a, b, y0, y1) => {
          if (b - a < 0.01 || y1 - y0 < 0.01) return;
          const geo = new THREE.BoxGeometry(b - a, y1 - y0, WALL);
          wallUV(geo, a, y0 + f * H, b - a, y1 - y0);
          const m = new THREE.Mesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, extM, intM]);
          m.position.set((a + b) / 2, (y0 + y1) / 2, 0);
          m.castShadow = true; m.receiveShadow = true;
          inner.add(m);
        };
        let cur = 0;
        for (const o of openings.sort((a, b) => a.x0 - b.x0)) {
          piece(cur, o.x0, 0, wallH);
          piece(o.x0, o.x1, 0, o.y0);
          piece(o.x0, o.x1, o.y1, wallH);
          const fw = 0.07;
          const frame = (x, y, w, h) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, WALL + 0.04), frameMat);
            m.position.set(x, y, 0);
            inner.add(m);
          };
          frame((o.x0 + o.x1) / 2, o.y1 - fw / 2, o.x1 - o.x0, fw);
          if (o.y0 > 0) frame((o.x0 + o.x1) / 2, o.y0 + fw / 2, o.x1 - o.x0, fw);
          frame(o.x0 + fw / 2, (o.y0 + o.y1) / 2, fw, o.y1 - o.y0);
          frame(o.x1 - fw / 2, (o.y0 + o.y1) / 2, fw, o.y1 - o.y0);
          if (o.mullions) for (let k = 1; k < o.mullions; k++) frame(o.x0 + (o.x1 - o.x0) * k / o.mullions, (o.y0 + o.y1) / 2, fw * 0.8, o.y1 - o.y0);
          if (!o.door) {
            const gl = new THREE.Mesh(new THREE.BoxGeometry(o.x1 - o.x0 - 0.04, o.y1 - o.y0 - 0.04, 0.03), o.dark ? glassDark : this.glassLit);
            gl.position.set((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, 0);
            inner.add(gl);
            if (o.sill) {
              const s = new THREE.Mesh(new THREE.BoxGeometry(o.x1 - o.x0 + 0.1, 0.06, WALL + 0.16), mat('#e2dccf'));
              s.position.set((o.x0 + o.x1) / 2, o.y0 - 0.03, 0.04);
              inner.add(s);
              if (o.box) {
                // Blumenkasten mit Herbstblumen
                const bx = new THREE.Mesh(new THREE.BoxGeometry(o.x1 - o.x0 - 0.2, 0.18, 0.2), mat('#7a4f2e'));
                bx.position.set((o.x0 + o.x1) / 2, o.y0 - 0.15, 0.28);
                inner.add(bx);
                for (let k = 0; k < 6; k++) {
                  const fl2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), mat(['#d9772f', '#c8452f', '#e0a530'][k % 3]));
                  fl2.position.set(o.x0 + 0.2 + (o.x1 - o.x0 - 0.4) * k / 5, o.y0 + 0.02, 0.28);
                  inner.add(fl2);
                }
              }
            }
          } else if (o.glassDoor) {
            const gl = new THREE.Mesh(new THREE.BoxGeometry(o.x1 - o.x0 - 0.1, o.y1 - 0.1, 0.04), this.glassLit);
            gl.position.set(o.x0 + 0.05 + (o.x1 - o.x0 - 0.1) / 2, (o.y1 - 0.1) / 2, 0.2);
            gl.rotation.y = 0.9;
            gl.position.x -= 0.25;
            inner.add(gl);
          }
          cur = o.x1;
        }
        piece(cur, len, 0, wallH);
        if (dado) {
          const ws = new THREE.Mesh(new THREE.BoxGeometry(len - 0.02, 0.95, 0.025), dado);
          ws.position.set(len / 2, 0.475, -WALL / 2 - 0.013);
          ws.receiveShadow = true;
          inner.add(ws);
          const cap = new THREE.Mesh(new THREE.BoxGeometry(len - 0.02, 0.04, 0.05), mat(new THREE.Color(dado.color).multiplyScalar(0.8).getStyle()));
          cap.position.set(len / 2, 0.96, -WALL / 2 - 0.02);
          inner.add(cap);
        }
        if (cornice) {
          const cn = new THREE.Mesh(new THREE.BoxGeometry(len - 0.02, 0.12, 0.08), cornice);
          cn.position.set(len / 2, wallH - 0.06, -WALL / 2 - 0.04);
          inner.add(cn);
        }
        group.add(wg);
        const normal = { front: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] }[side];
        const rot = { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[side];
        wg.rotation.y = rot;
        const r = region;   // { x0, x1, z0, z1 } Innenmaße
        const pos = {
          front: [r.x0, r.z1 + WALL / 2], back: [r.x1, r.z0 - WALL / 2],
          left: [r.x0 - WALL / 2, r.z0], right: [r.x1 + WALL / 2, r.z1],
        }[side];
        wg.position.set(pos[0] + OX, 0, pos[1] + OZ);
        inner.position.x = x0;
        const mid = [OX + (r.x0 + r.x1) / 2 + normal[0] * (r.x1 - r.x0) / 2, OZ + (r.z0 + r.z1) / 2 + normal[1] * (r.z1 - r.z0) / 2];
        this.wallGroups.push({ f, side, group: wg, normal, mid, core: r.x1 < 0 });
        return wg;
      };

      const shopRegion = { x0: 0, x1: W, z0: 0, z1: D };
      const coreRegion = { x0: CX0, x1: -WALL, z0: 0, z1: D };
      const win = (x0, x1, extra = {}) => ({ x0, x1, y0: 0.95, y1: 2.55, sill: true, mullions: 2, dark: !active, box: active && !extra.noBox, ...extra });
      const wallOpts = (side) => {
        const wd = ds.walls[side];
        return {
          ext: facadeMat, int: active ? wallMaterial(wd.pattern, wd.color) : wallMaterial('beton', 'leinen'), region: shopRegion,
          dado: active && ds.wainscot.on ? mat(paintHex(ds.wainscot.color), { r: 0.85 }) : null, cornice: active ? ceilMat : null,
        };
      };
      if (f === 0) {
        const dx = CONFIG.doorX;
        makeWall('front', W, [
          { x0: 0.6, x1: dx - 0.4, y0: 0.35, y1: 2.6, mullions: 4 },
          { x0: dx - 0.05, x1: dx + 1.05, y0: 0, y1: 2.6, door: true, glassDoor: true },
          { x0: dx + 1.5, x1: W - 0.6, y0: 0.35, y1: 2.6, mullions: 2 },
        ], { ...wallOpts('front'), dado: null });
      } else {
        makeWall('front', W, [win(1, 3.4), win(4.4, 6.8), win(7.8, 10.2), win(11.2, 13.4)], wallOpts('front'));
      }
      makeWall('back', W, CONFIG.windows.back.map(([a, b]) => win(a, b, { mullions: 1, noBox: true })), wallOpts('back'));
      const cz = CONFIG.core.shopDoorZ;
      makeWall('left', D + WALL * 2, f > 0 ? [{ x0: cz + WALL, x1: cz + 1 + WALL, y0: 0, y1: 2.3, door: true }] : [], { ...wallOpts('left'), x0: -WALL, ext: coreWall });
      makeWall('right', D + WALL * 2, CONFIG.windows.right.map(([a, b]) => win(a, b, { mullions: 1, noBox: true })), { ...wallOpts('right'), x0: -WALL });

      // Treppenhaus-Wände
      const coreOpts = { ext: facadeMat, int: coreWall, region: coreRegion, dado: coreDado, cornice: mat('#f4efe6') };
      const cw = -WALL - CX0;
      makeWall('front', cw, f === 0
        ? [{ x0: CONFIG.core.door - CX0 - 0.5, x1: CONFIG.core.door - CX0 + 0.5, y0: 0, y1: 2.4, door: true, glassDoor: true }]
        : [win(0.7, 2.3, { mullions: 1, dark: false, box: false })], coreOpts);
      makeWall('back', cw, [], coreOpts);
      makeWall('left', D + WALL * 2, [win(4, 5.4, { mullions: 1, dark: false, box: false, y0: 1.2, y1: 2.5 })], { ...coreOpts, x0: -WALL });

      // Treppe im Treppenhaus
      if (f < FLOORS.length - 1) group.add(this.buildStairs());
      else group.add(this.buildTopRailing());
      if (f === 0) group.add(this.buildEntryDeco());

      // Außen: Markise + Schild im EG, Banner oben
      if (f === 0) {
        const aw = AWNINGS.find((a) => a.id === ext.awning) || AWNINGS[0];
        const awm = new THREE.MeshStandardMaterial({ map: texture('markise', [6, 1], `${aw.a}|${aw.b}`), roughness: 0.9 });
        const awning = new THREE.Mesh(new THREE.BoxGeometry(W - 1.2, 0.05, 1.3), awm);
        awning.position.set(OX + W / 2, 2.85, OZ + D + 0.8);
        awning.rotation.x = 0.28;
        awning.castShadow = true;
        group.add(awning);
        const val = new THREE.Mesh(new THREE.BoxGeometry(W - 1.2, 0.18, 0.02), mat(aw.a));
        val.position.set(OX + W / 2, 2.6, OZ + D + 1.42);
        group.add(val);
        this.frontDeco[f].push(awning, val);
        const name = shop ? shop.name : 'Zu vermieten';
        const signHex = paintHex(ext.sign);
        const light = new THREE.Color(signHex).getHSL({}).l > 0.6;
        const sign = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.62, 0.08), [frameMat, frameMat, frameMat, frameMat,
          new THREE.MeshStandardMaterial({ map: labelTexture(name.toUpperCase(), { w: 1024, h: 128, bg: signHex, fg: light ? '#2b211b' : '#f4e6c8', font: '600 76px Georgia, serif', border: '#c8a25a' }), roughness: 0.6 }), frameMat]);
        sign.position.set(OX + W / 2 - 1.4, 3.15, OZ + D + WALL + 0.06);
        group.add(sign);
        this.frontDeco[f].push(sign);
        // Hausnummer und Wegweiser am Treppenhaus
        const names = [1, 2].map((k) => (g.floors[k].shop ? `${FLOORS[k].short}  ${g.shops.get(g.floors[k].shop).name}` : `${FLOORS[k].short}  zu vermieten`));
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.62), new THREE.MeshStandardMaterial({ map: this.directoryTexture(names), roughness: 0.5 }));
        plate.position.set(OX + CONFIG.core.door + 0.95, 1.5, OZ + D + WALL + 0.012);
        group.add(plate);
        const nr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshStandardMaterial({ map: labelTexture('12', { w: 128, h: 96, bg: '#2c3a50', fg: '#f4ece0', font: '700 60px Georgia, serif' }) }));
        nr.position.set(OX + CONFIG.core.door, 2.62, OZ + D + WALL + 0.012);
        group.add(nr);
        this.frontDeco[f].push(plate, nr);
      } else {
        const label = shop ? shop.name : 'ZU VERMIETEN';
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshStandardMaterial({
          map: labelTexture(label, { w: 512, h: 100, bg: shop ? paintHex(ext.sign) : '#f4e6c8', fg: shop ? '#f4e6c8' : '#b23b2e', font: `600 ${shop ? 46 : 56}px Georgia, serif` }), roughness: 0.7,
        }));
        banner.position.set(OX + 5.6, 2.85, OZ + D + WALL + 0.02);
        group.add(banner);
        this.frontDeco[f].push(banner);
      }
    }
    // Dach über Laden und Treppenhaus
    const roof = new THREE.Group();
    roof.position.y = FLOORS.length * H;
    const rx0 = CX0 - WALL, rx1 = W + WALL;
    const top = new THREE.Mesh(new THREE.BoxGeometry(rx1 - rx0, 0.24, D + WALL * 2), mat('#6f6a64', { r: 0.95 }));
    top.position.set(OX + (rx0 + rx1) / 2, -0.1, OZ + D / 2);
    top.castShadow = true; top.receiveShadow = true;
    roof.add(top);
    for (const [x, z, w, d] of [[(rx0 + rx1) / 2, -0.05, rx1 - rx0 + 0.4, 0.3], [(rx0 + rx1) / 2, D + 0.05, rx1 - rx0 + 0.4, 0.3], [rx0, D / 2, 0.3, D + 0.4], [rx1, D / 2, 0.3, D + 0.4]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), mat('#d8d2c6'));
      p.position.set(OX + x, 0.25, OZ + z);
      p.castShadow = true;
      roof.add(p);
    }
    for (const [x, z] of [[3, 3], [9.5, 6]]) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1), mat('#b9bec4', { m: 0.4, r: 0.5 }));
      ac.position.set(OX + x, 0.4, OZ + z);
      ac.castShadow = true;
      roof.add(ac);
    }
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.7), edgeMat);
    chimney.position.set(OX - 1.6, 0.7, OZ + 1.2);
    roof.add(chimney);
    root.add(roof);
    this.roof = roof;
    this.applyView();
  }

  directoryTexture(lines) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 176;
    const g = c.getContext('2d');
    g.fillStyle = '#c9a35a'; g.fillRect(0, 0, 256, 176);
    g.fillStyle = '#2b211b'; g.fillRect(8, 8, 240, 160);
    g.fillStyle = '#f4e6c8'; g.font = '600 22px Georgia, serif'; g.textAlign = 'center';
    g.fillText('Haus 12', 128, 40);
    g.font = '17px Georgia, serif'; g.textAlign = 'left';
    lines.forEach((l, i) => g.fillText(l.slice(0, 22), 20, 82 + i * 34));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // Podesttreppe im Treppenhaus: Lauf A steigt bei x ≈ -2.45 nach hinten, Lauf B bei x ≈ -0.95 nach vorn
  buildStairs() {
    const g = new THREE.Group();
    const step = mat('#9a948c', { r: 0.8 });
    const tread = mat('#a8743f', { r: 0.7 });
    const n = 11, run = 4.0, rise = H / 2;
    const ax = OX - 2.45, bx = OX - 0.95, w = 1.44;
    for (let i = 0; i < n; i++) {
      const h = rise * (i + 1) / n;
      const a = new THREE.Mesh(new THREE.BoxGeometry(w, h, run / n), [step, step, tread, step, step, step]);
      a.position.set(ax, h / 2, OZ + 5.5 - (i + 0.5) * run / n);
      const hb = rise + rise * (i + 1) / n;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, rise * 2 / n + 0.02, run / n), [step, step, tread, step, step, step]);
      b.position.set(bx, hb - rise / n, OZ + 1.5 + (i + 0.5) * run / n);
      for (const m of [a, b]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    }
    const landing = new THREE.Mesh(new THREE.BoxGeometry(-WALL - CX0, 0.2, 1.5), [step, step, tread, step, step, step]);
    landing.position.set(OX + (CX0 - WALL) / 2, rise - 0.1, OZ + 0.75);
    landing.castShadow = true;
    g.add(landing);
    // Mittelwange zwischen den Läufen mit Handlauf
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 4.0), mat('#e9e1d3'));
    wall.position.set(OX - 1.7, H / 2, OZ + 3.5);
    g.add(wall);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 4.1), mat('#6a4426', { r: 0.5 }));
    rail.position.set(OX - 1.62, H * 0.75, OZ + 3.5);
    rail.rotation.x = Math.atan2(rise, run);
    g.add(rail);
    // Briefkästen und Pflanze am Podest im EG (nur dort sichtbar sinnvoll)
    return g;
  }

  buildTopRailing() {
    const g = new THREE.Group();
    const m = mat('#2c3035', { m: 0.6, r: 0.4 });
    const r = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), m);
    r.position.set(OX - 2.45, 1.0, OZ + 5.5);
    g.add(r);
    for (let i = 0; i <= 5; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.0, 0.03), m);
      p.position.set(OX - 3.2 + i * 0.3, 0.5, OZ + 5.5);
      g.add(p);
    }
    return g;
  }

  // Kleine Details am Eingang: Briefkästen, Kundenstopper, Kürbisse, Fahrrad
  buildEntryDeco() {
    const g = new THREE.Group();
    // Briefkästen im Treppenhaus
    for (let i = 0; i < 3; i++) {
      const bx = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.4), mat(['#365648', '#7a2e35', '#2c3a50'][i], { m: 0.3, r: 0.5 }));
      bx.position.set(OX + CX0 + 0.04, 1.4, OZ + 7.2 + i * 0.45);
      g.add(bx);
    }
    const plant = furnitureMesh('palme', 0);
    plant.position.set(OX - 0.7, 0, OZ + 9.3);
    plant.scale.setScalar(0.8);
    g.add(plant);
    // Kundenstopper vor dem Café
    const stand = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.03), new THREE.MeshStandardMaterial({ map: texture('tafel'), roughness: 0.9 }));
    board.position.y = 0.45;
    board.rotation.x = -0.18;
    board.position.z = 0.08;
    const back = board.clone();
    back.rotation.x = 0.18;
    back.position.z = -0.08;
    stand.add(board, back);
    stand.position.set(OX + CONFIG.doorX + 2.2, 0, OZ + D + 0.9);
    stand.rotation.y = 0.3;
    g.add(stand);
    for (const [x, z, t] of [[CONFIG.doorX - 0.7, D + 0.45, 'kuerbisse'], [CONFIG.doorX + 1.7, D + 0.45, 'kuerbisse'], [CONFIG.core.door + 0.9, D + 0.4, 'laterne'], [CONFIG.core.door - 1.0, D + 0.4, 'kuerbisse']]) {
      const k = furnitureMesh(t, 0);
      k.position.set(OX + x, 0, OZ + z);
      g.add(k);
    }
    // Kranz an der Haustür
    const wreath = furnitureMesh('kranz', 0);
    wreath.position.set(OX + CONFIG.core.door, -0.55, OZ + D + WALL + 0.5);
    g.add(wreath);
    this.frontDeco[0].push(wreath);
    // Fahrrad
    const bike = new THREE.Group();
    const fm = mat('#2f5d50', { m: 0.4, r: 0.4 });
    for (const x of [-0.5, 0.5]) {
      const wh = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 6, 20), mat('#1b1b1d'));
      wh.position.set(x, 0.35, 0);
      bike.add(wh);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.04), fm);
    bar.position.set(0, 0.62, 0);
    bike.add(bar);
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), mat('#b98a50'));
    basket.position.set(0.6, 0.78, 0);
    bike.add(basket);
    bike.position.set(OX + 3.6, 0, OZ + D + 0.45);
    g.add(bike);
    return g;
  }

  // ───────────── Hilfsebenen (Raster, Hover, Auswahl) ─────────────

  buildOverlays() {
    const pts = [];
    for (let x = 0; x <= W; x++) pts.push(x + OX, 0, OZ, x + OX, 0, D + OZ);
    for (let z = 0; z <= D; z++) pts.push(OX, 0, z + OZ, W + OX, 0, z + OZ);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false }));
    this.grid.visible = false;
    this.scene.add(this.grid);

    this.reservedMarks = new THREE.Group();
    this.scene.add(this.reservedMarks);

    this.hover = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, depthWrite: false }));
    this.hover.rotation.x = -Math.PI / 2;
    this.hover.visible = false;
    this.scene.add(this.hover);

    this.selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: '#f2b544' }));
    this.selBox.visible = false;
    this.scene.add(this.selBox);
    this.ghost = null;
    this.ghostKey = '';
  }

  updateReservedMarks() {
    for (const c of [...this.reservedMarks.children]) this.reservedMarks.remove(c);
    if (!this.buildMode || this.view === 'out') return;
    const f = this.view;
    const m = new THREE.MeshBasicMaterial({ color: '#6fb7ff', transparent: true, opacity: 0.22, depthWrite: false });
    for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
      if (!isReserved(f, x, z)) continue;
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), m);
      q.rotation.x = -Math.PI / 2;
      const [wx, wz] = toWorld(x + 0.5, z + 0.5);
      q.position.set(wx, f * H + 0.015, wz);
      this.reservedMarks.add(q);
    }
  }

  setBuildMode(on) {
    this.buildMode = on;
    this.applyView();
  }

  setHover(cell) {
    if (!cell || this.view === 'out') { this.hover.visible = false; return; }
    const [wx, wz] = toWorld(cell.x + 0.5, cell.z + 0.5);
    this.hover.position.set(wx, this.view * H + 0.02, wz);
    this.hover.visible = true;
  }

  setSelected(item) {
    if (!item) { this.selBox.visible = false; return; }
    const def = FURNITURE[item.type];
    const [w, d] = footprint(item.type, item.rot);
    const [wx, wz] = toWorld(item.x + w / 2, item.z + d / 2);
    const [h, y0] = def.layer === 'rug' ? [0.1, 0] : def.layer === 'ceil' ? [1.4, H - 1.6] : def.layer === 'wall' ? [1.6, 0.9] : [1.3, 0];
    this.selBox.scale.set(w + 0.06, h, d + 0.06);
    this.selBox.position.set(wx, item.floor * H + y0 + h / 2, wz);
    this.selBox.visible = true;
  }

  setGhost(type, f, x, z, rot, ok, v = 0) {
    if (!type) {
      if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; this.ghostKey = ''; }
      return;
    }
    const key = `${type}|${ok}|${v}`;
    if (this.ghostKey !== key) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = ghostOf(furnitureMesh(type, v), ok);
      this.ghostKey = key;
      this.scene.add(this.ghost);
    }
    const [w, d] = footprint(type, rot);
    const [wx, wz] = toWorld(x + w / 2, z + d / 2);
    this.ghost.position.set(wx, f * H + 0.01, wz);
    this.ghost.rotation.y = rot * Math.PI / 2;
  }

  // ───────────── Ansicht ─────────────

  setView(v) {
    this.view = v;
    this.targetY = v === 'out' ? 3.5 : v * H + 1;
    this.applyView();
  }

  applyView() {
    const v = this.view;
    const top = v === 'out' ? FLOORS.length - 1 : v;
    this.floorGroups.forEach((g, f) => { g.visible = f <= top; });
    if (this.roof) this.roof.visible = v === 'out';
    this.grid.visible = this.buildMode && v !== 'out';
    if (v !== 'out') this.grid.position.y = v * H + 0.012;
    this.updateReservedMarks();
    this.layoutSeen = -1; // Sichtbarkeit der Möbel neu setzen
  }

  // Wände der aktiven Etage, die zur Kamera zeigen, werden heruntergeklappt
  updateCutaway(dt) {
    const cam = this.camera.position;
    const k = 1 - Math.exp(-Math.max(dt, 1 / 60) * 14);
    this.cutSides.clear();
    for (const w of this.wallGroups) {
      let cut = false;
      if (this.view !== 'out' && w.f === this.view) {
        const dx = cam.x - w.mid[0], dz = cam.z - w.mid[1];
        cut = dx * w.normal[0] + dz * w.normal[1] > 0.5;
      }
      if (cut && !w.core) this.cutSides.add(w.side);
      const target = cut ? 0.1 : 1;
      w.group.scale.y += (target - w.group.scale.y) * k;
      if (Math.abs(target - w.group.scale.y) < 0.01) w.group.scale.y = target;
      if (w.side === 'front' && !w.core) for (const d of this.frontDeco[w.f]) d.visible = w.group.scale.y > 0.6;
    }
    // Wandobjekte an heruntergeklappten Wänden ausblenden
    for (const [id, m] of this.itemMeshes) {
      const it = this.game.items.get(id);
      if (!it || FURNITURE[it.type].layer !== 'wall') continue;
      const top = this.view === 'out' ? FLOORS.length - 1 : this.view;
      m.visible = it.floor <= top && !(it.floor === this.view && this.cutSides.has(wallSideOf(it.rot)));
    }
  }

  // ───────────── Synchronisierung ─────────────

  syncItems() {
    const g = this.game;
    const top = this.view === 'out' ? FLOORS.length - 1 : this.view;
    for (const [id, m] of [...this.itemMeshes]) {
      const it = g.items.get(id);
      if (!it || m.userData.v !== it.v) { this.itemRoot.remove(m); this.itemMeshes.delete(id); }
    }
    const seatYaw = new Map();
    for (const d of g.derived) for (const s of d.seats) if (FURNITURE[g.items.get(s.item)?.type]?.seat === 'chair') seatYaw.set(s.item, s.yaw);
    for (const it of g.items.values()) {
      let m = this.itemMeshes.get(it.id);
      if (!m) {
        m = furnitureMesh(it.type, it.v || 0);
        m.userData.itemId = it.id;
        m.userData.v = it.v;
        this.itemRoot.add(m);
        this.itemMeshes.set(it.id, m);
      }
      const [w, d] = footprint(it.type, it.rot);
      const [wx, wz] = toWorld(it.x + w / 2, it.z + d / 2);
      m.position.set(wx, it.floor * H, wz);
      m.rotation.y = seatYaw.has(it.id) ? seatYaw.get(it.id) : it.rot * Math.PI / 2;
      m.visible = it.floor <= top;
    }
  }

  syncPeople(dt) {
    const g = this.game;
    const top = this.view === 'out' ? FLOORS.length - 1 : this.view;
    const raining = g.weather?.type === 'regen';
    for (const [id, p] of [...this.people]) {
      if (!g.agents.has(id)) { this.peopleRoot.remove(p.mesh); this.people.delete(id); }
    }
    for (const [id, p] of [...this.cats]) {
      if (!g.agents.has(id)) { this.peopleRoot.remove(p.mesh); this.cats.delete(id); }
    }
    for (const a of g.agents.values()) {
      const isCat = a.kind === 'pet';
      const store = isCat ? this.cats : this.people;
      let p = store.get(a.id);
      if (!p) {
        p = { mesh: isCat ? buildCat(a.color) : buildPerson(a.look), phase: Math.random() * 6, yaw: a.yaw, last: [a.x, a.y, a.z] };
        p.mesh.userData.agentId = a.id;
        this.peopleRoot.add(p.mesh);
        store.set(a.id, p);
      }
      const [wx, wz] = toWorld(a.x, a.z);
      const moved = Math.hypot(a.x - p.last[0], a.z - p.last[2], (a.y - p.last[1]) * 0.6);
      p.last = [a.x, a.y, a.z];
      const speed = dt > 0 ? moved / dt : 0;
      p.phase += moved * (isCat ? 9 : 4.2);
      let dy = a.yaw - p.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.yaw += dy * Math.min(1, dt * 10);
      p.mesh.position.set(wx, a.y, wz);
      p.mesh.rotation.y = p.yaw;
      p.mesh.visible = a.z >= D || a.floor <= top;
      if (isCat) {
        poseCat(p.mesh, { walk: p.phase, amount: Math.min(1, speed / 0.5), sleep: a.state === 'sleep', t: this.time + a.id });
      } else {
        posePerson(p.mesh, {
          walk: p.phase, amount: Math.min(1, speed / 1.2), sit: a.state === 'sitting' ? (a.seatH || 0.47) : 0,
          carry: a.cup || null, umbrella: raining && a.z > D - 0.3, t: this.time + a.id,
        });
      }
    }
    // Baristas
    const want = new Map();
    for (let f = 0; f < FLOORS.length; f++) {
      const shop = g.shopOnFloor(f);
      g.staffSpots(f).forEach((s, i) => want.set(`${f}:${i}:${shop?.apron}`, { ...s, f, apron: shop?.apron }));
    }
    for (const [k, p] of [...this.staff]) if (!want.has(k)) { this.peopleRoot.remove(p); this.staff.delete(k); }
    let i = 0;
    for (const [k, s] of want) {
      let p = this.staff.get(k);
      if (!p) {
        const look = { skin: ['#f1c9a5', '#c68863', '#8d5a3b', '#e0ac87'][i % 4], pants: '#2b2f3a', hair: ['#3b2a1d', '#1f1712', '#b98a4b', '#6d4a2c'][i % 4], hairStyle: i % 3, height: 0.96 + (i % 3) * 0.04, apron: paintHex(s.apron || 'tanne') };
        p = buildPerson(look, true);
        this.peopleRoot.add(p);
        this.staff.set(k, p);
      }
      i++;
      const [wx, wz] = toWorld(s.x, s.z);
      p.position.set(wx, s.f * H, wz);
      p.rotation.y = s.yaw;
      p.visible = s.f <= top;
      posePerson(p, { work: s.busy ? 1 : 0, t: this.time + i });
    }
  }

  // ───────────── Effekte (Sprechblasen, Geld) ─────────────

  spriteFor(text, kind) {
    const c = document.createElement('canvas');
    const emoji = kind === 'bubble';
    c.width = emoji ? 96 : 320; c.height = emoji ? 96 : 80;
    const g = c.getContext('2d');
    if (emoji) {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(48, 44, 38, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(36, 76); g.lineTo(48, 94); g.lineTo(58, 74); g.fill();
      g.font = '48px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 48, 47);
    } else {
      g.font = '700 46px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = 'rgba(40,30,20,0.85)';
      g.strokeText(text, 160, 42);
      g.fillStyle = kind === 'tip' ? '#ffd27a' : '#9ff0b4';
      g.fillText(text, 160, 42);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    s.renderOrder = 10;
    s.scale.set(emoji ? 0.55 : 1.75, emoji ? 0.55 : 0.44, 1);
    return s;
  }

  consumeFx(list) {
    for (const fx of list) {
      if (fx.kind === 'bubble') {
        const s = this.spriteFor(fx.icon, 'bubble');
        this.scene.add(s);
        this.sprites.push({ s, agent: fx.agent, life: 2.2, max: 2.2 });
      } else if (fx.kind === 'money') {
        const txt = `+${fx.amount.toFixed(2).replace('.', ',')} €${fx.tip ? ' 💛' : ''}`;
        const s = this.spriteFor(txt, fx.tip ? 'tip' : 'money');
        const [wx, wz] = toWorld(fx.x + (fx.tip ? 0.5 : 0), fx.z);
        s.position.set(wx, fx.floor * H + (fx.tip ? 2.5 : 2.1), wz);
        s.userData.floor = fx.floor;
        this.scene.add(s);
        this.sprites.push({ s, life: 1.6, max: 1.6, rise: true });
      }
    }
  }

  updateSprites(dt) {
    const top = this.view === 'out' ? FLOORS.length - 1 : this.view;
    for (const sp of [...this.sprites]) {
      sp.life -= dt;
      if (sp.agent) {
        const p = this.people.get(sp.agent) || this.cats.get(sp.agent);
        const a = this.game.agents.get(sp.agent);
        if (!p || !a) sp.life = 0;
        else {
          sp.s.position.set(p.mesh.position.x, p.mesh.position.y + (a.kind === 'pet' ? 0.75 : 2.15), p.mesh.position.z);
          sp.s.visible = p.mesh.visible && (this.view === 'out' || a.z >= D || a.floor === this.view);
        }
      } else if (sp.rise) {
        sp.s.position.y += dt * 0.7;
        sp.s.visible = this.view === 'out' ? sp.s.userData.floor === 0 : sp.s.userData.floor === top;
      }
      sp.s.material.opacity = Math.min(1, sp.life / 0.4);
      if (sp.life <= 0) {
        this.scene.remove(sp.s);
        sp.s.material.map.dispose();
        sp.s.material.dispose();
        this.sprites.splice(this.sprites.indexOf(sp), 1);
      }
    }
  }

  // ───────────── Licht nach Uhrzeit und Wetter ─────────────

  updateLight() {
    const c = this.game.clock;
    const wx = this.game.weather?.type || 'sonne';
    const t = clamp01((c - 7.3 * 60) / (11.2 * 60));           // Sonnenaufgang 7:20, -untergang 18:30
    const elev = Math.sin(t * Math.PI);
    this.sun.position.set(-26 + t * 52, 6 + elev * 26, 18 - elev * 6);
    this.sun.target.position.set(0, 0, 0);
    const golden = smooth(16 * 60, 18 * 60, c);
    const dusk = smooth(18 * 60, 19.4 * 60, c);
    const morning = 1 - smooth(7 * 60, 8.4 * 60, c);
    this.dark = Math.max(dusk, morning * 0.8);
    const gloomy = { sonne: 0, wolken: 0.4, regen: 0.7, nebel: 0.6, wind: 0.35 }[wx];
    this.sun.intensity = 2.6 * (0.2 + 0.8 * elev) * (1 - dusk * 0.95) * (1 - gloomy * 0.6);
    this.sun.color.setHSL(0.08, 0.5 + golden * 0.4, 0.8 - golden * 0.15);
    this.hemi.intensity = (0.85 + elev * 0.35) * (1 - dusk * 0.55);
    const day = new THREE.Color('#c9d6dc').lerp(new THREE.Color('#9aa3a8'), gloomy);
    const sky = day.clone().lerp(new THREE.Color('#f0a86a'), golden * (1 - gloomy * 0.6) * 0.8).lerp(new THREE.Color('#2e3450'), dusk).lerp(new THREE.Color('#e7b48a'), morning * 0.5);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.scene.fog.near = wx === 'nebel' ? 8 : wx === 'regen' ? 30 : 55;
    this.scene.fog.far = wx === 'nebel' ? 55 : wx === 'regen' ? 95 : 130;
    this.rain.visible = wx === 'regen';
    for (const m of this.groundMats) m.roughness = wx === 'regen' ? 0.35 : 0.95;
    for (const m of this.lampMats) m.emissiveIntensity = this.dark * 2.2 + gloomy * 0.3;
    if (this.glassLit) this.glassLit.emissiveIntensity = this.dark * 0.55 + gloomy * 0.1;
    const glow = 0.35 + Math.max(this.dark, gloomy * 0.5) * 1.1;
    const flick = 0.85 + Math.sin(this.time * 9.1) * 0.08 + Math.sin(this.time * 23.7) * 0.07;
    for (const m of glowMats) m.emissiveIntensity = m.userData.glow * (m.userData.flicker ? flick * 1.2 : glow);
    const f = this.view === 'out' ? 0 : this.view;
    this.inner.position.set(OX + W * 0.3, f * H + 2.6, OZ + D / 2);
    this.inner2.position.set(OX + W * 0.75, f * H + 2.6, OZ + D / 2);
    this.inner.intensity = this.inner2.intensity = 3 + this.dark * 12 + gloomy * 4;
  }

  // ───────────── Picking ─────────────

  ndc(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  pickCell(clientX, clientY) {
    if (this.view === 'out') return null;
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.view * H);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, p)) return null;
    const x = Math.floor(p.x - OX), z = Math.floor(p.z - OZ);
    return { x, z, inside: x >= 0 && z >= 0 && x < W && z < D };
  }

  pickAgent(clientX, clientY) {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const list = [...this.people.values(), ...this.cats.values()].filter((p) => p.mesh.visible).map((p) => p.mesh);
    const hit = this.raycaster.intersectObjects(list, true)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o && o.userData.agentId === undefined) o = o.parent;
    return o ? o.userData.agentId : null;
  }

  pickItem(clientX, clientY) {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const list = [...this.itemMeshes.values()].filter((m) => m.visible && (this.view === 'out' || this.game.items.get(m.userData.itemId)?.floor === this.view));
    const hit = this.raycaster.intersectObjects(list, true)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o && o.userData.itemId === undefined) o = o.parent;
    return o ? o.userData.itemId : null;
  }

  // ───────────── Vorschaubilder für den Katalog ─────────────

  thumbnail(type, canvas, v = 0) {
    if (!this.thumbs) this.thumbs = new Map();
    const key = `${type}|${v}`;
    let img = this.thumbs.get(key);
    if (!img) {
      if (!this.thumbRenderer) {
        this.thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        this.thumbRenderer.setPixelRatio(1);
        this.thumbRenderer.setSize(184, 112, false);
        this.thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
        this.thumbRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.thumbScene = new THREE.Scene();
        this.thumbScene.add(new THREE.HemisphereLight('#ffffff', '#b8a68e', 1.6));
        const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
        sun.position.set(3, 6, 4);
        this.thumbScene.add(sun);
        this.thumbCam = new THREE.PerspectiveCamera(30, 184 / 112, 0.1, 50);
      }
      const obj = furnitureMesh(type, v);
      this.thumbScene.add(obj);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const r = Math.max(size.x, size.y * 1.3, size.z) * 0.62 + 0.25;
      const dist = r / Math.sin(THREE.MathUtils.degToRad(15));
      this.thumbCam.position.copy(mid).add(new THREE.Vector3(0.55, 0.55, 1).normalize().multiplyScalar(dist * 0.62));
      this.thumbCam.lookAt(mid);
      for (const m of glowMats) m.emissiveIntensity = m.userData.glow;
      this.thumbRenderer.render(this.thumbScene, this.thumbCam);
      img = document.createElement('canvas');
      img.width = 184; img.height = 112;
      img.getContext('2d').drawImage(this.thumbRenderer.domElement, 0, 0);
      this.thumbScene.remove(obj);
      this.thumbs.set(key, img);
    }
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  screenshot() {
    return this.canvas.toDataURL('image/jpeg', 0.92);
  }

  // ───────────── Frame ─────────────

  frame(dt, fx = [], realDt = dt) {
    this.realDt = realDt;
    this.time += realDt;
    const sig = this.signature();
    if (sig !== this.buildingSig) { this.buildingSig = sig; this.buildBuilding(); }
    if (this.layoutSeen !== this.game.layoutVersion) {
      this.layoutSeen = this.game.layoutVersion;
      this.syncItems();
      this.updateReservedMarks();
    }
    this.consumeFx(fx);
    this.syncPeople(dt);
    this.updateSprites(realDt);
    this.updateParticles(realDt);
    for (const car of this.cars) {
      car.position.x += car.userData.dir * car.userData.speed * realDt;
      if (car.position.x > 45) car.position.x = -45;
      if (car.position.x < -45) car.position.x = 45;
    }
    const t = this.controls.target;
    const dy = (this.targetY - t.y) * Math.min(1, realDt * 6);
    t.y += dy;
    this.camera.position.y += dy;
    t.x = Math.max(-W, Math.min(W, t.x));
    t.z = Math.max(-D, Math.min(D + 6, t.z));
    this.controls.update();
    this.updateCutaway(realDt);
    this.updateLight();
    this.renderer.render(this.scene, this.camera);
  }
}
