import type { Draft } from 'immer';
import type { EditorState } from '../state/store';

/**
 * One undoable change to the document. `revert` must exactly undo what `apply` did. Commands (the
 * verbs in menus and shortcuts) aren't undoable themselves; they record Edits.
 */
export interface Edit {
  readonly label: string;
  apply(state: Draft<EditorState>): void;
  revert(state: Draft<EditorState>): void;
  /**
   * Fold the next edit into this one, so a run of small changes (dragging a value, typing a name)
   * is one undo step. Return null to keep them separate.
   */
  merge?(next: Edit): Edit | null;
}
