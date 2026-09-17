import { Crosshair, Expand, FolderOpen, HardDrive, Redo2, Undo2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { DEFAULT_KEYMAP } from '../../commands/defaultKeymap';
import { invertSelection, openDialog, zoomExtents, zoomSelected } from '../../state/actions';
import { useEditor, type SelMode } from '../../state/store';
import { Button, RadioGroup, Toolbar, ToolbarGroupLabel } from '../../ui';

function setSelMode(mode: SelMode) {
  useEditor.getState().update((s) => {
    s.selMode = mode;
    s.statusMsg = mode === 'Group' ? 'Viewport clicks select the enclosing group' : 'Viewport clicks select the object';
  });
}

export function ToolRail() {
  const ui = useEditor(
    useShallow((s) => ({
      selMode: s.selMode,
      undo: s.undo,
      redo: s.redo,
      canUndo: s.undoStack.length > 0,
      canRedo: s.redoStack.length > 0,
      hasScene: !!s.scene,
      hasSelection: s.sel.length > 0,
    })),
  );

  return (
    <div className="rail">
      <Toolbar label="Scene tools" orientation="vertical">
        <ToolbarGroupLabel>Scene</ToolbarGroupLabel>
        <Button variant="tool" icon={FolderOpen} onClick={() => openDialog('sceneOpen')} aria-keyshortcuts={DEFAULT_KEYMAP['file.openScene']}>
          Open…
        </Button>
        <Button variant="tool" icon={HardDrive} onClick={() => openDialog('gamePicker')}>
          Game…
        </Button>

        <ToolbarGroupLabel>Frame</ToolbarGroupLabel>
        <Button variant="tool" icon={Expand} disabled={!ui.hasScene} onClick={zoomExtents} aria-keyshortcuts={DEFAULT_KEYMAP['view.frameAll']}>
          All
        </Button>
        <Button
          variant="tool"
          icon={Crosshair}
          disabled={!ui.hasSelection}
          onClick={zoomSelected}
          aria-keyshortcuts={DEFAULT_KEYMAP['view.frameSelected']}
        >
          Selection
        </Button>

        <ToolbarGroupLabel>History</ToolbarGroupLabel>
        <Button variant="tool" icon={Undo2} disabled={!ui.canUndo} onClick={ui.undo} aria-keyshortcuts={DEFAULT_KEYMAP['edit.undo']}>
          Undo
        </Button>
        <Button variant="tool" icon={Redo2} disabled={!ui.canRedo} onClick={ui.redo} aria-keyshortcuts={DEFAULT_KEYMAP['edit.redo']}>
          Redo
        </Button>
      </Toolbar>

      <div className="rail-group">
        <ToolbarGroupLabel>Click selects</ToolbarGroupLabel>
        <RadioGroup<SelMode>
          label="Click selects"
          value={ui.selMode}
          options={[
            { value: 'Geom', label: 'Object' },
            { value: 'Group', label: 'Group' },
          ]}
          onChange={setSelMode}
        />
        <Button variant="tool" disabled={!ui.hasScene} onClick={invertSelection}>
          Invert Selection
        </Button>
      </div>
    </div>
  );
}
