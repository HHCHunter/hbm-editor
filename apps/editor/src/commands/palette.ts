import { useEditor } from '../state/store';

let seed = '';

/** Open the command palette, optionally already in a mode: "@" finds scene objects. */
export function openPalette(prefix: string): void {
  seed = prefix;
  useEditor.getState().update((s) => {
    s.dialog = 'palette';
  });
}

/** The text the palette opens with; read once when it mounts. */
export function takePaletteSeed(): string {
  const text = seed;
  seed = '';
  return text;
}
