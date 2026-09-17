import { useCallback, useEffect, useState } from 'react';
import type { NodeDetailDTO } from '@hbm/protocol';
import { getNodeDetail } from '../api/endpoints';
import { useEditor } from '../state/store';

export interface NodeDetailState {
  /** The server's detail for the single selected node, or null while loading or when it failed. */
  detail: NodeDetailDTO | null;
  /** Why the detail couldn't be read, or null. */
  error: string | null;
  /** Ask the server again after a failure. */
  retry: () => void;
}

export function useNodeDetail(): NodeDetailState {
  const sceneId = useEditor((s) => s.scene?.id ?? null);
  const index = useEditor((s) => (s.sel.length === 1 ? s.sel[0]! : null));
  const [detail, setDetail] = useState<NodeDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setDetail(null);
    setError(null);
    if (sceneId === null || index === null) return;
    const abort = new AbortController();
    getNodeDetail(sceneId, index, abort.signal)
      .then(setDetail)
      .catch((err: unknown) => {
        if (abort.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        useEditor.getState().status(`Couldn't read object ${index}: ${message}`);
      });
    return () => abort.abort();
  }, [sceneId, index, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { detail, error, retry };
}
