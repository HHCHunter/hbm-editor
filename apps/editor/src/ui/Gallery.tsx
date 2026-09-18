import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Eye, Folder, Frame, Lightbulb, Lock, Redo2, Scan, Settings, Undo2, Video } from 'lucide-react';
import { applySettings, UI_SCALES, type Density } from '../settings/settingsStore';
import { Button, IconButton, ToggleButton } from './Button';
import { Checkbox, RadioGroup } from './Checkbox';
import { DataTable, type Column } from './DataTable';
import { Dialog } from './Dialog';
import { Badge, ProgressBar, Splitter, ToastRegion, toast } from './Feedback';
import './theme/gallery.css';
import { Kbd } from './Kbd';
import { ListBox, type ListEntry } from './ListBox';
import { MenuBar, useContextMenu, type MenuEntry } from './Menu';
import { PanelState } from './PanelState';
import { Section } from './Section';
import { Select } from './Select';
import { TabPanel, Tabs } from './Tabs';
import { SearchField, TextField, VectorField } from './TextField';
import { Toolbar, ToolbarGroupLabel, ToolbarSeparator } from './Toolbar';
import { HoverCard, Tooltip } from './Tooltip';
import { Tree, type TreeItem } from './Tree';

function Specimen({ title, children, note }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="gallery-specimen" aria-labelledby={`g-${title}`}>
      <h2 id={`g-${title}`} className="gallery-title">
        {title}
      </h2>
      {note && <p className="gallery-note">{note}</p>}
      <div className="gallery-body">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------- sample data

interface Node extends TreeItem<number> {
  kind: 'room' | 'group' | 'mesh' | 'light' | 'camera';
}

const SAMPLE_TREE: { key: number; parent: number; label: string; kind: Node['kind'] }[] = [
  { key: 0, parent: -1, label: 'M11_main', kind: 'room' },
  { key: 1, parent: 0, label: 'Ballroom', kind: 'room' },
  { key: 2, parent: 1, label: 'Chandelier_01', kind: 'mesh' },
  { key: 3, parent: 1, label: 'Spot_Stage', kind: 'light' },
  { key: 4, parent: 1, label: 'Tables', kind: 'group' },
  { key: 5, parent: 4, label: 'Table_01', kind: 'mesh' },
  { key: 6, parent: 4, label: 'Table_02', kind: 'mesh' },
  { key: 7, parent: 0, label: 'Kitchen', kind: 'room' },
  { key: 8, parent: 7, label: 'SecurityCam_03', kind: 'camera' },
  ...Array.from({ length: 40 }, (_, i) => ({ key: 9 + i, parent: 7, label: `Crate_${String(i + 1).padStart(2, '0')}`, kind: 'mesh' as const })),
];

const KIND_ICON = { room: Folder, group: Box, mesh: Box, light: Lightbulb, camera: Video };

interface TextureRow {
  id: number;
  name: string;
  format: string;
  size: string;
  users: number;
}

const TEXTURES: TextureRow[] = Array.from({ length: 60 }, (_, i) => ({
  id: 100 + i,
  name: `Furniture/Table_Wood_${i + 1}`,
  format: ['DXT1', 'DXT5', 'RGBA', 'PAL8'][i % 4]!,
  size: `${256 << (i % 3)} × ${256 << (i % 3)}`,
  users: (i * 7) % 13,
}));

const TEXTURE_COLUMNS: Column<TextureRow>[] = [
  { id: 'id', header: 'Id', cell: (r) => r.id, sortValue: (r) => r.id, width: 4, align: 'end' },
  { id: 'name', header: 'Name', cell: (r) => r.name, sortValue: (r) => r.name },
  { id: 'format', header: 'Format', cell: (r) => r.format, sortValue: (r) => r.format, width: 6 },
  { id: 'size', header: 'Size', cell: (r) => r.size, width: 7 },
  { id: 'users', header: 'Used by', cell: (r) => r.users, sortValue: (r) => r.users, width: 5, align: 'end' },
];

// ---------------------------------------------------------------- the page

export function Gallery() {
  const params = new URLSearchParams(window.location.search);
  const scale = Number(params.get('scale') ?? '1');
  const [density, setDensity] = useState<Density>(params.get('density') === 'compact' ? 'compact' : 'comfortable');
  const [uiScale, setUiScale] = useState(UI_SCALES.includes(scale as (typeof UI_SCALES)[number]) ? scale : 1);
  useLayoutEffect(() => applySettings({ uiScale, density }), [uiScale, density]);

  const [pressed, setPressed] = useState({ wire: false, grid: true, tex: true });
  const [check, setCheck] = useState(true);
  const [mode, setMode] = useState<'object' | 'group'>('object');
  const [lod, setLod] = useState(0);
  const [text, setText] = useState('Table_01');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'textures' | 'strings' | 'scripts'>('textures');
  const [dialog, setDialog] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0, 1, 4]));
  const [selected, setSelected] = useState<Set<number>>(new Set([5]));
  const [focusKey, setFocusKey] = useState<number | null>(5);
  const [textureKey, setTextureKey] = useState<number | null>(102);
  const [scene, setScene] = useState<string | null>('M11/M11_main');
  const [split, setSplit] = useState(240);
  const context = useContextMenu('Object');

  const treeItems = useMemo(() => {
    const out: Node[] = [];
    const walk = (parent: number, depth: number) => {
      for (const n of SAMPLE_TREE.filter((t) => t.parent === parent)) {
        if (search && !n.label.toLowerCase().includes(search.toLowerCase()) && n.kind !== 'room') continue;
        const hasChildren = SAMPLE_TREE.some((t) => t.parent === n.key);
        out.push({ key: n.key, depth, label: n.label, hasChildren, expanded: expanded.has(n.key), kind: n.kind });
        if (hasChildren && expanded.has(n.key)) walk(n.key, depth + 1);
      }
    };
    walk(-1, 0);
    return out;
  }, [expanded, search]);

  const menus: { id: string; label: string; items: MenuEntry[] }[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'open', label: 'Open Scene…', shortcut: 'Ctrl+O', onSelect: () => setDialog(true) },
        { id: 'game', label: 'Choose Game…', onSelect: () => {} },
        { kind: 'separator', id: 's1' },
        {
          kind: 'submenu',
          id: 'recent',
          label: 'Recent Scenes',
          items: [
            { id: 'r1', label: 'M11/M11_main', onSelect: () => {} },
            { id: 'r2', label: 'M01/M01_main', onSelect: () => {} },
          ],
        },
        { kind: 'separator', id: 's2' },
        { id: 'settings', label: 'Settings…', shortcut: 'Ctrl+,', onSelect: () => {} },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'undo', label: 'Undo Hide 3 objects', shortcut: 'Ctrl+Z', onSelect: () => {} },
        { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y', disabled: true, disabledReason: 'Nothing to redo', onSelect: () => {} },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'wire', label: 'Wireframe', checked: pressed.wire, onSelect: () => setPressed((p) => ({ ...p, wire: !p.wire })) },
        { id: 'grid', label: 'Grid', shortcut: 'G', checked: pressed.grid, onSelect: () => setPressed((p) => ({ ...p, grid: !p.grid })) },
        { kind: 'separator', id: 's3' },
        { id: 'lit', label: 'Lit', radio: true, checked: true, onSelect: () => {} },
        { id: 'unlit', label: 'Unlit', radio: true, checked: false, onSelect: () => {} },
      ],
    },
  ];

  const listEntries: ListEntry<string>[] = [
    { kind: 'group', key: 'M01', label: 'M01' },
    { kind: 'item', key: 'M01/M01_main', label: 'M01_main' },
    { kind: 'item', key: 'M01/M01_intro', label: 'M01_intro' },
    { kind: 'group', key: 'M11', label: 'M11' },
    { kind: 'item', key: 'M11/M11_main', label: 'M11_main' },
    { kind: 'item', key: 'M11/M11_outro', label: 'M11_outro', disabled: true },
  ];

  return (
    <div className="gallery" data-testid="gallery">
      <header className="gallery-header">
        <h1>Hitman: Blood Money Editor · UI primitives</h1>
        <Select
          label="UI scale"
          value={uiScale}
          options={UI_SCALES.map((s) => ({ value: s, label: `${Math.round(s * 100)}%` }))}
          onChange={setUiScale}
        />
        <RadioGroup
          label="Density"
          orientation="horizontal"
          value={density}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
          onChange={setDensity}
        />
      </header>

      <main className="gallery-grid">
        <Specimen title="Menu bar" note="F10 or Alt focuses it. Arrow keys, Home/End, type-ahead, Escape.">
          <div className="gallery-frame">
            <MenuBar label="Main menu" menus={menus}>
              <span className="gallery-menubar-context">M11/M11_main</span>
            </MenuBar>
          </div>
        </Specimen>

        <Specimen title="Buttons">
          <div className="gallery-row">
            <Button primary>Open</Button>
            <Button>Cancel</Button>
            <Button disabled>Disabled</Button>
            <Button variant="tool" icon={Frame}>
              Frame
            </Button>
            <Button variant="link">Show in Output</Button>
          </div>
        </Specimen>

        <Specimen title="Toolbar" note="One tab stop; arrows move. Toggles announce pressed state.">
          <Toolbar label="Viewport display">
            <IconButton icon={Undo2} label="Undo" shortcut="Ctrl+Z" />
            <IconButton icon={Redo2} label="Redo" shortcut="Ctrl+Y" disabled />
            <ToolbarSeparator />
            <ToggleButton label="Wireframe" icon={Scan} pressed={pressed.wire} onPressedChange={(v) => setPressed((p) => ({ ...p, wire: v }))} />
            <ToggleButton pressed={pressed.grid} onPressedChange={(v) => setPressed((p) => ({ ...p, grid: v }))} label="Grid" shortcut="G">
              Grid
            </ToggleButton>
            <ToggleButton pressed={pressed.tex} onPressedChange={(v) => setPressed((p) => ({ ...p, tex: v }))}>
              Textures
            </ToggleButton>
            <ToolbarSeparator />
            <Select
              label="Level of detail"
              hideLabel
              compact
              value={lod}
              options={Array.from({ length: 4 }, (_, i) => ({ value: i, label: `LOD ${i}` }))}
              onChange={setLod}
            />
            <IconButton icon={Settings} label="Settings" variant="flat" />
          </Toolbar>
        </Specimen>

        <Specimen title="Vertical toolbar">
          <div className="gallery-rail">
            <Toolbar label="Scene tools" orientation="vertical">
              <ToolbarGroupLabel>Select</ToolbarGroupLabel>
              <ToggleButton pressed={mode === 'object'} onPressedChange={() => setMode('object')}>
                Object
              </ToggleButton>
              <ToggleButton pressed={mode === 'group'} onPressedChange={() => setMode('group')}>
                Group
              </ToggleButton>
              <ToolbarGroupLabel>Frame</ToolbarGroupLabel>
              <Button variant="tool">All</Button>
              <Button variant="tool">Selection</Button>
            </Toolbar>
          </div>
        </Specimen>

        <Specimen title="Fields">
          <div className="gallery-stack">
            <TextField label="Name" value={text} onCommit={setText} hint="Enter commits, Escape reverts." />
            <TextField label="Path" value="M11/M11_Briefing.zip" readOnly mono />
            <TextField label="Scale" value="abc" invalid hint="Enter a number." onCommit={() => false} />
            <VectorField label="Position" value={[1204.5, -32, 88.125]} readOnly />
            <SearchField label="Filter objects" value={search} onChange={setSearch} placeholder="Filter objects" count={`${treeItems.length} shown`} />
          </div>
        </Specimen>

        <Specimen title="Choices">
          <div className="gallery-stack">
            <Checkbox checked={check} onChange={setCheck} description="Also lists classes that no object in this scene uses.">
              Show unused script classes
            </Checkbox>
            <Checkbox checked={false} onChange={() => {}} disabled>
              Disabled option
            </Checkbox>
            <RadioGroup
              label="Sort"
              showLabel
              value={mode}
              options={[
                { value: 'object', label: 'Scene order' },
                { value: 'group', label: 'A–Z' },
              ]}
              onChange={setMode}
            />
            <Select
              label="Level of detail"
              value={lod}
              options={[
                { value: 0, label: 'LOD 0 (highest)' },
                { value: 1, label: 'LOD 1' },
                { value: 2, label: 'LOD 2' },
                { value: 3, label: 'LOD 3 (not in this model)', disabled: true },
              ]}
              onChange={setLod}
            />
          </div>
        </Specimen>

        <Specimen title="Tabs">
          <Tabs
            label="Content"
            idPrefix="gallery"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'textures', label: 'Textures' },
              { id: 'strings', label: 'Strings' },
              { id: 'scripts', label: 'Scripts' },
            ]}
          />
          <TabPanel idPrefix="gallery" id={tab} className="gallery-tabpanel">
            Showing {tab}.
          </TabPanel>
        </Specimen>

        <Specimen title="Tooltip and hover card" note="Hover, or focus with the keyboard. Escape hides.">
          <div className="gallery-row">
            <Tooltip title="Frame selection" shortcut="F" description="Move the camera to fit the selected objects.">
              <Button variant="tool" icon={Frame}>
                Frame
              </Button>
            </Tooltip>
            <HoverCard
              content={
                <>
                  <b>GMS</b> · Geometry scene. The level&apos;s object hierarchy: every placed object with its parent, class and
                  transform.
                </>
              }
            >
              <button type="button" className="gallery-term">
                GMS record
              </button>
            </HoverCard>
            <span>
              Chords: <Kbd chord="Ctrl+Shift+P" /> <Kbd chord="Alt+1" />
            </span>
          </div>
        </Specimen>

        <Specimen title="Tree" note="Up/Down, Shift range, Ctrl+Space toggle, Right/Left, *, type-ahead, Enter.">
          <div className="gallery-box">
            <Tree
              label="Scene objects"
              items={treeItems}
              selected={selected}
              focusKey={focusKey}
              onFocusChange={setFocusKey}
              onToggle={(key) =>
                setExpanded((e) => {
                  const next = new Set(e);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              onSelect={(key, m) =>
                setSelected((s) => {
                  if (m.toggle) {
                    const next = new Set(s);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  }
                  if (m.range && focusKey !== null) {
                    const a = treeItems.findIndex((i) => i.key === [...s][0]);
                    const b = treeItems.findIndex((i) => i.key === key);
                    return new Set(treeItems.slice(Math.min(a, b), Math.max(a, b) + 1).map((i) => i.key));
                  }
                  return new Set([key]);
                })
              }
              onContextMenu={(key, at) =>
                context.openAt(
                  [
                  { id: 'frame', label: 'Frame', shortcut: 'F', onSelect: () => toast({ kind: 'info', title: `Framed ${key}` }) },
                  { id: 'hide', label: 'Hide', shortcut: 'H', onSelect: () => {} },
                  { kind: 'separator', id: 's' },
                  { id: 'copy', label: 'Copy Path', onSelect: () => {} },
                  ],
                  at.x,
                  at.y,
                )
              }
              renderItem={(item) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <>
                    <Icon className="ui-icon gallery-kind" aria-hidden="true" strokeWidth={1.75} />
                    <span className="ui-tree-label">{item.label}</span>
                    {item.key === 3 && <Eye className="ui-icon" aria-label="Hidden" />}
                    {item.key === 8 && <Lock className="ui-icon" aria-label="Frozen" />}
                  </>
                );
              }}
            />
            {context.element}
          </div>
        </Specimen>

        <Specimen title="Data table" note="Click headers to sort; drag header edges to resize.">
          <div className="gallery-box">
            <DataTable
              label="Textures"
              columns={TEXTURE_COLUMNS}
              rows={TEXTURES}
              rowKey={(r) => r.id}
              selectedKey={textureKey}
              onSelect={setTextureKey}
            />
          </div>
        </Specimen>

        <Specimen title="List box">
          <div className="gallery-box gallery-box--short">
            <ListBox label="Scenes" entries={listEntries} selectedKey={scene} onSelect={setScene} />
          </div>
        </Specimen>

        <Specimen title="Sections" note="Friendly first; raw detail collapsed.">
          <div className="gallery-box gallery-box--auto">
            <Section title="Transform" meta="world">
              <div className="gallery-pad">
                <VectorField label="Position" value={[1, 2, 3]} readOnly />
              </div>
            </Section>
            <Section title="Raw" tone="raw" defaultOpen={false} meta="GMS record, type id">
              <div className="gallery-pad">TypeId 0x00100001</div>
            </Section>
          </div>
        </Specimen>

        <Specimen title="Panel states">
          <div className="gallery-states">
            <div className="gallery-box gallery-box--state">
              <PanelState variant="loading" title="Reading textures…" />
            </div>
            <div className="gallery-box gallery-box--state">
              <PanelState variant="empty" title="No textures match “brick”" action={{ label: 'Clear Search', onClick: () => {} }} />
            </div>
            <div className="gallery-box gallery-box--state">
              <PanelState
                variant="error"
                title="Couldn't read this object"
                message="M11_main.PRP is in use by another program. Close the game and try again."
                action={{ label: 'Retry', onClick: () => {} }}
              />
            </div>
            <div className="gallery-box gallery-box--state">
              <PanelState variant="offline" title="The editor server stopped" message="Start it again with start.bat." action={{ label: 'Try Again', onClick: () => {} }} />
            </div>
          </div>
        </Specimen>

        <Specimen title="Badges, progress, splitter">
          <div className="gallery-stack">
            <div className="gallery-row">
              <Badge>LOD 0</Badge>
              <Badge tone="info">HBM</Badge>
              <Badge tone="success">Applied</Badge>
              <Badge tone="warning">3 problems</Badge>
              <Badge tone="danger">2 errors</Badge>
              <Badge tone="accent">Modified</Badge>
            </div>
            <ProgressBar label="Loading models" value={120} max={400} detail="120 / 400" />
            <ProgressBar label="Reading script DLL" detail="Reading…" />
            <div className="gallery-split">
              <div className="gallery-pane" style={{ width: split }}>
                {split}px
              </div>
              <Splitter label="Resize panes" orientation="vertical" value={split} min={120} max={360} onChange={setSplit} />
              <div className="gallery-pane gallery-pane--grow">Other pane</div>
            </div>
          </div>
        </Specimen>

        <Specimen title="Dialog and toasts">
          <div className="gallery-row">
            <Button onClick={() => setDialog(true)}>Open Dialog…</Button>
            <Button onClick={() => toast({ kind: 'info', title: 'Opened M11_main', message: '11,945 objects, 2,977 models' })}>Info Toast</Button>
            <Button
              onClick={() =>
                toast({
                  kind: 'warning',
                  title: '12 models couldn’t be read',
                  message: 'They are left out of the viewport.',
                  action: { label: 'Show in Output', onClick: () => {} },
                })
              }
            >
              Warning Toast
            </Button>
            <Button onClick={() => toast({ kind: 'error', title: 'Couldn’t open M11_main', message: 'The game file couldn’t be read.' })}>
              Error Toast
            </Button>
          </div>
        </Specimen>
      </main>

      {dialog && (
        <Dialog
          title="Open Scene"
          width={30}
          onClose={() => setDialog(false)}
          onSubmit={() => setDialog(false)}
          description="Choose a scene from your Hitman: Blood Money install."
          buttons={
            <>
              <Button type="submit" primary>
                Open
              </Button>
              <Button onClick={() => setDialog(false)}>Cancel</Button>
            </>
          }
        >
          <SearchField label="Filter scenes" value={search} onChange={setSearch} placeholder="Filter scenes" initialFocus />
          <div className="gallery-box gallery-box--short">
            <ListBox label="Scenes" entries={listEntries} selectedKey={scene} onSelect={setScene} onActivate={() => setDialog(false)} />
          </div>
        </Dialog>
      )}
      <ToastRegion />
    </div>
  );
}
