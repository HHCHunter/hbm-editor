import { useCallback, useRef } from 'react';

const RESET_MS = 600;

/**
 * Jump to an item by typing the start of its label. Returns a handler for printable keys that
 * gives the matching index, searching forward from `from`, or -1.
 */
export function useTypeahead(labels: () => readonly string[]): (key: string, from: number) => number {
  const buffer = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  return useCallback(
    (key: string, from: number) => {
      if (key.length !== 1 || key === ' ') return -1;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => (buffer.current = ''), RESET_MS);
      const repeated = buffer.current.length === 1 && buffer.current === key.toLowerCase();
      buffer.current = repeated ? buffer.current : buffer.current + key.toLowerCase();
      const list = labels();
      // Typing one letter again moves on to the next item that starts with it.
      const start = buffer.current.length === 1 ? from + 1 : from;
      for (let i = 0; i < list.length; i++) {
        const at = (start + i) % list.length;
        if (list[at]!.toLowerCase().startsWith(buffer.current)) return at;
      }
      return -1;
    },
    [labels],
  );
}
