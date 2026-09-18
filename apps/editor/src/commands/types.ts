import type { LucideIcon } from 'lucide-react';
import type { EditorStore } from '../state/store';

export type Category = 'File' | 'Edit' | 'Selection' | 'View' | 'Camera' | 'Outliner' | 'Window' | 'Help';

/**
 * Where a command's keyboard shortcut works. A key bound in a narrower scope wins over the same
 * key in a wider one.
 *
 * - global: anywhere, even with nothing open.
 * - workspace: anywhere outside dialogs.
 * - sceneView: only while the 3D scene is showing, so keys never change a view you can't see.
 */
export type Scope = 'global' | 'workspace' | 'sceneView';

export interface CommandContext {
  state: EditorStore;
}

/**
 * A verb the user can invoke from the menus, toolbars, keyboard or command palette. One
 * definition drives all of them, so a command reads, behaves and is enabled the same everywhere.
 */
export interface EditorCommand {
  /** "category.name", stable: keybinding overrides are saved against it. */
  id: string;
  /** What it does, in a few words; shown in menus, tooltips and the palette. */
  title: string;
  category: Category;
  /** One sentence for tooltips and the palette. */
  description?: string;
  icon?: LucideIcon;
  /** Extra words the palette matches, e.g. "zoom" for Frame. */
  keywords?: readonly string[];
  /** A title with context, e.g. "Undo Hide 3 objects". */
  label?(ctx: CommandContext): string;
  /** Why it can't run right now, or null when it can. */
  disabledReason?(ctx: CommandContext): string | null;
  /** Makes it an on/off command, shown with a check mark or as a pressed toggle. */
  checked?(ctx: CommandContext): boolean;
  /** Drawn as one choice of several (a radio item) rather than an on/off check. */
  radio?: boolean;
  scope?: Scope;
  run(ctx: CommandContext): void | Promise<void>;
}
