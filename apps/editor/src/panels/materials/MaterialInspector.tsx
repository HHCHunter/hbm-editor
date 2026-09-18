import type { MaterialDetailDTO, MaterialPropertyDTO, MatTreeDTO, TextureDTO } from '@hbm/protocol';
import { textureUrl } from '../../api/endpoints';
import { showTexture } from '../../state/actions';
import { Badge, Button, Section } from '../../ui';
import type { GraphSelection } from './MaterialGraph';
import { FIELD_LABELS, cssColour, formatValue, isColour, isSwitchOn, mainValue, textureRef, type GroupedMaterial } from './materialModel';

function PropertyTable({ properties, textures }: { properties: MaterialPropertyDTO[]; textures: ReadonlyMap<number, TextureDTO> }) {
  if (!properties.length) return <p className="mat-empty">No properties</p>;
  return (
    <table className="mat-props">
      <thead>
        <tr>
          <th scope="col">Property</th>
          <th scope="col">Kind</th>
          <th scope="col">Used</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {properties.map((p, i) => {
          const value = mainValue(p);
          const ref = p.kind === 'TEXT' ? textureRef(p) : null;
          const info = ref?.textureId != null ? textures.get(ref.textureId) : undefined;
          return (
            <tr key={`${p.kind}:${p.name}:${i}`} className={p.enabled ? undefined : 'is-off'}>
              <th scope="row" className="mono">
                {p.name || '(unnamed)'}
              </th>
              <td>{p.kind}</td>
              <td>{p.enabled ? 'Yes' : 'No: skipped by the game'}</td>
              <td>
                {ref ? (
                  info ? (
                    <Button variant="link" onClick={() => showTexture(info.id)}>
                      {info.name} (#{info.id})
                    </Button>
                  ) : ref.engineSlot !== null ? (
                    `Engine texture ${ref.engineSlot}, supplied at run time`
                  ) : (
                    'None'
                  )
                ) : p.kind === 'BOOL' ? (
                  isSwitchOn(p) ? 'On' : 'Off'
                ) : (
                  <span className="mat-value">
                    {isColour(p) && <span className="mat-swatch" style={{ background: cssColour(value) }} aria-hidden="true" />}
                    <span className="mono">{formatValue(value)}</span>
                  </span>
                )}
                {Object.entries(p.fields)
                  .filter(([tag]) => tag !== 'VALU' && tag !== 'TXID' && tag !== 'SPED')
                  .map(([tag, v]) => (
                    <span key={tag} className="mat-field">
                      {FIELD_LABELS[tag] ?? tag}: {formatValue(v)}
                    </span>
                  ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function treeText(node: MatTreeDTO, depth = 0): string {
  const value = node.type === 'list' ? '' : ` = ${formatValue(node.value)}`;
  const line = `${'  '.repeat(depth)}${node.tag}${value}`;
  return [line, ...(node.children ?? []).map((c) => treeText(c, depth + 1))].join('\n');
}

export interface MaterialInspectorProps {
  sceneId: string;
  material: MaterialDetailDTO;
  grouped: GroupedMaterial;
  textures: ReadonlyMap<number, TextureDTO>;
  selection: GraphSelection;
}

/** Everything about the node selected in the graph, then the material's raw data. */
export function MaterialInspector({ sceneId, material, grouped, textures, selection }: MaterialInspectorProps) {
  let body: React.ReactNode;
  let title: string;

  if (selection.startsWith('texture:')) {
    const name = selection.slice('texture:'.length);
    const feature = grouped.features.find((f) => f.textures.some((t) => t.name === name));
    const prop = feature?.textures.find((t) => t.name === name);
    const ref = prop ? textureRef(prop) : null;
    const info = ref?.textureId != null ? textures.get(ref.textureId) : undefined;
    title = `Texture: ${name}`;
    body = prop ? (
      <div className="mat-texture-card">
        {info && (
          <span className="mat-texture-large checker">
            <img src={textureUrl(sceneId, info.id, Math.max(0, info.levels.findIndex((l) => l.size > 0)))} alt={info.name} />
          </span>
        )}
        <dl className="kv">
          <dt>Feeds</dt>
          <dd>
            {feature!.spec.title} {feature!.on ? '' : '(off)'}
          </dd>
          <dt>Used</dt>
          <dd>{prop.enabled ? 'Yes' : 'No: skipped by the game'}</dd>
          <dt>Texture</dt>
          <dd>
            {info ? (
              <Button variant="link" onClick={() => showTexture(info.id)}>
                {info.name}
              </Button>
            ) : ref?.engineSlot != null ? (
              `Engine texture ${ref.engineSlot}: supplied by the game at run time, not stored in the scene`
            ) : (
              'None'
            )}
          </dd>
          {info && (
            <>
              <dt>Id</dt>
              <dd>{info.id}</dd>
              <dt>Format</dt>
              <dd>
                {info.format}, {info.width} × {info.height}
                {info.faces ? ', cube map' : ''}
              </dd>
            </>
          )}
          {Object.entries(prop.fields)
            .filter(([tag]) => tag !== 'TXID')
            .map(([tag, v]) => (
              <div key={tag} className="kv-row">
                <dt>{FIELD_LABELS[tag] ?? tag}</dt>
                <dd>{formatValue(v)}</dd>
              </div>
            ))}
        </dl>
      </div>
    ) : (
      <p className="mat-empty">This texture isn’t part of the material.</p>
    );
  } else if (selection.startsWith('feature:')) {
    const feature = grouped.features.find((f) => `feature:${f.spec.key}` === selection);
    title = feature ? `${feature.spec.title}${feature.on ? '' : ' (off)'}` : 'Feature';
    body = feature ? (
      <>
        <p className="mat-description">{feature.spec.description}</p>
        {feature.switches.length > 0 && (
          <p className="mat-description">
            Switched {feature.on ? 'on' : 'off'} by <span className="mono">{feature.switches[0]!.name}</span>.
          </p>
        )}
        <PropertyTable properties={[...feature.switches, ...feature.textures, ...feature.values]} textures={textures} />
      </>
    ) : null;
  } else if (selection === 'renderState') {
    title = 'Render state';
    body = grouped.renderState ? (
      <>
        <p className="mat-description">How the result is combined with what’s already drawn: blending, alpha testing, culling, fog and depth.</p>
        <PropertyTable properties={[grouped.renderState]} textures={textures} />
      </>
    ) : (
      <p className="mat-empty">No render state: the game’s defaults apply.</p>
    );
  } else if (selection === 'output') {
    const s = material.surface;
    title = 'Surface';
    body = (
      <>
        <p className="mat-description">How this editor draws the material in the scene view.</p>
        <dl className="kv">
          <dt>Transparency</dt>
          <dd>{s.alpha === 'opaque' ? 'Opaque' : s.alpha === 'mask' ? `Cut out below ${Math.round((s.alphaCutoff ?? 0.5) * 255)}` : `Blended at ${Math.round(s.opacity * 100)}%`}</dd>
          <dt>Blending</dt>
          <dd>{s.additive ? 'Additive (brightens what’s behind)' : 'Normal'}</dd>
          <dt>Sides</dt>
          <dd>{s.doubleSided ? 'Both' : 'Front only'}</dd>
          <dt>Drawn</dt>
          <dd>{s.hiddenReason ? `No: marks ${s.hiddenReason} geometry` : 'Yes'}</dd>
        </dl>
      </>
    );
  } else if (selection === 'other') {
    title = 'Other properties';
    body = (
      <>
        <p className="mat-description">Properties this editor doesn’t group into a feature yet.</p>
        <PropertyTable properties={grouped.other} textures={textures} />
      </>
    );
  } else {
    title = `Shader class: ${material.className}`;
    body = material.class ? (
      <>
        <p className="mat-description">
          The class decides which shader passes draw the material. Its variants suit different kinds of mesh (rigid, skinned, morphing).
        </p>
        <table className="mat-props">
          <thead>
            <tr>
              <th scope="col">Variant</th>
              <th scope="col">Pass</th>
              <th scope="col">Effect</th>
              <th scope="col">Technique</th>
            </tr>
          </thead>
          <tbody>
            {material.class.subclasses.flatMap((sub, si) =>
              sub.layers.map((layer, li) => (
                <tr key={`${si}:${li}`}>
                  {li === 0 && (
                    <th scope="row" rowSpan={sub.layers.length}>
                      {sub.name || '(unnamed)'}
                      <span className="mat-field">{[sub.objectType, sub.storage].filter(Boolean).join(' · ')}</span>
                    </th>
                  )}
                  <td>{layer.name}</td>
                  <td className="mono">{layer.path}</td>
                  <td className="mono">{layer.technique}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </>
    ) : (
      <p className="mat-empty">The class isn’t in this scene’s material file.</p>
    );
  }

  return (
    <div className="mat-inspector">
      <Section title={title} persistKey={undefined}>
        <div className="mat-inspector-body">{body}</div>
      </Section>
      <Section title="Raw data" meta="as stored in the .MAT" tone="raw" defaultOpen={false} persistKey="material-raw">
        <div className="mat-inspector-body">
          <h5 className="mat-raw-title">Material</h5>
          <pre className="mat-raw">{treeText(material.raw)}</pre>
          {material.classRaw && (
            <>
              <h5 className="mat-raw-title">Class</h5>
              <pre className="mat-raw">{treeText(material.classRaw)}</pre>
            </>
          )}
        </div>
      </Section>
      <Badge tone="info">Read only: editing arrives with mod support</Badge>
    </div>
  );
}
