import { useState } from 'react';
import type { LocEntryDTO } from '@hbm/protocol';
import { locChildren, locLookup, locSearch } from '../api/endpoints';
import { useAsync } from '../hooks/useAsync';
import { useEditor } from '../state/store';

function EntryRow({ entry, onOpen }: { entry: LocEntryDTO; onOpen: (path: string) => void }) {
  return (
    <tr className={entry.hasChildren ? 'loc-branch' : ''} onDoubleClick={() => entry.hasChildren && onOpen(entry.path)}>
      <td className="loc-name" title={entry.path}>
        {entry.hasChildren ? '▸ ' : ''}
        {entry.name}
      </td>
      <td className="loc-text">{entry.text ?? ''}{entry.text2 ? ` · ${entry.text2}` : ''}</td>
      <td className="loc-num">{entry.soundId ?? ''}</td>
      <td className="loc-num">0x{entry.flags.toString(16).toUpperCase()}</td>
    </tr>
  );
}

function LookupTester({ sceneId }: { sceneId: string }) {
  const [path, setPath] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const result = useAsync(asked ? () => locLookup(sceneId, asked) : null, [sceneId, asked]);
  const hit = result.value;

  return (
    <div className="loc-lookup">
      <span>Lookup</span>
      <input
        className="sunken-input grow"
        value={path}
        placeholder="AllLevels/Actions/Pickup"
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && setAsked(path.trim() || null)}
      />
      <span className="loc-result">
        {result.status === 'error' && <span className="error">{result.error}</span>}
        {hit && !hit.found && 'not found'}
        {hit?.entry && (
          <>
            {hit.shadowed && <b title="The engine stops at a shorter name that this one starts with">shadowed · </b>}
            {hit.entry.text ?? '(no text)'}
          </>
        )}
      </span>
    </div>
  );
}

export function LocalisationBrowser() {
  const sceneId = useEditor((s) => s.scene?.id ?? null);
  const [path, setPath] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<string | null>(null);

  const entries = useAsync(
    sceneId ? () => (search ? locSearch(sceneId, search) : locChildren(sceneId, path)) : null,
    [sceneId, path, search],
  );

  if (!sceneId) return <div className="panel-empty">Open a scene to browse its localisation text.</div>;

  const segments = path ? path.split('/') : [];
  const open = (next: string) => {
    setSearch(null);
    setPath(next);
  };

  return (
    <div className="browser">
      <div className="browser-bar">
        <input
          className="sunken-input"
          value={query}
          placeholder="search names and text"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setSearch(query.trim() || null)}
        />
        <div className="crumbs">
          <span className="crumb" onClick={() => open('')}>
            {sceneId.split('/').pop()}.LOC
          </span>
          {search ? (
            <span> › search “{search}”</span>
          ) : (
            segments.map((segment, i) => (
              <span key={i}>
                {' › '}
                <span className="crumb" onClick={() => open(segments.slice(0, i + 1).join('/'))}>
                  {segment}
                </span>
              </span>
            ))
          )}
        </div>
      </div>
      <LookupTester sceneId={sceneId} />
      <div className="loc-table-wrap bevel-in">
        {entries.status === 'loading' && <div className="list-note">Reading…</div>}
        {entries.status === 'error' && <div className="list-note error">{entries.error}</div>}
        {entries.value && (
          <table className="loc-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Text</th>
                <th>Sound</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {entries.value.map((entry) => (
                <EntryRow key={entry.path} entry={entry} onOpen={open} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
