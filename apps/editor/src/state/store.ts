import type { Draft } from 'immer';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ConfigDTO, HiddenReasonDTO, MeshRootDTO, SceneGraphDTO, SurfaceDTO } from '@hbm/protocol';
import type { Edit } from '../commands/Edit';

export const VIEW_FLAG_TITLES = {
  W: 'Wireframe',
  P: 'Markers',
  Li: 'Lighting',
  Tx: 'Textures',
  F: 'Fog',
  G: 'Grid',
  Bn: 'Skeletons',
} as const;
export type ViewFlag = keyof typeof VIEW_FLAG_TITLES;
export const VIEW_FLAGS = Object.keys(VIEW_FLAG_TITLES) as ViewFlag[];

/** An orbit camera around a target, in engine coordinates. */
export interface CameraState {
  yaw: number;
  pitch: number;
  dist: number;
  tx: number;
  ty: number;
  tz: number;
}

export const DEFAULT_CAMERA: CameraState = { yaw: 0.72, pitch: 0.34, dist: 2000, tx: 0, ty: 0, tz: 0 };

export interface LoadedScene {
  id: string;
  graph: SceneGraphDTO;
  /** 12 floats per node: row-major 3×3, then the translation. */
  transforms: Float32Array;
  surfaces: Record<number, SurfaceDTO>;
  roots: Record<number, MeshRootDTO>;
  /** Child node indices by parent index + 1; slot 0 holds the scene root's children. */
  children: number[][];
}

export interface MeshProgress {
  /** Model roots done, read or not. */
  loaded: number;
  total: number;
  /** Roots whose models couldn't be read. */
  failed: number;
}

export type Tab = 'scene' | 'textures' | 'materials' | 'localisation' | 'scripts' | 'animations';
export type DialogName = 'gamePicker' | 'sceneOpen' | 'settings' | 'palette' | 'keybindings';
export type SelMode = 'Geom' | 'Group';

export interface ViewportFilters {
  /** The LOD level drawn; parts whose mask lacks it are skipped. */
  lod: number;
  /** Non-surface geometry shown in the viewport. */
  show: Record<HiddenReasonDTO, boolean>;
}

export interface EditorState {
  server: 'connecting' | 'ready' | 'unreachable';
  config: ConfigDTO | null;
  dialog: DialogName | null;
  tab: Tab;
  /** The material shown in the Materials tab, by slot. */
  materialSlot: number | null;
  /** The texture shown in the Textures tab, by id. */
  textureId: number | null;
  scene: LoadedScene | null;
  loadingScene: string | null;
  meshProgress: MeshProgress | null;
  sel: number[];
  /** Editor-only visibility and locking, by node index. Never written to the game. */
  hidden: Record<number, boolean>;
  frozen: Record<number, boolean>;
  /** Outliner nodes the user opened. */
  expanded: Record<number, boolean>;
  cam: CameraState;
  view: Record<ViewFlag, boolean>;
  filters: ViewportFilters;
  selMode: SelMode;
  sorting: 'Alpha' | 'None';
  search: string;
  statusMsg: string;
  undoStack: Edit[];
  redoStack: Edit[];
}

export interface EditorStore extends EditorState {
  /** Change state without recording it for undo. */
  update: (recipe: (s: Draft<EditorState>) => void) => void;
  status: (msg: string) => void;
  /** Apply an edit and record it for undo. */
  run: (edit: Edit) => void;
  undo: () => void;
  redo: () => void;
}

export function initialEditorState(): EditorState {
  return {
    server: 'connecting',
    config: null,
    dialog: null,
    tab: 'scene',
    materialSlot: null,
    textureId: null,
    scene: null,
    loadingScene: null,
    meshProgress: null,
    sel: [],
    hidden: {},
    frozen: {},
    expanded: {},
    cam: { ...DEFAULT_CAMERA },
    view: { W: false, P: false, Li: true, Tx: true, F: false, G: true, Bn: false },
    filters: { lod: 0, show: { collision: false, bounds: false, shadow: false, placeholder: false, helper: false } },
    selMode: 'Geom',
    sorting: 'None',
    search: '',
    statusMsg: 'Connecting to the local server…',
    undoStack: [],
    redoStack: [],
  };
}

export const useEditor = create<EditorStore>()(
  immer((set, get) => ({
    ...initialEditorState(),

    update: (recipe) =>
      set((s) => {
        recipe(s);
      }),

    status: (msg) =>
      set((s) => {
        s.statusMsg = msg;
      }),

    run: (edit) =>
      set((s) => {
        edit.apply(s);
        const merged = s.undoStack.at(-1)?.merge?.(edit) ?? null;
        if (merged) s.undoStack[s.undoStack.length - 1] = merged;
        else s.undoStack.push(edit);
        s.redoStack = [];
        s.statusMsg = edit.label;
      }),

    undo: () => {
      const edit = get().undoStack.at(-1);
      if (!edit) return get().status('Nothing to undo');
      set((s) => {
        edit.revert(s);
        s.undoStack.pop();
        s.redoStack.push(edit);
        s.statusMsg = `Undo: ${edit.label}`;
      });
    },

    redo: () => {
      const edit = get().redoStack.at(-1);
      if (!edit) return get().status('Nothing to redo');
      set((s) => {
        edit.apply(s);
        s.redoStack.pop();
        s.undoStack.push(edit);
        s.statusMsg = `Redo: ${edit.label}`;
      });
    },
  })),
);
