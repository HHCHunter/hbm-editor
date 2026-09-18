import { useEffect } from 'react';
import { useCommandShortcuts } from './commands';
import { CommandPalette } from './commands/CommandPalette';
import { KeybindingsDialog } from './commands/KeybindingsDialog';
import { MainToolbar } from './components/chrome/MainToolbar';
import { MenuBar } from './components/chrome/MenuBar';
import { StatusBar } from './components/chrome/StatusBar';
import { SceneTree } from './components/outliner/SceneTree';
import { HeaderFields } from './components/properties/HeaderFields';
import { PropertyGrid } from './components/properties/PropertyGrid';
import { Viewport } from './components/viewport/Viewport';
import { GamePickerDialog } from './panels/GamePickerDialog';
import { SceneOpenDialog } from './panels/SceneOpenDialog';
import { SettingsDialog } from './settings/SettingsDialog';
import { BrowserPanel } from './shell/BrowserPanel';
import { BROWSER_AREA, usePaneSize } from './shell/layoutStore';
import { startUp } from './state/sceneLoader';
import { useEditor } from './state/store';
import { SplitPane, ToastRegion } from './ui';

const APP_TITLE = 'Hitman: Blood Money Editor';

export function App() {
  useCommandShortcuts();
  const maximised = useEditor((s) => s.browserMaximised);
  const side = usePaneSize('side');
  const browsers = usePaneSize('browsers');
  const outliner = usePaneSize('outliner');
  const dialog = useEditor((s) => s.dialog);
  const sceneId = useEditor((s) => s.scene?.id ?? s.loadingScene);

  useEffect(() => {
    void startUp();
  }, []);

  useEffect(() => {
    document.title = sceneId ? `${sceneId} · ${APP_TITLE}` : APP_TITLE;
  }, [sceneId]);

  return (
    <div className="app">
      <MenuBar />
      <MainToolbar />
      {/* Unreal's arrangement: viewport in the middle, browsers under it, outliner over details on the right. */}
      <main className="workspace" aria-label="Workspace">
        <SplitPane
          label="Resize the side panels"
          direction="row"
          fixed="end"
          defaultSize="26rem"
          min={16}
          minOther={24}
          {...side}
          start={
            <SplitPane
              label="Resize the browser panel"
              direction="column"
              fixed="end"
              defaultSize="38%"
              min={7}
              minOther={10}
              {...browsers}
              // Maximised, the browsers take the viewport's place; the viewport stays mounted to keep its models.
              hide={maximised ? 'start' : undefined}
              startProps={{ className: 'viewport-area' }}
              start={<Viewport />}
              endProps={{ className: 'browser-panel', role: 'region', 'aria-label': 'Browsers', 'data-area': BROWSER_AREA }}
              end={<BrowserPanel />}
            />
          }
          endProps={{ className: 'right-col', role: 'region', 'aria-label': 'Scene objects and properties' }}
          end={
            <SplitPane
              label="Resize the outliner"
              direction="column"
              fixed="start"
              defaultSize="55%"
              min={6}
              minOther={6}
              {...outliner}
              start={<SceneTree />}
              end={
                <div className="props-area">
                  <HeaderFields />
                  <PropertyGrid />
                </div>
              }
            />
          }
        />
      </main>
      <StatusBar />
      {dialog === 'gamePicker' && <GamePickerDialog />}
      {dialog === 'sceneOpen' && <SceneOpenDialog />}
      {dialog === 'settings' && <SettingsDialog />}
      {dialog === 'keybindings' && <KeybindingsDialog />}
      {dialog === 'palette' && <CommandPalette />}
      <ToastRegion />
    </div>
  );
}
