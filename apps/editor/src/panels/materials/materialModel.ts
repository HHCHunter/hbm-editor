import type { MaterialPropertyDTO, MatValueDTO } from '@hbm/protocol';

/**
 * How a material's properties group into features. The property names are the game's own, read
 * from the .MAT files; the titles are plain-English labels for them. A feature with a switch is on
 * when that BOOL is enabled and set; one without is on when any of its properties is enabled.
 */
export interface FeatureSpec {
  key: string;
  title: string;
  description: string;
  /** The BOOL property that turns the feature on, e.g. "BumpEnabled". */
  switches?: readonly string[];
  /** Property names that belong to it. */
  members: readonly string[];
  /** Property kinds that belong to it whatever their name (SCRL, SPRI). */
  kinds?: readonly string[];
}

export const FEATURES: readonly FeatureSpec[] = [
  {
    key: 'Base',
    title: 'Base colour',
    description: 'The colour texture, tinted by the diffuse colour.',
    members: ['mapDiffuse', 'v4DiffuseColor'],
  },
  {
    key: 'Bump',
    title: 'Normal map',
    description: 'Surface detail from a normal map, scaled by the bump scale.',
    switches: ['BumpEnabled'],
    members: ['mapNormal', 'v4BumpScale'],
  },
  {
    key: 'BumpDetail',
    title: 'Detail normal map',
    description: 'A second, finer normal map tiled over the first.',
    switches: ['BumpDetailEnabled'],
    members: ['mapNormalDetail', 'v4BumpDetailScale', 'vBumpDetailTileFactor'],
  },
  {
    key: 'Parallax',
    title: 'Parallax',
    description: 'Shifts the texture by a height map so flat surfaces look deep.',
    switches: ['ParallaxEnabled'],
    members: ['mapParallax', 'vParallaxScale', 'vParallaxBias'],
  },
  {
    key: 'Specular',
    title: 'Specular',
    description: 'Shiny highlights: where (mask), what colour, how tight (power) and how strong (level).',
    switches: ['SpecularEnabled'],
    members: ['mapSpecularMask', 'v4SpecularColor', 'v4SpecularPower', 'vSpecularLevel'],
  },
  {
    key: 'Reflection',
    title: 'Reflection',
    description: 'Reflects an environment map, masked and faded by angle.',
    switches: ['ReflectionEnabled'],
    members: ['mapEnvironment', 'mapReflectionMask', 'mapReflectionFallOff', 'v4ReflectionColor', 'vReflectionLevel'],
  },
  {
    key: 'Illumination',
    title: 'Self-illumination',
    description: 'Parts that glow regardless of lighting, such as lamps and screens.',
    switches: ['IlluminationEnabled'],
    members: ['mapIllumination', 'v4IlluminationColor'],
  },
  {
    key: 'RimLighting',
    title: 'Rim light',
    description: 'A glow along the edges facing away from the viewer.',
    switches: ['RimLightingEnabled'],
    members: ['v4RimLightColor', 'fRimLightStrength', 'fRimLightPower'],
  },
  {
    key: 'SubSurface',
    title: 'Subsurface',
    description: 'Light passing through thin surfaces such as skin and cloth.',
    switches: ['SubSurfaceEnabled'],
    members: ['mapTranslucency', 'v4SubSurfaceColor', 'fSubSurfaceTransparency'],
  },
  {
    key: 'Scroll',
    title: 'UV scroll',
    description: 'Moves the texture over time, as on water or screens.',
    switches: ['ScrollEnabled'],
    members: [],
    kinds: ['SCRL'],
  },
  {
    key: 'AlphaFade',
    title: 'Alpha fade',
    description: 'Fades the surface out by distance and viewing angle.',
    switches: ['AlphaFadeEnabled'],
    members: ['gm_vAlphaFadeDistScaleOffset', 'gm_vAlphaFadeAngleScaleOffset'],
  },
  {
    key: 'Wobble',
    title: 'Wobble',
    description: 'Moves vertices and texture in a wave, as on flags and plants.',
    switches: ['WobbleEnabled'],
    members: ['fWobbleUSpeed', 'fWobbleVSpeed', 'fWobblePosAmplitude', 'fWobbleNorAmplitude', 'fWobbleWaveLength'],
  },
  {
    key: 'Reflection2D',
    title: '2D reflection',
    description: 'Reflects the rendered scene, as on water and floors.',
    switches: ['Reflection2DEnabled'],
    members: ['gm_mapReflection2DMask', 'gm_vReflection2DColor', 'gm_vReflection2DScale'],
  },
  {
    key: 'Refraction2D',
    title: '2D refraction',
    description: 'Bends the scene behind the surface, as through water and glass.',
    switches: ['Refraction2DEnabled'],
    members: ['gm_mapRefraction2DMask', 'gm_vRefraction2DColor', 'gm_vRefraction2DScale'],
  },
  {
    key: 'Fresnel',
    title: 'Fresnel',
    description: 'How reflection and refraction change with viewing angle.',
    members: ['gm_vFresnelMin', 'gm_vFresnelMax', 'gm_vFresnelPow'],
  },
  {
    key: 'Mirror',
    title: 'Mirror',
    description: 'A real-time mirror, with an optional mask and bump.',
    switches: ['MirrorEnabled', 'MirrorMaskEnabled'],
    members: ['mapMirrorColor', 'mapMirrorMask', 'gm_vMirrorBumpScale'],
  },
  {
    key: 'Aniso',
    title: 'Anisotropic',
    description: 'Stretched highlights, as on brushed metal and hair.',
    members: ['anisoMap', 'v4AnisoColor'],
  },
  {
    key: 'ReflMap',
    title: 'Reflection map',
    description: 'The older material class’s reflection switch.',
    switches: ['ReflMapEnabled'],
    members: [],
  },
  {
    key: 'ZBufferWrite',
    title: 'Depth write',
    description: 'Whether the surface hides what is drawn behind it later.',
    switches: ['ZBufferWrite'],
    members: [],
  },
  {
    key: 'Scatter',
    title: 'Scatter',
    description: 'Size of the billboards scattered over the surface, such as grass.',
    members: ['ScatterWidth', 'ScatterHeight', 'ScatterRandomHeight'],
  },
  {
    key: 'Sprite',
    title: 'Sprites',
    description: 'Particle and sprite settings.',
    members: [],
    kinds: ['SPRI'],
  },
];

