import { useEffect, useMemo, useState } from 'react';
import type { MaterialSummaryDTO, TextureDTO } from '@hbm/protocol';
import { getMaterial, listMaterials, listTextures } from '../../api/endpoints';
import { useAsync } from '../../hooks/useAsync';
import { useEditor } from '../../state/store';
import { DataTable, PanelState, SearchField, Select, type Column } from '../../ui';
import { BrowserSplit } from '../BrowserSplit';
import { NodeLinkList } from '../NodeLinkList';
import { MaterialGraph, type GraphSelection } from './MaterialGraph';
import { MaterialInspector } from './MaterialInspector';
import { MaterialPreview } from './MaterialPreview';
import { featureTitle, groupMaterial } from './materialModel';
import './materials.css';

const COLUMNS: Column<MaterialSummaryDTO>[] = [
  {
    id: 'name',
    header: 'Material',
    sortValue: (m) => m.name ?? '',
    cell: (m) => <span title={m.name ?? undefined}>{m.name?.split('/').pop() ?? `Material ${m.slot}`}</span>,
  },
  { id: 'class', header: 'Class', width: 7, sortValue: (m) => m.className, cell: (m) => m.className },
  {
    id: 'features',
    header: 'Features',
    width: 10,
    sortValue: (m) => m.features.length,
    cell: (m) => {
      const titles = m.features.map(featureTitle).join(', ');
      return <span title={titles}>{titles || '—'}</span>;
    },
  },
  { id: 'users', header: 'Objects', width: 4.5, align: 'end', sortValue: (m) => m.users, cell: (m) => m.users },
];

const NO_TEXTURES: ReadonlyMap<number, TextureDTO> = new Map();

function MaterialView({ sceneId, slot, textures }: { sceneId: string; slot: number; textures: ReadonlyMap<number, TextureDTO> }) {
  const detail = useAsync((signal) => getMaterial(sceneId, slot, signal), [sceneId, slot]);
  const material = detail.value;
  const grouped = useMemo(() => (material ? groupMaterial(material.properties) : null), [material]);
  // Start on the first feature: the class's list of shader passes is long and rarely wanted first.
  const [picked, setSelection] = useState<GraphSelection | null>(null);
  useEffect(() => setSelection(null), [slot]);
  const first = grouped?.features[0];
  const selection: GraphSelection = picked ?? (first ? `feature:${first.spec.key}` : 'shader');

  if (detail.status === 'loading' || detail.status === 'idle') return <PanelState variant="loading" title="Reading the material…" />;
  if (detail.status === 'error') return <PanelState variant="error" title="Couldn't read this material" message={detail.error} />;
  if (!material || !grouped) return null;

  return (
    <section className="mat-view" aria-label={`Material ${material.name ?? slot}`}>
      <header className="mat-header">
        <h3 className="tex-title">{material.name ?? `Material ${slot}`}</h3>
        <span className="mat-header-meta">
          {material.className} · slot {slot} · used by {material.users.length} object(s)
        </span>
      </header>
      <div className="mat-view-top">
        <MaterialPreview sceneId={sceneId} material={material} textures={textures} />
        <MaterialGraph sceneId={sceneId} material={material} grouped={grouped} textures={textures} selection={selection} onSelect={setSelection} />
      </div>
      <div className="mat-view-bottom">
        <MaterialInspector sceneId={sceneId} material={material} grouped={grouped} textures={textures} selection={selection} />
        <NodeLinkList label={`Objects using it (${material.users.length})`} nodes={material.users} limit={200} />
      </div>
    </section>
  );
}

/** Every material in the scene; pick one to see it as a graph with a live preview. */
export function MaterialBrowser() {
  const sceneId = useEditor((s) => s.scene?.id ?? null);
  const chosen = useEditor((s) => s.materialSlot);
  const materials = useAsync(sceneId ? () => listMaterials(sceneId) : null, [sceneId]);
  const textureList = useAsync(sceneId ? () => listTextures(sceneId) : null, [sceneId]);
  const textures = useMemo(() => (textureList.value ? new Map(textureList.value.map((t) => [t.id, t])) : NO_TEXTURES), [textureList.value]);
  const [filter, setFilter] = useState('');
  const [className, setClassName] = useState('');

  const classes = useMemo(() => [...new Set((materials.value ?? []).map((m) => m.className))].sort(), [materials.value]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (materials.value ?? []).filter(
      (m) =>
        (!className || m.className === className) &&
        (!q || `${m.name ?? ''} ${m.className} ${m.features.map(featureTitle).join(' ')} ${m.slot}`.toLowerCase().includes(q)),
    );
  }, [materials.value, filter, className]);

  const choose = (slot: number) =>
    useEditor.getState().update((s) => {
      s.materialSlot = slot;
    });

  if (!sceneId) return <PanelState variant="empty" title="No scene open" message="Open a scene to browse its materials." />;

  return (
    <div className="browser">
      <div className="browser-bar">
        <SearchField
          label="Filter materials"
          placeholder="Filter by name, class or feature"
          value={filter}
          onChange={setFilter}
          count={materials.value ? `${shown.length} of ${materials.value.length} materials` : undefined}
        />
        <Select
          label="Class"
          value={className}
          options={[{ value: '', label: 'All classes' }, ...classes.map((c) => ({ value: c, label: c }))]}
          onChange={setClassName}
        />
      </div>
      <BrowserSplit
        id="materials.list"
        label="Resize the material list"
        fixed="start"
        defaultSize="clamp(14rem, 26%, 22rem)"
        min={12}
        minOther={24}
        start={
          <>
            {materials.status === 'loading' && <PanelState variant="loading" title="Reading materials…" />}
            {materials.status === 'error' && <PanelState variant="error" title="Couldn't read this scene's materials" message={materials.error} />}
            {materials.value && (
              <DataTable
                label="Materials"
                className="browser-table mat-list"
                columns={COLUMNS}
                rows={shown}
                rowKey={(m) => m.slot}
                selectedKey={chosen}
                onSelect={choose}
                emptyState={
                  <PanelState
                    variant="empty"
                    layout="inline"
                    title={filter || className ? 'No materials match' : 'This scene has no materials'}
                    action={filter || className ? { label: 'Clear Filters', onClick: () => (setFilter(''), setClassName('')) } : undefined}
                  />
                }
              />
            )}
          </>
        }
        end={
          materials.value &&
          (chosen !== null && materials.value.some((m) => m.slot === chosen) ? (
            <MaterialView key={chosen} sceneId={sceneId} slot={chosen} textures={textures} />
          ) : (
            <div className="mat-view">
              <PanelState variant="empty" title="Pick a material" message="Its textures, features and render state appear here as a graph, with a preview." />
            </div>
          ))
        }
      />
    </div>
  );
}
