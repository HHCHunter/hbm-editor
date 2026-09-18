import { castDraft } from 'immer';
import type { SurfaceDTO } from '@hbm/protocol';
import { connect } from '../api/client';
import { getConfig, getGraph, getSurfaces, getTransforms } from '../api/endpoints';
import { childIndex, meshNodeIndices, positionBounds } from '../scene/sceneModel';
import { frame } from '../viewport/camera';
import { useRecentScenes } from './recentScenes';
import { DEFAULT_CAMERA, useEditor, type LoadedScene } from './store';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function openScene(id: string): Promise<void> {
  const { update } = useEditor.getState();
  update((s) => {
    s.loadingScene = id;
    s.dialog = null;
    s.statusMsg = `Opening ${id}…`;
  });

  try {
    const [graph, transforms, surfaceList] = await Promise.all([getGraph(id), getTransforms(id), getSurfaces(id)]);
    const surfaces: Record<number, SurfaceDTO> = {};
    for (const s of surfaceList) surfaces[s.slot] = s;
    const scene: LoadedScene = {
      id,
      graph,
      transforms,
      surfaces,
      roots: Object.fromEntries(graph.roots.map((r) => [r.root, r])),
      children: childIndex(graph),
    };
    const bounds = positionBounds(transforms, meshNodeIndices(graph));

    // A newer request may have replaced this one while it loaded.
    if (useEditor.getState().loadingScene !== id) return;
    update((s) => {
      s.scene = castDraft(scene);
      s.loadingScene = null;
      s.meshProgress = null;
      s.sel = [];
      s.hidden = {};
      s.frozen = {};
      s.expanded = {};
      s.materialSlot = null;
      s.textureId = null;
      s.undoStack = [];
      s.redoStack = [];
      s.tab = 'scene';
      s.cam = bounds ? frame(DEFAULT_CAMERA, bounds) : { ...DEFAULT_CAMERA };
      s.statusMsg = `Opened ${id}: ${graph.nodes.length} objects, ${graph.roots.length} models`;
    });
    useRecentScenes.getState().remember(id);
    const url = new URL(window.location.href);
    url.searchParams.set('scene', id);
    window.history.replaceState(null, '', url);
  } catch (err) {
    update((s) => {
      if (s.loadingScene === id) s.loadingScene = null;
      s.statusMsg = `Couldn't open ${id}: ${message(err)}`;
    });
  }
}

/** Connect, then open the scene named in the URL or the last one used, or ask for the game. */
export async function startUp(): Promise<void> {
  const { update } = useEditor.getState();
  update((s) => {
    s.server = 'connecting';
    s.statusMsg = 'Connecting to the local server…';
  });
  try {
    await connect();
    const config = await getConfig();
    update((s) => {
      s.server = 'ready';
      s.config = config;
      s.statusMsg = config.gameRoot ? `Ready · ${config.gameRoot}` : 'Choose your Hitman: Blood Money install to begin.';
      if (!config.gameRoot) s.dialog = 'gamePicker';
    });
    if (!config.gameRoot) return;

    const wanted = new URLSearchParams(window.location.search).get('scene') ?? useRecentScenes.getState().ids[0] ?? null;
    if (wanted) await openScene(wanted);
    if (!useEditor.getState().scene) update((s) => void (s.dialog = 'sceneOpen'));
  } catch (err) {
    update((s) => {
      s.server = 'unreachable';
      s.statusMsg = `Local server not reachable (${message(err)}). Start the editor with start.bat.`;
    });
  }
}
