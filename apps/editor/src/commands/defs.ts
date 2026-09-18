import {
  Crosshair,
  Expand,
  EyeOff,
  FolderOpen,
  HardDrive,
  Keyboard,
  Lock,
  Redo2,
  RotateCcw,
  Scan,
  Search,
  Settings,
  Undo2,
} from 'lucide-react';
import type { HiddenReasonDTO } from '@hbm/protocol';
import {
  clearSelection,
  invertSelection,
  openDialog,
  resetViewAngle,
  selectAll,
  setAllExpanded,
  setSelMode,
  setTab,
  toggleFreezeSelection,
  toggleHideSelection,
  toggleShown,
  toggleViewFlag,
  unfreezeAll,
  unhideAll,
  VIEW_ANGLES,
  viewFrom,
  zoomExtents,
  zoomSelected,
} from '../state/actions';
import type { Tab, ViewFlag } from '../state/store';
import { toast } from '../ui';
import { openPalette } from './palette';
import type { CommandContext, EditorCommand } from './types';

const needScene = ({ state }: CommandContext) => (state.scene ? null : 'Open a scene first');
const needSelection = ({ state }: CommandContext) =>
  !state.scene ? 'Open a scene first' : state.sel.length ? null : 'Select one or more objects first';

const viewFlag = (id: string, flag: ViewFlag, title: string, description: string, icon?: EditorCommand['icon']): EditorCommand => ({
  id,
  title,
  category: 'View',
  description,
  icon,
  scope: 'sceneView',
  checked: ({ state }) => state.view[flag],
  run: () => toggleViewFlag(flag),
});

const shown = (reason: HiddenReasonDTO, title: string, description: string): EditorCommand => ({
  id: `view.show.${reason}`,
  title,
  category: 'View',
  description,
  keywords: ['show', 'hidden geometry'],
  scope: 'sceneView',
  checked: ({ state }) => state.filters.show[reason],
  run: () => toggleShown(reason),
});

const windowTab = (tab: Tab, title: string): EditorCommand => ({
  id: `window.${tab}`,
  title,
  category: 'Window',
  description: `Show the ${title} tab`,
  radio: true,
  scope: 'global',
  checked: ({ state }) => state.tab === tab,
  run: () => setTab(tab),
});

const SIDES = Object.keys(VIEW_ANGLES) as (keyof typeof VIEW_ANGLES)[];

