import { useEffect } from 'react';
import { MenuBar } from './components/chrome/MenuBar';
import { StatusBar } from './components/chrome/StatusBar';
import { TabStrip } from './components/chrome/TabStrip';
import { SceneTree } from './components/outliner/SceneTree';
import { HeaderFields } from './components/properties/HeaderFields';
import { PropertyGrid } from './components/properties/PropertyGrid';
import { ToolRail } from './components/rail/ToolRail';
import { Viewport } from './components/viewport/Viewport';
import { useShortcuts } from './hooks/useShortcuts';
import { AnimationBrowser } from './panels/AnimationBrowser';
import { GamePickerDialog } from './panels/GamePickerDialog';
import { LocalisationBrowser } from './panels/LocalisationBrowser';
import { SceneOpenDialog } from './panels/SceneOpenDialog';
import { ScriptBrowser } from './panels/ScriptBrowser';
import { TextureBrowser } from './panels/TextureBrowser';
import { startUp } from './state/sceneLoader';
import { useEditor } from './state/store';

const APP_TITLE = 'Hitman: Blood Money Editor';

export function App() {
  useShortcuts();
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
        <div className="centre">
          <TabStrip />
          {/* The viewport stays mounted so switching tabs keeps its models. */}
          <div className="centre-page" hidden={tab !== 'scene'}>
            <Viewport />
          </div>
          {tab === 'textures' && <TextureBrowser />}
          {tab === 'localisation' && <LocalisationBrowser />}
          {tab === 'scripts' && <ScriptBrowser />}
          {tab === 'animations' && <AnimationBrowser />}
        </div>
        <div className="right-col">
          <SceneTree />
          <div className="props-area">
            <HeaderFields />
            <PropertyGrid />
          </div>
        </div>
      </div>
      <StatusBar />
      {dialog === 'gamePicker' && <GamePickerDialog />}
      {dialog === 'sceneOpen' && <SceneOpenDialog />}
    </div>
  );
}