/** A feature's title from the server's short name ("BumpDetail" for BumpDetailEnabled). */
export function featureTitle(name: string): string {
  return FEATURES.find((f) => f.switches?.includes(`${name}Enabled`) || f.switches?.includes(name))?.title ?? name;
}

export interface Feature {
  spec: FeatureSpec;
  /** Whether the game draws it. */
  on: boolean;
  switches: MaterialPropertyDTO[];
  /** Texture properties (TEXT). */
  textures: MaterialPropertyDTO[];
  /** Colours, numbers and other values. */
  values: MaterialPropertyDTO[];
}

export interface GroupedMaterial {
  features: Feature[];
  renderState: MaterialPropertyDTO | null;
  /** Properties no feature claims, shown as-is. */
  other: MaterialPropertyDTO[];
}

export const isSwitchOn = (p: MaterialPropertyDTO) => p.enabled && Array.isArray(p.fields.VALU) && p.fields.VALU[0] !== 0;

/** Group properties into the features the material uses, in a fixed order. */
export function groupMaterial(properties: readonly MaterialPropertyDTO[]): GroupedMaterial {
  const claimed = new Set<MaterialPropertyDTO>();
  const features: Feature[] = [];
  for (const spec of FEATURES) {
    const switches = properties.filter((p) => p.kind === 'BOOL' && spec.switches?.includes(p.name));
    const members = properties.filter(
      (p) => (p.kind !== 'BOOL' || !spec.switches?.includes(p.name)) && (spec.members.includes(p.name) || spec.kinds?.includes(p.kind)),
    );
    if (!switches.length && !members.length) continue;
    for (const p of [...switches, ...members]) claimed.add(p);
    const on = switches.length ? isSwitchOn(switches[0]!) : members.some((p) => p.enabled);
    features.push({
      spec,
      on,
      switches,
      textures: members.filter((p) => p.kind === 'TEXT'),
      values: members.filter((p) => p.kind !== 'TEXT'),
    });
  }
  const renderState = properties.find((p) => p.kind === 'RSTA') ?? null;
  if (renderState) claimed.add(renderState);
  return { features, renderState, other: properties.filter((p) => !claimed.has(p)) };
}

