import { useMemo, useState } from 'react';
import type { ScriptCreatorDTO } from '@hbm/protocol';
import { getSceneScripts } from '../api/endpoints';
import { useAsync } from '../hooks/useAsync';
import { NodeLinkList } from './NodeLinkList';
import { useEditor } from '../state/store';
import { Checkbox, DataTable, PanelState, SearchField, type Column } from '../ui';

const COLUMNS: Column<ScriptCreatorDTO>[] = [
  { id: 'name', header: 'Script class', sortValue: (c) => c.name, cell: (c) => c.name },
  { id: 'base', header: 'Base class', sortValue: (c) => c.bases[0] ?? '', cell: (c) => c.bases[0] ?? '' },
  { id: 'users', header: 'Objects', width: 6, align: 'end', sortValue: (c) => c.users.length, cell: (c) => c.users.length },
];

function ScriptDetail({ creator }: { creator: ScriptCreatorDTO }) {
  return (
    <section className="side-detail bevel-in" aria-label={`Script class ${creator.name}`}>
      <h3 className="tex-title">{creator.name}</h3>
      <dl className="kv">
        <dt>Base classes</dt>
        <dd>{creator.bases.length ? creator.bases.join(' → ') : 'None'}</dd>
        <dt>Instance size</dt>
        <dd>{creator.size} bytes</dd>
        <dt>Used by</dt>
        <dd>{creator.users.length} object(s)</dd>
      </dl>
      <NodeLinkList label="Objects using this script" nodes={creator.users} />
    </section>
  );
}

export function ScriptBrowser() {
  const sceneId = useEditor((s) => s.scene?.id ?? null);
  const scripts = useAsync(sceneId ? () => getSceneScripts(sceneId) : null, [sceneId]);
  const [filter, setFilter] = useState('');
  const [showUnused, setShowUnused] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (scripts.value?.creators ?? [])
      .filter((c) => (showUnused || c.users.length) && (!q || c.name.toLowerCase().includes(q)))
      .sort((a, b) => b.users.length - a.users.length || a.name.localeCompare(b.name));
  }, [scripts.value, filter, showUnused]);
  const creator = scripts.value?.creators.find((c) => c.name === chosen) ?? null;
  const data = scripts.value;
  const unmatched = data?.users.filter((u) => !u.creator) ?? [];

  if (!sceneId) return <PanelState variant="empty" title="No scene open" message="Open a scene to browse its mission scripts." />;

  return (
    <div className="browser">
      <div className="browser-bar">
        <SearchField
          label="Filter script classes"
          placeholder="Filter script classes"
          value={filter}
          onChange={setFilter}
          count={data ? `${shown.length} of ${data.creators.length} classes` : undefined}
        />
        <Checkbox checked={showUnused} onChange={setShowUnused}>
          Include classes no object uses
        </Checkbox>
      </div>
      {data && (
        <p className="browser-summary">
          {data.dll ? (
            <>
              Mission scripts from <b>{data.dll}</b>: {data.users.length} scripted objects in this scene.
            </>
          ) : (
            <>No script DLL was found for {data.module ?? 'this scene'}, so script classes can&apos;t be listed.</>
          )}
          {unmatched.length > 0 && ` ${unmatched.length} object(s) ask for a script the DLL doesn't have.`}
        </p>
      )}
      <div className="browser-body">
        {scripts.status === 'loading' && <PanelState variant="loading" title="Reading mission scripts…" />}
        {scripts.status === 'error' && <PanelState variant="error" title="Couldn't read the mission scripts" message={scripts.error} />}
        {data && (
          <DataTable
            label="Script classes"
            className="browser-table"
            columns={COLUMNS}
            rows={shown}
            rowKey={(c) => c.name}
            selectedKey={chosen}
            onSelect={setChosen}
            emptyState={
              <PanelState
                variant="empty"
                layout="inline"
                title={filter ? `No script classes match “${filter}”` : 'No script classes'}
                action={filter ? { label: 'Clear Filter', onClick: () => setFilter('') } : undefined}
              />
            }
          />
        )}
        {creator && <ScriptDetail key={creator.name} creator={creator} />}
      </div>
    </div>
  );
}
