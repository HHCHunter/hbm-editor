import { useMemo, useState } from 'react';
import type { TextureDTO } from '@hbm/protocol';
import { listTextures, textureUrl } from '../api/endpoints';
import { useAsync } from '../hooks/useAsync';
import { useEditor } from '../state/store';

const THUMB_EDGE = 128;

/** The smallest mip level at least as big as a thumbnail, so the grid doesn't fetch full textures. */
function thumbLevel(t: TextureDTO): number {
  let best = t.levels.findIndex((l) => l.size > 0);
  t.levels.forEach((l, i) => {
    if (l.size > 0 && Math.max(l.width, l.height) >= THUMB_EDGE) best = i;
  });
  return best;
}

function TextureDetail({ sceneId, texture }: { sceneId: string; texture: TextureDTO }) {
  const surfaces = useEditor((s) => s.scene?.surfaces);
  const [level, setLevel] = useState(() => Math.max(0, texture.levels.findIndex((l) => l.size > 0)));
  const users = texture.materials.map((slot) => `${slot}: ${surfaces?.[slot]?.name ?? '?'}`);

  return (
    <div className="tex-detail bevel-in">
      <div className="tex-detail-image checker">
        <img key={`${texture.id}:${level}`} src={textureUrl(sceneId, texture.id, level)} alt={texture.name} />
      </div>
      <div className="tex-detail-info">
        <div className="tex-title">{texture.name}</div>
        <table className="kv">
          <tbody>
            <tr><td>Id</td><td>{texture.id}</td></tr>
            <tr><td>Format</td><td>{texture.format}</td></tr>
            <tr><td>Size</td><td>{texture.width} × {texture.height}</td></tr>
            <tr><td>Flags</td><td>0x{texture.flags.toString(16).toUpperCase()}</td></tr>
            {texture.faces && <tr><td>Cube faces</td><td>{texture.faces.join(', ')}</td></tr>}
            <tr>
              <td>Level</td>
              <td>
                <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                  {texture.levels.map((l, i) => (
                    <option key={i} value={i} disabled={l.size === 0}>
                      {i}: {l.width} × {l.height}{l.size === 0 ? ' (empty)' : ''}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="group-hdr">Materials ({users.length})</div>
        <div className="tex-users">
          {users.map((name, i) => (
            <div key={i}>{name}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TextureBrowser() {
  const sceneId = useEditor((s) => s.scene?.id ?? null);
  const textures = useAsync(sceneId ? () => listTextures(sceneId) : null, [sceneId]);
  const [filter, setFilter] = useState('');
  const [chosen, setChosen] = useState<number | null>(null);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (textures.value ?? []).filter((t) => !q || t.name.toLowerCase().includes(q) || String(t.id) === q);
  }, [textures.value, filter]);
  const texture = textures.value?.find((t) => t.id === chosen) ?? null;

  if (!sceneId) return <div className="panel-empty">Open a scene to browse its textures.</div>;

  return (
    <div className="browser">
      <div className="browser-bar">
        <input className="sunken-input" value={filter} placeholder="name or id" onChange={(e) => setFilter(e.target.value)} />
        <span className="browser-count">
          {textures.status === 'loading' ? 'Reading…' : `${shown.length} of ${textures.value?.length ?? 0} textures`}
        </span>
        {textures.status === 'error' && <span className="error">{textures.error}</span>}
      </div>
      <div className="browser-body">
        <div className="tex-grid bevel-in">
          {shown.map((t) => {
            const level = thumbLevel(t);
            return (
              <div
                key={t.id}
                className={`tex-cell${t.id === chosen ? ' selected' : ''}`}
                title={`${t.id} · ${t.name} · ${t.format} ${t.width}×${t.height}`}
                data-texture={t.id}
                onClick={() => setChosen(t.id)}
              >
                <div className="tex-thumb checker">
                  {level >= 0 && <img loading="lazy" src={textureUrl(sceneId, t.id, level)} alt="" />}
                </div>
                <div className="tex-name">{t.name.split('/').pop()}</div>
              </div>
            );
          })}
        </div>
        {texture && <TextureDetail key={texture.id} sceneId={sceneId} texture={texture} />}
      </div>
    </div>
  );
}
