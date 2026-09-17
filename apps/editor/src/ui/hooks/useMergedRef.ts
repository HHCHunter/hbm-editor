import { useCallback, type Ref } from 'react';

export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as React.MutableRefObject<T | null>).current = value;
}

/**
 * One stable callback ref that sets several refs. An inline callback ref is a new function on
 * every render, which makes React detach and re-attach the element each time; positioning
 * libraries treat that as a new anchor and render again, without end.
 */
export function useMergedRef<T>(...refs: (Ref<T> | undefined)[]): (value: T | null) => void {
  // The refs themselves are stable (useRef objects and setter functions).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((value: T | null) => refs.forEach((ref) => assignRef(ref, value)), refs);
}
