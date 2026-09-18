import { COMMANDS } from './defs';
import { registerCommands } from './registry';

registerCommands(COMMANDS);

export { COMMANDS };
export { executeCommand, getCommand, allCommands, useCommandState, recentCommands, commandLabel, disabledReason } from './registry';
export { DEFAULT_KEYMAP, bindingsOf, shortcutOf, useKeymap, useShortcut } from './keymap';
export { useCommandShortcuts } from './dispatcher';
export { openPalette } from './palette';
export type { EditorCommand, Category, Scope } from './types';
