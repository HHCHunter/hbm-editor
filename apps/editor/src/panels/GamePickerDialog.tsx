import { useState } from 'react';
import { ArrowUp, File, Folder, HardDrive, type LucideIcon } from 'lucide-react';
import type { BrowseEntryDTO } from '@hbm/protocol';
import { browse, chooseGame } from '../api/endpoints';
import { useAsync } from '../hooks/useAsync';
import { openDialog } from '../state/actions';
import { useEditor } from '../state/store';
import { Badge, Button, Dialog, ListBox, PanelState, TextField, type ListEntry } from '../ui';

const ICONS: Record<BrowseEntryDTO['kind'], LucideIcon> = { drive: HardDrive, dir: Folder, file: File };

type FolderEntry = ListEntry<string> & { entry?: BrowseEntryDTO };

/** Find the game: a folder browser over the server's file system, or a pasted path. */
export function GamePickerDialog() {
  const config = useEditor((s) => s.config);
  const [path, setPath] = useState<string | undefined>(config?.gameRoot ?? undefined);
  const [typed, setTyped] = useState(config?.gameRoot ?? '');
  const [chosen, setChosen] = useState<string | null>(null);
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
  const canClose = !!config?.gameRoot;
  const entries: FolderEntry[] = (dir?.entries ?? []).map((entry) => ({ kind: 'item', key: entry.path, label: entry.name, entry }));

  return (
    <Dialog
      title="Choose Hitman: Blood Money"
      width={36}
      onClose={canClose ? () => openDialog(null) : undefined}
      description={
        <>
          Pick the folder that holds <b>HitmanBloodMoney.exe</b>. Nothing in it is changed; the editor only reads the game.
        </>
      }
      buttons={
        <>
          <Button primary disabled={busy || !current} onClick={() => current && void choose(current)}>
            Use This Game
          </Button>
          {canClose && <Button onClick={() => openDialog(null)}>Cancel</Button>}
        </>
      }
    >
      <div className="field-row">
        <TextField
          label="Game folder"
          className="grow"
          value={typed}
          placeholder="C:\Program Files (x86)\Steam\steamapps\common\Hitman Blood Money"
          onChange={setTyped}
          onKeyDown={(e) => e.key === 'Enter' && typed.trim() && void choose(typed.trim())}
        />
        <Button disabled={busy || !typed.trim()} onClick={() => void choose(typed.trim())}>
          Use Path
        </Button>
      </div>
      <div className="field-row">
        <Button icon={ArrowUp} disabled={!dir || dir.path === null} onClick={() => setPath(dir?.parent ?? undefined)}>
          Up
        </Button>
        <div className="browse-path" title={dir?.path ?? undefined}>
          {dir?.path ?? 'This computer'}
        </div>
      </div>
      <div className="browse-list">
        {listing.status === 'loading' && <PanelState variant="loading" title="Reading folder…" />}
        {listing.status === 'error' && <PanelState variant="error" title="Couldn't read this folder" message={listing.error} />}
        {dir && (
          <ListBox<string, FolderEntry>
            label="Folders"
            entries={entries}
            selectedKey={chosen}
            onSelect={(key) => {
              setChosen(key);
              setTyped(key);
            }}
            onActivate={(key) => {
              const entry = dir.entries.find((e) => e.path === key);
              if (!entry) return;
              if (entry.kind === 'file') void choose(entry.path);
              else setPath(entry.path);
            }}
            renderItem={({ entry, label }) => {
              const Icon = ICONS[entry!.kind];
              return (
                <>
                  <Icon className="ui-icon browse-icon" aria-hidden="true" strokeWidth={1.75} />
                  <span className="ui-option-label">{label}</span>
                  {entry!.isGame && <Badge tone="accent">Hitman: Blood Money</Badge>}
                </>
              );
            }}
            emptyState={<PanelState variant="empty" layout="inline" title="This folder is empty" />}
          />
        )}
      </div>
      <p className="browse-hint">Double-click or press Enter to open a folder.</p>
      {current && (
        <p className="dialog-text ok" role="status">
          Found the game at {current}
        </p>
      )}
      {error && (
        <p className="dialog-text error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
