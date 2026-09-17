import { useState } from 'react';
import { browse, chooseGame } from '../api/endpoints';
import { Dialog, PushButton } from '../components/chrome/Dialog';
import { useAsync } from '../hooks/useAsync';
import { openDialog } from '../state/actions';
import { useEditor } from '../state/store';

const ICONS = { drive: '▭', dir: '▸', file: '▪' } as const;

/** Find the game: a folder browser over the server's file system, or a pasted path. */
export function GamePickerDialog() {
  const config = useEditor((s) => s.config);
  const [path, setPath] = useState<string | undefined>(config?.gameRoot ?? undefined);
  const [typed, setTyped] = useState(config?.gameRoot ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listing = useAsync(() => browse(path), [path]);

  const choose = async (pointer: string) => {
    setBusy(true);
    setError(null);
    try {
      const next = await chooseGame(pointer);
      useEditor.getState().update((s) => {
        s.config = next;
        s.statusMsg = `Game: ${next.gameRoot}`;
        s.dialog = 'sceneOpen';
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const dir = listing.value;
  const current = dir?.gameRoot ?? null;

  return (
    <Dialog
      title="Choose Hitman: Blood Money"
      width={560}
      onClose={config?.gameRoot ? () => openDialog(null) : undefined}
      buttons={
        <>
          <PushButton label="Use This Game" primary disabled={busy || !current} onClick={() => current && void choose(current)} />
          {config?.gameRoot && <PushButton label="Cancel" onClick={() => openDialog(null)} />}
        </>
      }
    >
      <p className="dialog-text">
        Pick the folder that holds <b>HitmanBloodMoney.exe</b>. Nothing in it is changed; the editor only reads the game.
      </p>
      <div className="field-row">
        <input
          className="sunken-input grow"
          value={typed}
          placeholder="C:\Program Files (x86)\Steam\steamapps\common\Hitman Blood Money"
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && typed.trim() && void choose(typed.trim())}
        />
        <PushButton label="Use Path" disabled={busy || !typed.trim()} onClick={() => void choose(typed.trim())} />
      </div>
      <div className="field-row">
        <PushButton label="Up" disabled={!dir || dir.path === null} onClick={() => setPath(dir?.parent ?? undefined)} />
        <div className="browse-path">{dir?.path ?? 'Computer'}</div>
      </div>
      <div className="list-box bevel-in browse-list">
        {listing.status === 'loading' && <div className="list-note">Reading…</div>}
        {listing.status === 'error' && <div className="list-note error">{listing.error}</div>}
        {dir?.entries.map((entry) => (
          <div
            key={entry.path}
            className={`list-item${entry.isGame ? ' game' : ''}`}
            title={entry.path}
            onDoubleClick={() => (entry.kind === 'file' ? void choose(entry.path) : setPath(entry.path))}
            onClick={() => setTyped(entry.path)}
          >
            <span className="list-icon">{ICONS[entry.kind]}</span>
            {entry.name}
            {entry.isGame && <span className="badge">HBM</span>}
          </div>
        ))}
      </div>
      {current && <div className="dialog-text ok">Found the game at {current}</div>}
      {error && <div className="dialog-text error">{error}</div>}
    </Dialog>
  );
}
