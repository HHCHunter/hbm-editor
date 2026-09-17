import type { Draft } from 'immer';
import type { EditorState } from '../state/store';

/** One undoable edit. `revert` must exactly undo what `apply` did. */
export interface Command {
  readonly label: string;
  apply(state: Draft<EditorState>): void;
  revert(state: Draft<EditorState>): void;
}
