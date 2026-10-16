import * as THREE from 'three';

// Material für Produkte: Grundfarbe aus der Palette (erster UV-Satz "UV_Palette"),
// darüber das Etikett aus Produkt_Etiketten.png (zweiter UV-Satz "UV_Icons").
// Wo das Etikett durchsichtig ist, bleibt die Palettenfarbe stehen – so wie in Blender.
//
// Als eigene Klasse, damit auch Kopien (z. B. für die Hervorhebung) das Etikett behalten.

export class LabelMaterial extends THREE.MeshStandardMaterial {
  labelMap: THREE.Texture | null = null;

  constructor(params?: THREE.MeshStandardMaterialParameters & { labelMap?: THREE.Texture | null }) {
    const { labelMap = null, ...rest } = params ?? {};
    super(rest);
    this.labelMap = labelMap;
    this.setup();
  }

  override copy(source: LabelMaterial): this {
    super.copy(source);
    this.labelMap = source.labelMap;
    this.setup();
    return this;
  }

  private setup(): void {
    // USE_UV1 sorgt dafür, dass three.js das Attribut uv1 (zweiter UV-Satz) im Vertex-Shader bereitstellt.
    // Bis zum Fragment-Shader reichen wir es über ein eigenes Varying durch.
    this.defines = { ...this.defines, USE_UV1: '' };
    this.onBeforeCompile = (shader) => {
      shader.uniforms.labelMap = { value: this.labelMap };
      shader.vertexShader = shader.vertexShader
        .replace('#include <uv_pars_vertex>', '#include <uv_pars_vertex>\nvarying vec2 vLabelUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvLabelUv = uv1;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D labelMap;\nvarying vec2 vLabelUv;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          vec4 labelColor = texture2D( labelMap, vLabelUv );
          diffuseColor.rgb = mix( diffuseColor.rgb, labelColor.rgb, labelColor.a );`,
        );
    };
  }

  override customProgramCacheKey(): string {
    return 'label-material';
  }
}
