// Three.js-Szene: Terrain, Gebäude, Bänder, Waren, Partikel, Tag/Nacht.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BUILDINGS, ITEMS, ITEM_IDS, DEPOSITS, CONFIG } from './data.js';
import { DX, DZ, rng } from './sim.js';
import { buildModel, beltGeometries, beltTexture, beltPathPoint, itemGeometry, itemMaterial, MAT, mat } from './models.js';

const ROT = [[1, 0], [0, -1], [-1, 0], [0, 1]]; // [cos, sin] für Drehung um −dir·90°
function rotLocal(d, lx, lz, out) {
  const [c, s] = ROT[d];
  out.x = lx * c + lz * s;
  out.z = -lx * s + lz * c;
  return out;
}

const SKY = {
  day:   { top: new THREE.Color(0x7d97ad), bottom: new THREE.Color(0xd8d6d0), fog: new THREE.Color(0xc9c8c2) },
  dusk:  { top: new THREE.Color(0x2f2c33), bottom: new THREE.Color(0xd98a5a), fog: new THREE.Color(0xa88672) },
  night: { top: new THREE.Color(0x060606), bottom: new THREE.Color(0x161514), fog: new THREE.Color(0x121212) },
};

export class Renderer {
  constructor(canvas, game) {
    this.game = game;
    this.canvas = canvas;
    this.quality = { shadows: true, bloom: !matchMedia('(pointer: coarse)').matches };
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;

    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xbcd8ec, 60, 150);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);

    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x5a6b4a, 0.9);
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);

    this.makeSky();

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.worldGroup = new THREE.Group();
    scene.add(this.worldGroup);
    this.buildingMeshes = new Map();
    this.beltGeo = beltGeometries();
    this.beltTex = beltTexture();
    this.beltSurfaceMat = new THREE.MeshStandardMaterial({ map: this.beltTex, roughness: 0.9, side: THREE.DoubleSide });
    this.beltFrameMat = mat(0x7d8794, { metalness: 0.4, roughness: 0.5 });
    this.beltMeshes = [];
    this.itemMeshes = {};
    for (const id of ITEM_IDS) {
      const m = new THREE.InstancedMesh(itemGeometry(ITEMS[id].shape), itemMaterial(id), 512);
      m.castShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.itemMeshes[id] = m;
      scene.add(m);
    }
    this.initParticles();
    this.initOverlays();
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpV = new THREE.Vector3();
    this.tmpS = new THREE.Vector3(1, 1, 1);
    this.tmpE = new THREE.Euler();
    this.time = 0;

    game.on('world', () => this.syncWorld());
    game.on('entityChanged', e => this.refreshBuilding(e));
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  setQuality(q) {
    Object.assign(this.quality, q);
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.sun.castShadow = this.quality.shadows;
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  makeSky() {
    const geo = new THREE.SphereGeometry(300, 24, 12);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, stars: { value: 0 } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float stars; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
        void main(){ float t = clamp(vP.y*1.4+0.25,0.,1.); vec3 c = mix(bottom, top, t);
          vec3 q = floor(vP*220.); float s = step(0.9975, h(q)) * stars * smoothstep(0.05,0.4,vP.y);
          gl_FragColor = vec4(c + s, 1.); }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.scene.add(this.sky);
  }

  // ───────────────────────── Terrain
  buildTerrain() {
    const g = this.game, { W, H } = g;
    if (this.terrain) { this.worldGroup.remove(this.terrain, this.water, this.decoMeshes); }
    const pos = [], col = [];
    const c = new THREE.Color();
    const grassA = new THREE.Color(0x8ba26a), grassB = new THREE.Color(0x839b62), sandC = new THREE.Color(0xd2c49a);
    const dirt = new THREE.Color(0x7a5a3c), dirtDark = new THREE.Color(0x5a412b), bed = new THREE.Color(0x4c7a8a);
    const r = rng(g.seed + 5);
    const hAt = (x, z) => (!g.inBounds(x, z) ? -2 : g.terrain[g.idx(x, z)] === 1 ? -0.45 : 0);
    const quad = (a, b, cc, d, color) => {
      pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
      for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b);
    };
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const i = g.idx(x, z), h = hAt(x, z);
      const dep = g.deposit[i];
      if (h < 0) c.copy(bed);
      else {
        c.copy((x + z) % 2 ? grassA : grassB);
        const nearWater = [0, 1, 2, 3].some(d => hAt(x + DX[d], z + DZ[d]) < 0 && g.inBounds(x + DX[d], z + DZ[d]));
        if (nearWater) c.lerp(sandC, 0.6);
        if (dep >= 2) c.lerp(new THREE.Color(DEPOSITS[dep].color), dep === 5 ? 0.75 : 0.45);
        if (dep === 1) c.multiplyScalar(0.82);
        c.offsetHSL(0, 0, (r() - 0.5) * 0.03);
      }
      quad([x, h, z], [x, h, z + 1], [x + 1, h, z + 1], [x + 1, h, z], c);
      // Seitenwände
      for (let d = 0; d < 4; d++) {
        const nh = hAt(x + DX[d], z + DZ[d]);
        if (nh >= h) continue;
        const wallC = g.inBounds(x + DX[d], z + DZ[d]) ? dirt : dirtDark;
        if (d === 0) quad([x + 1, h, z], [x + 1, nh, z], [x, nh, z], [x, h, z], wallC);
        if (d === 1) quad([x + 1, h, z + 1], [x + 1, nh, z + 1], [x + 1, nh, z], [x + 1, h, z], wallC);
        if (d === 2) quad([x, h, z + 1], [x, nh, z + 1], [x + 1, nh, z + 1], [x + 1, h, z + 1], wallC);
        if (d === 3) quad([x, h, z], [x, nh, z], [x, nh, z + 1], [x, h, z + 1], wallC);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    this.terrain.receiveShadow = true;
    this.worldGroup.add(this.terrain);

    // Wasser
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x3f9fd0, transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.1 });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), this.waterMat);
    this.water.position.set(W / 2, -0.12, H / 2);
    this.water.receiveShadow = true;
    this.worldGroup.add(this.water);
    this.buildDeco();

    // Raster (nur im Baumodus sichtbar)
    if (this.gridLines) this.scene.remove(this.gridLines);
    const pts = [];
    for (let i = 0; i <= W; i++) pts.push(i, 0.012, 0, i, 0.012, H);
    for (let i = 0; i <= H; i++) pts.push(0, 0.012, i, W, 0.012, i);
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.gridLines = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.13 }));
    this.gridLines.visible = false;
    this.scene.add(this.gridLines);
  }

  // Bäume und Erzbrocken (instanziert); unter Gebäuden ausgeblendet
  buildDeco() {
    const g = this.game, { W, H } = g;
    if (this.decoMeshes) { this.worldGroup.remove(this.decoMeshes); this.decoMeshes.traverse(o => o.dispose?.()); }
    const group = this.decoMeshes = new THREE.Group();
    const r = rng(g.seed + 77);
    const trees = [], rocks = {};
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const i = g.idx(x, z), dep = g.deposit[i];
      if (g.grid[i] >= 0) { r(); r(); r(); continue; }
      if (dep === 1) {
        const n = 1 + Math.floor(r() * 2);
        for (let k = 0; k < n; k++) trees.push([x + 0.2 + r() * 0.6, z + 0.2 + r() * 0.6, 0.7 + r() * 0.6, r()]);
      } else if (dep >= 2 && dep <= 4) {
        (rocks[dep] ||= []);
        const n = 2 + Math.floor(r() * 2);
        for (let k = 0; k < n; k++) rocks[dep].push([x + 0.15 + r() * 0.7, z + 0.15 + r() * 0.7, 0.5 + r() * 0.7, r() * 6]);
      } else { r(); r(); r(); }
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const trunkGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.4, 5).translate(0, 0.2, 0);
    const crownGeo = new THREE.ConeGeometry(0.34, 0.9, 6).translate(0, 0.75, 0);
    const crown2Geo = new THREE.ConeGeometry(0.26, 0.6, 6).translate(0, 1.15, 0);
    const trunk = new THREE.InstancedMesh(trunkGeo, mat(0x6b4526), trees.length);
    const crown = new THREE.InstancedMesh(crownGeo, mat(0x3f7d3a), trees.length);
    const crown2 = new THREE.InstancedMesh(crown2Geo, mat(0x4f9145), trees.length);
    const tint = new THREE.Color();
    trees.forEach(([x, z, sc, v], i) => {
      m.compose(p.set(x, 0, z), q.setFromEuler(e.set(0, v * 6, 0)), s.setScalar(sc));
      trunk.setMatrixAt(i, m); crown.setMatrixAt(i, m); crown2.setMatrixAt(i, m);
      tint.setHSL(0.27 + v * 0.06, 0.45, 0.32 + v * 0.08);
      crown.setColorAt(i, tint);
      crown2.setColorAt(i, tint.offsetHSL(0, 0, 0.06));
    });
    for (const im of [trunk, crown, crown2]) { im.castShadow = true; im.receiveShadow = true; group.add(im); }
    const rockGeo = new THREE.DodecahedronGeometry(0.16, 0);
    for (const dep in rocks) {
      const list = rocks[dep];
      const im = new THREE.InstancedMesh(rockGeo, mat(DEPOSITS[dep].color, { roughness: 0.6, metalness: dep === '4' ? 0.1 : 0.3 }), list.length);
      list.forEach(([x, z, sc, rot], i) => {
        m.compose(p.set(x, 0.04, z), q.setFromEuler(e.set(rot, rot * 2, 0)), s.set(sc, sc * 0.7, sc));
        im.setMatrixAt(i, m);
      });
      im.castShadow = true;
      group.add(im);
    }
    this.worldGroup.add(group);
  }

  // ───────────────────────── Gebäude & Bänder
  syncWorld() {
    const g = this.game;
    if (this._terrainSeed !== g.seed || !this.terrain) { this._terrainSeed = g.seed; this.buildTerrain(); }
    else this.buildDeco();
    // Gebäude
    const alive = new Set();
    for (const e of g.entities.values()) {
      if (e.type === 'band') continue;
      alive.add(e.id);
      let obj = this.buildingMeshes.get(e.id);
      if (!obj || obj.userData.rot !== e.rot) {
        if (obj) this.worldGroup.remove(obj);
        obj = buildModel(e.type, e);
        const s = BUILDINGS[e.type].size;
        obj.position.set(e.x + s / 2, 0, e.z + s / 2);
        obj.rotation.y = -e.rot * Math.PI / 2;
        obj.userData.rot = e.rot;
        obj.userData.entity = e;
        this.worldGroup.add(obj);
        this.buildingMeshes.set(e.id, obj);
        if (!this._initialSync) this.popIn(obj);
      }
      obj.userData.entity = e;
    }
    for (const [id, obj] of this.buildingMeshes) {
      if (!alive.has(id)) { this.worldGroup.remove(obj); this.buildingMeshes.delete(id); this.dust(obj.position); }
    }
    this._initialSync = false;
    // Bänder
    for (const m of this.beltMeshes) { this.worldGroup.remove(m); m.dispose(); }
    this.beltMeshes = [];
    const byShape = [[], [], []];
    for (const e of g.entities.values()) if (e.type === 'band') byShape[e._shape || 0].push(e);
    const m4 = this.tmpM, q = this.tmpQ, s = this.tmpS.set(1, 1, 1), p = this.tmpV;
    byShape.forEach((list, shape) => {
      if (!list.length) return;
      const frame = new THREE.InstancedMesh(this.beltGeo[shape].frame, this.beltFrameMat, list.length);
      const surf = new THREE.InstancedMesh(this.beltGeo[shape].surface, this.beltSurfaceMat, list.length);
      list.forEach((e, i) => {
        m4.compose(p.set(e.x + 0.5, 0, e.z + 0.5), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -e.rot * Math.PI / 2), s);
        frame.setMatrixAt(i, m4); surf.setMatrixAt(i, m4);
      });
      frame.castShadow = true; frame.receiveShadow = true; surf.receiveShadow = true;
      this.worldGroup.add(frame, surf);
      this.beltMeshes.push(frame, surf);
    });
  }

  refreshBuilding(e) {
    const obj = this.buildingMeshes.get(e.id);
    if (obj) this.popIn(obj, 0.15);
  }

  popIn(obj, amount = 1) {
    obj.userData.pop = amount;
  }

  // ───────────────────────── Partikel (Rauch, Staub, Funken)
  initParticles() {
    const N = this.pN = 900;
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3);
    this.pData = new Float32Array(N * 4); // alpha, size, color-mix
    this.pVel = new Float32Array(N * 3);
    this.pLife = new Float32Array(N);
    this.pMax = new Float32Array(N);
    this.pKind = new Uint8Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pdata', new THREE.BufferAttribute(this.pData, 4).setUsage(THREE.DynamicDrawUsage));
    const mtl = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { scale: { value: 1 }, light: { value: 1 } },
      vertexShader: `attribute vec4 pdata; varying vec4 vD; uniform float scale;
        void main(){ vD = pdata; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = pdata.y * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vD; uniform float light;
        void main(){ vec2 c = gl_PointCoord - .5; float d = length(c); if (d > .5) discard;
          vec3 smoke = mix(vec3(.55,.56,.6), vec3(.95,.96,.98), vD.z) * light;
          vec3 col = mix(smoke, vec3(1.,.78,.3)*1.4, vD.w);
          gl_FragColor = vec4(col, vD.x * smoothstep(.5,.1,d)); }`,
    });
    this.particles = new THREE.Points(geo, mtl);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    this.pNext = 0;
  }

  emit(x, y, z, kind, vx = 0, vy = 0.6, vz = 0, life = 3) {
    const i = this.pNext; this.pNext = (i + 1) % this.pN;
    this.pPos.set([x, y, z], i * 3);
    this.pVel.set([vx, vy, vz], i * 3);
    this.pLife[i] = life; this.pMax[i] = life; this.pKind[i] = kind;
  }

  dust(pos) {
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2;
      this.emit(pos.x + Math.cos(a) * 0.5, 0.2, pos.z + Math.sin(a) * 0.5, 2, Math.cos(a) * 0.8, 0.4 + Math.random() * 0.5, Math.sin(a) * 0.8, 1 + Math.random());
    }
  }

  coins(x, z) {
    for (let k = 0; k < 2; k++) this.emit(x + (Math.random() - 0.5), 1, z + (Math.random() - 0.5), 3, 0, 1.5 + Math.random(), 0, 0.8);
  }

  updateParticles(dt) {
    const wind = this.game.wind * 0.35;
    for (let i = 0; i < this.pN; i++) {
      const life = this.pLife[i];
      if (life <= 0) { this.pData[i * 4] = 0; continue; }
      this.pLife[i] = life - dt;
      const k = this.pKind[i], t = 1 - life / this.pMax[i];
      const j = i * 3;
      if (k === 0 || k === 1) this.pVel[j] += wind * dt;
      if (k === 3) this.pVel[j + 1] -= 3 * dt;
      this.pPos[j] += this.pVel[j] * dt; this.pPos[j + 1] += this.pVel[j + 1] * dt; this.pPos[j + 2] += this.pVel[j + 2] * dt;
      const d = i * 4;
      if (k === 0) { this.pData[d] = 0.5 * Math.sin(Math.PI * t); this.pData[d + 1] = 0.35 + 1.0 * t; this.pData[d + 2] = 0.2; this.pData[d + 3] = 0; }
      else if (k === 1) { this.pData[d] = 0.6 * Math.sin(Math.PI * t); this.pData[d + 1] = 0.5 + 1.5 * t; this.pData[d + 2] = 1; this.pData[d + 3] = 0; }
      else if (k === 2) { this.pData[d] = 0.55 * (1 - t); this.pData[d + 1] = 0.3 + 0.5 * t; this.pData[d + 2] = 0.5; this.pData[d + 3] = 0; }
      else { this.pData[d] = 0.9 * (1 - t); this.pData[d + 1] = 0.14; this.pData[d + 2] = 0; this.pData[d + 3] = 1; }
    }
    const geo = this.particles.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.pdata.needsUpdate = true;
    this.particles.material.uniforms.scale.value = innerHeight * this.renderer.getPixelRatio() / (2 * Math.tan(this.camera.fov * Math.PI / 360));
  }

  // ───────────────────────── Overlays (Ghost, Auswahl, Hover)
  initOverlays() {
    this.hover = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
    this.hover.position.y = 0.02;
    this.hover.visible = false;
    this.scene.add(this.hover);
    const sel = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), new THREE.LineBasicMaterial({ color: 0xee6018 }));
    sel.visible = false;
    this.selBox = sel;
    this.scene.add(sel);
    this.ghost = null;
    this.ghostBelts = new THREE.InstancedMesh(this.beltGeo[0].frame, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), 512);
    this.ghostBelts.count = 0;
    this.ghostBelts.frustumCulled = false;
    this.ghostArrows = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.36, 3).rotateX(-Math.PI / 2).translate(0, 0.25, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }), 512);
    this.ghostArrows.count = 0;
    this.ghostArrows.frustumCulled = false;
    this.scene.add(this.ghostBelts, this.ghostArrows);
    // Reichweite des Holzfällers
    this.range = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9cff7a, transparent: true, opacity: 0.12, depthWrite: false }));
    this.range.position.y = 0.03;
    this.range.visible = false;
    this.scene.add(this.range);
  }

  setGhost(type, x, z, rot, ok) {
    if (!type) { if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; } this.range.visible = false; return; }
    if (!this.ghost || this.ghost.userData.type !== type || this.ghost.userData.rot !== rot) {
      if (this.ghost) this.scene.remove(this.ghost);
      const gm = buildModel(type);
      const okMat = new THREE.MeshStandardMaterial({ color: 0xa0ca92, transparent: true, opacity: 0.6, emissive: 0x3f5a35, emissiveIntensity: 0.5, depthWrite: false });
      const badMat = new THREE.MeshStandardMaterial({ color: 0xee6018, transparent: true, opacity: 0.6, emissive: 0x7a2a05, emissiveIntensity: 0.5, depthWrite: false });
      gm.traverse(o => { if (o.isMesh) { o.material = okMat; o.castShadow = false; } });
      gm.userData.okMat = okMat; gm.userData.badMat = badMat; gm.userData.type = type; gm.userData.rot = rot;
      gm.rotation.y = -rot * Math.PI / 2;
      this.ghost = gm;
      this.scene.add(gm);
    }
    const s = BUILDINGS[type].size;
    this.ghost.position.set(x + s / 2, 0.02, z + s / 2);
    const m = ok ? this.ghost.userData.okMat : this.ghost.userData.badMat;
    this.ghost.traverse(o => { if (o.isMesh) o.material = m; });
    if (type === 'holzfaeller') {
      this.range.visible = true;
      this.range.scale.set(8, 1, 8);
      this.range.position.set(x + 1, 0.03, z + 1);
    } else this.range.visible = false;
  }

  setBeltGhost(path, okFn) {
    const m4 = this.tmpM, q = this.tmpQ, p = this.tmpV, s = this.tmpS.set(1, 1, 1);
    const c = new THREE.Color();
    this.ghostBelts.count = this.ghostArrows.count = Math.min(512, path.length);
    path.slice(0, 512).forEach((t, i) => {
      m4.compose(p.set(t.x + 0.5, 0.01, t.z + 0.5), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -t.dir * Math.PI / 2), s);
      this.ghostBelts.setMatrixAt(i, m4);
      this.ghostArrows.setMatrixAt(i, m4);
      this.ghostBelts.setColorAt(i, c.set(okFn(t) ? 0xa0ca92 : 0xee6018));
    });
    this.ghostBelts.instanceMatrix.needsUpdate = true;
    this.ghostArrows.instanceMatrix.needsUpdate = true;
    if (this.ghostBelts.instanceColor) this.ghostBelts.instanceColor.needsUpdate = true;
  }

  setHover(x, z, size = 1, color = 0xffffff) {
    if (x == null) { this.hover.visible = false; return; }
    this.hover.visible = true;
    this.hover.scale.set(size, 1, size);
    this.hover.position.set(x + size / 2, 0.02, z + size / 2);
    this.hover.material.color.set(color);
  }

  setSelection(e) {
    if (!e) { this.selBox.visible = false; this.range.visible = false; return; }
    const s = BUILDINGS[e.type].size;
    this.selBox.visible = true;
    this.selBox.scale.set(s + 0.08, s === 1 ? 0.5 : 2.2 + s * 0.2, s + 0.08);
    this.selBox.position.set(e.x + s / 2, 0, e.z + s / 2);
    if (e.type === 'holzfaeller') {
      this.range.visible = true; this.range.scale.set(8, 1, 8); this.range.position.set(e.x + 1, 0.03, e.z + 1);
    }
  }

  // ───────────────────────── Frame
  applyCamera({ target, dist, yaw, pitch }) {
    this.camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      Math.sin(pitch) * dist,
      target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    this.camera.lookAt(target.x, 0, target.z);
    this.camera.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);
  }

  render(dt, cam) {
    const g = this.game;
    this.time += dt;
    const t = this.time;
    this.applyCamera(cam);
    const { target, dist } = cam;

    // Tag/Nacht
    const day = g.dayFrac, light = g.daylight;
    const sunAng = (day - 0.25) * Math.PI * 2;
    const sunDir = this.tmpV.set(Math.cos(sunAng) * 0.8, Math.max(0.12, Math.sin(sunAng)), 0.45).normalize();
    this.sun.position.set(target.x + sunDir.x * 60, sunDir.y * 60, target.z + sunDir.z * 60);
    this.sun.target.position.set(target.x, 0, target.z);
    const night = 1 - Math.min(1, light * 3);
    const dusk = Math.max(0, 1 - Math.abs(light - 0.12) * 6) * (1 - night * 0.5);
    this.sun.intensity = 0.15 + 2.4 * Math.min(1, light * 2.5);
    this.sun.color.setHSL(0.09, 0.6, 0.55 + 0.4 * Math.min(1, light * 2));
    if (light <= 0.01) { this.sun.position.set(target.x - 30, 50, target.z + 20); this.sun.intensity = 0.35; this.sun.color.set(0x8fa6ff); }
    this.hemi.intensity = 0.25 + 0.75 * Math.min(1, light * 2);
    const top = this.skyMat.uniforms.top.value, bottom = this.skyMat.uniforms.bottom.value;
    top.copy(SKY.day.top).lerp(SKY.night.top, night).lerp(SKY.dusk.top, dusk * 0.7);
    bottom.copy(SKY.day.bottom).lerp(SKY.night.bottom, night).lerp(SKY.dusk.bottom, dusk);
    this.scene.fog.color.copy(SKY.day.fog).lerp(SKY.night.fog, night).lerp(SKY.dusk.fog, dusk * 0.8);
    this.skyMat.uniforms.stars.value = night;
    this.scene.fog.near = dist * 1.2; this.scene.fog.far = dist * 3.2 + 40;
    MAT.window.emissiveIntensity = 0.15 + night * 2.2;
    MAT.lamp.emissiveIntensity = night * 3;
    this.particles.material.uniforms.light.value = 0.35 + 0.65 * Math.min(1, light * 2);
    this.bloom.strength = 0.25 + night * 0.5;
    this.beltTex.offset.y -= dt * CONFIG.beltSpeed * g.mods.beltMul * (g.paused ? 0 : g.speed);
    if (this.waterMat) this.waterMat.color.setHSL(0.56, 0.55, 0.32 + 0.12 * Math.min(1, light * 2) + Math.sin(t) * 0.01);
    this.water && (this.water.position.y = -0.12 + Math.sin(t * 0.8) * 0.015);

    // Gebäude animieren
    const smokeRate = g.paused ? 0 : dt;
    for (const obj of this.buildingMeshes.values()) {
      const e = obj.userData.entity;
      obj.userData.update?.(t, e, dt, g);
      if (obj.userData.pop) {
        obj.userData.pop = Math.max(0, obj.userData.pop - dt * 4);
        const k = obj.userData.pop;
        obj.scale.set(1 + k * 0.08, 1 - k * 0.5 + Math.sin(k * 8) * k * 0.1, 1 + k * 0.08);
      } else if (obj.scale.y !== 1) obj.scale.set(1, 1, 1);
      if (e?._sold) { if (!g.paused) this.coins(obj.position.x, obj.position.z); e._sold = 0; }
      const sm = obj.userData.smoke;
      if (sm && e?._active && Math.random() < smokeRate * (obj.userData.steam ? 5 : 3.5)) {
        const pt = sm[Math.floor(Math.random() * sm.length)];
        const wp = this.tmpV.copy(pt).applyMatrix4(obj.matrixWorld);
        this.emit(wp.x + (Math.random() - 0.5) * 0.15, wp.y, wp.z + (Math.random() - 0.5) * 0.15, obj.userData.steam ? 1 : 0, 0, 0.7 + Math.random() * 0.3, 0, obj.userData.steam ? 3.5 : 3);
      }
    }
    this.updateItems();
    this.updateParticles(dt);
    if (this.gridLines) this.gridLines.visible = !!cam.showGrid;

    if (this.quality.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  updateItems() {
    const g = this.game;
    const counts = {};
    for (const id of ITEM_IDS) counts[id] = 0;
    const m4 = this.tmpM, q = this.tmpQ, s = this.tmpS.set(1, 1, 1), v = this.tmpV;
    const lp = { x: 0, z: 0 }, wp = { x: 0, z: 0 };
    const put = (t, x, y, z, ang) => {
      const mesh = this.itemMeshes[t];
      let i = counts[t];
      if (i >= mesh.instanceMatrix.count) return;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ang);
      m4.compose(v.set(x, y, z), q, s);
      mesh.setMatrixAt(i, m4);
      counts[t] = i + 1;
    };
    for (const e of g.entities.values()) {
      if (e.type === 'band') {
        const d = e.rot;
        for (const it of e.items) {
          beltPathPoint(it.f, it.p, lp);
          rotLocal(d, lp.x, lp.z, wp);
          const ang = -d * Math.PI / 2 + (it.f === 1 ? (1 - it.p) * Math.PI / 2 : it.f === 2 ? -(1 - it.p) * Math.PI / 2 : 0);
          put(it.t, e.x + 0.5 + wp.x, 0.08, e.z + 0.5 + wp.z, ang);
        }
      } else if (e.type === 'verteiler' || e.type === 'kreuzung') {
        const bufs = e.type === 'verteiler' ? [e.buf] : e.bufs;
        for (const b of bufs) {
          if (!b) continue;
          const tt = b.timer;
          let x, z;
          if (tt < 0.5 || b.out < 0) { const k = 0.5 - Math.min(0.5, tt); x = DX[b.from] * k; z = DZ[b.from] * k; }
          else { const k = tt - 0.5; x = DX[b.out] * k; z = DZ[b.out] * k; }
          put(b.t, e.x + 0.5 + x, e.type === 'verteiler' ? 0.3 : 0.15, e.z + 0.5 + z, 0);
        }
      }
    }
    for (const id of ITEM_IDS) {
      const mesh = this.itemMeshes[id];
      mesh.count = counts[id];
      mesh.instanceMatrix.needsUpdate = true;
      if (counts[id] >= mesh.instanceMatrix.count) this.growItems(id);
    }
  }

  growItems(id) {
    const old = this.itemMeshes[id];
    const m = new THREE.InstancedMesh(old.geometry, old.material, old.instanceMatrix.count * 2);
    m.castShadow = true; m.frustumCulled = false; m.count = 0;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.remove(old); old.dispose();
    this.scene.add(m);
    this.itemMeshes[id] = m;
  }

  // Raycast auf die Bodenebene → Feldkoordinate
  pick(clientX, clientY) {
    const ndc = new THREE.Vector2(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    if (!(t > 0)) return null;
    const p = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    return { x: Math.floor(p.x), z: Math.floor(p.z), fx: p.x, fz: p.z };
  }

  // Thumbnails der Modelle für die UI
  static thumbnails(types, items) {
    const size = 128;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(size, size);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.4));
    const dl = new THREE.DirectionalLight(0xffffff, 2.2);
    dl.position.set(3, 6, 4);
    scene.add(dl);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const out = { buildings: {}, items: {} };
    const shoot = (obj, radius) => {
      scene.add(obj);
      const d = radius * 3.6;
      cam.position.set(d * 0.75, d * 0.75, d * 0.95);
      cam.lookAt(0, radius * 0.35, 0);
      r.render(scene, cam);
      scene.remove(obj);
      return r.domElement.toDataURL();
    };
    for (const t of types) {
      let obj;
      if (t === 'band') {
        obj = new THREE.Group();
        const geos = beltGeometries();
        const tex = beltTexture();
        obj.add(new THREE.Mesh(geos[0].frame, mat(0x7d8794, { metalness: 0.4 })), new THREE.Mesh(geos[0].surface, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide })));
        const im = new THREE.Mesh(itemGeometry('plate'), itemMaterial('eisenplatte'));
        im.position.set(0, 0.08, 0.1);
        obj.add(im);
        obj.rotation.y = Math.PI / 2;
      } else obj = buildModel(t, { res: 'eisenerz', level: 1 });
      const s = BUILDINGS[t].size;
      if (s > 1) obj.position.set(0, 0, 0);
      out.buildings[t] = shoot(obj, Math.max(0.8, s * 0.62));
    }
    for (const id of items) {
      const m = new THREE.Mesh(itemGeometry(ITEMS[id].shape), itemMaterial(id));
      m.rotation.y = 0.4;
      out.items[id] = shoot(m, 0.16);
    }
    r.dispose();
    return out;
  }
}
