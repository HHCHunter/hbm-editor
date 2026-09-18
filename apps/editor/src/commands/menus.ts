import type { EditorStore } from '../state/store';
import type { MenuBarMenu, MenuEntry } from '../ui';
import { shortcutOf } from './keymap';
import { commandLabel, contextFor, disabledReason, executeCommand, getCommand } from './registry';

/** A menu is a list of command ids, separators ("-") and submenus. */
type Layout = (string | { submenu: string; items: Layout })[];

export const MENU_LAYOUT: { id: string; label: string; items: Layout }[] = [
  { id: 'file', label: 'File', items: ['file.openScene', 'file.chooseGame', '-', 'file.settings'] },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      'edit.undo',
      'edit.redo',
      '-',
      'edit.hide',
      'edit.unhideAll',
      'edit.freeze',
      'edit.unfreezeAll',
      '-',
      'selection.all',
      'selection.none',
      'selection.invert',
      '-',
      'selection.pickObjects',
      'selection.pickGroups',
    ],
  },
  {
    id: 'view',
    label: 'View',
    items: [
      'view.wireframe',
      'view.lighting',
      'view.textures',
      'view.fog',
      '-',
      'view.grid',
      'view.markers',
      'view.skeletons',
      {
        submenu: 'Hidden Geometry',
        items: ['view.show.collision', 'view.show.bounds', 'view.show.shadow', 'view.show.helper', 'view.show.placeholder'],
      },
      '-',
      'camera.frameSelected',
      'camera.frameAll',
      {
        submenu: 'Camera Angle',
        items: ['camera.resetAngle', '-', 'camera.viewTop', 'camera.viewBottom', 'camera.viewLeft', 'camera.viewRight'],
      },
    ],
  },
  { id: 'window', label: 'Window', items: ['window.scene', 'window.textures', 'window.localisation', 'window.scripts', 'window.animations'] },
  { id: 'help', label: 'Help', items: ['help.commandPalette', 'help.findObject', 'help.keyboardShortcuts', '-', 'help.about'] },
];

function entries(layout: Layout, state: EditorStore, overrides: Record<string, string[]>, path: string): MenuEntry[] {
  const ctx = contextFor(state);
  return layout.map((item, i): MenuEntry => {
    if (item === '-') return { kind: 'separator', id: `${path}.sep${i}` };
    if (typeof item !== 'string') {
      return { kind: 'submenu', id: `${path}.${item.submenu}`, label: item.submenu, items: entries(item.items, state, overrides, `${path}.${i}`) };
    }
    const command = getCommand(item);
    if (!command) throw new Error(`Menu names unknown command ${item}`);
    const reason = disabledReason(command, ctx);
    return {
      id: command.id,
      label: commandLabel(command, ctx),
      shortcut: shortcutOf(command.id, overrides),
      disabled: !!reason,
      disabledReason: reason ?? undefined,
      checked: command.checked?.(ctx),
      radio: command.radio,
      onSelect: () => executeCommand(command.id),
    };
  });
}

/** The menu bar, with labels, shortcuts and enabled and checked states from the commands. */
export function buildMenus(state: EditorStore, overrides: Record<string, string[]>): MenuBarMenu[] {
  return MENU_LAYOUT.map((menu) => ({ id: menu.id, label: menu.label, items: entries(menu.items, state, overrides, menu.id) }));
}
