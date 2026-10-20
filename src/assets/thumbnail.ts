import * as THREE from 'three';
import type { VoxelGrid } from '../voxel/VoxelGrid';
import { greedyMesh } from '../voxel/greedyMesh';

// Vorschaubilder aus Würfelmodellen (für das Baumenü und den Editor).
// Modelle ohne eigenes Icon bekommen so automatisch ein Bild: schräg von vorne, freigestellt.
// Gerendert wird mit einem gemeinsamen, unsichtbaren Renderer – eins nach dem anderen, je Bild ein Frame,
// damit das Spiel nicht hängt. Fertige Bilder werden gemerkt.

const SIZE = 160;
let renderer: THREE.WebGLRenderer | null = null;
const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
const sources = new Map<string, VoxelGrid>();
const cache = new Map<string, string>();
const waiting = new Map<string, ((url: string) => void)[]>();
let scheduled = false;

/** Würfelgitter eines Modells bekanntmachen (z. B. aus data/modelle) */
export function provideThumbnail(path: string, grid: VoxelGrid): void {
  sources.set(path, grid);
}

export function hasThumbnail(path: string | undefined): path is string {
  return !!path && sources.has(path);
}

/** Schon fertiges Bild (oder undefined) */
export function cachedThumbnail(path: string): string | undefined {
  return cache.get(path);
}

/** Bild anfordern; `done` wird aufgerufen, sobald es fertig ist (sofort, wenn es schon da ist). */
export function requestThumbnail(path: string, done: (url: string) => void): void {
  const ready = cache.get(path);
  if (ready) { done(ready); return; }
  if (!sources.has(path)) return;
  const list = waiting.get(path) ?? [];
  list.push(done);
  waiting.set(path, list);
  if (!scheduled) { scheduled = true; requestAnimationFrame(next); }
}

function next(): void {
  scheduled = false;
  const first = waiting.keys().next();
  if (first.done) return;
  const path = first.value;
  const callbacks = waiting.get(path) ?? [];
  waiting.delete(path);
  const url = renderThumbnail(sources.get(path)!);
  cache.set(path, url);
  for (const cb of callbacks) cb(url);
  if (waiting.size) { scheduled = true; requestAnimationFrame(next); }
}

/** Gitter als PNG (data:-URL), schräg von vorne (+X) gesehen */
export function renderThumbnail(grid: VoxelGrid, size = SIZE): string {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }
  renderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#7a7468', 1.8));
  const light = new THREE.DirectionalLight('#fff4e6', 1.8);
  light.position.set(3, 5, 2);
  scene.add(light);
  const geo = greedyMesh(grid);
  const mesh = new THREE.Mesh(geo, material);
  scene.add(mesh);
  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2 || 0.5;
  const cam = new THREE.PerspectiveCamera(30, 1, radius / 50, radius * 20);
  cam.position.copy(center).add(new THREE.Vector3(1.3, 0.9, 1.0).normalize().multiplyScalar(radius / Math.sin(THREE.MathUtils.degToRad(15))));
  cam.lookAt(center);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  geo.dispose();
  return url;
}
