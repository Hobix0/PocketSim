import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/examples/jsm/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/examples/jsm/shaders/VerticalTiltShiftShader.js';

// Cozy-Look als Nachbearbeitung des Bildes:
//   1. Bloom: helle Flächen (Lampen, Leuchtschilder, Fenster nachts) glühen weich nach
//   2. Tilt-Shift: oben und unten leicht unscharf – das Spiel wirkt wie eine Miniatur
//      (je weiter herausgezoomt, desto stärker)
//   3. Abschluss: weiche Vignette, etwas wärmere Farben und ein Hauch mehr Sättigung
// Abschaltbar (Menü → Darstellung); ohne Nachbearbeitung wird direkt gezeichnet. Werte: data/kamera → "look".

export interface CozyLookSettings {
  an: boolean;
  bloom: { staerke: number; radius: number; schwelle: number; nachtStaerke: number };
  tiltShift: { staerke: number; fokus: number };
  vignette: number;
  waerme: number;
  saettigung: number;
}

const FinishShader = {
  name: 'CozyFinish',
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.35 },
    waerme: { value: 0.04 },
    saettigung: { value: 1.06 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float vignette, waerme, saettigung;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // Sättigung um die Helligkeit herum
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, saettigung);
      // Wärmer: etwas mehr Rot/Gelb, etwas weniger Blau
      c.rgb += vec3(waerme, waerme * 0.45, -waerme * 0.6);
      // Weiche, runde Vignette
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.25, length(d * vec2(1.15, 1.0)));
      c.rgb *= mix(1.0 - vignette, 1.0, v);
      gl_FragColor = c;
    }`,
};

export class CozyLook {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly tiltH: ShaderPass;
  private readonly tiltV: ShaderPass;
  private readonly finish: ShaderPass;
  private width = 1;
  private height = 1;
  /** 0 = Tag, 1 = Nacht (stärkeres Glühen) */
  nacht = 0;
  /** 0 = ganz nah, 1 = ganz weit (stärkere Miniatur-Unschärfe) */
  zoom = 0.5;

  constructor(private readonly renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, readonly settings: CozyLookSettings) {
    // Mit Kantenglättung im Zwischenbild (sonst wären die Würfelkanten treppig)
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    const b = settings.bloom;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), b.staerke, b.radius, b.schwelle);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.tiltH = new ShaderPass(HorizontalTiltShiftShader);
    this.tiltV = new ShaderPass(VerticalTiltShiftShader);
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
  }

  get an(): boolean {
    return this.settings.an;
  }

  set an(v: boolean) {
    this.settings.an = v;
  }

  setSize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    // Bloom in halber Auflösung reicht und spart Zeit
    this.bloom.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.settings.an) { this.renderer.render(scene, camera); return; }
    const s = this.settings;
    this.bloom.strength = s.bloom.staerke + (s.bloom.nachtStaerke - s.bloom.staerke) * this.nacht;
    // Unschärfe: Stärke in Pixeln am Bildrand, wächst mit dem Zoom
    const blur = s.tiltShift.staerke * (0.35 + this.zoom * 0.9);
    this.tiltH.uniforms.h.value = blur / this.width;
    this.tiltV.uniforms.v.value = blur / this.height;
    this.tiltH.uniforms.r.value = this.tiltV.uniforms.r.value = s.tiltShift.fokus;
    this.finish.uniforms.vignette.value = s.vignette;
    this.finish.uniforms.waerme.value = s.waerme;
    this.finish.uniforms.saettigung.value = s.saettigung;
    this.composer.render();
  }
}
