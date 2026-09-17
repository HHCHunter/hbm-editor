import { useEffect, useRef } from 'react';
import { pickFromViewport, setCamera } from '../../state/actions';
import { startUp } from '../../state/sceneLoader';
import { useEditor, type EditorState } from '../../state/store';
import { SceneRenderer } from '../../viewport/SceneRenderer';
import { PushButton } from '../chrome/Dialog';
import { ViewFlagBar } from './ViewFlagBar';

/** The state the renderer draws from. Other changes, like status text or typing in a search, don't redraw. */
const DRAWN: (keyof EditorState)[] = ['scene', 'cam', 'view', 'filters', 'sel', 'hidden', 'frozen'];

function setMeshProgress(loaded: number, total: number, failed: number) {
  useEditor.getState().update((s) => {
    s.meshProgress = { loaded, total, failed };
  });
}

export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const loadingScene = useEditor((s) => s.loadingScene);
  const hasScene = useEditor((s) => !!s.scene);
  const progress = useEditor((s) => s.meshProgress);
  const server = useEditor((s) => s.server);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new SceneRenderer(host, {
      onCamera: setCamera,
      onPick: pickFromViewport,
      onMeshProgress: setMeshProgress,
      onStats: (text) => {
        if (statsRef.current) statsRef.current.textContent = text;
      },
      onMessage: (message) => useEditor.getState().status(message),
    });
    renderer.update(useEditor.getState());
    const unsubscribe = useEditor.subscribe((state, prev) => {
      if (DRAWN.some((key) => state[key] !== prev[key])) renderer.update(state);
    });
    return () => {
      unsubscribe();
      renderer.dispose();
    };
  }, []);

  const loadingModels = progress && progress.loaded < progress.total;

  return (
    <div className="viewport-frame bevel-in">
      <ViewFlagBar />
      <div className="viewport-canvas" ref={hostRef} data-testid="viewport">
        {(loadingScene || loadingModels) && (
          <div className="viewport-banner">
            {loadingScene ? `Opening ${loadingScene}…` : `Loading models ${progress!.loaded} / ${progress!.total}`}
          </div>
        )}
        {!loadingScene && !loadingModels && !!progress?.failed && (
          <div className="viewport-banner warning" role="status">
            {progress.failed} of {progress.total} models couldn't be read
          </div>
        )}
        {!hasScene && !loadingScene && server === 'unreachable' && (
          <div className="viewport-empty interactive" role="alert">
            <div>The editor's local server isn't running. Start the editor with start.bat, then try again.</div>
            <PushButton label="Try Again" onClick={() => void startUp()} />
          </div>
        )}
        {!hasScene && !loadingScene && server !== 'unreachable' && (
          <div className="viewport-empty">No scene open · File › Open Scene… (Ctrl+O)</div>
        )}
        <div className="hud" ref={statsRef} />
      </div>
    </div>
  );
}
