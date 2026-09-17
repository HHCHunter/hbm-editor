import { useEffect, useRef } from 'react';
import { isVisible, sceneIndex } from '../../scene/sceneIndex';
import { pickFromViewport, setCamera } from '../../state/actions';
import { useEditor, type EditorState } from '../../state/store';
import { SceneRenderer } from '../../viewport/SceneRenderer';
import { ViewFlagBar } from './ViewFlagBar';

function hudText(s: EditorState): string {
  const index = sceneIndex(s.objects);
  const prims = s.objects.filter((o) => o.size && isVisible(index, o)).length;
  const mode = s.view.W ? 'wireframe' : s.view.Li ? 'lit' : 'flat';
  return `${mode} · ${prims} prims · drag orbit · shift+drag pan · wheel zoom`;
}

export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const hud = useEditor(hudText);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new SceneRenderer(host, { onCamera: setCamera, onPick: pickFromViewport });
    renderer.update(useEditor.getState());
    const unsubscribe = useEditor.subscribe((state) => renderer.update(state));
    return () => {
      unsubscribe();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="viewport-frame bevel-in">
      <ViewFlagBar />
      <div className="viewport-canvas" ref={hostRef}>
        <div className="hud">{hud}</div>
      </div>
    </div>
  );
}
