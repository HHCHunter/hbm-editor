import { useMemo, useState } from 'react';
import { listScenes } from '../api/endpoints';
import { useAsync } from '../hooks/useAsync';
import { openDialog } from '../state/actions';
import { openScene } from '../state/sceneLoader';
import { useEditor } from '../state/store';
import { Button, Dialog, ListBox, PanelState, SearchField, type ListEntry } from '../ui';

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

type SceneEntry = ListEntry<string> & { bytes?: number };

export function SceneOpenDialog() {
  const current = useEditor((s) => s.scene?.id ?? null);
  const hasGame = useEditor((s) => !!s.config?.gameRoot);
  const scenes = useAsync(hasGame ? () => listScenes() : null, [hasGame]);
  const [chosen, setChosen] = useState<string | null>(current);
  const [filter, setFilter] = useState('');

  const { entries, count } = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const out: SceneEntry[] = [];
    let group: string | null = null;
    let count = 0;
    for (const scene of scenes.value ?? []) {
      if (q && !scene.id.toLowerCase().includes(q)) continue;
      if (scene.group !== group) {
        group = scene.group;
        out.push({ kind: 'group', key: scene.group, label: scene.group || 'Scenes' });
      }
      out.push({ kind: 'item', key: scene.id, label: scene.id.split('/').pop()!, bytes: scene.bytes });
      count++;
    }
    return { entries: out, count };
  }, [scenes.value, filter]);

  const visible = entries.some((e) => e.kind === 'item' && e.key === chosen);
  const open = (id: string | null) => id && void openScene(id);
  const close = () => openDialog(null);

  return (
    <Dialog
      title="Open Scene"
      width={32}
      onClose={close}
      onSubmit={() => visible && open(chosen)}
      buttons={
        <>
          <Button type="submit" primary disabled={!visible}>
            Open
          </Button>
          <Button onClick={close}>Cancel</Button>
        </>
      }
    >
      {!hasGame ? (
        <PanelState
          variant="empty"
          title="Choose your game first"
          message="The editor needs to know where Hitman: Blood Money is installed before it can list scenes."
          action={{ label: 'Choose Game…', onClick: () => openDialog('gamePicker') }}
        />
      ) : (
        <>
          <SearchField
            label="Filter scenes"
            placeholder="Filter scenes, e.g. M05"
            value={filter}
            onChange={setFilter}
            count={scenes.value ? `${count} of ${scenes.value.length}` : undefined}
            initialFocus
          />
          <div className="scene-list">
            {scenes.status === 'loading' && <PanelState variant="loading" title="Reading the Scenes folder…" />}
            {scenes.status === 'error' && <PanelState variant="error" title="Couldn't list the scenes" message={scenes.error} />}
            {scenes.value && (
              <ListBox<string, SceneEntry>
                label="Scenes"
                entries={entries}
                selectedKey={chosen}
                onSelect={setChosen}
                onActivate={open}
                renderItem={(entry) => (
                  <>
                    <span className="ui-option-label" data-scene={entry.key}>
                      {entry.label}
                    </span>
                    {entry.bytes !== undefined && <span className="list-meta">{megabytes(entry.bytes)}</span>}
                  </>
                )}
                emptyState={
                  <PanelState
                    variant="empty"
                    layout="inline"
                    title={filter ? `No scenes match “${filter}”` : 'This install has no scenes'}
                    action={filter ? { label: 'Clear Filter', onClick: () => setFilter('') } : undefined}
                  />
                }
              />
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
