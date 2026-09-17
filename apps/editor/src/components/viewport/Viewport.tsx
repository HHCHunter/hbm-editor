import { useEffect, useRef } from 'react';
import { pickFromViewport, setCamera } from '../../state/actions';
import { useEditor } from '../../state/store';
import { SceneRenderer } from '../../viewport/SceneRenderer';
import { ViewFlagBar } from './ViewFlagBar';

function setMeshProgress(loaded: number, total: number) {
  useEditor.getState().update((s) => {
    s.meshProgress = { loaded, total };
  });
}

export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const loadingScene = useEditor((s) => s.loadingScene);
  const hasScene = useEditor((s) => !!s.scene);
  const progress = useEditor((s) => s.meshProgress);

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
      onError: (message) => useEditor.getState().status(message),
    });
    renderer.update(useEditor.getState());
    const unsubscribe = useEditor.subscribe((state) => renderer.update(state));
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
            {loadingScene
              ? `Opening ${loadingScene}…`
              : `Loading models ${progress!.loaded} / ${progress!.total}`}
          </div>
        )}
        {!hasScene && !loadingScene && <div className="viewport-empty">No scene open · File › Open Scene…</div>}
        <div className="hud" ref={statsRef} />
      </div>
    </div>
  );
}
