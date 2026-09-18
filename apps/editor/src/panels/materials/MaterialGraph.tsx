import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Box, Image as ImageIcon, Layers, SlidersHorizontal } from 'lucide-react';
import type { MaterialDetailDTO, MaterialPropertyDTO, TextureDTO } from '@hbm/protocol';
import { textureUrl } from '../../api/endpoints';
import { Badge } from '../../ui';
import { cssColour, describeRenderState, formatValue, isColour, mainValue, textureRef, type Feature, type GroupedMaterial } from './materialModel';

export type GraphSelection = 'shader' | 'renderState' | 'output' | 'other' | `feature:${string}` | `texture:${string}`;

const THUMB_EDGE = 64;

function thumbLevel(t: TextureDTO): number {
  let best = t.levels.findIndex((l) => l.size > 0);
  t.levels.forEach((l, i) => {
    if (l.size > 0 && Math.max(l.width, l.height) >= THUMB_EDGE) best = i;
  });
  return best;
}

interface Edge {
  from: string;
  to: string;
  live: boolean;
}

interface Path {
  d: string;
  live: boolean;
}

function TextureNode({
  sceneId,
  prop,
  feature,
  textures,
  selected,
  onSelect,
}: {
  sceneId: string;
  prop: MaterialPropertyDTO;
  feature: Feature;
  textures: ReadonlyMap<number, TextureDTO>;
  selected: boolean;
  onSelect: () => void;
}) {
  const ref = textureRef(prop);
  const info = ref.textureId !== null ? textures.get(ref.textureId) : undefined;
  const live = prop.enabled && feature.on && (ref.textureId !== null || ref.engineSlot !== null);
  const level = info ? thumbLevel(info) : -1;
  const shortName = info?.name.split('/').pop();
  return (
    <button
      type="button"
      className={`mat-node mat-texture${live ? '' : ' is-off'}${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      aria-label={`Texture ${prop.name}: ${info ? info.name : ref.engineSlot !== null ? `engine texture ${ref.engineSlot}` : 'none'}${live ? '' : ', not used'}, feeds ${feature.spec.title}`}
      onClick={onSelect}
    >
      <span className="mat-texture-thumb checker" aria-hidden="true">
        {info && level >= 0 ? <img src={textureUrl(sceneId, info.id, level)} alt="" loading="lazy" /> : <ImageIcon className="ui-icon" />}
      </span>
      <span className="mat-node-text">
        <span className="mat-node-title">{prop.name}</span>
        <span className="mat-node-sub">
          {info ? shortName : ref.engineSlot !== null ? `Engine texture ${ref.engineSlot}` : 'No texture'}
        </span>
      </span>
      <span className="mat-socket mat-socket--out" data-out={`texture:${prop.name}`} aria-hidden="true" />
    </button>
  );
}

function ValueChips({ values }: { values: MaterialPropertyDTO[] }) {
  const shown = values.filter((v) => v.kind !== 'BOOL').slice(0, 3);
  return (
    <span className="mat-chips">
      {shown.map((v) => {
        const value = mainValue(v);
        return (
          <span key={`${v.kind}:${v.name}`} className={`mat-chip${v.enabled ? '' : ' is-off'}`} title={`${v.name}: ${formatValue(value)}`}>
            {isColour(v) && <span className="mat-swatch" style={{ background: cssColour(value) }} aria-hidden="true" />}
            {!isColour(v) && formatValue(value)}
          </span>
        );
      })}
    </span>
  );
}

export interface MaterialGraphProps {
  sceneId: string;
  material: MaterialDetailDTO;
  grouped: GroupedMaterial;
  textures: ReadonlyMap<number, TextureDTO>;
  selection: GraphSelection;
  onSelect: (selection: GraphSelection) => void;
}

/**
 * The material as a fixed graph: its textures feed the features of its shader class, whose result
 * passes through the render state to the screen. The wiring is the shader's own; only values and
 * textures differ between materials.
 */
export function MaterialGraph({ sceneId, material, grouped, textures, selection, onSelect }: MaterialGraphProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<Path[]>([]);

  const edges: Edge[] = [
    ...grouped.features.flatMap((f) =>
      f.textures.map((t) => {
        const ref = textureRef(t);
        return { from: `texture:${t.name}`, to: `texture:${t.name}`, live: f.on && t.enabled && (ref.textureId !== null || ref.engineSlot !== null) };
      }),
    ),
    { from: 'shader', to: 'shader', live: true },
    { from: 'renderState', to: 'renderState', live: true },
  ];

  // Wires are drawn between the sockets once the nodes are laid out, and again when they move.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const box = content.getBoundingClientRect();
      const centre = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
      };
      const next: Path[] = [];
      for (const edge of edges) {
        const out = content.querySelector(`[data-out="${edge.from}"]`);
        const into = content.querySelector(`[data-in="${edge.to}"]`);
        if (!out || !into) continue;
        const a = centre(out);
        const b = centre(into);
        const bend = Math.max(24, (b.x - a.x) / 2);
        next.push({ d: `M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`, live: edge.live });
      }
      setPaths(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
    // Edges follow the material.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, grouped]);

  const renderLines = describeRenderState(grouped.renderState);
  const surface = material.surface;
  const textured = grouped.features.flatMap((f) => f.textures.map((t) => ({ feature: f, prop: t })));
  const subclassCount = material.class?.subclasses.length ?? 0;

  return (
    <div className="mat-graph" role="group" aria-label="Material graph">
      <div className="mat-graph-content" ref={contentRef}>
        <svg className="mat-graph-edges" aria-hidden="true">
          {paths.map((p, i) => (
            <path key={i} d={p.d} className={p.live ? 'is-live' : 'is-off'} />
          ))}
        </svg>

        <div className="mat-col mat-col--textures">
          <h4 className="mat-col-title">Textures</h4>
          {textured.length ? (
            textured.map(({ feature, prop }) => (
              <TextureNode
                key={prop.name}
                sceneId={sceneId}
                prop={prop}
                feature={feature}
                textures={textures}
                selected={selection === `texture:${prop.name}`}
                onSelect={() => onSelect(`texture:${prop.name}`)}
              />
            ))
          ) : (
            <p className="mat-empty">No textures</p>
          )}
        </div>

        <div className="mat-col mat-col--shader">
          <h4 className="mat-col-title">Shader</h4>
          <div className={`mat-node mat-shader${selection === 'shader' ? ' is-selected' : ''}`}>
            <button type="button" className="mat-shader-head" aria-pressed={selection === 'shader'} onClick={() => onSelect('shader')}>
              <Layers className="ui-icon" aria-hidden="true" />
              <span className="mat-node-title">{material.className}</span>
              <span className="mat-node-sub">{subclassCount ? `${subclassCount} variant(s)` : 'Shader class'}</span>
            </button>
            {grouped.features.map((feature) => {
              const key = `feature:${feature.spec.key}` as const;
              return (
                <div key={feature.spec.key} className={`mat-feature${feature.on ? '' : ' is-off'}${selection === key ? ' is-selected' : ''}`}>
                  <button type="button" className="mat-feature-head" aria-pressed={selection === key} onClick={() => onSelect(key)}>
                    <span className="mat-feature-title">{feature.spec.title}</span>
                    <Badge tone={feature.on ? 'success' : 'neutral'}>{feature.on ? 'On' : 'Off'}</Badge>
                    <ValueChips values={feature.values} />
                  </button>
                  {feature.textures.map((t) => (
                    <div key={t.name} className="mat-feature-input">
                      <span className="mat-socket mat-socket--in" data-in={`texture:${t.name}`} aria-hidden="true" />
                      {t.name}
                    </div>
                  ))}
                </div>
              );
            })}
            {grouped.other.length > 0 && (
              <div className={`mat-feature${selection === 'other' ? ' is-selected' : ''}`}>
                <button type="button" className="mat-feature-head" aria-pressed={selection === 'other'} onClick={() => onSelect('other')}>
                  <span className="mat-feature-title">Other</span>
                  <Badge>{grouped.other.length}</Badge>
                </button>
              </div>
            )}
            <span className="mat-socket mat-socket--out mat-socket--node" data-out="shader" aria-hidden="true" />
          </div>
        </div>

        <div className="mat-col mat-col--out">
          <h4 className="mat-col-title">Output</h4>
          <button
            type="button"
            className={`mat-node mat-rsta${selection === 'renderState' ? ' is-selected' : ''}`}
            aria-pressed={selection === 'renderState'}
            onClick={() => onSelect('renderState')}
          >
            <span className="mat-socket mat-socket--in" data-in="shader" aria-hidden="true" />
            <SlidersHorizontal className="ui-icon" aria-hidden="true" />
            <span className="mat-node-text">
              <span className="mat-node-title">Render state</span>
              {renderLines.map((line) => (
                <span key={line} className="mat-node-sub">
                  {line}
                </span>
              ))}
            </span>
            <span className="mat-socket mat-socket--out" data-out="renderState" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`mat-node mat-output${selection === 'output' ? ' is-selected' : ''}`}
            aria-pressed={selection === 'output'}
            onClick={() => onSelect('output')}
          >
            <span className="mat-socket mat-socket--in" data-in="renderState" aria-hidden="true" />
            <Box className="ui-icon" aria-hidden="true" />
            <span className="mat-node-text">
              <span className="mat-node-title">
                Surface <ArrowRight className="ui-icon mat-inline-icon" aria-hidden="true" />
              </span>
              <span className="mat-node-sub">
                {surface.hiddenReason ? `Not drawn: ${surface.hiddenReason}` : `${material.users.length} object(s)`}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
