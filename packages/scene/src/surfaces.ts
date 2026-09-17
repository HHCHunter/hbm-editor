import { colorProperty, renderState, textureStages, type MatFile, type MatMaterial } from '@hbm/formats';

// How a material shades a surface, for a viewer. The fields come from the .MAT (mat.md); choosing
// one colour texture and approximating additive blending are display decisions, not engine ones.

export type AlphaMode = 'opaque' | 'mask' | 'blend';
export type HiddenReason = 'placeholder' | 'collision' | 'bounds' | 'shadow' | 'helper';

export interface Surface {
  slot: number;
  name: string | null;
  className: string;
  /** The .TEX id shown as the colour map, or null. */
  diffuseTextureId: number | null;
  /** v4DiffuseColor, which multiplies the texture; white when the material has none. */
  baseColor: [number, number, number, number];
  alpha: AlphaMode;
  /** AREF / 255, only when alpha testing is on (AREF is 254 on materials that don't test). */
  alphaCutoff: number | null;
  opacity: number;
  /** BMOD ADD or ADD_BEFORE_TRANS. */
  additive: boolean;
  doubleSided: boolean;
  /** Why the material marks geometry that isn't a visible surface, judged from its name and blend mode. */
  hiddenReason: HiddenReason | null;
}

/** Stage names shown as colour, most preferred first. */
const COLOUR_STAGES = ['mapDiffuse', 'mapDiffuse1', 'mapIllumination'];
/** Stages that are never colour; showing one as albedo paints a normal map onto the model. */
const NON_COLOUR_STAGES = new Set([
  'mapNormal',
  'mapParallax',
  'mapSpecularMask',
  'mapReflectionMask',
  'mapReflectionFallOff',
  'mapEnvironment',
  'mapTranslucency',
]);

/** SPrimObject.lDrawMode bit set on geometry the engine doesn't draw as an ordinary surface. */
export const DRAW_MODE_NOT_A_SURFACE = 0x00800000;

export function describeSurface(mat: MatFile, material: MatMaterial): Surface {
  const live = textureStages(mat, material).filter((s) => s.enabled && s.textureId !== null);
  const preferred = COLOUR_STAGES.map((name) => live.find((s) => s.name === name)).find(Boolean);
  const fallback = live.find((s) => !NON_COLOUR_STAGES.has(s.name ?? ''));
  const diffuseTextureId = (preferred ?? fallback)?.textureId ?? null;

  const state = renderState(mat, material);
  const blendMode = (state?.blendMode ?? '').trim().toUpperCase();
  const color = colorProperty(mat, material, 'v4DiffuseColor');

  let alpha: AlphaMode = 'opaque';
  let alphaCutoff: number | null = null;
  if (state?.alphaTest) {
    alpha = 'mask';
    alphaCutoff = state.alphaRef !== null ? state.alphaRef / 255 : 0.5;
  } else if (state?.blendEnabled) {
    alpha = 'blend';
  }

  const name = material.name;
  const lower = (name ?? '').trim().toLowerCase();
  let hiddenReason: HiddenReason | null = null;
  if (lower === 'bad') hiddenReason = 'placeholder';
  else if (lower.startsWith('_glacier/')) {
    if (lower.includes('collision') || lower.includes('worldcoli')) hiddenReason = 'collision';
    else if (lower.includes('bound') || lower.includes('zone')) hiddenReason = 'bounds';
    else if (lower.includes('shadow')) hiddenReason = 'shadow';
    else hiddenReason = 'helper';
  } else if (blendMode === 'SHADOW' || blendMode === 'STATICSHADOW') {
    hiddenReason = 'shadow';
  }

  return {
    slot: material.slot,
    name,
    className: material.className,
    diffuseTextureId,
    baseColor: color ? [color[0]!, color[1]!, color[2]!, color[3]!] : [1, 1, 1, 1],
    alpha,
    alphaCutoff,
    opacity: state?.opacity ?? 1,
    additive: blendMode === 'ADD' || blendMode === 'ADD_BEFORE_TRANS',
    doubleSided: (state?.cull ?? '').trim().toLowerCase() === 'twosided',
    hiddenReason,
  };
}

/**
 * Why one part isn't visible content, or null. The material's own reason wins; otherwise the draw
 * mode bit marks collision, but only on untextured materials, because textured car parts carry it too.
 */
export function partHiddenReason(surface: Surface, drawMode: number): HiddenReason | null {
  if (surface.hiddenReason) return surface.hiddenReason;
  if (drawMode & DRAW_MODE_NOT_A_SURFACE && surface.diffuseTextureId === null) return 'collision';
  return null;
}
