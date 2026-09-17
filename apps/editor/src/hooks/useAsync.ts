import { useEffect, useState } from 'react';

export type AsyncState<T> =
  | { status: 'idle' | 'loading'; value: null; error: null }
  | { status: 'done'; value: T; error: null }
  | { status: 'error'; value: null; error: string };

/**
 * Run `load` whenever `deps` change and keep the latest result. A result from an older run is
 * dropped. Pass `null` as the loader to stay idle.
 */
export function useAsync<T>(load: ((signal: AbortSignal) => Promise<T>) | null, deps: readonly unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'idle', value: null, error: null });

  useEffect(() => {
    if (!load) {
      setState({ status: 'idle', value: null, error: null });
      return;
    }
    const abort = new AbortController();
    setState({ status: 'loading', value: null, error: null });
    load(abort.signal).then(
      (value) => !abort.signal.aborted && setState({ status: 'done', value, error: null }),
      (err: unknown) =>
        !abort.signal.aborted &&
        setState({ status: 'error', value: null, error: err instanceof Error ? err.message : String(err) }),
    );
    return () => abort.abort();
    // The caller lists what the loader depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
