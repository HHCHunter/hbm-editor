import { useShallow } from 'zustand/react/shallow';
import { useEditor, type EditorStore } from '../state/store';
import { toast } from '../ui';
import type { CommandContext, EditorCommand } from './types';

const byId = new Map<string, EditorCommand>();

export function registerCommands(commands: readonly EditorCommand[]): void {
  for (const command of commands) {
    if (byId.has(command.id)) throw new Error(`Command ${command.id} is registered twice`);
    byId.set(command.id, command);
  }
}

export function getCommand(id: string): EditorCommand | undefined {
  return byId.get(id);
}

export function allCommands(): EditorCommand[] {
  return [...byId.values()];
}

export const contextFor = (state: EditorStore): CommandContext => ({ state });
export const currentContext = (): CommandContext => contextFor(useEditor.getState());

export function disabledReason(command: EditorCommand, ctx: CommandContext = currentContext()): string | null {
  return command.disabledReason?.(ctx) ?? null;
}

export function commandLabel(command: EditorCommand, ctx: CommandContext = currentContext()): string {
  return command.label?.(ctx) ?? command.title;
}

// ---------------------------------------------------------------- recent commands

const RECENT_KEY = 'hbm-editor:recent-commands';
const RECENT_MAX = 8;

function loadRecent(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

let recent: string[] | null = null;

/** Command ids, most recently run first. */
export function recentCommands(): readonly string[] {
  recent ??= loadRecent();
  return recent;
}

function remember(id: string): void {
  recent = [id, ...recentCommands().filter((r) => r !== id)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    // Storage can be unavailable; the list just won't survive a reload.
  }
}

// ---------------------------------------------------------------- running

/**
 * Run a command if it can run now. When it can't, the status bar says why; when it fails, the
 * error is shown rather than lost. Returns whether it ran.
 */
export function executeCommand(id: string): boolean {
  const command = byId.get(id);
  if (!command) {
    console.warn(`No command ${id}`);
    return false;
  }
  const ctx = currentContext();
  const reason = disabledReason(command, ctx);
  if (reason) {
    ctx.state.status(`${command.title}: ${reason}`);
    return false;
  }
  remember(id);
  const fail = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    useEditor.getState().status(`${command.title} failed: ${message}`);
    toast({ kind: 'error', title: `${command.title} failed`, message });
  };
  try {
    const result = command.run(ctx);
    if (result instanceof Promise) result.catch(fail);
  } catch (err) {
    fail(err);
  }
  return true;
}

export interface CommandState {
  label: string;
  disabledReason: string | null;
  checked: boolean | undefined;
}

/** A command's label, enabled and checked state, kept current as the editor changes. */
export function useCommandState(id: string): CommandState {
  return useEditor(
    useShallow((state) => {
      const command = byId.get(id);
      if (!command) return { label: id, disabledReason: 'Unknown command', checked: undefined };
      const ctx = contextFor(state);
      return { label: commandLabel(command, ctx), disabledReason: disabledReason(command, ctx), checked: command.checked?.(ctx) };
    }),
  );
}
