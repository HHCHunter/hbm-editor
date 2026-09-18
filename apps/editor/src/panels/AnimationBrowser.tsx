import { useMemo, useState } from 'react';
import type { AnimationClipDTO, SceneAnimationsDTO } from '@hbm/protocol';
import { getSceneAnimations } from '../api/endpoints';
import { useAsync } from '../hooks/useAsync';
import { useEditor } from '../state/store';
import { Button, DataTable, PanelState, SearchField, type Column } from '../ui';
import { BrowserSplit } from './BrowserSplit';
import { NodeLinkList } from './NodeLinkList';

const ROOT_TRACK = 0x38;
/** Users listed per collection; the rest are counted. */
const USERS_SHOWN = 50;

/** The clip's decoding path, as its flags select it. */
function clipKind(clip: AnimationClipDTO): string {
  const kinds: string[] = [];
  if (clip.mask & 0x4) kinds.push('human state');
  if (clip.mask & 0x2) kinds.push('bone rotations');
  if (clip.mask & 0x20) kinds.push('pose');
  return kinds.join(' + ') || 'none';
}

/** "anim:Male_Reg/Male_Reg_Run#Run_Backward" → collection "Male_Reg", clip "Run_Backward". */
function splitName(name: string): { collection: string; clip: string } {
  const m = /^anim:([^/]*)\/(?:[^#]*#)?(.*)$/.exec(name);
  return m ? { collection: m[1]!, clip: m[2]! } : { collection: '', clip: name };
}

const seconds = (c: AnimationClipDTO) => c.frames / Math.max(1, c.fps);

const COLUMNS: Column<AnimationClipDTO>[] = [
  { id: 'collection', header: 'Collection', width: 10, sortValue: (c) => splitName(c.name).collection, cell: (c) => splitName(c.name).collection },
  { id: 'clip', header: 'Clip', sortValue: (c) => splitName(c.name).clip, cell: (c) => <span title={c.name}>{splitName(c.name).clip}</span> },
  { id: 'frames', header: 'Frames', width: 5, align: 'end', sortValue: (c) => c.frames, cell: (c) => c.frames },
  { id: 'seconds', header: 'Seconds', width: 5.5, align: 'end', sortValue: seconds, cell: (c) => seconds(c).toFixed(2) },
  { id: 'data', header: 'Data', width: 11, sortValue: clipKind, cell: clipKind },
];

function ClipDetail({ clip, data, onBack }: { clip: AnimationClipDTO; data: SceneAnimationsDTO; onBack: () => void }) {
  return (
    <section className="side-detail bevel-in" aria-label={`Clip ${clip.name}`}>
      <Button variant="link" onClick={onBack}>
        ‹ All collections
      </Button>
      <h3 className="tex-title">{clip.name}</h3>
      <dl className="kv">
        <dt>Length</dt>
        <dd>
          {clip.frames} frames at {clip.fps} fps ({seconds(clip).toFixed(2)} s)
        </dd>
        <dt>Data</dt>
        <dd>{clipKind(clip)}</dd>
        <dt>Blend frames</dt>
        <dd>{clip.blendFrames}</dd>
        <dt>Flags</dt>
        <dd className="mono">0x{clip.mask.toString(16).toUpperCase()}</dd>
      </dl>
      {clip.mask & 0x4 ? (
        <p className="browser-summary">
          The game adapts human-state channels to each character when it plays them. That step isn&apos;t understood yet, so these
          channels can&apos;t be shown.
        </p>
      ) : null}
      <h4 className="group-hdr">Bones ({clip.boneIds.length})</h4>
      <ul className="side-list">
        {clip.boneIds.map((id) => (
          <li key={id} className="list-item">
            <span className="grow">{data.boneNames[id] ?? `Bone ${id}`}</span>
            <span className="list-meta">{id === ROOT_TRACK ? 'root track' : `#${id}`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Collections({ data }: { data: SceneAnimationsDTO }) {
  return (
    <section className="side-detail bevel-in" aria-label="Animation collections">
      <h3 className="tex-title">Collections ({data.collections.length})</h3>
      <div className="side-scroll">
        {data.collections.map((c) => (
          <NodeLinkList
            key={c.name}
            label={`${c.name.replace(/^anmcol:animationdatabase#/, '')} · ${c.users.length} object(s)`}
            nodes={c.users}
            limit={USERS_SHOWN}
          />
        ))}
      </div>
    </section>
  );
}

export function AnimationBrowser() {
  const sceneId = useEditor((s) => s.scene?.id ?? null);
  const data = useAsync(sceneId ? () => getSceneAnimations(sceneId) : null, [sceneId]);
  const [filter, setFilter] = useState('');
  const [chosen, setChosen] = useState<number | null>(null);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (data.value?.clips ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [data.value, filter]);
  const clip = data.value?.clips[chosen ?? -1] ?? null;

  if (!sceneId) return <PanelState variant="empty" title="No scene open" message="Open a scene to browse its animations." />;

  return (
    <div className="browser">
      <div className="browser-bar">
        <SearchField
          label="Filter clips"
          placeholder="Filter clips by name"
          value={filter}
          onChange={setFilter}
          count={data.value ? `${shown.length} of ${data.value.clips.length} clips` : undefined}
        />
      </div>
      <p className="browser-summary">Playback isn&apos;t available yet: the game&apos;s clip format is only partly understood.</p>
      <BrowserSplit
        id="animations.detail"
        label="Resize the clip details"
        start={
          <>
            {data.status === 'loading' && <PanelState variant="loading" title="Reading animations…" />}
            {data.status === 'error' && <PanelState variant="error" title="Couldn't read this scene's animations" message={data.error} />}
            {data.value && (
              <DataTable
                label="Animation clips"
                className="browser-table"
                columns={COLUMNS}
                rows={shown}
                rowKey={(c) => c.index}
                selectedKey={chosen}
                onSelect={setChosen}
                emptyState={
                  <PanelState
                    variant="empty"
                    layout="inline"
                    title={filter ? `No clips match “${filter}”` : 'This scene has no clips'}
                    action={filter ? { label: 'Clear Filter', onClick: () => setFilter('') } : undefined}
                  />
                }
              />
            )}
          </>
        }
        end={data.value && (clip ? <ClipDetail key={clip.index} clip={clip} data={data.value} onBack={() => setChosen(null)} /> : <Collections data={data.value} />)}
      />
    </div>
  );
}
