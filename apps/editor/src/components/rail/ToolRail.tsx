import { useShallow } from 'zustand/react/shallow';
import { invertSelection, openDialog, setStatus, zoomExtents, zoomSelected } from '../../state/actions';
import { DEFAULT_CAMERA, useEditor, type SelMode } from '../../state/store';
import { GroupHeader, IconButton, Radio, TextButton } from '../chrome/widgets';

type Icon = [glyph: string, title: string];

// Editing tools arrive with the writers; until then they explain themselves in the status bar.
const TRANSFORM_TOOLS: Icon[] = [
  ['✛', 'Move'],
  ['⟲', 'Rotate'],
  ['⤢', 'Scale'],
  ['⊕', 'Align'],
  ['⇲', 'Drop to floor'],
  ['⌗', 'Array'],
];

function setSelMode(mode: SelMode) {
  useEditor.getState().update((s) => {
    s.selMode = mode;
    s.statusMsg = mode === 'Group' ? 'Viewport clicks select the enclosing group' : 'Viewport clicks select the object';
  });
}

export function ToolRail() {
  const ui = useEditor(useShallow((s) => ({ selMode: s.selMode, undo: s.undo, redo: s.redo })));

  return (
    <div className="rail">
      <GroupHeader>Scene</GroupHeader>
      <TextButton label="Open…" onClick={() => openDialog('sceneOpen')} />
      <TextButton label="Game…" onClick={() => openDialog('gamePicker')} />

      <GroupHeader>Select</GroupHeader>
      <div className="radio-group">
        {(['Geom', 'Group'] as const).map((mode) => (
          <Radio key={mode} label={mode} checked={ui.selMode === mode} onSelect={() => setSelMode(mode)} />
        ))}
      </div>
      <TextButton label="Invert" className="btn-text first" onClick={invertSelection} />

      <GroupHeader>Transform</GroupHeader>
      <div className="rail-grid">
        {TRANSFORM_TOOLS.map(([glyph, title]) => (
          <IconButton
            key={title}
            glyph={glyph}
            title={`${title} (read-only for now)`}
            onClick={() => setStatus(`${title}: editing scenes isn't available yet`)}
          />
        ))}
      </div>

      <GroupHeader>Zoom Extent</GroupHeader>
      <TextButton label="All" onClick={zoomExtents} />
      <TextButton label="Selected" onClick={zoomSelected} />

      <GroupHeader>History</GroupHeader>
      <TextButton label="Undo" onClick={ui.undo} />
      <TextButton label="Redo" onClick={ui.redo} />
      <TextButton
        label="View"
        onClick={() =>
          useEditor.getState().update((s) => {
            s.cam = { ...s.cam, yaw: DEFAULT_CAMERA.yaw, pitch: DEFAULT_CAMERA.pitch };
            s.statusMsg = 'View angle reset';
          })
        }
      />
    </div>
  );
}
