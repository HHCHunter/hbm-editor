import { useMemo, useState } from 'react';
import type { SceneListItemDTO } from '@hbm/protocol';
import { listScenes } from '../api/endpoints';
import { Dialog, PushButton } from '../components/chrome/Dialog';
import { useAsync } from '../hooks/useAsync';
import { openDialog } from '../state/actions';
import { openScene } from '../state/sceneLoader';
import { useEditor } from '../state/store';

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

export function SceneOpenDialog() {
  const current = useEditor((s) => s.scene?.id ?? null);
  const scenes = useAsync(() => listScenes(), []);
  const [chosen, setChosen] = useState<string | null>(current);
  const [filter, setFilter] = useState('');

  const groups = useMemo(() => {
    const byGroup = new Map<string, SceneListItemDTO[]>();
    const q = filter.trim().toLowerCase();
    for (const scene of scenes.value ?? []) {
      if (q && !scene.id.toLowerCase().includes(q)) continue;
      const list = byGroup.get(scene.group) ?? [];
      list.push(scene);
      byGroup.set(scene.group, list);
    }
    return [...byGroup.entries()];
  }, [scenes.value, filter]);

  const open = (id: string | null) => id && void openScene(id);

  return (
    <Dialog
      title="Open Scene"
      width={460}
      onClose={() => openDialog(null)}
      buttons={
        <>
          <PushButton label="Open" primary disabled={!chosen} onClick={() => open(chosen)} />
          <PushButton label="Cancel" onClick={() => openDialog(null)} />
        </>
      }
    >
      <div className="field-row">
        <input className="sunken-input grow" value={filter} placeholder="filter" autoFocus onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="list-box bevel-in scene-list">
        {scenes.status === 'loading' && <div className="list-note">Reading Scenes…</div>}
        {scenes.status === 'error' && <div className="list-note error">{scenes.error}</div>}
        {groups.map(([group, items]) => (
          <div key={group}>
            <div className="list-group">{group || 'Scenes'}</div>
            {items.map((scene) => (
              <div
                key={scene.id}
                className={`list-item${chosen === scene.id ? ' selected' : ''}`}
                data-scene={scene.id}
                onClick={() => setChosen(scene.id)}
                onDoubleClick={() => open(scene.id)}
              >
                <span className="grow">{scene.id.split('/').pop()}</span>
                <span className="list-meta">{megabytes(scene.bytes)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
