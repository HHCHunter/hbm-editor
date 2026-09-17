import { useState } from 'react';
import { FileText, Folder } from 'lucide-react';
import type { LocEntryDTO } from '@hbm/protocol';
import { LOC_SEARCH_LIMIT, locChildren, locLookup, locSearch } from '../api/endpoints';
import { useAsync } from '../hooks/useAsync';
import { useEditor } from '../state/store';
import { Button, DataTable, PanelState, SearchField, TextField, type Column } from '../ui';

const COLUMNS: Column<LocEntryDTO>[] = [
  {
    id: 'name',
    header: 'Name',
    width: 16,
    sortValue: (e) => e.name,
    cell: (e) => (
      <span className="loc-name" title={e.path}>
        {e.hasChildren ? <Folder className="ui-icon" aria-label="folder" role="img" /> : <FileText className="ui-icon" aria-hidden="true" />}
        {e.name}
      </span>
    ),
  },
  { id: 'text', header: 'Text', sortValue: (e) => e.text ?? '', cell: (e) => `${e.text ?? ''}${e.text2 ? ` · ${e.text2}` : ''}` },
  { id: 'sound', header: 'Sound', width: 6, align: 'end', sortValue: (e) => e.soundId ?? -1, cell: (e) => e.soundId ?? '' },
  { id: 'flags', header: 'Flags', width: 6, mono: true, cell: (e) => `0x${e.flags.toString(16).toUpperCase()}` },
];

function LookupTester({ sceneId }: { sceneId: string }) {
  const [path, setPath] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const result = useAsync(asked ? () => locLookup(sceneId, asked) : null, [sceneId, asked]);
  const hit = result.value;

  return (
    <div className="loc-lookup">
      <TextField
        label="Look up a text id the way the game does"
        className="grow"
        value={path}
        placeholder="AllLevels/Actions/Pickup"
        mono
        onChange={setPath}
        onKeyDown={(e) => e.key === 'Enter' && setAsked(path.trim() || null)}
      />
      <Button onClick={() => setAsked(path.trim() || null)} disabled={!path.trim()}>
        Look Up
      </Button>
      <output className="loc-result">
        {result.status === 'error' && <span className="error">{result.error}</span>}
        {hit && !hit.found && 'Not found'}
        {hit?.entry && (
          <>
            {hit.shadowed && <b title="The game stops at a shorter id that this one starts with">Matched a shorter id: </b>}
            {hit.entry.text ?? '(no text)'}
          </>
        )}
      </output>
    </div>
  );
}

export function LocalisationBrowser() {
  const sceneId = useEditor((s) => s.scene?.id ?? null);
  const [path, setPath] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  const entries = useAsync(
    sceneId ? () => (search ? locSearch(sceneId, search) : locChildren(sceneId, path)) : null,
    [sceneId, path, search],
  );

  if (!sceneId) return <PanelState variant="empty" title="No scene open" message="Open a scene to browse its localisation text." />;

  const segments = path ? path.split('/') : [];
  const open = (next: string) => {
    setSearch(null);
    setChosen(null);
    setPath(next);
  };
  const list = entries.value;

  return (
    <div className="browser">
      <div className="browser-bar">
        <SearchField
          label="Search text ids and text"
          placeholder="Search ids and text, then press Enter"
          value={query}
          onChange={setQuery}
          onSubmit={(text) => setSearch(text.trim() || null)}
          count={
            search && list
              ? list.length >= LOC_SEARCH_LIMIT
                ? `First ${LOC_SEARCH_LIMIT} matches: search for something more specific`
                : `${list.length} match(es)`
              : undefined
          }
        />
      </div>
      <nav className="crumbs" aria-label="Folder">
        <Button variant="link" onClick={() => open('')} aria-current={!segments.length && !search ? 'page' : undefined}>
          {sceneId.split('/').pop()}.LOC
        </Button>
        {search ? (
          <span> › search “{search}”</span>
        ) : (
          segments.map((segment, i) => (
            <span key={i}>
              {' › '}
              <Button
                variant="link"
                onClick={() => open(segments.slice(0, i + 1).join('/'))}
                aria-current={i === segments.length - 1 ? 'page' : undefined}
              >
                {segment}
              </Button>
            </span>
          ))
        )}
      </nav>
      <LookupTester sceneId={sceneId} />
      <div className="browser-body">
        {entries.status === 'loading' && <PanelState variant="loading" title="Reading text…" />}
        {entries.status === 'error' && <PanelState variant="error" title="Couldn't read this scene's text" message={entries.error} />}
        {list && (
          <DataTable
            label={search ? `Search results for ${search}` : 'Text ids'}
            className="browser-table"
            columns={COLUMNS}
            rows={list}
            rowKey={(e) => e.path}
            selectedKey={chosen}
            onSelect={setChosen}
            onActivate={(key) => {
              const entry = list.find((e) => e.path === key);
              if (entry?.hasChildren) open(entry.path);
            }}
            rowClassName={(e) => (e.hasChildren ? 'loc-branch' : undefined)}
            emptyState={
              <PanelState
                variant="empty"
                layout="inline"
                title={search ? `Nothing matches “${search}”` : 'This folder is empty'}
                action={search ? { label: 'Clear Search', onClick: () => open(path) } : undefined}
              />
            }
          />
        )}
      </div>
      <p className="browser-hint">Double-click a folder, or select it and press Enter, to open it.</p>
    </div>
  );
}
