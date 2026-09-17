import type { Draft } from 'immer';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Command } from '../commands/Command';
import { buildMockScene } from '../dev/mockScene';
import type { SceneObject } from '../scene/types';

export const VIEW_FLAG_TITLES = {
  W: 'Wireframe',
  P: 'Points',
  Li: 'Lighting',
  Tx: 'Textures',
  F: 'Fog',
  K: 'Collision',
  T: 'Top',
  B: 'Bottom',
  L: 'Left',
  R: 'Right',
  G: 'Grid',
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

export const DEFAULT_CAMERA: CameraState = { yaw: 0.72, pitch: 0.34, dist: 52, tx: 0, ty: 5, tz: 0 };

export type SelMode = 'Geom' | 'Group' | 'World';
export type CoordSys = 'Local' | 'Global';
export type Pivot = 'Center' | 'Position' | 'Average';
export type GizmoMode = 'move' | 'rotate' | 'scale';
export type GizmoKind = 'Lights' | 'Sound' | 'Paths' | 'None';

export interface EditorState {
  scenePath: string;
  objects: SceneObject[];
  sel: string[];
  /** Outliner groups the user collapsed. UI state, not part of undo. */
  collapsed: Record<string, boolean>;
  cam: CameraState;
  view: Record<ViewFlag, boolean>;
  selMode: SelMode;
  coord: CoordSys;
  pivot: Pivot;
  gizmoMode: GizmoMode;
  sorting: 'Alpha' | 'None';
  snap: boolean;
  snapAngle: string;
  snapX: string;
  snapY: string;
  snapZ: string;
  gizmoKind: GizmoKind;
  searchOpen: boolean;
  search: string;
  menuOpen: string | null;
  statusMsg: string;
  undoStack: Command[];
  redoStack: Command[];
  dirty: boolean;
}

export interface EditorStore extends EditorState {
  /** Change UI state. Not recorded for undo. */
  update: (recipe: (s: Draft<EditorState>) => void) => void;
  status: (msg: string) => void;
  /** Apply an edit and record it for undo. */
  run: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;
}

export function initialEditorState(): EditorState {
  const mock = buildMockScene();
  return {
    scenePath: 'mock scene (no game loaded)',
    objects: mock.objects,
    sel: ['chand'],
    collapsed: mock.collapsed,
    cam: { ...DEFAULT_CAMERA },
    view: { W: false, P: false, Li: true, Tx: true, F: true, K: false, T: false, B: false, L: false, R: false, G: true },
    selMode: 'Geom',
    coord: 'Local',
    pivot: 'Average',
    gizmoMode: 'move',
    sorting: 'None',
    snap: false,
    snapAngle: '45',
    snapX: '100',
    snapY: '100',
    snapZ: '100',
    gizmoKind: 'Lights',
    searchOpen: false,
    search: '',
    menuOpen: null,
    statusMsg: 'Ready',
    undoStack: [],
    redoStack: [],
    dirty: false,
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

    run: (cmd) =>
      set((s) => {
        cmd.apply(s);
        s.undoStack.push(cmd);
        s.redoStack = [];
        s.dirty = true;
        s.statusMsg = cmd.label;
      }),

    undo: () => {
      const cmd = get().undoStack.at(-1);
      if (!cmd) return get().status('Nothing to undo');
      set((s) => {
        cmd.revert(s);
        s.undoStack.pop();
        s.redoStack.push(cmd);
        s.dirty = true;
        s.statusMsg = `Undo: ${cmd.label}`;
      });
    },

    redo: () => {
      const cmd = get().redoStack.at(-1);
      if (!cmd) return get().status('Nothing to redo');
      set((s) => {
        cmd.apply(s);
        s.redoStack.pop();
        s.undoStack.push(cmd);
        s.dirty = true;
        s.statusMsg = `Redo: ${cmd.label}`;
      });
    },
  })),
);
