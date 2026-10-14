// Three.js-Darstellung: Herbstliche Ladenzeile mit Schnittmodell-Läden (Diorama-Look),
// Einrichtung, Kundschaft, Katzen, Wetter und Effekte. Liest den Zustand aus Game, verändert ihn nie.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  CONFIG, LOTS, FURNITURE, SHOP_TYPES, FACADES, AWNINGS, FRAMES, paintHex, lotX, streetLength,
} from './data.js';
import { footprint, isReserved, wallSideOf } from './sim.js';
import {
  mat, texture, labelTexture, furnitureMesh, ghostOf, buildPerson, posePerson, buildCat, poseCat,
  glowMats, wallMaterial, floorMaterial, facadeMaterial,
} from './models.js';

const { W, D, floorHeight: H } = CONFIG;
const WALL = 0.22;
const OX = -streetLength() / 2, OZ = -D / 2;     // globale Ladenkoordinate → Welt (Straße mittig)
const toWorld = (gx, z) => [gx + OX, z + OZ];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const EDGE = '#29292c';                            // dunkle Wandkanten wie im Schnittmodell

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
    this.scene.fog = new THREE.Fog('#cfd6d6', 60, 150);

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 140;
    this.controls.maxPolarAngle = 1.38;
    this.controls.minPolarAngle = 0.15;
    this.controls.screenSpacePanning = false;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.focus = new THREE.Vector3(OX + W / 2, 0.8, 0.5);
    this.controls.target.copy(this.focus);
    this.camera.position.set(this.focus.x + 4, 16, 22);

    this.hemi = new THREE.HemisphereLight('#e6ecf2', '#8a7258', 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffe6c4', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 100 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    // Je Laden ein warmes Innenlicht
    this.lotLights = LOTS.map((_, i) => {
      const l = new THREE.PointLight('#ffcf96', 0, 20, 1.3);
      l.position.set(OX + lotX(i) + W / 2, 2.8, OZ + D / 2);
      this.scene.add(l);
      return l;
    });

    this.view = 0;                 // betrachteter Laden (Grundstück) oder 'out' für die Straßenansicht
    this.lotGroups = [];
    this.wallGroups = [];
    this.frontDeco = LOTS.map(() => []);
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
    this.cutSides = LOTS.map(() => new Set());

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
    this.camera.fov = w < h ? 52 : 36;
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
    const L = streetLength() + 70;
    this.groundMats = [];
    plane(L + 200, 260, tex('wiese', 60, 60), 0, -0.14, 0);
    const walk = tex('gehweg', L / 2, 1.7);
    plane(L, 3.4, walk, 0, 0.001, front + 1.7);
    const road = tex('asphalt', L / 4, 2);
    plane(L, 7, road, 0, -0.12, front + 6.9);
    const walk2 = tex('gehweg', L / 2, 1.5);
    plane(L, 3, walk2, 0, 0.001, front + 11.9);
    plane(L, 10, tex('gehweg', L / 3, 3), 0, 0.0, -D / 2 - 5);
    this.groundMats.push(walk, road, walk2);
    for (const z of [front + 3.4, front + 10.4]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(L, 0.14, 0.18), mat('#cfc8bd'));
      c.position.set(0, -0.06, z);
      c.receiveShadow = true;
      w.add(c);
    }
    for (let x = -L / 2 + 2; x < L / 2; x += 4) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.14), mat('#e8e4d8'));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, -0.115, front + 6.9);
      w.add(m);
    }
    // Altbauten an beiden Enden der Ladenzeile
    const bx0 = OX - 3, bx1 = OX + streetLength() + 3;
    const facade = (floors, color, x0, x1) => {
      const h = floors * 3.4 + 0.6;
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = color; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#e9e3d6'; g.fillRect(28, 26, 72, 86);
      g.fillStyle = '#4b5a66'; g.fillRect(34, 32, 60, 74);
      g.fillStyle = '#6f8394'; g.fillRect(34, 32, 60, 30);
      g.fillStyle = '#e9e3d6'; g.fillRect(62, 32, 4, 74);
      g.fillStyle = '#b84a2f'; g.fillRect(30, 104, 68, 10);
      g.fillStyle = '#d9772f'; for (let i = 0; i < 6; i++) g.fillRect(34 + i * 11, 98, 7, 7);
      const tx = new THREE.CanvasTexture(c);
      tx.colorSpace = THREE.SRGBColorSpace;
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
      tx.repeat.set(Math.round((x1 - x0) / 2.6), floors);
      const sideMat = mat(color, { r: 0.9 });
      const frontMat = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.85 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, D + 2), [sideMat, sideMat, mat('#6e6a66'), sideMat, frontMat, sideMat]);
      b.position.set((x0 + x1) / 2, h / 2, -0.4);
      b.castShadow = true; b.receiveShadow = true;
      w.add(b);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.3, 0.3, D + 2.3), mat('#d8d2c6'));
      cap.position.set((x0 + x1) / 2, h, -0.4);
      w.add(cap);
    };
    facade(4, '#c9b48f', bx0 - 11, bx0);
    facade(5, '#b98f7a', bx0 - 22.2, bx0 - 11.2);
    facade(3, '#9fb3b0', bx1, bx1 + 12);
    facade(4, '#8fa3b9', bx1 + 12.2, bx1 + 24);
    // Park gegenüber
    plane(L, 18, new THREE.MeshStandardMaterial({ map: texture('wiese', [30, 5]), roughness: 1 }), 0, -0.13, front + 22.4);
    for (const [x, z, sx] of [[-14, front + 17, 12], [6, front + 18.5, 9], [26, front + 17.5, 10]]) {
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.8, 0.9), mat('#6d7d3f', { r: 0.95 }));
      hedge.position.set(x, 0.3, z);
      hedge.castShadow = true;
      w.add(hedge);
    }
    // Herbstbäume: am Gehweg zwischen den Läden, im Park und an den Enden
    const crownCols = ['#d9772f', '#c8452f', '#e0a530', '#b8562a', '#9a8a3a', '#e3893a'];
    let ti = 0;
    this.treeX = [];
    const tree = (x, z, s = 1) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 2.2, 8), mat('#5e4532'));
      trunk.position.y = 1.1; trunk.castShadow = true;
      g.add(trunk);
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
      this.treeX.push([x, z]);
      ti++;
    };
    for (let i = 0; i <= LOTS.length; i++) tree(OX + lotX(i) - CONFIG.lotGap / 2, front + 2.9, 0.9 + (i % 2) * 0.15);
    tree(bx0 - 6, front + 2.9); tree(bx1 + 6, front + 2.9);
    for (let x = -L / 2 + 8; x < L / 2; x += 11) tree(x + (ti % 3), front + 17.5 + (ti % 4) * 1.4, 1.1 + (ti % 3) * 0.1);
    // Laub auf Gehweg, Rinnstein und im Park
    const leafGeo = new THREE.PlaneGeometry(0.2, 0.13);
    leafGeo.rotateX(-Math.PI / 2);
    const N = 1300;
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    const lc = ['#d9772f', '#c8452f', '#e0a530', '#a8562a', '#8a5a2a'];
    for (let i = 0; i < N; i++) {
      const h = (n) => { const v = Math.sin(i * n) * 43758.5453; return v - Math.floor(v); };
      const a = h(12.9898), b = h(78.233), c = h(39.425);
      const x = -L / 2 + a * L;
      let z, y = 0.006;
      if (i < 650) z = front + 0.2 + b * 3.2;
      else if (i < 760) { z = front + 3.6 + b * 0.5; y = -0.11; }
      else { z = front + 13.5 + b * 16; y = -0.12; }
      e.set(0, c * 6.28, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, y + 0.004, z), q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + c * 0.6));
      leaves.setMatrixAt(i, m4);
      leaves.setColorAt(i, col.set(lc[i % lc.length]));
    }
    leaves.receiveShadow = true;
    w.add(leaves);
    // Laternen zwischen den Läden
    for (let i = 0; i <= LOTS.length; i++) {
      const x = OX + lotX(i) - CONFIG.lotGap / 2 + 1.2;
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
    // Autos
    this.cars = [];
    const carColors = ['#8a3b32', '#2f6b9a', '#e5e1d8', '#3b3f45', '#c08a3e'];
    for (let i = 0; i < 5; i++) {
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
      car.position.set(-L / 2 + i * (L / 5), -0.12, front + (dir > 0 ? 5.3 : 8.5));
      car.rotation.y = dir > 0 ? 0 : Math.PI;
      car.userData = { dir, speed: 6 + i * 1.3, L };
      w.add(car);
      this.cars.push(car);
    }
  }

  // ───────────── Fallendes Laub und Regen ─────────────

  buildParticles() {
    const geo = new THREE.PlaneGeometry(0.16, 0.11);
    this.fallN = 180;
    this.falling = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 }), this.fallN);
    this.fallData = [];
    const lc = ['#d9772f', '#c8452f', '#e0a530', '#b8562a'];
    const col = new THREE.Color();
    for (let i = 0; i < this.fallN; i++) {
      this.fallData.push(this.newLeaf(true));
      this.falling.setColorAt(i, col.set(lc[i % lc.length]));
    }
    this.falling.frustumCulled = false;
    this.scene.add(this.falling);

    const n = 1800;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 90, y = Math.random() * 22, z = (Math.random() - 0.5) * 40 + 4;
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
    const [tx, tz] = this.treeX[Math.floor(Math.random() * this.treeX.length)];
    return {
      x: tx + (Math.random() - 0.5) * 3, z: tz + (Math.random() - 0.5) * 3,
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
      this.rain.position.x = this.focus.x * 0.5;
    }
  }

  // ───────────── Läden ─────────────

  signature() {
    const g = this.game;
    return `${g.designVersion}|` + g.lots.map((l) => {
      const s = g.shops.get(l.shop);
      return `${l.owned ? 1 : 0}:${s ? s.type + '/' + s.name : ''}`;
    }).join('|');
  }

  buildLots() {
    const root = this.buildingRoot;
    for (const c of [...root.children]) root.remove(c);
    this.lotGroups = [];
    this.wallGroups = [];
    this.roofs = [];
    this.frontDeco = LOTS.map(() => []);
    this.glassLit = new THREE.MeshStandardMaterial({ color: '#b9cfd6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, emissive: '#ffb866', emissiveIntensity: 0 });
    this.signMats = [];
    for (let i = 0; i < LOTS.length; i++) {
      const g = new THREE.Group();
      g.position.x = OX + lotX(i);
      root.add(g);
      this.lotGroups[i] = g;
      this.buildPlinth(i, g);
      const lt = this.game.lots[i];
      if (!lt.owned) this.buildForSale(i, g);
      else this.buildStore(i, g);
    }
    this.applyView();
  }

  // Sockel mit Pflaster, Rasenstreifen und Pflanzkübeln wie bei einem Architekturmodell
  buildPlinth(i, g) {
    const pave = new THREE.MeshStandardMaterial({ map: texture('gehweg', [8, 6]), color: '#efe6d8', roughness: 0.9 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + CONFIG.lotGap - 0.4, 0.14, D + 2.6), [mat(EDGE), mat(EDGE), pave, mat(EDGE), mat('#b7ad9f'), mat(EDGE)]);
    base.position.set(W / 2, -0.07, OZ + D / 2 + 0.5);
    base.receiveShadow = true;
    g.add(base);
    const grass = mat('#7d8f4e', { r: 1 });
    const box = mat('#bdb3a5', { r: 0.9 });
    // Beete links und rechts der Tür
    const lot = this.game.lots[i];
    const beds = lot.owned && lot.shop ? [[1.2, 3.6], [CONFIG.doorX + 1.6, W - 0.3]] : [[0.4, W - 0.4]];
    for (const [a, b] of beds) {
      if (b - a < 0.8) continue;
      const bed = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.32, 0.8), box);
      bed.position.set((a + b) / 2, 0.16, OZ + D + 0.75);
      bed.castShadow = true;
      g.add(bed);
      const top = new THREE.Mesh(new THREE.BoxGeometry(b - a - 0.12, 0.04, 0.68), grass);
      top.position.set((a + b) / 2, 0.33, OZ + D + 0.75);
      g.add(top);
      for (let k = 0; k < Math.floor((b - a) / 0.9); k++) {
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26 + (k % 2) * 0.06, 0), mat(['#55753b', '#6b7d3a', '#c8652f'][k % 3], { r: 0.9 }));
        bush.position.set(a + 0.45 + k * 0.9, 0.52, OZ + D + 0.75);
        bush.castShadow = true;
        g.add(bush);
      }
    }
    // Rasenstreifen hinter dem Laden
    const back = new THREE.Mesh(new THREE.BoxGeometry(W + CONFIG.lotGap - 1, 0.04, 0.9), grass);
    back.position.set(W / 2, 0.02, OZ - 0.85);
    g.add(back);
  }

  buildForSale(i, g) {
    const grass = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 0.04, D - 0.4), new THREE.MeshStandardMaterial({ map: texture('wiese', [4, 3]), roughness: 1 }));
    grass.position.set(W / 2, 0.02, OZ + D / 2);
    grass.receiveShadow = true;
    g.add(grass);
    const sign = new THREE.Group();
    for (const x of [-0.9, 0.9]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), mat('#5e4532'));
      post.position.set(x, 0.8, 0);
      sign.add(post);
    }
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.05), [mat(EDGE), mat(EDGE), mat(EDGE), mat(EDGE),
      new THREE.MeshStandardMaterial({ map: labelTexture(`ZU VERKAUFEN · ${LOTS[i].cost.toLocaleString('de-DE')} €`, { w: 512, h: 220, bg: '#f4ece0', fg: '#8a2e25', font: '600 40px Georgia, serif', border: '#8a2e25' }) }), mat(EDGE)]);
    board.position.set(0, 1.4, 0.05);
    sign.add(board);
    sign.position.set(W / 2, 0, OZ + D - 1.5);
    g.add(sign);
    for (const [x, z] of [[3, 3], [10, 6], [6, 2]]) {
      const heap = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat('#c8652f', { r: 1 }));
      heap.scale.set(1.3, 0.35, 1);
      heap.position.set(x, 0.02, OZ + z);
      g.add(heap);
    }
  }

  buildStore(i, g) {
    const lot = this.game.lots[i];
    const shop = this.game.shops.get(lot.shop);
    const ds = lot.design;
    const ext = ds.ext;
    const fac = FACADES.find((f) => f.id === ext.facade) || FACADES[0];
    const facadeMat = facadeMaterial(fac.id, fac.hex, fac.tex);
    const edgeMat = mat(EDGE, { r: 0.6 });
    const frameHex = (FRAMES.find((f) => f.id === ext.frames) || FRAMES[0]).hex;
    const frameMat = mat(frameHex, { r: 0.45, m: 0.3 });
    const wallH = H;
    const ceilMat = mat(paintHex(ds.ceiling), { r: 0.95 });
    const empty = !shop;

    // Boden
    const floorMat = empty ? floorMaterial('beton') : floorMaterial(ds.floor);
    const geo = new THREE.BoxGeometry(W, 0.2, D);
    const uv = geo.attributes.uv;
    for (let k = 8; k < 12; k++) uv.setXY(k, uv.getX(k) * W / 2, uv.getY(k) * D / 2);
    uv.needsUpdate = true;
    const slab = new THREE.Mesh(geo, [edgeMat, edgeMat, floorMat, edgeMat, edgeMat, edgeMat]);
    slab.position.set(W / 2, -0.09, OZ + D / 2);
    slab.receiveShadow = true;
    g.add(slab);

    // Wände: je Seite eine Gruppe (für die Schnittansicht)
    const makeWall = (side, len, openings, { int, dado, cornice, x0 = 0 }) => {
      const wg = new THREE.Group();
      const inner = new THREE.Group();
      wg.add(inner);
      const piece = (a, b, y0, y1) => {
        if (b - a < 0.01 || y1 - y0 < 0.01) return;
        const geo = new THREE.BoxGeometry(b - a, y1 - y0, WALL);
        wallUV(geo, a, y0, b - a, y1 - y0);
        const m = new THREE.Mesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, facadeMat, int]);
        m.position.set((a + b) / 2, (y0 + y1) / 2, 0);
        m.castShadow = true; m.receiveShadow = true;
        inner.add(m);
      };
      let cur = 0;
      for (const o of openings.sort((a, b) => a.x0 - b.x0)) {
        piece(cur, o.x0, 0, wallH);
        piece(o.x0, o.x1, 0, o.y0);
        piece(o.x0, o.x1, o.y1, wallH);
        const fw = 0.08;
        const frame = (x, y, w2, h2) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, WALL + 0.04), frameMat);
          m.position.set(x, y, 0);
          inner.add(m);
        };
        frame((o.x0 + o.x1) / 2, o.y1 - fw / 2, o.x1 - o.x0, fw);
        frame((o.x0 + o.x1) / 2, o.y0 + fw / 2, o.x1 - o.x0, fw);
        frame(o.x0 + fw / 2, (o.y0 + o.y1) / 2, fw, o.y1 - o.y0);
        frame(o.x1 - fw / 2, (o.y0 + o.y1) / 2, fw, o.y1 - o.y0);
        for (let k = 1; k < (o.mullions || 1); k++) frame(o.x0 + (o.x1 - o.x0) * k / o.mullions, (o.y0 + o.y1) / 2, fw * 0.7, o.y1 - o.y0);
        const gl = new THREE.Mesh(new THREE.BoxGeometry(o.x1 - o.x0 - 0.04, o.y1 - o.y0 - 0.04, 0.03), this.glassLit);
        gl.position.set((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, 0);
        inner.add(gl);
        cur = o.x1;
      }
      piece(cur, len, 0, wallH);
      if (dado) {
        const ws = new THREE.Mesh(new THREE.BoxGeometry(len - 0.02, 0.95, 0.025), dado);
        ws.position.set(len / 2, 0.475, -WALL / 2 - 0.013);
        inner.add(ws);
      }
      if (cornice) {
        const cn = new THREE.Mesh(new THREE.BoxGeometry(len - 0.02, 0.12, 0.08), cornice);
        cn.position.set(len / 2, wallH - 0.06, -WALL / 2 - 0.04);
        inner.add(cn);
      }
      g.add(wg);
      const normal = { front: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] }[side];
      const pos = { front: [0, D + WALL / 2], back: [W, -WALL / 2], left: [-WALL / 2, 0], right: [W + WALL / 2, D] }[side];
      wg.rotation.y = { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[side];
      wg.position.set(pos[0], 0, pos[1] + OZ);
      inner.position.x = x0;
      const mid = [OX + lotX(i) + W / 2 + normal[0] * W / 2, OZ + D / 2 + normal[1] * D / 2];
      this.wallGroups.push({ lot: i, side, group: wg, inner, normal, mid });
      return wg;
    };
    const wallOpts = (side) => {
      const wd = ds.walls[side];
      return {
        int: empty ? wallMaterial('beton', 'leinen') : wallMaterial(wd.pattern, wd.color),
        dado: !empty && ds.wainscot.on ? mat(paintHex(ds.wainscot.color), { r: 0.85 }) : null,
        cornice: empty ? null : ceilMat,
      };
    };
    const win = (x0, x1) => ({ x0, x1, y0: 1.0, y1: 2.7, mullions: 2 });
    makeWall('back', W, CONFIG.windows.back.map(([a, b]) => win(a, b)), wallOpts('back'));
    makeWall('left', D + WALL * 2, [], { ...wallOpts('left'), x0: -WALL });
    makeWall('right', D + WALL * 2, CONFIG.windows.right.map(([a, b]) => win(a, b)), { ...wallOpts('right'), x0: -WALL });
    this.buildStorefront(i, g, { frameMat, edgeMat, facadeMat, shop, ext, wallOpts: wallOpts('front') });

    // Flachdach mit dunkler Attika
    const roof = new THREE.Group();
    roof.position.y = wallH;
    const top = new THREE.Mesh(new THREE.BoxGeometry(W + WALL * 2, 0.22, D + WALL * 2), [edgeMat, edgeMat, mat('#5f5b56', { r: 0.95 }), ceilMat, edgeMat, edgeMat]);
    top.position.set(W / 2, 0.11, OZ + D / 2);
    top.castShadow = true;
    roof.add(top);
    for (const [x, z, w2, d2] of [[W / 2, -WALL / 2, W + WALL * 2 + 0.1, 0.24], [W / 2, D + WALL / 2, W + WALL * 2 + 0.1, 0.24], [-WALL / 2, D / 2, 0.24, D + WALL * 2], [W + WALL / 2, D / 2, 0.24, D + WALL * 2]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.42, d2), edgeMat);
      p.position.set(x, 0.42, OZ + z);
      p.castShadow = true;
      roof.add(p);
    }
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1), mat('#b9bec4', { m: 0.4, r: 0.5 }));
    ac.position.set(3 + i, 0.6, OZ + 3);
    ac.castShadow = true;
    roof.add(ac);
    g.add(roof);
    this.roofs[i] = roof;
    if (shop) this.buildOutdoor(i, g, shop);
  }

  // Schaufensterfront: Glas mit Stahlsprossen, Tür, Blende mit Leuchtschrift, Vordach
  buildStorefront(i, g, { frameMat, edgeMat, facadeMat, shop, ext, wallOpts }) {
    const wg = new THREE.Group();
    const inner = new THREE.Group();
    wg.add(inner);
    const dx = CONFIG.doorX;
    const glassTop = 2.75;
    const add = (geo, m, x, y, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; inner.add(o); return o; };
    // Eckpfeiler und Blende (Fassadenmaterial), Sockel dunkel
    const pier = (a, b) => {
      const geo = new THREE.BoxGeometry(b - a, glassTop, WALL);
      wallUV(geo, a, 0, b - a, glassTop);
      add(geo, [edgeMat, edgeMat, edgeMat, edgeMat, facadeMat, wallOpts.int], (a + b) / 2, glassTop / 2);
    };
    pier(-0.0, 0.5);
    pier(W - 0.5, W);
    const fasciaGeo = new THREE.BoxGeometry(W, H - glassTop, WALL);
    wallUV(fasciaGeo, 0, glassTop, W, H - glassTop);
    add(fasciaGeo, [edgeMat, edgeMat, edgeMat, edgeMat, facadeMat, wallOpts.int], W / 2, glassTop + (H - glassTop) / 2);
    // Glasfelder mit Sprossen (Tür bei doorX)
    const segs = [[0.5, dx - 0.1], [dx + 1.1, W - 0.5]];
    const bar = (x, y, w2, h2) => add(new THREE.BoxGeometry(w2, h2, 0.12), frameMat, x, y);
    for (const [a, b] of segs) {
      if (b - a < 0.3) continue;
      const n = Math.max(1, Math.round((b - a) / 1.15));
      bar((a + b) / 2, 0.2, b - a, 0.4);                        // Brüstung unten
      bar((a + b) / 2, glassTop - 0.04, b - a, 0.08);
      bar((a + b) / 2, 2.1, b - a, 0.06);                       // Kämpfer
      for (let k = 0; k <= n; k++) bar(a + (b - a) * k / n, (glassTop + 0.4) / 2, 0.07, glassTop - 0.4);
      const gl = add(new THREE.BoxGeometry(b - a, glassTop - 0.44, 0.03), this.glassLit, (a + b) / 2, 0.4 + (glassTop - 0.44) / 2);
      gl.castShadow = false;
    }
    // Tür mit Rahmen, leicht geöffnet
    for (const x of [dx - 0.1, dx + 1.1]) bar(x, glassTop / 2, 0.09, glassTop);
    bar(dx + 0.5, glassTop - 0.04, 1.2, 0.08);
    bar(dx + 0.5, 2.1, 1.2, 0.06);
    const door = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.05, 0.04), this.glassLit);
    leaf.position.set(0.475, 1.03, 0);
    const lf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.05, 0.05), frameMat);
    lf.scale.set(1, 1, 1);
    const frameEdges = [[0.475, 0.03, 0.95, 0.06], [0.475, 2.03, 0.95, 0.06], [0.03, 1.03, 0.06, 2.05], [0.92, 1.03, 0.06, 2.05]];
    for (const [x, y, w2, h2] of frameEdges) { const m = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, 0.06), frameMat); m.position.set(x, y, 0); door.add(m); }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.05), mat('#c9a35a', { m: 0.8, r: 0.3 }));
    handle.position.set(0.82, 1.05, 0.06);
    door.add(leaf, handle);
    door.position.set(dx - 0.05, 0, 0.05);
    door.rotation.y = -0.9;
    inner.add(door);
    g.add(wg);
    wg.position.set(0, 0, OZ + D + WALL / 2);
    this.wallGroups.push({ lot: i, side: 'front', group: wg, inner, normal: [0, 1], mid: [OX + lotX(i) + W / 2, OZ + D] });

    // Schriftzug: dunkle Tafel mit warm leuchtenden Buchstaben
    const name = shop ? shop.name : 'Demnächst';
    const signHex = paintHex(ext.sign);
    const light = new THREE.Color(signHex).getHSL({}).l > 0.6;
    const tex = labelTexture(name, { w: 1024, h: 160, bg: signHex, fg: light ? '#2b211b' : '#ffe2b0', font: `600 ${name.length > 16 ? 78 : 96}px Georgia, serif` });
    const signMat = new THREE.MeshStandardMaterial({ map: tex, emissive: light ? '#000000' : '#ffffff', emissiveMap: light ? null : tex, emissiveIntensity: 0, roughness: 0.5 });
    if (!light) this.signMats.push(signMat);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(7.5, 2.4 + name.length * 0.32), 0.62, 0.1), [edgeMat, edgeMat, edgeMat, edgeMat, signMat, edgeMat]);
    sign.position.set(W / 2 - 0.6, glassTop + (H - glassTop) / 2 + 0.05, OZ + D + WALL + 0.06);
    g.add(sign);
    this.frontDeco[i].push(sign);
    // Wandleuchten über dem Schriftzug
    for (const x of [sign.position.x - sign.geometry.parameters.width / 2 - 0.3, sign.position.x + sign.geometry.parameters.width / 2 + 0.3]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat('#fff2d0', { e: '#ffd27a', ei: 1.4, g: true }));
      lamp.position.set(x, glassTop + 0.55, OZ + D + WALL + 0.12);
      g.add(lamp);
      this.frontDeco[i].push(lamp);
    }
    // Vordach: Stahl/Holz flach oder Markise
    const aw = AWNINGS.find((a) => a.id === ext.awning) || AWNINGS[0];
    let canopy;
    if (aw.flat) {
      canopy = new THREE.Mesh(new THREE.BoxGeometry(W - 1.4, 0.14, 1.25), mat(aw.a, { r: 0.5, m: 0.3 }));
      canopy.position.set(W / 2, glassTop + 0.02, OZ + D + WALL + 0.62);
      for (const x of [1.2, W - 1.2]) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6), mat('#1b1b1d'));
        rod.position.set(x, glassTop + 0.45, OZ + D + WALL + 0.6);
        rod.rotation.x = 0.95;
        g.add(rod);
        this.frontDeco[i].push(rod);
      }
    } else {
      canopy = new THREE.Mesh(new THREE.BoxGeometry(W - 1.4, 0.05, 1.3), new THREE.MeshStandardMaterial({ map: texture('markise', [6, 1], `${aw.a}|${aw.b}`), roughness: 0.9 }));
      canopy.position.set(W / 2, glassTop + 0.05, OZ + D + WALL + 0.62);
      canopy.rotation.x = 0.28;
      const val = new THREE.Mesh(new THREE.BoxGeometry(W - 1.4, 0.18, 0.02), mat(aw.a));
      val.position.set(W / 2, glassTop - 0.2, OZ + D + WALL + 1.24);
      g.add(val);
      this.frontDeco[i].push(val);
    }
    canopy.castShadow = true;
    g.add(canopy);
    this.frontDeco[i].push(canopy);
  }

  // Kleine Außenmöblierung je Ladentyp
  buildOutdoor(i, g, shop) {
    const put = (type, x, z, rot = 0, v = 0) => {
      const m = furnitureMesh(type, v);
      m.position.set(x, 0, OZ + z);
      m.rotation.y = rot;
      g.add(m);
      return m;
    };
    const z = D + 0.8;
    if (shop.type === 'cafe') {
      // Holzbank und Bistrotisch vor dem Schaufenster
      put('bank', 2.4, z + 0.35, Math.PI, 0);
      put('kuerbisse', CONFIG.doorX - 0.6, D + 0.45);
    } else if (shop.type === 'fastfood') {
      put('tisch', 2.0, z + 0.5, 0, 2); put('stuhl', 1.3, z + 0.5, Math.PI / 2, 3);
    } else if (shop.type === 'boutique') {
      put('puppe', 2.2, z + 0.2, Math.PI, 0); put('pflanzkuebel', CONFIG.doorX - 0.6, D + 0.45, 0, 0);
    } else if (shop.type === 'supermarkt') {
      put('obststand', 2.2, z + 0.4, Math.PI, 0); put('wagenbox', CONFIG.doorX - 0.6, D + 0.5);
    }
    // Kundenstopper
    const stand = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.03), new THREE.MeshStandardMaterial({ map: texture('tafel'), roughness: 0.9 }));
    board.position.set(0, 0.45, 0.08);
    board.rotation.x = -0.18;
    const back = board.clone();
    back.rotation.x = 0.18;
    back.position.z = -0.08;
    stand.add(board, back);
    stand.position.set(CONFIG.doorX + 2.0, 0, OZ + D + 1.6);
    stand.rotation.y = 0.3;
    g.add(stand);
  }

  // ───────────── Hilfsebenen (Raster, Hover, Auswahl) ─────────────

  buildOverlays() {
    const pts = [];
    for (let x = 0; x <= W; x++) pts.push(x, 0, OZ, x, 0, D + OZ);
    for (let z = 0; z <= D; z++) pts.push(0, 0, z + OZ, W, 0, z + OZ);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false }));
    this.grid.visible = false;
    this.grid.position.y = 0.012;
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
    const l = this.view;
    const m = new THREE.MeshBasicMaterial({ color: '#6fb7ff', transparent: true, opacity: 0.22, depthWrite: false });
    for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
      if (!isReserved(l, x, z)) continue;
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), m);
      q.rotation.x = -Math.PI / 2;
      const [wx, wz] = toWorld(lotX(l) + x + 0.5, z + 0.5);
      q.position.set(wx, 0.015, wz);
      this.reservedMarks.add(q);
    }
  }

  setBuildMode(on) {
    this.buildMode = on;
    this.applyView();
  }

  setHover(cell) {
    if (!cell || this.view === 'out') { this.hover.visible = false; return; }
    const [wx, wz] = toWorld(lotX(this.view) + cell.x + 0.5, cell.z + 0.5);
    this.hover.position.set(wx, 0.02, wz);
    this.hover.visible = true;
  }

  setSelected(item) {
    if (!item) { this.selBox.visible = false; return; }
    const def = FURNITURE[item.type];
    const [w, d] = footprint(item.type, item.rot);
    const [wx, wz] = toWorld(lotX(item.lot) + item.x + w / 2, item.z + d / 2);
    const [h, y0] = def.layer === 'rug' ? [0.1, 0] : def.layer === 'ceil' ? [1.4, H - 1.6] : def.layer === 'wall' ? [1.6, 0.9] : [1.3, 0];
    this.selBox.scale.set(w + 0.06, h, d + 0.06);
    this.selBox.position.set(wx, y0 + h / 2, wz);
    this.selBox.visible = true;
  }

  setGhost(type, lot, x, z, rot, ok, v = 0) {
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
    const [wx, wz] = toWorld(lotX(lot) + x + w / 2, z + d / 2);
    this.ghost.position.set(wx, 0.01, wz);
    this.ghost.rotation.y = rot * Math.PI / 2;
  }

  // ───────────── Ansicht ─────────────

  setView(v) {
    this.view = v;
    if (v === 'out') this.focus.set(-6, 2, 0.5);
    else this.focus.set(OX + lotX(v) + W / 2, 0.8, 0.5);
    // Kurz nach dem Wechsel auf passenden Abstand zoomen (Straße weit, Laden nah)
    this.zoomTo = v === 'out' ? (this.camera.aspect < 1 ? 130 : 84) : (this.camera.aspect < 1 ? 34 : 26);
    this.zoomUntil = this.time + 1.6;
    this.applyView();
  }

  applyView() {
    const v = this.view;
    for (const r of this.roofs || []) if (r) r.visible = v === 'out';
    this.grid.visible = this.buildMode && v !== 'out';
    if (v !== 'out') this.grid.position.x = OX + lotX(v);
    this.updateReservedMarks();
    this.layoutSeen = -1;
  }

  // In der Innenansicht klappen bei allen Läden die Wände zur Kamera hin herunter
  updateCutaway(dt) {
    const cam = this.camera.position;
    const k = 1 - Math.exp(-Math.max(dt, 1 / 60) * 14);
    for (const s of this.cutSides) s.clear();
    for (const w of this.wallGroups) {
      let cut = false;
      if (this.view !== 'out') {
        const dx = cam.x - w.mid[0], dz = cam.z - w.mid[1];
        cut = dx * w.normal[0] + dz * w.normal[1] > 0.5;
      }
      if (cut) this.cutSides[w.lot].add(w.side);
      const target = cut ? 0.08 : 1;
      w.group.scale.y += (target - w.group.scale.y) * k;
      if (Math.abs(target - w.group.scale.y) < 0.01) w.group.scale.y = target;
      if (w.side === 'front') for (const d of this.frontDeco[w.lot]) d.visible = w.group.scale.y > 0.6;
    }
    // Wandobjekte an heruntergeklappten Wänden ausblenden
    for (const [id, m] of this.itemMeshes) {
      const it = this.game.items.get(id);
      if (!it || FURNITURE[it.type].layer !== 'wall') continue;
      m.visible = !this.cutSides[it.lot].has(wallSideOf(it.rot));
    }
  }

  // ───────────── Synchronisierung ─────────────

  syncItems() {
    const g = this.game;
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
      const [wx, wz] = toWorld(lotX(it.lot) + it.x + w / 2, it.z + d / 2);
      m.position.set(wx, 0, wz);
      m.rotation.y = seatYaw.has(it.id) ? seatYaw.get(it.id) : it.rot * Math.PI / 2;
    }
  }

  syncPeople(dt) {
    const g = this.game;
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
        p = { mesh: isCat ? buildCat(a.color) : buildPerson(a.look), phase: Math.random() * 6, yaw: a.yaw, last: [a.x, a.z] };
        p.mesh.userData.agentId = a.id;
        this.peopleRoot.add(p.mesh);
        store.set(a.id, p);
      }
      const [wx, wz] = toWorld(a.x, a.z);
      const moved = Math.hypot(a.x - p.last[0], a.z - p.last[1]);
      p.last = [a.x, a.z];
      const speed = dt > 0 ? moved / dt : 0;
      p.phase += moved * (isCat ? 9 : 4.2);
      let dy = a.yaw - p.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.yaw += dy * Math.min(1, dt * 10);
      p.mesh.position.set(wx, 0, wz);
      p.mesh.rotation.y = p.yaw;
      if (isCat) {
        poseCat(p.mesh, { walk: p.phase, amount: Math.min(1, speed / 0.5), sleep: a.state === 'sleep', t: this.time + a.id });
      } else {
        posePerson(p.mesh, {
          walk: p.phase, amount: Math.min(1, speed / 1.2), sit: a.state === 'sitting' ? (a.seatH || 0.47) : 0,
          carry: a.cup === 'basket' ? 'bag' : a.cup || null, umbrella: raining && a.z > D - 0.3, t: this.time + a.id,
        });
      }
    }
    // Personal
    const want = new Map();
    for (let l = 0; l < LOTS.length; l++) {
      const shop = g.shopOnLot(l);
      g.staffSpots(l).forEach((s, i) => want.set(`${l}:${i}:${shop?.apron}`, { ...s, l, apron: shop?.apron }));
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
      const [wx, wz] = toWorld(lotX(s.l) + s.x, s.z);
      p.position.set(wx, 0, wz);
      p.rotation.y = s.yaw;
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
        this.sprites.push({ s, agent: fx.agent, life: 2.2 });
      } else if (fx.kind === 'money') {
        const txt = `+${fx.amount.toFixed(2).replace('.', ',')} €${fx.tip ? ' 💛' : ''}`;
        const s = this.spriteFor(txt, fx.tip ? 'tip' : 'money');
        const [wx, wz] = toWorld(lotX(fx.lot) + fx.x + (fx.tip ? 0.5 : 0), fx.z);
        s.position.set(wx, fx.tip ? 2.5 : 2.1, wz);
        this.scene.add(s);
        this.sprites.push({ s, life: 1.6, rise: true });
      }
    }
  }

  updateSprites(dt) {
    for (const sp of [...this.sprites]) {
      sp.life -= dt;
      if (sp.agent) {
        const p = this.people.get(sp.agent) || this.cats.get(sp.agent);
        const a = this.game.agents.get(sp.agent);
        if (!p || !a) sp.life = 0;
        else sp.s.position.set(p.mesh.position.x, p.mesh.position.y + (a.kind === 'pet' ? 0.75 : 2.15), p.mesh.position.z);
      } else if (sp.rise) sp.s.position.y += dt * 0.7;
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
    const t = clamp01((c - 7.3 * 60) / (11.2 * 60));
    const elev = Math.sin(t * Math.PI);
    const fx = this.focus.x;
    this.sun.position.set(fx - 26 + t * 52, 6 + elev * 26, 18 - elev * 6);
    this.sun.target.position.set(fx, 0, 0);
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
    this.scene.fog.near = wx === 'nebel' ? 10 : wx === 'regen' ? 35 : 60;
    this.scene.fog.far = wx === 'nebel' ? 60 : wx === 'regen' ? 110 : 150;
    this.rain.visible = wx === 'regen';
    for (const m of this.groundMats) m.roughness = wx === 'regen' ? 0.35 : 0.95;
    for (const m of this.lampMats) m.emissiveIntensity = this.dark * 2.2 + gloomy * 0.3;
    if (this.glassLit) this.glassLit.emissiveIntensity = this.dark * 0.45 + gloomy * 0.08;
    for (const m of this.signMats || []) m.emissiveIntensity = 0.15 + this.dark * 1.1;
    const glow = 0.35 + Math.max(this.dark, gloomy * 0.5) * 1.1;
    const flick = 0.85 + Math.sin(this.time * 9.1) * 0.08 + Math.sin(this.time * 23.7) * 0.07;
    for (const m of glowMats) m.emissiveIntensity = m.userData.glow * (m.userData.flicker ? flick * 1.2 : glow);
    this.lotLights.forEach((l, i) => { l.intensity = this.game.lots[i].shop ? 3 + this.dark * 14 + gloomy * 4 : 0; });
  }

  // ───────────── Picking ─────────────

  ndc(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  // Bodenfeld im betrachteten Laden
  pickCell(clientX, clientY) {
    if (this.view === 'out') return null;
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return null;
    const x = Math.floor(p.x - OX - lotX(this.view)), z = Math.floor(p.z - OZ);
    return { x, z, inside: x >= 0 && z >= 0 && x < W && z < D };
  }

  // Welches Grundstück liegt unter dem Zeiger? (für die Straßenansicht)
  pickLot(clientX, clientY) {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -1), p)) return null;
    const gx = p.x - OX;
    for (let i = 0; i < LOTS.length; i++) if (gx >= lotX(i) - 1 && gx < lotX(i) + W + 1 && p.z - OZ < D + 2) return i;
    return null;
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
    const list = [...this.itemMeshes.values()].filter((m) => m.visible && (this.view === 'out' || this.game.items.get(m.userData.itemId)?.lot === this.view));
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
    this.time += realDt;
    const sig = this.signature();
    if (sig !== this.buildingSig) { this.buildingSig = sig; this.buildLots(); }
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
      const half = car.userData.L / 2;
      if (car.position.x > half) car.position.x = -half;
      if (car.position.x < -half) car.position.x = half;
    }
    // Kamera gleitet zum betrachteten Laden
    const t = this.controls.target;
    const k = Math.min(1, realDt * 4);
    const d = this.focus.clone().sub(t).multiplyScalar(k);
    t.add(d);
    this.camera.position.add(d);
    if (this.zoomUntil > this.time) {
      const off = this.camera.position.clone().sub(t);
      const len = off.length();
      off.setLength(len + (this.zoomTo - len) * k);
      this.camera.position.copy(t).add(off);
    }
    this.controls.update();
    this.updateCutaway(realDt);
    this.updateLight();
    this.renderer.render(this.scene, this.camera);
  }
}
