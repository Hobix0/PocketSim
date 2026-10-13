// Three.js-Darstellung: Straße, Gebäude mit Etagen, Einrichtung, Gäste und Effekte.
// Liest den Zustand aus Game, verändert ihn aber nie.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG, FLOORS, FURNITURE, SHOP_TYPES } from './data.js';
import { footprint, isReserved } from './sim.js';
import { mat, texture, labelTexture, furnitureMesh, ghostOf, buildPerson, posePerson } from './models.js';

const { W, D, floorHeight: H } = CONFIG;
const OX = -W / 2, OZ = -D / 2;            // Etagenkoordinate → Welt
const WALL = 0.2;
const toWorld = (x, z) => [x + OX, z + OZ];

// UVs der Vorder-/Rückseite einer Box an Weltmaße anpassen (durchgehendes Mauerwerk)
function wallUV(geo, x0, y0, w, h, scale = 2.2) {
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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#bfd6e6');
    this.scene.fog = new THREE.Fog('#bfd6e6', 55, 120);

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

    this.hemi = new THREE.HemisphereLight('#dcecff', '#8a7a66', 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3e0', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.inner = new THREE.PointLight('#ffd9a8', 0, 26, 1.6);
    this.scene.add(this.inner);

    this.view = 0;                 // aktive Etage oder 'out' für Außenansicht
    this.floorGroups = [];
    this.wallGroups = [];
    this.itemMeshes = new Map();
    this.people = new Map();
    this.staff = new Map();
    this.sprites = [];
    this.lampMats = [];
    this.layoutSeen = -1;
    this.buildingSig = '';
    this.buildMode = false;
    this.time = 0;

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.buildEnvironment();
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

  // ───────────── Umgebung ─────────────

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
    const tex = (name, rx, ry) => { const t = texture(name, [rx, ry]); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }); };
    const front = D / 2;
    plane(240, 240, mat('#9aa58a', { r: 1 }), 0, -0.14, 0);
    plane(80, 3.4, tex('gehweg', 40, 1.7), 0, 0.001, front + 1.7);           // Gehweg vor dem Haus
    plane(80, 7, tex('asphalt', 20, 2), 0, -0.12, front + 6.9);              // Straße
    plane(80, 3, tex('gehweg', 40, 1.5), 0, 0.001, front + 11.9);            // Gehweg gegenüber
    plane(80, 9, tex('gehweg', 30, 3), 0, 0.0, -D / 2 - 4.5);               // Hinterhof
    // Bordsteine
    for (const z of [front + 3.4, front + 10.4]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(80, 0.14, 0.18), mat('#cfc8bd'));
      c.position.set(0, -0.06, z);
      c.receiveShadow = true;
      w.add(c);
    }
    // Fahrbahnmarkierung
    for (let x = -38; x < 40; x += 4) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.14), mat('#e8e4d8'));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, -0.115, front + 6.9);
      w.add(m);
    }
    // Nachbarhäuser
    const facade = (floors, color, x0, x1, z0, z1) => {
      const h = floors * H + 0.6;
      const t = labelTexture('', { w: 64, h: 64, bg: color });
      const winTex = (() => {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 128;
        const g = c.getContext('2d');
        g.fillStyle = color; g.fillRect(0, 0, 128, 128);
        g.fillStyle = '#e9e3d6'; g.fillRect(28, 26, 72, 86);
        g.fillStyle = '#4b5a66'; g.fillRect(34, 32, 60, 74);
        g.fillStyle = '#6f8394'; g.fillRect(34, 32, 60, 30);
        g.fillStyle = '#e9e3d6'; g.fillRect(62, 32, 4, 74);
        const tx = new THREE.CanvasTexture(c);
        tx.colorSpace = THREE.SRGBColorSpace;
        tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
        tx.repeat.set(Math.round((x1 - x0) / 2.6), floors);
        return tx;
      })();
      t.dispose();
      const sideMat = mat(color, { r: 0.9 });
      const frontMat = new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.85 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), [sideMat, sideMat, mat('#6e6a66'), sideMat, frontMat, sideMat]);
      b.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
      b.castShadow = true; b.receiveShadow = true;
      w.add(b);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.3, 0.3, z1 - z0 + 0.3), mat('#d8d2c6'));
      cap.position.set((x0 + x1) / 2, h, (z0 + z1) / 2);
      w.add(cap);
    };
    facade(4, '#c9b48f', -W / 2 - 0.35 - 11, -W / 2 - 0.35, -D / 2 - 0.2, D / 2 + 0.2);
    facade(3, '#9fb3b0', W / 2 + 0.35, W / 2 + 0.35 + 12, -D / 2 - 0.2, D / 2 + 0.2);
    facade(5, '#b98f7a', -W / 2 - 0.35 - 22, -W / 2 - 0.35 - 11.2, -D / 2 - 0.2, D / 2 + 0.2);
    facade(4, '#8fa3b9', W / 2 + 0.35 + 12.2, W / 2 + 0.35 + 24, -D / 2 - 0.2, D / 2 + 0.2);
    // Park gegenüber (hält die Sicht der Kamera frei)
    plane(80, 16, mat('#7fa36a', { r: 1 }), 0, -0.13, front + 21.4);
    for (const [x, z, sx, sz] of [[-8, front + 17, 10, 2.2], [9, front + 18.5, 7, 2.2]]) {
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.8, sz * 0.4), mat('#4f7d43', { r: 0.95 }));
      hedge.position.set(x, 0.3, z);
      hedge.castShadow = true;
      w.add(hedge);
    }
    // Bäume, Laternen, Bänke
    const tree = (x, z, s = 1) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 2.2, 8), mat('#6b4f36'));
      trunk.position.y = 1.1; trunk.castShadow = true;
      g.add(trunk);
      for (const [dx, dy, dz, r] of [[0, 2.8, 0, 1.1], [0.5, 2.4, 0.2, 0.75], [-0.45, 2.5, -0.2, 0.8], [0.1, 3.4, -0.1, 0.7]]) {
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(r > 0.9 ? '#5a8a46' : '#4a7a3c', { r: 0.9 }));
        c.position.set(dx, dy, dz); c.castShadow = true;
        g.add(c);
      }
      const grate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 1.1), mat('#5b4a3a'));
      grate.position.y = 0.01;
      g.add(grate);
      g.position.set(x, 0, z);
      g.scale.setScalar(s);
      w.add(g);
    };
    tree(-11, front + 2.8); tree(-18, front + 2.8, 0.9); tree(10.5, front + 2.8, 1.05); tree(17, front + 2.8);
    tree(-14, front + 11.8, 0.9); tree(4, front + 11.8); tree(20, front + 11.8, 0.95);
    tree(-18, front + 18, 1.3); tree(-1, front + 20, 1.2); tree(15, front + 17.5, 1.25); tree(26, front + 21, 1.1);
    tree(-4, -D / 2 - 5, 1.2); tree(5, -D / 2 - 6.5, 1.1);
    this.streetLamps = [];
    for (const x of [-14.5, -8.5, 13.5, 21]) {
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
    const bench = (x, z) => {
      const g = new THREE.Group();
      const wood = mat('#8a5a36');
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.45), wood); seat.position.y = 0.45;
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.05), wood); back.position.set(0, 0.7, -0.2);
      for (const m of [seat, back]) { m.castShadow = true; g.add(m); }
      for (const lx of [-0.7, 0.7]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), mat('#2c3035')); l.position.set(lx, 0.22, 0); g.add(l); }
      g.position.set(x, 0, z);
      g.rotation.y = Math.PI;
      w.add(g);
    };
    bench(-13, front + 3.0); bench(15.5, front + 3.0);
    // Autos
    this.cars = [];
    const carColors = ['#c0392b', '#2f6b9a', '#e5e1d8', '#3b3f45', '#d9a441'];
    for (let i = 0; i < 4; i++) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.7, 1.7), mat(carColors[i % carColors.length], { r: 0.35, m: 0.3 }));
      body.position.y = 0.55; body.castShadow = true;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 1.5), mat('#2b3640', { r: 0.2, m: 0.4 }));
      cabin.position.set(-0.2, 1.15, 0); cabin.castShadow = true;
      car.add(body, cabin);
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

  // ───────────── Gebäude ─────────────

  signature() {
    const g = this.game;
    return g.floors.map((f) => {
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
    const brick = new THREE.MeshStandardMaterial({ map: texture('ziegel'), roughness: 0.9 });
    const brickEdge = mat('#b8705a', { r: 0.9 });
    const frameMat = mat('#2f4a42', { r: 0.5, m: 0.2 });
    const glass = new THREE.MeshStandardMaterial({ color: '#a9c8d6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false });
    const glassDark = new THREE.MeshStandardMaterial({ color: '#56707f', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 });

    for (let f = 0; f < FLOORS.length; f++) {
      const fl = g.floors[f];
      const shop = g.shops.get(fl.shop);
      const group = new THREE.Group();
      group.position.y = f * H;
      root.add(group);
      this.floorGroups[f] = group;
      const active = fl.unlocked && shop;
      const interior = mat(active ? '#efe3cf' : '#c9c4bc', { r: 0.95 });
      const wainscot = mat(active ? '#7c9a8a' : '#b2ada5', { r: 0.9 });

      // Boden (mit Treppenloch ab dem 1. OG)
      const floorMat = new THREE.MeshStandardMaterial({
        map: texture(active ? (shop.type === 'cafe' ? 'parkett' : 'fliesen') : 'beton', [W / 4, D / 4]), roughness: 0.85,
      });
      const slabParts = f === 0 ? [[0, 0, W, D]] : [[2, 0, W, D], [0, 3, 2, D], [0, 0, 1, 3]];
      for (const [x0, z0, x1, z1] of slabParts) {
        const geo = new THREE.BoxGeometry(x1 - x0, 0.22, z1 - z0);
        // Bodentextur an Rasterposition ausrichten
        const uv = geo.attributes.uv;
        for (let k = 8; k < 12; k++) uv.setXY(k, (x0 + uv.getX(k) * (x1 - x0)) / 4, (D - z1 + uv.getY(k) * (z1 - z0)) / 4);
        uv.needsUpdate = true;
        floorMat.map.repeat.set(1, 1);
        const slab = new THREE.Mesh(geo, [brickEdge, brickEdge, floorMat, mat('#d8d2c8'), brickEdge, brickEdge]);
        slab.position.set(OX + (x0 + x1) / 2, -0.11, OZ + (z0 + z1) / 2);
        slab.receiveShadow = true;
        group.add(slab);
      }

      // Wände: jede Seite als eigene Gruppe (für die Schnittansicht)
      const wallH = H - 0.22;
      const makeWall = (side, len, openings) => {
        const wg = new THREE.Group();
        const inner = new THREE.Group();
        wg.add(inner);
        const piece = (x0, x1, y0, y1, ext, int) => {
          if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return;
          const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, WALL);
          wallUV(geo, x0, y0 + f * H, x1 - x0, y1 - y0);
          const m = new THREE.Mesh(geo, [brickEdge, brickEdge, brickEdge, brickEdge, ext, int]);
          m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
          m.castShadow = true; m.receiveShadow = true;
          inner.add(m);
        };
        let cur = 0;
        const ops = openings.sort((a, b) => a.x0 - b.x0);
        for (const o of ops) {
          piece(cur, o.x0, 0, wallH, brick, interior);
          piece(o.x0, o.x1, 0, o.y0, brick, interior);
          piece(o.x0, o.x1, o.y1, wallH, brick, interior);
          // Rahmen + Glas
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
            const gl = new THREE.Mesh(new THREE.BoxGeometry(o.x1 - o.x0 - 0.04, o.y1 - o.y0 - 0.04, 0.03), o.dark ? glassDark : glass);
            gl.position.set((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, 0);
            inner.add(gl);
            if (o.sill) {
              const s = new THREE.Mesh(new THREE.BoxGeometry(o.x1 - o.x0 + 0.1, 0.06, WALL + 0.16), mat('#e2dccf'));
              s.position.set((o.x0 + o.x1) / 2, o.y0 - 0.03, 0.04);
              inner.add(s);
            }
          }
          cur = o.x1;
        }
        piece(cur, len, 0, wallH, brick, interior);
        // Sockelleiste innen
        const ws = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.02), wainscot);
        ws.position.set(len / 2, 0.45, -WALL / 2 - 0.011);
        inner.add(ws);
        group.add(wg);
        const normal = { front: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] }[side];
        const pos = { front: [0, D + WALL / 2], back: [W, -WALL / 2], left: [-WALL / 2, 0], right: [W + WALL / 2, D] }[side];
        const rot = { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[side];
        wg.position.set(pos[0] + OX, 0, pos[1] + OZ);
        wg.rotation.y = rot;
        // Wände links/rechts überlappen die Ecken
        if (side === 'left' || side === 'right') { inner.position.x = -WALL; inner.scale.x = 1; }
        this.wallGroups.push({ f, side, group: wg, normal, mid: [OX + W / 2 + normal[0] * W / 2, OZ + D / 2 + normal[1] * D / 2] });
        return wg;
      };
      const win = (x0, x1, extra = {}) => ({ x0, x1, y0: 0.95, y1: 2.55, sill: true, mullions: 2, dark: !active, ...extra });
      if (f === 0) {
        const dx = CONFIG.doorX;
        makeWall('front', W, [
          { x0: 0.6, x1: dx - 0.4, y0: 0.35, y1: 2.6, mullions: 4 },
          { x0: dx - 0.05, x1: dx + 1.05, y0: 0, y1: 2.6, door: true },
          { x0: dx + 1.5, x1: W - 0.6, y0: 0.35, y1: 2.6, mullions: 2 },
        ]);
      } else {
        makeWall('front', W, [win(1, 3.4), win(4.4, 6.8), win(7.8, 10.2), win(11.2, 13.4)]);
      }
      makeWall('back', W, [win(4.5, 6.5, { mullions: 1 }), win(9, 11, { mullions: 1 })]);
      makeWall('left', D + WALL * 2, [win(5.4, 7.6, { mullions: 1 })]);
      makeWall('right', D + WALL * 2, [win(3.6, 5.8, { mullions: 1 }), win(7, 9.2, { mullions: 1 })]);

      // Treppe
      if (f < FLOORS.length - 1) group.add(this.buildStairs());
      if (f > 0) group.add(this.buildRailing(f === FLOORS.length - 1));

      // Außen: Markise + Schild im EG, Banner/Plakat oben
      if (f === 0) {
        const aw = new THREE.Mesh(new THREE.BoxGeometry(W - 1.2, 0.05, 1.3), new THREE.MeshStandardMaterial({ map: texture('markise', [6, 1]), roughness: 0.9 }));
        aw.position.set(OX + W / 2, 2.85, OZ + D + 0.8);
        aw.rotation.x = 0.28;
        aw.castShadow = true;
        group.add(aw);
        this.frontDeco[f].push(aw);
        const name = shop ? shop.name : 'Zu vermieten';
        const sign = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.62, 0.08), [frameMat, frameMat, frameMat, frameMat,
          new THREE.MeshStandardMaterial({ map: labelTexture(name.toUpperCase(), { w: 1024, h: 128, bg: '#2f4a42', fg: '#f4e6c8', font: '600 76px Georgia, serif', border: '#c8a25a' }), roughness: 0.6 }), frameMat]);
        sign.position.set(OX + W / 2 - 1.4, 3.15, OZ + D + WALL + 0.06);
        group.add(sign);
        this.frontDeco[f].push(sign);
      } else {
        const label = shop ? shop.name : 'ZU VERMIETEN';
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshStandardMaterial({
          map: labelTexture(label, { w: 512, h: 100, bg: shop ? '#2f4a42' : '#f4e6c8', fg: shop ? '#f4e6c8' : '#b23b2e', font: `600 ${shop ? 48 : 56}px Georgia, serif` }), roughness: 0.7,
        }));
        banner.position.set(OX + 5.6, 2.85, OZ + D + WALL + 0.02);
        group.add(banner);
        this.frontDeco[f].push(banner);
      }
    }
    // Dach
    const roof = new THREE.Group();
    roof.position.y = FLOORS.length * H;
    const top = new THREE.Mesh(new THREE.BoxGeometry(W + WALL * 2, 0.24, D + WALL * 2), mat('#6f6a64', { r: 0.95 }));
    top.position.set(OX + W / 2, -0.1, OZ + D / 2);
    top.castShadow = true; top.receiveShadow = true;
    roof.add(top);
    for (const [x, z, w, d] of [[W / 2, -0.05, W + 0.6, 0.3], [W / 2, D + 0.05, W + 0.6, 0.3], [-0.05, D / 2, 0.3, D + 0.4], [W + 0.05, D / 2, 0.3, D + 0.4]]) {
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
    root.add(roof);
    this.roof = roof;
    this.applyView();
  }

  buildStairs() {
    const g = new THREE.Group();
    const step = mat('#8a8580', { r: 0.8 });
    const tread = mat('#b07a47', { r: 0.7 });
    const n = 10, run = 2.0, rise = H / 2;
    for (let i = 0; i < n; i++) {
      const h = rise * (i + 1) / n;
      // Lauf A: x 0..1, steigt von z = 2.95 nach z = 0.95
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.96, h, run / n), [step, step, tread, step, step, step]);
      a.position.set(OX + 0.5, h / 2, OZ + 2.95 - (i + 0.5) * run / n);
      // Lauf B: x 1..2, steigt von z = 0.95 nach z = 2.95
      const hb = rise + rise * (i + 1) / n;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.96, rise * 2 / n + 0.02, run / n), [step, step, tread, step, step, step]);
      b.position.set(OX + 1.5, hb - rise / n, OZ + 0.95 + (i + 0.5) * run / n);
      for (const m of [a, b]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    }
    const landing = new THREE.Mesh(new THREE.BoxGeometry(2, 0.18, 0.95), [step, step, tread, step, step, step]);
    landing.position.set(OX + 1, rise - 0.09, OZ + 0.475);
    landing.castShadow = true;
    g.add(landing);
    // Wange zwischen den Läufen und Handlauf
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.06, H, 2.0), mat('#e9e1d3'));
    wall.position.set(OX + 1, H / 2, OZ + 1.95);
    g.add(wall);
    return g;
  }

  buildRailing(top) {
    const g = new THREE.Group();
    const m = mat('#2c3035', { m: 0.6, r: 0.4 });
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), m);
      r.position.set(OX + (x0 + x1) / 2, 1.0, OZ + (z0 + z1) / 2);
      r.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      g.add(r);
      const posts = Math.max(2, Math.round(len / 0.5));
      for (let i = 0; i <= posts; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.0, 0.03), m);
        p.position.set(OX + x0 + (x1 - x0) * i / posts, 0.5, OZ + z0 + (z1 - z0) * i / posts);
        g.add(p);
      }
    };
    rail(2, 0, 2, 3);
    rail(1, 0.95, 1, 3);
    if (top) { rail(0, 3, 1, 3); rail(1, 3, 1.05, 3); }
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
    const [w, d] = footprint(item.type, item.rot);
    const [wx, wz] = toWorld(item.x + w / 2, item.z + d / 2);
    const h = FURNITURE[item.type].floorLayer ? 0.1 : 1.3;
    this.selBox.scale.set(w + 0.06, h, d + 0.06);
    this.selBox.position.set(wx, item.floor * H + h / 2, wz);
    this.selBox.visible = true;
  }

  setGhost(type, f, x, z, rot, ok) {
    if (!type) {
      if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; this.ghostKey = ''; }
      return;
    }
    const key = `${type}|${ok}`;
    if (this.ghostKey !== key) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = ghostOf(furnitureMesh(type), ok);
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
    const k = 1 - Math.exp(-Math.max(dt, 1 / 60) * 14);
    const cam = this.camera.position;
    for (const w of this.wallGroups) {
      let cut = false;
      if (this.view !== 'out' && w.f === this.view) {
        const dx = cam.x - w.mid[0], dz = cam.z - w.mid[1];
        cut = dx * w.normal[0] + dz * w.normal[1] > 0.5;
      }
      const target = cut ? 0.1 : 1;
      w.group.scale.y += (target - w.group.scale.y) * k;
      if (Math.abs(target - w.group.scale.y) < 0.01) w.group.scale.y = target;
      if (w.side === 'front') for (const d of this.frontDeco[w.f]) d.visible = w.group.scale.y > 0.6;
    }
  }

  // ───────────── Synchronisierung ─────────────

  syncItems() {
    const g = this.game;
    const top = this.view === 'out' ? FLOORS.length - 1 : this.view;
    for (const [id, m] of [...this.itemMeshes]) {
      if (!g.items.has(id)) { this.itemRoot.remove(m); this.itemMeshes.delete(id); }
    }
    const seatYaw = new Map();
    for (const d of g.derived) for (const s of d.seats) if (FURNITURE[g.items.get(s.item)?.type]?.seat === 'chair') seatYaw.set(s.item, s.yaw);
    for (const it of g.items.values()) {
      let m = this.itemMeshes.get(it.id);
      if (!m) {
        m = furnitureMesh(it.type);
        m.userData.itemId = it.id;
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
    for (const [id, p] of [...this.people]) {
      if (!g.agents.has(id)) { this.peopleRoot.remove(p.mesh); this.people.delete(id); }
    }
    for (const a of g.agents.values()) {
      let p = this.people.get(a.id);
      if (!p) {
        p = { mesh: buildPerson(a.look), phase: Math.random() * 6, yaw: a.yaw, last: [a.x, a.y, a.z] };
        p.mesh.userData.agentId = a.id;
        this.peopleRoot.add(p.mesh);
        this.people.set(a.id, p);
      }
      const [wx, wz] = toWorld(a.x, a.z);
      const moved = Math.hypot(a.x - p.last[0], a.z - p.last[2], (a.y - p.last[1]) * 0.6);
      p.last = [a.x, a.y, a.z];
      const speed = dt > 0 ? moved / dt : 0;
      p.phase += moved * 4.2;
      let dy = a.yaw - p.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.yaw += dy * Math.min(1, dt * 10);
      p.mesh.position.set(wx, a.y + (a.state === 'sitting' ? 0 : 0), wz);
      p.mesh.rotation.y = p.yaw;
      p.mesh.visible = a.z >= D || a.floor <= top;
      posePerson(p.mesh, { walk: p.phase, amount: Math.min(1, speed / 1.2), sit: a.state === 'sitting', carry: a.cup || null, t: this.time + a.id });
    }
    // Baristas
    const want = new Map();
    for (let f = 0; f < FLOORS.length; f++) {
      g.staffSpots(f).forEach((s, i) => want.set(`${f}:${i}`, { ...s, f }));
    }
    for (const [k, p] of [...this.staff]) if (!want.has(k)) { this.peopleRoot.remove(p); this.staff.delete(k); }
    let i = 0;
    for (const [k, s] of want) {
      let p = this.staff.get(k);
      if (!p) {
        const look = { skin: ['#f1c9a5', '#c68863', '#8d5a3b', '#e0ac87'][i % 4], pants: '#2b2f3a', hair: ['#3b2a1d', '#1f1712', '#b98a4b', '#6d4a2c'][i % 4], hairStyle: i % 3, height: 0.96 + (i % 3) * 0.04, apron: '#2f5d50' };
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
    c.width = emoji ? 96 : 256; c.height = emoji ? 96 : 80;
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
      g.lineWidth = 8; g.strokeStyle = 'rgba(20,40,30,0.85)';
      g.strokeText(text, 128, 42);
      g.fillStyle = '#9ff0b4';
      g.fillText(text, 128, 42);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    s.renderOrder = 10;
    s.scale.set(emoji ? 0.55 : 1.4, emoji ? 0.55 : 0.44, 1);
    return s;
  }

  consumeFx(list) {
    for (const fx of list) {
      if (fx.kind === 'bubble') {
        const s = this.spriteFor(fx.icon, 'bubble');
        this.scene.add(s);
        this.sprites.push({ s, agent: fx.agent, life: 2.2, max: 2.2 });
      } else if (fx.kind === 'money') {
        const txt = `+${fx.amount.toFixed(2).replace('.', ',')} €`;
        const s = this.spriteFor(txt, 'money');
        const [wx, wz] = toWorld(fx.x, fx.z);
        s.position.set(wx, fx.floor * H + 2.1, wz);
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
        const p = this.people.get(sp.agent);
        const a = this.game.agents.get(sp.agent);
        if (!p || !a) sp.life = 0;
        else {
          sp.s.position.set(p.mesh.position.x, p.mesh.position.y + 2.15, p.mesh.position.z);
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

  // ───────────── Licht nach Uhrzeit ─────────────

  updateLight() {
    const c = this.game.clock;
    const t = clamp01((c - 6 * 60) / (14 * 60));        // 6:00 → 20:00
    const elev = Math.sin(t * Math.PI);
    const az = -1 + t * 2;
    this.sun.position.set(az * 30, 8 + elev * 30, 18 - elev * 4);
    this.sun.target.position.set(0, 0, 0);
    const evening = clamp01((c - 17.5 * 60) / (2.5 * 60));
    const morning = clamp01(1 - (c - 7 * 60) / 60);
    const warm = Math.max(evening, morning * 0.6);
    this.sun.intensity = 2.5 * (0.35 + 0.65 * elev) * (1 - evening * 0.55);
    this.sun.color.setHSL(0.09, 0.4 + warm * 0.5, 0.82 - warm * 0.2);
    this.hemi.intensity = 0.75 + elev * 0.45 - evening * 0.25;
    const sky = new THREE.Color('#bcd5e8').lerp(new THREE.Color('#f0b483'), warm * 0.75);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    for (const m of this.lampMats) m.emissiveIntensity = evening * 2;
    const f = this.view === 'out' ? 0 : this.view;
    this.inner.position.set(0, f * H + 2.6, 0.5);
    this.inner.intensity = 6 + evening * 18;
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
    const list = [...this.people.values()].filter((p) => p.mesh.visible).map((p) => p.mesh);
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

  thumbnail(type, canvas) {
    if (!this.thumbs) this.thumbs = new Map();
    let img = this.thumbs.get(type);
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
      const obj = furnitureMesh(type);
      this.thumbScene.add(obj);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const r = Math.max(size.x, size.y * 1.3, size.z) * 0.62 + 0.25;
      const dist = r / Math.sin(THREE.MathUtils.degToRad(15));
      this.thumbCam.position.copy(mid).add(new THREE.Vector3(0.55, 0.55, 1).normalize().multiplyScalar(dist * 0.62));
      this.thumbCam.lookAt(mid);
      this.thumbRenderer.render(this.thumbScene, this.thumbCam);
      img = document.createElement('canvas');
      img.width = 184; img.height = 112;
      img.getContext('2d').drawImage(this.thumbRenderer.domElement, 0, 0);
      this.thumbScene.remove(obj);
      this.thumbs.set(type, img);
    }
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  // ───────────── Frame ─────────────

  frame(dt, fx = [], realDt = dt) {
    this.realDt = realDt;
    this.time += dt;
    const sig = this.signature();
    if (sig !== this.buildingSig) { this.buildingSig = sig; this.buildBuilding(); }
    if (this.layoutSeen !== this.game.layoutVersion) {
      this.layoutSeen = this.game.layoutVersion;
      this.syncItems();
      this.updateReservedMarks();
    }
    this.consumeFx(fx);
    this.syncPeople(dt);
    this.updateSprites(dt);
    for (const car of this.cars) {
      car.position.x += car.userData.dir * car.userData.speed * dt;
      if (car.position.x > 45) car.position.x = -45;
      if (car.position.x < -45) car.position.x = 45;
    }
    const t = this.controls.target;
    const dy = (this.targetY - t.y) * Math.min(1, dt * 6);
    t.y += dy;
    this.camera.position.y += dy;
    t.x = Math.max(-W, Math.min(W, t.x));
    t.z = Math.max(-D, Math.min(D + 6, t.z));
    this.controls.update();
    this.updateCutaway(this.realDt);
    this.updateLight();
    this.renderer.render(this.scene, this.camera);
  }
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
