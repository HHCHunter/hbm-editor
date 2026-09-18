import { useEffect } from 'react';
import { useCommandShortcuts } from './commands';
import { CommandPalette } from './commands/CommandPalette';
import { KeybindingsDialog } from './commands/KeybindingsDialog';
import { MenuBar } from './components/chrome/MenuBar';
import { StatusBar } from './components/chrome/StatusBar';
import { TAB_PREFIX, TabStrip } from './components/chrome/TabStrip';
import { SceneTree } from './components/outliner/SceneTree';
import { HeaderFields } from './components/properties/HeaderFields';
import { PropertyGrid } from './components/properties/PropertyGrid';
import { ToolRail } from './components/rail/ToolRail';
import { Viewport } from './components/viewport/Viewport';
import { AnimationBrowser } from './panels/AnimationBrowser';
import { GamePickerDialog } from './panels/GamePickerDialog';
import { LocalisationBrowser } from './panels/LocalisationBrowser';
import { MaterialBrowser } from './panels/materials/MaterialBrowser';
import { SceneOpenDialog } from './panels/SceneOpenDialog';
import { ScriptBrowser } from './panels/ScriptBrowser';
import { TextureBrowser } from './panels/TextureBrowser';
import { SettingsDialog } from './settings/SettingsDialog';
import { startUp } from './state/sceneLoader';
import { useEditor } from './state/store';
import { TabPanel, ToastRegion } from './ui';

const APP_TITLE = 'Hitman: Blood Money Editor';

export function App() {
  useCommandShortcuts();
  const tab = useEditor((s) => s.tab);
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
      <div className="workspace">
        <ToolRail />
        <main className="centre" aria-label="Workspace">
          <TabStrip />
          {/* The viewport stays mounted so switching tabs keeps its models. */}
          <TabPanel idPrefix={TAB_PREFIX} id="scene" className="centre-page" hidden={tab !== 'scene'}>
            <Viewport />
          </TabPanel>
          {tab !== 'scene' && (
            <TabPanel idPrefix={TAB_PREFIX} id={tab} className="centre-page">
              {tab === 'textures' && <TextureBrowser />}
              {tab === 'materials' && <MaterialBrowser />}
              {tab === 'localisation' && <LocalisationBrowser />}
              {tab === 'scripts' && <ScriptBrowser />}
              {tab === 'animations' && <AnimationBrowser />}
            </TabPanel>
          )}
        </main>
        <aside className="right-col" aria-label="Scene objects and properties">
          <SceneTree />
          <div className="props-area">
            <HeaderFields />
            <PropertyGrid />
          </div>
        </aside>
      </div>
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
