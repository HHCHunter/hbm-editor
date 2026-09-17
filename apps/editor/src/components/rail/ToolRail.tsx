import { useShallow } from 'zustand/react/shallow';
import { invertSelection, openDialog, zoomExtents, zoomSelected } from '../../state/actions';
import { useEditor, type SelMode } from '../../state/store';
import { GroupHeader, Radio, TextButton } from '../chrome/widgets';

const SEL_MODES: [mode: SelMode, label: string][] = [
  ['Geom', 'Object'],
  ['Group', 'Group'],
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
        {SEL_MODES.map(([mode, label]) => (
          <Radio key={mode} label={label} checked={ui.selMode === mode} onSelect={() => setSelMode(mode)} />
        ))}
      </div>
      <TextButton label="Invert" className="btn-text first" onClick={invertSelection} />

      <GroupHeader>Frame</GroupHeader>
      <TextButton label="All" onClick={zoomExtents} />
      <TextButton label="Selection" onClick={zoomSelected} />

      <GroupHeader>History</GroupHeader>
      <TextButton label="Undo" onClick={ui.undo} />
      <TextButton label="Redo" onClick={ui.redo} />
    </div>
  );
}
