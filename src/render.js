// Three.js-Szene: Fabrikhalle, Gebäude, Rollenbahnen, Teile, Partikel, Licht, Kameras.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BUILDINGS, ITEM_IDS, CONFIG } from './data.js';
import { DX, DZ } from './sim.js';
import { buildModel, beltGeometries, beltPathPoint, itemSource, MAT, mat } from './models.js';

const ROT = [[1, 0], [0, -1], [-1, 0], [0, 1]]; // [cos, sin] für Drehung um −dir·90°
function rotLocal(d, lx, lz, out) {
  const [c, s] = ROT[d];
  out.x = lx * c + lz * s;
  out.z = -lx * s + lz * c;
  return out;
}
const PORTED = new Set(['machine', 'storage', 'inbound']);
const WALL_H = 3.4;
const BG = 0x101010;

export class Renderer {
  constructor(canvas, game) {
    this.game = game;
    this.quality = { shadows: true, ao: !matchMedia('(pointer: coarse)').matches, bloom: true, trusses: true };
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.setClearColor(BG);

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    this.persp = new THREE.PerspectiveCamera(36, 1, 0.3, 300);
    this.ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 300);
    this.camera = this.persp;

    this.hemi = new THREE.HemisphereLight(0xe8eef5, 0x4a4f57, 1.1);
    scene.add(this.hemi);
    // „Oberlicht“: festes Hauptlicht, damit die Schatten in der Halle ruhig bleiben
    const key = this.key = new THREE.DirectionalLight(0xfff4e6, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.02;
    scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.5);
    fill.position.set(-30, 25, -20);
    scene.add(fill);

    this.composers = {};
    this.worldGroup = new THREE.Group();
    this.hallGroup = new THREE.Group();
    scene.add(this.worldGroup, this.hallGroup);
    this.buildingMeshes = new Map();
    this.beltGeo = beltGeometries();
    this.beltFrameMat = mat(0x9aa2ab, { metalness: 0.5, roughness: 0.4 });
    this.beltRollerMat = mat(0xd5dade, { metalness: 0.7, roughness: 0.25 });
    this.beltMeshes = [];
    this.itemMeshes = {};
    this.time = 0;
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpV = new THREE.Vector3();
    this.tmpS = new THREE.Vector3(1, 1, 1);
    this.initItems();
    this.initParticles();
    this.initOverlays();

    game.on('world', () => this.syncWorld());
    game.on('entityChanged', e => this.refreshBuilding(e));
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  initItems() {
    for (const id of ITEM_IDS) {
      const src = itemSource(id);
      const m = new THREE.InstancedMesh(src.geometry, src.material, 512);
      m.castShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.itemMeshes[id] = m;
      this.scene.add(m);
    }
  }