// ---------------------------------------------------------------- values

/** What a TEXT property points at. */
export interface TextureRef {
  /** A texture in the scene's .TEX, by id. */
  textureId: number | null;
  /** A texture the engine supplies at run time (sign bit set): (TXID & 0x7FFFFFFF) + 0x22. */
  engineSlot: number | null;
}

export function textureRef(p: MaterialPropertyDTO): TextureRef {
  const txid = Array.isArray(p.fields.TXID) ? (p.fields.TXID[0] ?? 0) : 0;
  if (txid >= 0x80000000) return { textureId: null, engineSlot: (txid & 0x7fffffff) + 0x22 };
  return { textureId: txid || null, engineSlot: null };
}

/** The main value of a property: VALU, or SPED for a scroll. */
export function mainValue(p: MaterialPropertyDTO): MatValueDTO {
  return p.fields.VALU ?? p.fields.SPED ?? null;
}

const trim = (n: number) => String(Number(n.toPrecision(4)));

export function formatValue(value: MatValueDTO): string {
  if (value === null) return '—';
  if (typeof value === 'string') return value || '(empty)';
  return value.map(trim).join(', ');
}

/** Whether a value reads as a colour: a COLO property, three or four components. */
export const isColour = (p: MaterialPropertyDTO) => p.kind === 'COLO' && Array.isArray(p.fields.VALU) && p.fields.VALU.length >= 3;

/** A CSS colour for an RGBA float value, ignoring alpha. */
export function cssColour(value: MatValueDTO): string {
  if (!Array.isArray(value)) return 'transparent';
  const c = (i: number) => Math.round(Math.max(0, Math.min(1, value[i] ?? 0)) * 255);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

/** Labels for render state and texture fields, whose meanings are known from the engine. */
export const FIELD_LABELS: Record<string, string> = {
  BENA: 'Blending',
  BMOD: 'Blend mode',
  OPAC: 'Opacity',
  ATST: 'Alpha test',
  AREF: 'Alpha reference',
  FENA: 'Fog',
  CULL: 'Culling',
  ZBIA: 'Depth bias',
  ZOFF: 'Depth offset',
  TXID: 'Texture',
  TILU: 'Tiling U',
  TILV: 'Tiling V',
  TILW: 'Tiling W',
  VALU: 'Value',
  SPED: 'Speed',
};

/** Render state in plain words, for the graph's render-state node. */
export function describeRenderState(p: MaterialPropertyDTO | null): string[] {
  if (!p) return ['Default'];
  if (!p.enabled) return ['Disabled: engine defaults'];
  const int = (tag: string) => (Array.isArray(p.fields[tag]) ? (p.fields[tag] as number[])[0] : undefined);
  const text = (tag: string) => (typeof p.fields[tag] === 'string' ? (p.fields[tag] as string).trim() : '');
  const lines: string[] = [];
  if (int('BENA')) {
    const opacity = Array.isArray(p.fields.OPAC) ? p.fields.OPAC[0] : undefined;
    lines.push(`Blended: ${text('BMOD') || 'default mode'}${opacity !== undefined && opacity !== 1 ? `, ${Math.round(opacity * 100)}%` : ''}`);
  } else lines.push('Opaque');
  if (int('ATST')) lines.push(`Alpha test at ${int('AREF') ?? '?'}`);
  const cull = text('CULL');
  if (cull) lines.push(cull.toLowerCase() === 'twosided' ? 'Two-sided' : `Culling: ${cull}`);
  if (int('FENA') === 0) lines.push('No fog');
  if (int('ZBIA')) lines.push(`Depth bias ${int('ZBIA')}`);
  return lines;
}
