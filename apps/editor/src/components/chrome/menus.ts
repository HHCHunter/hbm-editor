export interface MenuItem {
  label: string;
  shortcut: string;
}

/** Editor2's menus, as the design artboard lists them. */
export const MENUS: Record<string, MenuItem[]> = {
  File: [
    { label: 'New Scene', shortcut: 'Ctrl+N' },
    { label: 'Open Scene…', shortcut: 'Ctrl+O' },
    { label: 'Save Scene', shortcut: 'Ctrl+S' },
    { label: 'Export Locations…', shortcut: '' },
    { label: 'Exit', shortcut: '' },
  ],
  Edit: [
    { label: 'Undo', shortcut: 'Ctrl+Z' },
    { label: 'Redo', shortcut: 'Ctrl+Y' },
    { label: 'Delete Selection', shortcut: 'Del' },
    { label: 'Duplicate', shortcut: 'Ctrl+D' },
  ],
  View: [
    { label: 'Wireframe', shortcut: 'W' },
    { label: 'Lighting', shortcut: 'L' },
    { label: 'Fog', shortcut: 'F' },
    { label: 'Grid', shortcut: 'G' },
    { label: 'Zoom Extents', shortcut: 'Z' },
  ],
  Scene: [
    { label: 'Add ZGEOM', shortcut: '' },
    { label: 'Add ZLIGHT', shortcut: '' },
    { label: 'Group Selection', shortcut: 'Ctrl+G' },
    { label: 'Rebuild PRIM', shortcut: '' },
  ],
  Tools: [
    { label: 'Pathfinder Bake', shortcut: '' },
    { label: 'Light Baker', shortcut: '' },
    { label: 'Collision Check', shortcut: '' },
  ],
  Connections: [
    { label: 'Attach to Game', shortcut: 'F5' },
    { label: 'Live Sync', shortcut: '' },
    { label: 'Disconnect', shortcut: '' },
  ],
  Help: [
    { label: 'Editor2 Manual', shortcut: 'F1' },
    { label: 'About', shortcut: '' },
  ],
};
