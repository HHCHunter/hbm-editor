import { Box, FolderTree, MoreHorizontal, Search, Sun } from 'lucide-react';
import { CommandButton } from '../../commands/CommandButton';
import { CommandMenuButton } from '../../commands/CommandMenuButton';
import { executeCommand, openPalette, useCommandState, useShortcut } from '../../commands';
import { useKeymap } from '../../commands/keymap';
import { menuEntries } from '../../commands/menus';
import { useRecentScenes } from '../../state/recentScenes';
import { openScene } from '../../state/sceneLoader';
import { useEditor } from '../../state/store';
import { Kbd, Segmented, SplitButton, Toolbar, ToolbarSeparator, type MenuEntry } from '../../ui';
import './toolbar.css';

const VIEW_MODES = ['view.modeLit', 'view.modeUnlit', 'view.modeWireframe'];

function recentScenesMenu(): MenuEntry[] {
  const current = useEditor.getState().scene?.id;
  const ids = useRecentScenes.getState().ids;
  const scenes: MenuEntry[] = ids.map((id) => ({
    id: `recent.${id}`,
    label: id.includes('/') ? `${id.split('/').pop()}  (${id.split('/')[0]})` : id,
    checked: id === current ? true : undefined,
    radio: true,
    onSelect: () => void openScene(id),
  }));
  return [
    ...(scenes.length ? scenes : [{ id: 'recent.none', label: 'No recent scenes', disabled: true, onSelect: () => {} }]),
    { kind: 'separator', id: 'recent.sep' },
    { id: 'recent.open', label: 'Open Scene…', onSelect: () => executeCommand('file.openScene') },
  ];
}

/**
 * The main toolbar: the actions people click constantly, with the command search in the middle.
 * Everything here is also in a menu, the command palette and on a key. On a narrow window the
 * labels go first, then the view group moves into a More menu.
 */
export function MainToolbar() {
  const pickGroups = useCommandState('selection.pickGroups');
  const paletteKey = useShortcut('help.commandPalette');
  const lit = useCommandState('view.modeLit');
  const unlit = useCommandState('view.modeUnlit');
  const wireframe = useCommandState('view.modeWireframe');
  const mode = [lit, unlit, wireframe].find((m) => m.checked) ?? lit;

  return (
    <Toolbar label="Main toolbar" className="main-toolbar">
      <div className="main-toolbar-side">
        <SplitButton main={<CommandButton command="file.openScene">Open</CommandButton>} menuLabel="Recent scenes" items={recentScenesMenu} />
        <ToolbarSeparator />
        <CommandButton command="edit.undo">Undo</CommandButton>
        <CommandButton command="edit.redo">Redo</CommandButton>
        <ToolbarSeparator />
        <Segmented
          label="Viewport clicks select"
          value={pickGroups.checked ? 'group' : 'object'}
          disabledReason={pickGroups.disabledReason}
          options={[
            { value: 'object', label: 'Object', icon: Box, description: 'Viewport clicks select the object under the pointer' },
            { value: 'group', label: 'Group', icon: FolderTree, description: 'Viewport clicks select the outermost group around it' },
          ]}
          onChange={(value) => executeCommand(value === 'group' ? 'selection.pickGroups' : 'selection.pickObjects')}
        />
        <SplitButton
          main={<CommandButton command="edit.hide">Hide</CommandButton>}
          menuLabel="More visibility options"
          items={() => menuEntries(['edit.unhideAll', 'edit.isolate'], useEditor.getState(), useKeymap.getState().overrides, 'hide')}
        />
        <SplitButton
          main={<CommandButton command="edit.freeze">Freeze</CommandButton>}
          menuLabel="More freeze options"
          items={() => menuEntries(['edit.unfreezeAll'], useEditor.getState(), useKeymap.getState().overrides, 'freeze')}
        />
        {/* Move, Rotate and Scale join here when editing arrives. */}
      </div>

      <button type="button" className="main-search" onClick={() => openPalette('')} aria-keyshortcuts={paletteKey}>
        <Search className="ui-icon" aria-hidden="true" />
        <span className="main-search-text">Search commands and @objects</span>
        {paletteKey && <Kbd chord={paletteKey} />}
      </button>

      <div className="main-toolbar-side main-toolbar-view">
        <CommandButton command="camera.frameAll">Frame All</CommandButton>
        <CommandButton command="camera.frameSelected">Frame Selected</CommandButton>
        <CommandMenuButton label="View mode" layout={VIEW_MODES} icon={Sun} description={mode.disabledReason ?? 'Lit, unlit or wireframe'}>
          {mode.label}
        </CommandMenuButton>
      </div>
      <div className="main-toolbar-more">
        <CommandMenuButton label="More" icon={MoreHorizontal} layout={['camera.frameAll', 'camera.frameSelected', '-', ...VIEW_MODES]} />
      </div>
    </Toolbar>
  );
}