  // ───────────────────────── Qualität & Postprocessing
  composerFor(cam) {
    const key = cam.isOrthographicCamera ? 'o' : 'p';
    if (this.composers[key]) return this.composers[key];
    const c = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, cam));
    const ao = new GTAOPass(this.scene, cam, innerWidth, innerHeight);
    ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.2, samples: 16 });
    ao.blendIntensity = 0.9;
    c.addPass(ao);
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.35, 0.4, 0.9);
    c.addPass(bloom);
    c.addPass(new OutputPass());
    c.setSize(innerWidth, innerHeight);
    c.userData = { ao, bloom };
    this.composers[key] = c;
    this.applyQualityTo(c);
    return c;
  }

  applyQualityTo(c) {
    c.userData.ao.enabled = this.quality.ao;
    c.userData.bloom.enabled = this.quality.bloom;
  }

  setQuality(q) {
    Object.assign(this.quality, q);
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.key.castShadow = this.quality.shadows;
    Object.values(this.composers).forEach(c => this.applyQualityTo(c));
    if (this.trusses) this.trusses.visible = this.quality.trusses;
    this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    Object.values(this.composers).forEach(c => c.setSize(w, h));
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
  }

  // ───────────────────────── Halle
  buildHall() {
    const g = this.game, { W, H } = g;
    const grp = this.hallGroup;
    grp.clear();

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W + 2, H + 2).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: floorTexture(W, H), roughness: 0.85, metalness: 0.02 }));
    floor.position.set(W / 2, 0, H / 2);
    floor.receiveShadow = true;
    grp.add(floor);
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 2.4, 0.6, H + 2.4), mat(0x2a2c30));
    base.position.set(W / 2, -0.301, H / 2);
    grp.add(base);

    // Wände mit Fensterband – je Seite eine Gruppe, damit sie zur Kamera hin abgesenkt werden können
    this.walls = [];
    const wallMat = mat(0x8796ab, { roughness: 0.9 });
    const lowMat = mat(0x5f6b7c, { roughness: 0.9 });
    const sides = [
      { len: W, pos: [W / 2, -0.6], rot: 0, n: [0, -1] },
      { len: H, pos: [W + 0.6, H / 2], rot: -Math.PI / 2, n: [1, 0] },
      { len: W, pos: [W / 2, H + 0.6], rot: Math.PI, n: [0, 1] },
      { len: H, pos: [-0.6, H / 2], rot: Math.PI / 2, n: [-1, 0] },
    ];
    for (const sd of sides) {
      const wg = new THREE.Group();
      const L = sd.len + 2.4;
      const lower = new THREE.Mesh(new THREE.BoxGeometry(L, 1.0, 0.4), lowMat);
      lower.position.y = 0.5;
      const upper = new THREE.Mesh(new THREE.BoxGeometry(L, WALL_H - 2.2, 0.4), wallMat);
      upper.position.y = 2.2 + (WALL_H - 2.2) / 2;
      const mid = new THREE.Mesh(new THREE.BoxGeometry(L, 1.2, 0.36), wallMat);
      mid.position.y = 1.6;
      for (const m of [lower, upper, mid]) { m.castShadow = m.receiveShadow = true; wg.add(m); }
      for (let x = -sd.len / 2 + 2; x < sd.len / 2 - 1; x += 4) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 0.42), MAT.window);
        win.position.set(x, 1.6, 0);
        wg.add(win);
        for (let k = 1; k < 4; k++) {
          const mul = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.44), MAT.dark);
          mul.position.set(x - 1.3 + k * 0.65, 1.6, 0);
          wg.add(mul);
        }
      }
      const cap = new THREE.Mesh(new THREE.BoxGeometry(L, 0.08, 0.5), mat(0x3d4249));
      cap.position.y = WALL_H;
      wg.add(cap);
      wg.position.set(sd.pos[0], 0, sd.pos[1]);
      wg.rotation.y = sd.rot;
      wg.userData.normal = sd.n;
      grp.add(wg);
      this.walls.push(wg);
    }

    // Stützen (HEB-Profil) und Dachbinder mit Hallenlampen
    const colMat = mat(0x6c7480, { metalness: 0.5, roughness: 0.4 });
    const top = WALL_H + 1.2;
    for (const [cx, cz] of g.columns) {
      const col = new THREE.Group();
      const web = new THREE.Mesh(new THREE.BoxGeometry(0.08, top, 0.36), colMat);
      const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.36, top, 0.05), colMat);
      const f2 = f1.clone();
      f1.position.z = 0.17; f2.position.z = -0.17;
      col.add(web, f1, f2);
      col.children.forEach(m => { m.position.y = top / 2; m.castShadow = m.receiveShadow = true; });
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.6), mat(0xf2b632));
      foot.position.y = 0.02;
      col.add(foot);
      col.position.set(cx + 0.5, 0, cz + 0.5);
      grp.add(col);
    }
    this.trusses = new THREE.Group();
    const trussMat = mat(0x8a929c, { metalness: 0.4, roughness: 0.5 });
    const lampGeo = new THREE.BoxGeometry(1.2, 0.08, 0.25);
    const xs = [...new Set(g.columns.map(c => c[0]))];
    for (const x of xs) {
      const t = new THREE.Group();
      const span = H + 1.2;
      const chordTop = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, span), trussMat);
      chordTop.position.y = top;
      const chordBot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, span), trussMat);
      chordBot.position.y = top - 0.8;
      t.add(chordTop, chordBot);
      const n = Math.round(span / 1.6);
      for (let i = 0; i < n; i++) {
        const d = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, Math.hypot(0.8, span / n)), trussMat);
        d.position.set(0, top - 0.4, -span / 2 + (i + 0.5) * span / n);
        d.rotation.x = (i % 2 ? 1 : -1) * Math.atan2(0.8, span / n);
        t.add(d);
      }
      for (let z = 3; z < H - 2; z += 5) {
        const lamp = new THREE.Mesh(lampGeo, MAT.lamp);
        lamp.position.set(0, top - 0.95, z - H / 2);
        const wire = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.15, 0.01), MAT.dark);
        wire.position.set(0, top - 0.85, z - H / 2);
        t.add(lamp, wire);
      }
      t.position.set(x + 0.5, 0, H / 2);
      this.trusses.add(t);
    }
    this.trusses.visible = this.quality.trusses;
    grp.add(this.trusses);

    // Schattenkamera fest auf die Halle ausrichten
    const k = this.key, sc = k.shadow.camera;
    const R = Math.max(W, H) * 0.62;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 140;
    sc.updateProjectionMatrix();
    k.position.set(W / 2 - 18, 40, H / 2 + 26);
    k.target.position.set(W / 2, 0, H / 2);
    this._hallKey = `${W}x${H}:${g.seed}`;
  }

  // ───────────────────────── Gebäude & Rollenbahnen
  syncWorld() {
    const g = this.game;
    if (this._hallKey !== `${g.W}x${g.H}:${g.seed}`) this.buildHall();
    const alive = new Set();
    for (const e of g.entities.values()) {
      if (e.type === 'band') continue;
      alive.add(e.id);
      let obj = this.buildingMeshes.get(e.id);
      if (!obj || obj.userData.rot !== e.rot) {
        if (obj) this.worldGroup.remove(obj);
        obj = this.makeBuilding(e.type, e);
        const s = BUILDINGS[e.type].size;
        obj.position.set(e.x + s / 2, 0, e.z + s / 2);
        obj.rotation.y = -e.rot * Math.PI / 2;
        obj.userData.rot = e.rot;
        this.worldGroup.add(obj);
        this.buildingMeshes.set(e.id, obj);
        if (!this._initialSync) obj.userData.pop = 1;
      }
      obj.userData.entity = e;
    }
    for (const [id, obj] of this.buildingMeshes) {
      if (!alive.has(id)) { this.worldGroup.remove(obj); this.buildingMeshes.delete(id); this.dust(obj.position); }
    }
    this._initialSync = false;
    for (const m of this.beltMeshes) { this.worldGroup.remove(m); m.dispose(); }
    this.beltMeshes = [];
    const byShape = [[], [], []];
    for (const e of g.entities.values()) if (e.type === 'band') byShape[e._shape || 0].push(e);
    const m4 = this.tmpM, q = this.tmpQ, s = this.tmpS.set(1, 1, 1), p = this.tmpV;
    byShape.forEach((list, shape) => {
      if (!list.length) return;
      const frame = new THREE.InstancedMesh(this.beltGeo[shape].frame, this.beltFrameMat, list.length);
      const rollers = new THREE.InstancedMesh(this.beltGeo[shape].rollers, this.beltRollerMat, list.length);
      list.forEach((e, i) => {
        m4.compose(p.set(e.x + 0.5, 0, e.z + 0.5), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -e.rot * Math.PI / 2), s);
        frame.setMatrixAt(i, m4); rollers.setMatrixAt(i, m4);
      });
      frame.castShadow = rollers.castShadow = true;
      frame.receiveShadow = rollers.receiveShadow = true;
      this.worldGroup.add(frame, rollers);
      this.beltMeshes.push(frame, rollers);
    });
  }

  // Modell plus Ausgangsmarkierung am Boden
  makeBuilding(type, e) {
    const obj = buildModel(type, e);
    const B = BUILDINGS[type];
    if (PORTED.has(B.kind)) {
      const arrow = new THREE.Mesh(arrowGeometry(), MAT.orange);
      arrow.position.set(0, 0.07, -B.size / 2 + 0.16);
      arrow.receiveShadow = true;
      obj.add(arrow);
    }
    return obj;
  }

  refreshBuilding(e) {
    const obj = this.buildingMeshes.get(e.id);
    if (obj) obj.userData.pop = 0.15;
  }

  // ───────────────────────── Partikel (Rauch, Staub, Funken)
  initParticles() {
    const N = this.pN = 1200;
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3);
    this.pData = new Float32Array(N * 4);
    this.pVel = new Float32Array(N * 3);
    this.pLife = new Float32Array(N);
    this.pMax = new Float32Array(N);
    this.pKind = new Uint8Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pdata', new THREE.BufferAttribute(this.pData, 4).setUsage(THREE.DynamicDrawUsage));
    const mtl = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { scale: { value: 1 }, ortho: { value: 0 } },
      vertexShader: `attribute vec4 pdata; varying vec4 vD; uniform float scale; uniform float ortho;
        void main(){ vD = pdata; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = pdata.y * scale / mix(-mv.z, 1., ortho); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vD;
        void main(){ vec2 c = gl_PointCoord - .5; float d = length(c); if (d > .5) discard;
          vec3 smoke = mix(vec3(.55,.56,.6), vec3(.9,.9,.92), vD.z);
          vec3 col = mix(smoke, vec3(1.,.72,.3)*1.6, vD.w);
          gl_FragColor = vec4(col, vD.x * smoothstep(.5,.1,d)); }`,
    });
    this.particles = new THREE.Points(geo, mtl);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    this.pNext = 0;
  }

  emit(x, y, z, kind, vx = 0, vy = 0.6, vz = 0, life = 3) {
    const i = this.pNext; this.pNext = (i + 1) % this.pN;
    this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
    this.pVel[i * 3] = vx; this.pVel[i * 3 + 1] = vy; this.pVel[i * 3 + 2] = vz;
    this.pLife[i] = life; this.pMax[i] = life; this.pKind[i] = kind;
  }

  dust(pos) {
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2;
      this.emit(pos.x + Math.cos(a) * 0.5, 0.2, pos.z + Math.sin(a) * 0.5, 2, Math.cos(a) * 0.8, 0.4 + Math.random() * 0.5, Math.sin(a) * 0.8, 1 + Math.random());
    }
  }

  sparks(x, y, z, n = 3) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = 0.8 + Math.random() * 1.5;
      this.emit(x, y, z, 3, Math.cos(a) * v, 0.8 + Math.random() * 1.5, Math.sin(a) * v, 0.35 + Math.random() * 0.3);
    }
  }

  updateParticles(dt) {
    for (let i = 0; i < this.pN; i++) {
      const life = this.pLife[i];
      if (life <= 0) { this.pData[i * 4] = 0; continue; }
      this.pLife[i] = life - dt;
      const k = this.pKind[i], t = 1 - life / this.pMax[i], j = i * 3, d = i * 4;
      if (k === 3) this.pVel[j + 1] -= 9 * dt;
      this.pPos[j] += this.pVel[j] * dt; this.pPos[j + 1] += this.pVel[j + 1] * dt; this.pPos[j + 2] += this.pVel[j + 2] * dt;
      if (k === 3 && this.pPos[j + 1] < 0.02) { this.pPos[j + 1] = 0.02; this.pVel[j + 1] *= -0.3; this.pVel[j] *= 0.5; this.pVel[j + 2] *= 0.5; }
      if (k === 0) { this.pData[d] = 0.45 * Math.sin(Math.PI * t); this.pData[d + 1] = 0.3 + 0.9 * t; this.pData[d + 2] = 0.3; this.pData[d + 3] = 0; }
      else if (k === 2) { this.pData[d] = 0.5 * (1 - t); this.pData[d + 1] = 0.3 + 0.5 * t; this.pData[d + 2] = 0.6; this.pData[d + 3] = 0; }
      else { this.pData[d] = 1 - t; this.pData[d + 1] = 0.05; this.pData[d + 2] = 0; this.pData[d + 3] = 1; }
    }
    const geo = this.particles.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.pdata.needsUpdate = true;
    const u = this.particles.material.uniforms;
    if (this.camera.isOrthographicCamera) {
      u.ortho.value = 1;
      u.scale.value = innerHeight * this.renderer.getPixelRatio() / (this.ortho.top - this.ortho.bottom);
    } else {
      u.ortho.value = 0;
      u.scale.value = innerHeight * this.renderer.getPixelRatio() / (2 * Math.tan(this.persp.fov * Math.PI / 360));
    }
  }

  // ───────────────────────── Overlays (Ghost, Auswahl, Hover)
  initOverlays() {
    this.hover = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false }));
    this.hover.position.y = 0.02;
    this.hover.visible = false;
    this.scene.add(this.hover);
    const sel = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), new THREE.LineBasicMaterial({ color: 0xee6018 }));
    sel.visible = false;
    this.selBox = sel;
    this.scene.add(sel);
    this.ghost = null;
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    this.ghostBelts = new THREE.InstancedMesh(this.beltGeo[0].frame, ghostMat, 512);
    this.ghostBelts.count = 0;
    this.ghostBelts.frustumCulled = false;
    this.ghostArrows = new THREE.InstancedMesh(arrowGeometry().translate(0, CONFIG.beltHeight + 0.03, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }), 512);
    this.ghostArrows.count = 0;
    this.ghostArrows.frustumCulled = false;
    this.scene.add(this.ghostBelts, this.ghostArrows);
    this.gridLines = null;
  }

  ensureGridLines() {
    const { W, H } = this.game;
    if (this.gridLines?.userData.key === `${W}x${H}`) return;
    if (this.gridLines) this.scene.remove(this.gridLines);
    const pts = [];
    for (let i = 0; i <= W; i++) pts.push(i, 0.012, 0, i, 0.012, H);
    for (let i = 0; i <= H; i++) pts.push(0, 0.012, i, W, 0.012, i);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.gridLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }));
    this.gridLines.userData.key = `${W}x${H}`;
    this.scene.add(this.gridLines);
  }

  setGhost(type, x, z, rot, ok) {
    if (!type) { if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; } return; }
    const B = BUILDINGS[type];
    if (B.wall) { const wr = this.game.wallRotation(x, z, B.size); if (wr >= 0) rot = wr; }
    if (!this.ghost || this.ghost.userData.type !== type || this.ghost.userData.rot !== rot) {
      if (this.ghost) this.scene.remove(this.ghost);
      const gm = this.makeBuilding(type);
      const okMat = new THREE.MeshStandardMaterial({ color: 0xa0ca92, transparent: true, opacity: 0.6, emissive: 0x3f5a35, depthWrite: false });
      const badMat = new THREE.MeshStandardMaterial({ color: 0xee6018, transparent: true, opacity: 0.6, emissive: 0x7a2a05, depthWrite: false });
      gm.traverse(o => { if (o.isMesh) { o.material = okMat; o.castShadow = false; } });
      Object.assign(gm.userData, { okMat, badMat, type, rot });
      gm.rotation.y = -rot * Math.PI / 2;
      this.ghost = gm;
      this.scene.add(gm);
    }
    this.ghost.position.set(x + B.size / 2, 0.01, z + B.size / 2);
    const m = ok ? this.ghost.userData.okMat : this.ghost.userData.badMat;
    this.ghost.traverse(o => { if (o.isMesh) o.material = m; });
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
    if (!e) { this.selBox.visible = false; return; }
    const s = BUILDINGS[e.type].size;
    this.selBox.visible = true;
    this.selBox.scale.set(s + 0.08, s === 1 ? 0.8 : 2.4, s + 0.08);
    this.selBox.position.set(e.x + s / 2, 0, e.z + s / 2);
  }

  // ───────────────────────── Kamera (Perspektive oder isometrisch)
  applyCamera(cam) {
    const { target, dist, yaw, pitch, iso } = cam;
    const dir = this.tmpV.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    if (iso) {
      this.camera = this.ortho;
      const aspect = innerWidth / innerHeight, half = dist * 0.42;
      Object.assign(this.ortho, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
      this.ortho.position.set(target.x + dir.x * 80, dir.y * 80, target.z + dir.z * 80);
      this.ortho.updateProjectionMatrix();
    } else {
      this.camera = this.persp;
      this.persp.position.set(target.x + dir.x * dist, dir.y * dist, target.z + dir.z * dist);
    }
    this.camera.lookAt(target.x, 0, target.z);
    this.camera.updateMatrixWorld();
    this.cutaway(yaw);
  }

  // Wände zur Kamera hin absenken, damit man in die Halle schaut
  cutaway(yaw) {
    if (!this.walls) return;
    const vx = Math.sin(yaw), vz = Math.cos(yaw);
    for (const w of this.walls) {
      const [nx, nz] = w.userData.normal;
      const target = nx * vx + nz * vz > 0.3 ? 0.3 : 1;
      w.scale.y += (target - w.scale.y) * 0.2;
    }
  }

  // ───────────────────────── Frame
  render(dt, cam) {
    const g = this.game;
    this.time += dt;
    const t = this.time;
    this.applyCamera(cam);

    // Tageslicht durch die Fenster, abends übernehmen die Hallenlampen
    const light = g.daylight, night = 1 - Math.min(1, light * 3);
    this.key.intensity = 1.2 + 1.3 * Math.min(1, light * 2);
    this.key.color.setHSL(0.09, 0.35 * (1 - night), 0.85);
    this.hemi.intensity = 0.75 + 0.35 * Math.min(1, light * 2);
    MAT.window.emissiveIntensity = 0.05 + 0.6 * Math.min(1, light * 2);
    MAT.window.emissive.setHSL(0.58, 0.5, 0.75);
    MAT.lamp.emissiveIntensity = 0.6 + night * 2.2;

    const running = !g.paused;
    for (const obj of this.buildingMeshes.values()) {
      const e = obj.userData.entity;
      obj.userData.update?.(t, e, dt, g);
      if (obj.userData.pop) {
        obj.userData.pop = Math.max(0, obj.userData.pop - dt * 4);
        const k = obj.userData.pop;
        obj.scale.set(1 + k * 0.06, 1 - k * 0.4 + Math.sin(k * 8) * k * 0.08, 1 + k * 0.06);
      } else if (obj.scale.y !== 1) obj.scale.set(1, 1, 1);
      if (e?._sold) { e._recent = 1.5; e._sold = 0; }
      if (e?._recent > 0) e._recent -= dt;
      const lamp = obj.userData.statusLamp;
      if (lamp && e) {
        const st = statusOf(e, g);
        lamp.material.emissive.set(st === 'run' ? 0x3ddc84 : st === 'block' ? 0xee6018 : 0x000000);
        lamp.material.color.set(st === 'run' ? 0x2e8a52 : st === 'block' ? 0xb44a12 : 0x3a3a3a);
        lamp.material.emissiveIntensity = st === 'block' ? 1.5 + Math.sin(t * 6) : 1.6;
      }
      if (obj.userData.screen) obj.userData.screen.emissiveIntensity = e?._active ? 0.9 : 0.25;
      if (!running || !e?._active) continue;
      const sm = obj.userData.smoke;
      if (sm && Math.random() < dt * 3) {
        const wp = this.tmpV.copy(sm[0]).applyMatrix4(obj.matrixWorld);
        this.emit(wp.x, wp.y, wp.z, 0, (Math.random() - 0.5) * 0.1, 0.6, (Math.random() - 0.5) * 0.1, 3);
      }
      const sp = obj.userData.sparks;
      if (sp && Math.random() < dt * 8) {
        const wp = this.tmpV.copy(sp[0]).applyMatrix4(obj.matrixWorld);
        this.sparks(wp.x, wp.y, wp.z, 2);
      }
    }
    this.updateItems();
    this.updateParticles(dt);
    if (cam.showGrid) this.ensureGridLines();
    if (this.gridLines) this.gridLines.visible = !!cam.showGrid;

    if (this.quality.ao || this.quality.bloom) this.composerFor(this.camera).render();
    else this.renderer.render(this.scene, this.camera);
  }

  updateItems() {
    const g = this.game;
    const counts = {};
    for (const id of ITEM_IDS) counts[id] = 0;
    const m4 = this.tmpM, q = this.tmpQ, s = this.tmpS.set(1, 1, 1), v = this.tmpV;
    const lp = { x: 0, z: 0 }, wp = { x: 0, z: 0 };
    const y0 = CONFIG.beltHeight;
    const put = (t, x, y, z, ang) => {
      const mesh = this.itemMeshes[t];
      const i = counts[t];
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
          put(it.t, e.x + 0.5 + wp.x, y0, e.z + 0.5 + wp.z, ang);
        }
      } else if (e.type === 'verteiler' || e.type === 'kreuzung') {
        const bufs = e.type === 'verteiler' ? [e.buf] : e.bufs;
        for (const b of bufs) {
          if (!b) continue;
          let x, z;
          if (b.timer < 0.5 || b.out < 0) { const k = 0.5 - Math.min(0.5, b.timer); x = DX[b.from] * k; z = DZ[b.from] * k; }
          else { const k = b.timer - 0.5; x = DX[b.out] * k; z = DZ[b.out] * k; }
          put(b.t, e.x + 0.5 + x, y0, e.z + 0.5 + z, 0);
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

  // Raycast auf den Hallenboden → Feldkoordinate
  pick(clientX, clientY) {
    const ndc = new THREE.Vector2(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    if (!(t > 0)) return null;
    const p = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    return { x: Math.floor(p.x), z: Math.floor(p.z), fx: p.x, fz: p.z };
  }

  // Vorschaubilder der Modelle für die UI
  static thumbnails(types, items) {
    const size = 128;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(size, size);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.6));
    const dl = new THREE.DirectionalLight(0xffffff, 2.2);
    dl.position.set(3, 6, 4);
    scene.add(dl);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    const out = { buildings: {}, items: {} };
    const shoot = obj => {
      scene.add(obj);
      obj.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(obj);
      const c = bb.getCenter(new THREE.Vector3()), rad = bb.getSize(new THREE.Vector3()).length() / 2;
      const d = rad / Math.sin(15 * Math.PI / 180) * 0.95;
      cam.position.set(c.x + d * 0.55, c.y + d * 0.5, c.z + d * 0.67);
      cam.lookAt(c);
      r.render(scene, cam);
      scene.remove(obj);
      return r.domElement.toDataURL();
    };
    const geos = beltGeometries();
    for (const t of types) {
      let obj;
      if (t === 'band') {
        obj = new THREE.Group();
        obj.add(new THREE.Mesh(geos[0].frame, mat(0x9aa2ab, { metalness: 0.5 })), new THREE.Mesh(geos[0].rollers, mat(0xd5dade, { metalness: 0.7 })));
        const src = itemSource('welle');
        const im = new THREE.Mesh(src.geometry, src.material);
        im.position.set(0, CONFIG.beltHeight, 0.1);
        obj.add(im);
        obj.rotation.y = Math.PI / 2;
      } else obj = buildModel(t, { level: 1, total: 120 });
      out.buildings[t] = shoot(obj);
    }
    for (const id of items) {
      const src = itemSource(id);
      const m = new THREE.Mesh(src.geometry, src.material);
      m.rotation.y = 0.4;
      out.items[id] = shoot(m);
    }
    r.dispose();
    return out;
  }
}

export function statusOf(e, g) {
  const kind = BUILDINGS[e.type].kind;
  if (kind === 'machine') {
    if (e.crafting) return (g.power?.ratio ?? 1) < 0.999 ? 'block' : 'run';
    const out = Object.values(e.outBuf).reduce((a, b) => a + b, 0);
    return out >= 8 ? 'block' : 'idle';
  }
  if (kind === 'inbound') return e._poor ? 'block' : e.on ? 'run' : 'idle';
  return 'idle';
}

function arrowGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.16, 0.06); s.lineTo(0, -0.12); s.lineTo(0.16, 0.06); s.lineTo(0.08, 0.06); s.lineTo(0, -0.03); s.lineTo(-0.08, 0.06);
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  return g;
}

