import { useEffect, useState } from 'react';
import type { NodeDetailDTO } from '@hbm/protocol';
import { getNodeDetail } from '../api/endpoints';
import { useEditor } from '../state/store';

/** The server's detail for the single selected node, or null. */
export function useNodeDetail(): NodeDetailDTO | null {
  const sceneId = useEditor((s) => s.scene?.id ?? null);
  const index = useEditor((s) => (s.sel.length === 1 ? s.sel[0]! : null));
  const [detail, setDetail] = useState<NodeDetailDTO | null>(null);

  useEffect(() => {
    if (sceneId === null || index === null) {
      setDetail(null);
      return;
    }
    const abort = new AbortController();
    getNodeDetail(sceneId, index, abort.signal)
      .then(setDetail)
      .catch((err: unknown) => {
        if (!abort.signal.aborted) useEditor.getState().status(`Couldn't read node ${index}: ${String(err)}`);
      });
    return () => abort.abort();
  }, [sceneId, index]);

  return detail;
}
