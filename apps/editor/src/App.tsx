import { useEffect } from 'react';
import { connect } from './api/client';
import { MenuBar } from './components/chrome/MenuBar';
import { StatusBar } from './components/chrome/StatusBar';
import { TitleBar } from './components/chrome/TitleBar';
import { SceneTree } from './components/outliner/SceneTree';
import { HeaderFields } from './components/properties/HeaderFields';
import { PropertyGrid } from './components/properties/PropertyGrid';
import { ToolRail } from './components/rail/ToolRail';
import { Viewport } from './components/viewport/Viewport';
import { useShortcuts } from './hooks/useShortcuts';
import { setStatus } from './state/actions';

export function App() {
  useShortcuts();

  useEffect(() => {
    let cancelled = false;
    connect()
      .then((session) => {
        if (!cancelled) setStatus(`Ready · local server v${session.version} · mock scene`);
      })
      .catch(() => {
        if (!cancelled) setStatus('Local server not reachable. Start the editor with start.bat.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app">
      <TitleBar />
      <MenuBar />
      <div className="workspace">
        <ToolRail />
        <Viewport />
        <div className="right-col">
          <SceneTree />
          <div className="props-area">
            <HeaderFields />
            <PropertyGrid />
          </div>
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