function floorTexture(W, H) {
  const px = 32;
  const c = document.createElement('canvas');
  c.width = (W + 2) * px; c.height = (H + 2) * px;
  const x = c.getContext('2d');
  x.fillStyle = '#a7abb0'; x.fillRect(0, 0, c.width, c.height);
  // Produktionsfläche dunkler, Gehweg an den Wänden heller
  x.fillStyle = '#8f949a';
  x.fillRect(3 * px, 3 * px, (W - 4) * px, (H - 4) * px);
  for (let i = 0; i < W * H * 2; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.035})`;
    x.beginPath(); x.arc(Math.random() * c.width, Math.random() * c.height, 4 + Math.random() * 40, 0, Math.PI * 2); x.fill();
  }
  // Fugen alle 4 Felder
  x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 2;
  for (let i = 1; i <= W + 1; i += 4) { x.beginPath(); x.moveTo(i * px, px); x.lineTo(i * px, (H + 1) * px); x.stroke(); }
  for (let i = 1; i <= H + 1; i += 4) { x.beginPath(); x.moveTo(px, i * px); x.lineTo((W + 1) * px, i * px); x.stroke(); }
  // weiße Markierung um die Produktionsfläche, gelbe Linie am Wandgang
  x.strokeStyle = '#eeeeee'; x.lineWidth = 5;
  x.strokeRect(3 * px, 3 * px, (W - 4) * px, (H - 4) * px);
  x.strokeStyle = '#e5b23a'; x.lineWidth = 4;
  x.strokeRect(1.4 * px, 1.4 * px, (W - 0.8) * px, (H - 0.8) * px);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
