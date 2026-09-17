import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditor } from '../../state/store';
import { MenuBar as UiMenuBar } from '../../ui';
import { buildMenus } from './menus';

export function MenuBar() {
  const shown = useEditor(
    useShallow((s) => ({
      scene: s.scene,
      sel: s.sel,
      view: s.view,
      tab: s.tab,
      undoStack: s.undoStack,
      redoStack: s.redoStack,
      loadingScene: s.loadingScene,
      gameRoot: s.config?.gameRoot ?? null,
    })),
  );
  // Rebuilt whenever something a menu shows changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const menus = useMemo(() => buildMenus(useEditor.getState()), [shown]);
  const sceneId = shown.scene?.id ?? shown.loadingScene;

  return (
    <UiMenuBar label="Main menu" menus={menus} className="app-menubar">
      <div className="app-menubar-context" title={shown.gameRoot ?? undefined}>
        {sceneId ?? (shown.gameRoot ? 'No scene open' : 'No game chosen')}
      </div>
    </UiMenuBar>
  );
}
