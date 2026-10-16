import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Content } from '../src/content/Content';
import { World } from '../src/ecs/World';
import { InputMap } from '../src/input/InputMap';
import { Pointer } from '../src/input/Pointer';
import { Selection } from '../src/interaction/Selection';
import { Interactor } from '../src/interaction/Interactor';
import { createBuildEntity } from '../src/factory/createBuildEntity';
import { SelectableComponent } from '../src/components/SelectableComponent';
import { isDescribable } from '../src/ui/describe';

// Aufbau: ein Regal im Ursprung, Kamera schaut von schräg oben darauf,
// der Mauszeiger steht in der Bildmitte – also genau auf dem Regal.
function setup() {
  const content = new Content();
  const world = new World(new THREE.Group());
  const input = new InputMap({ auswaehlen: ['Mouse0'], pause: ['Escape'] });
  const pointer = new Pointer();
  pointer.inside = true;
  const selection = new Selection();
  const interactor = new Interactor(world, input, pointer, selection, '#00ff00');
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 200);
  camera.position.set(0, 12, 10);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const regal = world.add(createBuildEntity(content.bau.get('wandregal_weiss'), { position: [0, 0, 0], drehung: 0 }, content));
  regal.object.updateMatrixWorld(true);
  const click = (code = 'Mouse0') => { input.setCode(code, true); interactor.update(camera); input.endFrame(); input.setCode(code, false); };
  return { content, world, input, pointer, selection, interactor, camera, regal, click };
}

describe('Interactor', () => {
  it('erkennt die Entity unter dem Zeiger und ihren Kontext', () => {
    const { interactor, camera, regal } = setup();
    interactor.update(camera);
    expect(interactor.hovered).toBe(regal);
    expect(interactor.getContext()).toBe('regal');
    expect(interactor.options().map((o) => o.text)).toEqual(['auswaehlen']);
  });

  it('meldet "nichts", wenn der Zeiger ins Leere zeigt', () => {
    const { interactor, camera, pointer } = setup();
    pointer.ndc.set(0.95, 0.95);
    interactor.update(camera);
    expect(interactor.hovered).toBeNull();
    expect(interactor.getContext()).toBe('nichts');
  });

  it('wählt per Klick aus und hebt die Auswahl per Klick ins Leere oder Esc wieder auf', () => {
    const { interactor, selection, pointer, regal, click } = setup();
    click();
    expect(selection.current).toBe(regal);
    expect(interactor.options()).toEqual([]); // schon ausgewählt: nichts mehr anzubieten

    pointer.ndc.set(0.95, 0.95);
    click();
    expect(selection.current).toBeNull();

    pointer.ndc.set(0, 0);
    click();
    expect(selection.current).toBe(regal);
    click('Escape');
    expect(selection.current).toBeNull();
  });

  it('hebt hervor und räumt beim Entfernen auf', () => {
    const { world, interactor, selection, regal, click } = setup();
    click();
    const mesh = regal.object.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    expect(mesh.material.emissiveIntensity).toBeGreaterThan(0);
    world.remove(regal);
    expect(interactor.hovered).toBeNull();
    expect(selection.current).toBeNull();
  });
});

describe('Info aus Komponenten', () => {
  it('sammelt Titel und Zeilen aus den Komponenten', () => {
    const { regal } = setup();
    const sel = regal.require(SelectableComponent);
    expect(sel.titel).toBe('Wandregal Weiß');
    // toLocaleString setzt ein geschütztes Leerzeichen (\u00a0) vor das €
    expect(sel.untertitel).toBe('Regal · 180\u00a0€');
    const rows = regal.all().filter(isDescribable).flatMap((c) => c.describe());
    expect(rows).toEqual([{ label: 'Regalplätze', value: '4' }]);
  });
});
