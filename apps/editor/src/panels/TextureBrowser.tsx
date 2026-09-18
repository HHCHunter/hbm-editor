/* eslint-disable jsx-a11y/interactive-supports-focus -- focus stays on the container, which points at the active item with aria-activedescendant */
import { useId, useMemo, useRef, useState } from 'react';
import type { TextureDTO } from '@hbm/protocol';
import { listTextures, textureUrl } from '../api/endpoints';
import { useAsync } from '../hooks/useAsync';
import { useEditor } from '../state/store';
import { showMaterial } from '../state/actions';
import { Button, PanelState, SearchField, Select } from '../ui';
import { BrowserSplit } from './BrowserSplit';

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
  const [failed, setFailed] = useState(false);
  const users = texture.materials.map((slot) => ({ slot, name: surfaces?.[slot]?.name ?? 'unnamed material' }));

  return (
    <section className="tex-detail bevel-in" aria-label={`Texture ${texture.name}`}>
      <div className="tex-detail-image checker">
        {failed ? (
          <PanelState variant="error" title="Couldn't decode this level" message="Try another mip level." />
        ) : (
          <img
            key={`${texture.id}:${level}`}
            src={textureUrl(sceneId, texture.id, level)}
            alt={`${texture.name}, level ${level}`}
            onError={() => setFailed(true)}
            onLoad={() => setFailed(false)}
          />
        )}
      </div>
      <div className="tex-detail-info">
        <h3 className="tex-title">{texture.name}</h3>
        <dl className="kv">
          <dt>Id</dt>
          <dd>{texture.id}</dd>
          <dt>Format</dt>
          <dd>{texture.format}</dd>
          <dt>Size</dt>
          <dd>
            {texture.width} × {texture.height}
          </dd>
          <dt>Flags</dt>
          <dd className="mono">0x{texture.flags.toString(16).toUpperCase()}</dd>
          {texture.faces && (
            <>
              <dt>Cube faces</dt>
              <dd>{texture.faces.join(', ')}</dd>
            </>
          )}
        </dl>
        <Select
          label="Mip level"
          value={level}
          options={texture.levels.map((l, i) => ({
            value: i,
            label: `${i}: ${l.width} × ${l.height}${l.size === 0 ? ' (empty)' : ''}`,
            disabled: l.size === 0,
          }))}
          onChange={(value) => {
            setFailed(false);
            setLevel(value);
          }}
        />
        <h4 className="group-hdr">Materials using it ({users.length})</h4>
        <ul className="tex-users">
          {users.map(({ slot, name }) => (
            <li key={slot}>
              <Button variant="link" onClick={() => showMaterial(slot)}>
                {slot}: {name}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function TextureBrowser() {
  const sceneId = useEditor((s) => s.scene?.id ?? null);
  const textures = useAsync(sceneId ? () => listTextures(sceneId) : null, [sceneId]);
  const [filter, setFilter] = useState('');
  const chosen = useEditor((s) => s.textureId);
  const setChosen = (id: number) =>
    useEditor.getState().update((s) => {
      s.textureId = id;
    });
  const gridRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (textures.value ?? []).filter((t) => !q || t.name.toLowerCase().includes(q) || String(t.id) === q);
  }, [textures.value, filter]);
  const texture = textures.value?.find((t) => t.id === chosen) ?? null;

  if (!sceneId) return <PanelState variant="empty" title="No scene open" message="Open a scene to browse its textures." />;

  const choose = (index: number) => {
    const t = shown[Math.max(0, Math.min(shown.length - 1, index))];
    if (!t) return;
    setChosen(t.id);
    document.getElementById(`${id}-${t.id}`)?.scrollIntoView({ block: 'nearest' });
  };

  /** Cells per row, measured from the laid-out grid. */
  const columns = () => {
    const cells = gridRef.current?.querySelectorAll<HTMLElement>('.tex-cell');
    if (!cells?.length) return 1;
    const top = cells[0]!.offsetTop;
    let n = 0;
    while (n < cells.length && cells[n]!.offsetTop === top) n++;
    return Math.max(1, n);
  };

  const at = shown.findIndex((t) => t.id === chosen);

  return (
    <div className="browser">
      <div className="browser-bar">
        <SearchField
          label="Filter textures"
          placeholder="Filter by name or id"
          value={filter}
          onChange={setFilter}
          count={textures.value ? `${shown.length} of ${textures.value.length} textures` : undefined}
        />
      </div>
      <BrowserSplit
        id="textures.detail"
        label="Resize the texture details"
        start={
          <>
            {textures.status === 'loading' && <PanelState variant="loading" title="Reading textures…" />}
            {textures.status === 'error' && <PanelState variant="error" title="Couldn't read this scene's textures" message={textures.error} />}
            {textures.value && (
              <div
                ref={gridRef}
                className="tex-grid bevel-in"
                role="listbox"
                aria-label="Textures"
                aria-orientation="horizontal"
                tabIndex={0}
                aria-activedescendant={chosen !== null && at >= 0 ? `${id}-${chosen}` : undefined}
                onKeyDown={(e) => {
                  const cols = columns();
                  if (e.key === 'ArrowRight') choose(at + 1);
                  else if (e.key === 'ArrowLeft') choose(at - 1);
                  else if (e.key === 'ArrowDown') choose(at < 0 ? 0 : at + cols);
                  else if (e.key === 'ArrowUp') choose(at - cols);
                  else if (e.key === 'Home') choose(0);
                  else if (e.key === 'End') choose(shown.length - 1);
                  else return;
                  e.preventDefault();
                }}
              >
                {!shown.length && (
                  <PanelState
                    variant="empty"
                    layout="inline"
                    title={`No textures match “${filter}”`}
                    action={{ label: 'Clear Filter', onClick: () => setFilter('') }}
                  />
                )}
                {shown.map((t) => {
                  const level = thumbLevel(t);
                  return (
                    // The grid owns focus and keyboard handling.
                    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                    <div
                      key={t.id}
                      id={`${id}-${t.id}`}
                      role="option"
                      aria-selected={t.id === chosen}
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
            )}
          </>
        }
        end={texture && <TextureDetail key={texture.id} sceneId={sceneId} texture={texture} />}
      />
    </div>
  );
}
