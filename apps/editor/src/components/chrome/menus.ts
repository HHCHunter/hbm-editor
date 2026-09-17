export interface MenuItem {
  label: string;
  shortcut: string;
}

/** Editor2's menu bar, cut down to what the viewer can do. */
export const MENUS: Record<string, MenuItem[]> = {
  File: [
    { label: 'Open Scene…', shortcut: 'Ctrl+O' },
    { label: 'Choose Game…', shortcut: '' },
    { label: 'Exit', shortcut: '' },
  ],
  Edit: [
    { label: 'Undo', shortcut: 'Ctrl+Z' },
    { label: 'Redo', shortcut: 'Ctrl+Y' },
    { label: 'Hide Selection', shortcut: 'H' },
    { label: 'Freeze Selection', shortcut: '' },
  ],
  View: [
    { label: 'Wireframe', shortcut: 'W' },
    { label: 'Lighting', shortcut: 'L' },
    { label: 'Fog', shortcut: 'F' },
    { label: 'Grid', shortcut: 'G' },
    { label: 'Zoom Extents', shortcut: 'Z' },
    { label: 'Zoom Selected', shortcut: 'Shift+Z' },
  ],
  Window: [
    { label: 'Scene View', shortcut: 'Ctrl+1' },
    { label: 'Texture Browser', shortcut: 'Ctrl+2' },
    { label: 'Localisation Browser', shortcut: 'Ctrl+3' },
    { label: 'Script Browser', shortcut: 'Ctrl+4' },
    { label: 'Animation Browser', shortcut: 'Ctrl+5' },
  ],
  Help: [{ label: 'About', shortcut: '' }],
};
