import { DEFAULT_KEYMAP, type ActionId } from '../../commands/defaultKeymap';

export interface MenuItem {
  label: string;
  shortcut: string;
}

const item = (label: string, action?: ActionId): MenuItem => ({ label, shortcut: action ? DEFAULT_KEYMAP[action] : '' });

/** Editor2's menu bar, cut down to what the viewer can do. */
export const MENUS: Record<string, MenuItem[]> = {
  File: [item('Open Scene…', 'file.openScene'), item('Choose Game…'), item('Exit')],
  Edit: [item('Undo', 'edit.undo'), item('Redo', 'edit.redo'), item('Hide Selection', 'edit.hide'), item('Freeze Selection')],
  View: [
    item('Wireframe', 'view.wireframe'),
    item('Lighting'),
    item('Fog'),
    item('Grid', 'view.grid'),
    item('Frame All', 'view.frameAll'),
    item('Frame Selected', 'view.frameSelected'),
  ],
  Window: [
    item('Scene View', 'window.scene'),
    item('Texture Browser', 'window.textures'),
    item('Localisation Browser', 'window.localisation'),
    item('Script Browser', 'window.scripts'),
    item('Animation Browser', 'window.animations'),
  ],
  Help: [item('About')],
};