export const COMMANDS: EditorCommand[] = [
  // ---------------------------------------------------------------- file
  {
    id: 'file.openScene',
    title: 'Open Scene…',
    category: 'File',
    description: 'Choose a mission scene to open',
    icon: FolderOpen,
    keywords: ['mission', 'level', 'load'],
    scope: 'global',
    run: () => openDialog('sceneOpen'),
  },
  {
    id: 'file.chooseGame',
    title: 'Choose Game…',
    category: 'File',
    description: 'Point the editor at your Hitman: Blood Money install',
    icon: HardDrive,
    keywords: ['install', 'folder', 'path'],
    scope: 'global',
    run: () => openDialog('gamePicker'),
  },
  {
    id: 'file.settings',
    title: 'Settings…',
    category: 'File',
    description: 'Interface size and row spacing',
    icon: Settings,
    keywords: ['preferences', 'options', 'scale', 'zoom', 'font size', 'density'],
    scope: 'global',
    run: () => openDialog('settings'),
  },

  // ---------------------------------------------------------------- edit
  {
    id: 'edit.undo',
    title: 'Undo',
    category: 'Edit',
    icon: Undo2,
    label: ({ state }) => (state.undoStack.at(-1) ? `Undo ${state.undoStack.at(-1)!.label}` : 'Undo'),
    disabledReason: ({ state }) => (state.undoStack.length ? null : 'Nothing to undo'),
    run: ({ state }) => state.undo(),
  },
  {
    id: 'edit.redo',
    title: 'Redo',
    category: 'Edit',
    icon: Redo2,
    label: ({ state }) => (state.redoStack.at(-1) ? `Redo ${state.redoStack.at(-1)!.label}` : 'Redo'),
    disabledReason: ({ state }) => (state.redoStack.length ? null : 'Nothing to redo'),
    run: ({ state }) => state.redo(),
  },
  {
    id: 'edit.hide',
    title: 'Hide Selection',
    category: 'Edit',
    description: 'Hide or show the selected objects in the editor. The game files are not changed.',
    icon: EyeOff,
    keywords: ['visibility', 'unhide', 'show'],
    disabledReason: needSelection,
    run: toggleHideSelection,
  },
  {
    id: 'edit.unhideAll',
    title: 'Unhide All',
    category: 'Edit',
    description: 'Show every object you hid',
    keywords: ['visibility', 'show all'],
    disabledReason: ({ state }) => (Object.keys(state.hidden).length ? null : 'Nothing is hidden'),
    run: unhideAll,
  },
  {
    id: 'edit.freeze',
    title: 'Freeze Selection',
    category: 'Edit',
    description: "Freeze or unfreeze the selected objects, so viewport clicks go through them. The game files are not changed.",
    icon: Lock,
    keywords: ['lock', 'unfreeze'],
    disabledReason: needSelection,
    run: toggleFreezeSelection,
  },
  {
    id: 'edit.unfreezeAll',
    title: 'Unfreeze All',
    category: 'Edit',
    description: 'Make every frozen object clickable again',
    keywords: ['unlock'],
    disabledReason: ({ state }) => (Object.keys(state.frozen).length ? null : 'Nothing is frozen'),
    run: unfreezeAll,
  },

  // ---------------------------------------------------------------- selection
  {
    id: 'selection.all',
    title: 'Select All',
    category: 'Selection',
    disabledReason: needScene,
    run: selectAll,
  },
  {
    id: 'selection.none',
    title: 'Select None',
    category: 'Selection',
    keywords: ['deselect', 'clear'],
    scope: 'sceneView',
    disabledReason: ({ state }) => (state.sel.length ? null : 'Nothing is selected'),
    run: () => clearSelection(),
  },
  {
    id: 'selection.invert',
    title: 'Invert Selection',
    category: 'Selection',
    disabledReason: needScene,
    run: invertSelection,
  },
  {
    id: 'selection.pickObjects',
    title: 'Clicks Select Objects',
    category: 'Selection',
    description: 'A viewport click selects the object under the pointer',
    radio: true,
    checked: ({ state }) => state.selMode === 'Geom',
    run: () => setSelMode('Geom'),
  },
  {
    id: 'selection.pickGroups',
    title: 'Clicks Select Groups',
    category: 'Selection',
    description: 'A viewport click selects the outermost group around the object under the pointer',
    radio: true,
    checked: ({ state }) => state.selMode === 'Group',
    run: () => setSelMode('Group'),
  },

  // ---------------------------------------------------------------- camera
  {
    id: 'camera.frameSelected',
    title: 'Frame Selected',
    category: 'Camera',
    description: 'Move the camera to fit the selected objects',
    icon: Crosshair,
    keywords: ['zoom', 'focus', 'look at'],
    scope: 'sceneView',
    disabledReason: needSelection,
    run: zoomSelected,
  },
  {
    id: 'camera.frameAll',
    title: 'Frame All',
    category: 'Camera',
    description: 'Move the camera to fit the whole scene',
    icon: Expand,
    keywords: ['zoom extents', 'fit'],
    scope: 'sceneView',
    disabledReason: needScene,
    run: zoomExtents,
  },
  {
    id: 'camera.resetAngle',
    title: 'Default View Angle',
    category: 'Camera',
    description: 'Look from the starting angle, keeping what the camera looks at',
    icon: RotateCcw,
    keywords: ['reset'],
    scope: 'sceneView',
    disabledReason: needScene,
    run: resetViewAngle,
  },
  ...SIDES.map(
    (side): EditorCommand => ({
      id: `camera.view${side}`,
      title: `Look from the ${side}`,
      category: 'Camera',
      keywords: ['view', side.toLowerCase(), 'angle'],
      scope: 'sceneView',
      disabledReason: needScene,
      run: () => viewFrom(side),
    }),
  ),

  // ---------------------------------------------------------------- view
  viewFlag('view.wireframe', 'W', 'Wireframe', 'Draw models as outlines', Scan),
  viewFlag('view.lighting', 'Li', 'Lighting', 'Shade models by the light; off shows flat colours'),
  viewFlag('view.textures', 'Tx', 'Textures', 'Draw models with their textures'),
  viewFlag('view.fog', 'F', 'Fog', 'Fade distant models'),
  viewFlag('view.grid', 'G', 'Grid', 'Show the ground grid'),
  viewFlag('view.markers', 'P', 'Markers', 'Show objects without a model, such as lights and cameras, as points'),
  viewFlag('view.skeletons', 'Bn', 'Skeletons', "Show every character's bones, not only the selected ones"),
  shown('collision', 'Collision Geometry', "Show the invisible shapes the game uses for collisions"),
  shown('bounds', 'Bounds and Trigger Volumes', 'Show the invisible boxes that bound objects or trigger events'),
  shown('shadow', 'Shadow Geometry', 'Show the simplified models the game uses to cast shadows'),
  shown('helper', 'Helper Geometry', 'Show editor-only helper shapes'),
  shown('placeholder', 'Placeholder Geometry', 'Show stand-in shapes the game replaces at run time'),

  // ---------------------------------------------------------------- outliner
  {
    id: 'outliner.expandAll',
    title: 'Expand All',
    category: 'Outliner',
    description: 'Open every group in the outliner',
    disabledReason: needScene,
    run: () => setAllExpanded(true),
  },
  {
    id: 'outliner.collapseAll',
    title: 'Collapse All',
    category: 'Outliner',
    description: 'Close every group in the outliner',
    disabledReason: needScene,
    run: () => setAllExpanded(false),
  },

  // ---------------------------------------------------------------- window
  windowTab('scene', 'Scene'),
  windowTab('textures', 'Textures'),
  windowTab('materials', 'Materials'),
  windowTab('localisation', 'Localisation'),
  windowTab('scripts', 'Scripts'),
  windowTab('animations', 'Animations'),

  // ---------------------------------------------------------------- help
  {
    id: 'help.commandPalette',
    title: 'Command Palette…',
    category: 'Help',
    description: 'Find and run any command by name',
    icon: Search,
    keywords: ['search', 'run', 'find command'],
    scope: 'global',
    run: () => openPalette(''),
  },
  {
    id: 'help.findObject',
    title: 'Find Object…',
    category: 'Help',
    description: 'Find a scene object by name, select it and frame it',
    icon: Search,
    keywords: ['go to', 'search', 'outliner'],
    scope: 'global',
    disabledReason: needScene,
    run: () => openPalette('@'),
  },
  {
    id: 'help.keyboardShortcuts',
    title: 'Keyboard Shortcuts…',
    category: 'Help',
    description: 'See and change the keys for every command',
    icon: Keyboard,
    keywords: ['keybindings', 'hotkeys', 'keys', 'rebind'],
    scope: 'global',
    run: () => openDialog('keybindings'),
  },
  {
    id: 'help.about',
    title: 'About',
    category: 'Help',
    scope: 'global',
    run: () => {
      toast({
        kind: 'info',
        title: 'Hitman: Blood Money Editor',
        message: 'Reads your game files through a local server. Nothing in the game folder is changed.',
      });
    },
  },
];
