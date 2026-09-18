import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { openDialog } from '../state/actions';
import { Button, Dialog, Kbd, SearchField } from '../ui';
import { chordFromEvent, reservedReason, type Chord } from './keybindings';
import { DEFAULT_KEYMAP, bindingsOf, commandsForChord, useKeymap } from './keymap';
import { allCommands, getCommand } from './registry';

interface Recording {
  id: string;
  /** The chord pressed, waiting for confirmation because another command has it. */
  pending?: { chord: Chord; others: string[] };
  error?: string;
}

const sameChords = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((c, i) => c === b[i]);

/** Every command with its keys: search, record a new key, remove one, or go back to the defaults. */
export function KeybindingsDialog() {
  const { overrides, setBindings, reset, resetAll } = useKeymap();
  const [filter, setFilter] = useState('');
  const [recording, setRecording] = useState<Recording | null>(null);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return allCommands()
      .filter((c) => {
        if (!q) return true;
        const chords = bindingsOf(c.id, overrides).join(' ').toLowerCase();
        return `${c.title} ${c.category} ${chords}`.toLowerCase().includes(q);
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  }, [filter, overrides]);

  const assign = (id: string, chord: Chord, others: string[]) => {
    for (const other of others) setBindings(other, bindingsOf(other).filter((c) => c !== chord));
    setBindings(id, [...bindingsOf(id).filter((c) => c !== chord), chord]);
    setRecording(null);
  };

  // While recording, the next key press is the new shortcut. Escape cancels.
  useEffect(() => {
    if (!recording || recording.pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setRecording(null);
        return;
      }
      const chord = chordFromEvent(e);
      if (!chord) return;
      const reason = reservedReason(chord);
      if (reason) {
        setRecording({ id: recording.id, error: `${reason}. Try another key.` });
        return;
      }
      const others = commandsForChord(chord).filter((other) => other !== recording.id);
      if (others.length) setRecording({ id: recording.id, pending: { chord, others } });
      else assign(recording.id, chord, []);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // assign only reads the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const changed = Object.keys(overrides).filter((id) => !sameChords(overrides[id]!, DEFAULT_KEYMAP[id] ?? []));

  return (
    <Dialog
      title="Keyboard Shortcuts"
      width={46}
      onClose={recording ? undefined : () => openDialog(null)}
      description="Letters and numbers are matched by where the key is on the keyboard, so shortcuts work the same on any layout. Keys the browser keeps for itself can't be used."
      buttons={
        <>
          <Button disabled={!changed.length || !!recording} onClick={resetAll}>
            Reset All to Defaults
          </Button>
          <Button primary disabled={!!recording} onClick={() => openDialog(null)}>
            Done
          </Button>
        </>
      }
    >
      <SearchField label="Search commands and keys" placeholder="Search commands or keys, e.g. frame or Shift+F" value={filter} onChange={setFilter} initialFocus />
      <div className="keys-table-wrap">
        <table className="keys-table">
          <caption className="visually-hidden">Commands and their keyboard shortcuts</caption>
          <thead>
            <tr>
              <th scope="col">Command</th>
              <th scope="col">Keys</th>
              <th scope="col">
                <span className="visually-hidden">Change</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((command) => {
              const chords = bindingsOf(command.id, overrides);
              const isRecording = recording?.id === command.id;
              const isChanged = changed.includes(command.id);
              return (
                <tr key={command.id} className={isRecording ? 'is-recording' : undefined}>
                  <th scope="row" className="keys-command">
                    {command.title.replace(/…$/, '')}
                    <span className="keys-category">{command.category}</span>
                  </th>
                  <td className="keys-chords">
                    {isRecording && !recording.pending ? (
                      <span className="keys-prompt" role="status">
                        {recording.error ?? 'Press the new key combination, or Escape to cancel'}
                      </span>
                    ) : isRecording && recording.pending ? (
                      <span className="keys-prompt" role="alert">
                        <Kbd chord={recording.pending.chord} /> is used by{' '}
                        {recording.pending.others.map((o) => getCommand(o)?.title ?? o).join(', ')}.
                        <Button variant="link" onClick={() => assign(command.id, recording.pending!.chord, recording.pending!.others)}>
                          Move it here
                        </Button>
                        <Button variant="link" onClick={() => setRecording(null)}>
                          Cancel
                        </Button>
                      </span>
                    ) : chords.length ? (
                      chords.map((chord) => (
                        <span key={chord} className="keys-chord">
                          <Kbd chord={chord} />
                          <button
                            type="button"
                            className="keys-remove"
                            aria-label={`Remove ${chord} from ${command.title}`}
                            onClick={() => setBindings(command.id, chords.filter((c) => c !== chord))}
                          >
                            <X className="ui-icon" aria-hidden="true" />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="keys-none">None</span>
                    )}
                  </td>
                  <td className="keys-actions">
                    <Button
                      variant="tool"
                      disabled={!!recording && !isRecording}
                      aria-label={isRecording ? `Cancel adding a key for ${command.title}` : `Add Key for ${command.title}`}
                      onClick={() => setRecording(isRecording ? null : { id: command.id })}
                    >
                      {isRecording ? 'Cancel' : 'Add Key…'}
                    </Button>
                    {isChanged && (
                      <Button variant="tool" disabled={!!recording} aria-label={`Reset ${command.title} to its default keys`} onClick={() => reset(command.id)}>
                        Reset
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="keys-none">No commands match “{filter}”.</p>}
      </div>
    </Dialog>
  );
}
