import { DEFAULT_KEYMAP } from '../../commands/defaultKeymap';
import {
  openDialog,
  resetViewAngle,
  setStatus,
  setTab,
  toggleFreezeSelection,
  toggleHideSelection,
  toggleViewFlag,
  zoomExtents,
  zoomSelected,
} from '../../state/actions';
import type { EditorStore, Tab, ViewFlag } from '../../state/store';
import type { MenuBarMenu, MenuEntry } from '../../ui';

const keys = DEFAULT_KEYMAP;
const sep = (id: string): MenuEntry => ({ kind: 'separator', id });

/** The menu bar, with enabled and checked states from the editor state. */
export function buildMenus(s: EditorStore): MenuBarMenu[] {
  const noScene = !s.scene;
  const noSelection = !s.sel.length;
  const lastUndo = s.undoStack.at(-1);
  const lastRedo = s.redoStack.at(-1);

  const flag = (id: string, label: string, key: ViewFlag, shortcut?: string): MenuEntry => ({
    id,
    label,
    shortcut,
    checked: s.view[key],
    onSelect: () => toggleViewFlag(key),
  });
  const tab = (id: keyof typeof keys & `window.${string}`, label: string, value: Tab): MenuEntry => ({
    id,
    label,
    shortcut: keys[id],
    radio: true,
    checked: s.tab === value,
    onSelect: () => setTab(value),
  });

  return [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'file.openScene', label: 'Open Scene…', shortcut: keys['file.openScene'], onSelect: () => openDialog('sceneOpen') },
        { id: 'file.chooseGame', label: 'Choose Game…', onSelect: () => openDialog('gamePicker') },
        sep('file.s1'),
        { id: 'file.settings', label: 'Settings…', shortcut: keys['file.settings'], onSelect: () => openDialog('settings') },
        sep('file.s2'),
        { id: 'file.exit', label: 'Exit', onSelect: () => setStatus('Close this tab and the launcher window to exit.') },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          id: 'edit.undo',
          label: lastUndo ? `Undo ${lastUndo.label}` : 'Undo',
          shortcut: keys['edit.undo'],
          disabled: !lastUndo,
          disabledReason: 'Nothing to undo',
          onSelect: () => s.undo(),
        },
        {
          id: 'edit.redo',
          label: lastRedo ? `Redo ${lastRedo.label}` : 'Redo',
          shortcut: keys['edit.redo'],
          disabled: !lastRedo,
          disabledReason: 'Nothing to redo',
          onSelect: () => s.redo(),
        },
        sep('edit.s1'),
        {
          id: 'edit.hide',
          label: 'Hide Selection',
          shortcut: keys['edit.hide'],
          disabled: noSelection,
          disabledReason: 'Select objects first',
          onSelect: toggleHideSelection,
        },
        {
          id: 'edit.freeze',
          label: 'Freeze Selection',
          disabled: noSelection,
          disabledReason: 'Select objects first',
          onSelect: toggleFreezeSelection,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        flag('view.wireframe', 'Wireframe', 'W', keys['view.wireframe']),
        flag('view.lighting', 'Lighting', 'Li'),
        flag('view.textures', 'Textures', 'Tx'),
        flag('view.fog', 'Fog', 'F'),
        flag('view.grid', 'Grid', 'G', keys['view.grid']),
        flag('view.markers', 'Markers', 'P'),
        flag('view.skeletons', 'Skeletons', 'Bn'),
        sep('view.s1'),
        {
          id: 'view.frameAll',
          label: 'Frame All',
          shortcut: keys['view.frameAll'],
          disabled: noScene,
          disabledReason: 'Open a scene first',
          onSelect: zoomExtents,
        },
        {
          id: 'view.frameSelected',
          label: 'Frame Selected',
          shortcut: keys['view.frameSelected'],
          disabled: noSelection,
          disabledReason: 'Select objects first',
          onSelect: zoomSelected,
        },
        { id: 'view.resetAngle', label: 'Default View Angle', disabled: noScene, onSelect: resetViewAngle },
      ],
    },
    {
      id: 'window',
      label: 'Window',
      items: [
        tab('window.scene', 'Scene', 'scene'),
        tab('window.textures', 'Textures', 'textures'),
        tab('window.localisation', 'Localisation', 'localisation'),
        tab('window.scripts', 'Scripts', 'scripts'),
        tab('window.animations', 'Animations', 'animations'),
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        {
          id: 'help.about',
          label: 'About',
          onSelect: () => setStatus('Hitman: Blood Money Editor · reads your game files through the local server'),
        },
      ],
    },
  ];
}
