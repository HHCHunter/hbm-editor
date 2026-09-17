import { useShallow } from 'zustand/react/shallow';
import { invertSelection, resetCamera, setStatus, zoomSelected } from '../../state/actions';
import { useEditor, type EditorState, type GizmoKind, type GizmoMode } from '../../state/store';
import { GroupHeader, IconButton, Radio, TextButton } from '../chrome/widgets';

type Icon = [glyph: string, title: string];

const VIEWPORT_TOOLS: Icon[] = [
  ['✥', 'Pan'],
  ['⟳', 'Orbit'],
  ['⌕', 'Zoom'],
  ['⊡', 'Zoom window'],
  ['◱', 'Maximise viewport'],
  ['⎔', 'Safe frame'],
];

const TRANSFORM_TOOLS: [glyph: string, title: string, mode?: GizmoMode][] = [
  ['✛', 'Move', 'move'],
  ['⟲', 'Rotate', 'rotate'],
  ['⤢', 'Scale', 'scale'],
  ['⊕', 'Align'],
  ['⇲', 'Drop to floor'],
  ['⌗', 'Array'],
];

const PRIMITIVES: Icon[] = [
  ['▣', 'Box'],
  ['◍', 'Sphere'],
  ['◇', 'Plane'],
  ['♪', 'Sound emitter'],
  ['⚑', 'Trigger'],
  ['⌖', 'Path node'],
];

function setUi<K extends keyof EditorState>(key: K, value: EditorState[K], message?: string) {
  useEditor.getState().update((s) => {
    (s as EditorState)[key] = value;
    if (message) s.statusMsg = message;
  });
}

export function ToolRail() {
  const ui = useEditor(
    useShallow((s) => ({
      selMode: s.selMode,
      coord: s.coord,
      pivot: s.pivot,
      gizmoMode: s.gizmoMode,
      snap: s.snap,
      snapAngle: s.snapAngle,
      snapX: s.snapX,
      snapY: s.snapY,
      snapZ: s.snapZ,
      gizmoKind: s.gizmoKind,
      undo: s.undo,
      redo: s.redo,
    })),
  );

  return (
    <div className="rail">
      <GroupHeader>Viewport</GroupHeader>
      <div className="rail-grid">
        {VIEWPORT_TOOLS.map(([glyph, title]) => (
          <IconButton key={title} glyph={glyph} title={title} onClick={() => setStatus(title)} />
        ))}
      </div>

      <GroupHeader>Geometry</GroupHeader>
      <div className="radio-group">
        {(['Geom', 'Group', 'World'] as const).map((mode) => (
          <Radio key={mode} label={mode} checked={ui.selMode === mode} onSelect={() => setUi('selMode', mode)} />
        ))}
      </div>
      <div className="rail-grid">
        {TRANSFORM_TOOLS.map(([glyph, title, mode]) => (
          <IconButton
            key={title}
            glyph={glyph}
            title={title}
            active={mode === ui.gizmoMode}
            onClick={() => (mode ? setUi('gizmoMode', mode, title) : setStatus(title))}
          />
        ))}
      </div>

      <GroupHeader>Coord Sys</GroupHeader>
      <div className="radio-group">
        {(['Local', 'Global'] as const).map((c) => (
          <Radio key={c} label={c} checked={ui.coord === c} onSelect={() => setUi('coord', c)} />
        ))}
      </div>

      <GroupHeader>Pivot</GroupHeader>
      <div className="radio-group">
        {(['Center', 'Position', 'Average'] as const).map((p) => (
          <Radio key={p} label={p} checked={ui.pivot === p} onSelect={() => setUi('pivot', p)} />
        ))}
      </div>
      <TextButton label="Invert" className="btn-text first" onClick={invertSelection} />
      <TextButton
        label="Snap"
        active={ui.snap}
        onClick={() => setUi('snap', !ui.snap, `Snap ${ui.snap ? 'off' : 'on'}`)}
      />

      <GroupHeader>Zoom Extent</GroupHeader>
      <TextButton label="All" onClick={() => resetCamera('Zoom extents: all')} />
      <TextButton label="Selected" onClick={zoomSelected} />

      <GroupHeader>Primitive</GroupHeader>
      <div className="rail-grid">
        {PRIMITIVES.map(([glyph, title]) => (
          <IconButton key={title} glyph={glyph} title={title} onClick={() => setStatus(title)} />
        ))}
      </div>

      <GroupHeader>History</GroupHeader>
      <TextButton label="Undo" onClick={ui.undo} />
      <TextButton label="Redo" onClick={ui.redo} />
      <TextButton label="View" onClick={() => resetCamera('View reset')} />

      <GroupHeader>Settings</GroupHeader>
      <div className="rail-label">Snap Angle:</div>
      <input
        className="rail-input sunken-input"
        value={ui.snapAngle}
        onChange={(e) => setUi('snapAngle', e.target.value)}
      />
      <div className="rail-label">Snap XYZ:</div>
      {(['snapX', 'snapY', 'snapZ'] as const).map((key) => (
        <input
          key={key}
          className="rail-input sunken-input"
          value={ui[key]}
          onChange={(e) => setUi(key, e.target.value)}
        />
      ))}

      <GroupHeader>Gizmos</GroupHeader>
      <select
        className="rail-select"
        value={ui.gizmoKind}
        onChange={(e) => {
          const kind = e.target.value as GizmoKind;
          setUi('gizmoKind', kind, `Gizmos: ${kind}`);
        }}
      >
        <option value="Lights">Lights</option>
        <option value="Sound">Sound</option>
        <option value="Paths">Paths</option>
        <option value="None">None</option>
      </select>
    </div>
  );
}
